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
import { createRendererLogger } from '../logger'
import type { StreamPartDelta } from './stream-chat'
import { extractReasoningFromRawValue } from './stream-chat'

export interface StreamChatWithToolsOptions {
  config: LlmConfig
  messages: Message[]
  tools: EngineToolSpec[]
  temperature?: number
  maxTokens?: number
  abortSignal?: AbortSignal
  /** 为 true 时请求提供商侧开启深度思考 / reasoning（默认关闭） */
  enableReasoning?: boolean
  /** 每检测到一个完整 tool call（tool-input-available）时调用，参数与 onToolCallsDetected 一致 */
  onToolCall?: (toolCall: {
    id: string
    tool_id: string
    parameters: Record<string, unknown>
  }) => Promise<void>
}

export interface StreamChatWithToolsResult {
  consumeStream: (
    onDelta: (delta: StreamPartDelta) => void | Promise<void>
  ) => Promise<{ usage: UsageStats | null; fullText?: string }>
}

/**
 * 流式对话 + 原生工具调用：streamText 带 tools，消费 fullStream，推送文本并回调 onToolCall
 */
export async function streamChatWithTools(
  options: StreamChatWithToolsOptions
): Promise<StreamChatWithToolsResult> {
  const { config, messages, tools, temperature, maxTokens, abortSignal, onToolCall } = options
  const enableReasoning = options.enableReasoning === true
  const model = getModelFromConfig(config, { enableReasoning })
  const aiMessages = toAISDKMessages(messages)
  const aiTools = toAISDKTools(tools)

  const providerOptions =
    config.type === 'gemini' && enableReasoning
      ? { google: { thinkingConfig: { includeThoughts: true } } }
      : undefined

  const result = streamText({
    model,
    messages: aiMessages,
    tools: aiTools,
    temperature: temperature ?? config.temperature,
    maxOutputTokens: maxTokens ?? (config.enableMaxTokens ? config.maxTokens : undefined),
    includeRawChunks: true,
    abortSignal,
    ...(providerOptions ? { providerOptions } : {})
  })

  const reportedToolCallIds = new Set<string>()
  /** 已在流中上报过的 id，流结束后不再重复上报 */
  const reportedInLoop = new Set<string>()
  type ToolCallItem = { id: string; tool_id: string; parameters: Record<string, unknown> }
  const collectedToolCalls: ToolCallItem[] = []
  return {
    async consumeStream(
      onDelta: (delta: StreamPartDelta) => void | Promise<void>
    ): Promise<{ usage: UsageStats | null; fullText?: string }> {
      let receivedTextDelta = false
      try {
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            const chunk =
              (part as { text?: string; delta?: string }).text ??
              (part as { delta?: string }).delta ??
              ''
            if (chunk) {
              receivedTextDelta = true
              await onDelta({ text: chunk })
            }
          } else if (enableReasoning && part.type === 'reasoning-delta') {
            const chunk = (part as { text?: string }).text ?? ''
            if (chunk) {
              await onDelta({ reasoning: chunk })
            }
          } else if (enableReasoning && part.type === 'raw') {
            const extra = extractReasoningFromRawValue((part as { rawValue?: unknown }).rawValue)
            if (extra) {
              await onDelta({ reasoning: extra })
            }
          }
          if (part.type === 'tool-input-available' && onToolCall) {
            if (!reportedToolCallIds.has(part.toolCallId)) {
              reportedToolCallIds.add(part.toolCallId)
              const params =
                typeof part.input === 'object' && part.input !== null
                  ? (part.input as Record<string, unknown>)
                  : {}
              const tc = {
                id: part.toolCallId,
                tool_id: part.toolName,
                parameters: params
              }
              collectedToolCalls.push(tc)
              // 仅当已有完整参数时在流中立即上报，避免 parameters 为空；无参数时等流结束后从 result.toolCalls 补全再上报
              if (Object.keys(params).length > 0) {
                reportedInLoop.add(tc.id)
                await onToolCall(tc)
              }
            }
          }
        }
        // 兜底：从 result.toolCalls 补全参数（部分 provider 流中 part.input 为空）并上报未在流中上报的 tool call
        if (onToolCall) {
          try {
            const toolCalls = await result.toolCalls
            if (Array.isArray(toolCalls)) {
              for (const tc of toolCalls) {
                const id = (tc as { toolCallId?: string }).toolCallId ?? (tc as { id?: string }).id
                const toolName =
                  (tc as { toolName?: string }).toolName ?? (tc as { name?: string }).name
                const input = (tc as { input?: unknown }).input
                const args =
                  typeof input === 'object' && input !== null
                    ? (input as Record<string, unknown>)
                    : ((tc as { args?: Record<string, unknown> }).args ??
                      (tc as { parameters?: Record<string, unknown> }).parameters ??
                      {})
                const params = typeof args === 'object' && args !== null ? args : {}

                const existing = collectedToolCalls.find((c) => c.id === id)
                if (existing) {
                  if (
                    Object.keys(existing.parameters).length === 0 &&
                    Object.keys(params).length > 0
                  ) {
                    existing.parameters = params
                  }
                } else if (id) {
                  reportedToolCallIds.add(id)
                  collectedToolCalls.push({
                    id,
                    tool_id: toolName ?? '',
                    parameters: params
                  })
                }
              }
            }
          } catch (e) {
            // toolCalls 可能因 stream 已消费而不可用，忽略
          }
          const toReportAfterStream = collectedToolCalls.filter((tc) => !reportedInLoop.has(tc.id))
          if (toReportAfterStream.length > 0) {
            createRendererLogger('stream-chat-with-tools').debug(
              '[streamChatWithTools] 流结束，上报 tool calls（含补全参数）',
              {
                count: toReportAfterStream.length,
                toolIds: toReportAfterStream.map((t) => t.tool_id)
              }
            )
            for (const tc of toReportAfterStream) {
              await onToolCall(tc)
            }
          }
        }
        const totalUsage = await result.totalUsage
        let fullText: string | undefined
        try {
          fullText = await result.text
        } catch (_) {
          fullText = undefined
        }
        if (!totalUsage) return { usage: null, fullText }
        return {
          usage: {
            prompt_tokens: totalUsage.inputTokens ?? 0,
            completion_tokens: totalUsage.outputTokens ?? 0,
            total_tokens: (totalUsage.inputTokens ?? 0) + (totalUsage.outputTokens ?? 0)
          },
          fullText
        }
      } catch (err) {
        if (NoOutputGeneratedError.isInstance(err)) {
          // 完全无文本且无已收集的 tool call 时，多为欠费/鉴权/被拒等被 SDK 归一成「无输出」
          if (!receivedTextDelta && collectedToolCalls.length === 0) {
            const wrap = new Error(
              'LLM 未返回任何内容（常见于 API 密钥无效、账户余额或配额不足、或请求被服务端拒绝）。请检查提供商控制台与网络。'
            )
            wrap.cause = err
            throw wrap
          }
          return { usage: null, fullText: undefined }
        }
        throw err
      }
    }
  }
}
