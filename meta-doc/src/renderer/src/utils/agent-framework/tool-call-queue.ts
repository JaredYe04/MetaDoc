/**
 * 工具调用队列管理器
 * 使用信号量模型：每解析到一个任务就 +1 并立即异步执行，任务结束时 -1。
 * 同一轮对话中所有工具并发执行，只有信号量归零且输入已标记完成时才进入下一轮。
 * 避免「分批执行」导致后解析到的任务被延后或遗漏（如 AI 输出 [{任务1},{任务2},{任务3}] 时逐段解析）。
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
 * 工具调用队列（信号量 + 全并发）
 * 每个队列对应一次 AI 输出；任务随解析到随执行，全部完成后才进入下一轮。
 */
export class ToolCallQueue {
  /** 已添加的任务列表（仅用于统计/日志，不参与批处理） */
  private queue: ToolCallTask[] = []
  /** 当前正在执行中的任务数（信号量） */
  private inFlight = 0
  private session: AgentSession | LegacyAgentSession
  private signal?: AbortSignal
  private onTaskComplete?: (task: ToolCallTask, observation: ToolObservation) => void
  private onQueueComplete?: () => void
  private onTaskCreated?: (handle: string) => void
  private inputComplete = false
  /** waitForComplete 的 resolve，在 inputComplete && inFlight===0 时调用 */
  private completeResolve: (() => void) | null = null

  constructor(
    session: AgentSession | LegacyAgentSession,
    signal?: AbortSignal,
    onTaskComplete?: (task: ToolCallTask, observation: ToolObservation) => void,
    onQueueComplete?: () => void,
    onTaskCreated?: (handle: string) => void
  ) {
    this.session = session
    this.signal = signal
    this.onTaskComplete = onTaskComplete
    this.onQueueComplete = onQueueComplete
    this.onTaskCreated = onTaskCreated
  }

  /** 若条件满足则解析 completeResolve 并触发 onQueueComplete */
  private tryResolveComplete(): void {
    if (this.inputComplete && this.inFlight === 0 && this.completeResolve) {
      getLogger().debug('[ToolCallQueue] 信号量归零且输入已结束，触发完成')
      const resolve = this.completeResolve
      this.completeResolve = null
      resolve()
      this.onQueueComplete?.()
    }
  }

  /**
   * 添加工具调用任务：信号量 +1，立即异步执行该任务（不等待）
   */
  addTask(toolCall: { id: string; tool_id: string; parameters: Record<string, unknown> }): void {
    const task: ToolCallTask = {
      id: toolCall.id,
      tool_id: toolCall.tool_id,
      parameters: toolCall.parameters,
      tool_call_id: toolCall.id
    }

    this.queue.push(task)
    this.inFlight++
    getLogger().debug('[ToolCallQueue] 添加任务并启动执行（信号量+1）:', {
      toolId: task.tool_id,
      inFlight: this.inFlight,
      queueLength: this.queue.length
    })

    this.runTask(task)
      .finally(() => {
        this.inFlight--
        getLogger().debug('[ToolCallQueue] 任务结束（信号量-1）:', {
          toolId: task.tool_id,
          inFlight: this.inFlight
        })
        this.tryResolveComplete()
      })
      .catch((err) => {
        getLogger().error('[ToolCallQueue] 任务执行未捕获错误:', err)
      })
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
      // 处理 dummy-tool（无效的工具调用；正常流程下解析层已不再上报无效块，此处仅兜底）
      if (task.tool_id === 'dummy-tool') {
          const errorInfo = (task.parameters.error as string) || '工具调用格式错误'
          const rawContent = (task.parameters.rawContent as string) || ''
          const parsed = task.parameters.parsed as any

          // 若原始内容明显不是 JSON（如正文讨论/举例被误匹配），仅简短提示，避免刷屏
          const head = rawContent.trim().slice(0, 200)
          const looksLikeJson = /^\s*\{/.test(rawContent.trim()) || head.includes('"name"') || head.includes('"tool_id"')
          let errorMessage: string
          if (!looksLikeJson && rawContent.length > 20) {
            errorMessage = `工具调用格式错误：${errorInfo}（内容疑似非工具调用，已忽略）`
          } else {
            errorMessage = `工具调用格式错误：${errorInfo}\n\n`
            errorMessage += `**原始内容：**\n\`\`\`\n${rawContent}\n\`\`\`\n\n`
            if (parsed) {
              errorMessage += `**解析结果：**\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\`\n\n`
            }
            errorMessage += `**说明：** 工具调用应通过系统/API 提供的工具调用接口（结构化格式）发起，不要在消息正文中以文本形式输出工具调用。`
          }

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
              this.signal,
              task.tool_call_id
            )
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err)
            const failedObs = { toolId: task.tool_id, toolName, status: 'failed' as const, error: errMsg }
            AIContextManager.completeToolMessage(this.session, runningMsg.id, failedObs, task.parameters)
            if (this.onTaskComplete) this.onTaskComplete(task, failedObs)
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
        this.onTaskCreated?.(handle)

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

        // 同步写入会话：必须在 runTask 的 Promise 结束前完成，waitForComplete 才与真实消息状态一致（不依赖 Vue 时序）
        const session = this.session
        const msgId = runningMsg.id
        const obs = observation
        const params = observation.params || task.parameters
        AIContextManager.completeToolMessage(session, msgId, obs, params)

        getLogger().debug('[ToolCallQueue] 任务执行完成:', {
          toolId: task.tool_id,
          status: observation.status,
          inFlight: this.inFlight
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
          const session = this.session
          const msgId = runningMsg.id
          const obs = failedObservation
          const params = task.parameters
          AIContextManager.completeToolMessage(session, msgId, obs, params)
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
   * 是否已空闲：输入已标记完成且当前没有正在执行的任务（信号量归零）
   */
  isEmpty(): boolean {
    return this.inputComplete && this.inFlight === 0
  }

  /**
   * 重置队列状态（用于重新开始一轮）
   */
  reset(): void {
    this.inputComplete = false
  }

  /**
   * 标记输入（AI 输出）已结束；之后不再会有新任务加入，信号量归零即表示本轮全部完成
   */
  setInputComplete(): void {
    this.inputComplete = true
    getLogger().debug('[ToolCallQueue] 输入已结束', {
      inFlight: this.inFlight,
      queueLength: this.queue.length
    })
    this.tryResolveComplete()
  }

  /**
   * 等待本轮所有工具执行完成
   * 条件：inputComplete 已设置 且 信号量 inFlight 为 0
   */
  async waitForComplete(): Promise<void> {
    getLogger().debug('[ToolCallQueue] waitForComplete 被调用', {
      inFlight: this.inFlight,
      inputComplete: this.inputComplete,
      queueLength: this.queue.length
    })

    if (this.inputComplete && this.inFlight === 0) {
      getLogger().debug('[ToolCallQueue] 已满足完成条件，直接返回')
      return
    }

    return new Promise<void>((resolve) => {
      this.completeResolve = resolve
      this.tryResolveComplete()
    })
  }

  /**
   * 已添加的任务数量（含已执行完的）
   */
  getLength(): number {
    return this.queue.length
  }

  /**
   * 是否有任务正在执行（信号量 > 0）
   */
  getIsRunning(): boolean {
    return this.inFlight > 0
  }
}
