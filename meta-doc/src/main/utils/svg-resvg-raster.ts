/**
 * Resvg 栅格化（纯 Node，无 Electron），可在 worker_threads 中使用
 */
import { existsSync } from 'fs'
import { platform } from 'os'

function getAttr(tag: string, name: string): string | null {
  const re = new RegExp(`\\s${name}\\s*=\\s*(["'])([^"']*)\\1|\\s${name}\\s*=\\s*([^\\s>]+)`, 'i')
  const m = tag.match(re)
  if (m) return (m[2] !== undefined ? m[2] : m[3]).trim()
  return null
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * 针对 Mermaid 等使用 foreignObject 的 SVG 进行规范化，避免 resvg 丢字
 */
export function normalizeSvgForResvg(svgContent: string): string {
  if (!svgContent.includes('foreignObject')) {
    return svgContent
  }

  let normalized = svgContent

  normalized = normalized.replace(
    /<foreignObject([^>]*)>([\s\S]*?)<\/foreignObject>/gi,
    (match, attrs, inner) => {
      const x = getAttr(attrs, 'x') ?? '0'
      const y = getAttr(attrs, 'y') ?? '0'
      const dy = '0.9em'
      const textContent = inner
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .trim()
      if (!textContent) return ''
      return `<text x="${escapeXml(x)}" y="${escapeXml(y)}" dy="${dy}" font-family="Arial, Verdana, sans-serif">${escapeXml(textContent)}</text>`
    }
  )

  return normalized
}

/** 与 font-service.getSystemFontFiles 一致的路径列表，无 logger，供 Worker 使用 */
export function getResvgCandidateFontFiles(): string[] {
  const osPlatform = platform()
  let fontPaths: string[] = []

  if (osPlatform === 'win32') {
    fontPaths = [
      'C:/Windows/Fonts/arial.ttf',
      'C:/Windows/Fonts/arialuni.ttf',
      'C:/Windows/Fonts/msyh.ttc',
      'C:/Windows/Fonts/simhei.ttf',
      'C:/Windows/Fonts/simsun.ttc',
      'C:/Windows/Fonts/segoeui.ttf',
      'C:/Windows/Fonts/calibri.ttf',
      'C:/Windows/Fonts/trebuc.ttf',
      'C:/Windows/Fonts/tahoma.ttf',
      'C:/Windows/Fonts/verdana.ttf'
    ]
  } else if (osPlatform === 'darwin') {
    fontPaths = [
      '/System/Library/Fonts/Helvetica.ttc',
      '/System/Library/Fonts/PingFang.ttc',
      '/System/Library/Fonts/STHeiti Light.ttc',
      '/System/Library/Fonts/STHeiti Medium.ttc',
      '/System/Library/Fonts/Times.ttc',
      '/System/Library/Fonts/Monaco.dfont',
      '/Library/Fonts/Arial.ttf',
      '/Library/Fonts/Microsoft/Microsoft YaHei.ttf'
    ]
  } else {
    fontPaths = [
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
      '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
      '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.otf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
    ]
  }

  return fontPaths.filter((p) => {
    try {
      return existsSync(p)
    } catch {
      return false
    }
  })
}

function inferSvgDimensions(normalized: string): { width: number; height: number } {
  const viewBoxMatch = normalized.match(
    /viewBox="\s*[\d.-]+\s+[\d.-]+\s+([\d.-]+)\s+([\d.-]+)\s*"/i
  )
  const widthMatch = normalized.match(/width="([\d.-]+)"/i)
  const heightMatch = normalized.match(/height="([\d.-]+)"/i)
  const width = widthMatch
    ? parseFloat(widthMatch[1])
    : viewBoxMatch
      ? parseFloat(viewBoxMatch[1])
      : 1920
  const height = heightMatch
    ? parseFloat(heightMatch[1])
    : viewBoxMatch
      ? parseFloat(viewBoxMatch[2])
      : 1080
  return { width: Math.max(1, width), height: Math.max(1, height) }
}

/**
 * SVG 字符串 → PNG Buffer（同步 CPU，应在 Worker 中调用）
 */
export function resvgSvgStringToPngBuffer(svgContent: string, scale: number = 2.0): Buffer {
  const normalized = normalizeSvgForResvg(svgContent)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Resvg } = require('@resvg/resvg-js')
  const widthHeight = inferSvgDimensions(normalized)
  const targetWidth = Math.max(1400, Math.round(widthHeight.width * scale))
  const candidateFontFiles = getResvgCandidateFontFiles()

  const resvg = new Resvg(normalized, {
    fitTo: {
      mode: 'width',
      value: targetWidth
    },
    font: {
      loadSystemFonts: true,
      fontFiles: candidateFontFiles,
      sansSerifFamily: 'Arial',
      serifFamily: 'Times New Roman',
      monospaceFamily: 'Consolas',
      cursiveFamily: 'Arial',
      fantasyFamily: 'Arial',
      defaultFontFamily: 'Arial'
    },
    logLevel: 'off'
  })

  const pngData = resvg.render()
  return Buffer.from(pngData.asPng())
}
