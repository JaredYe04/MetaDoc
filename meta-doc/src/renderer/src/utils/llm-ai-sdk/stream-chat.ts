/**
 * 使用 AI SDK streamText 的对话流式封装
 * 供 answerQuestionStream / continueConversationStream 内部调用
 */

import { streamText, NoOutputGeneratedError } from 'ai'
import { getModelFromConfig } from './model-from-config'
import { toAISDKMessages } from './messages'
import type { LlmConfig } from '../llm-adapters/types'
import type { Message } from '../llm-adapters/types'
import type { UsageStats } from '../llm-adapters/types'

/**
 * 通用 reasoning 提取器：
 * - 依赖 AI SDK includeRawChunks，能看到不同 provider 的原始 chunk(rawValue)
 * - 不做“平台 if/else”，而是从原始 JSON 中按常见字段名提取 reasoning
 */
function normalizeReasoningDetails(details: unknown): string {
  if (!details) return ''
  if (Array.isArray(details)) {
    const parts: string[] = []
    for (const item of details) {
      if (typeof item === 'string') {
        if (item.trim()) parts.push(item.trim())
        continue
      }
      if (item && typeof item === 'object') {
        const anyItem = item as any
        const t = anyItem.text ?? anyItem.content ?? anyItem.reasoning ?? anyItem.summary
        if (typeof t === 'string' && t.trim()) parts.push(t.trim())
      }
    }
    return parts.join('\n')
  }
  if (typeof details === 'string') return details.trim()
  return ''
}

function tryParseJsonText(s: string): any | null {
  const t = s.trim()
  if (!t) return null
  const json = t.startsWith('data:') ? t.replace(/^data:\s*/, '') : t
  if (json === '[DONE]') return null
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

function extractReasoningFromAnyJson(obj: any): string {
  if (!obj || typeof obj !== 'object') return ''
  const delta = obj?.choices?.[0]?.delta
  const rc =
    (typeof delta?.reasoning_content === 'string' && delta.reasoning_content) ||
    (typeof delta?.reasoning === 'string' && delta.reasoning) ||
    ''
  const rd = normalizeReasoningDetails(obj?.reasoning_details)
  const msg = obj?.choices?.[0]?.message
  const mc =
    (typeof msg?.reasoning_content === 'string' && msg.reasoning_content) ||
    (typeof msg?.reasoning === 'string' && msg.reasoning) ||
    ''
  return [rd, rc, mc].filter((x) => typeof x === 'string' && x.trim()).join('\n')
}

/** 供 stream-chat-with-tools 等与 streamText fullStream 对齐：从 raw chunk 提取 reasoning（OpenAI-compatible 常见） */
export function extractReasoningFromRawValue(rawValue: unknown): string {
  if (!rawValue) return ''
  if (typeof rawValue === 'string') {
    const parsed = tryParseJsonText(rawValue)
    if (parsed) return extractReasoningFromAnyJson(parsed)
    return ''
  }
  if (typeof rawValue === 'object') {
    return extractReasoningFromAnyJson(rawValue as any)
  }
  return ''
}

export interface StreamChatOptions {
  /** 当前 LLM 配置 */
  config: LlmConfig
  /** 补全模式：单条 prompt；对话模式：messages */
  prompt?: string
  messages?: Message[]
  temperature?: number
  maxTokens?: number
  abortSignal?: AbortSignal
  /** 为 true 时请求提供商侧开启深度思考 / reasoning（默认关闭） */
  enableReasoning?: boolean
}

/** 与 AI SDK fullStream 对齐：正文与 reasoning 分流（模型支持时才有 reasoning） */
export type StreamPartDelta = { text?: string; reasoning?: string }

export interface StreamChatResult {
  /** 逐 chunk 写入（由调用方更新 ref）；reasoning 与正文分离，便于 UI 单独展示 */
  consumeStream: (
    onDelta: (delta: StreamPartDelta) => void | Promise<void>
  ) => Promise<UsageStats | null>
}

/**
 * 流式对话/补全：通过 streamText 消费流，并返回 usage 供 recordLlmRequest
 */
export async function streamChat(options: StreamChatOptions): Promise<StreamChatResult> {
  const { config, temperature, maxTokens, abortSignal } = options
  const enableReasoning = options.enableReasoning === true
  const model = getModelFromConfig(config, { enableReasoning })

  const providerOptions =
    config.type === 'gemini' && enableReasoning
      ? { google: { thinkingConfig: { includeThoughts: true } } }
      : undefined

  const base = {
    model,
    temperature: temperature ?? config.temperature,
    maxOutputTokens: maxTokens ?? (config.enableMaxTokens ? config.maxTokens : undefined),
    abortSignal,
    includeRawChunks: true,
    ...(providerOptions ? { providerOptions } : {})
  }

  const result =
    options.prompt !== undefined
      ? streamText({ ...base, prompt: options.prompt })
      : options.messages !== undefined && options.messages.length > 0
        ? streamText({ ...base, messages: toAISDKMessages(options.messages) })
        : (() => {
            throw new Error('streamChat: 需要提供 prompt 或 messages')
          })()

  return {
    async consumeStream(
      onDelta: (delta: StreamPartDelta) => void | Promise<void>
    ): Promise<UsageStats | null> {
      let receivedAnyText = false
      try {
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            const chunk = part.text ?? ''
            if (chunk) {
              receivedAnyText = true
              await onDelta({ text: chunk })
            }
          } else if (enableReasoning && part.type === 'reasoning-delta') {
            const chunk = part.text ?? ''
            if (chunk) {
              await onDelta({ reasoning: chunk })
            }
          } else if (enableReasoning && part.type === 'raw') {
            const extra = extractReasoningFromRawValue((part as any).rawValue)
            if (extra) {
              await onDelta({ reasoning: extra })
            }
          }
        }
        const totalUsage = await result.totalUsage
        if (!totalUsage) return null
        return {
          prompt_tokens: totalUsage.inputTokens ?? 0,
          completion_tokens: totalUsage.outputTokens ?? 0,
          total_tokens: (totalUsage.inputTokens ?? 0) + (totalUsage.outputTokens ?? 0)
        }
      } catch (err) {
        // 部分后端（或错误响应）会导致 SDK 抛 NoOutputGeneratedError；若已输出过文本则仅损失 usage
        if (NoOutputGeneratedError.isInstance(err)) {
          if (!receivedAnyText) {
            const wrap = new Error(
              'LLM 未返回任何内容（常见于 API 密钥无效、账户余额或配额不足、或请求被服务端拒绝）。请检查提供商控制台与网络。'
            )
            wrap.cause = err
            throw wrap
          }
          return null
        }
        throw err
      }
    }
  }
}
