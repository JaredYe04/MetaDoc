import { getSetting } from './settings.js'
import { handleLlmError, LlmError, LlmErrorType } from './llm-errors.js'
import { sendNonStreamRequest, sendStreamRequest, processThinkTag } from './llm-http.js'
import { recordLlmRequest } from './llm-statistics-service.js'
import { createRendererLogger } from './logger.ts'
import OpenAI from 'openai'
import { createAdapterFromSettings } from './llm-adapters/adapter-factory.ts'
import { queryKnowledgeBase } from './rag_utils.js'
import { ragQueryReferencePrompt } from './prompts'

const DEFAULT_MAX_TOKENS = 8192
/**
 * 获取自定义LLM配置对象
 * @param {Object} customConfig - 自定义LLM配置
 * @returns {Object} LLM配置对象
 */
function getCustomLlmConfigObject(customConfig) {
  if (!customConfig || !customConfig.baseUrl || !customConfig.model) {
    throw new LlmError(LlmErrorType.INVALID_CONFIG, '自定义LLM配置无效：缺少baseUrl或model')
  }

  const type = customConfig.type || 'openai-compatible'

  return {
    type: type,
    apiUrl: customConfig.baseUrl,
    apiKey: customConfig.apiKey,
    selectedModel: customConfig.model,
    completionSuffix: customConfig.completionSuffix || '',
    chatSuffix: customConfig.chatSuffix || '/chat/completions',
    completionApiUrl: type === 'deepseek' ? `${customConfig.baseUrl}/beta` : undefined,
    // 保留原始配置以便后续使用
    _customConfig: customConfig
  }
}

/**
 * 获取 LLM 适配器
 * @param {Object} customConfig - 可选的自定义LLM配置（如果提供则使用此配置）
 * @returns {Promise<BaseLlmAdapter>} LLM 适配器实例
 */
async function getLlmAdapter(customConfig = null) {
  return await createAdapterFromSettings(customConfig)
}

/**
 * 验证 API 是否启用和配置正确
 */
async function validateApi() {
  try {
    const enabled = await getSetting('llmEnabled')
    if (!enabled) {
      throw new LlmError(LlmErrorType.NOT_ENABLED, 'LLM API 未启用')
    }

    const adapter = await getLlmAdapter()
    const config = adapter.getConfig()
    if (!config.apiUrl && config.type !== 'metadoc' && config.type !== 'manual') {
      throw new LlmError(LlmErrorType.INVALID_CONFIG, 'API URL 未配置')
    }

    return true
  } catch (error) {
    handleLlmError(error)
    return false
  }
}

/**
 * 最终验证和转换消息格式，确保所有content都是字符串
 * 这是发送到API之前的最后一道防线
 */
function finalizeMessagesForAPI(messages, logger) {
  if (!Array.isArray(messages)) {
    return messages
  }

  return messages.map((msg, index) => {
    if (!msg || typeof msg !== 'object') {
      return msg
    }

    const result = {
      role: msg.role
    }

    // 处理content字段
    if (msg.role === 'assistant' && msg.tool_calls) {
      // assistant消息有tool_calls时，content可以是null
      // 确保tool_calls格式正确
      // buildHistoryMessages已经输出了正确格式的tool_calls（arguments是JSON字符串）
      // 这里只需要简单验证，确保格式正确
      if (Array.isArray(msg.tool_calls)) {
        result.tool_calls = msg.tool_calls.map((tc) => {
          if (typeof tc === 'object' && tc !== null && tc.function) {
            // 确保arguments是JSON字符串
            let argumentsString = ''
            if (typeof tc.function.arguments === 'string') {
              // 已经是字符串，验证是否为有效JSON
              try {
                JSON.parse(tc.function.arguments)
                argumentsString = tc.function.arguments
              } catch {
                logger.error(
                  `[finalizeMessagesForAPI] 消息[${index}] tool_call arguments不是有效的JSON字符串:`,
                  tc.function.arguments
                )
                argumentsString = '{}'
              }
            } else if (
              typeof tc.function.arguments === 'object' &&
              tc.function.arguments !== null
            ) {
              // 如果是对象，序列化为JSON字符串（这种情况不应该发生，但作为安全措施）
              try {
                argumentsString = JSON.stringify(tc.function.arguments)
              } catch {
                logger.error(
                  `[finalizeMessagesForAPI] 消息[${index}] tool_call arguments序列化失败:`,
                  tc.function.arguments
                )
                argumentsString = '{}'
              }
            } else {
              argumentsString = '{}'
            }

            return {
              id: tc.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'function',
              function: {
                name: tc.function.name || '',
                arguments: argumentsString // OpenAI API要求：必须是JSON字符串！
              }
            }
          }
          return tc
        })
      } else {
        logger.error(
          `[finalizeMessagesForAPI] 消息[${index}] tool_calls不是数组:`,
          typeof msg.tool_calls,
          msg.tool_calls
        )
        result.tool_calls = []
      }

      result.content =
        msg.content && typeof msg.content === 'string' && msg.content.trim() ? msg.content : null
    } else if (msg.role === 'tool') {
      // tool消息：content在buildHistoryMessages时已经从markdown字段获取并确保是字符串
      // 这里只需要简单验证
      result.content = typeof msg.content === 'string' ? msg.content : ''
      result.tool_call_id = msg.tool_call_id
      if (msg.name) {
        result.name = msg.name
      }
    } else {
      // 其他消息类型：content必须是字符串
      let content = msg.content

      if (content === null || content === undefined) {
        content = ''
      } else if (typeof content !== 'string') {
        // 记录错误日志
        logger.error(
          `[finalizeMessagesForAPI] 消息[${index}] (role: ${msg.role}) 的content不是字符串:`,
          {
            contentType: typeof content,
            content: content
          }
        )

        // 强制转换为字符串
        try {
          content = typeof content === 'object' ? JSON.stringify(content) : String(content || '')
        } catch (error) {
          logger.error(`[finalizeMessagesForAPI] 消息[${index}] content序列化失败:`, error)
          content = ''
        }
      }

      result.content = content
    }

    return result
  })
}

/**
 * 清理消息格式，确保符合OpenAI API规范
 * 移除不应该存在的字段（如type），确保必需字段存在
 * @param {Array} messages - 消息数组
 * @returns {Array} 清理后的消息数组
 */
function sanitizeMessages(messages) {
  const logger = createRendererLogger('LLM-API')
  if (!Array.isArray(messages)) {
    return messages
  }

  return messages.map((msg, index) => {
    if (!msg || typeof msg !== 'object') {
      return msg
    }

    // 创建全新的消息对象，避免修改原始对象
    const sanitized = {
      role: msg.role
    }

    // 处理content字段：确保所有content都是字符串（除了assistant的tool_calls消息）
    let content = msg.content

    // 对于tool消息，content必须是字符串，绝对不能是对象
    if (msg.role === 'tool') {
      // Tool消息的content处理
      if (content === null || content === undefined) {
        content = ''
      } else if (typeof content !== 'string') {
        // 记录错误
        logger.error(`[sanitizeMessages] 消息[${index}] (tool) content不是字符串:`, {
          contentType: typeof content,
          content: content
        })

        // 强制转换为字符串
        try {
          // 如果content是ToolCallbackData格式（包含content和format字段），提取content
          if (
            typeof content === 'object' &&
            content !== null &&
            'content' in content &&
            'format' in content
          ) {
            const extractedContent = content.content
            if (typeof extractedContent === 'string') {
              content = extractedContent
            } else {
              content = JSON.stringify(extractedContent)
            }
          } else {
            // 直接序列化整个对象
            content = JSON.stringify(content)
          }
        } catch (error) {
          logger.error(`[sanitizeMessages] 消息[${index}] (tool) content序列化失败:`, error)
          content = ''
        }
      }
      // 最终强制转换为字符串
      sanitized.content = String(content || '')

      // 添加tool消息必需字段
      if (msg.tool_call_id) {
        sanitized.tool_call_id = msg.tool_call_id
      }
      if (msg.name) {
        sanitized.name = msg.name
      }
    } else if (msg.role === 'assistant' && msg.tool_calls) {
      // Assistant消息有tool_calls时，content可以是null
      sanitized.content = content && typeof content === 'string' && content.trim() ? content : null
    } else {
      // 其他消息类型：content必须是字符串
      if (content === null || content === undefined) {
        sanitized.content = ''
      } else if (typeof content !== 'string') {
        // 记录错误
        logger.error(`[sanitizeMessages] 消息[${index}] (${msg.role}) content不是字符串:`, {
          contentType: typeof content,
          content: content
        })

        // 强制转换为字符串
        try {
          if (typeof content === 'object') {
            sanitized.content = JSON.stringify(content)
          } else {
            sanitized.content = String(content)
          }
        } catch (error) {
          logger.error(`[sanitizeMessages] 消息[${index}] (${msg.role}) content序列化失败:`, error)
          sanitized.content = ''
        }
      } else {
        sanitized.content = content
      }
    }

    // 如果是assistant消息且有tool_calls，直接使用（buildHistoryMessages已经处理好了）
    // 只做简单验证，确保arguments是JSON字符串
    if (msg.role === 'assistant' && msg.tool_calls && Array.isArray(msg.tool_calls)) {
      sanitized.tool_calls = msg.tool_calls.map((tc) => {
        if (typeof tc === 'object' && tc !== null && tc.function) {
          // OpenAI API要求：arguments必须是JSON字符串！
          // buildHistoryMessages已经输出了正确格式，这里只需要验证
          let argumentsString = ''
          if (typeof tc.function.arguments === 'string') {
            // 已经是字符串，验证是否为有效JSON
            try {
              JSON.parse(tc.function.arguments)
              argumentsString = tc.function.arguments
            } catch {
              logger.error(
                `[sanitizeMessages] 消息[${index}] tool_call arguments不是有效的JSON字符串:`,
                tc.function.arguments
              )
              argumentsString = '{}'
            }
          } else if (typeof tc.function.arguments === 'object' && tc.function.arguments !== null) {
            // 如果是对象（不应该发生，但作为安全措施），序列化为JSON字符串
            try {
              argumentsString = JSON.stringify(tc.function.arguments)
            } catch {
              logger.error(
                `[sanitizeMessages] 消息[${index}] tool_call arguments序列化失败:`,
                tc.function.arguments
              )
              argumentsString = '{}'
            }
          } else {
            argumentsString = '{}'
          }

          return {
            id: tc.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: {
              name: tc.function.name || '',
              arguments: argumentsString // OpenAI API要求：必须是JSON字符串！
            }
          }
        }
        return tc
      })

      // 如果有tool_calls，content应该为null（如果原content为空）
      if (!sanitized.content || !sanitized.content.trim()) {
        sanitized.content = null
      }
    }

    // Tool消息的额外字段已经在上面处理过了，这里只需要移除不需要的字段
    if (msg.role === 'tool') {
      // 移除不应该发送到LLM API的字段（如tool_config等）
      // 这些字段只在会话存储中使用，不应该发送到LLM
      delete sanitized.tool_config
      delete sanitized.outputs
      delete sanitized.tool
      delete sanitized.status
      delete sanitized.summary
      delete sanitized.error
      delete sanitized.type
    }

    // 移除不应该存在的字段（如type）
    // 注意：tool_calls内部的type字段是必需的，不应该移除

    // 最后检查：对于所有消息（除了assistant的tool_calls消息），确保content是字符串
    if (sanitized.role !== 'assistant' || !sanitized.tool_calls) {
      if (
        sanitized.content !== null &&
        sanitized.content !== undefined &&
        typeof sanitized.content !== 'string'
      ) {
        try {
          sanitized.content =
            typeof sanitized.content === 'object'
              ? JSON.stringify(sanitized.content)
              : String(sanitized.content)
        } catch {
          sanitized.content = String(sanitized.content || '')
        }
      }
    }

    return sanitized
  })
}

/**
 * 非流式补全请求
 */
async function answerQuestionNonStream(
  prompt,
  ref,
  meta = {},
  signal = null,
  customLlmConfig = null
) {
  // 如果有自定义配置，跳过全局验证
  if (!customLlmConfig && !(await validateApi())) {
    return
  }

  const adapter = await getLlmAdapter(customLlmConfig || meta?.customLlmConfig || null)
  const config = adapter.getConfig()
  const { type, selectedModel } = config

  try {
    // 根据配置决定是否使用 max_tokens
    // 如果配置中 enableMaxTokens 为 false，则不传递 max_tokens
    // 如果配置中 enableMaxTokens 为 true，使用配置的 maxTokens 作为上限
    let effectiveMaxTokens = undefined
    const configEnableMaxTokens = config?.enableMaxTokens ?? false
    const configMaxTokens = config?.maxTokens

    if (configEnableMaxTokens) {
      if (meta.max_tokens !== undefined && meta.max_tokens > 0) {
        // 如果 meta 中指定了 max_tokens，取两者较小值
        effectiveMaxTokens =
          configMaxTokens !== undefined && configMaxTokens > 0
            ? Math.min(meta.max_tokens, configMaxTokens)
            : meta.max_tokens
      } else if (configMaxTokens !== undefined && configMaxTokens > 0) {
        // 如果没有指定 meta.max_tokens，使用配置的 maxTokens
        effectiveMaxTokens = configMaxTokens
      }
    }
    // 如果 enableMaxTokens 为 false，effectiveMaxTokens 保持为 undefined，不传递 max_tokens

    // 对于ollama和manual类型，使用原有的fetch方式
    if (type === 'ollama' || type === 'manual') {
      const url = adapter.getCompletionUrl()
      const payloadMeta = { ...meta }
      if (effectiveMaxTokens !== undefined) {
        payloadMeta.max_tokens = effectiveMaxTokens
      }
      const payload = adapter.buildCompletionPayload(prompt, payloadMeta)
      const headers = adapter.buildHeaders()

      const result = await sendNonStreamRequest(url, payload, headers, signal)
      const { text, usage } = adapter.convertResponse(result, 'completion')
      const processedText = await processThinkTag(text)
      ref.value = processedText

      // 记录 token 统计
      if (usage) {
        try {
          await recordLlmRequest(usage, selectedModel, 'completion')
        } catch (error) {
          const logger = createRendererLogger('LLM-API')
          logger.warn('记录 token 统计失败:', error)
        }
      }
      return
    }

    // 对于Gemini类型，使用 GoogleGenAI SDK
    if (type === 'gemini') {
      const geminiMeta = { ...meta }
      if (effectiveMaxTokens !== undefined) {
        geminiMeta.max_tokens = effectiveMaxTokens
      }
      const { text, usage } = await adapter.generateContentNonStream(prompt, geminiMeta, signal)
      const processedText = await processThinkTag(text)
      ref.value = processedText

      if (usage) {
        try {
          await recordLlmRequest(usage, selectedModel, 'completion')
        } catch (error) {
          const logger = createRendererLogger('LLM-API')
          logger.warn('记录 token 统计失败:', error)
        }
      }
      return
    }

    // 对于OpenAI兼容的API，使用OpenAI SDK
    const baseURL =
      type === 'deepseek' && config.completionApiUrl
        ? config.completionApiUrl
        : adapter.getCompletionUrl()

    const openai = new OpenAI({
      apiKey: config.apiKey || 'dummy-key',
      baseURL: baseURL,
      defaultQuery: {},
      defaultHeaders: {},
      dangerouslyAllowBrowser: true
    })

    const completionParams = adapter.buildCompletionPayload(prompt, {
      ...meta,
      max_tokens: maxTokens
    })

    const completion = await openai.completions.create(completionParams, {
      signal: signal
    })

    const { text, usage } = adapter.convertResponse(completion, 'completion')
    const processedText = await processThinkTag(text)
    ref.value = processedText

    // 记录 token 统计
    if (usage) {
      try {
        await recordLlmRequest(usage, selectedModel, 'completion')
      } catch (error) {
        const logger = createRendererLogger('LLM-API')
        logger.warn('记录 token 统计失败:', error)
      }
    }
  } catch (error) {
    const llmError = handleLlmError(error, false)
    throw llmError
  }
}

/**
 * 流式补全请求
 */
async function answerQuestionStream(
  prompt,
  ref,
  meta = {},
  signal = undefined,
  customLlmConfig = null
) {
  // 如果有自定义配置，跳过全局验证
  if (!customLlmConfig && !(await validateApi())) {
    return
  }

  const adapter = await getLlmAdapter(customLlmConfig || meta?.customLlmConfig || null)
  const config = adapter.getConfig()
  const { type, selectedModel } = config

  try {
    // 根据配置决定是否使用 max_tokens
    // 如果配置中 enableMaxTokens 为 false，则不传递 max_tokens
    // 如果配置中 enableMaxTokens 为 true，使用配置的 maxTokens 作为上限
    let effectiveMaxTokens = undefined
    const configEnableMaxTokens = config?.enableMaxTokens ?? false
    const configMaxTokens = config?.maxTokens

    if (configEnableMaxTokens) {
      if (meta.max_tokens !== undefined && meta.max_tokens > 0) {
        // 如果 meta 中指定了 max_tokens，取两者较小值
        effectiveMaxTokens =
          configMaxTokens !== undefined && configMaxTokens > 0
            ? Math.min(meta.max_tokens, configMaxTokens)
            : meta.max_tokens
      } else if (configMaxTokens !== undefined && configMaxTokens > 0) {
        // 如果没有指定 meta.max_tokens，使用配置的 maxTokens
        effectiveMaxTokens = configMaxTokens
      }
    }
    // 如果 enableMaxTokens 为 false，effectiveMaxTokens 保持为 undefined，不传递 max_tokens

    // 对于ollama和manual类型，使用fetch方式
    if (type === 'ollama' || type === 'manual') {
      const streamUrl = adapter.getStreamUrl('completion') || adapter.getCompletionUrl()
      const payloadMeta = { ...meta }
      if (effectiveMaxTokens !== undefined) {
        payloadMeta.max_tokens = effectiveMaxTokens
      }
      const payload = { ...adapter.buildCompletionPayload(prompt, payloadMeta), stream: true }
      const headers = adapter.buildHeaders()

      ref.value = ''
      await sendStreamRequest(
        streamUrl,
        payload,
        headers,
        signal,
        async (chunk) => {
          const delta = adapter.extractStreamDelta(chunk, 'completion')
          if (delta) {
            ref.value += delta
            const processed = await processThinkTag(ref.value)
            if (processed !== ref.value) {
              ref.value = processed
            }
          }
        },
        async (lastChunk) => {
          const usage = adapter.extractStreamUsage(lastChunk)
          if (usage) {
            try {
              await recordLlmRequest(usage, selectedModel, 'completion')
            } catch (error) {
              const logger = createRendererLogger('LLM-API')
              logger.warn('记录 token 统计失败:', error)
            }
          }
        }
      )
      return
    }

    // 对于Gemini类型，使用 GoogleGenAI SDK
    if (type === 'gemini') {
      ref.value = ''
      let lastUsage = null

      const geminiMeta = { ...meta }
      if (effectiveMaxTokens !== undefined) {
        geminiMeta.max_tokens = effectiveMaxTokens
      }
      const stream = adapter.generateContentStream(prompt, geminiMeta, signal)

      for await (const { delta, usage } of stream) {
        if (delta) {
          ref.value += delta
          const processed = await processThinkTag(ref.value)
          if (processed !== ref.value) {
            ref.value = processed
          }
        }
        if (usage) {
          lastUsage = usage
        }
      }

      // 流式响应完成时，记录 token 统计
      if (lastUsage) {
        try {
          await recordLlmRequest(lastUsage, selectedModel, 'completion')
        } catch (error) {
          const logger = createRendererLogger('LLM-API')
          logger.warn('记录 token 统计失败:', error)
        }
      }
      return
    }

    // 对于OpenAI兼容的API，使用OpenAI SDK
    const baseURL =
      type === 'deepseek' && config.completionApiUrl
        ? config.completionApiUrl
        : adapter.getCompletionUrl()

    const openai = new OpenAI({
      apiKey: config.apiKey || 'dummy-key',
      baseURL: baseURL,
      defaultQuery: {},
      defaultHeaders: {},
      dangerouslyAllowBrowser: true
    })

    const completionMeta = { ...meta }
    if (effectiveMaxTokens !== undefined) {
      completionMeta.max_tokens = effectiveMaxTokens
    }
    const completionParams = {
      ...adapter.buildCompletionPayload(prompt, completionMeta),
      stream: true
    }

    ref.value = ''
    let lastUsage = null

    const stream = await openai.completions.create(completionParams, {
      signal: signal
    })

    for await (const chunk of stream) {
      const delta = adapter.extractStreamDelta(chunk, 'completion')
      if (delta) {
        ref.value += delta
        const processed = await processThinkTag(ref.value)
        if (processed !== ref.value) {
          ref.value = processed
        }
      }
      const usage = adapter.extractStreamUsage(chunk)
      if (usage) {
        lastUsage = usage
      }
    }

    // 流式响应完成时，记录 token 统计
    if (lastUsage) {
      try {
        await recordLlmRequest(lastUsage, selectedModel, 'completion')
      } catch (error) {
        const logger = createRendererLogger('LLM-API')
        logger.warn('记录 token 统计失败:', error)
      }
    }
  } catch (error) {
    const llmError = handleLlmError(error, false)
    throw llmError
  }
}

/**
 * 统一补全接口
 */
async function answerQuestion(prompt, ref, meta = {}, signal = {}, customLlmConfig = null) {
  try {
    // 从meta中提取自定义配置（如果存在）
    const effectiveCustomConfig = customLlmConfig || meta?.customLlmConfig || null

    if (meta.stream) {
      await answerQuestionStream(prompt, ref, meta, signal, effectiveCustomConfig)
    } else {
      await answerQuestionNonStream(prompt, ref, meta, signal, effectiveCustomConfig)
    }
  } catch (error) {
    // 如果是需要显示登录对话框的错误
    if (error.details?.showLoginDialog) {
      const { default: eventBus } = await import('./event-bus.js')
      eventBus.emit('show-error', error.getUserMessage())
      eventBus.emit('toggle-user-profile')
    }
    throw error
  }
}

/**
 * 准备对话请求适配器
 */
async function getConversationAdapter(conversation, signal, customLlmConfig = null) {
  // 如果有自定义配置，跳过全局验证
  if (!customLlmConfig && !(await validateApi())) {
    return null
  }

  return await getLlmAdapter(customLlmConfig)
}

/**
 * RAG 查询注入（对话模式）
 */
async function ragQueryInjectionConversation(originalConversation, enableKnowledgeBase) {
  if (!enableKnowledgeBase) {
    return originalConversation
  }

  if (typeof originalConversation !== 'object' || !Array.isArray(originalConversation)) {
    throw new Error('Invalid conversation format')
  }

  try {
    const logger = createRendererLogger('LLM-API')

    // 检查对话格式
    if (originalConversation.length === 0) {
      logger.warn('[ragQueryInjectionConversation] 对话为空，无法查询知识库')
      return originalConversation
    }

    // 从最后一条消息开始往前找，找到第一条非空的用户消息
    let userMessage = null
    let question = null

    for (let i = originalConversation.length - 1; i >= 0; i--) {
      const msg = originalConversation[i]

      // 只查找用户消息
      if (msg.role !== 'user') {
        continue
      }

      // 尝试获取 content 字段
      let content = msg.content

      // 如果 content 为空，尝试 markdown 字段（Agent 消息格式）
      if (!content || content.trim() === '') {
        if (msg.markdown) {
          content = msg.markdown
          // logger.debug(`[ragQueryInjectionConversation] 消息[${i}] content 为空，使用 markdown 字段`);
        } else {
          // logger.debug(`[ragQueryInjectionConversation] 消息[${i}] content 和 markdown 都为空，继续查找`);
          continue
        }
      }

      // 确保 content 是字符串且非空
      if (typeof content === 'string' && content.trim()) {
        userMessage = msg
        question = content.trim()
        // logger.debug(`[ragQueryInjectionConversation] 找到用户消息[${i}]: role=${msg.role}, content长度=${question.length}`);
        break
      }
    }

    // 如果找不到有效的用户消息
    if (!userMessage || !question) {
      logger.warn('[ragQueryInjectionConversation] 无法找到有效的用户消息，跳过知识库查询', {
        conversationLength: originalConversation.length,
        lastMessage: originalConversation[originalConversation.length - 1]
      })
      return originalConversation
    }

    // logger.debug(`[ragQueryInjectionConversation] 开始查询知识库，问题: ${question.substring(0, 50)}...`);

    const response = await queryKnowledgeBase(question)

    // logger.debug(`[ragQueryInjectionConversation] 知识库查询完成，返回 ${response.length} 条结果`);

    if (response.length === 0) {
      // logger.debug('[ragQueryInjectionConversation] 知识库查询结果为空，返回原始对话');
      return originalConversation
    }

    // 把 RAG 插入到倒数第二个位置
    const lastMessage = originalConversation[originalConversation.length - 1]
    originalConversation.pop()
    originalConversation.push({
      role: 'user',
      content: ragQueryReferencePrompt(response)
    })
    originalConversation.push(lastMessage)

    // logger.debug(`[ragQueryInjectionConversation] RAG 内容已注入，对话消息数: ${originalConversation.length}`);
    return originalConversation
  } catch (error) {
    const logger = createRendererLogger('LLM-API')
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.warn('知识库查询失败，继续使用原始对话', {
      error: errorMessage,
      errorStack: error instanceof Error ? error.stack : undefined
    })
    // 如果知识库查询失败，返回原始对话，不中断对话流程
    return originalConversation
  }
}

/**
 * 非流式对话请求
 */
async function continueConversationNonStream(
  conversation,
  ref,
  meta,
  signal,
  customLlmConfig = null
) {
  const logger = createRendererLogger('LLM-API')
  const effectiveCustomConfig = customLlmConfig || meta?.customLlmConfig || null
  const adapter = await getConversationAdapter(conversation, signal, effectiveCustomConfig)
  if (!adapter) {
    return
  }

  const config = adapter.getConfig()
  const { type, selectedModel } = config

  try {
    // RAG查询注入（如果启用）
    const enableKnowledgeBase = meta?.enableKnowledgeBase === true
    let processedConversation = conversation
    if (enableKnowledgeBase) {
      processedConversation = await ragQueryInjectionConversation(
        JSON.parse(JSON.stringify(conversation)), // 深拷贝避免修改原数组
        enableKnowledgeBase
      )
    }
    // 根据配置决定是否使用 max_tokens
    let effectiveMaxTokens = undefined
    const configEnableMaxTokens = config?.enableMaxTokens ?? false
    const configMaxTokens = config?.maxTokens

    if (configEnableMaxTokens) {
      if (meta.max_tokens !== undefined && meta.max_tokens > 0) {
        // 如果 meta 中指定了 max_tokens，取两者较小值
        effectiveMaxTokens =
          configMaxTokens !== undefined && configMaxTokens > 0
            ? Math.min(meta.max_tokens, configMaxTokens)
            : meta.max_tokens
      } else if (configMaxTokens !== undefined && configMaxTokens > 0) {
        // 如果没有指定 meta.max_tokens，使用配置的 maxTokens
        effectiveMaxTokens = configMaxTokens
      }
    }
    // 如果 enableMaxTokens 为 false，effectiveMaxTokens 保持为 undefined，不传递 max_tokens

    const effectiveMeta = { ...meta }
    if (effectiveMaxTokens !== undefined) {
      effectiveMeta.max_tokens = effectiveMaxTokens
    } else if (effectiveMaxTokens === undefined && meta.max_tokens !== undefined) {
      // 如果配置禁用了 max_tokens，移除 meta 中的 max_tokens
      delete effectiveMeta.max_tokens
    }

    // 清理并验证消息格式
    let sanitizedMsgs = sanitizeMessages(processedConversation)
    sanitizedMsgs = finalizeMessagesForAPI(sanitizedMsgs, logger)

    // 对于Gemini类型，不需要预先转换消息格式，因为 generateChatNonStream 内部会自己转换
    // 对于其他类型，转换消息格式（适配器可能需要转换）
    const convertedMsgs = type === 'gemini' ? sanitizedMsgs : adapter.convertMessages(sanitizedMsgs)

    // 对于ollama和manual类型，使用fetch方式
    if (type === 'ollama' || type === 'manual') {
      const url = adapter.getChatUrl()
      const payload = adapter.buildChatPayload(convertedMsgs, effectiveMeta)
      const headers = adapter.buildHeaders()

      const result = await sendNonStreamRequest(url, payload, headers, signal)
      const { text, usage } = adapter.convertResponse(result, 'chat')
      const processedContent = await processThinkTag(text)
      ref.value = processedContent

      if (usage) {
        try {
          await recordLlmRequest(usage, selectedModel, 'chat')
        } catch (error) {
          logger.warn('记录 token 统计失败:', error)
        }
      }
      return
    }

    // 对于Gemini类型，使用 GoogleGenAI SDK
    // 注意：Gemini 适配器的 generateChatNonStream 内部会自己转换消息格式
    // 所以这里应该传入原始的 sanitizedMsgs，而不是 convertedMsgs
    if (type === 'gemini') {
      const { text, usage } = await adapter.generateChatNonStream(
        sanitizedMsgs,
        effectiveMeta,
        signal
      )
      const processedContent = await processThinkTag(text)
      ref.value = processedContent

      if (usage) {
        try {
          await recordLlmRequest(usage, selectedModel, 'chat')
        } catch (error) {
          logger.warn('记录 token 统计失败:', error)
        }
      }
      return
    }

    // 对于OpenAI兼容的API，使用OpenAI SDK
    const finalUrl = adapter.getChatUrl()

    const openai = new OpenAI({
      apiKey: config.apiKey || 'dummy-key',
      baseURL: finalUrl,
      defaultQuery: {},
      defaultHeaders: {},
      dangerouslyAllowBrowser: true
    })

    const chatParams = adapter.buildChatPayload(convertedMsgs, effectiveMeta)

    const completion = await openai.chat.completions.create(chatParams, {
      signal: signal
    })

    const { text, usage } = adapter.convertResponse(completion, 'chat')
    const processedContent = await processThinkTag(text)
    ref.value = processedContent

    if (usage) {
      try {
        await recordLlmRequest(usage, selectedModel, 'chat')
      } catch (error) {
        logger.warn('记录 token 统计失败:', error)
      }
    }
  } catch (error) {
    const llmError = handleLlmError(error, false)
    throw llmError
  }
}

/**
 * 流式对话请求
 */
async function continueConversationStream(
  conversation,
  ref,
  meta,
  signal = undefined,
  customLlmConfig = null
) {
  const logger = createRendererLogger('LLM-API')
  const effectiveCustomConfig = customLlmConfig || meta?.customLlmConfig || null
  const adapter = await getConversationAdapter(conversation, signal, effectiveCustomConfig)
  if (!adapter) {
    return
  }

  const config = adapter.getConfig()
  const { type, selectedModel } = config

  try {
    // RAG查询注入（如果启用）
    const enableKnowledgeBase = meta?.enableKnowledgeBase === true
    let processedConversation = conversation
    if (enableKnowledgeBase) {
      processedConversation = await ragQueryInjectionConversation(
        JSON.parse(JSON.stringify(conversation)), // 深拷贝避免修改原数组
        enableKnowledgeBase
      )
    }
    // 根据配置决定是否使用 max_tokens
    let effectiveMaxTokens = undefined
    const configEnableMaxTokens = config?.enableMaxTokens ?? false
    const configMaxTokens = config?.maxTokens

    if (configEnableMaxTokens) {
      if (meta.max_tokens !== undefined && meta.max_tokens > 0) {
        // 如果 meta 中指定了 max_tokens，取两者较小值
        effectiveMaxTokens =
          configMaxTokens !== undefined && configMaxTokens > 0
            ? Math.min(meta.max_tokens, configMaxTokens)
            : meta.max_tokens
      } else if (configMaxTokens !== undefined && configMaxTokens > 0) {
        // 如果没有指定 meta.max_tokens，使用配置的 maxTokens
        effectiveMaxTokens = configMaxTokens
      }
    }
    // 如果 enableMaxTokens 为 false，effectiveMaxTokens 保持为 undefined，不传递 max_tokens

    const effectiveMeta = { ...meta }
    if (effectiveMaxTokens !== undefined) {
      effectiveMeta.max_tokens = effectiveMaxTokens
    } else if (effectiveMaxTokens === undefined && meta.max_tokens !== undefined) {
      // 如果配置禁用了 max_tokens，移除 meta 中的 max_tokens
      delete effectiveMeta.max_tokens
    }

    // 清理并验证消息格式
    let sanitizedMsgs = sanitizeMessages(processedConversation)
    sanitizedMsgs = finalizeMessagesForAPI(sanitizedMsgs, logger)

    // 对于Gemini类型，不需要预先转换消息格式，因为 generateChatStream 内部会自己转换
    // 对于其他类型，转换消息格式（适配器可能需要转换）
    const convertedMsgs = type === 'gemini' ? sanitizedMsgs : adapter.convertMessages(sanitizedMsgs)

    // 对于ollama和manual类型，使用fetch方式
    if (type === 'ollama' || type === 'manual') {
      const streamUrl = adapter.getStreamUrl('chat') || adapter.getChatUrl()
      const payload = { ...adapter.buildChatPayload(convertedMsgs, effectiveMeta), stream: true }
      const headers = adapter.buildHeaders()

      ref.value = ''
      await sendStreamRequest(
        streamUrl,
        payload,
        headers,
        signal,
        async (chunk) => {
          const delta = adapter.extractStreamDelta(chunk, 'chat')
          if (delta) {
            ref.value += delta
            const processed = await processThinkTag(ref.value)
            if (processed !== ref.value) {
              ref.value = processed
            }
          }
        },
        async (lastChunk) => {
          const usage = adapter.extractStreamUsage(lastChunk)
          if (usage) {
            try {
              await recordLlmRequest(usage, selectedModel, 'chat')
            } catch (error) {
              logger.warn('记录 token 统计失败:', error)
            }
          }
        }
      )
      return
    }

    // 对于Gemini类型，使用 GoogleGenAI SDK
    // 注意：Gemini 适配器的 generateChatStream 内部会自己转换消息格式
    // 所以这里应该传入原始的 sanitizedMsgs，而不是 convertedMsgs
    if (type === 'gemini') {
      ref.value = ''
      let lastUsage = null

      const stream = adapter.generateChatStream(sanitizedMsgs, effectiveMeta, signal)

      for await (const { delta, usage } of stream) {
        if (delta) {
          ref.value += delta
          const processed = await processThinkTag(ref.value)
          if (processed !== ref.value) {
            ref.value = processed
          }
        }
        if (usage) {
          lastUsage = usage
        }
      }

      // 流式响应完成时，记录 token 统计
      if (lastUsage) {
        try {
          await recordLlmRequest(lastUsage, selectedModel, 'chat')
        } catch (error) {
          logger.warn('记录 token 统计失败:', error)
        }
      }
      return
    }

    // 对于OpenAI兼容的API，使用OpenAI SDK
    const finalUrl = adapter.getChatUrl()

    const openai = new OpenAI({
      apiKey: config.apiKey || 'dummy-key',
      baseURL: finalUrl,
      defaultQuery: {},
      defaultHeaders: {},
      dangerouslyAllowBrowser: true
    })

    const chatParams = { ...adapter.buildChatPayload(convertedMsgs, effectiveMeta), stream: true }

    ref.value = ''
    let lastUsage = null

    const stream = await openai.chat.completions.create(chatParams, {
      signal: signal
    })

    for await (const chunk of stream) {
      const delta = adapter.extractStreamDelta(chunk, 'chat')
      if (delta) {
        ref.value += delta
        const processed = await processThinkTag(ref.value)
        if (processed !== ref.value) {
          ref.value = processed
        }
      }
      const usage = adapter.extractStreamUsage(chunk)
      if (usage) {
        lastUsage = usage
      }
    }

    // 流式响应完成时，记录 token 统计
    if (lastUsage) {
      try {
        await recordLlmRequest(lastUsage, selectedModel, 'chat')
      } catch (error) {
        logger.warn('记录 token 统计失败:', error)
      }
    }
  } catch (error) {
    const llmError = handleLlmError(error, false)
    throw llmError
  }
}

/**
 * 统一对话接口
 */
async function continueConversation(conversation, ref, meta = {}, signal, customLlmConfig = null) {
  const logger = createRendererLogger('LLM-API')
  try {
    // 从meta中提取自定义配置（如果存在）
    const effectiveCustomConfig = customLlmConfig || meta?.customLlmConfig || null

    // 设置默认值：如果没有指定stream，默认使用流式输出
    // 关键修复：确保stream默认为true，而不是undefined
    const shouldStream =
      meta?.stream !== false && (meta?.stream === true || meta?.stream === undefined)

    // 记录meta信息用于调试
    logger.debug('[continueConversation] meta参数检查:', {
      stream: meta?.stream,
      streamType: typeof meta?.stream,
      metaKeys: meta && typeof meta === 'object' ? Object.keys(meta) : [],
      hasStream: meta && typeof meta === 'object' && 'stream' in meta,
      shouldStream: shouldStream,
      metaValue: JSON.stringify(meta)
    })

    // 注意：effectiveMaxTokens 的计算逻辑在 continueConversationStream 和 continueConversationNonStream 内部实现
    // 因为需要先获取 adapter 才能访问配置，所以不能在外部计算
    if (shouldStream) {
      logger.debug('[continueConversation] 使用流式输出模式')
      await continueConversationStream(conversation, ref, meta, signal, effectiveCustomConfig)
    } else {
      logger.warn(
        `[continueConversation] 使用非流式输出模式！meta.stream=${meta?.stream}, meta=${JSON.stringify(meta)}`
      )
      await continueConversationNonStream(conversation, ref, meta, signal, effectiveCustomConfig)
    }
  } catch (error) {
    // 如果是需要显示登录对话框的错误
    if (error.details?.showLoginDialog) {
      const { default: eventBus } = await import('./event-bus.js')
      eventBus.emit('show-error', error.getUserMessage())
      eventBus.emit('toggle-user-profile')
    }
    throw error
  }
}

// RAG查询注入功能已移除，现在通过Agent Tool系统调用

// 导出sanitizeMessages函数，供其他模块使用
export { answerQuestion, continueConversation, sanitizeMessages }
