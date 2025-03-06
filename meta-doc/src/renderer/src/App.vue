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
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Main from './views/Main.vue'


import eventBus from './utils/event-bus';
import { getSetting } from './utils/settings';
import { lightTheme, darkTheme, themeState } from './utils/themes';
import { current_ai_dialogs } from './utils/common-data';
const ipcRenderer = window.electron.ipcRenderer

// 获取当前路由信息
const route = useRoute()

// 根据路由的 meta 信息判断是否需要顶部菜单和侧边菜单
const requiresLayout = computed(() => route.meta.requiresLayout !== false)

onMounted(async () => {
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
  })


  // 触发一次主题同步事件
  eventBus.emit('sync-theme')
})


</script>

<style scoped>
/* App.vue 样式（可以为空） */
</style>
