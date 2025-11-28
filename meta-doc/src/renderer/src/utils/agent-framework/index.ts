/**
 * Agent框架统一导出
 */

// 管理器
export { toolCollectionManager } from './tool-collection-manager'
export { workflowManager } from './workflow-manager'
export { agentConfigManager } from './agent-config-manager'
export { agentSessionManager } from './agent-session-manager'

// 执行器
export { workflowExecutor } from './workflow-executor'

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
  EntityVersionConflict
} from '../../types/agent-framework'

