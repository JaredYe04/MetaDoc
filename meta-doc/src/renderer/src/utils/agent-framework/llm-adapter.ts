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
      onTaskCreated?: (handle: string) => void // 任务创建时的回调，用于保存handle
      onToolCallsDetected?: (toolCalls: Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }>) => Promise<void> // 工具调用检测回调
    } = {}
  ): Promise<string> {
    const { temperature, maxTokens, stream = false, signal, taskName = 'Agent LLM调用', originKey, reactiveMessage, onTaskCreated, onToolCallsDetected } = options

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
    
    // 宽松解析工具调用（不需要完整的end标记，用于兜底机制）
    const parseToolCallsFromContentLoose = (content: string): Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }> | null => {
      try {
        getLogger().debug('[parseToolCallsFromContentLoose] 开始宽松解析工具调用，内容长度:', content.length)
        
        // 检查是否有begin标记
        const beginIndex = content.indexOf('<｜tool▁calls▁begin｜>')
        if (beginIndex === -1) {
          return null
        }
        
        // 从begin标记之后开始提取内容（不需要end标记）
        const toolCallsContent = content.substring(beginIndex + '<｜tool▁calls▁begin｜>'.length).trim()
        
        if (!toolCallsContent) {
          return null
        }
        
        getLogger().debug('[parseToolCallsFromContentLoose] ✅ 找到工具调用开始标记，内容长度:', toolCallsContent.length)
        
        const toolCalls: Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }> = []
        
        // 匹配单个工具调用（不需要完整的end标记）
        // 格式: <｜tool▁call▁begin｜>tool_id<｜tool▁sep｜>params（可能没有<｜tool▁call▁end｜>）
        const toolCallPattern = /\<｜tool▁call▁begin｜>([\s\S]*?)\<｜tool▁sep｜>([\s\S]*?)(?:\<｜tool▁call▁end｜>|$)/gi
        
        let match
        let index = 0
        while ((match = toolCallPattern.exec(toolCallsContent)) !== null) {
          const toolId = match[1].trim()
          let paramsStr = match[2].trim()
          
          // 如果参数字符串以<｜tool▁call▁end｜>结尾，移除它
          paramsStr = paramsStr.replace(/\<｜tool▁call▁end｜>[\s\S]*$/, '').trim()
          
          getLogger().debug(`[parseToolCallsFromContentLoose] 解析工具调用 ${index + 1}: toolId=${toolId}, paramsStr长度=${paramsStr.length}`)
          
          // 尝试解析参数JSON
          let parameters: Record<string, unknown> = {}
          try {
            // 先尝试提取JSON字符串（处理可能包含其他文本的情况）
            const jsonStr = extractOuterJsonString(paramsStr)
            if (jsonStr) {
              parameters = JSON.parse(jsonStr)
              getLogger().debug(`[parseToolCallsFromContentLoose] 成功解析JSON参数:`, parameters)
            } else {
              // 如果没有找到JSON，尝试直接解析
              parameters = JSON.parse(paramsStr)
              getLogger().debug(`[parseToolCallsFromContentLoose] 直接解析JSON参数:`, parameters)
            }
          } catch (e) {
            getLogger().warn(`[parseToolCallsFromContentLoose] 解析工具调用参数失败 (工具: ${toolId}):`, e, 'paramsStr:', paramsStr.substring(0, 100))
            // 如果解析失败，尝试修复JSON（补全缺失的括号）
            try {
              let fixedParamsStr = paramsStr
              const openBraces = (fixedParamsStr.match(/{/g) || []).length
              const closeBraces = (fixedParamsStr.match(/}/g) || []).length
              if (openBraces > closeBraces) {
                fixedParamsStr += '}'.repeat(openBraces - closeBraces)
              }
              const openBrackets = (fixedParamsStr.match(/\[/g) || []).length
              const closeBrackets = (fixedParamsStr.match(/\]/g) || []).length
              if (openBrackets > closeBrackets) {
                fixedParamsStr += ']'.repeat(openBrackets - closeBrackets)
              }
              const jsonStr = extractOuterJsonString(fixedParamsStr)
              if (jsonStr) {
                parameters = JSON.parse(jsonStr)
                getLogger().info(`[parseToolCallsFromContentLoose] 修复后成功解析JSON参数`)
              }
            } catch (fixError) {
              getLogger().warn(`[parseToolCallsFromContentLoose] 修复JSON失败:`, fixError)
              // 如果修复也失败，使用空对象，至少工具ID是有效的
            }
          }
          
          toolCalls.push({
            id: `call_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
            tool_id: toolId,
            parameters
          })
          index++
        }
        
        getLogger().debug(`[parseToolCallsFromContentLoose] ✅ 宽松解析完成，找到 ${toolCalls.length} 个工具调用`, {
          toolCalls: toolCalls.map(tc => ({ tool_id: tc.tool_id, parameters: tc.parameters }))
        })
        return toolCalls.length > 0 ? toolCalls : null
      } catch (error) {
        getLogger().error('[parseToolCallsFromContentLoose] ❌ 宽松解析标记格式工具调用失败:', error)
        return null
      }
    }
    
    // 解析标记格式的工具调用（与agent-engine-executor.ts中的逻辑一致）
    const parseToolCallsFromContent = (content: string): Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }> | null => {
      try {
        getLogger().debug('[parseToolCallsFromContent] 开始解析工具调用，内容长度:', content.length, {
          contentPreview: content.substring(Math.max(0, content.length - 500))
        })
        
        // 匹配工具调用块（支持一个或两个开始标记，使用非贪婪匹配，支持换行）
        // 注意：必须匹配完整的begin和end标记
        const markedPattern = /\<｜tool▁calls▁begin｜>([\s\S]*?)\<｜tool▁calls▁end｜>/i
        const blockMatch = content.match(markedPattern)
        
        if (!blockMatch || !blockMatch[1]) {
          getLogger().warn('[parseToolCallsFromContent] ❌ 未找到完整的工具调用块', {
            hasBegin: /\<｜tool▁calls▁begin｜>/i.test(content),
            hasEnd: /\<｜tool▁calls▁end｜>/i.test(content),
            contentSnippet: content.substring(Math.max(0, content.length - 300))
          })
          return null
        }

        const toolCallsContent = blockMatch[1].trim()
        getLogger().debug('[parseToolCallsFromContent] ✅ 找到工具调用块，内容长度:', toolCallsContent.length, {
          toolCallsContent
        })
        
        const toolCalls: Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }> = []

        // 匹配单个工具调用
        // 格式: <｜tool▁call▁begin｜>tool_id<｜tool▁sep｜>params<｜tool▁call▁end｜>
        // 注意：使用[\s\S]*?来匹配包括换行在内的所有字符
        const toolCallPattern = /\<｜tool▁call▁begin｜>([\s\S]*?)\<｜tool▁sep｜>([\s\S]*?)\<｜tool▁call▁end｜>/gi
        
        let match
        let index = 0
        while ((match = toolCallPattern.exec(toolCallsContent)) !== null) {
          const toolId = match[1].trim()
          let paramsStr = match[2].trim()
          
          getLogger().debug(`[parseToolCallsFromContent] 解析工具调用 ${index + 1}: toolId=${toolId}, paramsStr长度=${paramsStr.length}`)
          
          // 尝试解析参数JSON
          let parameters: Record<string, unknown> = {}
          try {
            // 先尝试提取JSON字符串（处理可能包含其他文本的情况）
            const jsonStr = extractOuterJsonString(paramsStr)
            if (jsonStr) {
              parameters = JSON.parse(jsonStr)
              getLogger().debug(`[parseToolCallsFromContent] 成功解析JSON参数:`, parameters)
            } else {
              // 如果没有找到JSON，尝试直接解析
              parameters = JSON.parse(paramsStr)
              getLogger().debug(`[parseToolCallsFromContent] 直接解析JSON参数:`, parameters)
            }
          } catch (e) {
            getLogger().warn(`[parseToolCallsFromContent] 解析工具调用参数失败 (工具: ${toolId}):`, e, 'paramsStr:', paramsStr.substring(0, 100))
            // 如果解析失败，使用空对象，至少工具ID是有效的
          }

          toolCalls.push({
            id: `call_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
            tool_id: toolId,
            parameters
          })
          index++
        }

        getLogger().debug(`[parseToolCallsFromContent] ✅ 解析完成，找到 ${toolCalls.length} 个工具调用`, {
          toolCalls: toolCalls.map(tc => ({ tool_id: tc.tool_id, parameters: tc.parameters }))
        })
        return toolCalls.length > 0 ? toolCalls : null
      } catch (error) {
        getLogger().error('[parseToolCallsFromContent] ❌ 解析标记格式工具调用失败:', error)
        return null
      }
    }
    
    // 用于跟踪是否已经处理过工具调用
    let toolCallsProcessed = false
    
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
          
          // 检测工具调用标记（仅在流式输出且提供回调时）
          // 重要：只有在检测到完整的begin和end标记时才触发
          if (onToolCallsDetected && !toolCallsProcessed) {
            // 检查是否有完整的工具调用标记块（必须同时包含begin和end）
            const toolCallsBeginPattern = /\<｜tool▁calls▁begin｜>/i
            const toolCallsEndPattern = /\<｜tool▁calls▁end｜>/i
            
            const hasBegin = toolCallsBeginPattern.test(newValue)
            const hasEnd = toolCallsEndPattern.test(newValue)
            
            // 记录每次检测的状态（但只在有变化时记录，避免日志过多）
            // if (hasBegin || hasEnd) {
            //   getLogger().debug('[callChatViaTask] watch触发 - 检测工具调用标记:', {
            //     contentLength: newValue.length,
            //     hasBegin,
            //     hasEnd,
            //     hasBoth: hasBegin && hasEnd,
            //     contentPreview: newValue.substring(Math.max(0, newValue.length - 200))
            //   })
            // }
            
            if (hasBegin && hasEnd) {
              // 检测到完整的工具调用标记块，解析并触发回调
              getLogger().debug('[callChatViaTask] ✅ 检测到完整的工具调用标记块，开始解析...', {
                contentLength: newValue.length,
                contentSnippet: newValue.substring(Math.max(0, newValue.indexOf('<｜tool▁calls▁begin｜>')), Math.min(newValue.length, newValue.indexOf('<｜tool▁calls▁end｜>') + 50))
              })
              
              const toolCalls = parseToolCallsFromContent(newValue)
              if (toolCalls && toolCalls.length > 0) {
                toolCallsProcessed = true
                getLogger().debug('[callChatViaTask] ✅✅✅ 成功解析工具调用，准备触发回调:', {
                  toolCallsCount: toolCalls.length,
                  toolCalls: toolCalls.map(tc => ({ 
                    id: tc.tool_id, 
                    params: Object.keys(tc.parameters),
                    paramsValue: tc.parameters
                  }))
                })
                
                try {
                  await onToolCallsDetected(toolCalls)
                  getLogger().debug('[callChatViaTask] ✅✅✅ 工具调用回调执行成功')
                } catch (error) {
                  getLogger().error('[callChatViaTask] ❌ 工具调用回调执行失败:', error)
                }
              } else {
                getLogger().warn('[callChatViaTask] ⚠️ 检测到工具调用标记块，但解析失败或为空', {
                  contentSnippet: newValue.substring(Math.max(0, newValue.indexOf('<｜tool▁calls▁begin｜>')), Math.min(newValue.length, newValue.indexOf('<｜tool▁calls▁end｜>') + 100))
                })
              }
            } else if (hasBegin && !hasEnd) {
              // 只有begin标记，还没有end标记，等待完整块
              // getLogger().debug('[callChatViaTask] ⏳ 检测到工具调用开始标记，等待结束标记...', {
              //   contentLength: newValue.length,
              //   beginIndex: newValue.indexOf('<｜tool▁calls▁begin｜>')
              // })
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

      // 如果流式输出完成但还没有处理工具调用，再次检查（兜底机制）
      if (onToolCallsDetected && !toolCallsProcessed) {
        getLogger().debug('[callChatViaTask] 流式输出完成，检查最终结果中是否包含工具调用:', {
          resultLength: resultRef.value.length,
          hasBegin: /\<｜tool▁calls▁begin｜>/i.test(resultRef.value),
          hasEnd: /\<｜tool▁calls▁end｜>/i.test(resultRef.value)
        })
        
        // 首先尝试标准解析（需要完整的begin和end标记）
        let toolCalls = parseToolCallsFromContent(resultRef.value)
        
        // 如果标准解析失败，尝试宽松解析（不需要完整的end标记）
        if (!toolCalls || toolCalls.length === 0) {
          getLogger().debug('[callChatViaTask] 标准解析失败，尝试宽松解析（不需要完整end标记）')
          toolCalls = parseToolCallsFromContentLoose(resultRef.value)
        }
        
        if (toolCalls && toolCalls.length > 0) {
          toolCallsProcessed = true
          getLogger().debug('[callChatViaTask] ✅ 流式输出完成，检测到工具调用:', {
            toolCallsCount: toolCalls.length,
            toolCalls: toolCalls.map(tc => ({ id: tc.tool_id, params: Object.keys(tc.parameters) }))
          })
          try {
            await onToolCallsDetected(toolCalls)
            getLogger().debug('[callChatViaTask] ✅ 工具调用回调执行成功')
            
            // 从markdown中移除工具调用标记（如果reactiveMessage存在）
            if (reactiveMessage && 'markdown' in reactiveMessage) {
              const originalMarkdown = reactiveMessage.markdown || ''
              let cleanedMarkdown = originalMarkdown
              // 移除工具调用标记块（包括不完整的）
              cleanedMarkdown = cleanedMarkdown.replace(
                /\<｜tool▁calls▁begin｜>[\s\S]*/gi,
                ''
              ).trim()
              reactiveMessage.markdown = cleanedMarkdown || ''
              getLogger().debug('[callChatViaTask] 已清理markdown中的工具调用标记', {
                originalLength: originalMarkdown.length,
                cleanedLength: cleanedMarkdown.length
              })
            }
          } catch (error) {
            getLogger().error('[callChatViaTask] ❌ 工具调用回调执行失败:', error)
          }
        } else {
          getLogger().warn('[callChatViaTask] ⚠️ 流式输出完成，但未找到工具调用或解析失败', {
            resultPreview: resultRef.value.substring(Math.max(0, resultRef.value.length - 300))
          })
        }
      } else if (onToolCallsDetected && toolCallsProcessed) {
        getLogger().debug('[callChatViaTask] 流式输出完成，工具调用已在流式过程中处理')
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

