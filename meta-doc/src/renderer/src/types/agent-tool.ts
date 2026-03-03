/**
 * Agent Tool 系统类型定义
 * 定义了Tool的配置、回调、状态等核心类型
 */

import type { Component } from 'vue'

/**
 * Tool执行状态
 */
export type ToolExecutionStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'

/**
 * Tool输出格式
 */
export type ToolOutputFormat = 'text' | 'json' | 'markdown' | 'xml' | 'html' | 'custom'

/**
 * Tool来源
 */
export type ToolOrigin = 'internal' | 'external' | 'mcp'

/**
 * i18n文本支持
 * 可以是纯文本字符串，也可以是i18n对象
 */
export type LocalizedText = string | ToolLocales

/**
 * Tool i18n文本对象
 * 每个语言对应一个包含name和description的对象
 */
export interface ToolLocales {
  [locale: string]: {
    name?: string
    description?: string
    instruction?: string
  }
}

/**
 * Tool回调函数返回的中间数据
 */
export interface ToolCallbackData {
  /** 数据内容 */
  content: unknown
  /** 数据格式 */
  format: ToolOutputFormat
  /** 可选的显示组件名称（如果tool提供了显示组件） */
  componentName?: string
}

/**
 * Tool执行进度（可选）
 */
export interface ToolProgress {
  /** 进度百分比 0-100 */
  percentage: number
  /** 进度描述 */
  message?: string
}

/**
 * Tool回调函数返回结果
 */
export interface ToolCallbackResult {
  /** 执行状态 */
  status: ToolExecutionStatus
  /** 中间数据（用于展示） */
  data?: ToolCallbackData
  /** 进度信息（可选） */
  progress?: ToolProgress
  /** 错误信息（如果失败） */
  error?: string
  /** 最终结果（成功时） */
  result?: unknown
}

/**
 * Tool回调函数类型
 * @param params - Tool调用参数（由Agent传入）
 * @param signal - AbortSignal，用于取消操作
 * @param onUpdate - 更新回调，用于报告中间状态和进度
 * @returns Promise<ToolCallbackResult>
 */
export type ToolCallback = (
  params: Record<string, unknown>,
  signal: AbortSignal,
  onUpdate: (data: ToolCallbackData, progress?: ToolProgress) => void
) => Promise<ToolCallbackResult>

/**
 * Tool显示组件Props
 */
export interface ToolDisplayComponentProps {
  /** 当前回调数据 */
  data: unknown
  /** 当前执行状态 */
  status: ToolExecutionStatus
  /** 当前进度（如果有） */
  progress?: ToolProgress
  /** 错误信息（如果有） */
  error?: string
  /** 工具配置 */
  toolConfig: AgentToolConfig
  /** Tool执行ID（用于eventBus通信） */
  invocationId?: string
  /** 更新回调，用于交互式组件向tool回调函数发送数据 */
  onUpdate?: (data: unknown) => void
  /** 取消回调 */
  onCancel?: () => void
  /** 紧凑模式（如 AgentViewCompact）：最简 UI，默认折叠的 monaco/文件列表等 */
  compact?: boolean
}

/**
 * Tool规范接口（用于优化上下文空间）
 * brief 永远进入 System Prompt，fullSpec 按需注入
 */
export interface ToolSpec {
  /** Tool名称 */
  name: string
  /** 简短说明（永远进入 System Prompt，用于意图识别和工具选择） */
  brief: string
  /** 完整说明（按需注入，包含详细的使用说明、参数说明等） */
  fullSpec: string
}

/**
 * Tool配置接口
 */
export interface AgentToolConfig {
  /** Tool唯一标识 */
  id: string
  /** Tool名称（支持i18n） */
  name: LocalizedText
  /** Tool描述（支持i18n） */
  description: LocalizedText
  /** Tool来源 */
  origin: ToolOrigin
  /** Tool详细说明（Markdown格式，支持i18n） */
  instruction: string | ToolLocales
  /** Tool规范（用于优化上下文空间，如果提供则优先使用） */
  spec?: ToolSpec
  /** 回调函数（必须） */
  callback: ToolCallback
  /** 显示组件（可选） */
  displayComponent?: Component | string
  /** 标签 */
  tags?: string[]
  /** 是否启用 */
  enabled?: boolean
  /** 是否在默认工具集中隐藏（不推荐给 Agent 使用，如 outline-tree；工具仍可被显式加入集合调用） */
  hidden?: boolean
  /** 是否可编辑（内部tool不可编辑） */
  editable?: boolean
  /** MCP配置（如果是MCP tool） */
  mcpConfig?: MCPToolConfig
  /** i18n文本映射 */
  locales?: {
    [locale: string]: {
      name?: string
      description?: string
      [key: string]: string | undefined
    }
  }
  /** 正在运行 */
  running?: boolean
  /** 是否需要LLM */
  requiresLLM?: boolean
  /** 输入模式 */
  inputSchema?: any
  /** 输出模式 */
  outputSchema?: any
}

/**
 * MCP Tool配置
 */
export interface MCPToolConfig {
  /** MCP服务器名称 */
  serverName: string
  /** MCP工具名称 */
  toolName: string
  /** MCP服务器URL或路径 */
  serverUrl?: string
  /** 其他MCP配置 */
  [key: string]: unknown
}

/**
 * Tool注册信息（用于管理器）
 */
export interface RegisteredTool {
  /** Tool配置 */
  config: AgentToolConfig
  /** 是否正在运行 */
  running: boolean
  /** 最后使用时间 */
  lastUsed?: string
  /** 执行次数 */
  usageCount: number
}

/**
 * Tool调用上下文
 */
export interface ToolInvocationContext {
  /** 调用ID */
  invocationId: string
  /** Tool ID */
  toolId: string
  /** 调用参数 */
  params: Record<string, unknown>
  /** 开始时间 */
  startTime: string
  /** AbortController */
  controller: AbortController
  /** 状态更新回调 */
  onStatusUpdate?: (
    status: ToolExecutionStatus,
    data?: ToolCallbackData,
    progress?: ToolProgress
  ) => void
  /** 超时计数（用于跟踪连续超时次数） */
  timeoutCount?: number
  /** 最后一次更新时间（用于检测是否有实际进展） */
  lastUpdateTime?: number
  /** 最后一次ref值（用于检测流式输出是否有更新） */
  lastRefValue?: string
  /** 最后一次ref值长度（用于检测流式输出是否有更新） */
  lastRefLength?: number
  /** origin_key（用于查找对应的AI任务） */
  originKey?: string
  /** 是否已超时（用于标记超时但允许解析已有内容） */
  isTimeout?: boolean
}

/**
 * Tool执行快照 - 用于完整序列化和反序列化
 * 包含工具执行的所有信息，确保反序列化后能够完全还原执行状态
 */
export interface ToolExecutionSnapshot {
  /** 快照版本（用于兼容性检查） */
  version: string
  /** 调用ID */
  invocationId: string
  /** Tool ID */
  toolId: string
  /** Tool名称（用于显示） */
  toolName: string
  /** 调用参数 */
  params: Record<string, unknown>
  /** 开始时间戳 */
  timestamp: number
  /** 执行状态 */
  status: ToolExecutionStatus
  /** 所有中间输出（onUpdate调用） */
  outputs?: Array<{
    id: string
    label: string
    format: ToolOutputFormat
    data: unknown
    timestamp?: number
  }>
  /** 最终结果 */
  result?: unknown
  /** 最终数据（用于Display组件） */
  data?: ToolCallbackData
  /** 最终进度 */
  progress?: ToolProgress
  /** 错误信息（如果失败） */
  error?: string
  /** Tool配置的快照（用于反序列化时验证） */
  toolConfigSnapshot?: {
    id: string
    name: LocalizedText
    description: LocalizedText
    origin: ToolOrigin
    displayComponent?: string // 组件名称或路径，不序列化组件本身
  }
}

/**
 * Tool序列化器接口
 * 每个Tool可以实现此接口以提供自定义的序列化/反序列化逻辑
 */
export interface ToolSerializer {
  /**
   * 序列化工具执行结果
   * @param snapshot - 工具执行快照
   * @returns 序列化后的字符串
   */
  serialize(snapshot: ToolExecutionSnapshot): string

  /**
   * 反序列化工具执行结果
   * @param serialized - 序列化后的字符串
   * @returns 工具执行快照
   */
  deserialize(serialized: string): ToolExecutionSnapshot
}
