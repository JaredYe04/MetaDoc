/**
 * 文件显示工具 - 根据文件类型决定展示方式
 * - 可渲染格式（svg、html 等）：直接渲染
 * - 代码格式：使用 Monaco 语法高亮
 * - 纯文本：普通文本显示
 */

import { extname } from './path-utils'
import { getMonacoLanguage } from './format-initializer'

/** 可渲染的文本格式（内容为文本，可直接渲染） */
export const RENDERABLE_TEXT_EXTENSIONS = new Set([
  '.svg', // SVG 矢量图
  '.html',
  '.htm' // HTML 页面
])

/** 图片格式（二进制，需通过 file:// URL 显示） */
export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico'])

/** 代码格式扩展名 -> Monaco 语言 ID（与 format-initializer 保持一致） */
const CODE_EXTENSIONS: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.java': 'java',
  '.cpp': 'cpp',
  '.cxx': 'cpp',
  '.cc': 'cpp',
  '.c': 'c',
  '.h': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.ps1': 'powershell',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.json': 'json',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.ini': 'ini',
  '.conf': 'ini',
  '.sql': 'sql',
  '.md': 'markdown',
  '.tex': 'latex',
  '.r': 'r',
  '.m': 'objective-c',
  '.mm': 'objective-c',
  '.vue': 'html',
  '.svelte': 'html',
  '.dart': 'dart',
  '.lua': 'lua',
  '.pl': 'perl',
  '.pm': 'perl',
  '.vim': 'vim',
  '.diff': 'diff',
  '.patch': 'diff',
  '.log': 'log',
  '.txt': 'plaintext',
  '.text': 'plaintext'
}

export type FileDisplayType = 'svg' | 'html' | 'image' | 'code' | 'plain'

/**
 * 获取文件显示类型
 */
export function getFileDisplayType(filePath: string): FileDisplayType {
  if (!filePath || typeof filePath !== 'string') return 'plain'
  const ext = extname(filePath).toLowerCase()

  if (RENDERABLE_TEXT_EXTENSIONS.has(ext)) {
    if (ext === '.svg') return 'svg'
    if (ext === '.html' || ext === '.htm') return 'html'
  }

  if (IMAGE_EXTENSIONS.has(ext)) return 'image'

  if (CODE_EXTENSIONS[ext]) return 'code'

  return 'plain'
}

/**
 * 是否为可渲染格式（svg、html 等，从文本内容渲染）
 */
export function isRenderableTextFormat(filePath: string): boolean {
  const type = getFileDisplayType(filePath)
  return type === 'svg' || type === 'html'
}

/**
 * 是否为图片格式（需通过 file:// 显示）
 */
export function isImageFormat(filePath: string): boolean {
  return getFileDisplayType(filePath) === 'image'
}

/**
 * 是否为代码格式（使用 Monaco 显示）
 */
export function isCodeFormat(filePath: string): boolean {
  return getFileDisplayType(filePath) === 'code'
}

/**
 * 获取 Monaco 语言 ID
 */
export function getMonacoLanguageForPath(filePath: string): string {
  return getMonacoLanguage('txt', filePath)
}

/**
 * 将 SVG 内容转为可安全显示的 data URL（用于 img 标签）
 */
export function svgContentToDataUrl(content: string): string {
  if (!content || typeof content !== 'string') return ''
  try {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`
  } catch {
    return ''
  }
}
