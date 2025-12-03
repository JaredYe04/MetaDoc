/**
 * Ollama API适配器
 */

import { BaseLlmAdapter } from "./base-adapter.ts";
import { LlmError, LlmErrorType } from "../llm-errors.js";
import type { RequestMeta, UnifiedResponse, RequestMode, UsageStats } from "./types.ts";

export class OllamaAdapter extends BaseLlmAdapter {
  validate(): void {
    super.validate();
    if (!this.config.apiUrl) {
      throw new LlmError(
        LlmErrorType.INVALID_CONFIG,
        "Ollama 配置不完整：缺少 API URL"
      );
    }
  }

  getCompletionUrl(): string {
    const { apiUrl = '' } = this.config;
    return `${apiUrl}/generate`;
  }

  getChatUrl(): string {
    const { apiUrl = '' } = this.config;
    return `${apiUrl}/chat`;
  }

  buildCompletionPayload(prompt: string, meta: RequestMeta = {}): any {
    const { selectedModel } = this.config;
    const effectiveTemperature = meta.temperature ?? this.config.temperature ?? 1.3;
    
    const payload: any = {
      model: selectedModel,
      prompt,
      stream: false,
      temperature: effectiveTemperature,
      ...meta,
    };
    
    // Ollama使用num_predict参数
    if (meta.max_tokens && meta.max_tokens > 0) {
      payload.num_predict = meta.max_tokens;
    }
    
    return payload;
  }

  buildChatPayload(messages: any[], meta: RequestMeta = {}): any {
    const { selectedModel } = this.config;
    const effectiveTemperature = meta.temperature ?? this.config.temperature ?? 1.3;
    
    return {
      model: selectedModel,
      messages: messages,
      stream: false,
      temperature: effectiveTemperature,
      ...meta,
    };
  }

  buildHeaders(): Record<string, string> {
    const { apiKey } = this.config;
    return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  }

  convertResponse(response: any, mode: RequestMode = 'chat'): UnifiedResponse {
    // Ollama响应格式
    const text = response.response || "";
    // Ollama可能不返回usage信息
    return { text, usage: null };
  }

  extractStreamDelta(chunk: any, mode: RequestMode = 'chat'): string {
    // Ollama流式响应格式
    return chunk.response || "";
  }
}

