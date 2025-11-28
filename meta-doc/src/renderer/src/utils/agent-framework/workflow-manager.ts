/**
 * 工作流（Workflow）管理器
 * 负责工作流的CRUD操作、持久化和执行管理
 */

import type { Workflow, SerializedEntity, WorkflowExecutionState } from '../../types/agent-framework'
import type { LocalizedText } from '../../types/agent-tool'
import { createRendererLogger } from '../logger'
import { agentToolManager } from '../agent-tool-manager'

/**
 * 工作流管理器类
 */
class WorkflowManager {
  private workflows: Map<string, Workflow> = new Map()
  private executions: Map<string, WorkflowExecutionState> = new Map()
  private readonly STORAGE_KEY = 'agent-workflows'
  private logger: ReturnType<typeof createRendererLogger> | null = null

  constructor() {
    // 延迟初始化logger，避免循环依赖
    this.loadFromStorage()
  }

  /**
   * 获取logger（懒加载）
   */
  private getLogger() {
    if (!this.logger) {
      this.logger = createRendererLogger('WorkflowManager')
    }
    return this.logger
  }

  /**
   * 创建工作流
   */
  async createWorkflow(
    name: LocalizedText,
    description: LocalizedText,
    entryNodeId: string,
    exitNodeIds: string[] = []
  ): Promise<Workflow> {
    const id = `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const now = Date.now()

    const workflow: Workflow = {
      entityType: 'workflow',
      id,
      name,
      description,
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      artifactNodes: [],
      controlFlowNodes: [],
      edges: [],
      entryNodeId,
      exitNodeIds,
      variables: [],
      enabled: true,
      tags: []
    }

    this.workflows.set(id, workflow)
    this.saveToStorage()
    this.getLogger().info(`工作流已创建: ${id}`)
    
    // 自动注册为Tool
    if (workflow.enabled !== false) {
      try {
        const { registerWorkflowAsTool } = await import('./workflow-tool')
        registerWorkflowAsTool(id)
      } catch (error) {
        this.getLogger().warn(`工作流 ${id} 注册为Tool失败:`, error)
      }
    }
    
    return workflow
  }

  /**
   * 获取工作流
   */
  getWorkflow(id: string): Workflow | undefined {
    return this.workflows.get(id)
  }

  /**
   * 获取所有工作流
   */
  getAllWorkflows(): Workflow[] {
    return Array.from(this.workflows.values())
  }

  /**
   * 获取启用的工作流
   */
  getEnabledWorkflows(): Workflow[] {
    return Array.from(this.workflows.values()).filter(w => w.enabled !== false)
  }

  /**
   * 更新工作流
   */
  async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<void> {
    const workflow = this.workflows.get(id)
    if (!workflow) {
      throw new Error(`工作流 ${id} 未找到`)
    }

    const updated: Workflow = {
      ...workflow,
      ...updates,
      id, // 不允许修改ID
      entityType: 'workflow', // 不允许修改类型
      updatedAt: Date.now()
    }

    this.workflows.set(id, updated)
    this.saveToStorage()
    this.getLogger().info(`工作流已更新: ${id}`)
    
    // 更新Tool注册
    try {
      const { registerWorkflowAsTool, unregisterWorkflowTool } = await import('./workflow-tool')
      if (updated.enabled !== false) {
        registerWorkflowAsTool(id)
      } else {
        unregisterWorkflowTool(id)
      }
    } catch (error) {
      this.getLogger().warn(`工作流 ${id} Tool注册更新失败:`, error)
    }
  }

  /**
   * 删除工作流
   */
  async deleteWorkflow(id: string): Promise<void> {
    if (!this.workflows.has(id)) {
      throw new Error(`工作流 ${id} 未找到`)
    }

    // 检查是否有正在执行的实例
    const hasRunningExecution = Array.from(this.executions.values()).some(
      exec => exec.workflowId === id && exec.status === 'running'
    )

    if (hasRunningExecution) {
      throw new Error(`工作流 ${id} 有正在执行的实例，无法删除`)
    }

    this.workflows.delete(id)
    this.saveToStorage()
    this.getLogger().info(`工作流已删除: ${id}`)
    
    // 注销Tool
    try {
      const { unregisterWorkflowTool } = await import('./workflow-tool')
      unregisterWorkflowTool(id)
    } catch (error) {
      this.getLogger().warn(`工作流 ${id} Tool注销失败:`, error)
    }
  }

  /**
   * 验证工作流结构
   */
  validateWorkflow(workflow: Workflow): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // 检查入口节点是否存在
    const entryNode = [
      ...workflow.artifactNodes,
      ...workflow.controlFlowNodes
    ].find(n => n.id === workflow.entryNodeId)

    if (!entryNode) {
      errors.push(`入口节点 ${workflow.entryNodeId} 不存在`)
    }

    // 检查出口节点是否存在
    for (const exitId of workflow.exitNodeIds) {
      const exitNode = [
        ...workflow.artifactNodes,
        ...workflow.controlFlowNodes
      ].find(n => n.id === exitId)

      if (!exitNode) {
        errors.push(`出口节点 ${exitId} 不存在`)
      }
    }

    // 检查边的有效性
    const allNodeIds = new Set([
      ...workflow.artifactNodes.map(n => n.id),
      ...workflow.controlFlowNodes.map(n => n.id)
    ])

    for (const edge of workflow.edges) {
      if (!allNodeIds.has(edge.source)) {
        errors.push(`边 ${edge.id} 的源节点 ${edge.source} 不存在`)
      }
      if (!allNodeIds.has(edge.target)) {
        errors.push(`边 ${edge.id} 的目标节点 ${edge.target} 不存在`)
      }
    }

    // 检查节点ID唯一性
    const nodeIds = [
      ...workflow.artifactNodes.map(n => n.id),
      ...workflow.controlFlowNodes.map(n => n.id)
    ]
    const duplicateIds = nodeIds.filter((id, index) => nodeIds.indexOf(id) !== index)
    if (duplicateIds.length > 0) {
      errors.push(`节点ID重复: ${duplicateIds.join(', ')}`)
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * 导出工作流
   */
  exportWorkflow(id: string, includeDependencies = false): SerializedEntity | null {
    const workflow = this.workflows.get(id)
    if (!workflow) {
      return null
    }

    const entity: SerializedEntity = {
      entityType: 'workflow',
      data: JSON.parse(JSON.stringify(workflow)),
      exportedAt: Date.now(),
      exportVersion: '1.0.0'
    }

    if (includeDependencies) {
      // 收集依赖的工具、工作流等
      const dependencies: SerializedEntity[] = []

      // 收集引用的工具
      for (const node of workflow.artifactNodes) {
        if (node.type === 'tool') {
          const tool = agentToolManager.getTool(node.artifactId)
          if (tool) {
            const toolConfig = agentToolManager.exportToolConfig(node.artifactId)
            if (toolConfig) {
              // 注意：这里需要将AgentToolConfig转换为SerializedEntity格式
              // 暂时跳过，因为Tool的导出格式不同
            }
          }
        } else if (node.type === 'workflow') {
          const depWorkflow = this.workflows.get(node.artifactId)
          if (depWorkflow) {
            const depEntity = this.exportWorkflow(node.artifactId, false)
            if (depEntity) {
              dependencies.push(depEntity)
            }
          }
        }
      }

      entity.dependencies = dependencies
    }

    return entity
  }

  /**
   * 导入工作流
   */
  importWorkflow(entity: SerializedEntity, overwrite = false): Workflow {
    if (entity.entityType !== 'workflow') {
      throw new Error('实体类型不匹配，期望 workflow')
    }

    const workflow = entity.data as Workflow

    // 验证工作流
    const validation = this.validateWorkflow(workflow)
    if (!validation.valid) {
      throw new Error(`工作流验证失败: ${validation.errors.join(', ')}`)
    }

    const existing = this.workflows.get(workflow.id)

    if (existing && !overwrite) {
      throw new Error(`工作流 ${workflow.id} 已存在，请使用 overwrite=true 覆盖`)
    }

    this.workflows.set(workflow.id, workflow)
    this.saveToStorage()
    this.getLogger().info(`工作流已导入: ${workflow.id}`)
    return workflow
  }

  /**
   * 创建工作流执行状态
   */
  createExecution(workflowId: string, inputParams: Record<string, unknown> = {}): string {
    const workflow = this.workflows.get(workflowId)
    if (!workflow) {
      throw new Error(`工作流 ${workflowId} 未找到`)
    }

    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const execution: WorkflowExecutionState = {
      executionId,
      workflowId,
      completedNodeIds: [],
      status: 'pending',
      nodeResults: new Map(),
      variableValues: new Map(),
      startTime: Date.now()
    }

    // 初始化变量值
    if (workflow.variables) {
      for (const variable of workflow.variables) {
        if (variable.defaultValue !== undefined) {
          execution.variableValues.set(variable.name, variable.defaultValue)
        }
        // 如果输入参数中有同名变量，使用输入参数的值
        if (inputParams[variable.name] !== undefined) {
          execution.variableValues.set(variable.name, inputParams[variable.name])
        }
      }
    }

    this.executions.set(executionId, execution)
    return executionId
  }

  /**
   * 获取执行状态
   */
  getExecution(executionId: string): WorkflowExecutionState | undefined {
    return this.executions.get(executionId)
  }

  /**
   * 更新执行状态
   */
  updateExecution(executionId: string, updates: Partial<WorkflowExecutionState>): void {
    const execution = this.executions.get(executionId)
    if (!execution) {
      throw new Error(`执行 ${executionId} 未找到`)
    }

    Object.assign(execution, updates)
  }

  /**
   * 删除执行状态
   */
  deleteExecution(executionId: string): void {
    this.executions.delete(executionId)
  }

  /**
   * 获取所有执行状态
   */
  getAllExecutions(): WorkflowExecutionState[] {
    return Array.from(this.executions.values())
  }

  /**
   * 根据工作流ID获取执行状态
   */
  getExecutionsByWorkflowId(workflowId: string): WorkflowExecutionState[] {
    return Array.from(this.executions.values()).filter(e => e.workflowId === workflowId)
  }

  /**
   * 从本地存储加载
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      if (stored) {
        const data = JSON.parse(stored)
        if (Array.isArray(data)) {
          data.forEach((item: Workflow) => {
            this.workflows.set(item.id, item)
          })
          // 延迟记录日志，避免在构造函数中初始化logger
          if (this.logger) {
            this.logger.info(`已加载 ${data.length} 个工作流`)
          }
        }
      }
    } catch (error) {
      // 延迟记录日志，避免在构造函数中初始化logger
      if (this.logger) {
        this.logger.error('加载工作流失败:', error)
      } else {
        console.error('加载工作流失败:', error)
      }
    }
  }

  /**
   * 保存到本地存储
   */
  private saveToStorage(): void {
    try {
      const data = Array.from(this.workflows.values())
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      // 延迟记录日志，避免在构造函数中初始化logger
      if (this.logger) {
        this.logger.error('保存工作流失败:', error)
      } else {
        console.error('保存工作流失败:', error)
      }
    }
  }
}

// 导出单例
export const workflowManager = new WorkflowManager()

