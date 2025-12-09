/**
 * 工具调用队列管理器
 * 负责管理工具调用的串行执行，确保工具调用按顺序执行，且不会触发新的AI响应
 */

import { createRendererLogger } from '../logger'
import { ToolRunner, type ToolObservation } from './tool-runner'
import { AIContextManager } from './ai-context-manager'
import { agentToolManager } from '../agent-tool-manager'
import type { AgentSession } from '../../types/agent-framework'
import type { AgentSession as LegacyAgentSession } from '../../types/agent'

// 懒加载logger
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('ToolCallQueue')
  }
  return loggerInstance
}

/**
 * 工具调用任务
 */
interface ToolCallTask {
  id: string
  tool_id: string
  parameters: Record<string, unknown>
  tool_call_id: string
}

/**
 * 工具调用队列
 * 每个队列对应一次AI输出，生命周期是一次AI响应
 */
export class ToolCallQueue {
  private queue: ToolCallTask[] = []
  private isRunning = false
  private session: AgentSession | LegacyAgentSession
  private signal?: AbortSignal
  private onTaskComplete?: (task: ToolCallTask, observation: ToolObservation) => void
  private onQueueComplete?: () => void

  constructor(
    session: AgentSession | LegacyAgentSession,
    signal?: AbortSignal,
    onTaskComplete?: (task: ToolCallTask, observation: ToolObservation) => void,
    onQueueComplete?: () => void
  ) {
    this.session = session
    this.signal = signal
    this.onTaskComplete = onTaskComplete
    this.onQueueComplete = onQueueComplete
  }

  /**
   * 添加工具调用任务到队列
   */
  addTask(toolCall: { id: string; tool_id: string; parameters: Record<string, unknown> }): void {
    const task: ToolCallTask = {
      id: toolCall.id,
      tool_id: toolCall.tool_id,
      parameters: toolCall.parameters,
      tool_call_id: toolCall.id
    }
    
    this.queue.push(task)
    getLogger().debug('[ToolCallQueue] 添加工具调用任务到队列:', {
      toolId: task.tool_id,
      queueLength: this.queue.length,
      isRunning: this.isRunning
    })
    
    // 如果队列未运行，立即开始执行（异步执行，不阻塞）
    if (!this.isRunning) {
      // 使用 Promise.resolve().then() 确保异步执行，不阻塞当前调用
      Promise.resolve().then(() => {
        this.start()
      })
    }
  }

  /**
   * 开始执行队列（串行执行）
   */
  private async start(): Promise<void> {
    if (this.isRunning) {
      return
    }

    this.isRunning = true
    getLogger().debug('[ToolCallQueue] 开始执行队列，任务数量:', this.queue.length)

    while (this.queue.length > 0) {
      // 检查是否被取消
      if (this.signal?.aborted) {
        getLogger().warn('[ToolCallQueue] 队列执行被取消')
        break
      }

      const task = this.queue.shift()!
      getLogger().debug('[ToolCallQueue] 开始执行任务:', {
        toolId: task.tool_id,
        toolCallId: task.tool_call_id,
        remainingTasks: this.queue.length
      })

      try {
        // 处理dummy-tool（无效的工具调用）
        if (task.tool_id === 'dummy-tool') {
          const errorInfo = task.parameters.error as string || '工具调用格式错误'
          const rawContent = task.parameters.rawContent as string || ''
          const parsed = task.parameters.parsed as any
          
          // 构建详细的错误信息
          let errorMessage = `工具调用格式错误：${errorInfo}\n\n`
          errorMessage += `**原始内容：**\n\`\`\`\n${rawContent}\n\`\`\`\n\n`
          
          if (parsed) {
            errorMessage += `**解析结果：**\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\`\n\n`
          }
          
          errorMessage += `**正确的调用格式：**\n\`\`\`\n<tool_call>\n{"name": "工具ID", "arguments": {"参数名": "参数值"}}\n</tool_call>\n\`\`\`\n\n`
          errorMessage += `**注意事项：**\n`
          errorMessage += `1. 必须包含 "name" 字段指定工具ID\n`
          errorMessage += `2. 必须包含 "arguments" 字段（对象类型）\n`
          errorMessage += `3. 标记必须完整：<tool_call>...</tool_call>\n`
          errorMessage += `4. JSON格式必须正确（注意引号、逗号等）`
          
          const failedObservation: ToolObservation = {
            toolId: 'dummy-tool',
            toolName: '工具调用错误',
            status: 'failed',
            error: errorMessage
          }
          
          // 添加tool消息
          AIContextManager.addToolMessage(
            this.session,
            'dummy-tool',
            '工具调用错误',
            'failed',
            undefined,
            errorMessage,
            undefined,
            task.tool_call_id,
            undefined
          )
          
          if (this.onTaskComplete) {
            this.onTaskComplete(task, failedObservation)
          }
          continue
        }

        // 验证参数
        const validation = ToolRunner.validateToolParams(task.tool_id, task.parameters)
        if (!validation.valid) {
          const errorMessage = validation.errors.join(', ')
          const failedObservation: ToolObservation = {
            toolId: task.tool_id,
            toolName: task.tool_id,
            status: 'failed',
            error: errorMessage
          }
          
          // 获取工具配置
          const tool = agentToolManager.getTool(task.tool_id)
          const toolConfig = tool?.config
          
          AIContextManager.addToolMessage(
            this.session,
            task.tool_id,
            task.tool_id,
            'failed',
            undefined,
            errorMessage,
            undefined,
            task.tool_call_id,
            toolConfig
          )
          
          if (this.onTaskComplete) {
            this.onTaskComplete(task, failedObservation)
          }
          continue
        }

        // 执行工具
        // 获取可以传递给工具的session对象：新类型有entityType字段，旧类型有publicContext字段
        const sessionForTool = (this.session as any).entityType === 'agent-session' 
          ? this.session as AgentSession 
          : (this.session as any).publicContext 
            ? this.session as any as AgentSession  // LegacyAgentSession也有publicContext，可以转换
            : undefined
        
        const observation = await ToolRunner.runTool(
          task.tool_id,
          task.parameters,
          this.signal,
          sessionForTool
        )

        // 获取工具配置以获取displayComponent
        const tool = agentToolManager.getTool(observation.toolId)
        const toolConfig = tool?.config

        // 添加工具消息到会话
        // 注意：这个操作会向messages数组添加新消息，但不会触发新的AI响应
        // 因为我们在agent-engine-executor中会检查响应状态
        AIContextManager.addToolMessage(
          this.session,
          observation.toolId,
          observation.toolName,
          observation.status,
          observation.result,
          observation.error,
          observation.summary,
          task.tool_call_id,
          toolConfig,
          observation.params || task.parameters
        )

        getLogger().debug('[ToolCallQueue] 任务执行完成:', {
          toolId: task.tool_id,
          status: observation.status,
          remainingTasks: this.queue.length
        })

        if (this.onTaskComplete) {
          this.onTaskComplete(task, observation)
        }
      } catch (error) {
        getLogger().error('[ToolCallQueue] 任务执行失败:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        const failedObservation: ToolObservation = {
          toolId: task.tool_id,
          toolName: task.tool_id,
          status: 'failed',
          error: errorMessage
        }
        
        // 获取工具配置
        const tool = agentToolManager.getTool(task.tool_id)
        const toolConfig = tool?.config
        
        AIContextManager.addToolMessage(
          this.session,
          task.tool_id,
          task.tool_id,
          'failed',
          undefined,
          errorMessage,
          undefined,
          task.tool_call_id,
          toolConfig,
          task.parameters
        )
        
        if (this.onTaskComplete) {
          this.onTaskComplete(task, failedObservation)
        }
      }
    }

    this.isRunning = false
    getLogger().debug('[ToolCallQueue] 队列执行完成', {
      queueLength: this.queue.length,
      isRunning: this.isRunning
    })

    // 如果队列中还有任务（可能在执行过程中添加的），继续执行
    if (this.queue.length > 0) {
      getLogger().debug('[ToolCallQueue] 队列中还有任务，继续执行')
      this.start()
      return
    }

    if (this.onQueueComplete) {
      this.onQueueComplete()
    }
  }

  /**
   * 检查队列是否为空
   */
  isEmpty(): boolean {
    return this.queue.length === 0 && !this.isRunning
  }

  /**
   * 等待队列完成
   */
  async waitForComplete(): Promise<void> {
    // 如果队列未运行但有任务，启动队列
    if (!this.isRunning && this.queue.length > 0) {
      this.start()
    }
    
    // 等待队列完成
    while (this.isRunning || this.queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  /**
   * 获取队列长度
   */
  getLength(): number {
    return this.queue.length
  }

  /**
   * 检查是否正在运行
   */
  getIsRunning(): boolean {
    return this.isRunning
  }
}

