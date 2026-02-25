import { createLlmError, LlmErrorType } from './llm-errors.js'
import { getSetting } from './settings.js'

/**
 * 发送非流式 HTTP 请求
 */
export async function sendNonStreamRequest(url, payload, headers = {}, signal = null) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(payload),
    ...(signal ? { signal } : {})
  })

  if (!response.ok) {
    let errorMessage = `HTTP error! status: ${response.status}`
    try {
      const errorData = await response.json()
      errorMessage = errorData.error?.message || errorMessage
    } catch {
      // 忽略 JSON 解析错误
    }
    throw createLlmError(new Error(errorMessage), { status: response.status, url })
  }

  return await response.json()
}

/**
 * 发送流式 HTTP 请求
 * @param {Function} onChunk - 处理每个 chunk 的回调函数
 * @param {Function} onComplete - 处理完成时的回调函数，接收最后一个包含 usage 的 chunk（如果有）
 * @returns {Promise} 返回最后一个包含 usage 的 chunk（如果有）
 */
export async function sendStreamRequest(
  url,
  payload,
  headers = {},
  signal = null,
  onChunk = null,
  onComplete = null
) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(payload),
    ...(signal ? { signal } : {})
  })

  if (!response.ok) {
    let errorMessage = `HTTP error! status: ${response.status}`
    try {
      const errorData = await response.json()
      errorMessage = errorData.error?.message || errorMessage
    } catch {
      // 忽略 JSON 解析错误
    }
    throw createLlmError(new Error(errorMessage), { status: response.status, url })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let lastChunkWithUsage = null

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      if (signal?.aborted) {
        throw createLlmError(new DOMException('Aborted', 'AbortError'), { url })
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // 保留未完成的行

      for (const line of lines) {
        if (!line.trim()) continue

        try {
          let json = line.startsWith('data: ') ? line.replace(/^data: /, '') : line

          if (json === '[DONE]') {
            // 处理完成回调
            if (onComplete && lastChunkWithUsage) {
              try {
                await onComplete(lastChunkWithUsage)
              } catch (error) {
                // 回调中的错误应该向上抛出
                throw createLlmError(error, { url })
              }
            }
            continue
          }

          const data = JSON.parse(json)

          // 检查是否包含 usage 信息
          if (data.usage || extractUsageFromResponse(data)) {
            lastChunkWithUsage = data
          }

          if (onChunk) {
            try {
              await onChunk(data)
            } catch (error) {
              // 回调中的错误应该向上抛出
              throw createLlmError(error, { url })
            }
          }
        } catch (error) {
          // 如果是中止错误，直接抛出
          if (error.name === 'AbortError' || error instanceof DOMException) {
            throw createLlmError(error, { url })
          }
          // 如果是已经转换过的 LlmError，直接抛出
          if (error.type) {
            throw error
          }
          // JSON 解析错误可以忽略，继续处理下一行
          // 但如果是其他错误（比如回调中的错误），应该抛出
          // 由于上面的 onChunk 已经用 try-catch 包裹，这里主要是 JSON 解析错误
        }
      }
    }

    // 如果流结束时还有 usage 信息，调用完成回调
    if (onComplete && lastChunkWithUsage) {
      try {
        await onComplete(lastChunkWithUsage)
      } catch (error) {
        // 回调中的错误应该向上抛出
        throw createLlmError(error, { url })
      }
    }
  } catch (error) {
    // 确保所有错误都被正确传播
    // 如果已经是 LlmError，直接抛出
    if (error.type) {
      throw error
    }
    // 否则转换为 LlmError 后抛出
    throw createLlmError(error, { url })
  }

  return lastChunkWithUsage
}

/**
 * 从响应中提取文本内容
 */
export function extractTextFromResponse(result, responseType = 'completion') {
  if (responseType === 'completion') {
    // Completions API 格式
    if (result.response !== undefined) {
      return result.response
    }
    if (result.choices && result.choices[0]) {
      return result.choices[0].text || result.choices[0].message?.content || ''
    }
  } else if (responseType === 'chat') {
    // Chat Completions API 格式
    if (result.choices && result.choices[0]) {
      return result.choices[0].message?.content || ''
    }
  }

  return ''
}

/**
 * 从流式响应中提取文本增量
 */
export function extractTextDeltaFromChunk(chunk, responseType = 'completion') {
  if (responseType === 'completion') {
    // Completions API 流式格式
    if (chunk.response !== undefined) {
      return chunk.response
    }
    if (chunk.choices && chunk.choices[0]) {
      return chunk.choices[0].text || ''
    }
  } else if (responseType === 'chat') {
    // Chat Completions API 流式格式
    if (chunk.choices && chunk.choices[0]) {
      const delta = chunk.choices[0].delta
      return delta?.content || ''
    }
  }

  return ''
}

/**
 * 处理思考标签自动移除
 * 移除 <think>...</think> 和 <思考>...</思考> 标签及其内容
 */
export async function processThinkTag(text) {
  const autoRemoveThinkTag = await getSetting('autoRemoveThinkTag')
  if (!autoRemoveThinkTag || !text) {
    return text
  }

  let result = text

  // 移除 <think>...</think> 标签（不区分大小写，支持多行）
  result = result.replace(/<think>[\s\S]*?<\/think>/gi, '')

  // 移除 <思考>...</思考> 标签（支持多行）
  result = result.replace(/<思考>[\s\S]*?<\/思考>/g, '')

  // 移除 </think> 结尾（兼容旧格式）
  if (result.trim().endsWith('</think>')) {
    result = result.replace(/<\/redacted_reasoning>\s*$/, '')
  }

  return result
}

/**
 * 从响应中提取 token 使用量信息
 * @param {Object} result - API 响应对象
 * @returns {Object|null} usage 对象，包含 prompt_tokens, completion_tokens, total_tokens
 */
export function extractUsageFromResponse(result) {
  if (!result || typeof result !== 'object') {
    return null
  }

  // OpenAI 兼容格式：直接返回 usage 字段
  if (result.usage && typeof result.usage === 'object') {
    return {
      prompt_tokens: result.usage.prompt_tokens || 0,
      completion_tokens: result.usage.completion_tokens || 0,
      total_tokens: result.usage.total_tokens || 0
    }
  }

  // Ollama 格式：使用 prompt_eval_count 和 eval_count
  if (result.prompt_eval_count !== undefined || result.eval_count !== undefined) {
    const prompt_tokens = result.prompt_eval_count || 0
    const completion_tokens = result.eval_count || 0
    return {
      prompt_tokens,
      completion_tokens,
      total_tokens: prompt_tokens + completion_tokens
    }
  }

  return null
}
