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

/** 用户发送时快照：工作区 .metadoc/attachments 下的文件路径（供 LLM 用 workspace 工具读取，不注入全文） */
export interface UserMessageWorkspaceAttachment {
  name: string
  absolutePath: string
  relativePath: string
  format: string
}

/** 非工作区附件（如引用管理器导入）在发送时内联到该条用户消息的文本快照 */
export interface UserMessageInlineReferenceSnippet {
  name: string
  format: string
  text: string
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
  /** 本轮通过工作区保存的附件路径（发送后 referenceStore 已清空，靠此字段展示与拼进 LLM 用户消息） */
  workspaceAttachments?: UserMessageWorkspaceAttachment[]
  /** 管理附件等产生的纯文本引用快照（发送时从 referenceStore 移入消息） */
  inlineReferenceSnippets?: UserMessageInlineReferenceSnippet[]
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
  /** 工具调用参数，用于快照与 EditDisplay 等展示 params.diff */
  params?: Record<string, unknown>
  /** 与 tool_call_id 一致，供 Display 组件 useToolDisplayRealtime 订阅实时更新 */
  invocationId?: string
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

/** Composer 在 Agent 执行中先入队，本轮完全结束后按 FIFO 自动发送 */
export interface ComposerSendQueueItem {
  id: string
  markdown: string
  /** 入队时附件区快照（发送该条前写回 referenceStore） */
  referenceSnapshot: Array<{
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
  createdAt: string
}

export interface AgentSession {
  id: string
  title: string
  /** 用户是否手动改过标题；为 true 时首次发送消息不再自动根据内容生成标题 */
  titleUserEdited?: boolean
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
  /** 用户输入待发送队列（与 messageQueue 框架队列无关） */
  composerSendQueue?: ComposerSendQueueItem[]
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
    type: 'message' | 'tool-call' | 'llm-call'
    timestamp: number
    data: unknown
    status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
    result?: unknown
    error?: string
  }>
  currentExecutionNodeId?: string
  status?: 'idle' | 'thinking' | 'generating' | 'tool-calling' | 'waiting-input' | 'error'
  readonly?: boolean
  metadata?: Record<string, unknown>
  /** 状态化上下文（兼容新框架，可选） */
  contextState?: {
    summary?: string
    lastSummaryIndex?: number
  }
}
