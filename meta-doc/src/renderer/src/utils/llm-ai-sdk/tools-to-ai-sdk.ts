/**
 * 统一工具格式：将引擎 getAvailableTools() 的返回转为 AI SDK 的 tools 定义
 * 所有引擎共用此转换，无需在各引擎内重复写工具格式
 */

import { tool, jsonSchema } from 'ai'
import type { ToolSet } from 'ai'

/**
 * 引擎侧工具定义（与 getAvailableTools() 返回结构一致）
 */
export interface EngineToolSpec {
  id: string
  name: string
  description: string
  schema: unknown
  brief?: string
  fullSpec?: string
}

/**
 * 将 schema 转为 AI SDK 可用的 JSON Schema 对象（保证 type/properties 等）
 */
function normalizeSchema(schema: unknown): Record<string, unknown> {
  if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
    const obj = schema as Record<string, unknown>
    if (obj.type === 'object' || obj.properties) {
      return obj as Record<string, unknown>
    }
    return { type: 'object', properties: obj, required: [] }
  }
  return { type: 'object', properties: {}, required: [] }
}

/**
 * 单条引擎工具转为 AI SDK tool（无 execute，由上层 onToolCallsDetected 执行）
 */
function toAISDKToolOne(spec: EngineToolSpec): ReturnType<typeof tool> {
  const description = [spec.brief || spec.description, spec.fullSpec].filter(Boolean).join('\n\n') || spec.description
  const schema = normalizeSchema(spec.schema)
  return tool({
    description: description.trim() || spec.name,
    inputSchema: jsonSchema(schema)
  })
}

/**
 * 将引擎工具列表转为 AI SDK 的 tools 对象（key 用 tool id，与 tool_id 一致）
 */
export function toAISDKTools(tools: EngineToolSpec[]): ToolSet {
  const record: Record<string, ReturnType<typeof tool>> = {}
  for (const t of tools) {
    record[t.id] = toAISDKToolOne(t)
  }
  return record as ToolSet
}
