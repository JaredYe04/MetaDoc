/**
 * Meta-info 移除工具
 * 用于在文件比较和冲突检测时移除 MetaDoc 注入的 meta-info
 */

/**
 * 移除 Markdown 文件中的 meta-info
 * @param content Markdown 内容
 * @returns 移除 meta-info 后的内容
 */
export function removeMetaInfoFromMarkdown(content: string): string {
  if (!content || typeof content !== 'string') {
    return content || ''
  }

  // 移除 Markdown 中的元信息标记（<!--meta-info: ... -->）
  return content.replace(/<!--meta-info:\s*[^>]*-->/g, '').trim()
}

/**
 * 移除 LaTeX 文件中的 meta-info
 * @param content LaTeX 内容
 * @returns 移除 meta-info 后的内容
 */
export function removeMetaInfoFromLatex(content: string): string {
  if (!content || typeof content !== 'string') {
    return content || ''
  }

  let result = content

  // 移除警告行
  result = result.replace(/% 请勿手动修改此行及下面的 META-INFO.*\n?/g, '')

  // 移除 META-INFO 行
  result = result.replace(/%META-INFO:\s*[^\n]*\n?/g, '')

  return result.trim()
}

/**
 * 根据文件格式移除 meta-info
 * @param content 文件内容
 * @param format 文件格式 ('md' | 'tex' | 'txt' | ...)
 * @returns 移除 meta-info 后的内容；纯文本格式（如 txt）不修改，直接返回原内容
 */
export function removeMetaInfo(content: string, format: string): string {
  if (!content || typeof content !== 'string') {
    return content || ''
  }
  if (format === 'tex') {
    return removeMetaInfoFromLatex(content)
  }
  if (format === 'md') {
    return removeMetaInfoFromMarkdown(content)
  }
  // 纯文本及其他格式（txt, json 等）不包含 MetaDoc 注入的 meta-info，直接返回原内容，不 trim
  return content
}
