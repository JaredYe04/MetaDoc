/**
 * 从 LlmConfig 构造 Vercel AI SDK 的 LanguageModel
 * Phase 1: 配置与 Model 映射
 */

import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import type { LlmConfig } from '../llm-adapters/types'

export type GetModelOptions = {
  /** 为 true 时在请求体中注入各提供商常用的「深度思考 / reasoning」开关（默认不注入） */
  enableReasoning?: boolean
}

/**
 * 在 OpenAI 兼容的 POST /chat/completions 请求体上注入 reasoning 相关字段（仅当 enableReasoning 为 true）。
 * 按 baseURL 区分，避免向不支持的网关发送未知字段导致 400。
 */
export function mergeReasoningIntoChatCompletionBody(
  requestBaseURL: string,
  body: Record<string, unknown>,
  enableReasoning: boolean
): void {
  if (!enableReasoning) return
  const u = requestBaseURL.toLowerCase()
  if (u.includes('deepseek.com')) {
    body.thinking = { type: 'enabled' }
  } else if (u.includes('openrouter.ai')) {
    body.reasoning = { effort: 'medium' }
  }
}

function createReasoningFetchForOpenAICompatible(
  effectiveBaseURL: string,
  enableReasoning: boolean
): typeof fetch | undefined {
  if (!enableReasoning) return undefined
  const baseFetch = fetch
  return async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const method = (init?.method || 'GET').toUpperCase()
    if (method !== 'POST' || typeof init?.body !== 'string' || !url.includes('chat/completions')) {
      return baseFetch(input, init)
    }
    try {
      const parsed = JSON.parse(init.body) as Record<string, unknown>
      mergeReasoningIntoChatCompletionBody(effectiveBaseURL, parsed, true)
      return baseFetch(input, { ...init, body: JSON.stringify(parsed) })
    } catch {
      return baseFetch(input, init)
    }
  }
}

/**
 * 根据当前 LlmConfig 返回 AI SDK 的 model 实例（v3），供 generateText / streamText 使用
 * 需使用 @ai-sdk/openai 与 @ai-sdk/google 3.x+（AI SDK 5/6 仅支持 v2/v3 规范）
 */
export function getModelFromConfig(config: LlmConfig, options?: GetModelOptions): LanguageModelV3 {
  const { type, apiUrl = '', apiKey, selectedModel } = config
  const baseURL = apiUrl.replace(/\/$/, '')
  const enableReasoning = options?.enableReasoning === true

  switch (type) {
    case 'gemini': {
      const google = createGoogleGenerativeAI({
        apiKey: apiKey || undefined,
        baseURL: baseURL || undefined
      })
      return google(selectedModel) as LanguageModelV3
    }

    case 'ollama':
    case 'manual':
    case 'qwen':
    case 'openai':
    case 'openai-official':
    case 'deepseek':
    case 'metadoc': {
      // 千问 DashScope：AI SDK 走 OpenAI 兼容接口，需用 compatible-mode/v1
      // DeepSeek：chat 用 apiUrl（https://api.deepseek.com），不要用 completionApiUrl（/beta）
      // Ollama：原生为 /api/chat，流式格式与 OpenAI 不同；必须用 OpenAI 兼容端点 /v1，SDK 会请求 /v1/chat/completions
      let effectiveBaseURL = baseURL || 'https://api.openai.com/v1'
      if (type === 'ollama') {
        const withoutApi = baseURL.replace(/\/api\/?$/, '')
        effectiveBaseURL = withoutApi ? `${withoutApi}/v1` : 'http://localhost:11434/v1'
      } else if (type === 'qwen' && effectiveBaseURL.includes('dashscope')) {
        effectiveBaseURL = effectiveBaseURL.includes('compatible-mode')
          ? effectiveBaseURL.replace(/\/$/, '')
          : `${effectiveBaseURL.replace(/\/$/, '')}/compatible-mode/v1`
      }
      const reasoningFetch = createReasoningFetchForOpenAICompatible(effectiveBaseURL, enableReasoning)
      const baseFetch: typeof fetch =
        reasoningFetch ?? ((input, init) => fetch(input as RequestInfo, init))
      /** MetaDoc 云 Worker：禁止缓存 SSE 响应，避免中间层攒包导致「非流式」观感 */
      const fetchImpl: typeof fetch | undefined =
        type === 'metadoc'
          ? async (input, init) =>
              baseFetch(input as RequestInfo, { ...init, cache: 'no-store' } as RequestInit)
          : reasoningFetch ?? undefined
      const openai = createOpenAI({
        apiKey: apiKey || 'dummy-key',
        baseURL: effectiveBaseURL,
        fetch: fetchImpl
      })
      // 关键：OpenAI-compatible（如 DeepSeek/Ollama/Qwen compatible）通常不支持 /responses
      // 必须强制走 /chat/completions
      return openai.chat(selectedModel as any) as LanguageModelV3
    }

    default: {
      const effectiveBaseURL = baseURL || 'https://api.openai.com/v1'
      const openai = createOpenAI({
        apiKey: apiKey || 'dummy-key',
        baseURL: effectiveBaseURL,
        fetch: createReasoningFetchForOpenAICompatible(effectiveBaseURL, enableReasoning)
      })
      return openai.chat(selectedModel as any) as LanguageModelV3
    }
  }
}
