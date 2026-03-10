/**
 * LLM API 适配器
 * 支持全局LLM配置和自定义LLM配置
 */

import type { AgentEngine, CustomLlmConfig } from '../../types/agent-framework'
import { getSetting } from '../settings'
import { getMetaDocLlmConfig, verifyToken } from '../web-utils'
import { createRendererLogger } from '../logger'
import { cancelAiTask, createAiTask, type CustomLlmConfigForTask } from '../ai_tasks'
import { ai_types } from '../ai_tasks'
import { ref, watch, type Ref } from 'vue'
import type { AIDialogMessage } from '../../../../types'
import { sanitizeMessages } from '../llm-api.js'
import { extractOuterJsonString } from '../regex-utils'
import { parseToolCalls, type ParsedToolCall } from './tool-call-processor'
import { createAdapterFromSettings } from '../llm-adapters/adapter-factory.ts'
import type { EngineToolSpec } from '../llm-ai-sdk/tools-to-ai-sdk'

// 懒加载logger，避免初始化顺序问题
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('LlmAdapter')
  }
  return loggerInstance
}

/**
 * LLM 请求配置
 */
export interface LlmRequestConfig {
  messages?: Array<{ role: string; content: string }>
  prompt?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
  signal?: AbortSignal
}

/**
 * LLM 响应配置
 */
export interface LlmResponseConfig {
  apiUrl: string
  apiKey?: string
  model: string
  type:
    | 'openai'
    | 'ollama'
    | 'metadoc'
    | 'openai-official'
    | 'deepseek'
    | 'gemini'
    | 'qwen'
    | 'openai-compatible'
    | 'manual'
  chatSuffix?: string
  completionSuffix?: string
  enableMaxTokens?: boolean // 是否启用 max_tokens 限制
  maxTokens?: number // max_tokens 最大值
}

/**
 * LLM 适配器类
 */
export class LlmAdapter {
  /**
   * 获取LLM配置（根据引擎配置）
   */
  static async getLlmConfig(engine: AgentEngine): Promise<LlmResponseConfig> {
    if (engine.llmConfigMode === 'custom' && engine.customLlmConfig) {
      // 自定义LLM配置
      return this.getCustomLlmConfig(engine.customLlmConfig)
    } else {
      // 全局LLM配置
      return this.getGlobalLlmConfig()
    }
  }

  /**
   * 获取自定义LLM配置
   */
  private static getCustomLlmConfig(config: CustomLlmConfig): LlmResponseConfig {
    return {
      apiUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      type: 'openai-compatible',
      chatSuffix: '/chat/completions',
      completionSuffix: '/completions'
    }
  }

  /**
   * 获取全局LLM配置
   */
  private static async getGlobalLlmConfig(): Promise<LlmResponseConfig> {
    try {
      const selectedLlm = await getSetting('selectedLlm')
      if (!selectedLlm) {
        throw new Error('未选择LLM类型')
      }

      let config: LlmResponseConfig

      switch (selectedLlm) {
        case 'metadoc': {
          const token = localStorage.getItem('loginToken')
          const modelName = await getSetting('metadocSelectedModel')
          if (!token || !verifyToken(token)) {
            throw new Error('请先登录MetaDoc账户')
          }
          const metadocConfig = await getMetaDocLlmConfig(token, modelName)
          if (!metadocConfig) {
            throw new Error('获取MetaDoc配置失败')
          }
          const enableMaxTokens = (await getSetting('metadocEnableMaxTokens')) ?? false
          const maxTokens = (await getSetting('metadocMaxTokens')) || 4096
          config = {
            apiUrl: metadocConfig.apiUrl || '',
            apiKey: metadocConfig.apiKey,
            model: modelName || '',
            type: 'metadoc',
            chatSuffix: metadocConfig.chatSuffix || '',
            completionSuffix: metadocConfig.completionSuffix || '',
            enableMaxTokens,
            maxTokens
          }
          break
        }
        case 'openai': {
          const enableMaxTokens = (await getSetting('openaiEnableMaxTokens')) ?? false
          const maxTokens = (await getSetting('openaiMaxTokens')) || 4096
          config = {
            apiUrl: (await getSetting('openaiApiUrl')) || 'https://api.openai.com/v1',
            apiKey: (await getSetting('openaiApiKey')) || '',
            model: (await getSetting('openaiSelectedModel')) || '',
            type: 'openai',
            chatSuffix: '/chat/completions',
            completionSuffix: '/completions',
            enableMaxTokens,
            maxTokens
          }
          break
        }
        case 'openai-official': {
          const enableMaxTokens = (await getSetting('openaiOfficialEnableMaxTokens')) ?? false
          const maxTokens = (await getSetting('openaiOfficialMaxTokens')) || 4096
          config = {
            apiUrl: 'https://api.openai.com/v1',
            apiKey: (await getSetting('openaiOfficialApiKey')) || '',
            model: (await getSetting('openaiOfficialSelectedModel')) || '',
            type: 'openai-official',
            chatSuffix: '',
            completionSuffix: '',
            enableMaxTokens,
            maxTokens
          }
          break
        }
        case 'deepseek': {
          const enableMaxTokens = (await getSetting('deepseekEnableMaxTokens')) ?? false
          const maxTokens = (await getSetting('deepseekMaxTokens')) || 4096
          config = {
            apiUrl: 'https://api.deepseek.com',
            apiKey: (await getSetting('deepseekApiKey')) || '',
            model: (await getSetting('deepseekSelectedModel')) || 'deepseek-chat',
            type: 'deepseek',
            chatSuffix: '',
            completionSuffix: '',
            enableMaxTokens,
            maxTokens
          }
          break
        }
        case 'gemini': {
          const enableMaxTokens = (await getSetting('geminiEnableMaxTokens')) ?? false
          const maxTokens = (await getSetting('geminiMaxTokens')) || 4096
          config = {
            apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
            apiKey: (await getSetting('geminiApiKey')) || '',
            model: (await getSetting('geminiSelectedModel')) || 'gemini-2.5-flash',
            type: 'gemini',
            chatSuffix: '',
            completionSuffix: '',
            enableMaxTokens,
            maxTokens
          }
          break
        }
        case 'qwen': {
          const enableMaxTokens = (await getSetting('qwenEnableMaxTokens')) ?? false
          const maxTokens = (await getSetting('qwenMaxTokens')) || 4096
          config = {
            apiUrl:
              (await getSetting('qwenApiUrl')) ||
              'https://dashscope.aliyuncs.com/compatible-mode/v1',
            apiKey: (await getSetting('qwenApiKey')) || '',
            model: (await getSetting('qwenSelectedModel')) || 'qwen-plus',
            type: 'qwen',
            chatSuffix: '',
            completionSuffix: '',
            enableMaxTokens,
            maxTokens
          }
          break
        }
        case 'ollama': {
          const enableMaxTokens = (await getSetting('ollamaEnableMaxTokens')) ?? false
          const maxTokens = (await getSetting('ollamaMaxTokens')) || 4096
          config = {
            apiUrl: (await getSetting('ollamaApiUrl')) || 'http://localhost:11434/api',
            apiKey: undefined,
            model: (await getSetting('ollamaSelectedModel')) || '',
            type: 'ollama',
            chatSuffix: '',
            completionSuffix: '',
            enableMaxTokens,
            maxTokens
          }
          break
        }
        case 'manual': {
          // 手动API类型：使用Express服务器的模拟接口
          // manual 类型不使用 max_tokens 配置
          config = {
            apiUrl:
              (await import('../../config/runtime-server').then((m) =>
                m.getRuntimeServerBaseUrl()
              )) + '/api/llm',
            apiKey: undefined,
            model: 'manual-model',
            type: 'manual',
            chatSuffix: '',
            completionSuffix: '',
            enableMaxTokens: false
          }
          break
        }
        default:
          throw new Error(`不支持的LLM类型: ${selectedLlm}`)
      }

      return config
    } catch (error) {
      getLogger().error('获取全局LLM配置失败:', error)
      throw error
    }
  }

  /**
   * 调用LLM API（对话模式）
   */
  static async callChat(
    config: LlmResponseConfig,
    messages: Array<{ role: string; content: string }>,
    options: {
      temperature?: number
      maxTokens?: number
      stream?: boolean
      signal?: AbortSignal
    } = {}
  ): Promise<string> {
    const { temperature, maxTokens: optionsMaxTokens, stream = false, signal } = options

    // 根据配置决定是否使用 max_tokens
    // 如果 enableMaxTokens 为 false，则不传递 max_tokens
    // 如果 enableMaxTokens 为 true，使用配置的 maxTokens 作为上限（如果 options.maxTokens 存在，取两者较小值）
    let effectiveMaxTokens: number | undefined = undefined
    if (config.enableMaxTokens) {
      if (optionsMaxTokens !== undefined && optionsMaxTokens > 0) {
        effectiveMaxTokens = Math.min(optionsMaxTokens, config.maxTokens || 4096)
      } else if (config.maxTokens !== undefined && config.maxTokens > 0) {
        effectiveMaxTokens = config.maxTokens
      }
    }

    try {
      // 对于 Gemini 类型，使用适配器模式
      if (config.type === 'gemini') {
        const adapter = await createAdapterFromSettings(null)

        if (stream) {
          // 流式响应
          if (!adapter.generateChatStream) {
            throw new Error('Gemini适配器不支持流式对话')
          }
          let fullText = ''
          const stream = adapter.generateChatStream(
            messages,
            {
              temperature,
              ...(effectiveMaxTokens !== undefined && { max_tokens: effectiveMaxTokens })
            },
            signal
          )

          for await (const { delta } of stream) {
            if (delta) {
              fullText += delta
            }
          }
          return fullText
        } else {
          // 非流式响应
          if (!adapter.generateChatNonStream) {
            throw new Error('Gemini适配器不支持非流式对话')
          }

          // 添加调试日志：检查传入的消息
          getLogger().debug('调用 Gemini generateChatNonStream', {
            messagesCount: messages.length,
            firstMessage: messages[0]
              ? {
                  role: messages[0].role,
                  contentLength:
                    typeof messages[0].content === 'string'
                      ? messages[0].content.length
                      : 'not string',
                  contentPreview:
                    typeof messages[0].content === 'string'
                      ? messages[0].content.substring(0, 100)
                      : messages[0].content
                }
              : null,
            temperature,
            maxTokens: effectiveMaxTokens
          })

          const { text } = await adapter.generateChatNonStream(
            messages,
            {
              temperature,
              ...(effectiveMaxTokens !== undefined && { max_tokens: effectiveMaxTokens })
            },
            signal
          )

          getLogger().debug('Gemini generateChatNonStream 返回', {
            textLength: text.length,
            textPreview: text.substring(0, 100)
          })

          return text
        }
      }

      let url: string
      let payload: any

      if (
        config.type === 'openai-compatible' ||
        config.type === 'openai' ||
        config.type === 'openai-official' ||
        config.type === 'deepseek' ||
        config.type === 'metadoc'
      ) {
        // OpenAI 兼容格式
        url = `${config.apiUrl}${config.chatSuffix || '/chat/completions'}`
        payload = {
          model: config.model,
          messages,
          stream,
          ...(temperature !== undefined && { temperature }),
          ...(effectiveMaxTokens !== undefined && { max_tokens: effectiveMaxTokens })
        }
      } else if (config.type === 'ollama') {
        // Ollama 格式
        url = `${config.apiUrl}/chat`
        payload = {
          model: config.model,
          messages,
          stream,
          ...(temperature !== undefined && { temperature }),
          ...(effectiveMaxTokens !== undefined && { num_predict: effectiveMaxTokens })
        }
      } else if (config.type === 'manual') {
        // Manual 格式：使用Express服务器的模拟接口
        url = `${config.apiUrl}/chat/completions`
        payload = {
          model: config.model,
          messages,
          stream,
          ...(temperature !== undefined && { temperature }),
          ...(effectiveMaxTokens !== undefined && { max_tokens: effectiveMaxTokens })
        }
      } else {
        throw new Error(`不支持的LLM类型: ${config.type}`)
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`
      }

      if (stream) {
        // 流式响应
        return await this.callStream(url, payload, headers, signal)
      } else {
        // 非流式响应
        return await this.callNonStream(url, payload, headers, signal)
      }
    } catch (error) {
      getLogger().error('调用LLM API失败:', error)
      throw error
    }
  }

  /**
   * 调用LLM API（补全模式）
   */
  static async callCompletion(
    config: LlmResponseConfig,
    prompt: string,
    options: {
      temperature?: number
      maxTokens?: number
      stream?: boolean
      signal?: AbortSignal
    } = {}
  ): Promise<string> {
    const { temperature, maxTokens: optionsMaxTokens, stream = false, signal } = options

    // 根据配置决定是否使用 max_tokens
    // 如果 enableMaxTokens 为 false，则不传递 max_tokens
    // 如果 enableMaxTokens 为 true，使用配置的 maxTokens 作为上限（如果 options.maxTokens 存在，取两者较小值）
    let effectiveMaxTokens: number | undefined = undefined
    if (config.enableMaxTokens) {
      if (optionsMaxTokens !== undefined && optionsMaxTokens > 0) {
        effectiveMaxTokens = Math.min(optionsMaxTokens, config.maxTokens || 4096)
      } else if (config.maxTokens !== undefined && config.maxTokens > 0) {
        effectiveMaxTokens = config.maxTokens
      }
    }

    try {
      // 对于 Gemini 类型，使用适配器模式
      if (config.type === 'gemini') {
        const adapter = await createAdapterFromSettings(null)

        if (stream) {
          // 流式响应
          if (!adapter.generateContentStream) {
            throw new Error('Gemini适配器不支持流式补全')
          }
          let fullText = ''
          const stream = adapter.generateContentStream(
            prompt,
            {
              temperature,
              ...(effectiveMaxTokens !== undefined && { max_tokens: effectiveMaxTokens })
            },
            signal
          )

          for await (const { delta } of stream) {
            if (delta) {
              fullText += delta
            }
          }
          return fullText
        } else {
          // 非流式响应
          if (!adapter.generateContentNonStream) {
            throw new Error('Gemini适配器不支持非流式补全')
          }
          const { text } = await adapter.generateContentNonStream(
            prompt,
            {
              temperature,
              ...(effectiveMaxTokens !== undefined && { max_tokens: effectiveMaxTokens })
            },
            signal
          )
          return text
        }
      }

      let url: string
      let payload: any

      if (
        config.type === 'openai-compatible' ||
        config.type === 'openai' ||
        config.type === 'openai-official' ||
        config.type === 'deepseek' ||
        config.type === 'metadoc'
      ) {
        // OpenAI 兼容格式
        url = `${config.apiUrl}${config.completionSuffix || '/completions'}`
        payload = {
          model: config.model,
          prompt,
          stream,
          ...(temperature !== undefined && { temperature }),
          ...(effectiveMaxTokens !== undefined && { max_tokens: effectiveMaxTokens })
        }
      } else if (config.type === 'ollama') {
        // Ollama 格式
        url = `${config.apiUrl}/generate`
        payload = {
          model: config.model,
          prompt,
          stream,
          ...(temperature !== undefined && { temperature }),
          ...(effectiveMaxTokens !== undefined && { num_predict: effectiveMaxTokens })
        }
      } else if (config.type === 'manual') {
        // Manual 格式：使用Express服务器的模拟接口
        url = `${config.apiUrl}/completions`
        payload = {
          model: config.model,
          prompt,
          stream,
          ...(temperature !== undefined && { temperature }),
          ...(effectiveMaxTokens !== undefined && { max_tokens: effectiveMaxTokens })
        }
      } else {
        throw new Error(`不支持的LLM类型: ${config.type}`)
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`
      }

      if (stream) {
        // 流式响应
        return await this.callStream(url, payload, headers, signal)
      } else {
        // 非流式响应
        return await this.callNonStream(url, payload, headers, signal)
      }
    } catch (error) {
      getLogger().error('调用LLM API失败:', error)
      throw error
    }
  }

  /**
   * 非流式请求
   */
  private static async callNonStream(
    url: string,
    payload: any,
    headers: Record<string, string>,
    signal?: AbortSignal
  ): Promise<string> {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`LLM API错误: ${response.status} ${errorText}`)
    }

    const data = await response.json()

    // 提取响应文本
    if (data.choices && data.choices[0]) {
      if (data.choices[0].message) {
        return data.choices[0].message.content || ''
      } else if (data.choices[0].text) {
        return data.choices[0].text || ''
      }
    }

    if (data.response) {
      return data.response
    }

    throw new Error('无法解析LLM响应')
  }

  /**
   * 流式请求
   */
  private static async callStream(
    url: string,
    payload: any,
    headers: Record<string, string>,
    signal?: AbortSignal
  ): Promise<string> {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`LLM API错误: ${response.status} ${errorText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法获取响应流')
    }

    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const json = JSON.parse(data)
            if (json.choices && json.choices[0]) {
              if (json.choices[0].delta) {
                const content = json.choices[0].delta.content
                if (content) fullText += content
              } else if (json.choices[0].text) {
                fullText += json.choices[0].text
              }
            }
          } catch (e) {
            // 忽略JSON解析错误
          }
        }
      }
    }

    return fullText
  }

  /**
   * 通过createAiTask调用LLM API（对话模式）
   * 这是推荐的调用方式，确保所有LLM调用都通过任务队列
   */
  static async callChatViaTask(
    config: LlmResponseConfig,
    messages: Array<{
      role: string
      content: string | null
      tool_calls?: any
      tool_call_id?: string
      name?: string
    }>,
    options: {
      temperature?: number
      maxTokens?: number
      stream?: boolean
      signal?: AbortSignal
      taskName?: string
      originKey?: string
      reactiveMessage?: { markdown?: string; content?: string } // 可选的响应式消息对象，用于实时更新
      onTaskCreated?: (handle: string) => void // 任务创建时的回调，用于保存handle
      /** 引擎工具列表（与 getAvailableTools() 一致）；与 onToolCallsDetected 同时提供时走 AI SDK 原生 tools 路径 */
      tools?: EngineToolSpec[]
      onToolCallsDetected?: (
        toolCalls: Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }>
      ) => Promise<void> // 工具调用检测回调
    } = {}
  ): Promise<string> {
    const {
      temperature,
      maxTokens: optionsMaxTokens,
      stream = false,
      signal,
      taskName = 'Agent LLM调用',
      originKey,
      reactiveMessage,
      onTaskCreated,
      tools: optionsTools,
      onToolCallsDetected
    } = options

    // 根据配置决定是否使用 max_tokens
    // 如果 enableMaxTokens 为 false，则不传递 max_tokens (传递 undefined)
    // 如果 enableMaxTokens 为 true，使用配置的 maxTokens 作为上限（如果 options.maxTokens 存在，取两者较小值）
    let effectiveMaxTokens: number | undefined = undefined
    if (config.enableMaxTokens) {
      if (optionsMaxTokens !== undefined && optionsMaxTokens > 0) {
        effectiveMaxTokens = Math.min(optionsMaxTokens, config.maxTokens || 4096)
      } else if (config.maxTokens !== undefined && config.maxTokens > 0) {
        effectiveMaxTokens = config.maxTokens
      }
    }

    // 准备自定义LLM配置（如果使用的是自定义配置）
    let customLlmConfig: CustomLlmConfigForTask | undefined = undefined
    if (config.type === 'openai-compatible') {
      customLlmConfig = {
        baseUrl: config.apiUrl,
        apiKey: config.apiKey,
        model: config.model,
        temperature,
        maxTokens: effectiveMaxTokens,
        type: 'openai-compatible'
      }
    }

    // 清理消息格式，确保符合API规范
    // 使用统一的sanitizeMessages函数，确保所有消息格式正确
    // 特别是确保tool消息的content是字符串，而不是对象

    // 记录原始消息格式（用于调试）
    // 检查系统提示词中是否包含格式警告
    const systemMessage = messages.find((msg: any) => msg.role === 'system')
    if (systemMessage && systemMessage.content) {
      const systemContent = systemMessage.content as string
      const hasFormatWarning = systemContent.includes('⚠️ 重要：当前文档是')
      const hasMarkdownWarning = systemContent.includes('Markdown 格式')
      const hasLatexWarning = systemContent.includes('LaTeX 格式')

      getLogger().info('[callChatViaTask] 系统提示词格式检测', {
        hasSystemMessage: !!systemMessage,
        systemContentLength: systemContent.length,
        hasFormatWarning,
        hasMarkdownWarning,
        hasLatexWarning,
        formatWarningPreview: hasFormatWarning
          ? systemContent.substring(
              Math.max(0, systemContent.indexOf('⚠️ 重要：当前文档是') - 50),
              Math.min(systemContent.length, systemContent.indexOf('⚠️ 重要：当前文档是') + 200)
            )
          : '未找到格式警告',
        systemContentPreview: systemContent.substring(0, 1000) // 前1000字符预览
      })
    } else {
      getLogger().warn('[callChatViaTask] ⚠️ 未找到系统消息或系统消息内容为空', {
        hasSystemMessage: !!systemMessage,
        systemMessageContent: systemMessage?.content
      })
    }

    getLogger().debug('[callChatViaTask] 原始消息格式:', {
      messageCount: messages.length,
      messages: messages.map((msg, idx) => ({
        index: idx,
        role: msg.role,
        contentType: typeof msg.content,
        hasToolCalls: !!(msg as any).tool_calls,
        toolCallId: (msg as any).tool_call_id,
        toolCalls: (msg as any).tool_calls
          ? (msg as any).tool_calls.map((tc: any) => ({
              id: tc.id,
              type: tc.type,
              functionName: tc.function?.name,
              argumentsType: typeof tc.function?.arguments
            }))
          : undefined
      }))
    })

    const sanitizedMessages = sanitizeMessages(messages)

    // 记录清理后的消息格式（用于调试）
    getLogger().debug('[callChatViaTask] 清理后的消息格式:', {
      messageCount: sanitizedMessages.length,
      messages: sanitizedMessages.map((msg: any, idx: number) => ({
        index: idx,
        role: msg.role,
        contentType: typeof msg.content,
        hasToolCalls: !!msg.tool_calls,
        toolCallId: msg.tool_call_id,
        toolCalls: msg.tool_calls
          ? msg.tool_calls.map((tc: any) => ({
              id: tc.id,
              type: tc.type,
              functionName: tc.function?.name,
              argumentsType: typeof tc.function?.arguments,
              argumentsIsObject: typeof tc.function?.arguments === 'object'
            }))
          : undefined
      }))
    })

    // 创建一个ref来存储结果
    const resultRef = ref('')

    // 生成唯一的originKey（如果没有提供）
    const uniqueOriginKey =
      originKey || `agent-llm-call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // 宽松解析工具调用（不需要完整的end标记，用于兜底机制）
    // 使用统一的工具调用处理工具
    const parseToolCallsFromContentLoose = (
      content: string
    ): Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }> | null => {
      try {
        getLogger().debug(
          '[parseToolCallsFromContentLoose] 开始宽松解析工具调用，内容长度:',
          content.length
        )

        // 使用统一的工具调用解析函数（宽松模式）
        const parsedToolCalls = parseToolCalls(content, {
          loose: true, // 宽松模式：允许没有结束标记
          validateToolId: false // 不在这里验证
        })

        if (!parsedToolCalls || parsedToolCalls.length === 0) {
          return null
        }

        // 转换格式并处理无效的工具调用
        const toolCalls: Array<{
          id: string
          tool_id: string
          parameters: Record<string, unknown>
        }> = []

        for (const parsed of parsedToolCalls) {
          if (parsed.isValid) {
            // 有效的工具调用
            toolCalls.push({
              id: parsed.id,
              tool_id: parsed.tool_id,
              parameters: parsed.parameters
            })
          } else {
            // 无效的工具调用：使用dummy-tool处理
            getLogger().warn(
              `[parseToolCallsFromContentLoose] 检测到无效的工具调用，使用dummy-tool处理:`,
              parsed.error
            )
            toolCalls.push({
              id: parsed.id,
              tool_id: 'dummy-tool',
              parameters: parsed.parameters // 包含错误信息
            })
          }
        }

        getLogger().debug(
          `[parseToolCallsFromContentLoose] ✅ 宽松解析完成，找到 ${toolCalls.length} 个工具调用（有效: ${parsedToolCalls.filter((p) => p.isValid).length}, 无效: ${parsedToolCalls.filter((p) => !p.isValid).length}）`,
          {
            toolCalls: toolCalls.map((tc) => ({ tool_id: tc.tool_id, parameters: tc.parameters }))
          }
        )
        return toolCalls.length > 0 ? toolCalls : null
      } catch (error) {
        getLogger().error(
          '[parseToolCallsFromContentLoose] ❌ 宽松解析标记格式工具调用失败:',
          error
        )
        return null
      }
    }

    // 解析标记格式的工具调用（与agent-engine-executor.ts中的逻辑一致）
    // 使用统一的工具调用处理工具
    const parseToolCallsFromContent = (
      content: string
    ): Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }> | null => {
      try {
        getLogger().debug(
          '[parseToolCallsFromContent] 开始解析工具调用，内容长度:',
          content.length,
          {
            contentPreview: content.substring(Math.max(0, content.length - 500))
          }
        )

        // 使用统一的工具调用解析函数（严格模式）
        const parsedToolCalls = parseToolCalls(content, {
          loose: false, // 严格模式：需要完整的结束标记
          validateToolId: false // 不在这里验证
        })

        if (!parsedToolCalls || parsedToolCalls.length === 0) {
          return null
        }

        // 转换格式并处理无效的工具调用
        const toolCalls: Array<{
          id: string
          tool_id: string
          parameters: Record<string, unknown>
        }> = []

        for (const parsed of parsedToolCalls) {
          if (parsed.isValid) {
            // 有效的工具调用
            toolCalls.push({
              id: parsed.id,
              tool_id: parsed.tool_id,
              parameters: parsed.parameters
            })
          } else {
            // 无效的工具调用：使用dummy-tool处理
            getLogger().warn(
              `[parseToolCallsFromContent] 检测到无效的工具调用，使用dummy-tool处理:`,
              parsed.error
            )
            toolCalls.push({
              id: parsed.id,
              tool_id: 'dummy-tool',
              parameters: parsed.parameters // 包含错误信息
            })
          }
        }

        getLogger().debug(
          `[parseToolCallsFromContent] ✅ 解析完成，找到 ${toolCalls.length} 个工具调用（有效: ${parsedToolCalls.filter((p) => p.isValid).length}, 无效: ${parsedToolCalls.filter((p) => !p.isValid).length}）`,
          {
            toolCalls: toolCalls.map((tc) => ({ tool_id: tc.tool_id, parameters: tc.parameters }))
          }
        )
        return toolCalls.length > 0 ? toolCalls : null
      } catch (error) {
        getLogger().error('[parseToolCallsFromContent] ❌ 解析标记格式工具调用失败:', error)
        return null
      }
    }

    // 用于跟踪已经处理过的工具调用ID（避免重复处理）
    const processedToolCallIds = new Set<string>()
    // 按签名跨 watch 与 fallback 去重，避免同一逻辑调用被触发多次（解析每次生成新 id）
    const processedToolCallSignatures = new Set<string>()
    const getToolCallSignature = (tc: {
      tool_id: string
      parameters: Record<string, unknown>
    }): string => {
      const canonicalParams =
        typeof tc.parameters === 'object' && tc.parameters !== null
          ? JSON.stringify(tc.parameters, Object.keys(tc.parameters).sort())
          : JSON.stringify(tc.parameters)
      return `${tc.tool_id}:${canonicalParams}`
    }
    // 记录最后一个已处理工具调用的结束位置（用于只解析新内容，避免重复解析）
    let lastProcessedEndIndex = 0

    // 记录初始状态
    getLogger().debug('[callChatViaTask] 初始化工具调用检测:', {
      hasReactiveMessage: !!reactiveMessage,
      stream,
      hasOnToolCallsDetected: !!onToolCallsDetected,
      taskName
    })

    // 如果提供了reactiveMessage且是流式输出，设置watch实时更新
    let stopWatcher: (() => void) | null = null
    if (reactiveMessage && stream) {
      getLogger().debug('[callChatViaTask] 设置watch监听resultRef变化，准备检测工具调用')

      stopWatcher = watch(
        resultRef,
        async (newValue, oldValue) => {
          // 更新响应式消息对象的markdown或content属性
          if ('markdown' in reactiveMessage) {
            reactiveMessage.markdown = newValue
          } else if ('content' in reactiveMessage) {
            reactiveMessage.content = newValue
          }

          // 检测工具调用标记（仅在流式输出、提供回调、且未走原生 tools 路径时）
          // 当 meta.tools 存在时由 continueConversationWithTools 通过 SDK 上报工具调用，此处仅更新 UI
          if (onToolCallsDetected && !(Array.isArray(optionsTools) && optionsTools.length > 0)) {
            // 检查是否有完整的工具调用标记块（必须同时包含开始和结束标记）
            const toolCallsBeginPattern = /<tool_call>/i
            const toolCallsEndPattern = /<\/tool_call>/i

            const hasBegin = toolCallsBeginPattern.test(newValue)
            const hasEnd = toolCallsEndPattern.test(newValue)

            if (hasBegin && hasEnd) {
              // 检测到完整的工具调用标记块，解析并触发回调
              // 但需要验证JSON是否完整（避免在流式输出过程中解析不完整的JSON）
              const beginIndex = newValue.lastIndexOf('<tool_call>')
              const endIndex = newValue.lastIndexOf('</tool_call>')

              if (beginIndex !== -1 && endIndex !== -1 && endIndex > beginIndex) {
                const toolCallBlock = newValue
                  .substring(beginIndex + '<tool_call>'.length, endIndex)
                  .trim()

                // 检查JSON是否看起来完整（有开始和结束括号，且括号匹配）
                const hasJsonStart = /[{[]/.test(toolCallBlock)
                const openBraces = (toolCallBlock.match(/{/g) || []).length
                const closeBraces = (toolCallBlock.match(/}/g) || []).length
                const openBrackets = (toolCallBlock.match(/\[/g) || []).length
                const closeBrackets = (toolCallBlock.match(/\]/g) || []).length

                // 只有当括号匹配时才认为JSON可能完整
                const bracesMatch = openBraces === closeBraces
                const bracketsMatch = openBrackets === closeBrackets

                if (hasJsonStart && bracesMatch && bracketsMatch) {
                  // 只解析从上次处理位置之后的新内容，避免重复解析
                  const contentToParse = newValue.substring(lastProcessedEndIndex)

                  getLogger().debug(
                    '[callChatViaTask] ✅ 检测到完整的工具调用标记块，开始解析新内容...',
                    {
                      contentLength: newValue.length,
                      lastProcessedEndIndex,
                      newContentLength: contentToParse.length,
                      toolCallBlockLength: toolCallBlock.length,
                      contentSnippet: toolCallBlock.substring(
                        0,
                        Math.min(200, toolCallBlock.length)
                      ),
                      processedCount: processedToolCallIds.size
                    }
                  )

                  // 只解析新内容中的工具调用
                  const allToolCalls = parseToolCallsFromContent(contentToParse)
                  if (allToolCalls && allToolCalls.length > 0) {
                    // 找到最后一个工具调用的结束位置（在原内容中的位置）
                    // 需要在原内容中查找最后一个工具调用的结束标记
                    let maxEndIndex = lastProcessedEndIndex
                    const toolCallEndPattern = /<\/tool_call>/gi
                    let match
                    while ((match = toolCallEndPattern.exec(contentToParse)) !== null) {
                      const endIndexInNewContent = match.index + match[0].length
                      const endIndexInFullContent = lastProcessedEndIndex + endIndexInNewContent
                      maxEndIndex = Math.max(maxEndIndex, endIndexInFullContent)
                    }

                    // 基于工具调用的内容生成稳定的ID（用于去重）
                    // 由于工具调用ID是动态生成的，我们需要基于工具ID和参数来去重
                    const toolCallSignatures = new Set<string>()
                    const newToolCalls: Array<{
                      id: string
                      tool_id: string
                      parameters: Record<string, unknown>
                    }> = []

                    for (const tc of allToolCalls) {
                      const signature = getToolCallSignature(tc)
                      if (processedToolCallSignatures.has(signature)) {
                        getLogger().debug(
                          '[callChatViaTask] 跳过已处理过的工具调用（跨轮签名去重）:',
                          { tool_id: tc.tool_id, signature }
                        )
                        continue
                      }
                      if (!toolCallSignatures.has(signature)) {
                        toolCallSignatures.add(signature)
                        newToolCalls.push(tc)
                      } else {
                        getLogger().debug('[callChatViaTask] 跳过重复的工具调用（基于签名）:', {
                          tool_id: tc.tool_id,
                          signature
                        })
                      }
                    }

                    if (newToolCalls.length > 0) {
                      // 更新最后处理位置
                      lastProcessedEndIndex = maxEndIndex

                      // 标记为已处理（ID + 签名，签名用于 fallback 时不再重复触发）
                      newToolCalls.forEach((tc) => {
                        processedToolCallIds.add(tc.id)
                        processedToolCallSignatures.add(getToolCallSignature(tc))
                      })

                      getLogger().debug(
                        '[callChatViaTask] ✅✅✅ 发现新的工具调用，准备触发回调:',
                        {
                          newToolCallsCount: newToolCalls.length,
                          totalToolCallsCount: allToolCalls.length,
                          processedCount: processedToolCallIds.size,
                          newLastProcessedEndIndex: lastProcessedEndIndex,
                          newToolCalls: newToolCalls.map((tc) => ({
                            id: tc.id,
                            tool_id: tc.tool_id,
                            params: Object.keys(tc.parameters)
                          }))
                        }
                      )

                      try {
                        await onToolCallsDetected(newToolCalls)
                        getLogger().debug('[callChatViaTask] ✅✅✅ 工具调用回调执行成功')
                      } catch (error) {
                        getLogger().error('[callChatViaTask] ❌ 工具调用回调执行失败:', error)
                        // 如果回调失败，回滚处理位置，以便重试
                        // 注意：这里不重置lastProcessedEndIndex，因为内容已经解析了
                        // 如果重置，可能会导致重复解析。失败的工具调用会在兜底机制中处理
                      }
                    } else {
                      // 即使没有新工具调用，也要更新处理位置（避免重复解析）
                      lastProcessedEndIndex = maxEndIndex
                      getLogger().debug('[callChatViaTask] 所有工具调用都已处理过，跳过', {
                        totalToolCallsCount: allToolCalls.length,
                        processedCount: processedToolCallIds.size,
                        newLastProcessedEndIndex: lastProcessedEndIndex
                      })
                    }
                  } else {
                    getLogger().debug(
                      '[callChatViaTask] 检测到工具调用标记，但解析失败，可能JSON不完整，等待更多内容...'
                    )
                  }
                } else {
                  getLogger().debug(
                    '[callChatViaTask] 检测到工具调用标记，但JSON可能不完整，等待更多内容...',
                    {
                      bracesMatch,
                      bracketsMatch,
                      openBraces,
                      closeBraces,
                      openBrackets,
                      closeBrackets,
                      toolCallBlockLength: toolCallBlock.length
                    }
                  )
                }
              }
            } else if (hasBegin && !hasEnd) {
              // 只有开始标记，还没有结束标记，等待完整块
            }
          } else if (!onToolCallsDetected) {
            // 只在第一次记录，避免日志过多
            // if (newValue.length < 100) {
            //   getLogger().debug('[callChatViaTask] watch触发，但onToolCallsDetected未提供')
            // }
          }
        },
        { immediate: true }
      )

      getLogger().debug('[callChatViaTask] watch已设置完成')
    } else {
      getLogger().warn('[callChatViaTask] ⚠️ 未设置watch监听:', {
        hasReactiveMessage: !!reactiveMessage,
        stream,
        reason: !reactiveMessage ? '缺少reactiveMessage' : !stream ? '非流式输出' : '未知原因'
      })
    }

    try {
      // 使用createAiTask调用LLM
      const useNativeTools =
        Array.isArray(optionsTools) &&
        optionsTools.length > 0 &&
        typeof onToolCallsDetected === 'function'
      const { handle, done } = createAiTask(
        taskName,
        sanitizedMessages as AIDialogMessage[],
        resultRef,
        ai_types.chat,
        uniqueOriginKey,
        {
          stream,
          temperature,
          maxTokens: effectiveMaxTokens,
          customLlmConfig,
          ...(useNativeTools && {
            tools: optionsTools,
            onToolCallsDetected,
            reactiveMessage
          })
        }
      )

      // 如果有回调，通知调用者任务已创建
      if (onTaskCreated) {
        onTaskCreated(handle)
      }

      // 如果提供了signal，监听取消事件
      if (signal) {
        signal.addEventListener('abort', () => {
          // 取消任务
          cancelAiTask(handle, false)
          if (stopWatcher) {
            stopWatcher()
          }
        })
      }

      // 等待任务完成
      await done

      // 停止watch（如果有）
      if (stopWatcher) {
        stopWatcher()
      }

      // 兜底：确保 reactiveMessage 与 resultRef 最终一致（避免 watch 漏更新导致界面不显示流式内容）
      if (reactiveMessage) {
        if ('markdown' in reactiveMessage) {
          reactiveMessage.markdown = resultRef.value
        } else if ('content' in reactiveMessage) {
          reactiveMessage.content = resultRef.value
        }
      }

      // 原生 tools 路径兜底：SDK 有时（如第二轮）不通过 tool-input-available/result.toolCalls 上报，
      // 若响应文本中含 <tool_call>，解析并上报，避免“有工具调用但未执行、会话直接结束”
      if (useNativeTools && onToolCallsDetected && resultRef.value) {
        let parsedFromText = parseToolCallsFromContent(resultRef.value)
        if (!parsedFromText || parsedFromText.length === 0) {
          parsedFromText = parseToolCallsFromContentLoose(resultRef.value)
        }
        if (parsedFromText && parsedFromText.length > 0) {
          getLogger().debug('[callChatViaTask] 原生 tools 兜底：从响应文本解析到工具调用', {
            count: parsedFromText.length,
            toolIds: parsedFromText.map((tc) => tc.tool_id)
          })
          try {
            await onToolCallsDetected(parsedFromText)
          } catch (err) {
            getLogger().error('[callChatViaTask] 原生 tools 兜底回调失败', err)
          }
        }
      }

      // 如果流式输出完成，再次检查是否有未处理的工具调用（兜底机制；非原生 tools 路径才解析文本）
      if (onToolCallsDetected && !(Array.isArray(optionsTools) && optionsTools.length > 0)) {
        getLogger().debug(
          '[callChatViaTask] 流式输出完成，检查最终结果中是否包含未处理的工具调用:',
          {
            resultLength: resultRef.value.length,
            hasBegin: /<tool_call>/i.test(resultRef.value),
            hasEnd: /<\/tool_call>/i.test(resultRef.value),
            processedCount: processedToolCallIds.size
          }
        )

        // 只解析从上次处理位置之后的新内容（兜底机制）
        const contentToParse = resultRef.value.substring(lastProcessedEndIndex)

        // 首先尝试标准解析（需要完整的begin和end标记）
        let allToolCalls = parseToolCallsFromContent(contentToParse)

        // 如果标准解析失败，尝试宽松解析（不需要完整的end标记）
        if (!allToolCalls || allToolCalls.length === 0) {
          getLogger().debug('[callChatViaTask] 标准解析失败，尝试宽松解析（不需要完整end标记）')
          allToolCalls = parseToolCallsFromContentLoose(contentToParse)
        }

        if (allToolCalls && allToolCalls.length > 0) {
          // 与 watch 一致：先按签名去重（同批内 + 跨轮已处理）
          const toolCallSignatures = new Set<string>()
          const newToolCalls: Array<{
            id: string
            tool_id: string
            parameters: Record<string, unknown>
          }> = []

          for (const tc of allToolCalls) {
            const signature = getToolCallSignature(tc)
            if (processedToolCallSignatures.has(signature)) {
              getLogger().debug(
                '[callChatViaTask] 兜底解析跳过已处理过的工具调用（跨轮签名去重）:',
                { tool_id: tc.tool_id, signature }
              )
              continue
            }
            if (!toolCallSignatures.has(signature)) {
              toolCallSignatures.add(signature)
              newToolCalls.push(tc)
            } else {
              getLogger().debug('[callChatViaTask] 跳过重复的工具调用（基于签名）:', {
                tool_id: tc.tool_id,
                signature
              })
            }
          }

          if (newToolCalls.length > 0) {
            // 更新最后处理位置（整个内容都已处理）
            lastProcessedEndIndex = resultRef.value.length

            // 标记为已处理（ID + 签名）
            newToolCalls.forEach((tc) => {
              processedToolCallIds.add(tc.id)
              processedToolCallSignatures.add(getToolCallSignature(tc))
            })

            getLogger().debug('[callChatViaTask] ✅ 流式输出完成，发现未处理的工具调用:', {
              newToolCallsCount: newToolCalls.length,
              totalToolCallsCount: allToolCalls.length,
              processedCount: processedToolCallIds.size,
              lastProcessedEndIndex,
              newToolCalls: newToolCalls.map((tc) => ({
                id: tc.id,
                tool_id: tc.tool_id,
                params: Object.keys(tc.parameters)
              }))
            })
            try {
              await onToolCallsDetected(newToolCalls)
              getLogger().debug('[callChatViaTask] ✅ 工具调用回调执行成功')

              // 注意：不删除markdown中的工具调用标记
              // 原因：
              // 1. AI需要看到这些内容来理解上下文（在buildHistoryMessages中会使用）
              // 2. UI层面（AgentMessageRenderer）已经有逻辑：如果有tool_calls，就不显示markdown，而是显示友好的提示
              // 3. 这样既保证了AI能看到完整上下文，又保证了用户看到的是友好的UI提示
            } catch (error) {
              getLogger().error('[callChatViaTask] ❌ 工具调用回调执行失败:', error)
              // 如果回调失败，不回滚lastProcessedEndIndex，避免重复解析
            }
          } else {
            // 即使没有新工具调用，也要更新处理位置
            lastProcessedEndIndex = resultRef.value.length
            getLogger().debug('[callChatViaTask] 流式输出完成，所有工具调用都已处理过', {
              totalToolCallsCount: allToolCalls.length,
              processedCount: processedToolCallIds.size,
              lastProcessedEndIndex
            })
          }
        } else {
          if (processedToolCallIds.size === 0) {
            getLogger().warn('[callChatViaTask] ⚠️ 流式输出完成，但未找到工具调用或解析失败', {
              resultPreview: resultRef.value.substring(Math.max(0, resultRef.value.length - 300))
            })
          } else {
            getLogger().debug(
              '[callChatViaTask] 流式输出完成，未找到新的工具调用（已处理过一些）',
              {
                processedCount: processedToolCallIds.size
              }
            )
          }
        }
      } else if (!onToolCallsDetected) {
        getLogger().debug('[callChatViaTask] 流式输出完成，但onToolCallsDetected未提供')
      }

      // 返回结果
      return resultRef.value || ''
    } catch (error) {
      // 停止watch（如果有）
      if (stopWatcher) {
        stopWatcher()
      }
      getLogger().error('通过createAiTask调用LLM失败:', error)
      throw error
    }
  }
}
