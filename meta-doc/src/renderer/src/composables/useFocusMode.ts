import { ref } from 'vue'
import { getSetting, setSetting } from '../utils/settings.js'

const FOCUS_MODE_SETTING_KEY = 'focusMode'

/**
 * 首帧骨架屏 URL 带 `focus=1` 时与主进程 store 一致；无该参数时（如窗口池）再读设置。
 * 用户通过顶栏切换时写入 store，下次冷启动骨架屏与 Vue 初始状态对齐。
 */
function readFocusModeFromUrl(): boolean | null {
  try {
    const p = new URLSearchParams(window.location.search)
    if (!p.has('focus')) return null
    return p.get('focus') === '1'
  } catch {
    return null
  }
}

const urlFocusMode = readFocusModeFromUrl()
const isFocusMode = ref(urlFocusMode !== null ? urlFocusMode : false)

if (urlFocusMode === null) {
  void getSetting(FOCUS_MODE_SETTING_KEY).then((v) => {
    if (typeof v === 'boolean') {
      isFocusMode.value = v
    }
  })
}

export function setFocusModePersisted(value: boolean) {
  isFocusMode.value = value
  void setSetting(FOCUS_MODE_SETTING_KEY, value)
}

/** document 级拖放等非 setup 处读取当前是否专注模式 */
export function getFocusModeActive(): boolean {
  return isFocusMode.value
}

export function useFocusMode() {
  const toggleFocusMode = () => {
    setFocusModePersisted(!isFocusMode.value)
  }
  const enterFocusMode = () => {
    isFocusMode.value = true
  }
  const exitFocusMode = () => {
    isFocusMode.value = false
  }

  return { isFocusMode, toggleFocusMode, enterFocusMode, exitFocusMode, setFocusModePersisted }
}
