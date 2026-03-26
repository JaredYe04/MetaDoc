/**
 * Agent框架统一导出
 */

// 管理器
export { toolCollectionManager } from './tool-collection-manager'
export { agentConfigManager } from './agent-config-manager'
export { agentSessionManager, generateSessionTitleFromContent } from './agent-session-manager'
export { agentEngineManager } from './agent-engine-manager'
export {
  initializeSubagentPresets,
  SUBAGENT_COLLECTION_IDS,
  SUBAGENT_CONFIG_IDS
} from './subagent-presets'
export { refreshMcpToolsInAgentToolManager, MCP_AGENT_TOOL_ID_PREFIX } from './mcp-runtime-tools'

// 执行器
export { ToolRunner } from './tool-runner'
export { AIContextManager, CONTEXT_CONFIG } from './ai-context-manager'
export {
  AgentEngineExecutorFactory,
  BaseEngineExecutor,
  AutoGPTEngineExecutor,
  ReActEngineExecutor,
  PlanExecuteEngineExecutor,
  SimpleChatEngineExecutor
} from './agent-engine-executor'
export { LlmAdapter } from './llm-adapter'
export type { ToolObservation } from './tool-runner'
export type {
  LlmMessage,
  ContextBuildOptions,
  ContextPartId,
  ContextPartUsage,
  ContextBreakdown
} from './ai-context-manager'
export { CONTEXT_PART_IDS } from './ai-context-manager'
export type { EngineExecuteOptions } from './agent-engine-executor'

// 类型
export type {
  ToolCollection,
  AgentConfig,
  AgentSession,
  AgentEngine,
  Reference,
  PublicContext,
  QueuedMessage,
  ExecutionNode,
  AgentSessionStatus,
  SerializedEntity,
  EntityVersionConflict,
  EngineType,
  LlmConfigMode,
  CustomLlmConfig,
  EngineInterceptor,
  InterceptorType,
  InterceptorStage
} from '../../types/agent-framework'
