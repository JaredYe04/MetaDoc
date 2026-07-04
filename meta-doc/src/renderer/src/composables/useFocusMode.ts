import { ref } from 'vue'
import { getSetting, setSetting } from '../utils/settings.js'
import { repairModalPointerEvents } from '../utils/restore-body-pointer-events'

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

if (urlFocusMode === true) {
  repairModalPointerEvents(500)
}

if (urlFocusMode === null) {
  void getSetting(FOCUS_MODE_SETTING_KEY).then((v) => {
    if (typeof v === 'boolean') {
      isFocusMode.value = v
      if (v) repairModalPointerEvents(500)
    }
  })
}

export function setFocusModePersisted(value: boolean) {
  const was = isFocusMode.value
  isFocusMode.value = value
  void setSetting(FOCUS_MODE_SETTING_KEY, value)
  repairModalPointerEvents()
  repairModalPointerEvents(250)
  if (value === true && was === false) {
    void import('../services/steam-client').then((m) =>
      m.tryUnlockSteamAchievementByApi('ACH_FOCUS_MODE_ONCE')
    )
  }
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
    setFocusModePersisted(true)
  }
  const exitFocusMode = () => {
    isFocusMode.value = false
    repairModalPointerEvents()
    repairModalPointerEvents(250)
  }

  return { isFocusMode, toggleFocusMode, enterFocusMode, exitFocusMode, setFocusModePersisted }
}
