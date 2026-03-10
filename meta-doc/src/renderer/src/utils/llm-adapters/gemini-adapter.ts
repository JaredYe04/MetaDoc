/**
 * Google Gemini API适配器
 * 使用 Google 官方 @google/genai SDK
 */

import { BaseLlmAdapter } from './base-adapter.ts'
import { GoogleGenAI } from '@google/genai'
import type { Message, RequestMeta, RequestMode, UnifiedResponse, UsageStats } from './types.ts'
import type { GeminiMessage, GeminiResponse } from './types.ts'

export class GeminiAdapter extends BaseLlmAdapter {
  private client: GoogleGenAI | null = null

  /**
   * 获取或创建 GoogleGenAI 客户端
   */
  private getClient(): GoogleGenAI {
    if (!this.client) {
      const { apiKey = '' } = this.config
      if (!apiKey) {
        this.logger.error('Gemini API Key 未配置')
        throw new Error('Gemini API Key 未配置')
      }
      this.logger.debug('创建 GoogleGenAI 客户端，API Key 长度:', apiKey.length)
      this.client = new GoogleGenAI({
        apiKey: apiKey
      })
    }
    return this.client
  }

  getCompletionUrl(): string {
    // 使用 SDK 时不需要 URL
    return ''
  }

  getChatUrl(): string {
    // 使用 SDK 时不需要 URL
    return ''
  }

  getStreamUrl(mode: RequestMode = 'chat'): string | null {
    // 使用 SDK 时不需要 URL
    return null
  }

  convertMessages(messages: Message[]): GeminiMessage[] {
    // Gemini API使用不同的消息格式
    const converted = messages
      .map((msg, index): GeminiMessage | null => {
        // 添加调试日志
        this.logger.debug(`转换消息 ${index}`, {
          role: msg.role,
          contentType: typeof msg.content,
          contentLength: typeof msg.content === 'string' ? msg.content.length : 'not string',
          contentPreview:
            typeof msg.content === 'string' ? msg.content.substring(0, 50) : msg.content
        })

        if (msg.role === 'system') {
          // Gemini不支持system角色，转换为user消息
          const content =
            typeof msg.content === 'string' ? msg.content : msg.content ? String(msg.content) : ''
          if (!content) {
            this.logger.warn(`消息 ${index} (system) 内容为空`)
            return null
          }
          return {
            role: 'user',
            parts: [{ text: content }]
          }
        } else if (msg.role === 'user' || msg.role === 'assistant') {
          const content =
            typeof msg.content === 'string' ? msg.content : msg.content ? String(msg.content) : ''
          if (!content && msg.role === 'user') {
            this.logger.warn(`消息 ${index} (user) 内容为空`)
            return null
          }
          return {
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: content }]
          }
        }
        this.logger.warn(`消息 ${index} 角色 ${msg.role} 不被支持，跳过`)
        return null
      })
      .filter((msg): msg is GeminiMessage => msg !== null)

    this.logger.debug('消息转换完成', {
      originalCount: messages.length,
      convertedCount: converted.length,
      convertedRoles: converted.map((m) => m.role)
    })

    return converted
  }

  buildCompletionPayload(prompt: string, meta: RequestMeta = {}): any {
    const effectiveTemperature = meta.temperature ?? this.config.temperature ?? 1.3

    return {
      contents: [
        {
          role: 'user' as const,
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: effectiveTemperature,
        ...(meta.max_tokens && meta.max_tokens > 0 ? { maxOutputTokens: meta.max_tokens } : {})
      }
    }
  }

  buildChatPayload(messages: any[], meta: RequestMeta = {}): any {
    const effectiveTemperature = meta.temperature ?? this.config.temperature ?? 1.3
    const geminiContents = this.convertMessages(messages as Message[])

    return {
      contents: geminiContents,
      generationConfig: {
        temperature: effectiveTemperature,
        ...(meta.max_tokens && meta.max_tokens > 0 ? { maxOutputTokens: meta.max_tokens } : {})
      }
    }
  }

  buildHeaders(): Record<string, string> {
    // 使用 SDK 时不需要手动构建 headers
    return {}
  }

  /**
   * 使用 GoogleGenAI SDK 进行非流式补全请求
   */
  async generateContentNonStream(
    prompt: string,
    meta: RequestMeta = {},
    signal?: AbortSignal
  ): Promise<UnifiedResponse> {
    const client = this.getClient()
    const { selectedModel } = this.config
    const payload = this.buildCompletionPayload(prompt, meta)

    const response = await client.models.generateContent({
      model: selectedModel,
      contents: payload.contents,
      config: payload.generationConfig,
      ...(signal ? { abortSignal: signal } : {})
    } as any)

    // GoogleGenAI SDK 返回的响应格式
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const usage: UsageStats | null = (response as any).usageMetadata
      ? {
          prompt_tokens: (response as any).usageMetadata.promptTokenCount || 0,
          completion_tokens: (response as any).usageMetadata.candidatesTokenCount || 0,
          total_tokens: (response as any).usageMetadata.totalTokenCount || 0
        }
      : null

    return { text, usage }
  }

  /**
   * 使用 GoogleGenAI SDK 进行流式补全请求
   */
  async *generateContentStream(
    prompt: string,
    meta: RequestMeta = {},
    signal?: AbortSignal
  ): AsyncGenerator<{ delta: string; usage: UsageStats | null }> {
    const client = this.getClient()
    const { selectedModel } = this.config
    const payload = this.buildCompletionPayload(prompt, meta)

    this.logger.debug('开始流式补全请求', {
      model: selectedModel,
      contentsLength: payload.contents.length,
      config: payload.generationConfig
    })

    try {
      // generateContentStream 返回 Promise<AsyncGenerator<...>>
      const streamPromise = client.models.generateContentStream({
        model: selectedModel,
        contents: payload.contents,
        config: payload.generationConfig,
        ...(signal ? { abortSignal: signal } : {})
      } as any)

      const stream = await streamPromise
      let lastUsage: UsageStats | null = null
      let accumulatedText = ''

      let chunkCount = 0
      for await (const chunk of stream) {
        chunkCount++

        // 添加详细的调试日志
        this.logger.debug(`收到流式补全 chunk #${chunkCount}`, {
          hasCandidates: !!chunk.candidates,
          candidatesLength: chunk.candidates?.length || 0,
          chunkKeys: Object.keys(chunk || {}),
          chunkStructure: JSON.stringify(chunk, null, 2).substring(0, 500)
        })

        // GoogleGenAI SDK 流式响应：每个 chunk 可能包含增量文本
        // 根据 SDK 文档，流式响应中每个 chunk 的 text 是增量，不是累积的
        let deltaText = ''

        // 方法1：检查 candidates[0].content.parts[0].text（增量文本）
        if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
          deltaText = chunk.candidates[0].content.parts[0].text
        }
        // 方法2：检查 chunk.text（如果 SDK 直接提供）
        else if ((chunk as any).text) {
          deltaText = (chunk as any).text
        }
        // 方法3：检查是否有 delta 字段
        else if ((chunk as any).delta?.text) {
          deltaText = (chunk as any).delta.text
        }

        this.logger.debug(`补全 Chunk #${chunkCount} 文本提取`, {
          deltaTextLength: deltaText.length,
          accumulatedLength: accumulatedText.length,
          deltaTextPreview: deltaText.substring(0, 100),
          accumulatedPreview: accumulatedText.substring(0, 100)
        })

        if (deltaText) {
          // 累积文本并返回增量
          accumulatedText += deltaText
          // this.logger.debug('提取增量文本', {
          //   deltaLength: deltaText.length,
          //   deltaPreview: deltaText.substring(0, 50),
          //   newAccumulatedLength: accumulatedText.length
          // });
          yield { delta: deltaText, usage: null }
        }

        // 检查是否有 usage 信息
        const usage = this.extractStreamUsage(chunk as any)
        if (usage) {
          lastUsage = usage
          // this.logger.debug('收到 usage 信息', usage);
        }
      }

      this.logger.debug('流式响应结束', {
        totalChunks: chunkCount,
        finalTextLength: accumulatedText.length
      })

      // 返回最终的 usage
      if (lastUsage) {
        this.logger.debug('流式响应完成，返回 usage', lastUsage)
        yield { delta: '', usage: lastUsage }
      } else {
        this.logger.warn('流式响应完成，但没有 usage 信息')
      }
    } catch (error) {
      this.logger.error('流式补全请求失败', error)
      throw error
    }
  }

  /**
   * 使用 GoogleGenAI SDK 进行非流式对话请求
   */
  async generateChatNonStream(
    messages: any[],
    meta: RequestMeta = {},
    signal?: AbortSignal
  ): Promise<UnifiedResponse> {
    const client = this.getClient()
    const { selectedModel } = this.config

    // 添加调试日志：检查输入消息
    this.logger.debug('generateChatNonStream 输入消息', {
      messagesCount: messages.length,
      firstMessage: messages[0]
        ? {
            role: messages[0].role,
            contentLength:
              typeof messages[0].content === 'string' ? messages[0].content.length : 'not string',
            contentPreview:
              typeof messages[0].content === 'string'
                ? messages[0].content.substring(0, 100)
                : messages[0].content
          }
        : null,
      allMessages: messages.map((msg, idx) => ({
        index: idx,
        role: msg.role,
        hasContent: !!msg.content,
        contentType: typeof msg.content,
        contentLength: typeof msg.content === 'string' ? msg.content.length : 0
      }))
    })

    const payload = this.buildChatPayload(messages, meta)

    // 添加调试日志：检查转换后的 payload
    this.logger.debug('generateChatNonStream payload', {
      contentsLength: payload.contents.length,
      firstContent: payload.contents[0]
        ? {
            role: payload.contents[0].role,
            partsCount: payload.contents[0].parts?.length || 0,
            firstPartText: payload.contents[0].parts?.[0]?.text?.substring(0, 100) || 'no text'
          }
        : null,
      generationConfig: payload.generationConfig
    })

    const response = await client.models.generateContent({
      model: selectedModel,
      contents: payload.contents,
      config: payload.generationConfig,
      ...(signal ? { abortSignal: signal } : {})
    } as any)

    // GoogleGenAI SDK 返回的响应格式
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // 添加调试日志：检查响应
    this.logger.debug('generateChatNonStream 响应', {
      hasCandidates: !!response.candidates,
      candidatesLength: response.candidates?.length || 0,
      responseTextLength: text.length,
      responseTextPreview: text.substring(0, 100)
    })

    const usage: UsageStats | null = (response as any).usageMetadata
      ? {
          prompt_tokens: (response as any).usageMetadata.promptTokenCount || 0,
          completion_tokens: (response as any).usageMetadata.candidatesTokenCount || 0,
          total_tokens: (response as any).usageMetadata.totalTokenCount || 0
        }
      : null

    return { text, usage }
  }

  /**
   * 使用 GoogleGenAI SDK 进行流式对话请求
   */
  async *generateChatStream(
    messages: any[],
    meta: RequestMeta = {},
    signal?: AbortSignal
  ): AsyncGenerator<{ delta: string; usage: UsageStats | null }> {
    const client = this.getClient()
    const { selectedModel } = this.config
    const payload = this.buildChatPayload(messages, meta)

    // this.logger.debug('开始流式对话请求', {
    //   model: selectedModel,
    //   contentsLength: payload.contents.length,
    //   config: payload.generationConfig
    // })

    try {
      // generateContentStream 返回 Promise<AsyncGenerator<...>>
      const streamPromise = client.models.generateContentStream({
        model: selectedModel,
        contents: payload.contents,
        config: payload.generationConfig,
        ...(signal ? { abortSignal: signal } : {})
      } as any)

      const stream = await streamPromise
      let lastUsage: UsageStats | null = null
      let accumulatedText = ''

      let chunkCount = 0
      for await (const chunk of stream) {
        chunkCount++

        // // 添加详细的调试日志
        // this.logger.debug(`收到流式对话 chunk #${chunkCount}`, {
        //   hasCandidates: !!chunk.candidates,
        //   candidatesLength: chunk.candidates?.length || 0,
        //   chunkKeys: Object.keys(chunk || {}),
        //   chunkStructure: JSON.stringify(chunk, null, 2).substring(0, 500)
        // })

        // GoogleGenAI SDK 流式响应：每个 chunk 可能包含增量文本
        // 根据 SDK 文档，流式响应中每个 chunk 的 text 是增量，不是累积的
        let deltaText = ''

        // 方法1：检查 candidates[0].content.parts[0].text（增量文本）
        if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
          deltaText = chunk.candidates[0].content.parts[0].text
        }
        // 方法2：检查 chunk.text（如果 SDK 直接提供）
        else if ((chunk as any).text) {
          deltaText = (chunk as any).text
        }
        // 方法3：检查是否有 delta 字段
        else if ((chunk as any).delta?.text) {
          deltaText = (chunk as any).delta.text
        }

        this.logger.debug(`对话 Chunk #${chunkCount} 文本提取`, {
          deltaTextLength: deltaText.length,
          accumulatedLength: accumulatedText.length,
          deltaTextPreview: deltaText.substring(0, 100),
          accumulatedPreview: accumulatedText.substring(0, 100)
        })

        if (deltaText) {
          // 累积文本并返回增量
          accumulatedText += deltaText
          // this.logger.debug('提取增量文本', {
          //   deltaLength: deltaText.length,
          //   deltaPreview: deltaText.substring(0, 50),
          //   newAccumulatedLength: accumulatedText.length
          // });
          yield { delta: deltaText, usage: null }
        }

        // 检查是否有 usage 信息
        const usage = this.extractStreamUsage(chunk as any)
        if (usage) {
          lastUsage = usage
          // this.logger.debug('收到 usage 信息', usage);
        }
      }

      this.logger.debug('流式对话响应结束', {
        totalChunks: chunkCount,
        finalTextLength: accumulatedText.length
      })

      // 返回最终的 usage
      if (lastUsage) {
        this.logger.debug('流式响应完成，返回 usage', lastUsage)
        yield { delta: '', usage: lastUsage }
      } else {
        this.logger.warn('流式响应完成，但没有 usage 信息')
      }
    } catch (error) {
      this.logger.error('流式对话请求失败', error)
      throw error
    }
  }

  convertResponse(response: any, mode: RequestMode = 'chat'): UnifiedResponse {
    // GoogleGenAI SDK 返回的格式
    const text = response.text || ''
    const usage: UsageStats | null = response.usageMetadata
      ? {
          prompt_tokens: response.usageMetadata.promptTokenCount || 0,
          completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
          total_tokens: response.usageMetadata.totalTokenCount || 0
        }
      : null

    return { text, usage }
  }

  extractStreamDelta(chunk: any, mode: RequestMode = 'chat'): string {
    // GoogleGenAI SDK 流式响应格式
    // SDK 返回的 chunk 可能直接包含 text 属性
    if (chunk.text) {
      return chunk.text
    }
    // 或者可能是 candidates 格式
    if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
      return chunk.candidates[0].content.parts[0]?.text || ''
    }
    return ''
  }

  extractStreamUsage(chunk: any): UsageStats | null {
    if (chunk.usageMetadata) {
      return {
        prompt_tokens: chunk.usageMetadata.promptTokenCount || 0,
        completion_tokens: chunk.usageMetadata.candidatesTokenCount || 0,
        total_tokens: chunk.usageMetadata.totalTokenCount || 0
      }
    }
    return null
  }
}
