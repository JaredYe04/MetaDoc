/**
 * LLM适配器基类
 * 定义统一的接口，不同的LLM类型实现此接口
 */

import { LlmError, LlmErrorType } from '../llm-errors.js'
import { createRendererLogger } from '../logger.ts'
import type {
  LlmConfig,
  Message,
  UnifiedResponse,
  RequestMeta,
  RequestMode,
  UsageStats
} from './types.ts'

/**
 * LLM适配器基类
 */
export abstract class BaseLlmAdapter {
  protected config: LlmConfig
  protected type: LlmConfig['type']
  protected logger: ReturnType<typeof createRendererLogger>

  constructor(config: LlmConfig) {
    this.config = config
    this.type = config.type
    this.logger = createRendererLogger(`LLM-Adapter-${config.type}`)
  }

  /**
   * 验证配置
   * @throws {LlmError} 如果配置无效
   */
  validate(): void {
    if (!this.config.selectedModel || !this.config.selectedModel.trim()) {
      throw new LlmError(LlmErrorType.INVALID_CONFIG, '未选择模型')
    }
  }

  /**
   * 获取配置信息
   * @returns {LlmConfig} 配置对象
   */
  getConfig(): LlmConfig {
    return this.config
  }

  /**
   * 转换消息格式（从OpenAI格式转换为适配器格式）
   * @param {Message[]} messages - OpenAI格式的消息数组
   * @returns {any[]} 转换后的消息数组
   */
  convertMessages(messages: Message[]): any[] {
    // 默认实现：直接返回（适用于OpenAI兼容的API）
    return messages
  }

  /**
   * 转换响应格式（从适配器格式转换为统一格式）
   * @param {any} response - 适配器的响应
   * @param {RequestMode} mode - 'completion' 或 'chat'
   * @returns {UnifiedResponse} 统一格式的响应
   */
  convertResponse(response: any, mode: RequestMode = 'chat'): UnifiedResponse {
    // 默认实现：假设已经是OpenAI格式
    const text =
      mode === 'completion'
        ? response.choices?.[0]?.text || response.text || ''
        : response.choices?.[0]?.message?.content || ''

    const usage: UsageStats | null = response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens || 0,
          completion_tokens: response.usage.completion_tokens || 0,
          total_tokens: response.usage.total_tokens || 0
        }
      : null

    return { text, usage }
  }

  /**
   * 提取流式响应的文本增量
   * @param {any} chunk - 流式响应的chunk
   * @param {RequestMode} mode - 'completion' 或 'chat'
   * @returns {string} 文本增量
   */
  extractStreamDelta(chunk: any, mode: RequestMode = 'chat'): string {
    // 默认实现：OpenAI格式
    if (mode === 'completion') {
      return chunk.choices?.[0]?.text || ''
    } else {
      return chunk.choices?.[0]?.delta?.content || ''
    }
  }

  /**
   * 提取流式响应的usage信息
   * @param {any} chunk - 流式响应的chunk
   * @returns {UsageStats | null} usage信息
   */
  extractStreamUsage(chunk: any): UsageStats | null {
    if (chunk.usage) {
      return {
        prompt_tokens: chunk.usage.prompt_tokens || 0,
        completion_tokens: chunk.usage.completion_tokens || 0,
        total_tokens: chunk.usage.total_tokens || 0
      }
    }
    return null
  }

  /**
   * 构建completion请求的URL
   * @returns {string} URL
   */
  abstract getCompletionUrl(): string

  /**
   * 构建chat请求的URL
   * @returns {string} URL
   */
  abstract getChatUrl(): string

  /**
   * 构建completion请求的payload
   * @param {string} prompt - 提示词
   * @param {RequestMeta} meta - 元数据（temperature, max_tokens等）
   * @returns {any} payload
   */
  abstract buildCompletionPayload(prompt: string, meta?: RequestMeta): any

  /**
   * 构建chat请求的payload
   * @param {any[]} messages - 消息数组
   * @param {RequestMeta} meta - 元数据（temperature, max_tokens等）
   * @returns {any} payload
   */
  abstract buildChatPayload(messages: any[], meta?: RequestMeta): any

  /**
   * 构建请求头
   * @returns {Record<string, string>} 请求头
   */
  abstract buildHeaders(): Record<string, string>

  /**
   * 是否支持流式请求
   * @returns {boolean}
   */
  supportsStreaming(): boolean {
    return true
  }

  /**
   * 获取流式请求的URL（如果与普通URL不同）
   * @param {RequestMode} mode - 'completion' 或 'chat'
   * @returns {string | null} URL，如果与普通URL相同则返回null
   */
  getStreamUrl(mode: RequestMode = 'chat'): string | null {
    return null // 默认与普通URL相同
  }

  /**
   * 使用 SDK 进行非流式补全请求（可选实现）
   * 如果适配器使用 SDK，应该实现此方法
   */
  async generateContentNonStream?(
    prompt: string,
    meta?: RequestMeta,
    signal?: AbortSignal
  ): Promise<UnifiedResponse> {
    throw new Error('generateContentNonStream must be implemented by subclass if using SDK')
  }

  /**
   * 使用 SDK 进行流式补全请求（可选实现）
   * 如果适配器使用 SDK，应该实现此方法
   */
  async *generateContentStream?(
    prompt: string,
    meta?: RequestMeta,
    signal?: AbortSignal
  ): AsyncGenerator<{ delta: string; usage: UsageStats | null }> {
    // This is a stub that subclasses override. The yield satisfies require-yield.
    yield { delta: '', usage: null }
    throw new Error('generateContentStream must be implemented by subclass if using SDK')
  }

  /**
   * 使用 SDK 进行非流式对话请求（可选实现）
   * 如果适配器使用 SDK，应该实现此方法
   */
  async generateChatNonStream?(
    messages: any[],
    meta?: RequestMeta,
    signal?: AbortSignal
  ): Promise<UnifiedResponse> {
    throw new Error('generateChatNonStream must be implemented by subclass if using SDK')
  }

  /**
   * 使用 SDK 进行流式对话请求（可选实现）
   * 如果适配器使用 SDK，应该实现此方法
   */
  async *generateChatStream?(
    messages: any[],
    meta?: RequestMeta,
    signal?: AbortSignal
  ): AsyncGenerator<{ delta: string; usage: UsageStats | null }> {
    yield { delta: '', usage: null }
    throw new Error('generateChatStream must be implemented by subclass if using SDK')
  }
}
