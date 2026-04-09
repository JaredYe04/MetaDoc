/**
 * 全局 Monaco 主题控制：全应用只使用 vs / vs-dark，不随应用主题色变化。
 * 在 sync-editor-theme 后用 nextTick 再次设置，覆盖各组件内的 defineTheme/setTheme。
 *
 * 保存流程中不调用 setTheme，且 setTheme 包 try/catch，避免 Monaco 内部异常导致整进程卡死。
 */
import * as monaco from 'monaco-editor'
import { nextTick } from 'vue'
import eventBus from '../event-bus'
import { themeState } from '../themes'
import { isSaveInProgress } from '../common/save-guard'

function applyMonacoGlobalTheme(): void {
  if (isSaveInProgress.value) return
  const themeName = themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs'
  try {
    monaco.editor.setTheme(themeName)
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[monaco-global-theme] setTheme 失败', e)
  }
}

/**
 * 应在应用启动时调用一次（如 App.vue onMounted，在 initMonacoEnvironment 之后）。
 */
export function initMonacoGlobalTheme(): void {
  applyMonacoGlobalTheme()

  eventBus.on('sync-editor-theme', () => {
    nextTick(() => {
      applyMonacoGlobalTheme()
    })
  })
}
