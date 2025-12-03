/**
 * Google Gemini API适配器
 * 使用 Google 官方 @google/genai SDK
 */

import { BaseLlmAdapter } from "./base-adapter.ts";
import { GoogleGenAI } from "@google/genai";
import type { Message, RequestMeta, RequestMode, UnifiedResponse, UsageStats } from "./types.ts";
import type { GeminiMessage, GeminiResponse } from "./types.ts";

export class GeminiAdapter extends BaseLlmAdapter {
  private client: GoogleGenAI | null = null;

  /**
   * 获取或创建 GoogleGenAI 客户端
   */
  private getClient(): GoogleGenAI {
    if (!this.client) {
      const { apiKey = '' } = this.config;
      if (!apiKey) {
        this.logger.error('Gemini API Key 未配置');
        throw new Error('Gemini API Key 未配置');
      }
      this.logger.debug('创建 GoogleGenAI 客户端，API Key 长度:', apiKey.length);
      this.client = new GoogleGenAI({
        apiKey: apiKey
      });
    }
    return this.client;
  }

  getCompletionUrl(): string {
    // 使用 SDK 时不需要 URL
    return '';
  }

  getChatUrl(): string {
    // 使用 SDK 时不需要 URL
    return '';
  }

  getStreamUrl(mode: RequestMode = 'chat'): string | null {
    // 使用 SDK 时不需要 URL
    return null;
  }

  convertMessages(messages: Message[]): GeminiMessage[] {
    // Gemini API使用不同的消息格式
    return messages
      .map((msg): GeminiMessage | null => {
        if (msg.role === 'system') {
          // Gemini不支持system角色，转换为user消息
          return {
            role: 'user',
            parts: [{ text: typeof msg.content === 'string' ? msg.content : '' }]
          };
        } else if (msg.role === 'user' || msg.role === 'assistant') {
          return {
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: typeof msg.content === 'string' ? msg.content : '' }]
          };
        }
        return null;
      })
      .filter((msg): msg is GeminiMessage => msg !== null);
  }

  buildCompletionPayload(prompt: string, meta: RequestMeta = {}): any {
    const effectiveTemperature = meta.temperature ?? this.config.temperature ?? 1.3;
    
    return {
      contents: [{
        role: 'user' as const,
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: effectiveTemperature,
        ...(meta.max_tokens && meta.max_tokens > 0 ? { maxOutputTokens: meta.max_tokens } : {}),
      }
    };
  }

  buildChatPayload(messages: any[], meta: RequestMeta = {}): any {
    const effectiveTemperature = meta.temperature ?? this.config.temperature ?? 1.3;
    const geminiContents = this.convertMessages(messages as Message[]);
    
    return {
      contents: geminiContents,
      generationConfig: {
        temperature: effectiveTemperature,
        ...(meta.max_tokens && meta.max_tokens > 0 ? { maxOutputTokens: meta.max_tokens } : {}),
      }
    };
  }

  buildHeaders(): Record<string, string> {
    // 使用 SDK 时不需要手动构建 headers
    return {};
  }

  /**
   * 使用 GoogleGenAI SDK 进行非流式补全请求
   */
  async generateContentNonStream(prompt: string, meta: RequestMeta = {}, signal?: AbortSignal): Promise<UnifiedResponse> {
    const client = this.getClient();
    const { selectedModel } = this.config;
    const payload = this.buildCompletionPayload(prompt, meta);

    const response = await client.models.generateContent({
      model: selectedModel,
      contents: payload.contents,
      config: payload.generationConfig,
      ...(signal ? { abortSignal: signal } : {})
    } as any);

    // GoogleGenAI SDK 返回的响应格式
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const usage: UsageStats | null = (response as any).usageMetadata ? {
      prompt_tokens: (response as any).usageMetadata.promptTokenCount || 0,
      completion_tokens: (response as any).usageMetadata.candidatesTokenCount || 0,
      total_tokens: (response as any).usageMetadata.totalTokenCount || 0,
    } : null;

    return { text, usage };
  }

  /**
   * 使用 GoogleGenAI SDK 进行流式补全请求
   */
  async *generateContentStream(prompt: string, meta: RequestMeta = {}, signal?: AbortSignal): AsyncGenerator<{ delta: string; usage: UsageStats | null }> {
    const client = this.getClient();
    const { selectedModel } = this.config;
    const payload = this.buildCompletionPayload(prompt, meta);

    this.logger.debug('开始流式补全请求', {
      model: selectedModel,
      contentsLength: payload.contents.length,
      config: payload.generationConfig
    });

    try {
      // generateContentStream 返回 Promise<AsyncGenerator<...>>
      const streamPromise = client.models.generateContentStream({
        model: selectedModel,
        contents: payload.contents,
        config: payload.generationConfig,
        ...(signal ? { abortSignal: signal } : {})
      } as any);

      const stream = await streamPromise;
      let lastUsage: UsageStats | null = null;
      let accumulatedText = "";

      let chunkCount = 0;
      for await (const chunk of stream) {
        chunkCount++;
        this.logger.debug(`收到流式 chunk #${chunkCount}`, {
          hasCandidates: !!chunk.candidates,
          candidatesLength: chunk.candidates?.length || 0,
          chunkKeys: Object.keys(chunk || {})
        });
        
        // GoogleGenAI SDK 流式响应：每个 chunk 是 GenerateContentResponse
        // 尝试多种方式提取文本
        let chunkText = "";
        if ((chunk as any).text) {
          // 如果 chunk 直接有 text 属性
          chunkText = (chunk as any).text;
        } else if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
          // 标准格式：candidates[0].content.parts[0].text
          chunkText = chunk.candidates[0].content.parts[0].text;
        }
        
        this.logger.debug(`Chunk #${chunkCount} 文本提取`, {
          chunkTextLength: chunkText.length,
          accumulatedLength: accumulatedText.length,
          chunkTextPreview: chunkText.substring(0, 50)
        });
        
        if (chunkText) {
          // 如果新文本长度大于累积文本，说明是累积文本，提取增量
          if (chunkText.length > accumulatedText.length && chunkText.startsWith(accumulatedText)) {
            const delta = chunkText.slice(accumulatedText.length);
            accumulatedText = chunkText;
            this.logger.debug('提取增量文本', { deltaLength: delta.length, deltaPreview: delta.substring(0, 30) });
            yield { delta, usage: null };
          } else if (chunkText !== accumulatedText) {
            // 如果文本不同，可能是新的响应片段（增量文本）
            const delta = chunkText;
            accumulatedText += chunkText; // 累积增量文本
            this.logger.debug('收到增量文本片段', { deltaLength: delta.length, deltaPreview: delta.substring(0, 30) });
            yield { delta, usage: null };
          }
        }
        
        // 检查是否有 usage 信息
        const usage = this.extractStreamUsage(chunk as any);
        if (usage) {
          lastUsage = usage;
          this.logger.debug('收到 usage 信息', usage);
        }
      }
      
      this.logger.debug('流式响应结束', { totalChunks: chunkCount, finalTextLength: accumulatedText.length });

      // 返回最终的 usage
      if (lastUsage) {
        this.logger.debug('流式响应完成，返回 usage', lastUsage);
        yield { delta: '', usage: lastUsage };
      } else {
        this.logger.warn('流式响应完成，但没有 usage 信息');
      }
    } catch (error) {
      this.logger.error('流式补全请求失败', error);
      throw error;
    }
  }

  /**
   * 使用 GoogleGenAI SDK 进行非流式对话请求
   */
  async generateChatNonStream(messages: any[], meta: RequestMeta = {}, signal?: AbortSignal): Promise<UnifiedResponse> {
    const client = this.getClient();
    const { selectedModel } = this.config;
    const payload = this.buildChatPayload(messages, meta);

    const response = await client.models.generateContent({
      model: selectedModel,
      contents: payload.contents,
      config: payload.generationConfig,
      ...(signal ? { abortSignal: signal } : {})
    } as any);

    // GoogleGenAI SDK 返回的响应格式
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const usage: UsageStats | null = (response as any).usageMetadata ? {
      prompt_tokens: (response as any).usageMetadata.promptTokenCount || 0,
      completion_tokens: (response as any).usageMetadata.candidatesTokenCount || 0,
      total_tokens: (response as any).usageMetadata.totalTokenCount || 0,
    } : null;

    return { text, usage };
  }

  /**
   * 使用 GoogleGenAI SDK 进行流式对话请求
   */
  async *generateChatStream(messages: any[], meta: RequestMeta = {}, signal?: AbortSignal): AsyncGenerator<{ delta: string; usage: UsageStats | null }> {
    const client = this.getClient();
    const { selectedModel } = this.config;
    const payload = this.buildChatPayload(messages, meta);

    this.logger.debug('开始流式对话请求', {
      model: selectedModel,
      contentsLength: payload.contents.length,
      config: payload.generationConfig
    });

    try {
      // generateContentStream 返回 Promise<AsyncGenerator<...>>
      const streamPromise = client.models.generateContentStream({
        model: selectedModel,
        contents: payload.contents,
        config: payload.generationConfig,
        ...(signal ? { abortSignal: signal } : {})
      } as any);

      const stream = await streamPromise;
      let lastUsage: UsageStats | null = null;
      let accumulatedText = "";

      let chunkCount = 0;
      for await (const chunk of stream) {
        chunkCount++;
        this.logger.debug(`收到流式对话 chunk #${chunkCount}`, {
          hasCandidates: !!chunk.candidates,
          candidatesLength: chunk.candidates?.length || 0,
          chunkKeys: Object.keys(chunk || {})
        });
        
        // GoogleGenAI SDK 流式响应：每个 chunk 是 GenerateContentResponse
        // 尝试多种方式提取文本
        let chunkText = "";
        if ((chunk as any).text) {
          // 如果 chunk 直接有 text 属性
          chunkText = (chunk as any).text;
        } else if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
          // 标准格式：candidates[0].content.parts[0].text
          chunkText = chunk.candidates[0].content.parts[0].text;
        }
        
        this.logger.debug(`对话 Chunk #${chunkCount} 文本提取`, {
          chunkTextLength: chunkText.length,
          accumulatedLength: accumulatedText.length,
          chunkTextPreview: chunkText.substring(0, 50)
        });
        
        if (chunkText) {
          // 如果新文本长度大于累积文本，说明是累积文本，提取增量
          if (chunkText.length > accumulatedText.length && chunkText.startsWith(accumulatedText)) {
            const delta = chunkText.slice(accumulatedText.length);
            accumulatedText = chunkText;
            this.logger.debug('提取增量文本', { deltaLength: delta.length, deltaPreview: delta.substring(0, 30) });
            yield { delta, usage: null };
          } else if (chunkText !== accumulatedText) {
            // 如果文本不同，可能是新的响应片段（增量文本）
            const delta = chunkText;
            accumulatedText += chunkText; // 累积增量文本
            this.logger.debug('收到增量文本片段', { deltaLength: delta.length, deltaPreview: delta.substring(0, 30) });
            yield { delta, usage: null };
          }
        }
        
        // 检查是否有 usage 信息
        const usage = this.extractStreamUsage(chunk as any);
        if (usage) {
          lastUsage = usage;
          this.logger.debug('收到 usage 信息', usage);
        }
      }
      
      this.logger.debug('流式对话响应结束', { totalChunks: chunkCount, finalTextLength: accumulatedText.length });

      // 返回最终的 usage
      if (lastUsage) {
        this.logger.debug('流式响应完成，返回 usage', lastUsage);
        yield { delta: '', usage: lastUsage };
      } else {
        this.logger.warn('流式响应完成，但没有 usage 信息');
      }
    } catch (error) {
      this.logger.error('流式对话请求失败', error);
      throw error;
    }
  }

  convertResponse(response: any, mode: RequestMode = 'chat'): UnifiedResponse {
    // GoogleGenAI SDK 返回的格式
    const text = response.text || "";
    const usage: UsageStats | null = response.usageMetadata ? {
      prompt_tokens: response.usageMetadata.promptTokenCount || 0,
      completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
      total_tokens: response.usageMetadata.totalTokenCount || 0,
    } : null;

    return { text, usage };
  }

  extractStreamDelta(chunk: any, mode: RequestMode = 'chat'): string {
    // GoogleGenAI SDK 流式响应格式
    // SDK 返回的 chunk 可能直接包含 text 属性
    if (chunk.text) {
      return chunk.text;
    }
    // 或者可能是 candidates 格式
    if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
      return chunk.candidates[0].content.parts[0]?.text || "";
    }
    return "";
  }

  extractStreamUsage(chunk: any): UsageStats | null {
    if (chunk.usageMetadata) {
      return {
        prompt_tokens: chunk.usageMetadata.promptTokenCount || 0,
        completion_tokens: chunk.usageMetadata.candidatesTokenCount || 0,
        total_tokens: chunk.usageMetadata.totalTokenCount || 0,
      };
    }
    return null;
  }
}
