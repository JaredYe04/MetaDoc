// utils/ai_tasks.ts
import { ref, type Ref } from 'vue'
import { answerQuestion, continueConversation } from './llm-api'
import eventBus, { isMainWindow } from './event-bus'
import localIpcRenderer from './web-adapter/local-ipc-renderer'
import { ai_task_status } from './consts'
import { i18n } from '../main'
import { webMainCalls } from './web-adapter/web-main-calls'
import type { 
  AITaskInfo, 
  AITaskType, 
  AITaskStatusValue,
  AIDialogMessage
} from '../../../types'

// IPC渲染器适配
let ipcRenderer: any = null
if (window && (window as any).electron) {
  ipcRenderer = (window as any).electron.ipcRenderer
} else {
  webMainCalls();
  ipcRenderer = localIpcRenderer
}

// 任务存储
const tasks: Ref<AITaskInfo[]> = ref([])
const taskMap = new Map<string, AITaskInfo>()

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
  try_rag: boolean,
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

  const task: AITaskInfo = {
    handle,
    name,
    prompt,
    target,
    type,
    origin_key,
    try_rag,
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
    ipcRenderer.send('register-ai-task', JSON.parse(JSON.stringify({
      handle, name, prompt, type, origin_key
    })));
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
  const controller = new AbortController()
  task.controller = controller

  try {
    if (task.type === ai_types.answer && task.target) {
      await answerQuestion(
        task.prompt as string, 
        task.target, 
        task.meta as any, 
        controller.signal, 
        task.try_rag
      )
    } else if (task.type === ai_types.chat && task.target) {
      await continueConversation(
        task.prompt as AIDialogMessage[], 
        task.target, 
        task.meta as any, 
        controller.signal, 
        task.try_rag
      )
    }

    task.status.value = ai_task_status.FINISHED as AITaskStatusValue
    task.resolveDone?.()
    deleteTask(handle)

    if (!isMainWindow()) {
      ipcRenderer.send('ai-task-done', handle)
    }
  } catch (e: any) {
    if (e.name === 'AbortError') {
      task.status.value = ai_task_status.CANCELLED as AITaskStatusValue
      const t = i18n.global.t
      task.resolveDone?.(new Error(t('aiTask.taskCancelled2')))
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
export function cancelAiTask(handle: string, showWarning: boolean = true): void {
  const task = taskMap.get(handle)
  if (!task) return
  
  task.controller?.abort()
  if (task.status.value !== ai_task_status.FINISHED && isMainWindow()) {
    const t = i18n.global.t
    if (showWarning) {
      eventBus.emit('show-warning', t('aiTask.taskCancelled', { task: task.name }))
    }
  }
  
  deleteTask(task.handle)
  ipcRenderer.send('broadcast-cancel-ai-task', task.handle)
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
  return tasks
}

// ========== IPC事件监听器 ==========

// 在主窗口中：接收任务注册
ipcRenderer.on('register-ai-task', (_: any, taskInfo: any) => {
  console.log('主界面任务注册', taskInfo)
  const { handle, name, prompt, type, origin_key } = taskInfo
  if (taskMap.has(handle)) return // 防止重复添加
  
  const task: AITaskInfo = {
    handle,
    name,
    prompt,
    target: ref('') as Ref<string>, // 主窗口只是调度，不处理结果
    type,
    origin_key,
    status: ref(ai_task_status.READY as AITaskStatusValue),
    controller: null,
    resolveDone: null,
    rejectDone: null,
    try_rag: false,
    meta: {}
  }
  tasks.value.push(task)
  taskMap.set(handle, task)
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
  cancelAiTask(handle)
})

// 所有窗口监听启动命令（主窗口发起 → 主进程 → 渲染进程）
ipcRenderer.on('start-task', (_: any, handle: string) => {
  startAiTask(handle)
})
