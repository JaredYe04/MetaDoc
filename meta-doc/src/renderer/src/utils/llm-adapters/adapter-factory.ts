/**
 * LLM适配器工厂
 * 根据配置类型创建对应的适配器实例
 */

import { BaseLlmAdapter } from './base-adapter.ts'
import { LlmError, LlmErrorType } from '../llm-errors.js'
import { getSetting } from '../settings.js'
import { getMetaDocLlmConfig, verifyToken } from '../web-utils.ts'
import type { LlmConfig, CustomLlmConfig } from './types.ts'

// 懒加载适配器类，避免初始化顺序问题
let OpenAiAdapterClass: typeof import('./openai-adapter.ts').OpenAiAdapter | null = null
let GeminiAdapterClass: typeof import('./gemini-adapter.ts').GeminiAdapter | null = null
let OllamaAdapterClass: typeof import('./ollama-adapter.ts').OllamaAdapter | null = null
let QwenAdapterClass: typeof import('./qwen-adapter.ts').QwenAdapter | null = null

async function getOpenAiAdapter() {
  if (!OpenAiAdapterClass) {
    const module = await import('./openai-adapter.ts')
    OpenAiAdapterClass = module.OpenAiAdapter
  }
  return OpenAiAdapterClass
}

async function getQwenAdapter() {
  if (!QwenAdapterClass) {
    const module = await import('./qwen-adapter.ts')
    QwenAdapterClass = module.QwenAdapter
  }
  return QwenAdapterClass
}

async function getGeminiAdapter() {
  if (!GeminiAdapterClass) {
    const module = await import('./gemini-adapter.ts')
    GeminiAdapterClass = module.GeminiAdapter
  }
  return GeminiAdapterClass
}

async function getOllamaAdapter() {
  if (!OllamaAdapterClass) {
    const module = await import('./ollama-adapter.ts')
    OllamaAdapterClass = module.OllamaAdapter
  }
  return OllamaAdapterClass
}

/**
 * 创建适配器实例
 * @param {LlmConfig} config - LLM配置对象
 * @returns {Promise<BaseLlmAdapter>} 适配器实例
 */
export async function createAdapter(config: LlmConfig): Promise<BaseLlmAdapter> {
  if (!config || !config.type) {
    throw new LlmError(LlmErrorType.INVALID_CONFIG, '配置无效：缺少type字段')
  }

  // 延迟加载适配器类，避免初始化顺序问题
  switch (config.type) {
    case 'openai':
    case 'openai-official':
    case 'deepseek':
      return new (await getOpenAiAdapter())(config)

    case 'qwen':
      return new (await getQwenAdapter())(config)

    case 'gemini':
      return new (await getGeminiAdapter())(config)

    case 'ollama':
      return new (await getOllamaAdapter())(config)

    case 'manual':
      // manual类型也使用OpenAI适配器（因为使用模拟接口）
      return new (await getOpenAiAdapter())(config)

    case 'metadoc':
      // metadoc类型也使用OpenAI适配器（兼容OpenAI格式）
      return new (await getOpenAiAdapter())(config)

    default:
      throw new LlmError(LlmErrorType.INVALID_CONFIG, `不支持的 LLM 类型: ${config.type}`)
  }
}

/**
 * 从设置中获取配置并创建适配器
 * @param {CustomLlmConfig | null} customConfig - 可选的自定义配置
 * @returns {Promise<BaseLlmAdapter>} 适配器实例
 */
export async function createAdapterFromSettings(
  customConfig: CustomLlmConfig | null = null
): Promise<BaseLlmAdapter> {
  let config: LlmConfig

  if (customConfig) {
    // 使用自定义配置（路径按 OpenAI 规范固定为 /completions、/chat/completions，由 SDK 拼接）
    config = {
      type: (customConfig.type || 'openai-compatible') as LlmConfig['type'],
      apiUrl: customConfig.baseUrl,
      apiKey: customConfig.apiKey,
      selectedModel: customConfig.model,
      completionApiUrl:
        customConfig.type === 'deepseek' ? `${customConfig.baseUrl}/beta` : undefined,
      temperature: customConfig.temperature
    }
  } else {
    // 从设置中加载配置
    const selectedLlm = (await getSetting('selectedLlm')) as LlmConfig['type'] | null
    if (!selectedLlm) {
      throw new LlmError(LlmErrorType.INVALID_CONFIG, '未选择 LLM 类型')
    }

    config = { type: selectedLlm, selectedModel: '' }

    switch (selectedLlm) {
      case 'metadoc': {
        const token = localStorage.getItem('loginToken')
        const modelName = (await getSetting('metadocSelectedModel')) as string | undefined

        const isLoggedIn = verifyToken(token)
        if (!isLoggedIn) {
          throw new LlmError(LlmErrorType.AUTH_ERROR, '请先登录 MetaDoc 账户', null, {
            showLoginDialog: true
          })
        }

        const metadocConfig = await getMetaDocLlmConfig(token || '', modelName || '')
        config = { ...config, ...metadocConfig }
        const enableMaxTokens = (await getSetting('metadocEnableMaxTokens')) ?? false
        const maxTokens = (await getSetting('metadocMaxTokens')) || 4096
        config.enableMaxTokens = enableMaxTokens
        config.maxTokens = maxTokens
        break
      }

      case 'openai': {
        config.apiKey = (await getSetting('openaiApiKey')) as string | undefined
        config.apiUrl = (await getSetting('openaiApiUrl')) as string | undefined
        config.selectedModel = ((await getSetting('openaiSelectedModel')) as string) || ''
        const enableMaxTokens = (await getSetting('openaiEnableMaxTokens')) ?? false
        const maxTokens = (await getSetting('openaiMaxTokens')) || 4096
        config.enableMaxTokens = enableMaxTokens
        config.maxTokens = maxTokens
        break
      }

      case 'openai-official': {
        config.apiKey = (await getSetting('openaiOfficialApiKey')) as string | undefined
        config.apiUrl = 'https://api.openai.com/v1'
        config.selectedModel = ((await getSetting('openaiOfficialSelectedModel')) as string) || ''
        config.completionSuffix = ''
        config.chatSuffix = ''
        const enableMaxTokens = (await getSetting('openaiOfficialEnableMaxTokens')) ?? false
        const maxTokens = (await getSetting('openaiOfficialMaxTokens')) || 4096
        config.enableMaxTokens = enableMaxTokens
        config.maxTokens = maxTokens
        break
      }

      case 'deepseek': {
        config.apiKey = (await getSetting('deepseekApiKey')) as string | undefined
        config.apiUrl = 'https://api.deepseek.com'
        config.completionApiUrl = 'https://api.deepseek.com/beta'
        config.selectedModel =
          ((await getSetting('deepseekSelectedModel')) as string | undefined) || 'deepseek-chat'
        config.completionSuffix = ''
        config.chatSuffix = ''
        const enableMaxTokens = (await getSetting('deepseekEnableMaxTokens')) ?? false
        const maxTokens = (await getSetting('deepseekMaxTokens')) || 4096
        config.enableMaxTokens = enableMaxTokens
        config.maxTokens = maxTokens
        break
      }

      case 'gemini': {
        config.apiKey = (await getSetting('geminiApiKey')) as string | undefined
        config.apiUrl = 'https://generativelanguage.googleapis.com/v1beta'
        config.selectedModel =
          ((await getSetting('geminiSelectedModel')) as string | undefined) || 'gemini-2.5-flash'
        config.completionSuffix = ''
        config.chatSuffix = ''
        const enableMaxTokens = (await getSetting('geminiEnableMaxTokens')) ?? false
        const maxTokens = (await getSetting('geminiMaxTokens')) || 4096
        config.enableMaxTokens = enableMaxTokens
        config.maxTokens = maxTokens
        break
      }

      case 'ollama': {
        config.apiUrl = (await getSetting('ollamaApiUrl')) as string | undefined
        config.selectedModel = ((await getSetting('ollamaSelectedModel')) as string) || ''
        const enableMaxTokens = (await getSetting('ollamaEnableMaxTokens')) ?? false
        const maxTokens = (await getSetting('ollamaMaxTokens')) || 4096
        config.enableMaxTokens = enableMaxTokens
        config.maxTokens = maxTokens
        break
      }

      case 'qwen': {
        config.apiKey = (await getSetting('qwenApiKey')) as string | undefined
        // 使用 DashScope 原生 API（华北2 北京），不再使用 compatible-mode
        config.apiUrl = (await getSetting('qwenApiUrl')) || 'https://dashscope.aliyuncs.com'
        config.selectedModel = ((await getSetting('qwenSelectedModel')) as string) || 'qwen-plus'
        config.completionSuffix = ''
        config.chatSuffix = ''
        const enableMaxTokens = (await getSetting('qwenEnableMaxTokens')) ?? false
        const maxTokens = (await getSetting('qwenMaxTokens')) || 4096
        config.enableMaxTokens = enableMaxTokens
        config.maxTokens = maxTokens
        break
      }

      case 'manual': {
        config.apiUrl =
          (await import('../../config/runtime-server').then((m) => m.getRuntimeServerBaseUrl())) +
          '/api/llm'
        config.selectedModel = 'manual-model'
        config.apiKey = ''
        config.completionSuffix = '/completions'
        config.chatSuffix = '/chat/completions'
        config.enableMaxTokens = false
        break
      }

      default:
        throw new LlmError(LlmErrorType.INVALID_CONFIG, `不支持的 LLM 类型: ${selectedLlm}`)
    }

    // 获取全局温度配置
    const globalTemperature = (await getSetting('llmTemperature')) as number | undefined
    if (globalTemperature !== undefined) {
      config.temperature = globalTemperature
    }
  }

  // 创建适配器并验证配置
  const adapter = await createAdapter(config)
  adapter.validate()

  return adapter
}
