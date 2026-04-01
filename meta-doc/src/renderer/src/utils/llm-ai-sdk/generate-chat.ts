/**
 * 使用 AI SDK generateText 的对话/补全非流式封装
 * 供 answerQuestionNonStream / continueConversationNonStream 内部调用
 */

import { generateText } from 'ai'
import { getModelFromConfig } from './model-from-config'
import { toAISDKMessages } from './messages'
import type { LlmConfig } from '../llm-adapters/types'
import type { Message } from '../llm-adapters/types'
import type { UsageStats } from '../llm-adapters/types'

export interface GenerateChatOptions {
  config: LlmConfig
  prompt?: string
  messages?: Message[]
  temperature?: number
  maxTokens?: number
  abortSignal?: AbortSignal
  /** 为 true 时请求提供商侧开启深度思考 / reasoning（默认关闭） */
  enableReasoning?: boolean
}

export interface GenerateChatResult {
  text: string
  /** 模型在 reasoning 通道输出的思考文本（非流式；仅部分模型有） */
  reasoning: string
  usage: UsageStats | null
}

/**
 * 非流式对话/补全：返回完整文本与 usage
 */
export async function generateChat(options: GenerateChatOptions): Promise<GenerateChatResult> {
  const { config, temperature, maxTokens, abortSignal } = options
  const enableReasoning = options.enableReasoning === true
  const model = getModelFromConfig(config, { enableReasoning })

  // 这里不做 provider 特判（避免“一个平台一套 if/else”）。
  // 非流式 reasoning 依赖 AI SDK/provider 的标准化输出（reasoningText）。
  // 若某 provider 仅在 raw 字段返回 reasoning（如 reasoning_details），建议统一走流式（我们默认 stream=true），
  // 并由 stream-chat.ts 的 includeRawChunks + 通用提取器负责展示。

  const providerOptions =
    config.type === 'gemini' && enableReasoning
      ? { google: { thinkingConfig: { includeThoughts: true } } }
      : undefined

  const base = {
    model,
    temperature: temperature ?? config.temperature,
    maxOutputTokens: maxTokens ?? (config.enableMaxTokens ? config.maxTokens : undefined),
    abortSignal,
    ...(providerOptions ? { providerOptions } : {})
  }

  const result = await generateText(
    options.prompt !== undefined
      ? { ...base, prompt: options.prompt }
      : options.messages !== undefined && options.messages.length > 0
        ? { ...base, messages: toAISDKMessages(options.messages) }
        : (() => {
            throw new Error('generateChat: 需要提供 prompt 或 messages')
          })()
  )

  const usage: UsageStats | null = result.usage
    ? {
        prompt_tokens: result.usage.inputTokens ?? 0,
        completion_tokens: result.usage.outputTokens ?? 0,
        total_tokens: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0)
      }
    : null

  return {
    text: result.text ?? '',
    reasoning: result.reasoningText?.trim() ? result.reasoningText : '',
    usage
  }
}
