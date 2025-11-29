/**
 * Agent框架统一导出
 */

// 管理器
export { toolCollectionManager } from './tool-collection-manager'
export { workflowManager } from './workflow-manager'
export { agentConfigManager } from './agent-config-manager'
export { agentSessionManager } from './agent-session-manager'
export { agentEngineManager } from './agent-engine-manager'

// 执行器
export { workflowExecutor } from './workflow-executor'
export { ToolRunner } from './tool-runner'
export { AIContextManager } from './ai-context-manager'
export {
  AgentEngineExecutorFactory,
  BaseEngineExecutor,
  AutoGPTEngineExecutor,
  ReActEngineExecutor,
  PlanExecuteEngineExecutor,
  SimpleChatEngineExecutor,
  WorkflowEngineExecutor
} from './agent-engine-executor'
export { LlmAdapter } from './llm-adapter'
export type { ToolObservation } from './tool-runner'
export type { LlmMessage, ContextBuildOptions } from './ai-context-manager'
export type { EngineExecuteOptions } from './agent-engine-executor'

// 工作流Tool注册
export {
  createWorkflowToolConfig,
  registerWorkflowAsTool,
  unregisterWorkflowTool,
  registerAllWorkflowsAsTools,
  setupWorkflowToolAutoRegistration
} from './workflow-tool'

// 类型
export type {
  Workflow,
  ToolCollection,
  AgentConfig,
  AgentSession,
  AgentEngine,
  ArtifactNode,
  ControlFlowNode,
  WorkflowEdge,
  WorkflowVariable,
  Reference,
  PublicContext,
  QueuedMessage,
  ExecutionNode,
  AgentSessionStatus,
  WorkflowExecutionState,
  SerializedEntity,
  EntityVersionConflict,
  EngineType,
  LlmConfigMode,
  CustomLlmConfig,
  EngineInterceptor,
  InterceptorType,
  InterceptorStage
} from '../../types/agent-framework'

