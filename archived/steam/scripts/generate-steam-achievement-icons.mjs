#!/usr/bin/env node
/**
 * 按 third-party/steam-achievements/steam-achievement-icons.json 生成 Steam 成就 256×256 JPG。
 * - 解锁：背景为根据成就 api 名哈希得到的浅色 pastel 纯色（稳定、互不相同）。
 * - 锁定：深黑底；白字 + 白图标（SVG 优先 *-white.svg；应用 PNG 压成不透明像素变白）。
 * - 解锁图标：使用 *-black.svg；尺寸在区间内自适应（相对配置再 ×1.3）。
 * - 文案：5×7 像素位图字体；解锁黑字、锁定白字。
 *
 * 用法：
 *   pnpm generate-steam-achievement-icons
 *   node scripts/generate-steam-achievement-icons.mjs [--config=...] [--only=ACH_FIRST_MD] [--app-icon=path/to.png]
 */
import { mkdirSync, existsSync, readFileSync } from 'fs'
import { dirname, join, isAbsolute, normalize } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { Resvg } from '@resvg/resvg-js'
import { GLYPH_5X7 } from './steam-achievement-pixel-glyphs.mjs'

const require = createRequire(import.meta.url)
const Jimp = require('jimp')

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DEFAULT_CONFIG = join(
  ROOT,
  'third-party/steam-achievements/steam-achievement-icons.json'
)
const OUT_DIR = join(ROOT, 'third-party/steam-achievements/achievement-icons')

/** 解锁态文字颜色（略软黑） */
const INK_UNLOCKED = { r: 28, g: 28, b: 32 }
/** 锁定态文字 / 图标前景 */
const INK_LOCKED = { r: 248, g: 248, b: 250 }

/** 相对配置的图标缩放（+30%） */
const ICON_SIZE_FACTOR = 1.3

function parseArgs() {
  const argv = process.argv.slice(2)
  const configArg = argv.find((a) => a.startsWith('--config='))
  const onlyArg = argv.find((a) => a.startsWith('--only='))
  const iconArg = argv.find((a) => a.startsWith('--app-icon='))
  return {
    configPath: configArg
      ? join(ROOT, normalize(configArg.slice('--config='.length).trim()))
      : DEFAULT_CONFIG,
    only: onlyArg ? onlyArg.slice('--only='.length).trim() : null,
    appIcon: iconArg ? iconArg.slice('--app-icon='.length).trim() : null
  }
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function parseHex(hex) {
  const s = String(hex).replace(/^#/, '')
  if (s.length !== 6) return { r: 214, g: 214, b: 214 }
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16)
  }
}

function fnv1a32(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function hslToRgb(h, s, l) {
  let r
  let g
  let b
  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  }
}

/**
 * 在 FNV-1a 上再做 Murmur 风格 finalizer，打散公共前缀（如 ACH_）带来的相似哈希，
 * 使 hue 在 0～360° 上尽量均匀——红/黄/绿/青/蓝/紫都会出现；同一 api 仍稳定。
 */
function avalanche32(x0) {
  let x = x0 >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x85ebca6b) >>> 0
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35) >>> 0
  x ^= x >>> 16
  return x >>> 0
}

/** 由成就 API 名得到稳定、偏马卡龙感的浅色背景 RGB（全色相，不偏总体色调） */
function pastelRgbFromApiKey(apiName) {
  const hHue = avalanche32(fnv1a32(apiName))
  const hSl = avalanche32(fnv1a32(`${apiName}\0pastel`))
  const hue = hHue % 360
  const sat = 0.34 + (hSl & 15) / 100
  const light = 0.83 + ((hSl >> 8) & 9) / 100
  return hslToRgb(hue / 360, sat, Math.min(0.92, light))
}

function solidPlate(JimpLib, w, h, rgb) {
  const col = JimpLib.rgbaToInt(rgb.r, rgb.g, rgb.b, 255)
  return new Promise((resolve, reject) => {
    new JimpLib(w, h, col, (err, img) => (err ? reject(err) : resolve(img)))
  })
}

function resolveIconFile(ROOT_DIR, iconBase, icon) {
  if (!icon || typeof icon !== 'string') return null
  const norm = normalize(icon.trim())
  if (isAbsolute(norm)) return norm
  if (norm.includes('/') || norm.includes('\\')) {
    return join(ROOT_DIR, norm)
  }
  return join(ROOT_DIR, iconBase, norm)
}

async function rasterizeSvgFile(absPath, targetWidth) {
  const svg = readFileSync(absPath, 'utf8')
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: targetWidth },
    background: 'rgba(0,0,0,0)'
  })
  const png = resvg.render().asPng()
  return Jimp.read(Buffer.from(png))
}

async function loadRasterIcon(absPath, targetWidth) {
  const lower = absPath.toLowerCase()
  if (lower.endsWith('.svg')) {
    return rasterizeSvgFile(absPath, targetWidth)
  }
  const img = await Jimp.read(absPath)
  img.contain(targetWidth, targetWidth)
  return img
}

async function loadRasterCover(absPath, target) {
  const img = await Jimp.read(absPath)
  img.cover(
    target,
    target,
    Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_MIDDLE
  )
  return img
}

/** 栅格图标 cover 缩放，保证底部不压过 label 区 */
async function fitCoverRasterIcon(
  absPath,
  labelTopY,
  iconTopY,
  maxSize,
  minSize
) {
  let target = maxSize
  while (target >= minSize) {
    const bmp = await loadRasterCover(absPath, target)
    if (iconTopY + bmp.bitmap.height <= labelTopY - 4) {
      return bmp
    }
    target -= 6
  }
  return loadRasterCover(absPath, minSize)
}

async function tryLoadAppIcon(cliPath, candidates, labelTopY, appTopY, maxSize, minSize) {
  const ordered = [cliPath, ...candidates].filter(Boolean)
  for (const rel of ordered) {
    const p = isAbsolute(rel) ? rel : join(ROOT, normalize(rel))
    if (!existsSync(p)) continue
    const lower = p.toLowerCase()
    if (!/\.(png|jpe?g|webp|bmp)$/i.test(lower)) continue
    try {
      return await fitCoverRasterIcon(p, labelTopY, appTopY, maxSize, minSize)
    } catch {
      /* next */
    }
  }
  return null
}

function glyphRows(ch) {
  const c = ch.toUpperCase()
  return GLYPH_5X7[c] || GLYPH_5X7[' ']
}

function measureLineWidth(line, scale, gap) {
  if (!line) return 0
  const cw = 5 * scale + gap
  return line.length * cw - gap
}

function layoutPixelLabel(text, maxW, maxH) {
  const upper = String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!upper) return { scale: 4, gap: 2, lineGap: 4, lines: [] }

  const minScale = 3
  const maxScale = 7

  const tryOneLine = (s) => {
    for (let scale = maxScale; scale >= minScale; scale--) {
      const gap = Math.max(1, Math.round(scale / 2))
      const w = measureLineWidth(s, scale, gap)
      const h = 7 * scale
      if (w <= maxW && h <= maxH) {
        return { scale, gap, lineGap: 0, lines: [s] }
      }
    }
    return null
  }

  let best = tryOneLine(upper)
  if (best) return best

  const words = upper.split(' ')
  if (words.length >= 2) {
    const mid = Math.ceil(words.length / 2)
    const line1 = words.slice(0, mid).join(' ')
    const line2 = words.slice(mid).join(' ')
    for (let scale = maxScale; scale >= minScale; scale--) {
      const gap = Math.max(1, Math.round(scale / 2))
      const w1 = measureLineWidth(line1, scale, gap)
      const w2 = measureLineWidth(line2, scale, gap)
      const lineGap = Math.max(2, scale)
      const th = 7 * scale + lineGap + 7 * scale
      if (w1 <= maxW && w2 <= maxW && th <= maxH) {
        return { scale, gap, lineGap, lines: [line1, line2] }
      }
    }
  }

  return {
    scale: minScale,
    gap: 1,
    lineGap: 0,
    lines: [upper.slice(0, 12)]
  }
}

function drawGlyph(JimpLib, img, rows, x0, y0, scale, rgb) {
  const col = JimpLib.rgbaToInt(rgb.r, rgb.g, rgb.b, 255)
  for (let r = 0; r < 7; r++) {
    const row = rows[r] || '.....'
    for (let c = 0; c < 5; c++) {
      if (row[c] === '#') {
        const px = x0 + c * scale
        const py = y0 + r * scale
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            img.setPixelColor(col, px + dx, py + dy)
          }
        }
      }
    }
  }
}

function drawPixelLines(JimpLib, img, lines, layout, boxX, boxY, boxW, boxH, inkRgb) {
  if (!lines.length) return
  const { scale, gap, lineGap, lines: L } = layout
  const lineHeights = L.map(() => 7 * scale)
  const totalH =
    lineHeights.reduce((a, b) => a + b, 0) + (L.length > 1 ? lineGap : 0)
  let y = boxY + Math.max(0, Math.floor((boxH - totalH) / 2))

  for (let li = 0; li < L.length; li++) {
    const line = L[li]
    const w = measureLineWidth(line, scale, gap)
    let x = boxX + Math.max(0, Math.floor((boxW - w) / 2))
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === ' ') {
        x += 3 * scale
        continue
      }
      drawGlyph(JimpLib, img, glyphRows(ch), x, y, scale, inkRgb)
      x += 5 * scale + gap
    }
    y += 7 * scale + (li < L.length - 1 ? lineGap : 0)
  }
}

/** 将不透明像素变为近白（锁定态应用图标 / 无 white 版 SVG 时的兜底） */
function flattenOpaqueToWhite(img) {
  const out = img.clone()
  out.scan(0, 0, out.bitmap.width, out.bitmap.height, function (_x, _y, idx) {
    const a = this.bitmap.data[idx + 3]
    if (a < 12) return
    this.bitmap.data[idx] = INK_LOCKED.r
    this.bitmap.data[idx + 1] = INK_LOCKED.g
    this.bitmap.data[idx + 2] = INK_LOCKED.b
  })
  return out
}

/** 锁定态：优先使用与 *-black.svg 成对的 *-white.svg */
function resolveLockedIconPath(absBlackPath) {
  const lower = absBlackPath.toLowerCase()
  if (!lower.endsWith('.svg')) return absBlackPath
  const whitePath = absBlackPath.replace(/-black\.svg$/i, '-white.svg')
  if (whitePath !== absBlackPath && existsSync(whitePath)) {
    return whitePath
  }
  return absBlackPath
}

async function fitRasterIcon(absPath, labelTopY, iconTopY, W, maxIcon, minIcon) {
  let target = maxIcon
  while (target >= minIcon) {
    const bmp = await loadRasterIcon(absPath, target)
    const bottom = iconTopY + bmp.bitmap.height
    if (bottom <= labelTopY - 4) {
      return bmp
    }
    target -= 6
  }
  return loadRasterIcon(absPath, minIcon)
}

async function buildPlate(JimpLib, row, defaults, cliAppIcon, locked) {
  const W = defaults.canvasSize ?? 256
  const H = defaults.canvasSize ?? 256
  const iconBase = defaults.iconBase ?? 'src/renderer/src/assets/icons'

  const labelAreaTop = defaults.labelAreaTop ?? 140
  const labelMaxW = defaults.labelMaxWidth ?? 248
  const labelMaxH = defaults.labelMaxHeight ?? 104
  const iconTop = defaults.iconMarginTop ?? 22
  const maxIcon = Math.round(
    Math.min(
      (defaults.iconMax ?? 160) * ICON_SIZE_FACTOR,
      Math.floor(W * 0.64 * ICON_SIZE_FACTOR)
    )
  )
  const minIcon = Math.round((defaults.iconMin ?? 76) * ICON_SIZE_FACTOR)

  let bgRgb
  if (locked) {
    bgRgb = parseHex(defaults.lockedBackground ?? '#101010')
  } else {
    bgRgb = pastelRgbFromApiKey(row.api)
  }

  const ink = locked ? INK_LOCKED : INK_UNLOCKED
  const plate = await solidPlate(JimpLib, W, H, bgRgb)

  if (row.useAppIcon) {
    const appSize = Math.round(
      Math.min(
        (defaults.appIconSize ?? 150) * ICON_SIZE_FACTOR,
        Math.floor(W * 0.58 * ICON_SIZE_FACTOR)
      )
    )
    const appTop = defaults.appIconMarginTop ?? iconTop
    const cands = defaults.appIconCandidates ?? ['build/icon.png', 'resources/icon.png']
    let appBmp = await tryLoadAppIcon(
      cliAppIcon,
      cands,
      labelAreaTop,
      appTop,
      appSize,
      minIcon
    )
    if (!appBmp) {
      const fallbackName = locked ? 'meta-white.svg' : 'meta-black.svg'
      const fallback = resolveIconFile(ROOT, iconBase, fallbackName)
      if (existsSync(fallback)) {
        console.warn(`[${row.api}] 未找到应用图标，使用 ${fallback}`)
        appBmp = await fitRasterIcon(
          fallback,
          labelAreaTop,
          appTop,
          W,
          Math.min(appSize, maxIcon),
          minIcon
        )
      }
    }
    if (appBmp) {
      if (locked) {
        appBmp = flattenOpaqueToWhite(appBmp)
      }
      const ix = Math.round((W - appBmp.bitmap.width) / 2)
      plate.composite(appBmp, ix, appTop)
    }
  } else if (row.icon) {
    let abs = resolveIconFile(ROOT, iconBase, row.icon)
    if (!existsSync(abs)) {
      throw new Error(`缺少图标文件: ${abs}（成就 ${row.api}）`)
    }
    if (locked) {
      abs = resolveLockedIconPath(abs)
    }
    let bmp = await fitRasterIcon(abs, labelAreaTop, iconTop, W, maxIcon, minIcon)
    if (locked && abs.toLowerCase().includes('-black.svg')) {
      bmp = flattenOpaqueToWhite(bmp)
    }
    const ix = Math.round((W - bmp.bitmap.width) / 2)
    plate.composite(bmp, ix, iconTop)
  } else {
    throw new Error(`成就 ${row.api}：请设置 icon 或 useAppIcon`)
  }

  const label = typeof row.label === 'string' ? row.label.trim() : ''
  if (label) {
    const layout = layoutPixelLabel(label, labelMaxW, labelMaxH)
    const lx = Math.max(0, Math.floor((W - labelMaxW) / 2))
    drawPixelLines(
      JimpLib,
      plate,
      label,
      layout,
      lx,
      labelAreaTop,
      labelMaxW,
      labelMaxH,
      ink
    )
  }

  return plate
}

async function writePair(JimpLib, row, defaults, cliAppIcon, quality) {
  const uPath = join(OUT_DIR, `${row.api}_unlocked.jpg`)
  const lPath = join(OUT_DIR, `${row.api}_locked.jpg`)
  const unlocked = await buildPlate(JimpLib, row, defaults, cliAppIcon, false)
  const locked = await buildPlate(JimpLib, row, defaults, cliAppIcon, true)
  await unlocked.clone().quality(quality).writeAsync(uPath)
  await locked.clone().quality(quality).writeAsync(lPath)
  console.log('wrote', uPath, lPath)
}

async function main() {
  const { configPath, only, appIcon } = parseArgs()
  if (!existsSync(configPath)) {
    console.error('配置文件不存在:', configPath)
    process.exit(1)
  }

  const cfg = loadJson(configPath)
  const defaults = cfg.defaults ?? {}
  const rows = cfg.achievements ?? []
  if (!Array.isArray(rows) || rows.length === 0) {
    console.error('steam-achievement-icons.json: achievements 为空')
    process.exit(1)
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const q = defaults.jpegQuality ?? 88

  for (const row of rows) {
    if (!row || typeof row.api !== 'string') continue
    if (only && row.api !== only) continue
    await writePair(Jimp, row, defaults, appIcon, q)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
