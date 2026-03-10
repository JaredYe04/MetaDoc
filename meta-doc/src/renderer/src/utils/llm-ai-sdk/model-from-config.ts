/**
 * 从 LlmConfig 构造 Vercel AI SDK 的 LanguageModel
 * Phase 1: 配置与 Model 映射
 */

import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import type { LlmConfig } from '../llm-adapters/types'

/**
 * 根据当前 LlmConfig 返回 AI SDK 的 model 实例（v3），供 generateText / streamText 使用
 * 需使用 @ai-sdk/openai 与 @ai-sdk/google 3.x+（AI SDK 5/6 仅支持 v2/v3 规范）
 */
export function getModelFromConfig(config: LlmConfig): LanguageModelV3 {
  const { type, apiUrl = '', apiKey, selectedModel } = config
  const baseURL = apiUrl.replace(/\/$/, '')

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
      const openai = createOpenAI({
        apiKey: apiKey || 'dummy-key',
        baseURL: effectiveBaseURL
      })
      // 关键：OpenAI-compatible（如 DeepSeek/Ollama/Qwen compatible）通常不支持 /responses
      // 必须强制走 /chat/completions
      return openai.chat(selectedModel as any) as LanguageModelV3
    }

    default: {
      const openai = createOpenAI({
        apiKey: apiKey || 'dummy-key',
        baseURL: baseURL || 'https://api.openai.com/v1'
      })
      return openai.chat(selectedModel as any) as LanguageModelV3
    }
  }
}
