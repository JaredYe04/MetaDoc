/**
 * 统一的工具调用处理工具
 * 用于解析、验证和处理AI输出的工具调用标记
 */

import { extractOuterJsonString } from '../regex-utils'
import { createRendererLogger } from '../logger'
import { toolCallParserManager } from './tool-call-parsers'

// 懒加载logger，避免初始化顺序问题
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('ToolCallProcessor')
  }
  return loggerInstance
}

/**
 * 工具调用解析结果
 */
export interface ParsedToolCall {
  id: string
  tool_id: string
  parameters: Record<string, unknown>
  isValid: boolean
  error?: string
  rawContent?: string
}

/**
 * 工具调用解析选项
 */
export interface ParseToolCallOptions {
  /**
   * 是否宽松解析（不需要完整的结束标记）
   * 默认：false（严格模式，需要完整的<tool_call></tool_call>）
   */
  loose?: boolean
  /**
   * 是否验证工具ID存在
   * 默认：false（不验证，允许任何工具ID）
   */
  validateToolId?: boolean
  /**
   * 工具ID验证函数
   */
  toolIdValidator?: (toolId: string) => boolean
}

/**
 * 解析工具调用标记
 * 支持多种格式：
 * 1. <tool_call>{"name": "tool_id", "arguments": {...}}</tool_call> (标准格式)
 * 2. <｜DSML｜function_calls>...</｜DSML｜function_calls> (DeepSeek DSML格式)
 * 3. {"tool": "tool_id", "arguments": {...}} (OpenAI格式)
 *
 * @param content 包含工具调用标记的内容
 * @param options 解析选项
 * @returns 解析后的工具调用数组，如果解析失败返回null
 */
export function parseToolCalls(
  content: string,
  options: ParseToolCallOptions = {}
): ParsedToolCall[] | null {
  const { loose = false, validateToolId = false, toolIdValidator } = options

  try {
    getLogger().debug('[parseToolCalls] 开始解析工具调用', {
      contentLength: content.length,
      loose,
      validateToolId
    })

    // 使用新的解析器管理器（支持多种格式）
    const result = toolCallParserManager.parse(content, {
      loose,
      validateToolId,
      toolIdValidator
    })

    if (result) {
      getLogger().debug(`[parseToolCalls] 解析完成，找到 ${result.length} 个工具调用`)
    } else {
      getLogger().debug('[parseToolCalls] 未找到工具调用')
    }

    return result
  } catch (error) {
    getLogger().error('[parseToolCalls] 解析工具调用失败:', error)
    // 如果新解析器失败，尝试使用旧的解析逻辑作为fallback
    return parseToolCallsLegacy(content, options)
  }
}

/**
 * 旧版解析逻辑（作为fallback）
 * @deprecated 使用新的解析器系统，此方法仅作为兼容性fallback
 */
function parseToolCallsLegacy(
  content: string,
  options: ParseToolCallOptions = {}
): ParsedToolCall[] | null {
  const { loose = false, validateToolId = false, toolIdValidator } = options

  try {
    // 检查是否有开始标记
    const beginIndex = content.indexOf('<tool_call>')
    if (beginIndex === -1) {
      return null
    }

    const toolCalls: ParsedToolCall[] = []

    // 根据模式选择不同的正则表达式
    const toolCallPattern = loose
      ? /<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/gi // 宽松模式：允许没有结束标记
      : /<tool_call>([\s\S]*?)<\/tool_call>/gi // 严格模式：必须有结束标记

    let match
    let index = 0

    while ((match = toolCallPattern.exec(content)) !== null) {
      if (!match[1]) continue

      const toolCallContent = match[1].trim()
      getLogger().debug(
        `[parseToolCallsLegacy] 解析工具调用 ${index + 1}，内容长度:`,
        toolCallContent.length
      )

      const parsed = parseSingleToolCall(toolCallContent, index)

      if (parsed) {
        // 验证工具ID（如果需要）
        if (validateToolId && parsed.isValid) {
          if (toolIdValidator) {
            if (!toolIdValidator(parsed.tool_id)) {
              parsed.isValid = false
              parsed.error = `工具ID "${parsed.tool_id}" 不存在或不可用`
            }
          }
        }

        toolCalls.push(parsed)
        index++
      }
    }

    getLogger().debug(`[parseToolCallsLegacy] 解析完成，找到 ${toolCalls.length} 个工具调用`)
    return toolCalls.length > 0 ? toolCalls : null
  } catch (error) {
    getLogger().error('[parseToolCallsLegacy] 解析工具调用失败:', error)
    return null
  }
}

/**
 * 解析单个工具调用
 *
 * @param toolCallContent 工具调用内容（JSON字符串）
 * @param index 索引（用于生成ID）
 * @returns 解析结果，如果解析失败返回null
 */
function parseSingleToolCall(toolCallContent: string, index: number): ParsedToolCall | null {
  try {
    // 提取JSON字符串
    let jsonStr = extractOuterJsonString(toolCallContent)
    if (!jsonStr) {
      getLogger().warn(`[parseSingleToolCall] 工具调用 ${index + 1} 未找到JSON字符串，尝试修复...`)
      // 如果提取失败，可能是JSON不完整或格式有问题，先尝试修复
      const fixed = tryFixJsonFormat(toolCallContent)
      if (fixed) {
        return fixed
      }
      return createInvalidToolCall(toolCallContent, index, '未找到有效的JSON字符串')
    }

    // 在解析前先清理末尾逗号（常见问题）
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1')

    let parsed: any
    try {
      parsed = JSON.parse(jsonStr)
    } catch (parseError) {
      // 如果解析失败，尝试修复后再解析
      getLogger().warn(`[parseSingleToolCall] JSON解析失败，尝试修复:`, parseError)
      const fixed = tryFixJsonFormat(toolCallContent)
      if (fixed) {
        return fixed
      }
      throw parseError
    }

    // 支持多种格式：
    // 1. {"name": "tool_id", "arguments": {...}} (标准格式)
    // 2. {"tool_id": "tool_id", "parameters": {...}} (兼容旧格式)
    // 3. {"toolId": "tool_id", "params": {...}} (兼容格式)
    const toolId = parsed.name || parsed.tool_id || parsed.toolId
    const parameters = parsed.arguments || parsed.parameters || parsed.params || {}

    // 检查工具ID是否存在
    if (!toolId) {
      getLogger().warn(`[parseSingleToolCall] 工具调用 ${index + 1} 缺少工具ID`)
      return createInvalidToolCall(toolCallContent, index, '缺少工具ID（name/tool_id字段）', {
        parsed,
        suggestion: '正确的格式应该是：{"name": "工具ID", "arguments": {...}}'
      })
    }

    // 验证参数是否为对象
    if (typeof parameters !== 'object' || parameters === null || Array.isArray(parameters)) {
      getLogger().warn(`[parseSingleToolCall] 工具调用 ${index + 1} 参数格式错误`)
      return createInvalidToolCall(toolCallContent, index, '参数必须是对象类型', {
        parsed,
        suggestion: '正确的格式应该是：{"name": "工具ID", "arguments": {"参数名": "参数值"}}'
      })
    }

    getLogger().debug(
      `[parseSingleToolCall] 成功解析工具调用 ${index + 1}: toolId=${toolId}`,
      parameters
    )

    return {
      id: `call_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
      tool_id: toolId,
      parameters,
      isValid: true,
      rawContent: toolCallContent
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e)
    getLogger().warn(`[parseSingleToolCall] 解析工具调用 ${index + 1} 失败:`, errorMsg)

    // 尝试修复常见的JSON格式问题
    const fixed = tryFixJsonFormat(toolCallContent)
    if (fixed) {
      getLogger().info(`[parseSingleToolCall] 修复后成功解析工具调用 ${index + 1}`)
      return fixed
    }

    return createInvalidToolCall(toolCallContent, index, `JSON解析失败: ${errorMsg}`)
  }
}

/**
 * 尝试修复JSON格式问题（如缺少闭合括号、末尾逗号等）
 */
function tryFixJsonFormat(toolCallContent: string): ParsedToolCall | null {
  try {
    let fixedContent = toolCallContent.trim()

    // 修复1: 移除JSON数组和对象末尾的逗号
    // 匹配模式：在 ] 或 } 之前的逗号（后面可能跟着空白字符）
    fixedContent = fixedContent.replace(/,\s*([}\]])/g, '$1')

    // 修复2: 检查是否缺少闭合括号
    const openBraces = (fixedContent.match(/{/g) || []).length
    const closeBraces = (fixedContent.match(/}/g) || []).length
    if (openBraces > closeBraces) {
      fixedContent += '}'.repeat(openBraces - closeBraces)
    }

    const openBrackets = (fixedContent.match(/\[/g) || []).length
    const closeBrackets = (fixedContent.match(/\]/g) || []).length
    if (openBrackets > closeBrackets) {
      fixedContent += ']'.repeat(openBrackets - closeBrackets)
    }

    // 修复3: 处理字符串中的转义问题
    // 如果JSON字符串中包含未转义的引号，可能会导致解析失败
    // 这里先尝试提取，如果失败再尝试其他修复

    // 再次尝试解析
    let jsonStr = extractOuterJsonString(fixedContent)

    // 如果提取失败，尝试更激进的修复
    if (!jsonStr) {
      // 尝试找到第一个 { 或 [，然后手动匹配到对应的结束符
      const startIdx = fixedContent.search(/[{[]/)
      if (startIdx !== -1) {
        const openChar = fixedContent[startIdx]
        const closeChar = openChar === '{' ? '}' : ']'
        let depth = 0
        let endIdx = startIdx

        for (let i = startIdx; i < fixedContent.length; i++) {
          const char = fixedContent[i]
          if (char === openChar) {
            depth++
          } else if (char === closeChar) {
            depth--
            if (depth === 0) {
              endIdx = i
              break
            }
          }
        }

        if (endIdx > startIdx) {
          jsonStr = fixedContent.slice(startIdx, endIdx + 1)
        }
      }
    }

    if (jsonStr) {
      // 再次清理末尾逗号（在提取后）
      jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1')

      try {
        const parsed = JSON.parse(jsonStr)
        const toolId = parsed.name || parsed.tool_id || parsed.toolId
        const parameters = parsed.arguments || parsed.parameters || parsed.params || {}

        if (toolId) {
          return {
            id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            tool_id: toolId,
            parameters,
            isValid: true,
            rawContent: toolCallContent
          }
        }
      } catch (parseError) {
        getLogger().warn('[tryFixJsonFormat] 修复后的JSON仍然无法解析:', parseError)
        // 如果还是失败，尝试更激进的修复：移除所有可能的末尾逗号
        try {
          let aggressiveFix = jsonStr.replace(/,\s*([}\]])/g, '$1')
          // 移除对象和数组中的尾随逗号
          aggressiveFix = aggressiveFix.replace(/,(\s*[}\]])/g, '$1')
          const parsed = JSON.parse(aggressiveFix)
          const toolId = parsed.name || parsed.tool_id || parsed.toolId
          const parameters = parsed.arguments || parsed.parameters || parsed.params || {}

          if (toolId) {
            getLogger().info('[tryFixJsonFormat] 使用激进修复成功解析JSON')
            return {
              id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              tool_id: toolId,
              parameters,
              isValid: true,
              rawContent: toolCallContent
            }
          }
        } catch (aggressiveError) {
          getLogger().warn('[tryFixJsonFormat] 激进修复也失败:', aggressiveError)
        }
      }
    }
  } catch (fixError) {
    getLogger().warn('[tryFixJsonFormat] 修复JSON失败:', fixError)
  }

  return null
}

/**
 * 创建无效的工具调用（用于错误处理）
 */
function createInvalidToolCall(
  rawContent: string,
  index: number,
  error: string,
  context?: {
    parsed?: any
    suggestion?: string
  }
): ParsedToolCall {
  const errorMessage = context?.suggestion ? `${error}\n\n建议：${context.suggestion}` : error

  return {
    id: `call_invalid_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
    tool_id: 'dummy-tool', // 使用dummy-tool作为fallback
    parameters: {
      error: errorMessage,
      rawContent,
      parsed: context?.parsed
    },
    isValid: false,
    error: errorMessage,
    rawContent
  }
}

/**
 * 清理消息中的工具调用标记
 * 注意：只有在确认工具调用已被解析并添加到消息对象后，才应该清理标记
 * 支持多种格式的标记清除
 *
 * @param content 消息内容
 * @param hasToolCalls 消息是否已包含tool_calls属性（已解析）
 * @returns 清理后的内容
 */
export function cleanToolCallMarkers(content: string, hasToolCalls: boolean = false): string {
  // 如果消息已经有tool_calls，说明已经解析完成，可以安全清理标记
  if (hasToolCalls) {
    // 使用解析器管理器清除所有格式的标记
    let cleaned = toolCallParserManager.cleanAllMarkers(content)

    // 清理旧的标记格式（兼容性，保留向后兼容）
    cleaned = cleaned
      .replace(/<\|redacted_tool_calls_begin\|>[\s\S]*?<\|redacted_tool_calls_end\|>/gi, '')
      .trim()
    cleaned = cleaned.replace(/<｜tools▁call▁begin｜>[\s\S]*?<｜tools▁call▁end｜>/gi, '').trim()

    return cleaned
  }

  // 如果还没有tool_calls，保留标记以便后续解析
  // 但可以清理一些明显无效的标记（如只有开始标记没有结束标记，且已经过了很长时间）
  // 这里暂时不清理，让解析逻辑处理
  return content
}

/**
 * 检查内容是否包含工具调用标记
 * 支持多种格式的检测
 */
export function hasToolCallMarkers(content: string): boolean {
  // 使用解析器管理器检测所有格式
  if (toolCallParserManager.hasAnyToolCallMarkers(content)) {
    return true
  }

  // 检查旧的标记格式（兼容性）
  return /<\|redacted_tool_calls_begin\|>/i.test(content) || /<｜tools▁call▁begin｜>/i.test(content)
}

/**
 * 检查内容是否包含完整的工具调用标记（有开始和结束）
 * 支持多种格式的检测
 */
export function hasCompleteToolCallMarkers(content: string): boolean {
  // 检查标准格式
  const beginCount = (content.match(/<tool_call>/gi) || []).length
  const endCount = (content.match(/<\/tool_call>/gi) || []).length
  if (beginCount > 0 && endCount > 0 && beginCount === endCount) {
    return true
  }

  // 检查DSML格式
  const dsmlBeginCount = (content.match(/<｜DSML｜function_calls>/gi) || []).length
  const dsmlEndCount = (content.match(/<\/｜DSML｜function_calls>/gi) || []).length
  if (dsmlBeginCount > 0 && dsmlEndCount > 0 && dsmlBeginCount === dsmlEndCount) {
    return true
  }

  // OpenAI格式是纯JSON，不需要开始/结束标记，只要检测到符合格式的JSON即可
  if (toolCallParserManager.hasAnyToolCallMarkers(content)) {
    // 如果解析器能检测到，说明有完整的标记
    return true
  }

  return false
}
