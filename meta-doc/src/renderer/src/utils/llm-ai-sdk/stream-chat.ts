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

export interface StreamChatOptions {
  /** 当前 LLM 配置 */
  config: LlmConfig
  /** 补全模式：单条 prompt；对话模式：messages */
  prompt?: string
  messages?: Message[]
  temperature?: number
  maxTokens?: number
  abortSignal?: AbortSignal
}

export interface StreamChatResult {
  /** 逐 chunk 写入的文本（由调用方更新 ref） */
  consumeStream: (onDelta: (delta: string) => void) => Promise<UsageStats | null>
}

/**
 * 流式对话/补全：通过 streamText 消费流，并返回 usage 供 recordLlmRequest
 */
export async function streamChat(options: StreamChatOptions): Promise<StreamChatResult> {
  const { config, temperature, maxTokens, abortSignal } = options
  const model = getModelFromConfig(config)

  const streamOptions: Parameters<typeof streamText>[0] = {
    model,
    temperature: temperature ?? config.temperature,
    maxTokens: maxTokens ?? (config.enableMaxTokens ? config.maxTokens : undefined),
    abortSignal
  }

  if (options.prompt !== undefined) {
    streamOptions.prompt = options.prompt
  } else if (options.messages !== undefined && options.messages.length > 0) {
    streamOptions.messages = toAISDKMessages(options.messages)
  } else {
    throw new Error('streamChat: 需要提供 prompt 或 messages')
  }

  const result = streamText(streamOptions)

  return {
    async consumeStream(onDelta: (delta: string) => void): Promise<UsageStats | null> {
      let receivedAnyText = false
      try {
        for await (const chunk of result.textStream) {
          if (chunk) {
            receivedAnyText = true
            onDelta(chunk)
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
