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
    return /<tool_call>/i.test(content)
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
      const toolCallPattern = loose
        ? /<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/gi
        : /<tool_call>([\s\S]*?)<\/tool_call>/gi
      
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
      let jsonStr = extractOuterJsonString(toolCallContent)
      if (!jsonStr) {
        return this.createInvalidToolCall(toolCallContent, index, '未找到有效的JSON字符串')
      }
      
      jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1')
      
      let parsed: any
      try {
        parsed = JSON.parse(jsonStr)
      } catch (parseError) {
        return this.createInvalidToolCall(toolCallContent, index, `JSON解析失败: ${parseError}`)
      }
      
      const toolId = parsed.name || parsed.tool_id || parsed.toolId
      const parameters = parsed.arguments || parsed.parameters || parsed.params || {}
      
      if (!toolId) {
        return this.createInvalidToolCall(toolCallContent, index, '缺少工具ID（name/tool_id字段）')
      }
      
      if (typeof parameters !== 'object' || parameters === null || Array.isArray(parameters)) {
        return this.createInvalidToolCall(toolCallContent, index, '参数必须是对象类型')
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
    return content.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim()
  }
  
  getMarkerPattern(): RegExp {
    return /<tool_call>[\s\S]*?<\/tool_call>/gi
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
      
      // 如果 string 属性存在且值不为 "false"，使用它作为字符串值
      if (stringValue !== undefined && stringValue !== '' && stringValue !== 'false') {
        parameters[paramName] = stringValue
        getLogger().debug(`[parseDSMLParameters] 参数 ${paramName} 使用string属性:`, stringValue)
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
    // 检测是否包含 "tool" 字段的JSON对象
    // 但要排除已经在 <tool_call> 标签中的内容
    const withoutToolCallTags = content.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    return /\{\s*["']tool["']\s*:/i.test(withoutToolCallTags)
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
      // 先移除 <tool_call> 标签中的内容，避免重复匹配
      const withoutToolCallTags = content.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
      
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
        
        try {
          const parsed = JSON.parse(jsonStr)
          
          // 检查是否符合OpenAI格式：必须有 "tool" 字段
          if (parsed.tool && typeof parsed.tool === 'string') {
            const toolId = parsed.tool
            const parameters = parsed.arguments || parsed.params || {}
            
            if (typeof parameters !== 'object' || parameters === null || Array.isArray(parameters)) {
              searchIndex = jsonStart + jsonStr.length
              continue
            }
            
            const toolCall: ParsedToolCall = {
              id: `call_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
              tool_id: toolId,
              parameters,
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
        } catch (parseError) {
          // JSON解析失败，继续查找下一个
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
      
      try {
        const parsed = JSON.parse(jsonStr)
        // 如果符合OpenAI格式，清除它
        if (parsed.tool && typeof parsed.tool === 'string') {
          cleaned = cleaned.substring(0, jsonStart) + cleaned.substring(jsonStart + jsonStr.length)
          continue
        }
      } catch {
        // 解析失败，不是我们要清除的JSON
      }
      
      searchIndex = jsonStart + jsonStr.length
    }
    
    return cleaned.trim()
  }
  
  getMarkerPattern(): RegExp {
    // OpenAI格式没有固定的标记模式，返回一个匹配JSON的模式
    return /\{\s*["']tool["']\s*:/gi
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
   * 按优先级顺序尝试，一旦匹配到就返回结果
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
    
    // 按优先级顺序尝试解析
    for (const parser of this.parsers) {
      const detected = parser.detect(content)
      getLogger().debug(`[ToolCallParserManager] 解析器 ${parser.name} 检测结果:`, detected)
      
      if (detected) {
        getLogger().debug(`[ToolCallParserManager] 使用解析器: ${parser.name}`)
        const result = parser.parse(content, options)
        
        if (result && result.length > 0) {
          getLogger().debug(`[ToolCallParserManager] 解析器 ${parser.name} 成功解析 ${result.length} 个工具调用`)
          return result
        } else {
          getLogger().warn(`[ToolCallParserManager] 解析器 ${parser.name} 检测到格式但解析失败`)
        }
      }
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

// 导出单例实例
export const toolCallParserManager = new ToolCallParserManager()

