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
      
      return toolCalls.length > 0 ? toolCalls : null
    } catch (error) {
      getLogger().error('[StandardToolCallParser] 解析失败:', error)
      return null
    }
  }
  
  private parseSingleToolCall(
    toolCallContent: string,
    index: number
  ): ParsedToolCall | null {
    try {
      // 检查是否包含嵌套的DSML格式（<｜DSML｜invoke 或 <｜DSML｜function_calls>）
      // 如果包含，委托给DSML解析器处理
      if (/<｜DSML｜invoke/i.test(toolCallContent) || /<｜DSML｜function_calls>/i.test(toolCallContent)) {
        getLogger().debug('[StandardToolCallParser] 检测到嵌套的DSML格式，委托给DSML解析器')
        const dsmlParser = new DeepSeekDSMLParser()
        const dsmlResults = dsmlParser.parse(toolCallContent, {})
        if (dsmlResults && dsmlResults.length > 0) {
          // 返回第一个结果（通常只有一个）
          return dsmlResults[0]
        }
        // 如果DSML解析失败，继续尝试JSON解析
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
      const paramFields = ['arguments', 'parameters', 'params', 'args', 'input', 'inputs', 'data', 'options']
      for (const field of paramFields) {
        if (parsed[field] !== undefined) {
          const paramValue = parsed[field]
          // 如果参数字段存在但不是对象类型（是字符串、数组等），应该报错
          if (typeof paramValue !== 'object' || paramValue === null || Array.isArray(paramValue)) {
            return this.createInvalidToolCall(toolCallContent, index, `参数必须是对象类型（${field}字段的值不是对象类型）`)
          }
        }
      }
      
      const parameters = extractParameters(parsed)
      
      if (!toolId) {
        return this.createInvalidToolCall(toolCallContent, index, '缺少工具ID（支持的字段：name, tool_id, toolId, tool, function等）')
      }
      
      if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
        return this.createInvalidToolCall(toolCallContent, index, '参数必须是对象类型（支持的字段：arguments, parameters, params等）')
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
  
  private createInvalidToolCall(
    rawContent: string,
    index: number,
    error: string
  ): ParsedToolCall {
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
    return content.replace(/<(?:tool[_-]?call|function[_-]?call)>[\s\S]*?<\/(?:tool[_-]?call|function[_-]?call)>/gi, '').trim()
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
    return /<｜DSML｜function_calls>/i.test(content) || /<｜DSML｜invoke/i.test(content)
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
    const parameterStartPattern = /<｜DSML｜parameter\s+name=["']([^"']+)["'](?:\s+string=["']([^"']*)["'])?\s*(?:\/>|>)/gi
    
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
        getLogger().debug(`[parseDSMLParameters] 参数 ${paramName} 自闭合标签，使用string属性:`, stringValue || '空')
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
          getLogger().debug(`[parseDSMLParameters] 参数 ${paramName} string="true"，使用标签内容（长度: ${innerContent.length}）`)
        } else {
          // string属性不存在、为空，或值为"false"，使用标签内容并尝试解析类型
          const parsedValue = this.parseParameterValue(innerContent)
          parameters[paramName] = parsedValue
          getLogger().debug(`[parseDSMLParameters] 参数 ${paramName} 使用标签内容（长度: ${innerContent.length}）`, {
            preview: innerContent.substring(0, 100),
            parsedType: typeof parsedValue,
            isMultiline: innerContent.includes('\n')
          })
        }
      } else if (stringValue !== undefined && stringValue !== '' && stringValue !== 'false') {
        // 标签内容为空，但string属性存在且不为"false"，使用string属性的值
        parameters[paramName] = stringValue
        getLogger().debug(`[parseDSMLParameters] 参数 ${paramName} 标签内容为空，使用string属性:`, stringValue)
      } else if (innerContent) {
        // string属性不存在、为空，或值为"false"，使用标签内容，并尝试解析类型
        // 注意：对于多行内容，先尝试解析，如果失败则保留原始内容（包括换行符）
        const parsedValue = this.parseParameterValue(innerContent)
        parameters[paramName] = parsedValue
        getLogger().debug(`[parseDSMLParameters] 参数 ${paramName} 使用标签内容（长度: ${innerContent.length}）`, {
          preview: innerContent.substring(0, 100),
          parsedType: typeof parsedValue,
          isMultiline: innerContent.includes('\n')
        })
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
    // 清除完整的 function_calls 块
    let cleaned = content.replace(/<｜DSML｜function_calls>[\s\S]*?<\/｜DSML｜function_calls>/gi, '').trim()
    // 清除单独的 invoke 标签（如果没有被 function_calls 包裹）
    cleaned = cleaned.replace(/<｜DSML｜invoke[\s\S]*?<\/｜DSML｜invoke>/gi, '').trim()
    // 清除不完整的标记
    cleaned = cleaned.replace(/<｜DSML｜function_calls>/gi, '').trim()
    cleaned = cleaned.replace(/<\/｜DSML｜function_calls>/gi, '').trim()
    cleaned = cleaned.replace(/<｜DSML｜invoke/gi, '').trim()
    cleaned = cleaned.replace(/<\/｜DSML｜invoke>/gi, '').trim()
    return cleaned
  }
  
  getMarkerPattern(): RegExp {
    return /<｜DSML｜function_calls>[\s\S]*?<\/｜DSML｜function_calls>|<｜DSML｜invoke[\s\S]*?<\/｜DSML｜invoke>/gi
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
    // 检测是否包含工具调用相关的JSON对象
    // 但要排除已经在标签中的内容
    const withoutToolCallTags = content.replace(/<(?:tool[_-]?call|function[_-]?call)>[\s\S]*?<\/(?:tool[_-]?call|function[_-]?call)>/gi, '')
    // 支持多种字段名称：tool, name, tool_id, function等
    return /\{\s*["'](?:tool|name|tool_id|toolId|function|function_name)["']\s*:/i.test(withoutToolCallTags)
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
      const withoutToolCallTags = content.replace(/<(?:tool[_-]?call|function[_-]?call)>[\s\S]*?<\/(?:tool[_-]?call|function[_-]?call)>/gi, '')
      
      // 查找所有匹配的JSON对象
      const toolCalls: ParsedToolCall[] = []
      let searchIndex = 0
      let index = 0
      
      while (searchIndex < withoutToolCallTags.length) {
        // 查找下一个可能的JSON对象
        const jsonStart = withoutToolCallTags.indexOf('{', searchIndex)
        if (jsonStart === -1) break
        
        const jsonStr = extractOuterJsonString(withoutToolCallTags.substring(jsonStart))
        if (!jsonStr) {
          searchIndex = jsonStart + 1
          continue
        }
        
        // 尝试宽松的JSON解析
        let parsed: any = parseLooseJson(jsonStr)
        
        // 如果宽松解析失败，尝试标准解析
        if (!parsed) {
          try {
            parsed = JSON.parse(jsonStr.replace(/,\s*([}\]])/g, '$1'))
          } catch (parseError) {
            // JSON解析失败，继续查找下一个
            searchIndex = jsonStart + jsonStr.length
            continue
          }
        }
        
        // 使用增强的字段提取函数
        const toolId = extractToolId(parsed)
        const parameters = extractParameters(parsed)
        
        // 检查是否符合工具调用格式：必须有工具ID
        if (toolId && parameters !== null) {
          if (typeof parameters !== 'object' || Array.isArray(parameters)) {
            searchIndex = jsonStart + jsonStr.length
            continue
          }
          
          const toolCall: ParsedToolCall = {
            id: `call_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
            tool_id: toolId,
            parameters: parameters || {},
            isValid: true,
            rawContent: jsonStr
          }
          
          if (validateToolId && toolIdValidator) {
            if (!toolIdValidator(toolId)) {
              toolCall.isValid = false
              toolCall.error = `工具ID "${toolId}" 不存在或不可用`
            }
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
 * 工具调用解析器管理器
 * 按优先级顺序尝试解析，避免重复匹配
 */
export class ToolCallParserManager {
  private parsers: ToolCallParser[] = []
  
  constructor() {
    // 按优先级注册解析器（优先级高的在前）
    // 1. 标准格式（最明确，优先级最高）
    this.parsers.push(new StandardToolCallParser())
    // 2. DeepSeek DSML格式
    this.parsers.push(new DeepSeekDSMLParser())
    // 3. OpenAI格式（最宽松，优先级最低，避免误匹配）
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
        const validResults = result.filter(r => r.isValid)
        if (validResults.length > 0) {
          getLogger().debug(`[ToolCallParserManager] 解析器 ${parser.name} 成功解析 ${validResults.length} 个有效工具调用`)
          return result
        } else {
          getLogger().warn(`[ToolCallParserManager] 解析器 ${parser.name} 解析结果无效，尝试下一个解析器`)
          // 保存结果，但继续尝试其他解析器
          allResults.push(...result)
        }
      } else {
        getLogger().warn(`[ToolCallParserManager] 解析器 ${parser.name} 检测到格式但解析失败，尝试下一个解析器`)
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
    return this.parsers.map(p => p.getMarkerPattern())
  }
  
  /**
   * 检查内容是否包含任何格式的工具调用标记
   */
  hasAnyToolCallMarkers(content: string): boolean {
    return this.parsers.some(parser => parser.detect(content))
  }
}

/**
 * 宽松的JSON解析工具
 * 支持尾随逗号、单引号、注释等非标准JSON格式
 */
function parseLooseJson(jsonStr: string): any | null {
  try {
    let cleaned = jsonStr.trim()
    
    // 1. 移除单行和多行注释（但要小心，避免误删字符串中的内容）
    // 使用更精确的注释匹配，避免匹配到URL中的//
    cleaned = cleaned
      .replace(/\/\/[^\n\r"']*$/gm, '') // 单行注释（不在字符串中）
      .replace(/\/\*[\s\S]*?\*\//g, '') // 多行注释
    
    // 2. 将单引号转换为双引号（更精确的匹配）
    // 匹配键名：'key': 或 'key':
    cleaned = cleaned.replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3')
    // 匹配字符串值：: 'value' 或 :'value'
    cleaned = cleaned.replace(/:\s*'([^']*)'/g, ': "$1"')
    // 匹配数组中的字符串：['value']
    cleaned = cleaned.replace(/\[\s*'([^']*)'\s*\]/g, '["$1"]')
    
    // 3. 移除尾随逗号（在对象和数组的最后一个元素后）
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')
    
    // 4. 修复未转义的换行符（在字符串值中）
    // 注意：这是一个简化的修复，可能不适用于所有情况
    cleaned = cleaned.replace(/:\s*"([^"]*)\n([^"]*)"/g, ': "$1\\n$2"')
    
    // 5. 尝试解析
    return JSON.parse(cleaned)
  } catch (error) {
    getLogger().debug('[parseLooseJson] 宽松解析失败，尝试标准解析:', error)
    try {
      // 如果宽松解析失败，尝试标准解析（只修复尾随逗号）
      return JSON.parse(jsonStr.replace(/,\s*([}\]])/g, '$1'))
    } catch {
      return null
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
  const hasToolIdField = keys.some(key => toolIdFields.includes(key))
  
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

