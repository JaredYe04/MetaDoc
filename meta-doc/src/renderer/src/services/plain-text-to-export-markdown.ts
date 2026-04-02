/**
 * 将纯文本（含代码文件）规范为可导出的 Markdown：普通文本直接作为 MD；
 * 已知代码/标记类扩展名则包一层 fenced code block。
 */
import { extname } from '../utils/path-utils'
import { getMonacoLanguage } from '../utils/format-initializer'
import { isExportImagePath } from './export-path-utils'

const PLAIN_TEXT_EXT = new Set([
  '.txt',
  '.text',
  '.mdown',
  '.log',
  '.csv',
  '.tsv',
  '.env',
  '.gitignore',
  '.dockerignore',
  '.editorconfig',
  '.gitattributes',
  '.properties',
  '.rst',
  '.adoc',
  '.asciidoc'
])

function escapeFenceContent(raw: string): string {
  // 若内容含闭合 fence，用更长 fence 包裹
  if (!raw.includes('```')) return raw
  return raw.replace(/```/g, '\\`\\`\\`')
}

/**
 * @param raw 原始文件文本（serialize 后的 md 字段）
 * @param filePath 可选，用于根据扩展名决定是否使用代码块及语言标签
 */
export function wrapPlainTextAsExportMarkdown(raw: string, filePath?: string): string {
  const text = (raw ?? '').replace(/\r\n/g, '\n')
  if (!filePath) {
    return text
  }
  if (isExportImagePath(filePath)) {
    return text
  }
  // 已由 resolve 转为 Markdown 图片语法
  const head = text.trimStart()
  if (head.startsWith('![') && head.includes('](data:image/')) {
    return text
  }
  const ext = extname(filePath).toLowerCase()
  if (ext === '' || PLAIN_TEXT_EXT.has(ext)) {
    return text
  }
  const lang = getMonacoLanguage('txt', filePath) || 'plaintext'
  const body = escapeFenceContent(text)
  return `\`\`\`${lang}\n${body}\n\`\`\`\n`
}
