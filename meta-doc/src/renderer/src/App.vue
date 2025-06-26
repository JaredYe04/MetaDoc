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
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Main from './views/Main.vue'

import eventBus, { initWindowType } from './utils/event-bus';
import { getRecentDocs, getSetting, initSettings } from './utils/settings';
import { lightTheme, darkTheme, themeState } from './utils/themes';
import { current_ai_dialogs, firstLoad } from './utils/common-data';
import localIpcRenderer from './utils/web-adapter/local-ipc-renderer';
import { webMainCalls } from './utils/web-adapter/web-main-calls';
import { clearAiTasks } from './utils/ai_tasks';
let ipcRenderer = null
const route = useRoute()
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
    return;
  }

  const enabled = (await getSetting('startupOption')) === 'lastFile'
  if (enabled) {
    const recentDocs = await getRecentDocs()

    if (recentDocs.length > 0
      && firstLoad.value

    ) {
      eventBus.emit('open-doc', recentDocs[0])
      firstLoad.value = false
    }
  }
}

onMounted(async () => {
  window.addEventListener('beforeunload', () => {
    clearAiTasks()
  })
  // const windowType=route.query.windowType
  // initWindowType(windowType);
  await initSettings() // 初始化设置
  // 监听主题同步事件
  eventBus.on('sync-theme', async () => {
    let theme = await getSetting('theme')
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
    eventBus.emit('sync-vditor-theme')//触发vditor主题同步事件
    autoOpenDoc() // 自动打开文档
  })


  // 触发一次主题同步事件
  eventBus.emit('sync-theme')
})

</script>

<style scoped>
/* App.vue 样式（可以为空） */
</style>
