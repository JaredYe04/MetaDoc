/**
 * @chip 与文本混合内容的解析与序列化（与 AgentRefComposerInput / 消息气泡共用）
 * Tag 以闭合形式存储：@[path] 或 @[tab:id]
 */
export const AT_PATTERN = /@\[([^\]]+)\]/g

export type Segment = { type: 'text'; value: string } | { type: 'at'; atValue: string }

export function parseSegments(value: string): Segment[] {
  if (!value) return [{ type: 'text', value: '' }]
  const parts: Segment[] = []
  let lastIndex = 0
  let m: RegExpExecArray | null
  AT_PATTERN.lastIndex = 0
  while ((m = AT_PATTERN.exec(value)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ type: 'text', value: value.slice(lastIndex, m.index) })
    }
    parts.push({ type: 'at', atValue: m[1] })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < value.length) {
    parts.push({ type: 'text', value: value.slice(lastIndex) })
  }
  if (parts.length === 0) parts.push({ type: 'text', value: '' })
  return parts
}

export function serializeSegments(segs: Segment[]): string {
  return segs.map((s) => (s.type === 'text' ? s.value : `@[${s.atValue}]`)).join('')
}
