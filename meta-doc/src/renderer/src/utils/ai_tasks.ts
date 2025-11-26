// utils/ai_tasks.ts
import { ref, watch, type Ref } from 'vue'
import { answerQuestion, continueConversation } from './llm-api'
import eventBus, { isMainWindow, getWindowType } from './event-bus'
import localIpcRenderer from './web-adapter/local-ipc-renderer'
import { ai_task_status } from './consts'
import { i18n } from '../i18n.js'
import { webMainCalls } from './web-adapter/web-main-calls'
import type { 
  AITaskInfo, 
  AITaskType, 
  AITaskStatusValue,
  AIDialogMessage
} from '../../../types'
import { createRendererLogger } from './logger.ts'

// IPC渲染器适配
let ipcRenderer: any = null
if (window && (window as any).electron) {
  ipcRenderer = (window as any).electron.ipcRenderer
} else {
  webMainCalls();
  ipcRenderer = localIpcRenderer
}

// 任务存储
type InternalAITaskInfo = AITaskInfo & { mirror?: boolean }

const tasks: Ref<InternalAITaskInfo[]> = ref([])
const taskMap = new Map<string, InternalAITaskInfo>()

/** 生成任务句柄 */
function generateHandle(): string {
  return 'task-' + Math.random().toString(36).substr(2, 9)
}

/** AI任务类型常量 */
export const ai_types = {
  answer: 'answer' as const, // 回答问题
  chat: 'chat' as const      // 多轮聊天
} as const

/** LLM API 元数据接口 */
interface LLMApiMeta {
  stream?: boolean;
  temperature?: number;
  [key: string]: any;
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
  const autoStart = true
  const handle = generateHandle()

  let resolveDone!: (result?: any) => void
  let rejectDone!: (error?: any) => void
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve
    rejectDone = reject
  })

  const task: InternalAITaskInfo = {
    handle,
    name,
    prompt,
    target,
    type,
    origin_key,
    meta,
    status: ref(ai_task_status.READY as AITaskStatusValue),
    controller: null,
    resolveDone,
    rejectDone
  }

  // 检查是否有相同origin_key的任务，如果有则取消
  const existingTask = tasks.value.find(t => t.origin_key === origin_key)
  if (existingTask) {
    cancelAiTask(existingTask.handle, false)
  }

  tasks.value.push(task)
  taskMap.set(handle, task)

  // 非主窗口注册任务到主窗口显示
  if (!isMainWindow()) {
    const payload: Record<string, unknown> = {
      handle,
      name,
      type,
      origin_key
    }
    if (meta) {
      try {
        payload.meta = JSON.parse(JSON.stringify(meta))
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
    ipcRenderer.send('register-ai-task', payload)
  }

  if (autoStart) {
    // 如果是主窗口，直接启动任务，如果不是的话，让主窗口来启动
    if (!isMainWindow()) {
      ipcRenderer.send('start-task', handle)
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
      console.log('task.prompt', task.prompt)
      logger.debug(`[主窗口] 开始执行answer任务: handle=${handle}, prompt长度=${typeof task.prompt === 'string' ? task.prompt.length : 'array'}`)
      await answerQuestion(
        task.prompt as string, 
        task.target, 
        task.meta as any, 
        controller.signal
      )
      logger.debug(`[主窗口] answerQuestion完成，target.value长度=${task.target.value?.length || 0}, 内容前100字符=${task.target.value?.substring(0, 100) || '空'}`)
      // 对于非流式输出，answerQuestionNonStream已经同步设置了ref.value
      // 但为了确保Vue的响应式更新已完成，等待一小段时间
      if (!task.meta?.stream && task.mirror) {
        await new Promise(resolve => setTimeout(resolve, 100))
        logger.debug(`[主窗口] 等待后，target.value长度=${task.target.value?.length || 0}`)
      }
    } else if (task.type === ai_types.chat && task.target) {
      await continueConversation(
        task.prompt as AIDialogMessage[], 
        task.target, 
        task.meta as any, 
        controller.signal
      )
      // 对于非流式输出，等待一小段时间确保ref.value已更新
      if (!task.meta?.stream && task.mirror) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    task.status.value = ai_task_status.FINISHED as AITaskStatusValue
    
    // 如果是主窗口的mirror任务（来自子窗口），需要将结果发送回子窗口
    if (task.mirror && task.target) {
      const result = task.target.value || ''
      const logger = createRendererLogger('AiTasks')
      logger.debug(`[主窗口] 任务完成，准备发送结果到子窗口: handle=${handle}, result长度=${result.length}, result前100字符=${result.substring(0, 100)}`)
      
      // 检查结果是否为空
      if (!result || result.trim().length === 0) {
        logger.warn(`[主窗口] 警告：任务完成但结果为空，handle=${handle}, prompt长度=${typeof task.prompt === 'string' ? task.prompt.length : 'array'}, prompt前200字符=${typeof task.prompt === 'string' ? task.prompt.substring(0, 200) : 'array'}`)
      }
      
      // 对于流式输出，发送最终结果；对于非流式，也发送结果
      // 先发送结果，再resolve，确保子窗口能收到结果
      ipcRenderer.send('ai-task-result', { handle, result, error: null })
      // 等待一小段时间，确保IPC消息已发送
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    task.resolveDone?.()
    deleteTask(handle)

    if (!isMainWindow()) {
      ipcRenderer.send('ai-task-done', handle)
    }
  } catch (e: any) {
    // 如果是主窗口的mirror任务（来自子窗口），需要将错误发送回子窗口
    if (task.mirror) {
      const errorMessage = e.name === 'AbortError' 
        ? i18n.global.t('aiTask.taskCancelled2')
        : (e.message || String(e))
      ipcRenderer.send('ai-task-result', { handle, result: null, error: errorMessage })
    }
    
    if (e.name === 'AbortError') {
      task.status.value = ai_task_status.CANCELLED as AITaskStatusValue
      task.resolveDone?.(new Error(i18n.global.t('aiTask.taskCancelled2')))
    } else {
      task.status.value = ai_task_status.FAILED as AITaskStatusValue
      task.resolveDone?.(e)
    }
  }
}

/**
 * 删除任务
 */
function deleteTask(handle: string): void {
  taskMap.delete(handle)
  tasks.value = tasks.value.filter(t => t.handle !== handle)
}

/**
 * 取消任务
 */
export function cancelAiTask(handle: string, showWarning: boolean = true, propagate: boolean = true): void {
  const task = taskMap.get(handle)
  if (!task) return
  
  task.controller?.abort()
  if (task.status.value !== ai_task_status.FINISHED && isMainWindow()) {
    if (showWarning) {
      eventBus.emit('show-warning', i18n.global.t('aiTask.taskCancelled', { task: task.name }))
    }
  }
  
  deleteTask(task.handle)
  if (propagate) {
    ipcRenderer.send('broadcast-cancel-ai-task', task.handle)
  }
}

/**
 * 清空所有任务
 */
export function clearAiTasks(): void {
  // 清空任务列表，需要for然后单独取消每个任务，因为任务可能是主窗口的，也可能是子窗口的
  tasks.value.forEach(task => {
    cancelAiTask(task.handle)
  })
}

/**
 * 导出任务响应式对象
 */
export function useAiTasks(): Ref<AITaskInfo[]> {
  return tasks as Ref<AITaskInfo[]>
}

// ========== IPC事件监听器 ==========

// 在主窗口中：接收任务注册
ipcRenderer.on('register-ai-task', (_: any, taskInfo: any) => {
  const logger = createRendererLogger('AiTasks')
  logger.debug('主界面任务注册', taskInfo)
  const { handle, name, prompt, type, origin_key, meta: incomingMeta } = taskInfo
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
  if (incomingMeta?.stream) {
    let lastSentValue = ''
    let updateTimer: ReturnType<typeof setTimeout> | null = null
    
    watch(tempTarget, (newValue) => {
      // 节流更新，避免过于频繁的IPC通信
      if (updateTimer) {
        clearTimeout(updateTimer)
      }
      updateTimer = setTimeout(() => {
        if (newValue !== lastSentValue) {
          lastSentValue = newValue
          ipcRenderer.send('ai-task-update', { handle, result: newValue })
        }
      }, 100) // 每100ms最多更新一次
    }, { immediate: false })
  }
})

// 在主窗口中：任务完成，删除
ipcRenderer.on('ai-task-done', (_: any, handle: string) => {
  const task = taskMap.get(handle)
  if (task) {
    task.status.value = ai_task_status.FINISHED as AITaskStatusValue
    deleteTask(handle)
  }
})

// 所有窗口都监听取消命令
ipcRenderer.on('cancel-task', (_: any, handle: string) => {
  cancelAiTask(handle, false, false)
})

// 所有窗口监听启动命令（主窗口发起 → 主进程 → 渲染进程）
ipcRenderer.on('start-task', (_: any, handle: string) => {
  startAiTask(handle)
})

// 在子窗口中：接收主窗口的任务结果（非流式或最终结果）
ipcRenderer.on('ai-task-result', (_: any, data: { handle: string; result: string | null; error: string | null }) => {
  const { handle, result, error } = data
  const task = taskMap.get(handle)
  const logger = createRendererLogger('AiTasks')
  logger.debug(`[子窗口] 收到任务结果: handle=${handle}, result长度=${result?.length || 0}, error=${error || 'null'}`)
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
})

// 在子窗口中：接收主窗口的流式更新（实时同步）
ipcRenderer.on('ai-task-update', (_: any, data: { handle: string; result: string }) => {
  const { handle, result } = data
  const task = taskMap.get(handle)
  if (task && task.target) {
    // 实时更新子窗口的target
    task.target.value = result
  }
})
