/**
 * 使用 AI SDK streamText + 原生 tools 的对话流式封装
 * 供 Agent continueConversationWithTools 使用；工具格式由 toAISDKTools 统一转换
 */

import { streamText, NoOutputGeneratedError } from 'ai'
import { getModelFromConfig } from './model-from-config'
import { toAISDKMessages } from './messages'
import { toAISDKTools, type EngineToolSpec } from './tools-to-ai-sdk'
import type { LlmConfig } from '../llm-adapters/types'
import type { Message } from '../llm-adapters/types'
import type { UsageStats } from '../llm-adapters/types'

export interface StreamChatWithToolsOptions {
  config: LlmConfig
  messages: Message[]
  tools: EngineToolSpec[]
  temperature?: number
  maxTokens?: number
  abortSignal?: AbortSignal
  /** 每检测到一个完整 tool call（tool-input-available）时调用，参数与 onToolCallsDetected 一致 */
  onToolCall?: (toolCall: {
    id: string
    tool_id: string
    parameters: Record<string, unknown>
  }) => Promise<void>
}

export interface StreamChatWithToolsResult {
  consumeStream: (onDelta: (delta: string) => void) => Promise<UsageStats | null>
}

/**
 * 流式对话 + 原生工具调用：streamText 带 tools，消费 fullStream，推送文本并回调 onToolCall
 */
export async function streamChatWithTools(
  options: StreamChatWithToolsOptions
): Promise<StreamChatWithToolsResult> {
  const { config, messages, tools, temperature, maxTokens, abortSignal, onToolCall } = options
  const model = getModelFromConfig(config)
  const aiMessages = toAISDKMessages(messages)
  const aiTools = toAISDKTools(tools)

  const result = streamText({
    model,
    messages: aiMessages,
    tools: aiTools,
    temperature: temperature ?? config.temperature,
    maxTokens: maxTokens ?? (config.enableMaxTokens ? config.maxTokens : undefined),
    abortSignal
  })

  return {
    async consumeStream(onDelta: (delta: string) => void): Promise<UsageStats | null> {
      try {
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta' && part.delta) {
            onDelta(part.delta)
          }
          if (part.type === 'tool-input-available' && onToolCall) {
            const params =
              typeof part.input === 'object' && part.input !== null
                ? (part.input as Record<string, unknown>)
                : {}
            await onToolCall({
              id: part.toolCallId,
              tool_id: part.toolName,
              parameters: params
            })
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
        if (NoOutputGeneratedError.isInstance(err)) {
          return null
        }
        throw err
      }
    }
  }
}
