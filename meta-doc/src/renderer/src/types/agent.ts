export type AgentRole = 'system' | 'assistant' | 'user' | 'tool'

export type AgentMessageType = 'chat' | 'tool' | 'thought' | 'intent-recognition'

export interface AgentToolReference {
  id: string
  name: string
}

export interface ToolOutputDescriptor {
  id: string
  label: string
  format: 'text' | 'json' | 'markdown' | 'html' | 'table' | 'custom'
  data: unknown
  renderer?: string
}

export interface AgentMessageBase {
  id: string
  role: AgentRole
  type: AgentMessageType
  timestamp: string
}

export interface ChatAgentMessage extends AgentMessageBase {
  type: 'chat'
  markdown: string
  tool_calls?: Array<{
    id: string
    tool_id: string
    parameters: Record<string, unknown>
  }>
  /** 消息关联的引用ID列表（仅用于UI展示，不传给AI） */
  referenceIds?: string[]
}

export interface ThoughtAgentMessage extends AgentMessageBase {
  type: 'thought'
  markdown: string
}

export interface ToolAgentMessage extends AgentMessageBase {
  type: 'tool'
  tool: AgentToolReference
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  summary?: string
  outputs: ToolOutputDescriptor[]
  error?: string
  progress?: {
    percentage: number
    message?: string
  }
  tool_call_id?: string // 关联到具体的tool_call
  tool_config?: any // 传递工具配置，用于渲染
  markdown?: string // OpenAI格式的content字符串，用于直接发送给LLM API
}

export interface IntentRecognitionAgentMessage extends AgentMessageBase {
  type: 'intent-recognition'
  toolIds: string[] // 识别到的工具ID列表
  reasoning?: string // 识别原因
  output?: string // AI输出的原始文本（用于调试）
}

export type AgentMessage =
  | ChatAgentMessage
  | ThoughtAgentMessage
  | ToolAgentMessage
  | IntentRecognitionAgentMessage

export type ToolOrigin = 'renderer' | 'main' | 'mcp'

export interface AgentTool {
  id: string
  name: string
  description: string
  origin: ToolOrigin
  tags?: string[]
  running: boolean
  enabled: boolean
  lastUsed?: string
}

export interface AgentSession {
  id: string
  title: string
  description?: string
  createdAt: string
  updatedAt: string
  messages: AgentMessage[]
  activeToolIds: string[]
  // 以下字段用于新的Agent框架（可选，保持向后兼容）
  agentConfigId?: string
  messageQueue?: Array<{
    id: string
    content: string
    role: 'user' | 'system' | 'assistant'
    timestamp: number
    insertedAtMessageId?: string
    processed: boolean
  }>
  referenceStore?: Array<{
    id: string
    name: string
    origin: string
    format: string
    parsedContent: string
    description?: string
    metadata?: Record<string, unknown>
    createdAt: number
    updatedAt: number
  }>
  /** 是否启用内置0号reference（动态获取当前文档内容，默认开启） */
  enableBuiltInDocumentReference?: boolean
  publicContext?: {
    currentTime?: string
    timezone?: string
    document?: {
      id: string
      path: string
      format: 'md' | 'tex'
      title?: string
    }
    custom?: Record<string, unknown>
  }
  executionNodes?: Array<{
    id: string
    type: 'message' | 'tool-call' | 'workflow-call' | 'llm-call'
    timestamp: number
    data: unknown
    status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
    result?: unknown
    error?: string
  }>
  currentExecutionNodeId?: string
  status?:
    | 'idle'
    | 'thinking'
    | 'generating'
    | 'tool-calling'
    | 'workflow-executing'
    | 'waiting-input'
    | 'error'
  readonly?: boolean
  metadata?: Record<string, unknown>
}
