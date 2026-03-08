/**
 * 工具调用队列管理器
 * 负责管理工具调用的串行执行，确保工具调用按顺序执行，且不会触发新的AI响应
 */

import { createRendererLogger } from '../logger'
import { ToolRunner, type ToolObservation } from './tool-runner'
import { AIContextManager } from './ai-context-manager'
import { agentToolManager } from '../agent-tool-manager'
import { agentConfigManager } from './agent-config-manager'
import { createAiTask, ai_types } from '../ai_tasks'
import { ref } from 'vue'
import type { AgentSession } from '../../types/agent-framework'
import type { AgentSession as LegacyAgentSession, AgentMessage } from '../../types/agent'
import { runSubagent } from './subagent-runner'

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
  /** 每批最大并发数，超出部分在本批完成后继续执行；0 表示不限制（全部并发） */
  private readonly maxConcurrent: number
  /** 工具任务创建时回调（用于停止时取消这些任务） */
  private onToolTaskHandle?: (handle: string) => void
  private runningPromise: Promise<void> | null = null // 追踪队列执行的Promise
  private inputComplete = false // 标记输入（AI输出）是否已完成，只有输入完成且队列为空时，队列才算真正完成

  constructor(
    session: AgentSession | LegacyAgentSession,
    signal?: AbortSignal,
    onTaskComplete?: (task: ToolCallTask, observation: ToolObservation) => void,
    onQueueComplete?: () => void,
    options?: { maxConcurrent?: number; onToolTaskHandle?: (handle: string) => void }
  ) {
    this.session = session
    this.signal = signal
    this.onTaskComplete = onTaskComplete
    this.onQueueComplete = onQueueComplete
    this.maxConcurrent = options?.maxConcurrent ?? 0 // 0 = 不限制，保持原有“整批并发”
    this.onToolTaskHandle = options?.onToolTaskHandle
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
      // 保存 Promise 以便 waitForComplete 可以等待它
      this.runningPromise = Promise.resolve()
        .then(() => {
          return this.start()
        })
        .catch((error) => {
          getLogger().error('[ToolCallQueue] 队列执行出错:', error)
          this.isRunning = false
          this.runningPromise = null
          throw error
        })
    }
  }

  /**
   * 执行单任务（供并发批次调用）
   */
  private async runTask(task: ToolCallTask): Promise<void> {
    getLogger().debug('[ToolCallQueue] 执行任务:', {
      toolId: task.tool_id,
      toolCallId: task.tool_call_id
    })

    let runningMsg: AgentMessage | undefined
    try {
      // 处理 dummy-tool（无效的工具调用）
      if (task.tool_id === 'dummy-tool') {
          const errorInfo = (task.parameters.error as string) || '工具调用格式错误'
          const rawContent = (task.parameters.rawContent as string) || ''
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
          return
        }

        // Subagent：不经过 ToolRunner，直接运行 Subagent 并写入带 SubagentDisplay 的 tool 消息
        const subagentConfig = agentConfigManager.getConfig(task.tool_id)
        if (subagentConfig && (subagentConfig as any).isSubagent) {
          const sessionForTool =
            (this.session as any).entityType === 'agent-session'
              ? (this.session as AgentSession)
              : (this.session as any).publicContext
                ? (this.session as any as AgentSession)
                : undefined
          if (!sessionForTool) {
            AIContextManager.addToolMessage(
              this.session,
              task.tool_id,
              (subagentConfig as any).name?.zh_cn?.name || task.tool_id,
              'failed',
              undefined,
              'Subagent 需要会话上下文',
              undefined,
              task.tool_call_id,
              { displayComponent: 'SubagentDisplay', id: task.tool_id }
            )
            if (this.onTaskComplete) {
              this.onTaskComplete(task, {
                toolId: task.tool_id,
                toolName: task.tool_id,
                status: 'failed',
                error: 'Subagent 需要会话上下文'
              })
            }
            return
          }
          const toolName =
            typeof subagentConfig.name === 'string'
              ? subagentConfig.name
              : (subagentConfig.name as any)?.zh_cn?.name || (subagentConfig.name as any)?.en_us?.name || task.tool_id
          const toolConfigSub = { displayComponent: 'SubagentDisplay', id: task.tool_id, name: toolName }
          runningMsg = AIContextManager.addToolMessage(
            this.session,
            task.tool_id,
            toolName,
            'running',
            { subagentMessages: [], result: '' },
            undefined,
            undefined,
            task.tool_call_id,
            toolConfigSub,
            task.parameters
          )
          let result: Awaited<ReturnType<typeof runSubagent>>
          try {
            result = await runSubagent(
              task.tool_id,
              task.parameters as { prompt: string },
              sessionForTool,
              this.signal
            )
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err)
            AIContextManager.completeToolMessage(
              this.session,
              runningMsg.id,
              { toolId: task.tool_id, toolName, status: 'failed', error: errMsg },
              task.parameters
            )
            if (this.onTaskComplete) this.onTaskComplete(task, { toolId: task.tool_id, toolName, status: 'failed', error: errMsg })
            return
          }
          const observation: ToolObservation = {
            toolId: task.tool_id,
            toolName,
            status: result.status,
            result: {
              result: result.resultText,
              data: { subagentMessages: result.subagentMessages, result: result.resultText }
            },
            error: result.error,
            summary: result.resultText?.substring(0, 200)
          }
          AIContextManager.completeToolMessage(this.session, runningMsg.id, observation, task.parameters)
          if (this.onTaskComplete) this.onTaskComplete(task, observation)
          return
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
          return
        }

        // 获取可以传递给工具的session对象：新类型有entityType字段，旧类型有publicContext字段
        const sessionForTool =
          (this.session as any).entityType === 'agent-session'
            ? (this.session as AgentSession)
            : (this.session as any).publicContext
              ? (this.session as any as AgentSession) // LegacyAgentSession也有publicContext，可以转换
              : undefined

        // 获取工具配置以获取工具名称
        let tool = agentToolManager.getTool(task.tool_id)
        let toolConfig = tool?.config
        const toolName = toolConfig
          ? typeof toolConfig.name === 'string'
            ? toolConfig.name
            : toolConfig.name?.['zh_cn']?.name || toolConfig.name?.['en_us']?.name || task.tool_id
          : task.tool_id

        // 先插入 running 消息，便于 UI 立即展示该工具正在执行
        runningMsg = AIContextManager.addToolMessage(
          this.session,
          task.tool_id,
          toolName,
          'running',
          undefined,
          undefined,
          undefined,
          task.tool_call_id,
          toolConfig,
          task.parameters
        )

        // 为工具调用创建AI任务，让用户能在任务队列中看到工具执行过程
        const taskResultRef = ref('')
        const originKey = `tool-${task.tool_id}-${task.tool_call_id}-${Date.now()}`
        const { handle, done } = createAiTask(
          toolName,
          task.tool_id, // prompt使用工具ID
          taskResultRef,
          ai_types.tool,
          originKey,
          {
            toolId: task.tool_id,
            parameters: task.parameters,
            tool_call_id: task.tool_call_id,
            session: sessionForTool,
            stream: false // 工具调用不是流式的
          }
        )
        this.onToolTaskHandle?.(handle)

        getLogger().debug('[ToolCallQueue] 已创建工具调用AI任务:', {
          handle,
          toolId: task.tool_id,
          toolName,
          originKey
        })

        // 执行工具（通过AI任务系统）
        // 注意：createAiTask会自动启动任务（autoStart=true），所以任务会立即开始执行
        // startAiTask会执行工具并将结果更新到taskResultRef
        let observation: ToolObservation
        try {
          // 等待AI任务完成（startAiTask会执行工具）
          await done

          // 从任务系统中获取保存的observation
          // 注意：任务可能已经完成但还未删除，我们需要在删除前获取observation
          const { getTaskMap } = await import('../ai_tasks')
          const taskMap = getTaskMap()
          const aiTask = taskMap.get(handle)
          const savedObservation = aiTask?.meta?.__observation as ToolObservation | undefined

          if (savedObservation) {
            observation = savedObservation
            getLogger().debug('[ToolCallQueue] 从AI任务中获取observation:', {
              toolId: observation.toolId,
              status: observation.status
            })
          } else {
            // 兜底：从taskResultRef构建简单的observation
            const resultText = taskResultRef.value
            getLogger().warn(
              '[ToolCallQueue] 无法从AI任务获取observation，使用taskResultRef构建:',
              {
                resultTextLength: resultText.length,
                resultTextPreview: resultText.substring(0, 100)
              }
            )

            if (resultText.startsWith('工具执行失败:')) {
              observation = {
                toolId: task.tool_id,
                toolName,
                status: 'failed',
                error: resultText.replace('工具执行失败: ', '')
              }
            } else {
              observation = {
                toolId: task.tool_id,
                toolName,
                status: 'succeeded',
                result: resultText,
                summary: resultText.length > 200 ? resultText.substring(0, 200) + '...' : resultText
              }
            }
          }
        } catch (error) {
          // 如果AI任务执行失败，使用ToolRunner直接执行（兜底）
          getLogger().warn('[ToolCallQueue] AI任务执行失败，使用ToolRunner直接执行:', error)
          observation = await ToolRunner.runTool(
            task.tool_id,
            task.parameters,
            this.signal,
            sessionForTool
          )
        }

        // 获取工具配置以获取displayComponent（如果之前没有获取）
        if (!tool) {
          const toolObj = agentToolManager.getTool(observation.toolId)
          toolConfig = toolObj?.config
        }

        // 替换 running 消息为完成状态，触发 Vue 响应式更新
        AIContextManager.completeToolMessage(
          this.session,
          runningMsg.id,
          observation,
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
        // 若此前已插入 running 消息（普通工具路径），则原地更新为失败；否则插入一条失败消息
        if (typeof runningMsg !== 'undefined' && runningMsg != null) {
          AIContextManager.completeToolMessage(
            this.session,
            runningMsg.id,
            failedObservation,
            task.parameters
          )
        } else {
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
        }
        if (this.onTaskComplete) {
          this.onTaskComplete(task, failedObservation)
        }
      }
  }

  /**
   * 开始执行队列（同一批次并发执行，多批次串行）
   */
  private async start(): Promise<void> {
    if (this.isRunning) {
      return
    }

    this.isRunning = true
    getLogger().debug('[ToolCallQueue] 开始执行队列，任务数量:', this.queue.length)

    while (this.queue.length > 0) {
      if (this.signal?.aborted) {
        getLogger().warn('[ToolCallQueue] 队列执行被取消')
        break
      }

      const batchSize = this.maxConcurrent > 0 ? this.maxConcurrent : this.queue.length
      const batch = this.queue.splice(0, batchSize)
      getLogger().debug('[ToolCallQueue] 本批次并发执行任务数:', batch.length, '剩余:', this.queue.length)
      await Promise.all(batch.map((task) => this.runTask(task)))
    }

    this.isRunning = false
    getLogger().debug('[ToolCallQueue] 当前批次任务执行完成', {
      queueLength: this.queue.length,
      isRunning: this.isRunning,
      inputComplete: this.inputComplete
    })

    if (this.queue.length > 0) {
      getLogger().debug('[ToolCallQueue] 队列中还有新任务，继续执行')
      this.runningPromise = this.start().catch((error) => {
        getLogger().error('[ToolCallQueue] 队列继续执行出错:', error)
        this.isRunning = false
        this.runningPromise = null
        throw error
      })
      return
    }

    this.runningPromise = null
  }

  /**
   * 检查队列是否为空
   */
  isEmpty(): boolean {
    return this.queue.length === 0 && !this.isRunning && this.inputComplete
  }

  /**
   * 重置队列状态（用于重新开始）
   */
  reset(): void {
    this.inputComplete = false
    // 注意：不重置 queue、isRunning 等，因为这些会在新任务添加时自动处理
  }

  /**
   * 标记输入（AI输出）已完成
   * 只有在输入完成且队列中所有任务执行完成后，队列才算真正完成
   */
  setInputComplete(): void {
    this.inputComplete = true
    getLogger().debug('[ToolCallQueue] 输入已完成标记已设置', {
      queueLength: this.queue.length,
      isRunning: this.isRunning
    })
  }

  /**
   * 等待队列完成
   * 确保所有任务都已执行完成
   * 队列的生命周期持续到：AI输出完成 AND 所有任务执行完成
   */
  async waitForComplete(): Promise<void> {
    getLogger().debug('[ToolCallQueue] waitForComplete 被调用', {
      queueLength: this.queue.length,
      isRunning: this.isRunning,
      hasRunningPromise: !!this.runningPromise,
      inputComplete: this.inputComplete
    })

    // 如果队列未运行但有任务，启动队列
    if (!this.isRunning && this.queue.length > 0) {
      getLogger().debug('[ToolCallQueue] 队列未运行但有任务，启动队列')
      this.runningPromise = this.start().catch((error) => {
        getLogger().error('[ToolCallQueue] 队列启动出错:', error)
        this.isRunning = false
        this.runningPromise = null
        throw error
      })
    }

    // 如果有正在运行的 Promise，等待它完成
    if (this.runningPromise) {
      getLogger().debug('[ToolCallQueue] 等待正在运行的 Promise 完成')
      try {
        await this.runningPromise
      } catch (error) {
        getLogger().error('[ToolCallQueue] 等待 Promise 完成时出错:', error)
        // 即使出错，也要继续检查队列状态
      }
    }

    // 等待队列完成：只有在输入完成 AND 队列为空 AND 队列未运行时，才算真正完成
    // 使用轮询方式等待，因为：
    // 1. 在AI输出过程中，可能还有工具调用被检测到并添加到队列
    // 2. 队列执行过程中，可能有新任务被添加
    let retries = 0
    const maxRetries = 1000 // 最多等待100秒（100 * 100ms）

    while (retries < maxRetries) {
      // 检查是否真正完成：输入完成 AND 队列为空 AND 队列未运行
      const isTrulyComplete =
        this.inputComplete && !this.isRunning && this.queue.length === 0 && !this.runningPromise

      if (isTrulyComplete) {
        getLogger().debug('[ToolCallQueue] 队列真正完成', {
          queueLength: this.queue.length,
          isRunning: this.isRunning,
          inputComplete: this.inputComplete,
          retries
        })
        // 队列真正完成，调用完成回调
        if (this.onQueueComplete) {
          this.onQueueComplete()
        }
        break
      }

      // 如果队列又有了任务但未运行，重新启动
      if (!this.isRunning && this.queue.length > 0 && !this.runningPromise) {
        getLogger().debug('[ToolCallQueue] 在等待过程中发现新任务，重新启动队列', {
          queueLength: this.queue.length,
          inputComplete: this.inputComplete
        })
        this.runningPromise = this.start().catch((error) => {
          getLogger().error('[ToolCallQueue] 重新启动队列出错:', error)
          this.isRunning = false
          this.runningPromise = null
          throw error
        })
        try {
          await this.runningPromise
        } catch (error) {
          // 继续轮询
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100))
      retries++
    }

    if (retries >= maxRetries) {
      getLogger().warn('[ToolCallQueue] waitForComplete 超时，强制返回', {
        queueLength: this.queue.length,
        isRunning: this.isRunning,
        hasRunningPromise: !!this.runningPromise,
        inputComplete: this.inputComplete
      })
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
