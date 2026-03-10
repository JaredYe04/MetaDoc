/**
 * OpenAI兼容API适配器
 */

import { BaseLlmAdapter } from './base-adapter.ts'
import type { RequestMeta } from './types.ts'

/** OpenAI 规范：补全 POST /completions，对话 POST /chat/completions，base 为 apiUrl（如 https://api.openai.com/v1） */
export class OpenAiAdapter extends BaseLlmAdapter {
  getCompletionUrl(): string {
    const { apiUrl = '' } = this.config
    return `${apiUrl.replace(/\/$/, '')}/completions`
  }

  getChatUrl(): string {
    const { apiUrl = '' } = this.config
    return `${apiUrl.replace(/\/$/, '')}/chat/completions`
  }

  buildCompletionPayload(prompt: string, meta: RequestMeta = {}): any {
    const { selectedModel } = this.config
    const effectiveTemperature = meta.temperature ?? this.config.temperature ?? 1.3

    return {
      model: selectedModel,
      prompt: prompt,
      temperature: effectiveTemperature,
      ...(meta.max_tokens && meta.max_tokens > 0 ? { max_tokens: meta.max_tokens } : {}),
      ...meta
    }
  }

  buildChatPayload(messages: any[], meta: RequestMeta = {}): any {
    const { selectedModel } = this.config
    const effectiveTemperature = meta.temperature ?? this.config.temperature ?? 1.3

    return {
      model: selectedModel,
      messages: messages,
      temperature: effectiveTemperature,
      ...meta
    }
  }

  buildHeaders(): Record<string, string> {
    const { apiKey } = this.config
    return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
  }
}
