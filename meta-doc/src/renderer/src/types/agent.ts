export type AgentRole = 'system' | 'assistant' | 'user' | 'tool';

export type AgentMessageType = 'chat' | 'tool' | 'thought';

export interface AgentToolReference {
  id: string;
  name: string;
}

export interface ToolOutputDescriptor {
  id: string;
  label: string;
  format: 'text' | 'json' | 'markdown' | 'html' | 'table' | 'custom';
  data: unknown;
  renderer?: string;
}

export interface AgentMessageBase {
  id: string;
  role: AgentRole;
  type: AgentMessageType;
  timestamp: string;
}

export interface ChatAgentMessage extends AgentMessageBase {
  type: 'chat';
  markdown: string;
}

export interface ThoughtAgentMessage extends AgentMessageBase {
  type: 'thought';
  markdown: string;
}

export interface ToolAgentMessage extends AgentMessageBase {
  type: 'tool';
  tool: AgentToolReference;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  summary?: string;
  outputs: ToolOutputDescriptor[];
  error?: string;
  progress?: {
    percentage: number;
    message?: string;
  };
}

export type AgentMessage = ChatAgentMessage | ThoughtAgentMessage | ToolAgentMessage;

export type ToolOrigin = 'renderer' | 'main' | 'mcp';

export interface AgentTool {
  id: string;
  name: string;
  description: string;
  origin: ToolOrigin;
  tags?: string[];
  running: boolean;
  enabled: boolean;
  lastUsed?: string;
}

export interface AgentSession {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessage[];
  activeToolIds: string[];
  // 以下字段用于新的Agent框架（可选，保持向后兼容）
  agentConfigId?: string;
  messageQueue?: Array<{
    id: string;
    content: string;
    role: 'user' | 'system' | 'assistant';
    timestamp: number;
    insertedAtMessageId?: string;
    processed: boolean;
  }>;
  referenceStore?: Array<{
    id: string;
    name: string;
    type: 'file' | 'url' | 'knowledge-base' | 'article-service' | 'custom';
    url: string;
    description?: string;
    metadata?: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
  }>;
  publicContext?: {
    currentTime?: string;
    timezone?: string;
    document?: {
      id: string;
      path: string;
      format: 'md' | 'tex';
      title?: string;
    };
    custom?: Record<string, unknown>;
  };
  executionNodes?: Array<{
    id: string;
    type: 'message' | 'tool-call' | 'workflow-call' | 'llm-call';
    timestamp: number;
    data: unknown;
    status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
    result?: unknown;
    error?: string;
  }>;
  currentExecutionNodeId?: string;
  status?: 'idle' | 'thinking' | 'generating' | 'tool-calling' | 'workflow-executing' | 'waiting-input' | 'error';
  readonly?: boolean;
  metadata?: Record<string, unknown>;
}

