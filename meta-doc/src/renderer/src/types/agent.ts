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
}

