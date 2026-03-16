/**
 * 全局 MessageBox 状态管理
 * 替代 ElMessageBox，渲染在 MainTabs 内，确保始终在最顶层
 */

import { reactive } from 'vue'

export interface MessageBoxOptions {
  title?: string
  type?: 'warning' | 'info' | 'error' | 'success'
  confirmButtonText?: string
  cancelButtonText?: string
  /** prompt 模式下的初始值 */
  inputValue?: string
  /** prompt 模式下的校验函数，返回 true 或错误信息 */
  inputValidator?: (value: string) => boolean | string
}

export interface MessageBoxState {
  visible: boolean
  mode: 'confirm' | 'prompt'
  message: string
  title: string
  type: 'warning' | 'info' | 'error' | 'success'
  confirmButtonText: string
  cancelButtonText: string
  inputValue: string
  inputValidator?: (value: string) => boolean | string
  resolve: ((value?: string) => void) | null
  reject: ((reason: string) => void) | null
}

const defaultState: MessageBoxState = {
  visible: false,
  mode: 'confirm',
  message: '',
  title: '',
  type: 'warning',
  confirmButtonText: '',
  cancelButtonText: '',
  inputValue: '',
  resolve: null,
  reject: null
}

const state = reactive<MessageBoxState>({ ...defaultState })

function reset() {
  Object.assign(state, defaultState)
}

export function useMessageBoxStore() {
  return {
    state,
    show(config: Partial<MessageBoxState> & { message: string }) {
      Object.assign(state, defaultState, config, { visible: true })
    },
    hide() {
      state.visible = false
    },
    resolve(value?: string) {
      const fn = state.resolve
      reset()
      fn?.(value)
    },
    reject(reason: string) {
      const fn = state.reject
      reset()
      fn?.(reason)
    }
  }
}
