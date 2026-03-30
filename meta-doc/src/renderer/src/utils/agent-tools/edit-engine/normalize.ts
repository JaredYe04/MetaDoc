/** 统一换行为 \n */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

/** 用于模糊匹配的空白折叠（不改变原串，仅比较用） */
export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}
