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
 * 部分 OpenAI 兼容网关（及部分 JSON Schema 校验）要求 `type: array` 必须带 `items`；
 * DeepSeek 等较宽松可缺省，会导致 400 Invalid schema。
 */
function ensureArraySchemasHaveItems(node: unknown): void {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const el of node) ensureArraySchemasHaveItems(el)
    return
  }
  const o = node as Record<string, unknown>
  if (o.type === 'array' && o.items === undefined) {
    o.items = {}
  }
  const props = o.properties
  if (props && typeof props === 'object' && !Array.isArray(props)) {
    for (const k of Object.keys(props as Record<string, unknown>)) {
      ensureArraySchemasHaveItems((props as Record<string, unknown>)[k])
    }
  }
  const pp = o.patternProperties
  if (pp && typeof pp === 'object' && !Array.isArray(pp)) {
    for (const k of Object.keys(pp as Record<string, unknown>)) {
      ensureArraySchemasHaveItems((pp as Record<string, unknown>)[k])
    }
  }
  if (o.items !== undefined) ensureArraySchemasHaveItems(o.items)
  if (typeof o.additionalProperties === 'object' && o.additionalProperties !== null) {
    ensureArraySchemasHaveItems(o.additionalProperties)
  }
  for (const key of ['allOf', 'anyOf', 'oneOf'] as const) {
    const arr = o[key]
    if (Array.isArray(arr)) for (const x of arr) ensureArraySchemasHaveItems(x)
  }
  if (o.not !== undefined) ensureArraySchemasHaveItems(o.not)
  if (o.if !== undefined) ensureArraySchemasHaveItems(o.if)
  if (o.then !== undefined) ensureArraySchemasHaveItems(o.then)
  if (o.else !== undefined) ensureArraySchemasHaveItems(o.else)
}

/**
 * 部分 OpenAI 兼容网关（如 4sapi）要求工具 schema 为「简单 JSON Schema」：
 * 根节点须为 type object，且顶层（以及部分实现会递归）**不得**出现 oneOf / anyOf / allOf / enum / not。
 * 见错误：Invalid schema ... must have type 'object' and not have 'oneOf'/...
 */
function sanitizeStrictCompatibleJsonSchema(node: unknown): void {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const el of node) sanitizeStrictCompatibleJsonSchema(el)
    return
  }
  const o = node as Record<string, unknown>

  if (Array.isArray(o.enum)) {
    const vals = o.enum as unknown[]
    const hint = `Allowed values: ${vals.map(String).join(', ')}`
    o.description =
      typeof o.description === 'string' && o.description.trim()
        ? `${o.description} (${hint})`
        : hint
    delete o.enum
  }

  if ('not' in o) {
    delete o.not
    if (o.type === undefined && !o.properties) {
      o.type = 'object'
      o.additionalProperties = true
    }
  }

  let hadOneOfLike = false
  for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
    if (key in o) {
      hadOneOfLike = true
      delete o[key]
    }
  }
  if (hadOneOfLike && o.type === undefined && !o.properties && !o.$ref) {
    o.type = 'object'
    o.additionalProperties = true
  }

  const props = o.properties
  if (props && typeof props === 'object' && !Array.isArray(props)) {
    for (const k of Object.keys(props as Record<string, unknown>)) {
      sanitizeStrictCompatibleJsonSchema((props as Record<string, unknown>)[k])
    }
  }
  const pp = o.patternProperties
  if (pp && typeof pp === 'object' && !Array.isArray(pp)) {
    for (const k of Object.keys(pp as Record<string, unknown>)) {
      sanitizeStrictCompatibleJsonSchema((pp as Record<string, unknown>)[k])
    }
  }
  if (o.items !== undefined) sanitizeStrictCompatibleJsonSchema(o.items)
  if (typeof o.additionalProperties === 'object' && o.additionalProperties !== null) {
    sanitizeStrictCompatibleJsonSchema(o.additionalProperties)
  }
  for (const key of ['allOf', 'anyOf', 'oneOf'] as const) {
    const arr = o[key]
    if (Array.isArray(arr)) for (const x of arr) sanitizeStrictCompatibleJsonSchema(x)
  }
  if (o.if !== undefined) sanitizeStrictCompatibleJsonSchema(o.if)
  if (o.then !== undefined) sanitizeStrictCompatibleJsonSchema(o.then)
  if (o.else !== undefined) sanitizeStrictCompatibleJsonSchema(o.else)
}

/**
 * 将 schema 转为 AI SDK 可用的 JSON Schema 对象（保证 type/properties 等）
 */
function normalizeSchema(schema: unknown): Record<string, unknown> {
  let root: unknown = schema
  if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
    try {
      root = JSON.parse(JSON.stringify(schema))
    } catch {
      root = schema
    }
  }
  if (root && typeof root === 'object' && !Array.isArray(root)) {
    const obj = root as Record<string, unknown>
    let out: Record<string, unknown>
    if (obj.type === 'object' || obj.properties) {
      out = obj as Record<string, unknown>
    } else {
      out = { type: 'object', properties: obj, required: [] }
    }
    ensureArraySchemasHaveItems(out)
    sanitizeStrictCompatibleJsonSchema(out)
    return out
  }
  const fallback = { type: 'object', properties: {}, required: [] }
  ensureArraySchemasHaveItems(fallback)
  sanitizeStrictCompatibleJsonSchema(fallback)
  return fallback
}

/**
 * 单条引擎工具转为 AI SDK tool（无 execute，由上层 onToolCallsDetected 执行）
 */
function toAISDKToolOne(spec: EngineToolSpec): ReturnType<typeof tool> {
  const description =
    [spec.brief || spec.description, spec.fullSpec].filter(Boolean).join('\n\n') || spec.description
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
