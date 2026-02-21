// import './assets/main.css'

// mxgraph 初始化：必须在所有其他模块导入之前执行
// 确保在导入任何 mxgraph 相关代码之前，全局变量已设置
import './utils/mxgraph-init.js'

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
import { themeState, applyTheme } from './utils/themes.js'
import { syncShadcnTheme } from './utils/shadcn-theme-bridge.js'
import { initServiceStatusWatcher } from './utils/service-status'
import { i18n } from './i18n.js'
import { initializeAgentTools } from './utils/agent-tools'
import { initializeWorkspaceBroadcastListeners } from './stores/workspace'
import { registerAllAdapters } from './services/export-adapters'
import { registerUnitTests } from './utils/unit-tests-register.ts'
import { initializeFormats } from './utils/format-initializer'

import 'element-plus/theme-chalk/dark/css-vars.css'
/* Element Plus 极简主题覆盖（主色由蓝改为炭灰等） */
import './assets/element-plus-theme-override.css'

// 在挂载 Vue app 之前初始化主题（从持久化存储加载）
await applyTheme()
syncShadcnTheme()

// 尽早注册输入框右键菜单监听器，确保优先于其他 contextmenu 处理
initInputContextMenuHandler()

const app = createApp(App)
const pinia = createPinia()

initServiceStatusWatcher()

// 初始化格式注册系统（必须在其他模块使用格式之前）
initializeFormats()

// 注册导出适配器（异步执行，不阻塞）
registerAllAdapters()

// 初始化Agent Tools（异步执行，不阻塞）
initializeAgentTools()

// 初始化Workspace的跨窗口事件监听器（异步执行，不阻塞）
initializeWorkspaceBroadcastListeners()

// 注册单元测试（异步执行，不阻塞）
registerUnitTests()

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 使用从 themes.js 导入的 themeState，而不是创建新的
app.provide('themeState', themeState) // 全局提供 themeState 主题状态

app.use(ElementPlus)
app.component('VueTree', VueTree)
app.use(pinia)
app.use(router)

app.use(i18n).mount('#app')
