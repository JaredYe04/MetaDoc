/**
 * 将现有 OpenAI 风格 Message[] 转为 AI SDK 的 ModelMessage[]
 * 供 streamText / generateText 的 messages 参数使用
 */

import type { ModelMessage } from 'ai'
import type { Message, ToolCall } from '../llm-adapters/types'

function parseToolCallArgs(args: string): object {
  if (!args || typeof args !== 'string') return {}
  try {
    const parsed = JSON.parse(args)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * 将单条 Message 转为 AI SDK ModelMessage
 */
function convertOneMessage(msg: Message): ModelMessage {
  const raw = msg.content ?? ''
  const content = typeof raw === 'string' ? raw : String(raw ?? '')

  if (msg.role === 'system') {
    return { role: 'system', content: content || '' }
  }

  if (msg.role === 'user') {
    return { role: 'user', content }
  }

  if (msg.role === 'assistant') {
    // 无 tool_calls 时使用纯文本
    if (!Array.isArray(msg.tool_calls) || msg.tool_calls.length === 0) {
      return { role: 'assistant', content: content || '' }
    }
    // 有 tool_calls 时转为 content 数组（TextPart + ToolCallPart）
    const parts: Array<{ type: 'text'; text: string } | { type: 'tool-call'; toolCallId: string; toolName: string; input: object }> = []
    if (content && String(content).trim()) {
      parts.push({ type: 'text', text: content })
    }
    for (const tc of msg.tool_calls) {
      const name = tc.function?.name ?? (tc as any).tool_id ?? tc.id ?? 'unknown'
      parts.push({
        type: 'tool-call',
        toolCallId: tc.id,
        toolName: String(name || 'unknown'),
        input: parseToolCallArgs(tc.function?.arguments ?? '{}')
      })
    }
    return { role: 'assistant', content: parts }
  }

  if (msg.role === 'tool') {
    // AI SDK ModelMessage 要求 tool 消息的 content 为 ToolResultPart[]，且每项为 output（符合 ToolResultOutput），不能是 result
    const textValue = typeof content === 'string' ? content : String(content ?? '')
    return {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: msg.tool_call_id ?? '',
          toolName: msg.name ?? 'unknown',
          output: { type: 'text', value: textValue }
        }
      ]
    }
  }

  return { role: 'user', content: String(content) }
}

/**
 * 将 OpenAI 风格消息数组转为 AI SDK ModelMessage[]
 */
export function toAISDKMessages(messages: Message[]): ModelMessage[] {
  if (!Array.isArray(messages)) return []
  return messages.map(convertOneMessage)
}
