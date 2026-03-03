/**
 * Agent框架统一导出
 */

// 管理器
export { toolCollectionManager } from './tool-collection-manager'
export { agentConfigManager } from './agent-config-manager'
export {
  agentSessionManager,
  generateSessionTitleFromContent
} from './agent-session-manager'
export { agentEngineManager } from './agent-engine-manager'

// 执行器
export { ToolRunner } from './tool-runner'
export { AIContextManager } from './ai-context-manager'
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
export type { LlmMessage, ContextBuildOptions } from './ai-context-manager'
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
