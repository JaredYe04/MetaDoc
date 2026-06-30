#!/usr/bin/env node
/**
 * Generate Steam Inventory Item icons (PNG) from pricing YAML, using MetaDoc logo + tier/badge.
 * Optionally upload to imgbb (temporary URL) and generate a fresh ItemDef JSON.
 *
 * Output:
 * - PNG icons in --outDir
 * - ItemDef JSON in --outJson (defaults to docs/cloud/pricing/steam-inventory-itemdefs.generated.json)
 *
 * Usage examples:
 * 1) Only generate icons + JSON (no upload):
 *    node scripts/generate-steam-inventory-icons-and-itemdefs.mjs --appid 4359310 --upload=false
 *
 * 2) Generate + upload to imgbb:
 *    set IMGBB_API_KEY=xxx
 *    node scripts/generate-steam-inventory-icons-and-itemdefs.mjs --appid 4359310 --upload=true
 *
 * Notes:
 * - Steam requires publicly accessible icon_url(s).
 * - Upload requires a free API key (imgbb). If you don't pass IMGBB_API_KEY, upload will be skipped.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { pathToFileURL } from 'url'
import { createRequire } from 'module'
import { Resvg } from '@resvg/resvg-js'
import { parse as parseYaml } from 'yaml'

const require = createRequire(import.meta.url)
const Jimp = require('jimp')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const WS_ROOT = path.join(ROOT, '..')

function parseArgs(argv) {
  const args = new Map()
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (!k.startsWith('--')) continue
    // support: --key=value
    const eqIdx = k.indexOf('=')
    if (eqIdx > 2) {
      const key = k.slice(2, eqIdx)
      const v = k.slice(eqIdx + 1)
      args.set(key, v)
      continue
    }

    const key = k.slice(2)
    const v = argv[i + 1]
    if (v !== undefined && !String(v).startsWith('--')) {
      args.set(key, v)
      i++
    } else {
      args.set(key, 'true')
    }
  }
  return args
}

function getArg(args, key, fallback) {
  const v = args.get(key)
  return v === undefined ? fallback : v
}

function parseBool(s, fallback = false) {
  if (s === undefined || s === null) return fallback
  return String(s).trim().toLowerCase() === 'true'
}

function normalizeHexColor6(s, fallback) {
  const v = s ?? fallback
  const t = String(v).replace(/^#/, '').trim()
  if (!/^[0-9a-fA-F]{6}$/.test(t)) throw new Error(`Invalid hex color: ${s}`)
  return t.toUpperCase()
}

function buildPriceUsd(amountCentsUsd) {
  // Steam Inventory Schema: price = "1;USD99" where 99 means $0.99
  if (!Number.isInteger(amountCentsUsd) || amountCentsUsd < 0) {
    throw new Error(`Invalid amount_cents_usd=${amountCentsUsd}`)
  }
  return `1;USD${amountCentsUsd}`
}

function buildPriceUsdWithCny(amountCentsUsd, cnyYuan) {
  const usd = buildPriceUsd(amountCentsUsd)
  const cny = Number(cnyYuan)
  if (!Number.isFinite(cny) || cny <= 0) return usd
  const cnyFen = Math.round(cny * 100)
  return `${usd},CNY${cnyFen}`
}

function svgEscapeText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function extractDiscountPct(label) {
  const t = String(label || '')
  // examples: "~10pct off vs ...", "〜10pct off ..."
  const m =
    t.match(/~\s*(\d+)\s*pct\s*off/i) ||
    t.match(/(\d+)\s*pct\s*off/i) ||
    t.match(/~\s*(\d+)\s*%\s*off/i) ||
    t.match(/(\d+)\s*%\s*off/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function loadPricingYaml() {
  const pricingPath = path.join(ROOT, 'docs', 'cloud', 'pricing', 'steam-mtx-items.yaml')
  if (!fs.existsSync(pricingPath)) throw new Error(`Missing: ${pricingPath}`)
  const pricing = parseYaml(fs.readFileSync(pricingPath, 'utf8'))
  if (!Array.isArray(pricing?.items) || pricing.items.length === 0) throw new Error('steam-mtx-items.yaml items[] empty')
  return pricing.items
}

function tryReadJson(p) {
  if (!p) return null
  if (!fs.existsSync(p)) return null
  const raw = fs.readFileSync(p, 'utf8')
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`Invalid JSON: ${p}`)
  }
}

function resolveUploadImgBBApiKey({ args, uploadConfigPath }) {
  const fromArg = args.get('imgbbApiKey')
  if (fromArg !== undefined && String(fromArg).trim()) return String(fromArg).trim()

  const cfg = tryReadJson(uploadConfigPath)
  const fromCfg = cfg?.imgbbApiKey || cfg?.imgbb?.apiKey || cfg?.imgbb?.imageUploadApiKey
  if (fromCfg !== undefined && String(fromCfg).trim()) return String(fromCfg).trim()

  return ''
}

function base64FromFile(p) {
  return fs.readFileSync(p).toString('base64')
}

function resvgRenderSvgToPngBuffer(svgContent, targetWidth = 2048, targetHeight = 2048) {
  // Render with Resvg and system fonts (for stable CJK if present).
  // fitTo width prevents text clipping; SVG uses viewBox 0..2048.
  const resvg = new Resvg(svgContent, {
    fitTo: { mode: 'width', value: targetWidth },
    background: 'rgba(0,0,0,0)',
    font: {
      loadSystemFonts: true,
      fontFiles: [],
      sansSerifFamily: 'Arial',
      defaultFontFamily: 'Arial'
    },
    logLevel: 'off'
  })
  const pngData = resvg.render().asPng()
  // Jimp will handle exact sizing; we still add targetHeight for later resize.
  return Buffer.from(pngData)
}

function priceTextFromUsdCents(usdCents) {
  if (!Number.isFinite(usdCents)) return '$0.00'
  const usd = Number(usdCents) / 100
  return `$${usd.toFixed(2)}`
}

function extractCredits(description) {
  const t = String(description || '')
  const m = t.match(/(\d+)\s*credits?/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function softGradientByRank(rank, total) {
  const idx = total <= 1 ? 0 : Math.min(7, Math.max(0, Math.round((rank / (total - 1)) * 7)))
  // 额度从低到高：冷 -> 暖，严格从蓝到红。
  const palette = [
    { bg1: '#DCEBFF', bg2: '#BFD8FF' }, // blue
    { bg1: '#D7F2FF', bg2: '#B8E4FF' }, // cyan-blue
    { bg1: '#D8F8EE', bg2: '#BDEEDC' }, // teal-green
    { bg1: '#E4F8D8', bg2: '#D1EEBF' }, // green-yellow
    { bg1: '#F8F1D8', bg2: '#EEDFBA' }, // yellow
    { bg1: '#F8E2D0', bg2: '#EEC9AE' }, // orange
    { bg1: '#F8D6C8', bg2: '#E8B29A' }, // orange-red
    { bg1: '#F4C9C9', bg2: '#DD8F8F' } // red
  ]
  return palette[idx]
}

function buildIconSvg({
  tier,
  title,
  discountPct,
  logoPngBase64,
  bg1 = '#0B1F3A',
  bg2 = '#0E3B2F'
}) {
  const badgeText = typeof discountPct === 'number' && discountPct > 0 ? `${discountPct}% OFF` : ''
  const showBadge = Boolean(badgeText)
  const mid = bg1

  const tierNum = String(tier)
  const titleEsc = svgEscapeText(title)
  const tierNumEsc = svgEscapeText(tierNum)
  const badgeEsc = svgEscapeText(badgeText)

  // Style tweaks (per your request)
  const LOGO_SCALE = 1.5 // center logo +50%
  const TOP_TEXT_SCALE = 1.3 // top text +30%
  const BADGE_SCALE = 1.3 // right-top badge +30%

  // Logo (center around ~ (1024, 920))
  const logoCx = 1024
  const logoCy = 920
  const logoR = Math.round(290 * LOGO_SCALE)
  const logoImgSize = Math.round(508 * LOGO_SCALE)
  const logoImgX = logoCx - Math.round(logoImgSize / 2)
  const logoImgY = logoCy - Math.round(logoImgSize / 2)

  // Discount badge (keep right edge at 1980 and bottom edge at 400)
  const badgeRight = 1980
  const badgeBottom = 400
  const badgeOrigLeft = 1460
  const badgeOrigTop = 180
  const badgeW = Math.round(520 * BADGE_SCALE)
  const badgeH = Math.round(220 * BADGE_SCALE)
  const badgeX = Math.round(badgeRight - badgeW)
  const badgeY = Math.round(badgeBottom - badgeH)
  const badgeRx = Math.round(42 * BADGE_SCALE)

  // Green badge background
  const badgeBg = 'rgba(34, 197, 94, 0.95)'
  const badgeStroke = 'rgba(255,255,255,0.18)'
  const badgeDividerStroke = 'rgba(255,255,255,0.12)'

  const badgeDividerY = Math.round(badgeY + (260 - badgeOrigTop) * BADGE_SCALE)

  const badgeTextX = Math.round(badgeX + (1710 - badgeOrigLeft) * BADGE_SCALE)
  const badgeTextY = Math.round(badgeY + (326 - badgeOrigTop) * BADGE_SCALE)
  const badgeTextFontSize = Math.round(88 * BADGE_SCALE)

  const c1 = {
    cx: Math.round(badgeX + (1512 - badgeOrigLeft) * BADGE_SCALE),
    cy: Math.round(badgeY + (236 - badgeOrigTop) * BADGE_SCALE),
    r: Math.round(10 * BADGE_SCALE)
  }
  const c2 = {
    cx: Math.round(badgeX + (1542 - badgeOrigLeft) * BADGE_SCALE),
    cy: Math.round(badgeY + (212 - badgeOrigTop) * BADGE_SCALE),
    r: Math.round(6 * BADGE_SCALE)
  }
  const c3 = {
    cx: Math.round(badgeX + (1960 - badgeOrigLeft) * BADGE_SCALE),
    cy: Math.round(badgeY + (212 - badgeOrigTop) * BADGE_SCALE),
    r: Math.round(6 * BADGE_SCALE)
  }

  // Coordinate system: 2048x2048
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048" viewBox="0 0 2048 2048">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg1}" />
      <stop offset="55%" stop-color="${mid}" />
      <stop offset="100%" stop-color="${bg2}" />
    </linearGradient>
    <radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="1024" cy="520" r="1120">
      <stop offset="0%" stop-color="rgba(255,255,255,0.16)" />
      <stop offset="70%" stop-color="rgba(255,255,255,0)" />
    </radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="rgba(0,0,0,0.55)" />
    </filter>
  </defs>

  <rect x="0" y="0" width="2048" height="2048" rx="220" fill="url(#bg)" />
  <!-- Use an ellipse to avoid rounded-rect clipping (fixes "top glow cut") -->
  <ellipse cx="1024" cy="610" rx="980" ry="780" fill="url(#glow)" opacity="1" />

  <!-- logo -->
  <g filter="url(#shadow)">
    <image href="data:image/png;base64,${logoPngBase64}" x="${logoImgX}" y="${logoImgY}" width="${logoImgSize}" height="${logoImgSize}" preserveAspectRatio="xMidYMid meet" />
  </g>

  <!-- tier -->
  <text x="1024" y="1780" font-family="Arial, sans-serif" font-size="420" font-weight="800" text-anchor="middle" fill="rgba(17,24,39,0.95)" letter-spacing="4">${tierNumEsc}</text>

  <!-- title -->
  <text x="1024" y="410" font-family="Arial, sans-serif" font-size="${Math.round(96 * TOP_TEXT_SCALE)}" font-weight="700" text-anchor="middle" fill="rgba(17,24,39,0.92)">${titleEsc}</text>
  ${
    showBadge
      ? `
  <!-- discount badge -->
  <g>
    <rect
      x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeH}" rx="${badgeRx}"
      fill="${badgeBg}" stroke="${badgeStroke}" stroke-width="${Math.round(6 * BADGE_SCALE)}"
    />
    <path
      d="M ${badgeX} ${badgeDividerY} L ${badgeRight} ${badgeDividerY}"
      stroke="${badgeDividerStroke}" stroke-width="${Math.round(8 * BADGE_SCALE)}"
    />
    <text x="${badgeTextX}" y="${badgeTextY}" font-family="Arial, sans-serif" font-size="${badgeTextFontSize}" font-weight="900" text-anchor="middle" fill="white">${badgeEsc}</text>
    <circle cx="${c1.cx}" cy="${c1.cy}" r="${c1.r}" fill="rgba(255,255,255,0.8)"/>
    <circle cx="${c2.cx}" cy="${c2.cy}" r="${c2.r}" fill="rgba(255,255,255,0.65)"/>
    <circle cx="${c3.cx}" cy="${c3.cy}" r="${c3.r}" fill="rgba(255,255,255,0.65)"/>
  </g>
`
      : ''
  }
</svg>
`
  return svg
}

async function writePng(iconSvg, outPngPath) {
  const pngBuffer = resvgRenderSvgToPngBuffer(iconSvg, 2048, 2048)
  fs.mkdirSync(path.dirname(outPngPath), { recursive: true })
  fs.writeFileSync(outPngPath, pngBuffer)
}

async function generateIconsAndItemdefs() {
  const args = parseArgs(process.argv.slice(2))

  const appid = getArg(args, 'appid', '')
  if (!appid) throw new Error('Missing --appid')

  const outDir = getArg(
    args,
    'outDir',
    path.join(ROOT, 'third-party', 'steam-inventory', 'inventory-icons-generated')
  )
  const outJson = getArg(
    args,
    'outJson',
    path.join(ROOT, 'third-party', 'steam-inventory', 'steam-inventory-itemdefs.generated.json')
  )

  const icon200Dir = path.join(outDir, '200')
  const icon2048Dir = path.join(outDir, '2048')
  fs.mkdirSync(icon200Dir, { recursive: true })
  fs.mkdirSync(icon2048Dir, { recursive: true })

  const logoPngPath = getArg(
    args,
    'logoPngPath',
    path.join(WS_ROOT, 'logos', 'logov3', 'logo.png')
  )
  if (!fs.existsSync(logoPngPath)) throw new Error(`Missing --logoPngPath: ${logoPngPath}`)

  const logoBase64 = base64FromFile(logoPngPath)

  const pricingItems = loadPricingYaml()

  const upload = parseBool(getArg(args, 'upload', 'false'), false)
  const uploadProvider = getArg(args, 'uploadProvider', 'imgbb').toLowerCase()
  const uploadConfigPath = getArg(
    args,
    'uploadConfig',
    path.join(ROOT, 'third-party', 'steam-inventory', 'upload-config.local.json')
  )
  const imgbbApiKey = resolveUploadImgBBApiKey({ args, uploadConfigPath })
  const bgColor = normalizeHexColor6(getArg(args, 'backgroundColor', '0B1020'), '0B1020')
  const nameColor = normalizeHexColor6(getArg(args, 'nameColor', 'E6EDF3'), 'E6EDF3')
  const displayType = getArg(args, 'displayType', 'MetaDoc Cloud Credits')
  const storeTags = getArg(args, 'storeTags', 'metadoc;cloud;credits')

  const uploadResultByTier = new Map() // steam_item_id -> { url200, url2048 }

  async function uploadImgBB(pngFilePath) {
    if (!imgbbApiKey) throw new Error('IMGBB_API_KEY missing')
    const b64 = fs.readFileSync(pngFilePath).toString('base64')
    const params = new URLSearchParams()
    params.set('key', imgbbApiKey)
    params.set('image', b64)
    // Optional expiration: imgbb accepts expiration in days for some plans; for free it may be ignored.
    // We'll still try 1 (days) to satisfy "temporary" intent.
    params.set('expiration', '1')

    const res = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    })
    const j = await res.json()
    if (!res.ok || !j?.data?.url) {
      throw new Error(`imgbb upload failed: http=${res.status} msg=${j?.error?.message || j?.error || ''}`)
    }
    return j.data.url
  }

  // Optional: generate icons first; then upload and generate JSON with returned URLs.
  const listedSorted = pricingItems
    .filter((it) => Boolean(it?.listed))
    .map((it) => String(it.steam_item_id))
    .sort((a, b) => Number(a) - Number(b))
  const rankMap = new Map(listedSorted.map((id, idx) => [id, idx]))

  for (const it of pricingItems) {
    if (!it?.listed) continue
    const steamItemId = String(it.steam_item_id)
    const tier = steamItemId
    const usdCents = it.amount_cents_usd
    if (!Number.isFinite(usdCents) || !Number.isInteger(usdCents)) {
      throw new Error(`Invalid amount_cents_usd for steam_item_id=${steamItemId}`)
    }

    const label = String(it.label || '')
    const desc = String(it.description || '')
    const credits = extractCredits(desc) ?? extractCredits(label)
    const title = 'MetaDoc Credit Pack'
    const tierPriceText = credits != null && credits > 0 ? String(credits) : priceTextFromUsdCents(usdCents)
    const discountPct = extractDiscountPct(label)

    const icon2048Path = path.join(icon2048Dir, `${steamItemId}.png`)
    const icon200Path = path.join(icon200Dir, `${steamItemId}.png`)

    const rank = rankMap.get(steamItemId) ?? 0
    const soft = softGradientByRank(rank, listedSorted.length)
    const svg = buildIconSvg({
      tier: tierPriceText,
      title,
      discountPct,
      logoPngBase64: logoBase64,
      bg1: soft.bg1,
      bg2: soft.bg2
    })
    await writePng(svg, icon2048Path)

    // Resize for 200x200 (Steam small icon size).
    const img2048 = await Jimp.read(icon2048Path)
    img2048.resize(200, 200)
    await img2048.writeAsync(icon200Path)

    let url200 = null
    let url2048 = null
    if (upload) {
      if (uploadProvider !== 'imgbb') throw new Error(`Unsupported uploadProvider: ${uploadProvider}`)
      url200 = await uploadImgBB(icon200Path)
      url2048 = await uploadImgBB(icon2048Path)
    }
    uploadResultByTier.set(steamItemId, { url200, url2048 })
  }

  // Generate ItemDef JSON
  const itemdefs = []
  for (const it of pricingItems) {
    if (!it?.listed) continue
    const steamItemId = String(it.steam_item_id)
    const usdCents = it.amount_cents_usd
    const label = String(it.label || '')
    const desc = String(it.description || label)
    const credits = extractCredits(desc)

    const tier = steamItemId
    const discountPct = extractDiscountPct(label)
    void discountPct

    const { url200, url2048 } = uploadResultByTier.get(steamItemId) || {}
    if (upload && (!url200 || !url2048)) {
      throw new Error(`Upload missing URLs for steam_item_id=${steamItemId}`)
    }

    // If not uploading, we use local paths -> Steam can't access them,
    // but it keeps the script runnable for dev.
    const local200Abs = path.join(icon200Dir, `${steamItemId}.png`)
    const local2048Abs = path.join(icon2048Dir, `${steamItemId}.png`)
    const local200 = pathToFileURL(local200Abs).toString()
    const local2048 = pathToFileURL(local2048Abs).toString()

    itemdefs.push({
      itemdefid: Number(steamItemId),
      type: 'item',
      name: credits ? `${credits} Credit Pack` : label,
      description: credits ? `MetaDoc ${credits} Credit Pack` : desc,
      display_type: displayType,
      background_color: bgColor,
      name_color: nameColor,
      icon_url: upload ? url200 : local200,
      icon_url_large: upload ? url2048 : local2048,
      price: buildPriceUsdWithCny(usdCents, (it && typeof it.cny_price === 'number' ? it.cny_price : undefined)),
      tradable: false,
      marketable: false,
      store_tags: storeTags,
      game_only: true,
      hidden: false,
      store_hidden: false
    })
  }

  const payload = { appid: Number(appid), items: itemdefs }
  fs.mkdirSync(path.dirname(outJson), { recursive: true })
  fs.writeFileSync(outJson, JSON.stringify(payload, null, 2), 'utf8')

  console.log(`OK: wrote ${path.relative(ROOT, outJson)} with ${itemdefs.length} items`)
  console.log(`Icons dir: ${path.relative(ROOT, outDir)}`)
  if (upload) console.log('Upload: ON (imgbb)')
  else console.log('Upload: OFF (icon_url_large will be file:// URLs)')
}

generateIconsAndItemdefs().catch((e) => {
  console.error('generate-steam-inventory-icons-and-itemdefs failed:', e)
  process.exit(1)
})

