/**
 * ToolRunner - 工具执行器
 * 统一工具调用入口，负责验证、执行工具，并将结果包装为Observation
 */

import type { ToolCallbackResult } from '../../types/agent-tool'
import { agentToolManager } from '../agent-tool-manager'
import { createRendererLogger } from '../logger'
import type { AgentSession } from '../../types/agent-framework'

// 懒加载logger，避免初始化顺序问题
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('ToolRunner')
  }
  return loggerInstance
}

/**
 * Tool调用结果（Observation）
 */
export interface ToolObservation {
  toolId: string
  toolName: string
  status: 'succeeded' | 'failed'
  result?: unknown
  error?: string
  summary?: string
  toolConfig?: any // 工具配置，用于导出和序列化
  params?: Record<string, unknown> // 工具调用参数，用于快照导出
}

/**
 * 工具结果序列化模式
 */
export enum ToolResultSerializationMode {
  /** 导出快照格式（用于保存和恢复） */
  SNAPSHOT = 'snapshot',
  /** 导出OpenAI API兼容格式（用于发送给LLM） */
  OPENAI_FORMAT = 'openai-format'
}

/**
 * ToolRunner 类
 */
export class ToolRunner {
  /**
   * 执行工具调用
   */
  static async runTool(
    toolId: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
    session?: AgentSession // 可选的session对象，用于工具访问session状态
  ): Promise<ToolObservation> {
    try {
      // 执行普通工具
      const tool = agentToolManager.getTool(toolId)
      if (!tool) {
        throw new Error(`工具 ${toolId} 未找到`)
      }

      if (!tool.config.enabled) {
        throw new Error(`工具 ${toolId} 已禁用`)
      }

      getLogger().debug(`执行工具: ${toolId}`, params)

      // 如果提供了session，自动注入sessionId到参数中（用于工具访问session状态）
      const toolParams = session
        ? { ...params, _sessionId: session.id, _session: session } // 同时传递sessionId和session对象
        : params

      // 调用工具
      const result = await agentToolManager.invokeTool(
        toolId,
        toolParams,
        undefined // 状态更新回调（可选）
      )

      // 包装为Observation（包含调用参数）
      // 注意：如果result包含result字段（给AI的纯文本）和data字段（给Display的完整数据），
      // 需要将两者都保存，以便serializeToOpenAIFormat可以使用result.result
      const observationResult =
        result.result !== undefined
          ? { result: result.result, data: result.data } // 同时保存result和data
          : result.data // 向后兼容：如果没有result字段，只使用data

      getLogger().debug(`[ToolRunner] 包装工具执行结果`, {
        toolId,
        hasResultField: result.result !== undefined,
        hasDataField: result.data !== undefined,
        resultType: typeof result.result,
        dataType: typeof result.data,
        status: result.status
      })

      return {
        toolId,
        toolName:
          typeof tool.config.name === 'string'
            ? tool.config.name
            : tool.config.name['zh_cn']?.name || tool.config.name['en_us']?.name || toolId,
        status: result.status === 'succeeded' ? 'succeeded' : 'failed',
        result: observationResult,
        error: result.error,
        summary: result.result
          ? this.generateSummary(result.result)
          : result.data
            ? this.generateSummary(result.data)
            : undefined,
        params: params // 保存调用参数，用于快照导出
      }
    } catch (error) {
      getLogger().error(`工具执行失败: ${toolId}`, error)
      return {
        toolId,
        toolName: toolId,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 生成结果摘要
   * 注意：为了功能完整性，不再截断内容，返回完整数据
   */
  private static generateSummary(data: unknown): string {
    if (typeof data === 'string') {
      return data
    }
    if (typeof data === 'object' && data !== null) {
      try {
        return JSON.stringify(data)
      } catch {
        return '执行完成'
      }
    }
    return String(data)
  }

  /**
   * 验证工具调用参数
   */
  static validateToolParams(
    toolId: string,
    params: Record<string, unknown>
  ): { valid: boolean; errors: string[] } {
    const tool = agentToolManager.getTool(toolId)
    if (!tool) {
      return { valid: false, errors: [`工具 ${toolId} 未找到`] }
    }

    const errors: string[] = []
    const schema = tool.config.inputSchema

    if (schema && typeof schema === 'object' && 'properties' in schema) {
      const properties = (schema as any).properties || {}
      const required = (schema as any).required || []

      // 检查必需参数
      for (const field of required) {
        if (!(field in params) || params[field] === undefined || params[field] === null) {
          errors.push(`缺少必需参数: ${field}`)
        }
      }

      // 类型检查（简化版）
      for (const [field, value] of Object.entries(params)) {
        if (field in properties) {
          const fieldSchema = properties[field]
          const expectedType = fieldSchema.type

          if (expectedType && !this.validateType(value, expectedType)) {
            errors.push(`参数 ${field} 类型不匹配，期望 ${expectedType}`)
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * 类型验证
   */
  private static validateType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string'
      case 'number':
        return typeof value === 'number'
      case 'boolean':
        return typeof value === 'boolean'
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value)
      case 'array':
        return Array.isArray(value)
      default:
        return true // 未知类型，不验证
    }
  }

  /**
   * 将工具执行结果序列化为OpenAI API兼容格式的字符串
   * 这是工具结果的标准序列化方法，确保所有工具的结果都能正确发送给LLM API
   *
   * @param observation - 工具执行结果
   * @returns OpenAI API兼容的字符串格式的content（tool消息的content字段必须是字符串）
   */
  static serializeToOpenAIFormat(observation: ToolObservation): string {
    try {
      let data = observation.result

      // 如果result是ToolCallbackResult格式（包含result和data字段），优先使用result（给AI的纯文本）
      // 这是为了支持工具可以分别返回给AI和Display的内容（如web-crawler的HTML提取）
      if (data && typeof data === 'object' && 'result' in data && 'data' in data) {
        const toolResult = data as any
        // 优先使用result字段（给AI的纯文本），如果没有则使用data
        data = toolResult.result !== undefined ? toolResult.result : toolResult.data

        getLogger().debug(`[ToolRunner] 检测到ToolCallbackResult格式，使用result字段`, {
          toolId: observation.toolId,
          hasResult: toolResult.result !== undefined,
          resultType: typeof toolResult.result,
          dataType: typeof toolResult.data,
          resultLength: typeof toolResult.result === 'string' ? toolResult.result.length : 'N/A',
          dataLength:
            typeof toolResult.data === 'object' && toolResult.data?.content
              ? typeof toolResult.data.content === 'string'
                ? toolResult.data.content.length
                : 'N/A'
              : 'N/A'
        })
      }

      // 如果result是ToolCallbackData格式（包含content和format字段），提取content
      if (data && typeof data === 'object' && 'content' in data && 'format' in data) {
        data = (data as any).content
      }

      // 确保data是可序列化的
      if (data === null || data === undefined) {
        // 如果没有数据，返回状态信息
        return observation.status === 'succeeded'
          ? `工具 ${observation.toolName} 执行成功。`
          : `工具 ${observation.toolName} 执行失败: ${observation.error || '未知错误'}`
      }

      // 如果是字符串，直接返回
      if (typeof data === 'string') {
        getLogger().debug(`[ToolRunner] 序列化字符串结果`, {
          toolId: observation.toolId,
          length: data.length,
          preview: data.substring(0, 200) + (data.length > 200 ? '...' : '')
        })
        return data
      }

      // 如果是对象或数组，序列化为JSON字符串
      if (typeof data === 'object') {
        const jsonString = JSON.stringify(data)
        getLogger().debug(`[ToolRunner] 序列化对象结果`, {
          toolId: observation.toolId,
          jsonLength: jsonString.length,
          jsonPreview: jsonString.substring(0, 200) + (jsonString.length > 200 ? '...' : '')
        })
        return jsonString
      }

      // 其他类型，转换为字符串
      const stringResult = String(data)
      getLogger().debug(`[ToolRunner] 序列化其他类型结果`, {
        toolId: observation.toolId,
        type: typeof data,
        length: stringResult.length
      })
      return stringResult
    } catch (error) {
      getLogger().error(`序列化工具结果失败: ${observation.toolId}`, error)
      // 如果序列化失败，返回错误信息
      return observation.status === 'succeeded'
        ? `工具 ${observation.toolName} 执行成功，但结果序列化失败。`
        : `工具 ${observation.toolName} 执行失败: ${observation.error || '未知错误'}`
    }
  }

  /**
   * 将工具执行结果导出为快照格式
   * 用于保存完整的工具执行上下文，包括所有输出和元数据
   *
   * @param observation - 工具执行结果
   * @param invocationId - 工具调用ID（可选）
   * @returns 快照格式的对象
   */
  static serializeToSnapshot(observation: ToolObservation, invocationId?: string): any {
    return {
      invocationId:
        invocationId || `invocation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      toolId: observation.toolId,
      toolName: observation.toolName,
      status: observation.status,
      result: observation.result,
      error: observation.error,
      summary: observation.summary,
      timestamp: Date.now()
    }
  }
}
