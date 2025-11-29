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
  type: 'openai' | 'ollama' | 'metadoc' | 'openai-official' | 'deepseek' | 'openai-compatible'
  chatSuffix?: string
  completionSuffix?: string
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
          config = {
            apiUrl: metadocConfig.apiUrl || '',
            apiKey: metadocConfig.apiKey,
            model: modelName || '',
            type: 'metadoc',
            chatSuffix: metadocConfig.chatSuffix || '',
            completionSuffix: metadocConfig.completionSuffix || ''
          }
          break
        }
        case 'openai': {
          config = {
            apiUrl: (await getSetting('openaiApiUrl')) || 'https://api.openai.com/v1',
            apiKey: (await getSetting('openaiApiKey')) || '',
            model: (await getSetting('openaiSelectedModel')) || '',
            type: 'openai',
            chatSuffix: (await getSetting('openaiChatSuffix')) || '',
            completionSuffix: (await getSetting('openaiCompletionSuffix')) || ''
          }
          break
        }
        case 'openai-official': {
          config = {
            apiUrl: 'https://api.openai.com/v1',
            apiKey: (await getSetting('openaiOfficialApiKey')) || '',
            model: (await getSetting('openaiOfficialSelectedModel')) || '',
            type: 'openai-official',
            chatSuffix: '',
            completionSuffix: ''
          }
          break
        }
        case 'deepseek': {
          config = {
            apiUrl: 'https://api.deepseek.com',
            apiKey: (await getSetting('deepseekApiKey')) || '',
            model: (await getSetting('deepseekSelectedModel')) || 'deepseek-chat',
            type: 'deepseek',
            chatSuffix: '',
            completionSuffix: ''
          }
          break
        }
        case 'ollama': {
          config = {
            apiUrl: (await getSetting('ollamaApiUrl')) || 'http://localhost:11434/api',
            apiKey: undefined,
            model: (await getSetting('ollamaSelectedModel')) || '',
            type: 'ollama',
            chatSuffix: '',
            completionSuffix: ''
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
    const { temperature, maxTokens, stream = false, signal } = options

    try {
      let url: string
      let payload: any

      if (config.type === 'openai-compatible' || 
          config.type === 'openai' || 
          config.type === 'openai-official' ||
          config.type === 'deepseek' ||
          config.type === 'metadoc') {
        // OpenAI 兼容格式
        url = `${config.apiUrl}${config.chatSuffix || '/chat/completions'}`
        payload = {
          model: config.model,
          messages,
          stream,
          ...(temperature !== undefined && { temperature }),
          ...(maxTokens !== undefined && maxTokens > 0 && { max_tokens: maxTokens })
        }
      } else if (config.type === 'ollama') {
        // Ollama 格式
        url = `${config.apiUrl}/chat`
        payload = {
          model: config.model,
          messages,
          stream,
          ...(temperature !== undefined && { temperature }),
          ...(maxTokens !== undefined && maxTokens > 0 && { num_predict: maxTokens })
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
    const { temperature, maxTokens, stream = false, signal } = options

    try {
      let url: string
      let payload: any

      if (config.type === 'openai-compatible' || 
          config.type === 'openai' || 
          config.type === 'openai-official' ||
          config.type === 'deepseek' ||
          config.type === 'metadoc') {
        // OpenAI 兼容格式
        url = `${config.apiUrl}${config.completionSuffix || '/completions'}`
        payload = {
          model: config.model,
          prompt,
          stream,
          ...(temperature !== undefined && { temperature }),
          ...(maxTokens !== undefined && maxTokens > 0 && { max_tokens: maxTokens })
        }
      } else if (config.type === 'ollama') {
        // Ollama 格式
        url = `${config.apiUrl}/generate`
        payload = {
          model: config.model,
          prompt,
          stream,
          ...(temperature !== undefined && { temperature }),
          ...(maxTokens !== undefined && maxTokens > 0 && { num_predict: maxTokens })
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

    while (true) {
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
    messages: Array<{ role: string; content: string | null; tool_calls?: any; tool_call_id?: string; name?: string }>,
    options: {
      temperature?: number
      maxTokens?: number
      stream?: boolean
      signal?: AbortSignal
      taskName?: string
      originKey?: string
      reactiveMessage?: { markdown?: string; content?: string } // 可选的响应式消息对象，用于实时更新
    } = {}
  ): Promise<string> {
    const { temperature, maxTokens, stream = false, signal, taskName = 'Agent LLM调用', originKey, reactiveMessage } = options

    // 准备自定义LLM配置（如果使用的是自定义配置）
    let customLlmConfig: CustomLlmConfigForTask | undefined = undefined
    if (config.type === 'openai-compatible') {
      customLlmConfig = {
        baseUrl: config.apiUrl,
        apiKey: config.apiKey,
        model: config.model,
        temperature,
        maxTokens,
        type: 'openai-compatible',
        chatSuffix: config.chatSuffix || '/chat/completions',
        completionSuffix: config.completionSuffix || '/completions'
      }
    }

    // 清理消息格式，确保符合API规范
    // 使用统一的sanitizeMessages函数，确保所有消息格式正确
    // 特别是确保tool消息的content是字符串，而不是对象
    
    // 记录原始消息格式（用于调试）
    getLogger().debug('[callChatViaTask] 原始消息格式:', {
      messageCount: messages.length,
      messages: messages.map((msg, idx) => ({
        index: idx,
        role: msg.role,
        contentType: typeof msg.content,
        hasToolCalls: !!(msg as any).tool_calls,
        toolCallId: (msg as any).tool_call_id,
        toolCalls: (msg as any).tool_calls ? (msg as any).tool_calls.map((tc: any) => ({
          id: tc.id,
          type: tc.type,
          functionName: tc.function?.name,
          argumentsType: typeof tc.function?.arguments
        })) : undefined
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
        toolCalls: msg.tool_calls ? msg.tool_calls.map((tc: any) => ({
          id: tc.id,
          type: tc.type,
          functionName: tc.function?.name,
          argumentsType: typeof tc.function?.arguments,
          argumentsIsObject: typeof tc.function?.arguments === 'object'
        })) : undefined
      }))
    })

    // 创建一个ref来存储结果
    const resultRef = ref('')
    
    // 生成唯一的originKey（如果没有提供）
    const uniqueOriginKey = originKey || `agent-llm-call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // 如果提供了reactiveMessage且是流式输出，设置watch实时更新
    let stopWatcher: (() => void) | null = null
    if (reactiveMessage && stream) {
    
      stopWatcher = watch(
        resultRef,
        (newValue) => {
          // 更新响应式消息对象的markdown或content属性
          if ('markdown' in reactiveMessage) {
            reactiveMessage.markdown = newValue
          } else if ('content' in reactiveMessage) {
            reactiveMessage.content = newValue
          }
        },
        { immediate: true }
      )
    }

    try {
      // 使用createAiTask调用LLM
      const { handle, done } = createAiTask(
        taskName,
        sanitizedMessages as AIDialogMessage[],
        resultRef,
        ai_types.chat,
        uniqueOriginKey,
        {
          stream,
          temperature,
          maxTokens,
          customLlmConfig
        }
      )

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

