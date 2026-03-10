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
  const content = msg.content ?? ''

  if (msg.role === 'system') {
    return { role: 'system', content: content || '' }
  }

  if (msg.role === 'user') {
    return { role: 'user', content: content }
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
      parts.push({
        type: 'tool-call',
        toolCallId: tc.id,
        toolName: tc.function?.name ?? '',
        input: parseToolCallArgs(tc.function?.arguments ?? '{}')
      })
    }
    return { role: 'assistant', content: parts }
  }

  if (msg.role === 'tool') {
    return {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: msg.tool_call_id ?? '',
          toolName: msg.name ?? '',
          result: content
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
