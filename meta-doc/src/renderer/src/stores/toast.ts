/**
 * 全局 Toast 状态管理
 * 替代 ElMessage，渲染在顶层，支持深色/浅色模式与主题适配
 */

import { reactive } from 'vue'

export type ToastType = 'success' | 'warning' | 'info' | 'error'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
  duration: number
  timer: ReturnType<typeof setTimeout> | null
}

let idCounter = 0
const DEFAULT_DURATION = 4000

const items = reactive<ToastItem[]>([])

function generateId(): string {
  return `toast-${Date.now()}-${++idCounter}`
}

function addToast(message: string, type: ToastType, duration = DEFAULT_DURATION): void {
  const id = generateId()
  let timer: ReturnType<typeof setTimeout> | null = null

  const item: ToastItem = {
    id,
    message,
    type,
    duration,
    timer: null
  }
  items.push(item)

  timer = setTimeout(() => {
    removeToast(id)
  }, duration)
  item.timer = timer
}

function removeToast(id: string): void {
  const index = items.findIndex((t) => t.id === id)
  if (index >= 0) {
    const item = items[index]
    if (item.timer) {
      clearTimeout(item.timer)
    }
    items.splice(index, 1)
  }
}

export function useToastStore() {
  return {
    items,
    addToast,
    removeToast
  }
}
