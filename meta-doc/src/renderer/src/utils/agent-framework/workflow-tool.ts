/**
 * 工作流作为Tool的实现
 * 将工作流注册为Tool，使其可以在Agent会话中使用
 */

import type { AgentToolConfig, ToolCallback, ToolCallbackResult, ToolCallbackData, ToolProgress } from '../../types/agent-tool'
import { workflowManager } from './workflow-manager'
import { workflowExecutor } from './workflow-executor'
import { agentToolManager } from '../agent-tool-manager'
import { createRendererLogger } from '../logger'
import WorkflowDisplay from '../../components/agent/workflow/WorkflowDisplay.vue'

const logger = createRendererLogger('WorkflowTool')

/**
 * 创建工作流Tool配置
 */
export function createWorkflowToolConfig(workflowId: string): AgentToolConfig | null {
  const workflow = workflowManager.getWorkflow(workflowId)
  if (!workflow) {
    logger.warn(`工作流 ${workflowId} 未找到`)
    return null
  }

  const workflowCallback: ToolCallback = async (
    params: Record<string, unknown>,
    signal: AbortSignal,
    onUpdate: (data: ToolCallbackData, progress?: ToolProgress) => void
  ) => {
    try {
      // 报告开始执行
      onUpdate({
        content: {
          workflowId,
          executionId: null,
          stage: 'starting'
        },
        format: 'json',
        componentName: 'WorkflowDisplay'
      }, {
        percentage: 0,
        message: '工作流执行开始'
      })

      // 执行工作流
      const result = await workflowExecutor.executeWorkflow(workflowId, params, signal)

      if (result.status === 'succeeded') {
      // 获取执行状态（用于Display组件）
      const executions = workflowManager.getAllExecutions()
      const execution = executions
        .filter(e => e.workflowId === workflowId)
        .sort((a, b) => b.startTime - a.startTime)[0] // 获取最新的执行
        
        onUpdate({
          content: {
            workflowId,
            executionId: execution?.executionId,
            executionState: execution,
            result: result.result,
            stage: 'completed'
          },
          format: 'json',
          componentName: 'WorkflowDisplay'
        }, {
          percentage: 100,
          message: '工作流执行完成'
        })

        return {
          status: 'succeeded',
          data: {
            content: {
              workflowId,
              executionId: execution?.executionId,
              executionState: execution,
              result: result.result
            },
            format: 'json',
            componentName: 'WorkflowDisplay'
          },
          result: result.result
        }
      } else {
        return {
          status: 'failed',
          error: result.error || '工作流执行失败'
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`工作流执行失败: ${errorMessage}`)
      return {
        status: 'failed',
        error: errorMessage
      }
    }
  }

  const toolName = typeof workflow.name === 'string' ? workflow.name : workflow.name['zh_cn']?.name || workflow.id
  const toolDescription = typeof workflow.description === 'string' 
    ? workflow.description 
    : workflow.description['zh_cn']?.description || ''

  return {
    id: `workflow-${workflowId}`,
    name: workflow.name,
    description: workflow.description,
    origin: 'internal',
    instruction: `# ${toolName}

## 功能描述
${toolDescription}

## 输入参数
\`\`\`json
${JSON.stringify(workflow.inputSchema || {}, null, 2)}
\`\`\`

## 输出格式
\`\`\`json
${JSON.stringify(workflow.outputSchema || {}, null, 2)}
\`\`\`

这是一个工作流工具，执行预定义的工作流程。`,
    callback: workflowCallback,
    displayComponent: WorkflowDisplay,
    tags: ['workflow', ...(workflow.tags || [])],
    enabled: workflow.enabled !== false,
    editable: false
  }
}

/**
 * 注册工作流为Tool
 */
export function registerWorkflowAsTool(workflowId: string): void {
  const toolConfig = createWorkflowToolConfig(workflowId)
  if (toolConfig) {
    agentToolManager.registerTool(toolConfig)
    logger.info(`工作流 ${workflowId} 已注册为Tool: ${toolConfig.id}`)
  }
}

/**
 * 注销工作流Tool
 */
export function unregisterWorkflowTool(workflowId: string): void {
  const toolId = `workflow-${workflowId}`
  agentToolManager.unregisterTool(toolId)
  logger.info(`工作流Tool ${toolId} 已注销`)
}

/**
 * 注册所有启用的工作流为Tool
 */
export function registerAllWorkflowsAsTools(): void {
  const workflows = workflowManager.getEnabledWorkflows()
  for (const workflow of workflows) {
    registerWorkflowAsTool(workflow.id)
  }
  logger.info(`已注册 ${workflows.length} 个工作流为Tool`)
}

/**
 * 监听工作流变化，自动注册/注销Tool
 */
export function setupWorkflowToolAutoRegistration(): void {
  // 初始注册
  registerAllWorkflowsAsTools()

  // TODO: 监听工作流变化事件，自动更新Tool注册
  // 这需要在工作流管理器中添加事件机制
}

