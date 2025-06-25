// utils/ai_tasks.js
import { ref } from 'vue'
import { answerQuestionStream, continueConversationStream } from './llm-api'
import eventBus from './event-bus'
import { de } from 'element-plus/es/locales.mjs'

const tasks = ref([])
let taskMap = new Map()

function generateHandle() {
  return 'task-' + Math.random().toString(36).substr(2, 9)
}
export const ai_types={
  answer: 'answer', // 回答问题
  chat: 'chat' // 多轮聊天
}
// 创建任务
export function createAiTask(name, prompt, target, type, origin_key,meta={}) {
  const autoStart = true; // todo:让用户选择是否自动启动任务
  const handle = generateHandle();

  //  创建 Promise 用于等待任务完成
  let resolveDone, rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const task = {
    handle,
    name,
    prompt,
    target,       // ref对象
    type,         // 'answer', 'chat'
    origin_key,   // 发起源识别标识
    meta,// 附加元数据，例如ai温度
    status: ref('就绪'),
    controller: null,
    resolveDone,
    rejectDone
  };

  //  检查是否有相同 origin_key 的任务
  const existingTask = tasks.value.find(t => t.origin_key === origin_key);
  if (existingTask) {
    if (existingTask.status.value !== '已完成') {
      existingTask.controller?.abort();
    }
    deleteTask(existingTask.handle);
  }

  tasks.value.push(task);
  taskMap.set(handle, task);

  if (autoStart) startAiTask(handle);

  //  返回 handle 和等待 Promise
  return { handle, done };
}
// 启动任务
export async function startAiTask(handle) {
  const task = taskMap.get(handle);
  if (!task || task.status.value !== '就绪') return;

  task.status.value = '工作中';
  const controller = new AbortController();
  task.controller = controller;

  try {
    if (task.type === ai_types.answer) {
      await answerQuestionStream(task.prompt, task.target, task.meta, controller.signal);
    } else if (task.type === ai_types.chat) {
      await continueConversationStream(task.prompt, task.target, controller.signal);
    }

    //eventBus.emit('show-success', `任务 ${task.name} 执行成功`);
    task.status.value = '已完成';

    //  通知等待者：任务完成
    task.resolveDone?.();

    deleteTask(handle);
  } catch (e) {
    if (e.name === 'AbortError') {
      console.log(`任务 ${handle} 被取消`);
      task.status.value = '已取消';

      // 被取消也应 reject 掉
      task.rejectDone?.(new Error('任务被取消'));
    } else {
      console.error(`任务 ${handle} 执行失败：`, e);
      task.rejectDone?.(e); // 失败 reject
    }

    task.status.value = '就绪';
  }
}
function deleteTask(handle) {
  taskMap.delete(handle)
  tasks.value = tasks.value.filter(t => t.handle !== handle)
}

// 取消任务
export function cancelAiTask(handle) {
  const task = taskMap.get(handle)
  if (!task) return
  task.controller?.abort()
  if(task.status.value !== '已完成'){
    eventBus.emit('show-warning', '任务已取消');
  }
  deleteTask(handle)
}

// 获取所有任务（reactive）
export function useAiTasks() {
  return tasks
}
