/**
 * 通义千问 / 阿里云百炼 DashScope 原生 API 适配器
 * 使用官方 DashScope 接口，不再走 OpenAI 兼容模式
 * 文档：https://help.aliyun.com/zh/dashscope/developer-reference/qwen-api-details
 * 错误说明：https://help.aliyun.com/zh/model-studio/error-code#error-url
 * - 纯文本模型（qwen-turbo、qwen-plus、qwen-max 等）→ text-generation 端点
 * - 多模态模型（qwen-vl-*、qwen3-vl-*、qwen3.5-plus 等）→ multimodal-generation 端点
 */

import { BaseLlmAdapter } from './base-adapter.ts'
import type { Message, RequestMeta, RequestMode, UnifiedResponse, UsageStats } from './types.ts'

const TEXT_GENERATION_PATH = '/api/v1/services/aigc/text-generation/generation'
const MULTIMODAL_GENERATION_PATH = '/api/v1/services/aigc/multimodal-generation/generation'

/** 华北2（北京）默认 base */
const DEFAULT_BASE = 'https://dashscope.aliyuncs.com'

/**
 * 仅以下模型使用 text-generation 端点；其余（含 qwen3.5-plus、qwen-vl 等）均用 multimodal-generation。
 * 文档：https://help.aliyun.com/zh/model-studio/error-code#error-url
 */
const TEXT_ONLY_MODELS = new Set([
  'qwen-turbo',
  'qwen-turbo-latest',
  'qwen-plus',
  'qwen-plus-latest',
  'qwen-max',
  'qwen-max-latest',
  'qwen-max-longcontext',
  'qwen-flash',
  'qwen-flash-latest',
  'qwen-coder',
  'qwen-coder-latest',
  'deepseek-v3',
  'deepseek-v3-0324',
  'deepseek-r1'
])

function useTextGenerationEndpoint(model: string): boolean {
  const m = (model || '').trim().toLowerCase()
  if (!m) return true
  if (TEXT_ONLY_MODELS.has(m)) return true
  if (
    m.startsWith('qwen-turbo') ||
    m.startsWith('qwen-plus') ||
    m.startsWith('qwen-max') ||
    m.startsWith('qwen-flash') ||
    m.startsWith('qwen-coder')
  )
    return true
  return false
}

/** 将 content（可能为字符串或多模态数组）规范为字符串，避免 processThinkTag 等调用 .replace 报错 */
function normalizeContentToText(content: unknown): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item: any) =>
        item?.text != null ? String(item.text) : item?.content != null ? String(item.content) : ''
      )
      .filter(Boolean)
      .join('')
  }
  if (typeof content === 'object' && (content as any).text != null)
    return String((content as any).text)
  return String(content)
}

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

  private getGenerationPath(): string {
    const model = this.config.selectedModel?.trim() || 'qwen-turbo'
    return useTextGenerationEndpoint(model) ? TEXT_GENERATION_PATH : MULTIMODAL_GENERATION_PATH
  }

  getCompletionUrl(): string {
    return `${this.baseUrl}${this.getGenerationPath()}`
  }

  getChatUrl(): string {
    return `${this.baseUrl}${this.getGenerationPath()}`
  }

  buildCompletionPayload(prompt: string, meta: RequestMeta = {}): any {
    const selectedModel = this.config.selectedModel?.trim() || 'qwen-turbo'
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
    const selectedModel = this.config.selectedModel?.trim() || 'qwen-turbo'
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
    const rawText =
      output?.choices?.[0]?.message?.content ??
      output?.text ??
      response.choices?.[0]?.message?.content ??
      response.choices?.[0]?.text ??
      ''
    const text = normalizeContentToText(rawText)
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
    const raw =
      output?.choices?.[0]?.delta?.content ??
      output?.choices?.[0]?.message?.content ??
      output?.text ??
      chunk.choices?.[0]?.delta?.content ??
      ''
    return normalizeContentToText(raw)
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
