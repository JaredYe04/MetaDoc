/**
 * 工具调用解析器配置系统
 * 支持多种不同的工具调用格式，避免重复匹配
 */

import { extractOuterJsonString } from '../regex-utils'
import { createRendererLogger } from '../logger'
import type { ParsedToolCall } from './tool-call-processor'

// 懒加载logger
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('ToolCallParsers')
  }
  return loggerInstance
}

/**
 * 工具调用解析器接口
 */
export interface ToolCallParser {
  /** 解析器名称（用于日志） */
  name: string

  /**
   * 检测内容是否包含此格式的工具调用
   * 用于快速判断是否需要解析
   */
  detect(content: string): boolean

  /**
   * 解析工具调用
   * @param content 内容
   * @param options 解析选项
   * @returns 解析结果数组，如果没有找到返回null
   */
  parse(
    content: string,
    options?: {
      loose?: boolean
      validateToolId?: boolean
      toolIdValidator?: (toolId: string) => boolean
    }
  ): ParsedToolCall[] | null

  /**
   * 清除此格式的标记
   * @param content 内容
   * @returns 清除后的内容
   */
  cleanMarkers(content: string): string

  /**
   * 获取匹配标记的正则表达式（用于检测和清除）
   */
  getMarkerPattern(): RegExp
}

/**
 * 标准 <tool_call> 格式解析器
 * 格式: <tool_call>{"name": "tool_id", "arguments": {...}}</tool_call>
 */
class StandardToolCallParser implements ToolCallParser {
  name = 'standard-tool-call'

  detect(content: string): boolean {
    // 支持多种标签变体：tool_call, tool-call, toolCall, function_call, function-call
    return /<(?:tool[_-]?call|function[_-]?call)>/i.test(content)
  }

  parse(
    content: string,
    options: {
      loose?: boolean
      validateToolId?: boolean
      toolIdValidator?: (toolId: string) => boolean
    } = {}
  ): ParsedToolCall[] | null {
    const { loose = false, validateToolId = false, toolIdValidator } = options

    try {
      // 支持多种标签变体
      const toolCallPattern = loose
        ? /<(?:tool[_-]?call|function[_-]?call)>([\s\S]*?)(?:<\/(?:tool[_-]?call|function[_-]?call)>|$)/gi
        : /<(?:tool[_-]?call|function[_-]?call)>([\s\S]*?)<\/(?:tool[_-]?call|function[_-]?call)>/gi

      const toolCalls: ParsedToolCall[] = []
      let match
      let index = 0

      while ((match = toolCallPattern.exec(content)) !== null) {
        if (!match[1]) continue

        const toolCallContent = match[1].trim()
        // 支持内容为 JSON 数组 [{}, {}, ...]：展开为多个工具调用
        const preParsed = parseLooseJson(
          extractOuterJsonString(toolCallContent) || toolCallContent.trim()
        )
        const isArray =
          preParsed != null && Array.isArray(preParsed) && preParsed.length > 0
        if (isArray) {
          for (let i = 0; i < preParsed.length; i++) {
            const parsed = this.parseSingleToolCall(
              typeof preParsed[i] === 'object'
                ? JSON.stringify(preParsed[i])
                : String(preParsed[i]),
              index
            )
            if (parsed) {
              if (validateToolId && parsed.isValid && toolIdValidator) {
                if (!toolIdValidator(parsed.tool_id)) {
                  parsed.isValid = false
                  parsed.error = `工具ID "${parsed.tool_id}" 不存在或不可用`
                }
              }
              toolCalls.push(parsed)
              index++
            }
          }
        } else {
          const parsed = this.parseSingleToolCall(toolCallContent, index)
          if (parsed) {
            if (validateToolId && parsed.isValid && toolIdValidator) {
              if (!toolIdValidator(parsed.tool_id)) {
                parsed.isValid = false
                parsed.error = `工具ID "${parsed.tool_id}" 不存在或不可用`
              }
            }
            toolCalls.push(parsed)
            index++
          }
        }
      }

      return toolCalls.length > 0 ? toolCalls : null
    } catch (error) {
      getLogger().error('[StandardToolCallParser] 解析失败:', error)
      return null
    }
  }

  private parseSingleToolCall(toolCallContent: string, index: number): ParsedToolCall | null {
    try {
      // 检查是否包含嵌套的DSML格式（<｜DSML｜invoke、<｜DSML｜function_calls>、<｜DSML｜call> 或 <｜DSML｜_call>）
      // 如果包含，委托给DSML解析器处理
      if (
        /<｜DSML｜invoke/i.test(toolCallContent) ||
        /<｜DSML｜function_calls>/i.test(toolCallContent) ||
        /<｜DSML｜call/i.test(toolCallContent) ||
        /<｜DSML｜_call/i.test(toolCallContent)
      ) {
        getLogger().debug('[StandardToolCallParser] 检测到嵌套的DSML格式，委托给DSML解析器')
        const dsmlParser = new DeepSeekDSMLParser()
        const dsmlResults = dsmlParser.parse(toolCallContent, {})
        if (dsmlResults && dsmlResults.length > 0) {
          // 返回第一个结果（通常只有一个）
          return dsmlResults[0]
        }
        // 如果DSML解析失败，继续尝试JSON解析
      }

      // 尝试使用DOMParser解析XML格式
      // 支持两种格式：
      // 1. 纯XML格式：<tool_id>{...}</tool_id>（标签名即工具ID）
      // 2. 标准XML格式：<name>tool_id</name><arguments>{...}</arguments>
      try {
        const parser = new DOMParser()
        // 尝试解析为XML（如果失败会返回包含解析错误的文档）
        const xmlDoc = parser.parseFromString(toolCallContent, 'text/xml')

        // 检查是否有解析错误
        const parseError = xmlDoc.querySelector('parsererror')
        if (!parseError) {
          // 解析成功，检查是哪种XML格式

          // 首先检查是否是标准XML格式（<name>...</name><arguments>...</arguments>）
          const nameElement = xmlDoc.querySelector('name')
          const argumentsElement = xmlDoc.querySelector('arguments')

          if (nameElement && argumentsElement) {
            getLogger().debug('[StandardToolCallParser] 检测到标准XML格式的工具调用')
            const toolId = nameElement.textContent?.trim() || ''
            const argumentsContent = argumentsElement.textContent?.trim() || ''

            if (!toolId) {
              return this.createInvalidToolCall(
                toolCallContent,
                index,
                'XML格式中缺少工具ID（<name>标签为空）'
              )
            }

            // 尝试解析arguments中的JSON
            let parameters: Record<string, unknown> | null = null

            // 先尝试提取JSON字符串
            let jsonStr = extractOuterJsonString(argumentsContent) || argumentsContent.trim()

            // 尝试宽松的JSON解析
            let parsed: any = parseLooseJson(jsonStr)

            // 如果宽松解析失败，尝试修复后解析
            if (!parsed) {
              const fixed = tryFixJsonFormat(jsonStr)
              if (fixed) {
                parsed = parseLooseJson(fixed)
              }
            }

            // 如果仍然失败，尝试标准解析
            if (!parsed) {
              try {
                parsed = JSON.parse(jsonStr.replace(/,\s*([}\]])/g, '$1'))
              } catch (parseError) {
                return this.createInvalidToolCall(
                  toolCallContent,
                  index,
                  `XML格式中arguments的JSON解析失败: ${parseError}`
                )
              }
            }

            // 确保参数是对象类型
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
              parameters = parsed
            } else {
              return this.createInvalidToolCall(
                toolCallContent,
                index,
                'XML格式中arguments必须是JSON对象'
              )
            }

            if (!parameters) {
              return this.createInvalidToolCall(
                toolCallContent,
                index,
                'XML格式中arguments解析失败'
              )
            }

            getLogger().debug(`[StandardToolCallParser] 标准XML格式解析成功: toolId=${toolId}`)

            return {
              id: `call_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
              tool_id: toolId,
              parameters,
              isValid: true,
              rawContent: toolCallContent
            }
          }

          // 检查是否是纯XML格式（标签名即工具ID）
          // 排除保留的标签名（如name、arguments等，这些是标准XML格式）
          const reservedTags = [
            'name',
            'arguments',
            'parameters',
            'params',
            'args',
            'tool_call',
            'tool-call',
            'function_call',
            'function-call'
          ]
          const rootElement = xmlDoc.documentElement

          if (
            rootElement &&
            rootElement.tagName &&
            !reservedTags.includes(rootElement.tagName.toLowerCase())
          ) {
            const toolId = rootElement.tagName
            const jsonContent = rootElement.textContent?.trim() || ''

            getLogger().debug(
              `[StandardToolCallParser] 检测到纯XML格式的工具调用: toolId=${toolId}`
            )

            if (!toolId) {
              return this.createInvalidToolCall(toolCallContent, index, '纯XML格式中标签名为空')
            }

            // 尝试解析标签内容中的JSON
            let parameters: Record<string, unknown> | null = null

            // 先尝试提取JSON字符串
            let jsonStr = extractOuterJsonString(jsonContent) || jsonContent.trim()

            // 尝试宽松的JSON解析
            let parsed: any = parseLooseJson(jsonStr)

            // 如果宽松解析失败，尝试修复后解析
            if (!parsed) {
              const fixed = tryFixJsonFormat(jsonStr)
              if (fixed) {
                parsed = parseLooseJson(fixed)
              }
            }

            // 如果仍然失败，尝试标准解析
            if (!parsed) {
              try {
                parsed = JSON.parse(jsonStr.replace(/,\s*([}\]])/g, '$1'))
              } catch (parseError) {
                return this.createInvalidToolCall(
                  toolCallContent,
                  index,
                  `纯XML格式中JSON解析失败: ${parseError}`
                )
              }
            }

            // 确保参数是对象类型
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
              parameters = parsed
            } else {
              return this.createInvalidToolCall(
                toolCallContent,
                index,
                '纯XML格式中内容必须是JSON对象'
              )
            }

            if (!parameters) {
              return this.createInvalidToolCall(toolCallContent, index, '纯XML格式中JSON解析失败')
            }

            getLogger().debug(`[StandardToolCallParser] 纯XML格式解析成功: toolId=${toolId}`)

            return {
              id: `call_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
              tool_id: toolId,
              parameters,
              isValid: true,
              rawContent: toolCallContent
            }
          }
        }
      } catch (xmlParseError) {
        // XML解析失败，继续尝试其他格式
        getLogger().debug('[StandardToolCallParser] XML解析失败，继续尝试其他格式:', xmlParseError)
      }

      // 尝试从代码块中提取JSON（支持 ```json ... ``` 或 ``` ... ```）
      let jsonStr = toolCallContent.trim()

      // 检查是否是代码块格式
      const codeBlockMatch = jsonStr.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim()
      }

      // 尝试提取JSON字符串
      if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
        jsonStr = extractOuterJsonString(toolCallContent) || jsonStr
      }

      if (!jsonStr || !jsonStr.trim()) {
        return this.createInvalidToolCall(toolCallContent, index, '未找到有效的JSON字符串')
      }

      // 尝试宽松的JSON解析
      let parsed: any = parseLooseJson(jsonStr)

      // 如果宽松解析失败，尝试修复后解析
      if (!parsed) {
        const fixed = tryFixJsonFormat(jsonStr)
        if (fixed) {
          parsed = parseLooseJson(fixed)
        }
      }

      // 如果仍然失败，尝试标准解析
      if (!parsed) {
        try {
          parsed = JSON.parse(jsonStr.replace(/,\s*([}\]])/g, '$1'))
        } catch (parseError) {
          return this.createInvalidToolCall(toolCallContent, index, `JSON解析失败: ${parseError}`)
        }
      }

      // 支持数组格式：如果解析结果是数组，取第一个元素
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) {
          return this.createInvalidToolCall(toolCallContent, index, '工具调用数组为空')
        }
        parsed = parsed[0] // 取第一个工具调用
      }

      // 使用增强的字段提取函数
      const toolId = extractToolId(parsed)

      // 先检查原始对象中的参数字段类型，如果存在但不是对象类型，应该报错
      const paramFields = [
        'arguments',
        'parameters',
        'params',
        'args',
        'input',
        'inputs',
        'data',
        'options'
      ]
      for (const field of paramFields) {
        if (parsed[field] !== undefined) {
          const paramValue = parsed[field]
          // 如果参数字段存在但不是对象类型（是字符串、数组等），应该报错
          if (typeof paramValue !== 'object' || paramValue === null || Array.isArray(paramValue)) {
            return this.createInvalidToolCall(
              toolCallContent,
              index,
              `参数必须是对象类型（${field}字段的值不是对象类型）`
            )
          }
        }
      }

      const parameters = extractParameters(parsed)

      if (!toolId) {
        return this.createInvalidToolCall(
          toolCallContent,
          index,
          '缺少工具ID（支持的字段：name, tool_id, toolId, tool, function等）'
        )
      }

      if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
        return this.createInvalidToolCall(
          toolCallContent,
          index,
          '参数必须是对象类型（支持的字段：arguments, parameters, params等）'
        )
      }

      return {
        id: `call_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
        tool_id: toolId,
        parameters,
        isValid: true,
        rawContent: toolCallContent
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      return this.createInvalidToolCall(toolCallContent, index, `解析失败: ${errorMsg}`)
    }
  }

  private createInvalidToolCall(rawContent: string, index: number, error: string): ParsedToolCall {
    return {
      id: `call_invalid_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
      tool_id: 'dummy-tool',
      parameters: {
        error,
        rawContent
      },
      isValid: false,
      error,
      rawContent
    }
  }

  cleanMarkers(content: string): string {
    // 支持多种标签变体
    return content
      .replace(
        /<(?:tool[_-]?call|function[_-]?call)>[\s\S]*?<\/(?:tool[_-]?call|function[_-]?call)>/gi,
        ''
      )
      .trim()
  }

  getMarkerPattern(): RegExp {
    // 支持多种标签变体
    return /<(?:tool[_-]?call|function[_-]?call)>[\s\S]*?<\/(?:tool[_-]?call|function[_-]?call)>/gi
  }
}

/**
 * DeepSeek DSML 格式解析器
 * 格式: <｜DSML｜function_calls>...</｜DSML｜function_calls>
 * 内部格式: <｜DSML｜invoke name="tool_id">...</｜DSML｜invoke>
 */
class DeepSeekDSMLParser implements ToolCallParser {
  name = 'deepseek-dsml'

  detect(content: string): boolean {
    return (
      /<｜DSML｜function_calls>/i.test(content) ||
      /<｜DSML｜invoke/i.test(content) ||
      /<｜DSML｜call/i.test(content) ||
      /<｜DSML｜_call/i.test(content)
    )
  }

  parse(
    content: string,
    options: {
      loose?: boolean
      validateToolId?: boolean
      toolIdValidator?: (toolId: string) => boolean
    } = {}
  ): ParsedToolCall[] | null {
    const { validateToolId = false, toolIdValidator } = options

    try {
      // 首先匹配完整的 call 块（优先级最高，因为它是外层容器）
      // 支持 <｜DSML｜call> 与 <｜DSML｜_call> 两种闭合标签
      const callPattern = /<｜DSML｜_?call>([\s\S]*?)<\/｜DSML｜_?call>/i
      const callMatch = content.match(callPattern)

      if (callMatch) {
        const callContent = callMatch[1]
        // call块内部可能包含function_calls或invoke标签
        const functionCallsPattern = /<｜DSML｜function_calls>([\s\S]*?)<\/｜DSML｜function_calls>/i
        const functionCallsMatch = callContent.match(functionCallsPattern)

        if (functionCallsMatch) {
          const functionCallsContent = functionCallsMatch[1]
          return this.parseInvokeTags(functionCallsContent, validateToolId, toolIdValidator)
        } else {
          // 如果没有function_calls，尝试直接解析invoke标签
          return this.parseInvokeTags(callContent, validateToolId, toolIdValidator)
        }
      }

      // 匹配完整的 function_calls 块
      const functionCallsPattern = /<｜DSML｜function_calls>([\s\S]*?)<\/｜DSML｜function_calls>/i
      const functionCallsMatch = content.match(functionCallsPattern)

      if (!functionCallsMatch) {
        // 如果没有完整的 function_calls 块，尝试直接匹配 invoke
        return this.parseInvokeTags(content, validateToolId, toolIdValidator)
      }

      const functionCallsContent = functionCallsMatch[1]
      return this.parseInvokeTags(functionCallsContent, validateToolId, toolIdValidator)
    } catch (error) {
      getLogger().error('[DeepSeekDSMLParser] 解析失败:', error)
      return null
    }
  }

  private parseInvokeTags(
    content: string,
    validateToolId: boolean,
    toolIdValidator?: (toolId: string) => boolean
  ): ParsedToolCall[] | null {
    // 匹配 <｜DSML｜invoke name="tool_id">...</｜DSML｜invoke>
    // 注意：需要支持多行和换行符，使用更精确的匹配方式
    // 使用平衡括号匹配来确保正确匹配嵌套的标签
    const toolCalls: ParsedToolCall[] = []
    let searchIndex = 0
    let index = 0

    // 查找所有 invoke 开始标签
    const invokeStartPattern = /<｜DSML｜invoke\s+name=["']([^"']+)["']\s*>/gi

    let startMatch
    while ((startMatch = invokeStartPattern.exec(content)) !== null) {
      const toolId = startMatch[1]
      const startPos = startMatch.index
      const tagStartPos = startMatch.index
      const tagEndPos = startMatch.index + startMatch[0].length

      if (!toolId) {
        continue
      }

      // 从标签结束位置开始查找对应的结束标签
      // 需要处理嵌套的 parameter 标签，所以需要找到匹配的结束标签
      let depth = 1
      let currentPos = tagEndPos
      let endPos = -1

      // 查找匹配的 </｜DSML｜invoke> 标签
      while (currentPos < content.length && depth > 0) {
        const nextInvokeStart = content.indexOf('<｜DSML｜invoke', currentPos)
        const nextInvokeEnd = content.indexOf('</｜DSML｜invoke>', currentPos)

        if (nextInvokeEnd === -1) {
          // 没有找到结束标签，可能是格式不完整
          break
        }

        if (nextInvokeStart !== -1 && nextInvokeStart < nextInvokeEnd) {
          // 找到了嵌套的 invoke 标签（虽然理论上不应该有，但为了健壮性处理）
          depth++
          currentPos = nextInvokeStart + 1
        } else {
          // 找到了结束标签
          depth--
          if (depth === 0) {
            endPos = nextInvokeEnd
            break
          }
          currentPos = nextInvokeEnd + 1
        }
      }

      if (endPos === -1) {
        // 没有找到匹配的结束标签，跳过这个标签
        getLogger().warn('[DeepSeekDSMLParser] 未找到匹配的结束标签', {
          toolId,
          startPos
        })
        continue
      }

      // 提取参数内容（从标签结束到结束标签开始之间的内容）
      const parametersContent = content.substring(tagEndPos, endPos)

      getLogger().debug('[DeepSeekDSMLParser] 解析invoke标签', {
        toolId,
        parametersContentLength: parametersContent.length,
        parametersContent: parametersContent.substring(0, 200) // 只记录前200字符
      })

      // 解析参数（DSML格式使用parameter标签）
      const parameters = this.parseDSMLParameters(parametersContent)

      getLogger().debug('[DeepSeekDSMLParser] 解析后的参数', parameters)

      // 提取完整的原始内容
      const rawContent = content.substring(tagStartPos, endPos + '</｜DSML｜invoke>'.length)

      const parsed: ParsedToolCall = {
        id: `call_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
        tool_id: toolId,
        parameters,
        isValid: true,
        rawContent
      }

      if (validateToolId && toolIdValidator) {
        if (!toolIdValidator(toolId)) {
          parsed.isValid = false
          parsed.error = `工具ID "${toolId}" 不存在或不可用`
        }
      }

      toolCalls.push(parsed)
      index++
    }

    if (toolCalls.length === 0) {
      getLogger().warn('[DeepSeekDSMLParser] 未找到任何invoke标签', {
        content: content.substring(0, 500) // 只记录前500字符
      })
    }

    return toolCalls.length > 0 ? toolCalls : null
  }

  /**
   * 解析DSML格式的参数
   * 格式: <｜DSML｜parameter name="paramName" string="value">...</｜DSML｜parameter>
   *
   * 参数值解析规则：
   * 1. 如果 string 属性存在且值不为 "false"，使用 string 属性的值（作为字符串）
   * 2. 如果 string 属性不存在、为空，或值为 "false"，使用标签内容，并尝试解析类型：
   *    - 尝试解析为布尔值（true/false，不区分大小写）
   *    - 尝试解析为数字
   *    - 尝试解析为JSON
   *    - 否则作为字符串（保留多行和换行符）
   *
   * 注意：string="false" 表示参数不是字符串类型，应该使用标签内容并解析类型
   * 注意：多行内容会被完整保留，包括换行符
   */
  private parseDSMLParameters(content: string): Record<string, unknown> {
    const parameters: Record<string, unknown> = {}

    // 使用更精确的匹配方式，支持多行内容
    // 需要找到每个 parameter 标签的开始和结束位置
    let searchIndex = 0

    // 查找所有 parameter 开始标签
    const parameterStartPattern =
      /<｜DSML｜parameter\s+name=["']([^"']+)["'](?:\s+string=["']([^"']*)["'])?\s*(?:\/>|>)/gi

    let startMatch
    while ((startMatch = parameterStartPattern.exec(content)) !== null) {
      const paramName = startMatch[1]
      const stringValue = startMatch[2] // 可能是 undefined 或空字符串
      const tagStartPos = startMatch.index
      const tagEndPos = startMatch.index + startMatch[0].length

      if (!paramName) {
        continue
      }

      // 检查是否是自闭合标签
      const isSelfClosing = startMatch[0].endsWith('/>')

      if (isSelfClosing) {
        // 自闭合标签，没有内容
        if (stringValue !== undefined && stringValue !== '' && stringValue !== 'false') {
          parameters[paramName] = stringValue
        } else {
          parameters[paramName] = ''
        }
        getLogger().debug(
          `[parseDSMLParameters] 参数 ${paramName} 自闭合标签，使用string属性:`,
          stringValue || '空'
        )
        continue
      }

      // 查找对应的结束标签
      const endTagPattern = /<\/｜DSML｜parameter>/g
      endTagPattern.lastIndex = tagEndPos
      const endMatch = endTagPattern.exec(content)

      if (!endMatch) {
        // 没有找到结束标签，可能是格式不完整
        getLogger().warn(`[parseDSMLParameters] 参数 ${paramName} 未找到结束标签`)
        // 如果有string属性，使用它；否则跳过
        if (stringValue !== undefined && stringValue !== '' && stringValue !== 'false') {
          parameters[paramName] = stringValue
        }
        continue
      }

      // 提取标签内容（保留原始格式，包括换行符）
      const innerContent = content.substring(tagEndPos, endMatch.index)

      // 修复：string="true" 应该表示参数是字符串类型，但值应该使用标签内容
      // string属性的语义：
      // - string="false" 或不存在：使用标签内容并尝试解析类型
      // - string="true" 或其他值：如果标签内容存在，优先使用标签内容；否则使用string属性的值
      // - 如果string属性存在且标签内容为空，使用string属性的值
      if (innerContent && innerContent.trim()) {
        // 标签内容存在且不为空，优先使用标签内容
        // 如果string="true"，表示这是字符串类型，直接使用内容（不解析类型）
        if (stringValue === 'true') {
          // string="true" 表示参数是字符串类型，使用标签内容（保留原始格式）
          parameters[paramName] = innerContent.trim()
          getLogger().debug(
            `[parseDSMLParameters] 参数 ${paramName} string="true"，使用标签内容（长度: ${innerContent.length}）`
          )
        } else {
          // string属性不存在、为空，或值为"false"，使用标签内容并尝试解析类型
          const parsedValue = this.parseParameterValue(innerContent)
          parameters[paramName] = parsedValue
          getLogger().debug(
            `[parseDSMLParameters] 参数 ${paramName} 使用标签内容（长度: ${innerContent.length}）`,
            {
              preview: innerContent.substring(0, 100),
              parsedType: typeof parsedValue,
              isMultiline: innerContent.includes('\n')
            }
          )
        }
      } else if (stringValue !== undefined && stringValue !== '' && stringValue !== 'false') {
        // 标签内容为空，但string属性存在且不为"false"，使用string属性的值
        parameters[paramName] = stringValue
        getLogger().debug(
          `[parseDSMLParameters] 参数 ${paramName} 标签内容为空，使用string属性:`,
          stringValue
        )
      } else if (innerContent) {
        // string属性不存在、为空，或值为"false"，使用标签内容，并尝试解析类型
        // 注意：对于多行内容，先尝试解析，如果失败则保留原始内容（包括换行符）
        const parsedValue = this.parseParameterValue(innerContent)
        parameters[paramName] = parsedValue
        getLogger().debug(
          `[parseDSMLParameters] 参数 ${paramName} 使用标签内容（长度: ${innerContent.length}）`,
          {
            preview: innerContent.substring(0, 100),
            parsedType: typeof parsedValue,
            isMultiline: innerContent.includes('\n')
          }
        )
      } else {
        // 既没有string属性也没有内容，设置为空字符串
        parameters[paramName] = ''
        getLogger().debug(`[parseDSMLParameters] 参数 ${paramName} 为空`)
      }
    }

    return parameters
  }

  /**
   * 解析参数值（尝试识别类型）
   * 按优先级：布尔值 > 数字 > JSON > 字符串
   *
   * 注意：对于多行内容，如果无法解析为JSON，则保留原始内容（包括换行符）
   */
  private parseParameterValue(content: string): unknown {
    // 先去除首尾空白，但保留内部格式
    const trimmed = content.trim()

    // 如果内容为空，返回空字符串
    if (!trimmed) {
      return ''
    }

    // 检查是否是多行内容
    const isMultiline = content.includes('\n') || content.includes('\r')

    // 1. 尝试解析为布尔值（不区分大小写，但必须是单行且无多余空白）
    if (!isMultiline) {
      const lowerTrimmed = trimmed.toLowerCase()
      if (lowerTrimmed === 'true') {
        return true
      }
      if (lowerTrimmed === 'false') {
        return false
      }
    }

    // 2. 尝试解析为数字（必须是单行且无多余空白）
    if (!isMultiline && /^-?\d+\.?\d*$/.test(trimmed)) {
      const numValue = Number(trimmed)
      if (!isNaN(numValue) && isFinite(numValue)) {
        // 如果是整数，返回整数；否则返回浮点数
        return Number.isInteger(numValue) ? parseInt(trimmed, 10) : parseFloat(trimmed)
      }
    }

    // 3. 尝试解析为JSON（支持多行JSON）
    try {
      const jsonValue = JSON.parse(trimmed)
      return jsonValue
    } catch {
      // JSON解析失败，继续
    }

    // 4. 作为字符串返回（保留原始格式，包括换行符和空白）
    // 对于多行内容，保留原始格式；对于单行内容，返回trimmed后的值
    return isMultiline ? content : trimmed
  }

  cleanMarkers(content: string): string {
    // 清除完整的 call 块（优先级最高，因为它是外层容器）
    // 同时支持 <｜DSML｜call> 与 <｜DSML｜_call> 两种标签
    let cleaned = content.replace(/<｜DSML｜call>[\s\S]*?<\/｜DSML｜call>/gi, '').trim()
    cleaned = cleaned.replace(/<｜DSML｜_call>[\s\S]*?<\/｜DSML｜_call>/gi, '').trim()
    // 清除完整的 function_calls 块
    cleaned = cleaned
      .replace(/<｜DSML｜function_calls>[\s\S]*?<\/｜DSML｜function_calls>/gi, '')
      .trim()
    // 清除单独的 invoke 标签（如果没有被 function_calls 或 call 包裹）
    cleaned = cleaned.replace(/<｜DSML｜invoke[\s\S]*?<\/｜DSML｜invoke>/gi, '').trim()
    // 清除不完整的标记（含 _call 后缀，避免残留在消息中）
    cleaned = cleaned.replace(/<｜DSML｜call>/gi, '').trim()
    cleaned = cleaned.replace(/<\/｜DSML｜call>/gi, '').trim()
    cleaned = cleaned.replace(/<｜DSML｜_call>/gi, '').trim()
    cleaned = cleaned.replace(/<\/｜DSML｜_call>/gi, '').trim()
    cleaned = cleaned.replace(/<｜DSML｜function_calls>/gi, '').trim()
    cleaned = cleaned.replace(/<\/｜DSML｜function_calls>/gi, '').trim()
    cleaned = cleaned.replace(/<｜DSML｜invoke/gi, '').trim()
    cleaned = cleaned.replace(/<\/｜DSML｜invoke>/gi, '').trim()
    return cleaned
  }

  getMarkerPattern(): RegExp {
    return /<｜DSML｜_?call>[\s\S]*?<\/｜DSML｜_?call>|<｜DSML｜function_calls>[\s\S]*?<\/｜DSML｜function_calls>|<｜DSML｜invoke[\s\S]*?<\/｜DSML｜invoke>/gi
  }
}

/** 默认将 subagents 批任务映射到的 Subagent 配置 ID（文档编写） */
const DEFAULT_SUBAGENT_FOR_BATCH = 'subagent-doc-writer'

/**
 * Subagents 批调用 JSON 格式解析器
 * 格式：AI 在消息内容中输出 {"subagents": [ { "id", "task", "output_file"? }, ... ] } 或带 ```json ... ``` / 结尾 ;;; 的变体
 * 将每个 subagents 项展开为一个 subagent 工具调用（默认 subagent-doc-writer），供队列并发执行
 */
class SubagentsBatchParser implements ToolCallParser {
  name = 'subagents-batch'

  detect(content: string): boolean {
    const trimmed = content.trim()
    // 代码块内的 JSON
    const inCodeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    const toCheck = inCodeBlock ? inCodeBlock[1] : trimmed
    const withoutTrailing = toCheck.replace(/;;;+\s*$/, '').trim()
    return /["']subagents["']\s*:\s*\[/.test(withoutTrailing)
  }

  parse(
    content: string,
    options: {
      loose?: boolean
      validateToolId?: boolean
      toolIdValidator?: (toolId: string) => boolean
    } = {}
  ): ParsedToolCall[] | null {
    const { validateToolId = false, toolIdValidator } = options

    try {
      let jsonStr = content.trim()
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim()
      }
      jsonStr = jsonStr.replace(/;;;+\s*$/, '').trim()
      const outer = extractOuterJsonString(jsonStr) || jsonStr
      let parsed: any = parseLooseJson(outer)
      if (!parsed) {
        try {
          parsed = JSON.parse(outer.replace(/,\s*([}\]])/g, '$1'))
        } catch {
          return null
        }
      }
      const list = parsed?.subagents
      if (!Array.isArray(list) || list.length === 0) {
        return null
      }

      const toolCalls: ParsedToolCall[] = []
      for (let i = 0; i < list.length; i++) {
        const item = list[i]
        if (!item || typeof item !== 'object') continue
        const task = item.task ?? item.prompt ?? ''
        const toolId =
          typeof item.tool_id === 'string'
            ? item.tool_id
            : typeof item.subagent === 'string'
              ? item.subagent
              : DEFAULT_SUBAGENT_FOR_BATCH
        const parameters: Record<string, unknown> = { prompt: String(task) }
        if (item.output_file != null) {
          parameters.output_file = String(item.output_file)
        }
        const parsedCall: ParsedToolCall = {
          id: `call_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`,
          tool_id: toolId,
          parameters,
          isValid: true,
          rawContent: JSON.stringify(item)
        }
        if (validateToolId && toolIdValidator && !toolIdValidator(toolId)) {
          parsedCall.isValid = false
          parsedCall.error = `工具ID "${toolId}" 不存在或不可用`
        }
        toolCalls.push(parsedCall)
      }

      if (toolCalls.length === 0) return null
      getLogger().debug(
        `[SubagentsBatchParser] 解析到 ${toolCalls.length} 个 subagent 批调用`
      )
      return toolCalls
    } catch (error) {
      getLogger().error('[SubagentsBatchParser] 解析失败:', error)
      return null
    }
  }

  cleanMarkers(content: string): string {
    let cleaned = content
    // 移除 ```json ... ``` 或 ``` ... ``` 中包含 "subagents" 的块
    const codeBlockRe = /```(?:json)?\s*([\s\S]*?)```/gi
    cleaned = cleaned.replace(codeBlockRe, (fullMatch, inner) => {
      const t = inner.trim().replace(/;;;+\s*$/, '').trim()
      if (/["']subagents["']\s*:\s*\[/.test(t)) return ''
      return fullMatch
    })
    // 移除裸的 {"subagents": [...]}（用 extractOuterJsonString 定位第一个完整对象）
    let idx = cleaned.indexOf('"subagents"')
    if (idx === -1) idx = cleaned.indexOf("'subagents'")
    if (idx !== -1) {
      const start = cleaned.lastIndexOf('{', idx)
      if (start !== -1) {
        const jsonStr = extractOuterJsonString(cleaned.substring(start))
        if (jsonStr && /["']subagents["']\s*:\s*\[/.test(jsonStr)) {
          cleaned = (cleaned.substring(0, start) + cleaned.substring(start + jsonStr.length)).trim()
        }
      }
    }
    return cleaned.trim()
  }

  getMarkerPattern(): RegExp {
    return /["']subagents["']\s*:\s*\[[\s\S]*?\]/gi
  }
}

/**
 * 将“完整内容”转为新建文件的 Unified diff（@@ -0,0 +1,N @@ 后跟 +行）
 */
function newFileDiff(content: string): string {
  if (content == null) return ''
  const lines = String(content).split(/\r?\n/)
  if (lines.length === 0) return '@@ -0,0 +1,0 @@\n'
  return '@@ -0,0 +1,' + lines.length + ' @@\n' + lines.map((l) => '+' + l).join('\n')
}

/**
 * 对 action+params 格式的参数做标准化，便于工具消费（如 file_path -> filePath；edit 的 content 转为 diff）
 */
function normalizeActionParams(
  toolId: string,
  params: Record<string, unknown>
): Record<string, unknown> {
  const p = { ...params }
  const filePath = (p.file_path ?? p.filePath) as string | undefined
  if (filePath !== undefined) {
    p.filePath = filePath
    delete p.file_path
  }
  if (toolId === 'edit' && p.content != null && (p.file_path != null || p.filePath != null)) {
    p.diff = newFileDiff(String(p.content))
    delete p.content
  }
  return p
}

/**
 * Action+Params JSON 格式解析器
 * 格式：AI 在消息中输出 {"action": "edit", "params": { "file_path": "...", "content": "..." } }（或 parameters）
 * 支持代码块 ```json ... ```；将 action 映射为 tool_id，params 标准化后作为 parameters（如 file_path→filePath，edit 的 content→diff）
 */
class ActionParamsParser implements ToolCallParser {
  name = 'action-params'

  detect(content: string): boolean {
    const trimmed = content.trim()
    const inBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    const toCheck = inBlock ? inBlock[1] : trimmed
    const hasActionParams =
      /["']action["']\s*:/.test(toCheck) &&
      (/["']params["']\s*:/.test(toCheck) || /["']parameters["']\s*:/.test(toCheck))
    const hasArrayOfAction = /\s*\[\s*\{\s*["']action["']\s*:/.test(toCheck)
    return hasActionParams || hasArrayOfAction
  }

  parse(
    content: string,
    options: {
      loose?: boolean
      validateToolId?: boolean
      toolIdValidator?: (toolId: string) => boolean
    } = {}
  ): ParsedToolCall[] | null {
    const { validateToolId = false, toolIdValidator } = options

    try {
      let jsonStr = content.trim()
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
      if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim()
      const outer = extractOuterJsonString(jsonStr) || jsonStr
      let parsed: any = parseLooseJson(outer)
      if (!parsed) {
        try {
          parsed = JSON.parse(outer.replace(/,\s*([}\]])/g, '$1'))
        } catch {
          return null
        }
      }
      const items = Array.isArray(parsed) ? parsed : [parsed]
      const toolCalls: ParsedToolCall[] = []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const action = item?.action ?? item?.tool ?? item?.name
        const paramsRaw = item?.params ?? item?.parameters ?? item?.arguments
        if (!action || typeof action !== 'string') continue
        if (paramsRaw === undefined || typeof paramsRaw !== 'object' || Array.isArray(paramsRaw)) {
          continue
        }
        const parameters = normalizeActionParams(action, { ...paramsRaw })
        const parsedCall: ParsedToolCall = {
          id: `call_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`,
          tool_id: action,
          parameters,
          isValid: true,
          rawContent: Array.isArray(parsed) ? JSON.stringify(item) : jsonStr
        }
        if (validateToolId && toolIdValidator && !toolIdValidator(action)) {
          parsedCall.isValid = false
          parsedCall.error = `工具ID "${action}" 不存在或不可用`
        }
        toolCalls.push(parsedCall)
      }
      if (toolCalls.length === 0) return null
      getLogger().debug('[ActionParamsParser] 解析到 action+params 工具调用', {
        count: toolCalls.length
      })
      return toolCalls
    } catch (error) {
      getLogger().error('[ActionParamsParser] 解析失败:', error)
      return null
    }
  }

  cleanMarkers(content: string): string {
    let cleaned = content
    const codeBlockRe = /```(?:json)?\s*([\s\S]*?)```/gi
    cleaned = cleaned.replace(codeBlockRe, (fullMatch, inner) => {
      const t = inner.trim()
      if (/["']action["']\s*:/.test(t) && (/["']params["']\s*:/.test(t) || /["']parameters["']\s*:/.test(t))) return ''
      return fullMatch
    })
    return cleaned.trim()
  }

  getMarkerPattern(): RegExp {
    return /["']action["']\s*:\s*["'][^"']+["']\s*,\s*["'](?:params|parameters)["']\s*:/gi
  }
}

/**
 * OpenAI Function Calling 格式解析器
 * 格式: { "tool": "tool_id", "arguments": {...} }
 * 注意：这个格式是纯JSON，不包含标签，需要避免与 <tool_call> 中的JSON重复匹配
 */
class OpenAIFunctionCallParser implements ToolCallParser {
  name = 'openai-function-call'

  detect(content: string): boolean {
    // 检测是否包含工具调用相关的JSON对象或根级数组 [{},{}...]
    // 但要排除已经在标签中的内容
    const withoutToolCallTags = content.replace(
      /<(?:tool[_-]?call|function[_-]?call)>[\s\S]*?<\/(?:tool[_-]?call|function[_-]?call)>/gi,
      ''
    )
    const hasObjectFormat = /\{\s*["'](?:tool|name|tool_id|toolId|function|function_name)["']\s*:/i.test(
      withoutToolCallTags
    )
    const hasArrayFormat = /\s*\[\s*\{/.test(withoutToolCallTags.trim())
    return hasObjectFormat || hasArrayFormat
  }

  parse(
    content: string,
    options: {
      loose?: boolean
      validateToolId?: boolean
      toolIdValidator?: (toolId: string) => boolean
    } = {}
  ): ParsedToolCall[] | null {
    const { validateToolId = false, toolIdValidator } = options

    try {
      // 先移除标签中的内容，避免重复匹配
      const withoutToolCallTags = content.replace(
        /<(?:tool[_-]?call|function[_-]?call)>[\s\S]*?<\/(?:tool[_-]?call|function[_-]?call)>/gi,
        ''
      )

      // 查找所有匹配的 JSON 对象或根级数组 [{},{}...]
      const toolCalls: ParsedToolCall[] = []
      let searchIndex = 0
      let index = 0

      while (searchIndex < withoutToolCallTags.length) {
        const nextBrace = withoutToolCallTags.indexOf('{', searchIndex)
        const nextBracket = withoutToolCallTags.indexOf('[', searchIndex)
        const jsonStart =
          nextBracket === -1
            ? nextBrace
            : nextBrace === -1
              ? nextBracket
              : Math.min(nextBrace, nextBracket)
        if (jsonStart === -1) break

        const substring = withoutToolCallTags.substring(jsonStart)
        const jsonStr = extractOuterJsonString(substring)
        if (!jsonStr) {
          searchIndex = jsonStart + 1
          continue
        }

        let parsed: any = parseLooseJson(jsonStr)
        if (!parsed) {
          try {
            parsed = JSON.parse(jsonStr.replace(/,\s*([}\]])/g, '$1'))
          } catch {
            searchIndex = jsonStart + jsonStr.length
            continue
          }
        }

        // 根级为数组：展开为多个工具调用
        const items = Array.isArray(parsed) ? parsed : [parsed]
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          if (!item || typeof item !== 'object' || Array.isArray(item)) continue
          const toolId = extractToolId(item)
          const parameters = extractParameters(item)
          if (!toolId || parameters === null) continue
          if (typeof parameters !== 'object' || Array.isArray(parameters)) continue

          const toolCall: ParsedToolCall = {
            id: `call_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
            tool_id: toolId,
            parameters: parameters || {},
            isValid: true,
            rawContent: Array.isArray(parsed) ? JSON.stringify(item) : jsonStr
          }
          if (validateToolId && toolIdValidator && !toolIdValidator(toolId)) {
            toolCall.isValid = false
            toolCall.error = `工具ID "${toolId}" 不存在或不可用`
          }
          toolCalls.push(toolCall)
          index++
        }

        searchIndex = jsonStart + jsonStr.length
      }

      return toolCalls.length > 0 ? toolCalls : null
    } catch (error) {
      getLogger().error('[OpenAIFunctionCallParser] 解析失败:', error)
      return null
    }
  }

  cleanMarkers(content: string): string {
    // OpenAI格式是纯JSON，需要小心清除
    // 只清除符合格式的JSON对象，避免误删其他JSON
    let cleaned = content
    let searchIndex = 0

    while (searchIndex < cleaned.length) {
      const jsonStart = cleaned.indexOf('{', searchIndex)
      if (jsonStart === -1) break

      const jsonStr = extractOuterJsonString(cleaned.substring(jsonStart))
      if (!jsonStr) {
        searchIndex = jsonStart + 1
        continue
      }

      // 尝试宽松的JSON解析
      const parsed = parseLooseJson(jsonStr)
      // 如果符合工具调用格式，清除它
      if (parsed && extractToolId(parsed)) {
        cleaned = cleaned.substring(0, jsonStart) + cleaned.substring(jsonStart + jsonStr.length)
        continue
      }

      searchIndex = jsonStart + jsonStr.length
    }

    return cleaned.trim()
  }

  getMarkerPattern(): RegExp {
    // OpenAI格式没有固定的标记模式，返回一个匹配JSON的模式（支持多种字段名称）
    return /\{\s*["'](?:tool|name|tool_id|toolId|function|function_name)["']\s*:/gi
  }
}

/**
 * XML格式工具调用解析器
 * 支持两种格式：
 * 1. 标准XML格式：<name>tool_id</name><arguments>{...}</arguments>
 * 2. 纯XML格式：<tool_id>{...}</tool_id>（标签名即工具ID）
 */
class XMLToolCallParser implements ToolCallParser {
  name = 'xml-tool-call'

  detect(content: string): boolean {
    // 检测标准XML格式：<name>...</name><arguments>...</arguments>
    // 或者只有name或只有arguments（不完整格式，需要返回dummy-tool）
    const hasName = /<name>[\s\S]*?<\/name>/i.test(content)
    const hasArguments = /<arguments>[\s\S]*?<\/arguments>/i.test(content)

    if (hasName || hasArguments) {
      return true
    }

    // 检测纯XML格式：<tool_id>...</tool_id>
    // 排除保留标签（这些是标准XML格式的一部分）
    const reservedTags = [
      'name',
      'arguments',
      'parameters',
      'params',
      'args',
      'tool_call',
      'tool-call',
      'function_call',
      'function-call'
    ]
    const pureXmlMatch = content.match(/^<([a-zA-Z0-9_-]+)>[\s\S]*?<\/\1>$/i)
    if (pureXmlMatch && !reservedTags.includes(pureXmlMatch[1].toLowerCase())) {
      return true
    }

    return false
  }

  parse(
    content: string,
    options: {
      loose?: boolean
      validateToolId?: boolean
      toolIdValidator?: (toolId: string) => boolean
    } = {}
  ): ParsedToolCall[] | null {
    const { validateToolId = false, toolIdValidator } = options

    try {
      const toolCalls: ParsedToolCall[] = []
      let isStandardXMLFormat = false
      let isPureXMLFormat = false

      // 尝试使用DOMParser解析XML
      try {
        const parser = new DOMParser()
        // 将内容包裹在根元素中，使其成为有效的XML文档
        const wrappedContent = `<root>${content}</root>`
        const xmlDoc = parser.parseFromString(wrappedContent, 'text/xml')

        // 检查是否有解析错误
        const parseError = xmlDoc.querySelector('parsererror')
        if (parseError) {
          getLogger().debug('[XMLToolCallParser] XML解析失败，尝试其他格式')
          return null
        }

        const rootElement = xmlDoc.documentElement

        // 首先检查是否是标准XML格式（<name>...</name><arguments>...</arguments>）
        const nameElements = rootElement.querySelectorAll('name')
        const argumentsElements = rootElement.querySelectorAll('arguments')

        // 检测格式类型
        const hasName = nameElements.length > 0
        const hasArguments = argumentsElements.length > 0

        if (hasName && hasArguments) {
          // 标准XML格式：可能有多个工具调用
          isStandardXMLFormat = true
          for (let i = 0; i < Math.min(nameElements.length, argumentsElements.length); i++) {
            const nameElement = nameElements[i]
            const argumentsElement = argumentsElements[i]

            const toolId = nameElement.textContent?.trim() || ''
            const argumentsContent = argumentsElement.textContent?.trim() || ''

            // 如果name标签为空，返回dummy-tool
            if (!toolId) {
              toolCalls.push(
                this.createInvalidToolCall(
                  content,
                  i,
                  'XML格式中缺少工具ID（<name>标签为空）',
                  'standard'
                )
              )
              continue
            }

            const parsed = this.parseXMLToolCall(
              toolId,
              argumentsContent,
              i,
              validateToolId,
              toolIdValidator,
              content,
              'standard'
            )
            if (parsed) {
              toolCalls.push(parsed)
            }
          }
        } else if (hasName || hasArguments) {
          // 只有name或只有arguments，格式不完整
          if (hasName && !hasArguments) {
            toolCalls.push(
              this.createInvalidToolCall(content, 0, 'XML格式中缺少arguments标签', 'standard')
            )
          } else if (!hasName && hasArguments) {
            toolCalls.push(
              this.createInvalidToolCall(content, 0, 'XML格式中缺少name标签', 'standard')
            )
          }
        } else {
          // 检查是否是纯XML格式（标签名即工具ID）
          const reservedTags = [
            'name',
            'arguments',
            'parameters',
            'params',
            'args',
            'tool_call',
            'tool-call',
            'function_call',
            'function-call',
            'root'
          ]

          // 查找所有直接子元素（排除root）
          const children = Array.from(rootElement.children).filter(
            (child) => child.tagName && !reservedTags.includes(child.tagName.toLowerCase())
          )

          if (children.length > 0) {
            isPureXMLFormat = true
            for (let i = 0; i < children.length; i++) {
              const child = children[i]
              const toolId = child.tagName
              const jsonContent = child.textContent?.trim() || ''

              const parsed = this.parseXMLToolCall(
                toolId,
                jsonContent,
                i,
                validateToolId,
                toolIdValidator,
                content,
                'pure'
              )
              if (parsed) {
                toolCalls.push(parsed)
              }
            }
          }
        }

        // 如果检测到XML格式但解析失败，返回dummy-tool
        if ((isStandardXMLFormat || isPureXMLFormat) && toolCalls.length === 0) {
          // 这种情况不应该发生，因为上面已经处理了
          return null
        }

        return toolCalls.length > 0 ? toolCalls : null
      } catch (xmlParseError) {
        getLogger().debug('[XMLToolCallParser] XML解析异常:', xmlParseError)
        return null
      }
    } catch (error) {
      getLogger().error('[XMLToolCallParser] 解析失败:', error)
      return null
    }
  }

  private parseXMLToolCall(
    toolId: string,
    jsonContent: string,
    index: number,
    validateToolId: boolean,
    toolIdValidator: ((toolId: string) => boolean) | undefined,
    rawContent: string,
    formatType: 'standard' | 'pure' = 'standard'
  ): ParsedToolCall | null {
    if (!toolId) {
      const errorMsg =
        formatType === 'pure' ? '纯XML格式中标签名为空' : 'XML格式中缺少工具ID（<name>标签为空）'
      return this.createInvalidToolCall(rawContent, index, errorMsg, formatType)
    }

    // 尝试解析JSON内容
    let parameters: Record<string, unknown> | null = null

    // 先尝试提取JSON字符串
    let jsonStr = extractOuterJsonString(jsonContent) || jsonContent.trim()

    // 尝试宽松的JSON解析
    let parsed: any = parseLooseJson(jsonStr)

    // 如果宽松解析失败，尝试修复后解析
    if (!parsed) {
      const fixed = tryFixJsonFormat(jsonStr)
      if (fixed) {
        parsed = parseLooseJson(fixed)
      }
    }

    // 如果仍然失败，尝试标准解析
    if (!parsed) {
      try {
        parsed = JSON.parse(jsonStr.replace(/,\s*([}\]])/g, '$1'))
      } catch (parseError) {
        const errorMsg =
          formatType === 'pure'
            ? `纯XML格式中JSON解析失败: ${parseError}`
            : `XML格式中arguments的JSON解析失败: ${parseError}`
        return this.createInvalidToolCall(rawContent, index, errorMsg, formatType)
      }
    }

    // 确保参数是对象类型
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      parameters = parsed
    } else {
      const errorMsg =
        formatType === 'pure' ? '纯XML格式中内容必须是JSON对象' : 'XML格式中arguments必须是JSON对象'
      return this.createInvalidToolCall(rawContent, index, errorMsg, formatType)
    }

    if (!parameters) {
      const errorMsg =
        formatType === 'pure' ? '纯XML格式中JSON解析失败' : 'XML格式中arguments解析失败'
      return this.createInvalidToolCall(rawContent, index, errorMsg, formatType)
    }

    const toolCall: ParsedToolCall = {
      id: `call_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
      tool_id: toolId,
      parameters,
      isValid: true,
      rawContent: rawContent
    }

    if (validateToolId && toolIdValidator) {
      if (!toolIdValidator(toolId)) {
        toolCall.isValid = false
        toolCall.error = `工具ID "${toolId}" 不存在或不可用`
      }
    }

    getLogger().debug(
      `[XMLToolCallParser] XML格式解析成功: toolId=${toolId}, formatType=${formatType}`
    )

    return toolCall
  }

  private createInvalidToolCall(
    rawContent: string,
    index: number,
    error: string,
    formatType: 'standard' | 'pure' = 'standard'
  ): ParsedToolCall {
    return {
      id: `call_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
      tool_id: 'dummy-tool',
      parameters: {
        error,
        rawContent
      },
      isValid: false,
      error,
      rawContent
    }
  }

  cleanMarkers(content: string): string {
    let cleaned = content

    // 清除标准XML格式
    cleaned = cleaned.replace(/<name>[\s\S]*?<\/name>/gi, '')
    cleaned = cleaned.replace(/<arguments>[\s\S]*?<\/arguments>/gi, '')

    // 清除纯XML格式（需要匹配标签名）
    // 匹配 <tag>...</tag> 格式，但排除保留标签
    const reservedTags = [
      'name',
      'arguments',
      'parameters',
      'params',
      'args',
      'tool_call',
      'tool-call',
      'function_call',
      'function-call'
    ]
    cleaned = cleaned.replace(/<([a-zA-Z0-9_-]+)>[\s\S]*?<\/\1>/gi, (match, tagName) => {
      if (reservedTags.includes(tagName.toLowerCase())) {
        return match // 保留保留标签
      }
      return '' // 清除工具调用标签
    })

    return cleaned.trim()
  }

  getMarkerPattern(): RegExp {
    // 匹配标准XML格式和纯XML格式
    return /<name>[\s\S]*?<\/name>\s*<arguments>[\s\S]*?<\/arguments>|<([a-zA-Z0-9_-]+)>[\s\S]*?<\/\1>/gi
  }
}

/**
 * 工具调用解析器管理器
 * 按优先级顺序尝试解析，避免重复匹配
 */
export class ToolCallParserManager {
  private parsers: ToolCallParser[] = []

  constructor() {
    // 按优先级注册解析器（优先级高的在前）
    // 1. 标准格式（最明确，优先级最高）
    this.parsers.push(new StandardToolCallParser())
    // 2. XML格式（在DSML之前，因为XML格式更常见）
    this.parsers.push(new XMLToolCallParser())
    // 3. DeepSeek DSML格式
    this.parsers.push(new DeepSeekDSMLParser())
    // 4. Subagents 批调用 JSON 格式（内容中的 {"subagents": [...]}，展开为多个 subagent 工具调用）
    this.parsers.push(new SubagentsBatchParser())
    // 5. Action+Params JSON 格式（{"action": "edit", "params": { "file_path", "content" }}等，支持 content 转 diff）
    this.parsers.push(new ActionParamsParser())
    // 6. OpenAI格式（最宽松，优先级最低，避免误匹配）
    this.parsers.push(new OpenAIFunctionCallParser())
  }

  /**
   * 解析工具调用
   * 按优先级顺序尝试，如果第一个解析器检测到格式但解析失败，会尝试其他解析器
   */
  parse(
    content: string,
    options: {
      loose?: boolean
      validateToolId?: boolean
      toolIdValidator?: (toolId: string) => boolean
    } = {}
  ): ParsedToolCall[] | null {
    getLogger().debug('[ToolCallParserManager] 开始解析工具调用', {
      contentLength: content.length,
      contentPreview: content.substring(0, 200)
    })

    const detectedParsers: ToolCallParser[] = []
    const allResults: ParsedToolCall[] = []

    // 第一轮：检测所有可能的解析器
    for (const parser of this.parsers) {
      const detected = parser.detect(content)
      getLogger().debug(`[ToolCallParserManager] 解析器 ${parser.name} 检测结果:`, detected)

      if (detected) {
        detectedParsers.push(parser)
      }
    }

    // 第二轮：按优先级顺序尝试解析
    for (const parser of detectedParsers) {
      getLogger().debug(`[ToolCallParserManager] 尝试使用解析器: ${parser.name}`)
      const result = parser.parse(content, options)

      if (result && result.length > 0) {
        // 检查结果是否有效（至少有一个有效的工具调用）
        const validResults = result.filter((r) => r.isValid)
        if (validResults.length > 0) {
          getLogger().debug(
            `[ToolCallParserManager] 解析器 ${parser.name} 成功解析 ${validResults.length} 个有效工具调用`
          )
          return result
        } else {
          getLogger().warn(
            `[ToolCallParserManager] 解析器 ${parser.name} 解析结果无效，尝试下一个解析器`
          )
          // 保存结果，但继续尝试其他解析器
          allResults.push(...result)
        }
      } else {
        getLogger().warn(
          `[ToolCallParserManager] 解析器 ${parser.name} 检测到格式但解析失败，尝试下一个解析器`
        )
      }
    }

    // 如果所有解析器都失败，但有一些结果（即使是无效的），返回它们
    if (allResults.length > 0) {
      getLogger().warn(`[ToolCallParserManager] 所有解析器都未能解析出有效结果，返回部分结果`)
      return allResults
    }

    getLogger().debug('[ToolCallParserManager] 所有解析器都未找到工具调用')
    return null
  }

  /**
   * 清除所有格式的工具调用标记
   */
  cleanAllMarkers(content: string): string {
    let cleaned = content

    // 按优先级顺序清除（避免重复清除）
    // 先清除明确的标记格式，再清除模糊的格式
    for (const parser of this.parsers) {
      cleaned = parser.cleanMarkers(cleaned)
    }

    return cleaned
  }

  /**
   * 获取所有解析器的标记模式（用于检测）
   */
  getAllMarkerPatterns(): RegExp[] {
    return this.parsers.map((p) => p.getMarkerPattern())
  }

  /**
   * 检查内容是否包含任何格式的工具调用标记
   */
  hasAnyToolCallMarkers(content: string): boolean {
    return this.parsers.some((parser) => parser.detect(content))
  }
}

/**
 * 补全未闭合的 JSON：只有左半边、缺少右半边的字符串。
 * 按栈顺序补全缺失的 "、]、}，使字符串可被 JSON.parse 解析。
 */
function completeIncompleteJson(str: string): string {
  const stack: ('}' | ']')[] = []
  let inDouble = false
  let inSingle = false
  let i = 0
  while (i < str.length) {
    const c = str[i]
    if (inDouble) {
      if (c === '\\') {
        i += 2
        continue
      }
      if (c === '"') {
        inDouble = false
      }
      i++
      continue
    }
    if (inSingle) {
      if (c === '\\') {
        i += 2
        continue
      }
      if (c === "'") {
        inSingle = false
      }
      i++
      continue
    }
    if (c === '"') {
      inDouble = true
      i++
      continue
    }
    if (c === "'") {
      inSingle = true
      i++
      continue
    }
    if (c === '{') {
      stack.push('}')
      i++
      continue
    }
    if (c === '[') {
      stack.push(']')
      i++
      continue
    }
    if (c === '}' || c === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === c) {
        stack.pop()
      }
      i++
      continue
    }
    i++
  }
  let out = str
  if (inDouble || inSingle) {
    out += '"'
  }
  for (let j = stack.length - 1; j >= 0; j--) {
    out += stack[j]
  }
  return out
}

/**
 * 宽松的JSON解析工具
 * 支持尾随逗号、单引号、注释等非标准JSON格式；
 * 若 JSON 未闭合（只有左半边），会先尝试补全再解析。
 */
function parseLooseJson(jsonStr: string): any | null {
  let cleaned = jsonStr.trim()

  // 1. 移除单行和多行注释（但要小心，避免误删字符串中的内容）
  cleaned = cleaned
    .replace(/\/\/[^\n\r"']*$/gm, '') // 单行注释（不在字符串中）
    .replace(/\/\*[\s\S]*?\*\//g, '') // 多行注释

  // 2. 将单引号转换为双引号（更精确的匹配）
  cleaned = cleaned.replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3')
  cleaned = cleaned.replace(/:\s*'([^']*)'/g, ': "$1"')
  cleaned = cleaned.replace(/\[\s*'([^']*)'\s*\]/g, '["$1"]')

  // 3. 移除尾随逗号（在对象和数组的最后一个元素后）
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')

  // 4. 修复未转义的换行符（在字符串值中）
  cleaned = cleaned.replace(/:\s*"([^"]*)\n([^"]*)"/g, ': "$1\\n$2"')

  try {
    return JSON.parse(cleaned)
  } catch (error) {
    //getLogger().debug('[parseLooseJson] 宽松解析失败，尝试标准解析:', error)
    try {
      return JSON.parse(jsonStr.replace(/,\s*([}\]])/g, '$1'))
    } catch {
      try {
        // 未闭合的 JSON：补全右半边后再解析
        const completed = completeIncompleteJson(cleaned)
        const parsed = JSON.parse(completed)
        //getLogger().debug('[parseLooseJson] 未闭合 JSON 已补全并解析成功')
        return parsed
      } catch {
        return null
      }
    }
  }
}

/**
 * 从对象中提取工具ID（支持多种字段名称）
 */
function extractToolId(obj: any): string | null {
  // 按优先级尝试不同的字段名称
  const possibleFields = [
    'name',
    'tool_id',
    'toolId',
    'tool',
    'function',
    'function_name',
    'functionName',
    'id',
    'tool_name',
    'toolName'
  ]

  for (const field of possibleFields) {
    if (obj[field] && typeof obj[field] === 'string') {
      return obj[field]
    }
  }

  return null
}

/**
 * 从对象中提取参数（支持多种字段名称）
 */
function extractParameters(obj: any): Record<string, unknown> | null {
  // 按优先级尝试不同的字段名称
  const possibleFields = [
    'arguments',
    'parameters',
    'params',
    'args',
    'input',
    'inputs',
    'data',
    'options'
  ]

  for (const field of possibleFields) {
    if (obj[field] !== undefined) {
      const value = obj[field]
      // 确保是对象类型
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return value
      }
    }
  }

  // 如果没有找到参数字段，但对象本身看起来像参数对象（有多个键但不是工具ID字段）
  const toolIdFields = ['name', 'tool_id', 'toolId', 'tool', 'function', 'function_name', 'id']
  const keys = Object.keys(obj)
  const hasToolIdField = keys.some((key) => toolIdFields.includes(key))

  if (!hasToolIdField && keys.length > 0) {
    // 可能整个对象就是参数对象
    return obj
  }

  return {}
}

/**
 * 尝试修复常见的JSON格式问题
 */
function tryFixJsonFormat(content: string): string | null {
  try {
    let fixed = content.trim()

    // 1. 如果缺少开始或结束括号，尝试添加
    const openBraces = (fixed.match(/\{/g) || []).length
    const closeBraces = (fixed.match(/\}/g) || []).length

    if (openBraces > closeBraces) {
      // 缺少结束括号
      fixed += '}'.repeat(openBraces - closeBraces)
    } else if (closeBraces > openBraces) {
      // 缺少开始括号
      fixed = '{'.repeat(closeBraces - openBraces) + fixed
    }

    // 2. 移除尾随逗号
    fixed = fixed.replace(/,\s*([}\]])/g, '$1')

    // 3. 尝试解析修复后的JSON
    JSON.parse(fixed)
    return fixed
  } catch {
    return null
  }
}

// 导出单例实例
export const toolCallParserManager = new ToolCallParserManager()
