/**
 * 全局 MessageBox API
 * 替代 ElMessageBox，与 ElMessageBox.confirm 兼容的 Promise API
 */

import { useMessageBoxStore } from '../stores/messageBox'
import { i18n } from '../i18n'
import type { MessageBoxOptions } from '../stores/messageBox'

function t(key: string, fallback?: string): string {
  return i18n.global.t(key) || fallback || key
}

export const messageBox = {
  confirm(message: string, title?: string, options?: MessageBoxOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = useMessageBoxStore()
      store.show({
        mode: 'confirm',
        message,
        title: title ?? t('common.confirm', '确认'),
        type: options?.type ?? 'warning',
        confirmButtonText: options?.confirmButtonText ?? t('common.confirm', '确定'),
        cancelButtonText: options?.cancelButtonText ?? t('common.cancel', '取消'),
        resolve: () => resolve(),
        reject: (reason) => reject(reason)
      })
    })
  },

  prompt(
    message: string,
    title?: string,
    options?: MessageBoxOptions & {
      inputValue?: string
      inputValidator?: (v: string) => boolean | string
    }
  ): Promise<{ value: string }> {
    return new Promise((resolve, reject) => {
      const store = useMessageBoxStore()
      store.show({
        mode: 'prompt',
        message,
        title: title ?? t('common.confirm', '确认'),
        type: options?.type ?? 'info',
        confirmButtonText: options?.confirmButtonText ?? t('common.confirm', '确定'),
        cancelButtonText: options?.cancelButtonText ?? t('common.cancel', '取消'),
        inputValue: options?.inputValue ?? '',
        inputValidator: options?.inputValidator,
        resolve: (value) => resolve({ value: value ?? '' }),
        reject: (reason) => reject(reason)
      })
    })
  }
}
