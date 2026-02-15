/**
 * 基于 AI Task 的 Schema 驱动 JSON 生成工具
 *
 * 该模块提供了一个可复用的函数，用于根据 JSON Schema 和用户提示词，
 * 通过 AI 生成符合规范的 JSON 数据，并实时展示输出过程。
 */

import { ref, type Ref } from 'vue'
import { createAiTask, ai_types } from './ai_tasks'
import { buildSchemaPrompt, type SchemaDefinition, parseSchemaJson } from './schemas'
import { extractOuterJsonString } from './regex-utils'
import type { AIDialogMessage } from '../../../types'

/**
 * 基于 Schema 的 AI Task 执行选项
 */
export interface SchemaTaskOptions {
  /** 任务名称（用于任务队列显示） */
  taskName?: string
  /** 自定义 LLM 配置（可选） */
  customLlmConfig?: any
  /** 温度参数（可选） */
  temperature?: number
  /** 最大 token 数（可选） */
  maxTokens?: number
  /** 是否启用流式输出（默认 true） */
  stream?: boolean
}

/**
 * 执行基于 Schema 的 AI Task
 *
 * @param schema - JSON Schema 定义，用于约束 AI 输出格式
 * @param userPrompt - 用户提示词，描述需要生成的内容
 * @param outputRef - 用于实时展示 AI 输出的 ref（会在开始前清空）
 * @param options - 可选的配置项
 * @returns Promise，解析后返回符合 Schema 的数据
 *
 * @example
 * ```typescript
 * import { ref } from 'vue'
 * import { generateWithSchema, DOCUMENT_TITLE_SCHEMA } from './utils/ai-schema-task'
 *
 * const outputRef = ref('')
 * const result = await generateWithSchema(
 *   DOCUMENT_TITLE_SCHEMA,
 *   '请为关于"项目进度讨论"的对话生成标题和关键词',
 *   outputRef
 * )
 * console.log(result.title) // 生成的标题
 * console.log(outputRef.value) // 完整的 AI 输出文本
 * ```
 */
export async function generateWithSchema<T = unknown>(
  schema: SchemaDefinition<T>,
  userPrompt: string,
  outputRef: Ref<string>,
  options: SchemaTaskOptions = {}
): Promise<T> {
  // 开始执行前清空 ref 的值
  outputRef.value = ''

  // 构建完整的提示词（组合 schema 和用户提示词）
  const fullPrompt = buildSchemaPrompt(schema, userPrompt)

  // 构建 chat 模式的对话消息
  const messages: AIDialogMessage[] = [
    {
      role: 'user',
      content: fullPrompt,
      timestamp: Date.now()
    }
  ]

  // 生成唯一的 origin_key
  const originKey = `schema-task-${schema.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  // 构建 meta 配置
  const meta: any = {
    stream: options.stream !== false // 默认启用流式输出
  }

  if (options.temperature !== undefined) {
    meta.temperature = options.temperature
  }

  if (options.maxTokens !== undefined) {
    meta.maxTokens = options.maxTokens
  }

  if (options.customLlmConfig) {
    meta.customLlmConfig = options.customLlmConfig
  }

  // 创建 AI Task（使用 chat 模式）
  const { done } = createAiTask(
    options.taskName || `生成 ${schema.name}`,
    messages,
    outputRef,
    ai_types.chat,
    originKey,
    meta
  )

  // 等待任务完成
  await done

  // 使用 extractOuterJsonString 提取 JSON（符合用户要求）
  const jsonString = extractOuterJsonString(outputRef.value)

  if (!jsonString) {
    throw new Error(
      `未能从 AI 输出中提取出符合 ${schema.name} 的 JSON 结果。输出内容：${outputRef.value.substring(0, 200)}...`
    )
  }

  // 解析并返回 JSON 数据
  try {
    return parseSchemaJson<T>(jsonString, schema)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(
      `解析 JSON 数据失败（${schema.name}）：${errorMessage}。原始 JSON：${jsonString}`
    )
  }
}
