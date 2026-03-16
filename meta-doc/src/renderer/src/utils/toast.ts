/**
 * 全局 Toast API
 * 替代 ElMessage，与 ElMessage.success/error/warning/info 兼容
 */

import { useToastStore } from '../stores/toast'
import type { ToastType } from '../stores/toast'

function getStore() {
  return useToastStore()
}

export const toast = {
  success(message: string, duration?: number): void {
    getStore().addToast(message, 'success', duration)
  },
  error(message: string, duration?: number): void {
    getStore().addToast(message, 'error', duration)
  },
  warning(message: string, duration?: number): void {
    getStore().addToast(message, 'warning', duration)
  },
  info(message: string, duration?: number): void {
    getStore().addToast(message, 'info', duration)
  }
}
