/**
 * 与编辑定位一致：CRLF / 单 \\r → \\n，去掉 UTF-8 BOM（避免首行锚点 TARGET_NOT_FOUND）
 */
export function normalizeNewlines(text: string): string {
  let s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (s.length > 0 && s.charCodeAt(0) === 0xfeff) {
    s = s.slice(1)
  }
  return s
}

/** 用于模糊匹配的空白折叠（不改变原串，仅比较用） */
export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}
