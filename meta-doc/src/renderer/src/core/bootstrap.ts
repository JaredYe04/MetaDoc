import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'tdesign-vue-next/es/style/index.css'
import VueTree from '@ssthouse/vue3-tree-chart'
import '@ssthouse/vue3-tree-chart/dist/vue3-tree-chart.css'
import App from '../App.vue'
import router from '../router/router.js'
import { themeState, applyTheme, lightTheme, darkTheme } from '../utils/themes.js'
import { syncShadcnTheme } from '../utils/shadcn-theme-bridge.js'
import { initializeFormats } from '../utils/format-initializer'
import { i18n, preloadInitialLocales, setI18nLocale } from '../i18n.js'
import messageBridge from '../bridge/message-bridge'
import { initUserTemplatesStore } from '../stores/user-templates'
import AppIcon from '../components/common/AppIcon.vue'
import { getHost } from './host-runtime'
import { installViewSwitchListener } from '../view-api'
import { loadStartupPlugins } from './startup-plugins'
import './../assets/element-plus-theme-override.css'
import './../assets/fonts/fonts.css'
import './../assets/interactive-text.css'
import './../assets/wordcloud-text.css'
import './../assets/editor-search.css'
import { scheduleStartupPointerEventRepair } from '../utils/restore-body-pointer-events'

export async function bootstrapCore(): Promise<void> {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    themeState.currentTheme = darkTheme
  } else {
    themeState.currentTheme = lightTheme
  }
  syncShadcnTheme()

  initializeFormats()
  getHost()
  installViewSwitchListener()
  await loadStartupPlugins()

  const app = createApp(App)
  const pinia = createPinia()
  app.provide('themeState', themeState)
  app.use(ElementPlus)
  app.component('VueTree', VueTree)
  app.component('AppIcon', AppIcon)
  app.use(pinia)
  app.use(router)

  try {
    await applyTheme()
    syncShadcnTheme()
  } catch (e) {
    console.error('Apply theme before mount failed:', e)
  }

  try {
    const mainLang = await messageBridge.invoke('get-setting', { key: 'lang' })
    if (mainLang && typeof mainLang === 'string') {
      await setI18nLocale(mainLang)
    } else {
      await preloadInitialLocales()
    }
  } catch (e) {
    try {
      await preloadInitialLocales()
    } catch (e2) {
      console.error('Preload locale failed:', e2)
    }
  }

  try {
    await initUserTemplatesStore()
  } catch (e) {
    console.error('initUserTemplatesStore failed:', e)
  }

  app.use(i18n).mount('#app')

  const skeletonRoot = document.getElementById('metadoc-skeleton-root')
  skeletonRoot?.remove()

  scheduleStartupPointerEventRepair()

  const { initInputContextMenuHandler } = await import('../utils/input-context-menu-handler')
  const { initSelectionContextMenuHandler } = await import(
    '../utils/selection-context-menu-handler'
  )
  const { initServiceStatusWatcher } = await import('../utils/service-status')
  const { initializeWorkspaceBroadcastListeners } = await import('../stores/workspace')
  const { registerAllAdapters } = await import('../services/export-adapters')
  const { registerUnitTests } = await import('../utils/unit-tests-register.ts')

  initInputContextMenuHandler()
  initSelectionContextMenuHandler()
  initServiceStatusWatcher()
  initializeWorkspaceBroadcastListeners()
  void registerAllAdapters().catch((e) => console.error('registerAllAdapters failed:', e))
  registerUnitTests()
}
