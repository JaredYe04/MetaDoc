import eventBus from './event-bus.js'
import { createRendererLogger } from './logger.ts'

/**
 * LLM 异常类型枚举
 */
export const LlmErrorType = {
  /** API 未启用 */
  NOT_ENABLED: 'NOT_ENABLED',
  /** 配置缺失或不正确 */
  INVALID_CONFIG: 'INVALID_CONFIG',
  /** 网络错误（连接失败、超时等） */
  NETWORK_ERROR: 'NETWORK_ERROR',
  /** HTTP 错误（4xx, 5xx） */
  HTTP_ERROR: 'HTTP_ERROR',
  /** API 认证失败 */
  AUTH_ERROR: 'AUTH_ERROR',
  /** 请求被中止 */
  ABORTED: 'ABORTED',
  /** API 返回的错误响应 */
  API_ERROR: 'API_ERROR',
  /** 响应解析错误 */
  PARSE_ERROR: 'PARSE_ERROR',
  /** 未知错误 */
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
}

/**
 * LLM 异常类
 */
export class LlmError extends Error {
  constructor(type, message, originalError = null, details = {}) {
    super(message)
    this.name = 'LlmError'
    this.type = type
    this.originalError = originalError
    this.details = details
    this.timestamp = new Date().toISOString()
  }

  /**
   * 获取用户友好的错误消息
   */
  getUserMessage() {
    const messages = {
      [LlmErrorType.NOT_ENABLED]: 'LLM API 未启用，请在设置中启用',
      [LlmErrorType.INVALID_CONFIG]: 'LLM 配置不正确，请检查设置',
      [LlmErrorType.NETWORK_ERROR]: '网络连接失败，请检查网络连接',
      [LlmErrorType.HTTP_ERROR]: `API 请求失败 (${this.details.status || '未知状态码'})`,
      [LlmErrorType.AUTH_ERROR]: 'API 认证失败，请检查 API Key',
      [LlmErrorType.ABORTED]: '请求已取消',
      [LlmErrorType.API_ERROR]: this.message || 'API 返回错误',
      [LlmErrorType.PARSE_ERROR]: '响应解析失败',
      [LlmErrorType.UNKNOWN_ERROR]: this.message || '未知错误'
    }
    return messages[this.type] || this.message
  }

  /**
   * 是否应该显示给用户
   */
  shouldShowToUser() {
    // 中止错误通常不需要显示
    return this.type !== LlmErrorType.ABORTED
  }
}

/**
 * 从原始错误创建 LlmError
 */
export function createLlmError(error, context = {}) {
  // 如果已经是 LlmError，直接返回
  if (error instanceof LlmError) {
    return error
  }

  // 处理中止错误
  if (error?.name === 'AbortError' || error?.name === 'DOMException') {
    return new LlmError(LlmErrorType.ABORTED, '请求已中止', error, context)
  }

  // AI SDK 无输出：通常为端点错误或上游返回异常，优先展示 cause
  if (error?.name === 'AI_NoOutputGeneratedError') {
    const cause = error?.cause
    const message = cause?.message || error?.message || 'No output generated. Check the stream for errors.'
    return new LlmError(LlmErrorType.UNKNOWN_ERROR, message, error, { ...context, cause: cause ? String(cause) : undefined })
  }

  // AI SDK API 调用错误（如 402 余额不足、4xx/5xx）：统一转为可展示的 LlmError
  if (error?.name === 'AI_APICallError') {
    const status = error?.statusCode ?? error?.status ?? error?.response?.status
    const rawMessage = error?.message || error?.cause?.message || ''
    if (status === 402 || /insufficient balance|余额不足|quota|余额|欠费/i.test(rawMessage)) {
      return new LlmError(
        LlmErrorType.API_ERROR,
        'API 余额不足，请充值后重试',
        error,
        { ...context, status: status || 402 }
      )
    }
    if (status === 401 || status === 403) {
      return new LlmError(
        LlmErrorType.AUTH_ERROR,
        rawMessage || 'API 认证失败，请检查 API Key',
        error,
        { ...context, status }
      )
    }
    if (status !== undefined) {
      return new LlmError(
        LlmErrorType.HTTP_ERROR,
        rawMessage || `API 请求失败 (${status})`,
        error,
        { ...context, status }
      )
    }
    return new LlmError(
      LlmErrorType.API_ERROR,
      rawMessage || 'API 调用失败',
      error,
      context
    )
  }

  // 处理网络错误
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new LlmError(LlmErrorType.NETWORK_ERROR, '网络连接失败', error, context)
  }

  // 优先从 context 中获取 status（用于 fetch API 返回的错误）
  const status = context?.status || error?.response?.status || error?.status

  // 处理 HTTP 错误（包括从 context 中获取的 status）
  if (status !== undefined) {
    if (status === 401 || status === 403) {
      return new LlmError(
        LlmErrorType.AUTH_ERROR,
        error?.response?.data?.error?.message || error?.message || '认证失败',
        error,
        { ...context, status }
      )
    }
    return new LlmError(
      LlmErrorType.HTTP_ERROR,
      error?.response?.data?.error?.message || error?.message || `HTTP 错误: ${status}`,
      error,
      { ...context, status }
    )
  }

  // 处理 HTTP 错误（从 error.response 获取）
  if (error?.response) {
    const responseStatus = error.response.status
    if (responseStatus === 401 || responseStatus === 403) {
      return new LlmError(
        LlmErrorType.AUTH_ERROR,
        `认证失败: ${error.response.data?.error?.message || error.message}`,
        error,
        { ...context, status: responseStatus }
      )
    }
    return new LlmError(
      LlmErrorType.HTTP_ERROR,
      `HTTP 错误: ${error.response.data?.error?.message || error.message}`,
      error,
      { ...context, status: responseStatus }
    )
  }

  // 默认未知错误
  return new LlmError(LlmErrorType.UNKNOWN_ERROR, error?.message || String(error), error, context)
}

/**
 * 处理并显示 LLM 错误
 */
export function handleLlmError(error, showToUser = true) {
  const llmError = createLlmError(error)
  const logger = createRendererLogger('LlmErrors')
  // 记录错误日志
  logger.error('LLM 错误:', {
    type: llmError.type,
    message: llmError.message,
    details: llmError.details,
    originalError: llmError.originalError
  })

  // 如果需要显示给用户
  if (showToUser && llmError.shouldShowToUser()) {
    eventBus.emit('show-error', llmError.getUserMessage())
  }

  return llmError
}

/**
 * 验证 API 配置
 */
export async function validateLlmConfig(config) {
  if (!config.type) {
    throw new LlmError(LlmErrorType.INVALID_CONFIG, '未选择 LLM 类型')
  }

  switch (config.type) {
    case 'metadoc':
      if (!config.apiKey || !config.apiUrl) {
        throw new LlmError(
          LlmErrorType.INVALID_CONFIG,
          'MetaDoc 配置不完整：缺少 API Key 或 API URL'
        )
      }
      break

    case 'openai':
    case 'openai-official':
    case 'deepseek':
    case 'gemini':
      if (!config.apiKey) {
        throw new LlmError(LlmErrorType.INVALID_CONFIG, `${config.type} 配置不完整：缺少 API Key`)
      }
      if (!config.apiUrl) {
        throw new LlmError(LlmErrorType.INVALID_CONFIG, `${config.type} 配置不完整：缺少 API URL`)
      }
      break

    case 'ollama':
      if (!config.apiUrl) {
        throw new LlmError(LlmErrorType.INVALID_CONFIG, 'Ollama 配置不完整：缺少 API URL')
      }
      break

    case 'manual':
      // manual类型不需要验证，使用Express服务器的模拟接口
      break

    default:
      throw new LlmError(LlmErrorType.INVALID_CONFIG, `不支持的 LLM 类型: ${config.type}`)
  }

  if (config.selectedModel && !config.selectedModel.trim()) {
    throw new LlmError(LlmErrorType.INVALID_CONFIG, '未选择模型')
  }
}
