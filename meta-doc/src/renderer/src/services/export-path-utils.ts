import { extname, basename } from '../utils/path-utils'

/** 导出时按「图片」读取（二进制 → data URL），不当作 UTF-8 文本 */
const EXPORT_IMAGE_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.jpe',
  '.jfif',
  '.gif',
  '.webp',
  '.bmp',
  '.dib',
  '.svg',
  '.svgz',
  '.ico',
  '.icns',
  '.tiff',
  '.tif',
  '.heic',
  '.heif',
  '.avif'
])

export function isExportImagePath(filePath: string | undefined | null): boolean {
  if (!filePath) return false
  return EXPORT_IMAGE_EXT.has(extname(filePath).toLowerCase())
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jpe': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.dib': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.svgz': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.icns': 'image/icns',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.avif': 'image/avif'
}

export async function loadImageFileAsMarkdownImage(
  filePath: string,
  readUpload: (path: string) => Promise<{ name: string; data: string; mimeType: string }>
): Promise<string | null> {
  try {
    const { data, mimeType: rawMime } = await readUpload(filePath)
    if (!data) {
      return null
    }
    const ext = extname(filePath).toLowerCase()
    const mime =
      rawMime && rawMime.startsWith('image/')
        ? rawMime
        : MIME_BY_EXT[ext] || (rawMime && rawMime !== 'application/octet-stream' ? rawMime : '')
    if (!mime || !mime.startsWith('image/')) {
      return null
    }
    const alt = basename(filePath).replace(/[[\]]/g, '')
    return `![${alt}](data:${mime};base64,${data})\n`
  } catch {
    return null
  }
}
