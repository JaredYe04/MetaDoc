/**
 * 工作流执行引擎
 * 负责执行工作流，支持有向图、控制流、异步执行等
 */

import type {
  Workflow,
  ArtifactNode,
  ControlFlowNode,
  WorkflowEdge,
  WorkflowExecutionState,
  WorkflowVariable
} from '../../types/agent-framework'
import type { ToolCallbackResult } from '../../types/agent-tool'
import { workflowManager } from './workflow-manager'
import { agentToolManager } from '../agent-tool-manager'
import { createRendererLogger } from '../logger'
import { extractOuterJsonString } from '../regex-utils'

/**
 * 工作流执行器类
 */
class WorkflowExecutor {
  private logger: ReturnType<typeof createRendererLogger> | null = null

  /**
   * 获取logger（懒加载）
   */
  private getLogger() {
    if (!this.logger) {
      this.logger = createRendererLogger('WorkflowExecutor')
    }
    return this.logger
  }
  /**
   * 执行工作流
   */
  async executeWorkflow(
    workflowId: string,
    inputParams: Record<string, unknown> = {},
    signal?: AbortSignal
  ): Promise<ToolCallbackResult> {
    const workflow = workflowManager.getWorkflow(workflowId)
    if (!workflow) {
      throw new Error(`工作流 ${workflowId} 未找到`)
    }

    if (workflow.enabled === false) {
      throw new Error(`工作流 ${workflowId} 已禁用`)
    }

    // 验证工作流
    const validation = workflowManager.validateWorkflow(workflow)
    if (!validation.valid) {
      throw new Error(`工作流验证失败: ${validation.errors.join(', ')}`)
    }

    // 创建执行状态
    const executionId = workflowManager.createExecution(workflowId, inputParams)
    const execution = workflowManager.getExecution(executionId)!

    try {
      // 更新状态为运行中
      workflowManager.updateExecution(executionId, { status: 'running' })

      // 执行工作流
      const result = await this.executeWorkflowInternal(
        workflow,
        execution,
        signal
      )

      // 更新状态为成功
      workflowManager.updateExecution(executionId, {
        status: 'succeeded',
        currentNodeId: undefined
      })

      return {
        status: 'succeeded',
        result: result
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.getLogger().error(`工作流执行失败: ${errorMessage}`)

      // 更新状态为失败
      workflowManager.updateExecution(executionId, {
        status: 'failed',
        error: errorMessage,
        currentNodeId: undefined
      })

      return {
        status: 'failed',
        error: errorMessage
      }
    } finally {
      // 清理执行状态（可选，可以保留用于调试）
      // workflowManager.deleteExecution(executionId)
    }
  }

  /**
   * 内部执行工作流（递归执行节点）
   */
  private async executeWorkflowInternal(
    workflow: Workflow,
    execution: WorkflowExecutionState,
    signal?: AbortSignal
  ): Promise<unknown> {
    // 检查取消信号
    if (signal?.aborted) {
      throw new Error('工作流执行已取消')
    }

    // 获取入口节点
    const entryNode = this.getNodeById(workflow, workflow.entryNodeId)
    if (!entryNode) {
      throw new Error(`入口节点 ${workflow.entryNodeId} 未找到`)
    }

    // 从入口节点开始执行
    return await this.executeNode(workflow, execution, entryNode.id, signal)
  }

  /**
   * 执行节点
   */
  private async executeNode(
    workflow: Workflow,
    execution: WorkflowExecutionState,
    nodeId: string,
    signal?: AbortSignal
  ): Promise<unknown> {
    // 检查取消信号
    if (signal?.aborted) {
      throw new Error('工作流执行已取消')
    }

    // 检查是否已执行过
    if (execution.completedNodeIds.includes(nodeId)) {
      return execution.nodeResults.get(nodeId)
    }

    // 更新当前节点
    workflowManager.updateExecution(execution.executionId, {
      currentNodeId: nodeId
    })

    // 获取节点
    const node = this.getNodeById(workflow, nodeId)
    if (!node) {
      throw new Error(`节点 ${nodeId} 未找到`)
    }

    let result: unknown

    // 根据节点类型执行
    if (this.isArtifactNode(node)) {
      result = await this.executeArtifactNode(workflow, execution, node, signal)
    } else if (this.isControlFlowNode(node)) {
      result = await this.executeControlFlowNode(workflow, execution, node, signal)
    } else {
      throw new Error(`未知的节点类型: ${node}`)
    }

    // 保存结果
    execution.nodeResults.set(nodeId, result)
    execution.completedNodeIds.push(nodeId)

    // 检查是否是出口节点
    if (workflow.exitNodeIds.includes(nodeId)) {
      return result
    }

    // 获取下游节点
    const downstreamNodes = this.getDownstreamNodes(workflow, nodeId)

    // 根据下游节点数量决定执行方式
    if (downstreamNodes.length === 0) {
      // 没有下游节点，执行结束
      return result
    } else if (downstreamNodes.length === 1) {
      // 单个下游节点，顺序执行
      return await this.executeNode(workflow, execution, downstreamNodes[0].id, signal)
    } else {
      // 多个下游节点，需要根据边的条件决定执行哪些
      const nodesToExecute = await this.filterNodesByConditions(
        workflow,
        execution,
        nodeId,
        downstreamNodes
      )

      // 如果配置支持并发，并行执行；否则顺序执行
      if (workflow.config?.concurrent) {
        const results = await Promise.all(
          nodesToExecute.map(n => this.executeNode(workflow, execution, n.id, signal))
        )
        // 合并结果（可以根据配置决定如何合并）
        return results.length === 1 ? results[0] : results
      } else {
        // 顺序执行
        const results: unknown[] = []
        for (const node of nodesToExecute) {
          const nodeResult = await this.executeNode(workflow, execution, node.id, signal)
          results.push(nodeResult)
        }
        return results.length === 1 ? results[0] : results
      }
    }
  }

  /**
   * 执行工件节点
   */
  private async executeArtifactNode(
    workflow: Workflow,
    execution: WorkflowExecutionState,
    node: ArtifactNode,
    signal?: AbortSignal
  ): Promise<unknown> {
    // 准备输入参数
    const inputParams = await this.prepareNodeInputs(workflow, execution, node)

    // 根据工件类型执行
    switch (node.type) {
      case 'tool':
        return await this.executeToolNode(node.artifactId, inputParams, signal)
      case 'workflow':
        return await this.executeWorkflowNode(node.artifactId, inputParams, signal)
      case 'llm-decision':
        return await this.executeLLMDecisionNode(node, inputParams, signal)
      case 'agent-config':
        return await this.executeAgentConfigNode(node.artifactId, inputParams, signal)
      default:
        throw new Error(`不支持的工件类型: ${node.type}`)
    }
  }

  /**
   * 执行控制流节点
   */
  private async executeControlFlowNode(
    workflow: Workflow,
    execution: WorkflowExecutionState,
    node: ControlFlowNode,
    signal?: AbortSignal
  ): Promise<unknown> {
    switch (node.type) {
      case 'condition':
        return await this.executeConditionNode(workflow, execution, node, signal)
      case 'loop':
        return await this.executeLoopNode(workflow, execution, node, signal)
      case 'parallel':
        return await this.executeParallelNode(workflow, execution, node, signal)
      case 'merge':
        return await this.executeMergeNode(workflow, execution, node, signal)
      case 'async':
        return await this.executeAsyncNode(workflow, execution, node, signal)
      case 'aggregate':
        return await this.executeAggregateNode(workflow, execution, node, signal)
      default:
        throw new Error(`不支持的控制流类型: ${node.type}`)
    }
  }

  /**
   * 准备节点输入参数
   */
  private async prepareNodeInputs(
    workflow: Workflow,
    execution: WorkflowExecutionState,
    node: ArtifactNode
  ): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = {}

    if (!node.inputs || node.inputs.length === 0) {
      return params
    }

    for (const input of node.inputs) {
      let value: unknown

      switch (input.sourceType) {
        case 'constant':
          value = input.sourceValue
          break
        case 'variable':
          value = execution.variableValues.get(input.variableName || '')
          if (value === undefined && input.defaultValue !== undefined) {
            value = input.defaultValue
          }
          break
        case 'upstream':
          // 从上游节点获取输出
          if (input.upstreamNodeId) {
            const upstreamResult = execution.nodeResults.get(input.upstreamNodeId)
            if (upstreamResult !== undefined) {
              if (input.upstreamField) {
                // 提取特定字段
                value = this.extractField(upstreamResult, input.upstreamField)
              } else {
                // 使用整个输出
                value = upstreamResult
              }
            } else if (input.defaultValue !== undefined) {
              value = input.defaultValue
            }
          }
          break
        case 'context':
          // 从公共上下文获取（需要从外部传入）
          // 这里暂时使用默认值
          value = input.defaultValue
          break
        default:
          value = input.defaultValue
      }

      if (value !== undefined) {
        params[input.name] = value
      } else if (input.required) {
        throw new Error(`必需的输入参数 ${input.name} 未提供`)
      }
    }

    return params
  }

  /**
   * 执行工具节点
   */
  private async executeToolNode(
    toolId: string,
    params: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<unknown> {
    const result = await agentToolManager.invokeTool(toolId, params, undefined)
    if (result.status === 'succeeded') {
      return result.result || result.data
    } else {
      throw new Error(result.error || '工具执行失败')
    }
  }

  /**
   * 执行工作流节点
   */
  private async executeWorkflowNode(
    workflowId: string,
    params: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<unknown> {
    const executor = new WorkflowExecutor()
    const result = await executor.executeWorkflow(workflowId, params, signal)
    if (result.status === 'succeeded') {
      return result.result
    } else {
      throw new Error(result.error || '工作流执行失败')
    }
  }

  /**
   * 执行LLM决策节点
   */
  private async executeLLMDecisionNode(
    node: ArtifactNode,
    params: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<unknown> {
    // 获取LLM配置（从节点配置或工作流配置）
    const llmConfig = node.config?.llmConfig || {}
    
    // 构建提示词
    const prompt = node.config?.prompt || JSON.stringify(params)
    const decisionOptions = node.config?.decisionOptions || ['continue', 'stop', 'retry']
    
    try {
      // 导入LLM API
      const { createAiTask } = await import('../ai_tasks')
      
      // 构建决策提示词
      const decisionPrompt = `请根据以下信息做出决策：

输入参数：
${JSON.stringify(params, null, 2)}

可选决策：${decisionOptions.join(', ')}

请返回JSON格式的决策结果：
{
  "decision": "你的决策（必须是可选决策之一）",
  "reasoning": "决策理由",
  "data": {} // 额外的决策数据
}`

      // 创建AI任务
      const resultRef = { value: '' }
      const task = createAiTask(
        'LLM决策',
        decisionPrompt,
        resultRef,
        'answer',
        `llm-decision-${node.id}-${Date.now()}`,
        { stream: false }
      )

      // 启动任务并等待完成
      const { startAiTask } = await import('../ai_tasks')
      await startAiTask(task.handle)

      // 等待结果
      let attempts = 0
      while (resultRef.value === '' && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100))
        attempts++
        if (signal?.aborted) {
          throw new Error('LLM决策已取消')
        }
      }

      // 解析结果（优先提取最外层 JSON）
      let decisionResult: any
      try {
        const jsonStr = extractOuterJsonString(resultRef.value) ?? resultRef.value
        decisionResult = JSON.parse(jsonStr)
      } catch {
        throw new Error('无法解析LLM决策结果')
      }

      // 验证决策
      if (!decisionOptions.includes(decisionResult.decision)) {
        this.getLogger().warn(`LLM返回了无效决策: ${decisionResult.decision}，使用默认决策`)
        decisionResult.decision = decisionOptions[0]
      }

      return decisionResult
    } catch (error) {
      this.getLogger().error('LLM决策节点执行失败:', error)
      // 返回默认决策
      return {
        decision: decisionOptions[0],
        reasoning: 'LLM调用失败，使用默认决策',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 执行AgentConfig节点（Sub Agent）
   */
  private async executeAgentConfigNode(
    agentConfigId: string,
    params: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<unknown> {
    try {
      // 导入AgentConfig管理器和会话管理器
      const { agentConfigManager } = await import('./agent-config-manager')
      const { agentSessionManager } = await import('./agent-session-manager')
      
      // 1. 获取AgentConfig
      const config = agentConfigManager.getConfig(agentConfigId)
      if (!config) {
        throw new Error(`Agent配置 ${agentConfigId} 未找到`)
      }

      // 2. 创建临时Agent会话
      const session = agentSessionManager.createSession(
        agentConfigId,
        `Sub Agent - ${Date.now()}`,
        '临时会话，用于工作流执行'
      )

      // 3. 构建用户消息
      const userMessage = typeof params.message === 'string' 
        ? params.message 
        : JSON.stringify(params)

      // 4. 添加用户消息到会话
      agentSessionManager.addMessage(session, {
        id: `msg-${Date.now()}`,
        role: 'user',
        type: 'chat',
        timestamp: new Date().toISOString(),
        markdown: userMessage
      })

      // 5. 执行Agent（这里需要实现Agent执行逻辑）
      // 由于Agent执行逻辑比较复杂，这里提供一个框架
      // 实际执行需要调用Agent执行引擎
      
      // 获取可用工具
      const availableToolIds = agentConfigManager.getAvailableToolIds(agentConfigId)
      
      // TODO: 实现Agent执行逻辑
      // 这里应该：
      // 1. 调用LLM生成回复
      // 2. 如果LLM决定调用工具，执行工具
      // 3. 继续对话直到完成
      // 4. 返回最终结果

      // 临时实现：返回会话信息
      return {
        agentConfigId,
        sessionId: session.id,
        availableTools: availableToolIds,
        message: 'Agent执行逻辑待实现',
        input: params
      }
    } catch (error) {
      this.getLogger().error('AgentConfig节点执行失败:', error)
      throw error
    }
  }

  /**
   * 执行条件节点
   */
  private async executeConditionNode(
    workflow: Workflow,
    execution: WorkflowExecutionState,
    node: ControlFlowNode,
    signal?: AbortSignal
  ): Promise<unknown> {
    if (!node.config.condition) {
      throw new Error('条件节点缺少条件表达式')
    }

    // 使用 LLM 进行条件判断，返回 {"result": true} 或 {"result": false}
    const conditionResult = await this.executeLLMConditionNode(
      workflow,
      execution,
      node,
      signal
    )

    // 获取下游节点
    const downstreamNodes = this.getDownstreamNodes(workflow, node.id)
    
    // 根据条件选择要执行的节点
    if (conditionResult) {
      // 条件为真，执行第一个分支（通常是true分支）
      if (downstreamNodes.length > 0) {
        return await this.executeNode(workflow, execution, downstreamNodes[0].id, signal)
      }
    } else {
      // 条件为假，执行第二个分支（通常是false分支）
      if (downstreamNodes.length > 1) {
        return await this.executeNode(workflow, execution, downstreamNodes[1].id, signal)
      }
    }

    return conditionResult
  }

  /**
   * 使用 LLM 执行条件判断节点
   * 约定返回 JSON：{ "result": true } 或 { "result": false }
   */
  private async executeLLMConditionNode(
    workflow: Workflow,
    execution: WorkflowExecutionState,
    node: ControlFlowNode,
    signal?: AbortSignal
  ): Promise<boolean> {
    try {
      const { createAiTask, startAiTask } = await import('../ai_tasks')

      // 构建上下文：工作流变量 + 已有节点结果
      const variableContext = Object.fromEntries(execution.variableValues)
      const nodeResultContext = Object.fromEntries(
        Array.from(execution.nodeResults.entries()).map(([id, value]) => [
          id,
          value
        ])
      )

      const prompt = `你是一个严格的布尔判断助手。
根据给定的上下文和条件，返回一个 JSON，格式必须严格为：

{"result": true}
或
{"result": false}

不要输出任何多余的文字、解释或 Markdown 代码块。

上下文（variables 和 nodeResults 可以为空对象）：
${JSON.stringify(
        {
          variables: variableContext,
          nodeResults: nodeResultContext
        },
        null,
        2
      )}

条件：
${node.config.condition}
`

      const resultRef: { value: string } = { value: '' }
      const task = createAiTask(
        'Workflow Condition',
        prompt,
        resultRef as any,
        'answer',
        `workflow-condition-${node.id}-${Date.now()}`,
        { stream: false }
      )

      await startAiTask(task.handle)

      // 轮询等待结果
      let attempts = 0
      while (resultRef.value === '' && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100))
        attempts++
        if (signal?.aborted) {
          throw new Error('条件判断已取消')
        }
      }

      const raw = resultRef.value
      const jsonStr = extractOuterJsonString(raw) ?? raw
      const parsed = JSON.parse(jsonStr) as { result?: boolean }

      if (typeof parsed.result !== 'boolean') {
        this.getLogger().warn('条件节点 LLM 返回结果不包含布尔 result 字段，默认视为 false')
        return false
      }

      return parsed.result
    } catch (error) {
      this.getLogger().error('条件节点 LLM 判断失败:', error)
      // 失败时默认返回 false，避免中断整个工作流
      return false
    }
  }

  /**
   * 执行循环节点
   */
  private async executeLoopNode(
    workflow: Workflow,
    execution: WorkflowExecutionState,
    node: ControlFlowNode,
    signal?: AbortSignal
  ): Promise<unknown> {
    const maxIterations = node.config.maxIterations || 100
    const loopCondition = node.config.loopCondition || 'true'
    const results: unknown[] = []

    for (let i = 0; i < maxIterations; i++) {
      // 检查取消信号
      if (signal?.aborted) {
        throw new Error('循环执行已取消')
      }

      // 评估循环条件
      const shouldContinue = await this.evaluateCondition(
        workflow,
        execution,
        loopCondition
      )

      if (!shouldContinue) {
        break
      }

      // 获取循环体内的节点（第一个下游节点）
      const downstreamNodes = this.getDownstreamNodes(workflow, node.id)
      if (downstreamNodes.length === 0) {
        break
      }

      // 执行循环体
      const result = await this.executeNode(
        workflow,
        execution,
        downstreamNodes[0].id,
        signal
      )
      results.push(result)

      // 更新循环变量（如果配置了）
      execution.variableValues.set('__loop_index__', i)
      execution.variableValues.set('__loop_result__', result)
    }

    return results
  }

  /**
   * 执行并行节点
   */
  private async executeParallelNode(
    workflow: Workflow,
    execution: WorkflowExecutionState,
    node: ControlFlowNode,
    signal?: AbortSignal
  ): Promise<unknown> {
    const parallelCount = node.config.parallelCount || 2
    const downstreamNodes = this.getDownstreamNodes(workflow, node.id)

    if (downstreamNodes.length === 0) {
      return []
    }

    // 选择要并行执行的节点（最多parallelCount个）
    const nodesToExecute = downstreamNodes.slice(0, parallelCount)

    // 并行执行
    const promises = nodesToExecute.map(n =>
      this.executeNode(workflow, execution, n.id, signal)
    )

    const results = await Promise.all(promises)
    return results.length === 1 ? results[0] : results
  }

  /**
   * 执行合并节点
   */
  private async executeMergeNode(
    workflow: Workflow,
    execution: WorkflowExecutionState,
    node: ControlFlowNode,
    signal?: AbortSignal
  ): Promise<unknown> {
    // 合并节点等待所有上游节点完成
    // 获取上游节点
    const upstreamEdges = workflow.edges.filter(e => e.target === node.id)
    const upstreamNodeIds = upstreamEdges.map(e => e.source)

    // 等待所有上游节点完成（如果还没完成）
    const upstreamResults: unknown[] = []
    for (const upstreamNodeId of upstreamNodeIds) {
      if (!execution.completedNodeIds.includes(upstreamNodeId)) {
        // 如果上游节点未完成，执行它
        const result = await this.executeNode(
          workflow,
          execution,
          upstreamNodeId,
          signal
        )
        upstreamResults.push(result)
      } else {
        // 如果已完成，直接获取结果
        const result = execution.nodeResults.get(upstreamNodeId)
        upstreamResults.push(result)
      }
    }

    // 合并结果（可以根据配置决定合并策略）
    return upstreamResults.length === 1 ? upstreamResults[0] : upstreamResults
  }

  /**
   * 执行异步节点
   */
  private async executeAsyncNode(
    workflow: Workflow,
    execution: WorkflowExecutionState,
    node: ControlFlowNode,
    signal?: AbortSignal
  ): Promise<unknown> {
    // 异步节点：不等待下游节点完成，立即返回
    const downstreamNodes = this.getDownstreamNodes(workflow, node.id)

    // 异步执行下游节点（不等待）
    for (const downstreamNode of downstreamNodes) {
      this.executeNode(workflow, execution, downstreamNode.id, signal).catch(error => {
        this.getLogger().error(`异步节点执行失败: ${error}`)
      })
    }

    // 立即返回
    return { async: true, nodes: downstreamNodes.map(n => n.id) }
  }

  /**
   * 执行汇总节点
   */
  private async executeAggregateNode(
    workflow: Workflow,
    execution: WorkflowExecutionState,
    node: ControlFlowNode,
    signal?: AbortSignal
  ): Promise<unknown> {
    const strategy = node.config.aggregateStrategy || 'all'
    
    // 获取上游节点
    const upstreamEdges = workflow.edges.filter(e => e.target === node.id)
    const upstreamNodeIds = upstreamEdges.map(e => e.source)

    // 收集所有上游节点的结果
    const results: unknown[] = []
    for (const upstreamNodeId of upstreamNodeIds) {
      if (!execution.completedNodeIds.includes(upstreamNodeId)) {
        const result = await this.executeNode(
          workflow,
          execution,
          upstreamNodeId,
          signal
        )
        results.push(result)
      } else {
        const result = execution.nodeResults.get(upstreamNodeId)
        results.push(result)
      }
    }

    // 根据策略汇总结果
    switch (strategy) {
      case 'all':
        return results
      case 'any':
        return results.find(r => r !== null && r !== undefined) ?? null
      case 'first':
        return results[0]
      case 'last':
        return results[results.length - 1]
      case 'merge':
        // 合并为对象
        return results.reduce((acc, r, index) => {
          acc[`result_${index}`] = r
          return acc
        }, {} as Record<string, unknown>)
      default:
        return results
    }
  }

  /**
   * 评估条件表达式
   */
  private async evaluateCondition(
    workflow: Workflow,
    execution: WorkflowExecutionState,
    condition: string
  ): Promise<boolean> {
    try {
      // 创建安全的评估上下文
      const context: Record<string, unknown> = {
        // 工作流变量
        ...Object.fromEntries(execution.variableValues),
        // 节点结果（通过$nodeId访问）
        ...Object.fromEntries(
          Array.from(execution.nodeResults.entries()).map(([id, value]) => [
            `$node_${id}`,
            value
          ])
        )
      }

      // 简单的条件表达式评估（支持基本的比较和逻辑运算）
      // 注意：这里使用Function构造器，在生产环境中应该使用更安全的表达式解析器
      const func = new Function(
        ...Object.keys(context),
        `return ${condition}`
      )

      const result = func(...Object.values(context))
      return Boolean(result)
    } catch (error) {
      this.getLogger().error(`条件表达式评估失败: ${condition}`, error)
      return false
    }
  }

  /**
   * 获取节点（工件节点或控制流节点）
   */
  private getNodeById(
    workflow: Workflow,
    nodeId: string
  ): ArtifactNode | ControlFlowNode | undefined {
    return (
      workflow.artifactNodes.find(n => n.id === nodeId) ||
      workflow.controlFlowNodes.find(n => n.id === nodeId)
    )
  }

  /**
   * 判断是否是工件节点
   */
  private isArtifactNode(node: ArtifactNode | ControlFlowNode): node is ArtifactNode {
    return 'type' in node && ['tool', 'llm-decision', 'workflow', 'agent-config'].includes(node.type)
  }

  /**
   * 判断是否是控制流节点
   */
  private isControlFlowNode(node: ArtifactNode | ControlFlowNode): node is ControlFlowNode {
    return (
      'type' in node &&
      ['start', 'end', 'condition', 'loop', 'parallel', 'merge', 'async', 'aggregate'].includes(
        node.type
      )
    )
  }

  /**
   * 获取下游节点
   */
  private getDownstreamNodes(
    workflow: Workflow,
    nodeId: string
  ): (ArtifactNode | ControlFlowNode)[] {
    const edges = workflow.edges.filter(e => e.source === nodeId)
    const nodeIds = edges.map(e => e.target)
    return nodeIds
      .map(id => this.getNodeById(workflow, id))
      .filter((n): n is ArtifactNode | ControlFlowNode => n !== undefined)
  }

  /**
   * 根据条件过滤节点
   */
  private async filterNodesByConditions(
    workflow: Workflow,
    execution: WorkflowExecutionState,
    sourceNodeId: string,
    nodes: (ArtifactNode | ControlFlowNode)[]
  ): Promise<(ArtifactNode | ControlFlowNode)[]> {
    const edges = workflow.edges.filter(e => e.source === sourceNodeId)
    const filteredNodes: (ArtifactNode | ControlFlowNode)[] = []

    for (const node of nodes) {
      const edge = edges.find(e => e.target === node.id)
      if (!edge) {
        continue
      }

      // 如果没有条件，或者条件为真，则包含该节点
      if (!edge.condition) {
        filteredNodes.push(node)
      } else {
        // TODO: 评估条件表达式
        // 这里需要实现条件表达式评估逻辑
        this.getLogger().warn('条件表达式评估尚未实现')
        filteredNodes.push(node)
      }
    }

    return filteredNodes
  }

  /**
   * 提取字段值
   */
  private extractField(obj: unknown, fieldPath: string): unknown {
    if (typeof obj !== 'object' || obj === null) {
      return undefined
    }

    const parts = fieldPath.split('.')
    let current: any = obj

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined
      }
      current = current[part]
    }

    return current
  }
}

// 导出单例
export const workflowExecutor = new WorkflowExecutor()

