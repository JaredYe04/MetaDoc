/**
 * Parse <tool_call>{"name": "id", "arguments": {...}}</tool_call> from assistant content.
 * Compatible with MetaDoc tool-call format for debugging.
 */
const TOOL_CALL_REG = /<tool_call>\s*([\s\S]*?)<\/tool_call>/gi

function parseOne(content) {
  const trimmed = content.trim()
  if (!trimmed) return null
  let obj = null
  try {
    obj = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  const name = obj.name ?? obj.tool_id ?? obj.toolId ?? obj.tool
  const args = obj.arguments ?? obj.parameters ?? obj.params ?? obj.args ?? {}
  if (!name || typeof name !== 'string') return null
  return {
    id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    tool_id: name,
    parameters: typeof args === 'object' ? args : {}
  }
}

export function parseToolCalls(content) {
  const out = []
  let m
  TOOL_CALL_REG.lastIndex = 0
  while ((m = TOOL_CALL_REG.exec(content)) !== null) {
    const parsed = parseOne(m[1])
    if (parsed) out.push(parsed)
  }
  return out
}

export function stripToolCallsFromContent(content) {
  return content
    .replace(TOOL_CALL_REG, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
