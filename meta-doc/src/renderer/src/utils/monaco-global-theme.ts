/**
 * 全局 Monaco 主题控制：全应用只使用 vs / vs-dark，不随应用主题色变化。
 * 在 sync-editor-theme 后用 nextTick 再次设置，覆盖各组件内的 defineTheme/setTheme。
 */
import * as monaco from 'monaco-editor'
import { nextTick } from 'vue'
import eventBus from './event-bus'
import { themeState } from './themes'

function applyMonacoGlobalTheme(): void {
  const themeName = themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs'
  monaco.editor.setTheme(themeName)
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
