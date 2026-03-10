// utils/ai_tasks.ts
import { ref, watch, type Ref } from 'vue'
import { answerQuestion, continueConversation, continueConversationWithTools } from './llm-api'
import eventBus, { isMainWindow, getWindowType } from './event-bus'
import messageBridge from '../bridge/message-bridge'
import { ai_task_status } from './consts'
import { i18n } from '../i18n.js'
import type { AITaskInfo, AITaskType, AITaskStatusValue, AIDialogMessage } from '../../../types'
import { createRendererLogger } from './logger.ts'

// 任务存储
type InternalAITaskInfo = AITaskInfo & {
  mirror?: boolean
  error?: string | null // 错误信息
  deleteTimer?: NodeJS.Timeout | null // 延迟删除定时器
}

const tasks: Ref<InternalAITaskInfo[]> = ref([])
const taskMap = new Map<string, InternalAITaskInfo>()

/** 生成任务句柄 */
function generateHandle(): string {
  return 'task-' + Math.random().toString(36).substr(2, 9)
}

/** AI任务类型常量 */
export const ai_types = {
  answer: 'answer' as const, // 回答问题
  chat: 'chat' as const, // 多轮聊天
  tool: 'tool' as const // 工具调用
} as const

/** 自定义LLM配置接口 */
export interface CustomLlmConfigForTask {
  /** API基础URL */
  baseUrl: string
  /** API Key（可选） */
  apiKey?: string
  /** 模型名称 */
  model: string
  /** 温度参数 */
  temperature?: number
  /** 最大token数 */
  maxTokens?: number
  /** LLM类型（默认为openai-compatible） */
  type?: 'openai' | 'openai-official' | 'deepseek' | 'ollama' | 'metadoc' | 'openai-compatible'
  /** Chat API后缀（可选，默认为/chat/completions） */
  chatSuffix?: string
  /** Completion API后缀（可选，默认为/completions） */
  completionSuffix?: string
}

/** LLM API 元数据接口 */
interface LLMApiMeta {
  stream?: boolean
  temperature?: number
  /** 自定义LLM配置（如果提供，将使用此配置而不是全局配置） */
  customLlmConfig?: CustomLlmConfigForTask
  [key: string]: any
}

/** 任务创建结果 */
interface CreateTaskResult {
  handle: string
  done: Promise<any>
}

/**
 * 创建AI任务（主窗口和子窗口通用）
 * 保持原有函数签名不变
 */
export function createAiTask(
  name: string,
  prompt: string | AIDialogMessage[],
  target: Ref<string>,
  type: AITaskType,
  origin_key: string,
  meta: LLMApiMeta = { stream: true }
): CreateTaskResult {
  const logger = createRendererLogger('AiTasks')

  // 仅记录 meta 摘要，避免打印完整 meta（含 tools fullSpec、reactiveMessage 等）
  logger.debug(`[createAiTask] 收到调用，检查meta参数:`, {
    stream: meta?.stream,
    streamType: typeof meta?.stream,
    metaKeys: meta && typeof meta === 'object' ? Object.keys(meta) : [],
    hasStream: meta && typeof meta === 'object' && 'stream' in meta
  })

  const autoStart = true
  const handle = generateHandle()

  let resolveDone!: (result?: any) => void
  let rejectDone!: (error?: any) => void
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve
    rejectDone = reject
  })

  // 关键：确保stream属性不会被覆盖
  // 如果meta中没有stream，或者stream是undefined，默认设置为true
  const finalMeta = { ...meta }
  if (finalMeta.stream === undefined) {
    finalMeta.stream = true
    logger.debug('[createAiTask] meta.stream未定义，设置为true（默认流式输出）')
  }

  logger.debug(`[createAiTask] 最终meta对象:`, {
    stream: finalMeta.stream,
    streamType: typeof finalMeta.stream
  })

  const task: InternalAITaskInfo = {
    handle,
    name,
    prompt,
    target,
    type,
    origin_key,
    meta: finalMeta,
    status: ref(ai_task_status.READY as AITaskStatusValue),
    controller: null,
    resolveDone,
    rejectDone
  }

  // 检查是否有相同origin_key的任务，如果有则取消
  const existingTask = tasks.value.find((t) => t.origin_key === origin_key)
  if (existingTask) {
    cancelAiTask(existingTask.handle, false)
  }

  tasks.value.push(task)
  taskMap.set(handle, task)

  // 注册任务（主窗口和子窗口都需要注册，以便任务队列可以显示）
  logger.debug(
    `[createAiTask] 创建任务: handle=${handle}, name=${name}, type=${type}, origin_key=${origin_key}, isMainWindow=${isMainWindow()}`
  )

  // 非主窗口注册任务到主窗口显示
  if (!isMainWindow()) {
    const payload: Record<string, unknown> = {
      handle,
      name,
      type,
      origin_key
    }
    // 关键：使用finalMeta而不是原始的meta，确保stream属性正确传递
    if (finalMeta && typeof finalMeta === 'object') {
      try {
        payload.meta = JSON.parse(JSON.stringify(finalMeta))
        logger.debug(`[createAiTask] 非主窗口，序列化meta:`, {
          stream: (payload.meta as any)?.stream
        })
      } catch (_error) {
        payload.meta = {}
      }
    } else {
      payload.meta = {}
    }
    if (typeof prompt === 'string') {
      payload.prompt = prompt
    } else {
      try {
        payload.prompt = JSON.parse(JSON.stringify(prompt))
      } catch (_error) {
        payload.prompt = []
      }
    }
    messageBridge.send('register-ai-task', payload)
    logger.debug(`[createAiTask] 已发送register-ai-task IPC事件到主窗口`)
  } else {
    // 主窗口的任务已经添加到tasks.value，任务队列组件会自动显示
    logger.debug(`[createAiTask] 主窗口任务，已添加到tasks.value，任务数量=${tasks.value.length}`)
  }

  if (autoStart) {
    // 如果是主窗口，直接启动任务，如果不是的话，让主窗口来启动
    if (!isMainWindow()) {
      messageBridge.send('start-task', handle)
    } else {
      startAiTask(handle)
    }
  }

  return { handle, done }
}

/**
 * 启动任务（只负责本窗口任务）
 */
export async function startAiTask(handle: string): Promise<void> {
  const task = taskMap.get(handle)
  if (!task || task.status.value !== ai_task_status.READY) return

  task.status.value = ai_task_status.RUNNING as AITaskStatusValue
  if (task.mirror) {
    return
  }
  const controller = new AbortController()
  task.controller = controller

  try {
    if (task.type === ai_types.answer && task.target) {
      const logger = createRendererLogger('AiTasks')
      logger.debug(
        `[主窗口] 开始执行answer任务: handle=${handle}, prompt长度=${typeof task.prompt === 'string' ? task.prompt.length : (Array.isArray(task.prompt) ? task.prompt.length + ' messages' : 'other')}`
      )

      // 仅记录 meta 摘要，避免打印完整 meta（含 tools、reactiveMessage）
      logger.debug(`[startAiTask] answer任务，task.meta:`, {
        stream: task.meta?.stream,
        streamType: typeof task.meta?.stream,
        metaKeys: task.meta ? Object.keys(task.meta) : [],
        hasStream: 'stream' in (task.meta || {})
      })

      // 确保meta对象包含stream属性
      const finalMeta = { ...(task.meta || {}) }
      // 如果stream未定义，默认设置为true（流式输出）
      if (finalMeta.stream === undefined) {
        finalMeta.stream = true
        logger.debug('[startAiTask] answer任务，meta.stream未定义，设置为true（默认流式输出）')
      }

      logger.debug(`[startAiTask] answer任务最终meta对象:`, {
        stream: finalMeta.stream,
        streamType: typeof finalMeta.stream
      })

      // 提取自定义LLM配置
      const customLlmConfig = task.meta?.customLlmConfig || null

      await answerQuestion(
        task.prompt as string,
        task.target,
        finalMeta as any,
        controller.signal,
        customLlmConfig as any
      )
      logger.debug(
        `[主窗口] answerQuestion完成，target.value长度=${task.target.value?.length || 0}, 内容前100字符=${task.target.value?.substring(0, 100) || '空'}`
      )
      // 对于非流式输出，answerQuestionNonStream已经同步设置了ref.value
      // 但为了确保Vue的响应式更新已完成，等待一小段时间
      if (!task.meta?.stream && task.mirror) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        logger.debug(`[主窗口] 等待后，target.value长度=${task.target.value?.length || 0}`)
      }
    } else if (task.type === ai_types.chat && task.target) {
      const logger = createRendererLogger('AiTasks')

      // 提取自定义LLM配置
      const customLlmConfig = task.meta?.customLlmConfig || null

      // 记录task.meta用于调试
      // logger.debug(`[startAiTask] chat任务，task.meta:`, {
      //   stream: task.meta?.stream,
      //   streamType: typeof task.meta?.stream,
      //   metaKeys: task.meta ? Object.keys(task.meta) : [],
      //   hasStream: 'stream' in (task.meta || {}),
      //   metaValue: JSON.stringify(task.meta)
      // })

      // 确保meta对象包含stream属性，如果没有则默认使用流式输出
      // 创建一个新的meta对象，确保stream属性正确
      const finalMeta = { ...(task.meta || {}) }

      // 如果stream未定义，默认设置为true（流式输出）
      if (finalMeta.stream === undefined) {
        finalMeta.stream = true
        logger.debug('[startAiTask] meta.stream未定义，设置为true（默认流式输出）')
      }

      logger.debug(`[startAiTask] 最终meta对象:`, {
        stream: finalMeta.stream,
        streamType: typeof finalMeta.stream
      })

      const useNativeTools =
        Array.isArray(finalMeta.tools) &&
        finalMeta.tools.length > 0 &&
        typeof finalMeta.onToolCallsDetected === 'function'
      if (useNativeTools) {
        await (continueConversationWithTools as (
          conv: AIDialogMessage[],
          r: Ref<string>,
          m: any,
          signal: AbortSignal | undefined,
          custom: any
        ) => Promise<void>)(
          task.prompt as AIDialogMessage[],
          task.target,
          finalMeta as any,
          controller.signal,
          customLlmConfig as any
        )
      } else {
        await continueConversation(
          task.prompt as AIDialogMessage[],
          task.target,
          finalMeta as any,
          controller.signal,
          customLlmConfig as any
        )
      }
      // 对于非流式输出，等待一小段时间确保ref.value已更新
      if (!task.meta?.stream && task.mirror) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    } else if (task.type === ai_types.tool && task.target) {
      const logger = createRendererLogger('AiTasks')

      // 工具调用任务：执行工具
      // task.prompt 应该是工具ID（字符串）
      // task.meta 应该包含 toolId, parameters, tool_call_id 等信息
      const toolId = typeof task.prompt === 'string' ? task.prompt : (task.meta?.toolId as string)
      const parameters = (task.meta?.parameters as Record<string, unknown>) || {}
      const session = task.meta?.session as any
      const toolCallId = task.meta?.tool_call_id as string | undefined

      if (!toolId) {
        throw new Error('工具调用任务缺少工具ID')
      }

      logger.debug(`[startAiTask] 开始执行工具调用任务: handle=${handle}, toolId=${toolId}`)

      // 导入ToolRunner
      const { ToolRunner } = await import('./agent-framework/tool-runner')

      // 执行工具（传入 toolCallId 以便 Display 组件能订阅到实时事件）
      const observation = await ToolRunner.runTool(
        toolId,
        parameters,
        controller.signal,
        session,
        toolCallId
      )

      // 将完整的observation保存到task.meta中，供ToolCallQueue使用
      // 注意：必须在任务完成前保存，因为任务完成后会立即删除
      if (task.meta) {
        ;(task.meta as any).__observation = observation
      }

      // 将结果序列化为字符串，更新到target
      if (task.target) {
        if (observation.status === 'succeeded') {
          // 成功：序列化结果
          const resultText =
            observation.summary ||
            (typeof observation.result === 'string'
              ? observation.result
              : JSON.stringify(observation.result, null, 2))
          task.target.value = resultText
        } else {
          // 失败：记录错误信息
          task.target.value = `工具执行失败: ${observation.error || '未知错误'}`
        }
      }

      logger.debug(`[startAiTask] 工具调用任务完成: handle=${handle}, status=${observation.status}`)
    }

    task.status.value = ai_task_status.FINISHED as AITaskStatusValue

    // 如果是主窗口的mirror任务（来自子窗口），需要将结果发送回子窗口
    if (task.mirror && task.target) {
      const result = task.target.value || ''
      const logger = createRendererLogger('AiTasks')
      logger.debug(
        `[主窗口] 任务完成，准备发送结果到子窗口: handle=${handle}, result长度=${result.length}, result前100字符=${result.substring(0, 100)}`
      )

      // 检查结果是否为空
      if (!result || result.trim().length === 0) {
        logger.warn(
          `[主窗口] 警告：任务完成但结果为空，handle=${handle}, prompt长度=${typeof task.prompt === 'string' ? task.prompt.length : 'array'}, prompt前200字符=${typeof task.prompt === 'string' ? task.prompt.substring(0, 200) : 'array'}`
        )
      }

      // 对于流式输出，发送最终结果；对于非流式，也发送结果
      // 先发送结果，再resolve，确保子窗口能收到结果
      messageBridge.send('ai-task-result', { handle, result, error: null })
      // 等待一小段时间，确保IPC消息已发送
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    task.resolveDone?.()

    // 对于tool类型任务，延迟删除，确保ToolCallQueue能获取到observation
    // 其他类型任务立即删除
    if (task.type === ai_types.tool) {
      // 延迟删除，给ToolCallQueue时间获取observation
      setTimeout(() => {
        deleteTask(handle)
      }, 100)
    } else {
      deleteTask(handle)
    }

    if (!isMainWindow()) {
      messageBridge.send('ai-task-done', handle)
    }
  } catch (e: any) {
    const logger = createRendererLogger('AiTasks')
    logger.error(`[startAiTask] 任务执行失败: handle=${handle}`, e)

    // 重新获取任务对象，确保我们操作的是最新的任务对象
    const currentTask = taskMap.get(handle)
    if (!currentTask) {
      logger.warn(`[startAiTask] 任务已不存在: handle=${handle}`)
      return
    }

    // 提取错误信息
    let errorMessage = ''
    if (e?.getUserMessage) {
      // LlmError 有 getUserMessage 方法
      errorMessage = e.getUserMessage()
    } else if (e?.message) {
      errorMessage = e.message
    } else {
      errorMessage = String(e)
    }

    logger.debug(`[startAiTask] 设置任务失败状态: handle=${handle}, errorMessage=${errorMessage}`)

    // 保存错误信息到任务对象
    currentTask.error = errorMessage

    // 如果是主窗口的mirror任务（来自子窗口），需要将错误发送回子窗口
    if (currentTask.mirror) {
      const msg = e.name === 'AbortError' ? i18n.global.t('aiTask.taskCancelled2') : errorMessage
      messageBridge.send('ai-task-result', { handle, result: null, error: msg })
    }

    if (e.name === 'AbortError') {
      currentTask.status.value = ai_task_status.CANCELLED as AITaskStatusValue
      logger.debug(`[startAiTask] 任务已取消: handle=${handle}, status=${currentTask.status.value}`)
      // 取消时应该 reject promise，让调用者知道任务被取消
      currentTask.rejectDone?.(new Error(i18n.global.t('aiTask.taskCancelled2')))
      // 取消的任务可以立即删除
      deleteTask(handle)
    } else {
      // 关键：先设置状态，确保UI能立即看到
      currentTask.status.value = ai_task_status.FAILED as AITaskStatusValue
      logger.debug(
        `[startAiTask] 任务已失败: handle=${handle}, status=${currentTask.status.value}, error=${errorMessage}`
      )

      // 关键修复：失败时应该 reject promise，而不是 resolve，这样调用者才能通过 try-catch 捕获错误
      currentTask.rejectDone?.(e)

      // 失败的任务延迟删除，让用户能看到错误信息（10秒后自动删除）
      if (currentTask.deleteTimer) {
        clearTimeout(currentTask.deleteTimer)
      }
      currentTask.deleteTimer = setTimeout(() => {
        logger.debug(`[startAiTask] 延迟删除失败任务: handle=${handle}`)
        deleteTask(handle)
      }, 10000) // 10秒后删除
    }
  }
}

/**
 * 删除任务
 */
function deleteTask(handle: string): void {
  const task = taskMap.get(handle)
  if (task) {
    // 清理定时器
    if (task.deleteTimer) {
      clearTimeout(task.deleteTimer)
      task.deleteTimer = null
    }
  }
  taskMap.delete(handle)
  tasks.value = tasks.value.filter((t) => t.handle !== handle)
}

/**
 * 取消任务
 */
export function cancelAiTask(
  handle: string,
  showWarning: boolean = true,
  propagate: boolean = true
): void {
  const task = taskMap.get(handle)
  if (!task) return

  const logger = createRendererLogger('AiTasks')
  logger.debug(`[cancelAiTask] 取消任务: handle=${handle}, status=${task.status.value}`)

  // 先更新状态为CANCELLED
  if (
    task.status.value !== ai_task_status.FINISHED &&
    task.status.value !== ai_task_status.CANCELLED
  ) {
    task.status.value = ai_task_status.CANCELLED as AITaskStatusValue
  }

  // 中止请求
  task.controller?.abort()

  // 拒绝promise，让调用者知道任务被取消
  if (task.rejectDone) {
    task.rejectDone(new Error('任务已取消'))
  }

  if (task.status.value !== ai_task_status.FINISHED && isMainWindow()) {
    if (showWarning) {
      eventBus.emit('show-warning', i18n.global.t('aiTask.taskCancelled', { task: task.name }))
    }
  }

  // 如果是mirror任务，通知子窗口任务已取消
  if (task.mirror) {
    messageBridge.send('ai-task-result', { handle, result: null, error: '任务已取消' })
  }

  // 延迟删除任务，让UI有时间更新状态
  setTimeout(() => {
    deleteTask(task.handle)
  }, 100)

  if (propagate) {
    messageBridge.send('broadcast-cancel-ai-task', task.handle)
  }
}

/**
 * 清空所有任务
 */
export function clearAiTasks(): void {
  // 清空任务列表，需要for然后单独取消每个任务，因为任务可能是主窗口的，也可能是子窗口的
  tasks.value.forEach((task) => {
    cancelAiTask(task.handle)
  })
}

/**
 * 导出任务响应式对象
 */
export function useAiTasks(): Ref<AITaskInfo[]> {
  return tasks as Ref<AITaskInfo[]>
}

/**
 * 根据origin_key查找任务
 */
export function findTaskByOriginKey(originKey: string): InternalAITaskInfo | undefined {
  return tasks.value.find((t) => t.origin_key === originKey)
}

/**
 * 获取任务Map（用于内部访问）
 */
export function getTaskMap(): Map<string, InternalAITaskInfo> {
  return taskMap
}

// ========== IPC事件监听器 ==========

// 在主窗口中：接收任务注册
messageBridge.on('register-ai-task', (_: any, taskInfo: any) => {
  const logger = createRendererLogger('AiTasks')
  // 仅记录摘要，避免打印完整 taskInfo（含 prompt 全量消息、meta.tools fullSpec、reactiveMessage）
  const { handle, name, prompt, type, origin_key, meta: incomingMeta } = taskInfo
  logger.debug('主界面任务注册', {
    handle,
    name,
    type,
    origin_key,
    promptLength: typeof prompt === 'string' ? prompt.length : Array.isArray(prompt) ? prompt.length : 0,
    metaKeys: incomingMeta && typeof incomingMeta === 'object' ? Object.keys(incomingMeta) : []
  })
  if (taskMap.has(handle)) return // 防止重复添加

  // 为主窗口任务创建一个临时的 ref，用于接收结果
  // 结果会通过IPC发送回子窗口
  const tempTarget = ref('')

  const task: InternalAITaskInfo = {
    handle,
    name,
    prompt,
    target: tempTarget, // 使用临时ref
    type,
    origin_key,
    status: ref(ai_task_status.READY as AITaskStatusValue),
    controller: null,
    resolveDone: null,
    rejectDone: null,
    meta: incomingMeta ?? {},
    mirror: true
  }
  tasks.value.push(task)
  taskMap.set(handle, task)

  // 如果是流式输出，监听临时ref的变化，实时同步到子窗口
  // 注意：stream可能是true、false或undefined，需要明确检查
  const isStream = incomingMeta?.stream === true || (incomingMeta?.stream === undefined && true) // 默认流式
  if (isStream) {
    let lastSentValue = ''
    let updateTimer: ReturnType<typeof setTimeout> | null = null

    watch(
      tempTarget,
      (newValue) => {
        // 节流更新，避免过于频繁的IPC通信，但对于流式输出，需要更频繁的更新
        if (updateTimer) {
          clearTimeout(updateTimer)
        }
        updateTimer = setTimeout(() => {
          if (newValue !== lastSentValue) {
            lastSentValue = newValue
            messageBridge.send('ai-task-update', { handle, result: newValue })
          }
        }, 50) // 流式输出时，每50ms更新一次，确保实时性
      },
      { immediate: false }
    )
  }
})

// 在主窗口中：任务完成，删除
messageBridge.on('ai-task-done', (_: any, handle: string) => {
  const task = taskMap.get(handle)
  if (task) {
    task.status.value = ai_task_status.FINISHED as AITaskStatusValue
    deleteTask(handle)
  }
})

// 所有窗口都监听取消命令
messageBridge.on('cancel-task', (_: any, handle: string) => {
  cancelAiTask(handle, false, false)
})

// 所有窗口监听启动命令（主窗口发起 → 主进程 → 渲染进程）
messageBridge.on('start-task', (_: any, handle: string) => {
  startAiTask(handle)
})

// 在子窗口中：接收主窗口的任务结果（非流式或最终结果）
messageBridge.on(
  'ai-task-result',
  (_: any, data: { handle: string; result: string | null; error: string | null }) => {
    const { handle, result, error } = data
    const task = taskMap.get(handle)
    const logger = createRendererLogger('AiTasks')
    logger.debug(
      `[子窗口] 收到任务结果: handle=${handle}, result长度=${result?.length || 0}, error=${error || 'null'}`
    )
    if (task && task.target) {
      if (error) {
        // 如果有错误，reject promise
        logger.debug(`[子窗口] 任务失败，reject promise: ${error}`)
        task.rejectDone?.(new Error(error))
      } else if (result !== null) {
        // 更新子窗口的target
        logger.debug(`[子窗口] 更新target.value，长度=${result.length}`)
        task.target.value = result
        // resolve promise
        task.resolveDone?.()
      } else {
        logger.warn(`[子窗口] 收到空结果，但task存在: handle=${handle}`)
        // 如果result是null但没有error，可能是空结果，也需要resolve
        task.target.value = ''
        task.resolveDone?.()
      }
    } else {
      logger.warn(`[子窗口] 收到任务结果，但找不到task: handle=${handle}`)
    }
  }
)

// 在子窗口中：接收主窗口的流式更新（实时同步）
messageBridge.on('ai-task-update', (_: any, data: { handle: string; result: string }) => {
  const { handle, result } = data
  const task = taskMap.get(handle)
  if (task && task.target) {
    // 实时更新子窗口的target
    task.target.value = result
  }
})
