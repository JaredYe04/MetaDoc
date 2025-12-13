/**
 * Agent框架核心类型定义
 * 包含Workflow、AgentConfig、AgentSession等核心实体
 */

import type { AgentToolConfig, ToolExecutionStatus } from './agent-tool'
import type { LocalizedText } from './agent-tool'

/**
 * 实体类型标识符（用于序列化/反序列化时识别实体类型）
 */
export type EntityType = 'workflow' | 'tool-collection' | 'agent-config' | 'agent-session' | 'agent-engine'

/**
 * 工件（Artifact）类型
 */
export type ArtifactType = 'tool' | 'llm-decision' | 'workflow' | 'agent-config'

/**
 * 工件节点
 */
export interface ArtifactNode {
  /** 节点ID（在工作流内唯一） */
  id: string
  /** 工件类型 */
  type: ArtifactType
  /** 工件引用ID（tool ID、workflow ID或agent-config ID） */
  artifactId: string
  /** 节点标签（用于显示） */
  label: string
  /** 节点位置（用于画布） */
  position?: { x: number; y: number }
  /** 输入参数映射（定义如何从上游节点或变量获取输入） */
  inputs?: ArtifactInput[]
  /** 输出字段映射（定义输出哪些字段） */
  outputs?: ArtifactOutput[]
  /** 节点配置（特定于节点类型的配置） */
  config?: Record<string, unknown>
}

/**
 * 工件输入定义
 */
export interface ArtifactInput {
  /** 参数名称 */
  name: string
  /** 参数类型 */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'
  /** 是否必需 */
  required?: boolean
  /** 默认值 */
  defaultValue?: unknown
  /** 输入来源类型 */
  sourceType: 'constant' | 'variable' | 'upstream' | 'context'
  /** 输入来源值（根据sourceType解释） */
  sourceValue: string | unknown
  /** 如果sourceType是upstream，指定上游节点ID和输出字段 */
  upstreamNodeId?: string
  upstreamField?: string
  /** 如果sourceType是variable，变量名 */
  variableName?: string
  /** 如果sourceType是context，上下文键名 */
  contextKey?: string
}

/**
 * 工件输出定义
 */
export interface ArtifactOutput {
  /** 输出字段名 */
  name: string
  /** 输出字段类型 */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'
  /** 输出描述 */
  description?: string
}

/**
 * 工作流连接（边）
 */
export interface WorkflowEdge {
  /** 边ID */
  id: string
  /** 源节点ID */
  source: string
  /** 目标节点ID */
  target: string
  /** 源输出字段（可选，如果为空则使用整个输出） */
  sourceField?: string
  /** 目标输入字段（可选，如果为空则使用整个输入） */
  targetField?: string
  /** 条件表达式（可选，用于条件跳转） */
  condition?: string
  /** 边标签（用于显示） */
  label?: string
}

/**
 * 控制流节点类型
 */
export type ControlFlowType =
  | 'start'
  | 'end'
  | 'condition'
  | 'loop'
  | 'parallel'
  | 'merge'
  | 'async'
  | 'aggregate'

/**
 * 控制流节点
 */
export interface ControlFlowNode {
  /** 节点ID */
  id: string
  /** 控制流类型 */
  type: ControlFlowType
  /** 节点标签 */
  label: string
  /** 节点位置 */
  position?: { x: number; y: number }
  /** 配置（根据类型不同而不同） */
  config: {
    /** 条件节点：条件表达式 */
    condition?: string
    /** 循环节点：循环条件、最大次数等 */
    loopCondition?: string
    maxIterations?: number
    /** 并行节点：并行分支数量 */
    parallelCount?: number
    /** 汇总节点：汇总策略（all、any、first等） */
    aggregateStrategy?: 'all' | 'any' | 'first' | 'last' | 'merge'
  }
}

/**
 * 工作流定义
 */
export interface Workflow {
  /** 实体类型 */
  entityType: 'workflow'
  /** 工作流ID（全局唯一） */
  id: string
  /** 工作流名称（支持i18n） */
  name: LocalizedText
  /** 工作流描述（支持i18n） */
  description: LocalizedText
  /** 版本号 */
  version: string
  /** 创建时间戳 */
  createdAt: number
  /** 更新时间戳 */
  updatedAt: number
  /** 工件节点列表 */
  artifactNodes: ArtifactNode[]
  /** 控制流节点列表 */
  controlFlowNodes: ControlFlowNode[]
  /** 边列表 */
  edges: WorkflowEdge[]
  /** 入口节点ID */
  entryNodeId: string
  /** 出口节点ID列表 */
  exitNodeIds: string[]
  /** 工作流变量定义 */
  variables?: WorkflowVariable[]
  /** 工作流配置 */
  config?: {
    /** 是否支持并发执行 */
    concurrent?: boolean
    /** 超时时间（毫秒） */
    timeout?: number
    /** 重试配置 */
    retry?: {
      maxAttempts: number
      backoff: 'linear' | 'exponential'
      delay: number
    }
  }
  /** 输入Schema（JSON Schema格式） */
  inputSchema?: Record<string, unknown>
  /** 输出Schema（JSON Schema格式） */
  outputSchema?: Record<string, unknown>
  /** 是否启用 */
  enabled?: boolean
  /** 标签 */
  tags?: string[]
  /** 是否为内置工作流（不可删除） */
  isBuiltIn?: boolean
}

/**
 * 工作流变量
 */
export interface WorkflowVariable {
  /** 变量名 */
  name: string
  /** 变量类型 */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  /** 默认值 */
  defaultValue?: unknown
  /** 变量描述 */
  description?: string
}

/**
 * 工具集（ToolCollection）
 */
export interface ToolCollection {
  /** 实体类型 */
  entityType: 'tool-collection'
  /** 工具集ID（全局唯一） */
  id: string
  /** 工具集名称（支持i18n） */
  name: LocalizedText
  /** 工具集描述（支持i18n） */
  description: LocalizedText
  /** 版本号 */
  version: string
  /** 创建时间戳 */
  createdAt: number
  /** 更新时间戳 */
  updatedAt: number
  /** 工具ID列表（包括内部tool、外部tool、workflow） */
  toolIds: string[]
  /** 是否启用 */
  enabled?: boolean
  /** 标签 */
  tags?: string[]
  /** 是否为内置工具集（不可删除） */
  isBuiltIn?: boolean
}

/**
 * Agent配置（AgentConfig）
 */
export interface AgentConfig {
  /** 实体类型 */
  entityType: 'agent-config'
  /** Agent配置ID（全局唯一） */
  id: string
  /** Agent配置名称（支持i18n） */
  name: LocalizedText
  /** Agent配置描述（支持i18n） */
  description: LocalizedText
  /** 版本号 */
  version: string
  /** 创建时间戳 */
  createdAt: number
  /** 更新时间戳 */
  updatedAt: number
  /** 工具集ID列表（取交集） */
  toolCollectionIds: string[]
  /** 最大工具调用次数（null表示无限制） */
  maxToolCalls?: number | null
  /** LLM配置 */
  llmConfig?: {
    /** 模型名称 */
    model?: string
    /** 温度 */
    temperature?: number
    /** 最大token数 */
    maxTokens?: number
    /** 系统提示词 */
    systemPrompt?: string
    /** 是否注入时间戳 */
    injectTimestamp?: boolean
  }
  /** Agent行为配置 */
  behavior?: {
    /** 是否允许工具调用 */
    allowToolCalls?: boolean
    /** 是否允许工作流调用 */
    allowWorkflowCalls?: boolean
    /** 是否启用思考过程 */
    enableThoughts?: boolean
  }
  /** 是否启用 */
  enabled?: boolean
  /** 标签 */
  tags?: string[]
  /** 场景类型（用于分类） */
  scenario?: 'outline' | 'editor' | 'analysis' | 'visualization' | 'custom'
}

/**
 * 引用素材
 */
export interface Reference {
  /** 引用ID */
  id: string
  /** 引用名称 */
  name: string
  /** 引用来源（文件路径、URL或其他，如时间戳等程序注入的引用） */
  origin: string
  /** 文件格式（pdf, docx, pptx, html, xml, xlsx, csv, json, md, txt等，或纯文本） */
  format: string
  /** 解析后的内容（供AI参考的通用文本内容，上传时已解析） */
  parsedContent: string
  /** 引用描述 */
  description?: string
  /** 元数据 */
  metadata?: Record<string, unknown>
  /** 创建时间戳 */
  createdAt: number
  /** 更新时间戳 */
  updatedAt: number
}

/**
 * 公共上下文空间（Agent会话中所有LLM调用可见）
 */
export interface PublicContext {
  /** 当前时间（ISO字符串） */
  currentTime?: string
  /** 当前地区/时区 */
  timezone?: string
  /** 当前文档信息 */
  document?: {
    id: string
    path: string
    format: 'md' | 'tex'
    title?: string
  }
  /** 自定义上下文数据（谨慎使用） */
  custom?: Record<string, unknown>
}

/**
 * Agent会话消息队列项
 */
export interface QueuedMessage {
  /** 消息ID */
  id: string
  /** 消息内容 */
  content: string
  /** 消息角色 */
  role: 'user' | 'system' | 'assistant'
  /** 插入时间戳 */
  timestamp: number
  /** 插入时的消息ID（用于标注在什么时间点插入） */
  insertedAtMessageId?: string
  /** 是否已处理 */
  processed: boolean
}

/**
 * Agent会话状态
 */
export type AgentSessionStatus = 'idle' | 'thinking' | 'generating' | 'tool-calling' | 'workflow-executing' | 'waiting-input' | 'error'

/**
 * Agent会话执行节点（用于重试和Duplicate）
 */
export interface ExecutionNode {
  /** 节点ID */
  id: string
  /** 节点类型 */
  type: 'message' | 'tool-call' | 'workflow-call' | 'llm-call'
  /** 节点时间戳 */
  timestamp: number
  /** 节点数据 */
  data: unknown
  /** 节点状态 */
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  /** 节点结果 */
  result?: unknown
  /** 节点错误 */
  error?: string
}

/**
 * Agent会话（AgentSession）
 */
export interface AgentSession {
  /** 实体类型 */
  entityType: 'agent-session'
  /** 会话ID（在文档内唯一） */
  id: string
  /** 会话标题 */
  title: string
  /** 会话描述 */
  description?: string
  /** 关联的AgentConfig ID */
  agentConfigId: string
  /** 创建时间戳 */
  createdAt: number
  /** 更新时间戳 */
  updatedAt: number
  /** 消息列表 */
  messages: AgentMessage[]
  /** 消息队列 */
  messageQueue: QueuedMessage[]
  /** 引用素材存储 */
  referenceStore: Reference[]
  /** 公共上下文空间 */
  publicContext: PublicContext
  /** 执行节点列表（用于重试和Duplicate） */
  executionNodes: ExecutionNode[]
  /** 当前执行节点ID */
  currentExecutionNodeId?: string
  /** 会话状态 */
  status: AgentSessionStatus
  /** 是否只读（用于模板） */
  readonly?: boolean
  /** 是否启用内置0号reference（动态获取当前文档内容，默认开启） */
  enableBuiltInDocumentReference?: boolean
  /** 会话元数据 */
  metadata?: Record<string, unknown>
}

/**
 * Agent消息类型（扩展原有的AgentMessage）
 */
import type { AgentMessage } from './agent'

/**
 * 工作流执行状态
 */
export interface WorkflowExecutionState {
  /** 执行ID */
  executionId: string
  /** 工作流ID */
  workflowId: string
  /** 当前执行的节点ID */
  currentNodeId?: string
  /** 已完成的节点ID列表 */
  completedNodeIds: string[]
  /** 执行状态 */
  status: ToolExecutionStatus
  /** 节点执行结果映射 */
  nodeResults: Map<string, unknown>
  /** 工作流变量值 */
  variableValues: Map<string, unknown>
  /** 开始时间 */
  startTime: number
  /** 错误信息 */
  error?: string
}

/**
 * 序列化实体（用于导入导出）
 */
export interface SerializedEntity {
  /** 实体类型 */
  entityType: EntityType
  /** 实体数据 */
  data: Workflow | ToolCollection | AgentConfig | AgentSession | AgentEngine
  /** 依赖的实体列表（用于内嵌导出） */
  dependencies?: SerializedEntity[]
  /** 导出时间戳 */
  exportedAt: number
  /** 导出版本 */
  exportVersion: string
}

/**
 * 实体版本冲突信息
 */
export interface EntityVersionConflict {
  /** 实体ID */
  entityId: string
  /** 实体类型 */
  entityType: EntityType
  /** 本地版本 */
  local: {
    version: string
    updatedAt: number
  }
  /** 导入版本 */
  imported: {
    version: string
    updatedAt: number
  }
}

/**
 * AgentEngine 相关类型定义
 */

/**
 * 引擎类型
 */
export type EngineType = 'autogpt' | 'react' | 'plan-execute' | 'simple-chat' | 'workflow'

/**
 * LLM 配置模式
 */
export type LlmConfigMode = 'global' | 'custom'

/**
 * 自定义 LLM 配置
 */
export interface CustomLlmConfig {
  /** API 类型（OpenAI 兼容） */
  type: 'openai-compatible'
  /** Base URL */
  baseUrl: string
  /** API Key */
  apiKey: string
  /** 模型名称 */
  model: string
  /** 温度 */
  temperature?: number
  /** 最大 token 数 */
  maxTokens?: number
}

/**
 * 引擎拦截器类型
 */
export type InterceptorType = 
  | 'input-sanitization'
  | 'security-review'
  | 'token-control'
  | 'tool-call-limit'
  | 'workflow-error-recovery'
  | 'debug-logging'

/**
 * 拦截器阶段
 */
export type InterceptorStage = 
  | 'beforeLLMCall'
  | 'afterLLMCall'
  | 'beforeToolCall'
  | 'afterToolCall'
  | 'beforeFinish'

/**
 * 引擎拦截器配置
 */
export interface EngineInterceptor {
  /** 拦截器类型 */
  type: InterceptorType
  /** 拦截器名称 */
  name: string
  /** 拦截器描述 */
  description?: string
  /** 是否启用 */
  enabled: boolean
  /** 拦截阶段 */
  stages: InterceptorStage[]
  /** 拦截器配置 */
  config?: Record<string, unknown>
}

/**
 * AgentEngine 配置
 */
export interface AgentEngine {
  /** 实体类型 */
  entityType: 'agent-engine'
  /** 引擎ID（全局唯一） */
  id: string
  /** 引擎名称（支持i18n） */
  name: LocalizedText
  /** 引擎描述（支持i18n） */
  description: LocalizedText
  /** 引擎类型 */
  engineType: EngineType
  /** 版本号 */
  version: string
  /** 创建时间戳 */
  createdAt: number
  /** 更新时间戳 */
  updatedAt: number
  /** LLM 配置模式 */
  llmConfigMode: LlmConfigMode
  /** 自定义 LLM 配置（当 llmConfigMode 为 'custom' 时使用） */
  customLlmConfig?: CustomLlmConfig
  /** 引擎配置 */
  engineConfig?: {
    /** 最大迭代次数（AutoGPT 等） */
    maxIterations?: number
    /** 思考深度（ReAct 等） */
    thinkingDepth?: number
    /** 是否启用反思 */
    enableReflection?: boolean
    /** 是否启用规划 */
    enablePlanning?: boolean
    /** 超时时间（毫秒） */
    timeout?: number
    /** 其他配置项 */
    [key: string]: unknown
  }
  /** 拦截器列表 */
  interceptors?: EngineInterceptor[]
  /** 是否启用 */
  enabled?: boolean
  /** 标签 */
  tags?: string[]
  /** 是否为内置引擎（不可删除） */
  isBuiltIn?: boolean
}

