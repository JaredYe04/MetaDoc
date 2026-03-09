/**
 * 通义千问 / 阿里云百炼 DashScope 原生 API 适配器
 * 使用官方 DashScope 接口，不再走 OpenAI 兼容模式
 * 文档：https://help.aliyun.com/zh/dashscope/developer-reference/qwen-api-details
 */

import { BaseLlmAdapter } from './base-adapter.ts'
import type { Message, RequestMeta, RequestMode, UnifiedResponse, UsageStats } from './types.ts'

const DASHSCOPE_GENERATION_PATH = '/api/v1/services/aigc/text-generation/generation'

/** 华北2（北京）默认 base */
const DEFAULT_BASE = 'https://dashscope.aliyuncs.com'

export class QwenAdapter extends BaseLlmAdapter {
  private baseUrl: string

  constructor(config: any) {
    super(config)
    const apiUrl = config.apiUrl || ''
    if (apiUrl && apiUrl.includes('dashscope')) {
      const u = new URL(apiUrl.replace(/\/compatible-mode\/v1\/?$/, '').trim() || DEFAULT_BASE)
      this.baseUrl = `${u.origin}${u.pathname.replace(/\/$/, '')}`
    } else {
      this.baseUrl = DEFAULT_BASE
    }
  }

  getCompletionUrl(): string {
    return `${this.baseUrl}${DASHSCOPE_GENERATION_PATH}`
  }

  getChatUrl(): string {
    return `${this.baseUrl}${DASHSCOPE_GENERATION_PATH}`
  }

  buildCompletionPayload(prompt: string, meta: RequestMeta = {}): any {
    const { selectedModel } = this.config
    const effectiveTemperature = meta.temperature ?? this.config.temperature ?? 1.3
    const parameters: Record<string, unknown> = {
      result_format: 'message',
      temperature: effectiveTemperature
    }
    if (meta.stream) {
      parameters.incremental_output = true
    }
    if (meta.max_tokens != null && meta.max_tokens > 0) {
      parameters.max_tokens = meta.max_tokens
    }
    return {
      model: selectedModel,
      input: {
        messages: [{ role: 'user', content: prompt }]
      },
      parameters
    }
  }

  buildChatPayload(messages: any[], meta: RequestMeta = {}): any {
    const { selectedModel } = this.config
    const effectiveTemperature = meta.temperature ?? this.config.temperature ?? 1.3
    const parameters: Record<string, unknown> = {
      result_format: 'message',
      temperature: effectiveTemperature
    }
    if (meta.stream) {
      parameters.incremental_output = true
    }
    if (meta.max_tokens != null && meta.max_tokens > 0) {
      parameters.max_tokens = meta.max_tokens
    }
    const dashMessages = (messages as Message[]).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
      content: typeof m.content === 'string' ? m.content : (m.content ?? '')
    }))
    return {
      model: selectedModel,
      input: { messages: dashMessages },
      parameters
    }
  }

  buildHeaders(): Record<string, string> {
    const { apiKey } = this.config
    return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
  }

  /** 流式请求需加此头 */
  buildStreamHeaders(): Record<string, string> {
    return { ...this.buildHeaders(), 'X-DashScope-SSE': 'enable' }
  }

  convertResponse(response: any, _mode: RequestMode = 'chat'): UnifiedResponse {
    const output = response.output
    const text =
      output?.choices?.[0]?.message?.content ??
      output?.text ??
      (response.choices?.[0]?.message?.content ?? response.choices?.[0]?.text ?? '')
    const usageRaw = output?.usage ?? response.usage
    const usage: UsageStats | null = usageRaw
      ? {
          prompt_tokens: usageRaw.prompt_tokens ?? usageRaw.input_tokens ?? 0,
          completion_tokens: usageRaw.completion_tokens ?? usageRaw.output_tokens ?? 0,
          total_tokens: usageRaw.total_tokens ?? 0
        }
      : null
    return { text, usage }
  }

  extractStreamDelta(chunk: any, _mode: RequestMode = 'chat'): string {
    const output = chunk.output
    return (
      output?.choices?.[0]?.delta?.content ??
      output?.choices?.[0]?.message?.content ??
      output?.text ??
      chunk.choices?.[0]?.delta?.content ??
      ''
    )
  }

  extractStreamUsage(chunk: any): UsageStats | null {
    const usageRaw = chunk.output?.usage ?? chunk.usage
    if (!usageRaw) return null
    return {
      prompt_tokens: usageRaw.prompt_tokens ?? usageRaw.input_tokens ?? 0,
      completion_tokens: usageRaw.completion_tokens ?? usageRaw.output_tokens ?? 0,
      total_tokens: usageRaw.total_tokens ?? 0
    }
  }
}
