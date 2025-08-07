// utils/ai_tasks.js
import { ref } from 'vue'
import { answerQuestionStream, continueConversationStream } from './llm-api'
import eventBus, { isMainWindow } from './event-bus'
import { useRoute } from 'vue-router'

import localIpcRenderer from './web-adapter/local-ipc-renderer.ts'
import { ai_task_status } from './consts.js'
import { i18n } from '../main.js'


let ipcRenderer = null
if (window && window.electron) {
  ipcRenderer = window.electron.ipcRenderer

} else {
  webMainCalls();
  ipcRenderer = localIpcRenderer
  //todo 说明当前环境不是electron环境，需要另外适配
}



const tasks = ref([])
let taskMap = new Map()
function generateHandle() {
  return 'task-' + Math.random().toString(36).substr(2, 9)
}
export const ai_types={
  answer: 'answer', // 回答问题
  chat: 'chat' // 多轮聊天
}

// 创建任务（主窗口和子窗口通用）
export function createAiTask(name, prompt, target, type, origin_key, meta = {}) {
  const autoStart = true
  const handle = generateHandle()

  let resolveDone, rejectDone
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve
    rejectDone = reject
  })

  const task = {
    handle,
    name,
    prompt,
    target,
    type,
    origin_key,
    meta,
    status: ref(ai_task_status.READY), // 初始状态为就绪
    controller: null,
    resolveDone,
    rejectDone
  }

  const existingTask = tasks.value.find(t => t.origin_key === origin_key)
  if (existingTask) {
    cancelAiTask(existingTask.handle)// 不能直接abort，因为可能是主窗口的任务，也可能是子窗口的任务
    //deleteTask(existingTask.handle)
  }

  tasks.value.push(task)
  taskMap.set(handle, task)

  // 非主窗口注册任务到主窗口显示
  if (!isMainWindow()) {
    //console.log('注册任务到主窗口', { handle, name, prompt, type, origin_key })
    ipcRenderer.send('register-ai-task', {
      handle, name, prompt, type, origin_key
    })
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

// 启动任务（只负责本窗口任务）
export async function startAiTask(handle) {
  const task = taskMap.get(handle)
  if (!task || task.status.value !== ai_task_status.READY) return

  task.status.value = ai_task_status.RUNNING  
  const controller = new AbortController()
  task.controller = controller

  try {
    if (task.type === ai_types.answer) {
      await answerQuestionStream(task.prompt, task.target, task.meta, controller.signal)
    } else if (task.type === ai_types.chat) {
      await continueConversationStream(task.prompt, task.target, controller.signal)
    }

    task.status.value = ai_task_status.FINISHED
    task.resolveDone?.()
    deleteTask(handle)

    if (!isMainWindow()) {
      ipcRenderer.send('ai-task-done', handle)
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      task.status.value = ai_task_status.CANCELLED
      const t=i18n.global.t
      task.rejectDone?.(new Error(t('aiTask.taskCancelled2')))
    } else {
      task.status.value = ai_task_status.FAILED
      task.rejectDone?.(e)
    }
  }
}
// 删除任务
function deleteTask(handle) {
  taskMap.delete(handle)
  tasks.value = tasks.value.filter(t => t.handle !== handle)
}

// 取消任务
export function cancelAiTask(handle) {
  const task = taskMap.get(handle)
  if (!task) return
  task.controller?.abort()
  if (task.status.value !== ai_task_status.FINISHED && isMainWindow()) {
    const t=i18n.global.t
    eventBus.emit('show-warning', t('aiTask.taskCancelled', { task:task.name }))
    
  }
  deleteTask(task.handle)
  ipcRenderer.send('broadcast-cancel-ai-task', task.handle)
  //不管是主窗口还是子窗口，都通过主进程广播取消任务，因为可能是主窗口发出的，也可能是子窗口发出的取消请求
}

// 在主窗口中：接收任务注册
ipcRenderer.on('register-ai-task', (_, taskInfo) => {
  //console.log('新任务注册', taskInfo)
  const { handle, name, prompt, type, origin_key } = taskInfo
  if (taskMap.has(handle)) return // 防止重复添加
  const task = {
    handle,
    name,
    prompt,
    target: ref(''), // 主窗口只是调度，不处理结果
    type,
    origin_key,
    status: ref(ai_task_status.READY),
    controller: null,
    resolveDone: null,
    rejectDone: null
  }
  tasks.value.push(task)
  taskMap.set(handle, task)
})

// 在主窗口中：任务完成，删除
ipcRenderer.on('ai-task-done', (_, handle) => {
  const task = taskMap.get(handle)
  if (task) {
    task.status.value = ai_task_status.FINISHED
    deleteTask(handle)
  }
})

// 所有窗口都监听取消命令
ipcRenderer.on('cancel-task', (_, handle) => {
  cancelAiTask(handle)
})

// 所有窗口监听启动命令（主窗口发起 → 主进程 → 渲染进程）
ipcRenderer.on('start-task', (_, handle) => {
  startAiTask(handle)
})
export function clearAiTasks() {
  // 清空任务列表，需要for然后单独取消每个任务，因为任务可能是主窗口的，也可能是子窗口的
  tasks.value.forEach(task => {
    cancelAiTask(task.handle)
  })
}



// 导出任务响应式对象
export function useAiTasks() {
  return tasks
}
