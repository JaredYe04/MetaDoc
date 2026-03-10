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
}

export interface GenerateChatResult {
  text: string
  usage: UsageStats | null
}

/**
 * 非流式对话/补全：返回完整文本与 usage
 */
export async function generateChat(options: GenerateChatOptions): Promise<GenerateChatResult> {
  const { config, temperature, maxTokens, abortSignal } = options
  const model = getModelFromConfig(config)

  const genOptions: Parameters<typeof generateText>[0] = {
    model,
    temperature: temperature ?? config.temperature,
    maxTokens: maxTokens ?? (config.enableMaxTokens ? config.maxTokens : undefined),
    abortSignal
  }

  if (options.prompt !== undefined) {
    genOptions.prompt = options.prompt
  } else if (options.messages !== undefined && options.messages.length > 0) {
    genOptions.messages = toAISDKMessages(options.messages)
  } else {
    throw new Error('generateChat: 需要提供 prompt 或 messages')
  }

  const result = await generateText(genOptions)

  const usage: UsageStats | null = result.usage
    ? {
        prompt_tokens: result.usage.inputTokens ?? 0,
        completion_tokens: result.usage.outputTokens ?? 0,
        total_tokens: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0)
      }
    : null

  return {
    text: result.text ?? '',
    usage
  }
}
