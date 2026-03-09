/**
 * LLM适配器类型定义
 */

export type LlmType =
  | 'metadoc'
  | 'ollama'
  | 'openai'
  | 'openai-official'
  | 'deepseek'
  | 'gemini'
  | 'qwen'
  | 'manual'

export type RequestMode = 'completion' | 'chat'

/**
 * LLM配置接口
 */
export interface LlmConfig {
  type: LlmType
  apiUrl?: string
  apiKey?: string
  selectedModel: string
  completionSuffix?: string
  chatSuffix?: string
  completionApiUrl?: string
  temperature?: number
  [key: string]: any // 允许其他配置字段
}

/**
 * 自定义LLM配置接口
 */
export interface CustomLlmConfig {
  type?: string
  baseUrl: string
  apiKey?: string
  model: string
  completionSuffix?: string
  chatSuffix?: string
  temperature?: number
}

/**
 * 消息接口（OpenAI格式）
 */
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

/**
 * 工具调用接口
 */
export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string // JSON字符串
  }
}

/**
 * 响应使用统计接口
 */
export interface UsageStats {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

/**
 * 统一响应格式
 */
export interface UnifiedResponse {
  text: string
  usage: UsageStats | null
}

/**
 * 请求元数据
 */
export interface RequestMeta {
  temperature?: number
  max_tokens?: number
  stream?: boolean
  [key: string]: any
}

/**
 * Gemini API 消息格式
 */
export interface GeminiMessage {
  role: 'user' | 'model'
  parts: Array<{ text: string }>
}

/**
 * Gemini API 响应格式
 */
export interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
}

/**
 * OpenAI API 响应格式
 */
export interface OpenAIResponse {
  choices?: Array<{
    text?: string
    message?: {
      content?: string
    }
    delta?: {
      content?: string
    }
  }>
  usage?: UsageStats
  text?: string
}
