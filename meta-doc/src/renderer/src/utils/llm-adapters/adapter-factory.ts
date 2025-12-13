/**
 * LLM适配器工厂
 * 根据配置类型创建对应的适配器实例
 */

import { OpenAiAdapter } from "./openai-adapter.ts";
import { GeminiAdapter } from "./gemini-adapter.ts";
import { OllamaAdapter } from "./ollama-adapter.ts";
import { BaseLlmAdapter } from "./base-adapter.ts";
import { LlmError, LlmErrorType } from "../llm-errors.js";
import { getSetting } from "../settings.js";
import { getMetaDocLlmConfig, verifyToken } from "../web-utils.ts";
import type { LlmConfig, CustomLlmConfig } from "./types.ts";

/**
 * 创建适配器实例
 * @param {LlmConfig} config - LLM配置对象
 * @returns {BaseLlmAdapter} 适配器实例
 */
export function createAdapter(config: LlmConfig): BaseLlmAdapter {
  if (!config || !config.type) {
    throw new LlmError(
      LlmErrorType.INVALID_CONFIG,
      "配置无效：缺少type字段"
    );
  }

  switch (config.type) {
    case "openai":
    case "openai-official":
    case "deepseek":
      return new OpenAiAdapter(config);
    
    case "gemini":
      return new GeminiAdapter(config);
    
    case "ollama":
      return new OllamaAdapter(config);
    
    case "manual":
      // manual类型也使用OpenAI适配器（因为使用模拟接口）
      return new OpenAiAdapter(config);
    
    case "metadoc":
      // metadoc类型也使用OpenAI适配器（兼容OpenAI格式）
      return new OpenAiAdapter(config);
    
    default:
      throw new LlmError(
        LlmErrorType.INVALID_CONFIG,
        `不支持的 LLM 类型: ${config.type}`
      );
  }
}

/**
 * 从设置中获取配置并创建适配器
 * @param {CustomLlmConfig | null} customConfig - 可选的自定义配置
 * @returns {Promise<BaseLlmAdapter>} 适配器实例
 */
export async function createAdapterFromSettings(customConfig: CustomLlmConfig | null = null): Promise<BaseLlmAdapter> {
  let config: LlmConfig;

  if (customConfig) {
    // 使用自定义配置
    config = {
      type: (customConfig.type || 'openai-compatible') as LlmConfig['type'],
      apiUrl: customConfig.baseUrl,
      apiKey: customConfig.apiKey,
      selectedModel: customConfig.model,
      completionSuffix: customConfig.completionSuffix || '',
      chatSuffix: customConfig.chatSuffix || '/chat/completions',
      completionApiUrl: customConfig.type === 'deepseek' ? `${customConfig.baseUrl}/beta` : undefined,
      temperature: customConfig.temperature,
    };
  } else {
    // 从设置中加载配置
    const selectedLlm = await getSetting("selectedLlm") as LlmConfig['type'] | null;
    if (!selectedLlm) {
      throw new LlmError(LlmErrorType.INVALID_CONFIG, "未选择 LLM 类型");
    }

    config = { type: selectedLlm, selectedModel: '' };

    switch (selectedLlm) {
      case "metadoc": {
        const token = localStorage.getItem("loginToken");
        const modelName = await getSetting("metadocSelectedModel") as string | undefined;

        const isLoggedIn = verifyToken(token);
        if (!isLoggedIn) {
          throw new LlmError(
            LlmErrorType.AUTH_ERROR,
            "请先登录 MetaDoc 账户",
            null,
            { showLoginDialog: true }
          );
        }

        const metadocConfig = await getMetaDocLlmConfig(token || '', modelName || '');
        config = { ...config, ...metadocConfig };
        break;
      }

      case "openai": {
        config.apiKey = await getSetting("openaiApiKey") as string | undefined;
        config.apiUrl = await getSetting("openaiApiUrl") as string | undefined;
        config.selectedModel = await getSetting("openaiSelectedModel") as string || '';
        config.completionSuffix = await getSetting("openaiCompletionSuffix") as string | undefined;
        config.chatSuffix = await getSetting("openaiChatSuffix") as string | undefined;
        break;
      }

      case "openai-official": {
        config.apiKey = await getSetting("openaiOfficialApiKey") as string | undefined;
        config.apiUrl = "https://api.openai.com/v1";
        config.selectedModel = await getSetting("openaiOfficialSelectedModel") as string || '';
        config.completionSuffix = "";
        config.chatSuffix = "";
        break;
      }

      case "deepseek": {
        config.apiKey = await getSetting("deepseekApiKey") as string | undefined;
        config.apiUrl = "https://api.deepseek.com";
        config.completionApiUrl = "https://api.deepseek.com/beta";
        config.selectedModel = (await getSetting("deepseekSelectedModel") as string | undefined) || "deepseek-chat";
        config.completionSuffix = "";
        config.chatSuffix = "";
        break;
      }

      case "gemini": {
        config.apiKey = await getSetting("geminiApiKey") as string | undefined;
        config.apiUrl = "https://generativelanguage.googleapis.com/v1beta";
        config.selectedModel = (await getSetting("geminiSelectedModel") as string | undefined) || "gemini-2.5-flash";
        config.completionSuffix = "";
        config.chatSuffix = "";
        break;
      }

      case "ollama": {
        config.apiUrl = await getSetting("ollamaApiUrl") as string | undefined;
        config.selectedModel = await getSetting("ollamaSelectedModel") as string || '';
        break;
      }

      case "manual": {
        config.apiUrl = "http://localhost:52521/api/llm";
        config.selectedModel = "manual-model";
        config.apiKey = "";
        config.completionSuffix = "/completions";
        config.chatSuffix = "/chat/completions";
        break;
      }

      default:
        throw new LlmError(
          LlmErrorType.INVALID_CONFIG,
          `不支持的 LLM 类型: ${selectedLlm}`
        );
    }

    // 获取全局温度配置
    const globalTemperature = await getSetting("llmTemperature") as number | undefined;
    if (globalTemperature !== undefined) {
      config.temperature = globalTemperature;
    }
  }

  // 创建适配器并验证配置
  const adapter = createAdapter(config);
  adapter.validate();
  
  return adapter;
}

