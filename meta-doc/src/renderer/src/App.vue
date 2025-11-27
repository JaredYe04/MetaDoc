<!-- App.vue -->
<template>
  <div :style="{
    backgroundColor: themeState.currentTheme.background,
    color: themeState.currentTheme.textColor,
    textColor: themeState.currentTheme.textColor,
  }">
    <!-- 布局仅在需要时显示 -->
    <Main v-if="requiresLayout" />
    <!-- 如果不需要布局，则直接渲染路由页面 -->
    <router-view v-else />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import Main from './views/Main.vue'

import eventBus, { getWindowType, initWindowType } from './utils/event-bus';
import { getRecentDocs, getSetting, initSettings } from './utils/settings';
import { lightTheme, darkTheme, themeState, customTheme } from './utils/themes';
import localIpcRenderer from './utils/web-adapter/local-ipc-renderer';
import { webMainCalls } from './utils/web-adapter/web-main-calls';
import { clearAiTasks } from './utils/ai_tasks';
import { useI18n } from 'vue-i18n';
import { createRendererLogger } from './utils/logger';
import { initMonacoEnvironment } from './utils/monaco-worker-config';
let ipcRenderer = null
const route = useRoute()
const { locale } = useI18n()
const logger = createRendererLogger('App', {
  windowTypeProvider: () => getWindowType()
});
if (window && window.electron) {
  ipcRenderer = window.electron.ipcRenderer
} else {
  webMainCalls();
  ipcRenderer = localIpcRenderer
  //todo 说明当前环境不是electron环境，需要另外适配
}
// 获取当前路由信息

// 根据路由的 meta 信息判断是否需要顶部菜单和侧边菜单
const requiresLayout = computed(() => route.meta.requiresLayout !== false)
const initialLoad = ref(true)

const autoOpenDoc = async () => {
  //首先要判断一下自己是哪个窗口，只有主窗口才需要自动打开文档
  const windowType = route.query.windowType;
  initWindowType(windowType);
  //console.log("当前窗口类型是：", windowType);
  if (windowType !== 'home') return; // 如果不是主窗口，则不执行自动打开文档



  const hash = window.location.hash; // e.g. "#/home?file=xxx.md"
  const [path, query] = hash.split('?');
  const queryParams = query ? Object.fromEntries(new URLSearchParams(query)) : {};
  const file = queryParams.file || '';
  // const params = new URLSearchParams(window.location.search);
  // console.log('当前查询参数:', params.toString());
  // const file = params.get('file');
  if (file) {
    // 如果有文件参数，直接打开该文件
    eventBus.emit('open-doc', file);
    initialLoad.value = false;
    return;
  }

  const enabled = (await getSetting('startupOption')) === 'lastFile'
  if (enabled) {
    const recentDocs = await getRecentDocs()

    if (recentDocs.length > 0 && initialLoad.value) {
      eventBus.emit('open-doc', recentDocs[0])
      initialLoad.value = false
    }
  }
}

onMounted(async () => {
  // 初始化 Monaco 环境（Worker 配置和 LaTeX 语言支持）
  initMonacoEnvironment()
  
  window.addEventListener('beforeunload', () => {
    clearAiTasks()
  })
  window.addEventListener('error', (e) => {
    // 提取详细的错误信息
    const errorInfo = {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      error: e.error,
      isTrusted: e.isTrusted,
      // 尝试从 error 对象中提取更多信息
      errorMessage: e.error?.message,
      errorStack: e.error?.stack,
      errorName: e.error?.name,
    };
    
    // 过滤掉一些无害的错误
    // 1. 资源加载失败（图片、字体等）
    if (e.message?.includes('Failed to load resource') || 
        e.message?.includes('net::ERR_')) {
      return; // 静默忽略资源加载错误
    }
    
    // 2. 跨域错误
    if (e.message?.includes('CORS') || 
        e.message?.includes('Cross-Origin')) {
      return; // 静默忽略跨域错误
    }
    
    // 3. 脚本加载错误（可能是外部资源）
    if (e.filename && !e.filename.includes(window.location.origin) && 
        !e.filename.startsWith('/') && !e.filename.startsWith('./')) {
      logger.debug('External script error (ignored)', errorInfo);
      return;
    }
    
    // 记录其他错误
    logger.error('Global error', errorInfo);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const errorInfo = {
      reason: e.reason,
      // 尝试提取更多信息
      errorMessage: e.reason?.message,
      errorStack: e.reason?.stack,
      errorName: e.reason?.name,
      toString: String(e.reason),
    };
    
    // 过滤 PDF.js 相关的错误（这些错误已经在组件中处理）
    if (e.reason?.name === 'ResponseException' || 
        e.reason?.name === 'MissingPDFException' ||
        (e.reason?.message && e.reason.message.includes('retrieving PDF'))) {
      logger.debug('PDF 加载错误（已在组件中处理）', errorInfo);
      return;
    }
    
    logger.error('Unhandled rejection', errorInfo);
  });
  // const windowType=route.query.windowType
  // initWindowType(windowType);
  await initSettings() // 初始化设置
  //监听语言切换事件
  eventBus.on('lang-changed', (lang) => {
    locale.value = lang
    localStorage.setItem('lang', lang)
  })
  // 监听主题同步事件
  eventBus.on('sync-theme', async () => {
    let theme = await getSetting('globalTheme')
    if (theme === 'sync') {
      theme = await ipcRenderer.invoke('get-os-theme')
    }
    if (theme === 'light') {
      themeState.currentTheme = lightTheme
      //给根元素html添加class light
      document.documentElement.classList.add('light')
      //如果有dark主题的class则移除
      document.documentElement.classList.remove('dark')
    }
    if (theme === 'dark') {
      themeState.currentTheme = darkTheme
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    }
    if (theme === 'custom') {
      //自定义主题
      const customThemeColor = await getSetting('customThemeColor')
      themeState.currentTheme = customTheme(customThemeColor)
      if (themeState.currentTheme.type === 'light') {
        document.documentElement.classList.add('light')
        document.documentElement.classList.remove('dark')
      } else {
        document.documentElement.classList.add('dark')
        document.documentElement.classList.remove('light')
      }
    }
    eventBus.emit('sync-editor-theme')//触发vditor主题同步事件
    autoOpenDoc() // 自动打开文档
  })
  // 触发一次主题同步事件
  eventBus.emit('sync-theme')
})


</script>

<style scoped>
/* App.vue 样式（可以为空） */
</style>
