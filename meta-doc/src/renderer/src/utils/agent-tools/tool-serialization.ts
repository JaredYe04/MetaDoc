/**
 * Tool执行快照序列化/反序列化工具
 * 提供统一的序列化和反序列化功能，确保工具执行结果能够完整保存和恢复
 */

import type {
  ToolExecutionSnapshot,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress,
  ToolExecutionStatus
} from '../../types/agent-tool'

/**
 * 当前快照版本号
 * 当快照结构发生变化时，需要更新此版本号
 */
export const SNAPSHOT_VERSION = '1.0.0'

/**
 * 创建工具执行快照
 * @param invocationId - 调用ID
 * @param toolId - Tool ID
 * @param toolName - Tool名称
 * @param params - 调用参数
 * @param timestamp - 开始时间戳
 * @param result - 最终执行结果
 * @param outputs - 所有中间输出
 * @param toolConfigSnapshot - Tool配置快照
 * @returns 工具执行快照
 */
export function createToolExecutionSnapshot(
  invocationId: string,
  toolId: string,
  toolName: string,
  params: Record<string, unknown>,
  timestamp: number,
  result?: ToolCallbackResult,
  outputs?: Array<{
    id: string
    label: string
    format: string
    data: unknown
    timestamp?: number
  }>,
  toolConfigSnapshot?: ToolExecutionSnapshot['toolConfigSnapshot']
): ToolExecutionSnapshot {
  const snapshot: ToolExecutionSnapshot = {
    version: SNAPSHOT_VERSION,
    invocationId,
    toolId,
    toolName,
    params: deepClone(params),
    timestamp,
    status: result?.status || 'pending',
    outputs: outputs ? deepClone(outputs) : undefined,
    result: result?.result !== undefined ? deepClone(result.result) : undefined,
    data: result?.data ? deepCloneToolCallbackData(result.data) : undefined,
    progress: result?.progress ? deepCloneToolProgress(result.progress) : undefined,
    error: result?.error,
    toolConfigSnapshot
  }

  return snapshot
}

/**
 * 序列化工具执行快照
 * @param snapshot - 工具执行快照
 * @returns JSON字符串
 */
export function serializeToolExecutionSnapshot(snapshot: ToolExecutionSnapshot): string {
  try {
    // 使用JSON.stringify进行序列化，处理循环引用和特殊值
    const serialized = JSON.stringify(snapshot, (key, value) => {
      // 处理undefined值（JSON.stringify会忽略undefined）
      if (value === undefined) {
        return null
      }
      // 处理函数（通常不应该出现在快照中，但为了安全起见）
      if (typeof value === 'function') {
        return `[Function: ${value.name || 'anonymous'}]`
      }
      // 处理Symbol
      if (typeof value === 'symbol') {
        return value.toString()
      }
      // 处理Date对象
      if (value instanceof Date) {
        return {
          __type: 'Date',
          value: value.toISOString()
        }
      }
      // 处理RegExp对象
      if (value instanceof RegExp) {
        return {
          __type: 'RegExp',
          value: value.toString()
        }
      }
      // 处理Error对象
      if (value instanceof Error) {
        return {
          __type: 'Error',
          name: value.name,
          message: value.message,
          stack: value.stack
        }
      }
      return value
    }, 2) // 使用2空格缩进，便于阅读

    return serialized
  } catch (error) {
    throw new Error(`序列化工具执行快照失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 反序列化工具执行快照
 * @param serialized - JSON字符串
 * @returns 工具执行快照
 */
export function deserializeToolExecutionSnapshot(serialized: string): ToolExecutionSnapshot {
  try {
    const parsed = JSON.parse(serialized)

    // 验证快照结构
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('无效的快照格式：不是对象')
    }

    if (!parsed.version) {
      throw new Error('无效的快照格式：缺少版本号')
    }

    if (!parsed.invocationId || !parsed.toolId || !parsed.toolName) {
      throw new Error('无效的快照格式：缺少必需字段')
    }

    // 检查版本兼容性
    if (parsed.version !== SNAPSHOT_VERSION) {
      console.warn(`快照版本不匹配：快照版本 ${parsed.version}，当前版本 ${SNAPSHOT_VERSION}。尝试继续反序列化...`)
    }

    // 恢复特殊类型
    const snapshot = restoreSpecialTypes(parsed) as ToolExecutionSnapshot

    return snapshot
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`反序列化工具执行快照失败：JSON解析错误 - ${error.message}`)
    }
    throw new Error(`反序列化工具执行快照失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 深度克隆对象（处理循环引用）
 */
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  // 处理Date
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T
  }

  // 处理Array
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as unknown as T
  }

  // 处理普通对象
  const cloned = {} as T
  const seen = new WeakMap()

  function clone(value: any): any {
    if (value === null || typeof value !== 'object') {
      return value
    }

    // 检查循环引用
    if (seen.has(value)) {
      return seen.get(value)
    }

    if (value instanceof Date) {
      return new Date(value.getTime())
    }

    if (Array.isArray(value)) {
      const arr: any[] = []
      seen.set(value, arr)
      for (let i = 0; i < value.length; i++) {
        arr[i] = clone(value[i])
      }
      return arr
    }

    const obj: any = {}
    seen.set(value, obj)
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        obj[key] = clone(value[key])
      }
    }
    return obj
  }

  return clone(obj)
}

/**
 * 深度克隆ToolCallbackData
 */
function deepCloneToolCallbackData(data: ToolCallbackData): ToolCallbackData {
  return {
    content: deepClone(data.content),
    format: data.format,
    componentName: data.componentName
  }
}

/**
 * 深度克隆ToolProgress
 */
function deepCloneToolProgress(progress: ToolProgress): ToolProgress {
  return {
    percentage: progress.percentage,
    message: progress.message
  }
}

/**
 * 恢复特殊类型（Date、RegExp、Error等）
 */
function restoreSpecialTypes(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(item => restoreSpecialTypes(item))
  }

  // 处理特殊类型标记
  if (obj.__type === 'Date' && obj.value) {
    return new Date(obj.value)
  }

  if (obj.__type === 'RegExp' && obj.value) {
    const match = obj.value.match(/^\/(.*)\/([gimuy]*)$/)
    if (match) {
      return new RegExp(match[1], match[2])
    }
    return new RegExp(obj.value)
  }

  if (obj.__type === 'Error') {
    const error = new Error(obj.message || 'Unknown error')
    if (obj.name) {
      error.name = obj.name
    }
    if (obj.stack) {
      error.stack = obj.stack
    }
    return error
  }

  // 递归处理对象属性
  const restored: any = {}
  for (const key in obj) {
    if (key !== '__type') {
      restored[key] = restoreSpecialTypes(obj[key])
    }
  }

  return restored
}

/**
 * 验证快照完整性
 * @param snapshot - 工具执行快照
 * @returns 验证结果
 */
export function validateToolExecutionSnapshot(snapshot: ToolExecutionSnapshot): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!snapshot.version) {
    errors.push('缺少版本号')
  }

  if (!snapshot.invocationId) {
    errors.push('缺少调用ID')
  }

  if (!snapshot.toolId) {
    errors.push('缺少Tool ID')
  }

  if (!snapshot.toolName) {
    errors.push('缺少Tool名称')
  }

  if (!snapshot.params || typeof snapshot.params !== 'object') {
    errors.push('缺少或无效的调用参数')
  }

  if (!snapshot.timestamp || typeof snapshot.timestamp !== 'number') {
    errors.push('缺少或无效的时间戳')
  }

  if (!snapshot.status || !['pending', 'running', 'succeeded', 'failed', 'cancelled'].includes(snapshot.status)) {
    errors.push('缺少或无效的执行状态')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 从工具执行历史条目创建快照
 * @param entry - 工具执行历史条目（来自SettingDebugSection）
 * @param toolConfigSnapshot - Tool配置快照（可选）
 * @returns 工具执行快照
 */
export function createSnapshotFromHistoryEntry(
  entry: {
    toolId: string
    toolName: string
    timestamp: number
    status?: ToolExecutionStatus
    params: Record<string, unknown>
    result?: unknown
    data?: ToolCallbackData
    progress?: ToolProgress
    error?: string
    outputs?: Array<{
      id: string
      label: string
      format: string
      data: unknown
      timestamp?: number
    }>
    invocationId?: string
  },
  toolConfigSnapshot?: ToolExecutionSnapshot['toolConfigSnapshot']
): ToolExecutionSnapshot {
  return createToolExecutionSnapshot(
    entry.invocationId || `snapshot-${entry.timestamp}`,
    entry.toolId,
    entry.toolName,
    entry.params,
    entry.timestamp,
    {
      status: entry.status || 'pending',
      result: entry.result,
      data: entry.data,
      progress: entry.progress,
      error: entry.error
    },
    entry.outputs,
    toolConfigSnapshot
  )
}

