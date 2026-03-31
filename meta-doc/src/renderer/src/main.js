// import './assets/main.css'

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

// mxgraph 初始化：必须在所有其他模块导入之前执行
// 确保在导入任何 mxgraph 相关代码之前，全局变量已设置
import './utils/mxgraph-init.js'
__startupMark('renderer_script_start')
__startupMark('after_mxgraph_init')

// shadcn-vue CSS (Tailwind base + CSS variables)
// Must be imported before component libraries to allow overriding
import './styles/shadcn.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import router from './router/router.js'
// 引入组件库的少量全局样式变量
import 'tdesign-vue-next/es/style/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import VueTree from '@ssthouse/vue3-tree-chart'
import '@ssthouse/vue3-tree-chart/dist/vue3-tree-chart.css'
import './assets/fonts/fonts.css'
import './assets/interactive-text.css'
import './assets/wordcloud-text.css'
import './assets/editor-search.css'
import { initInputContextMenuHandler } from './utils/input-context-menu-handler'
import { themeState, applyTheme, lightTheme, darkTheme } from './utils/themes.js'
import { syncShadcnTheme } from './utils/shadcn-theme-bridge.js'
import { initServiceStatusWatcher } from './utils/service-status'
import { i18n } from './i18n.js'
import { initializeAgentTools } from './utils/agent-tools'
import { initializeWorkspaceBroadcastListeners } from './stores/workspace'
import { registerAllAdapters } from './services/export-adapters'
import { registerUnitTests } from './utils/unit-tests-register.ts'
import { initializeFormats } from './utils/format-initializer'
import AppIcon from './components/common/AppIcon.vue'
__startupMark('after_vue_imports')

import 'element-plus/theme-chalk/dark/css-vars.css'
/* Element Plus 极简主题覆盖（主色由蓝改为炭灰等） */
import './assets/element-plus-theme-override.css'

// 首帧骨架屏已通过 URL 参数设置 theme 与主题色；此处先按 document class 给 themeState 临时值，挂载前再拉取完整主题
if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
  themeState.currentTheme = darkTheme
} else {
  themeState.currentTheme = lightTheme
}
syncShadcnTheme()

// 统一 Monaco 编辑器字体：包装 monaco.editor.create，使所有实例使用「设置 - 编辑器字体」
import './utils/monaco-editor-font.js'

__startupMark('before_create_app')
const app = createApp(App)
const pinia = createPinia()

// 仅保留首帧必需：格式注册（其他模块可能首屏就用）
initializeFormats()

// 使用从 themes.js 导入的 themeState，而不是创建新的
app.provide('themeState', themeState) // 全局提供 themeState 主题状态

app.use(ElementPlus)
app.component('VueTree', VueTree)
app.component('AppIcon', AppIcon)
app.use(pinia)
app.use(router)

// 挂载前先拉取并应用完整主题（设置中的 globalTheme/customThemeColor 等），保证程序一加载出来就是用户设置的主题，无默认再切换的闪烁
;(async function () {
  try {
    await applyTheme()
    syncShadcnTheme()
  } catch (e) {
    console.error('Apply theme before mount failed:', e)
  }
  app.use(i18n).mount('#app')
  __startupMark('after_mount')

  // 挂载后再跑非关键初始化
  function runAfterMount() {
    initInputContextMenuHandler()
    initServiceStatusWatcher()
    registerAllAdapters()
    initializeAgentTools()
    initializeWorkspaceBroadcastListeners()
    registerUnitTests()
  }
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(runAfterMount, { timeout: 3000 })
  } else {
    setTimeout(runAfterMount, 0)
  }

  const registerIcons = () => {
    for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
      app.component(key, component)
    }
  }
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(registerIcons, { timeout: 2000 })
  } else {
    setTimeout(registerIcons, 0)
  }
})()

// 主题已在挂载前应用，此处不再重复调用
