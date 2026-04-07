import { ref } from 'vue'

/**
 * 每个 BrowserWindow 各自一份 renderer 与模块状态，此处 ref 仅作用于当前窗口。
 * 勿用 localStorage 等跨窗口存储同步专注模式，避免多窗口互相牵连。
 */
const isFocusMode = ref(false)

export function useFocusMode() {
  const toggleFocusMode = () => {
    isFocusMode.value = !isFocusMode.value
  }
  const enterFocusMode = () => {
    isFocusMode.value = true
  }
  const exitFocusMode = () => {
    isFocusMode.value = false
  }

  return { isFocusMode, toggleFocusMode, enterFocusMode, exitFocusMode }
}
