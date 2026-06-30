// 启动耗时打点（ENABLE_STARTUP_PROFILE=1 时生效，由 preload 注入 window.api.startupProfileEnabled）
const __startupProfileEnabled = typeof window !== 'undefined' && window.api?.startupProfileEnabled
function __startupMark(phase) {
  if (!__startupProfileEnabled) return
  if (!window.__startupTimings__) {
    window.__startupT0 = performance.now()
    window.__startupTimings__ = []
  }
  window.__startupTimings__.push({
    phase,
    deltaMs: Math.round(performance.now() - window.__startupT0)
  })
}

import './utils/mxgraph-init.js'
__startupMark('renderer_script_start')
__startupMark('after_mxgraph_init')

import './styles/shadcn.css'
import './utils/monaco-editor-font.js'

__startupMark('before_bootstrap')

import { bootstrapCore } from './core/bootstrap'
import { installE2EHooks } from './core/e2e-hooks'
import {
  loadAiRuntime,
  registerAiRuntimeToggleListener,
  syncAiRuntimeWithSettings
} from './ai-runtime/loader'

registerAiRuntimeToggleListener()
;(async () => {
  await bootstrapCore()
  __startupMark('after_mount')
  installE2EHooks()

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(
      () => {
        void syncAiRuntimeWithSettings()
      },
      { timeout: 3000 }
    )
  } else {
    setTimeout(() => void syncAiRuntimeWithSettings(), 0)
  }
})()

export { loadAiRuntime, syncAiRuntimeWithSettings }
