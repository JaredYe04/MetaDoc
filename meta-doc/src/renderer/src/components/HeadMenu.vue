<template>
  <el-menu
    :class="['el-menu', { 'is-locked': isLocked }]"
    mode="horizontal"
    :menu-trigger="isLocked ? 'manual' : 'hover'"
    @select="handleSelect"
    style="position: absolute; top: 0; left: 0; right: 0;"
    :default-active="activeMenuIndex"
    :background-color="themeState.currentTheme.headerBackground"
    :text-color="themeState.currentTheme.textColor"
    :active-text-color="themeState.currentTheme.textColor2"
  >
    <el-menu-item>
      <el-tooltip :content="$t('headMenu.tooltip')" placement="right">
        <h1>{{ $t('headMenu.title') }}</h1>
      </el-tooltip>
    </el-menu-item>

    <el-menu-item index="/">{{ $t('headMenu.home') }}</el-menu-item>
    <el-menu-item index="/outline">{{ $t('headMenu.outline') }}</el-menu-item>
    <el-menu-item index="/editor">{{ $t('headMenu.editor') }}</el-menu-item>
    <el-menu-item index="/visualize">{{ $t('headMenu.visualize') }}</el-menu-item>
    <el-menu-item index="/agent">{{ $t('headMenu.agent') }}</el-menu-item>
    <el-menu-item index="/knowledge-base">{{ $t('headMenu.knowledgeBase') }}</el-menu-item>
    
  </el-menu>
</template>

<script setup>
import { defineComponent, ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import eventBus from '../utils/event-bus'
import { themeState } from '../utils/themes'
import { useActiveDocument } from '../composables/useActiveDocument'
import { useWorkspace } from '../stores/workspace'

// 获取路由实例
const router = useRouter()
const route = useRoute()




const activeMenuIndex = ref(route.path)
const { activeDocument } = useActiveDocument()
const currentFormat = computed(() => activeDocument.value?.format ?? 'md')
const workspace = useWorkspace()
const isLocked = computed(() => workspace.uiLocked?.value === true)

// 方法
const goHome = () => {
  router.push('/')
}

const handleSelect = (key) => {
  if (isLocked.value) return
  router.push(key)
}

// 生命周期钩子
onMounted(() => {
  eventBus.on('nav-to', path => {
    activeMenuIndex.value = path
    router.push(path)
  })
})

// 组件卸载前清除事件监听
onBeforeUnmount(() => {
  eventBus.off('nav-to')
})
</script>

<style scoped>
/* 自定义样式 */
.is-locked {
  cursor: not-allowed;
  opacity: 0.85;
}
.is-locked :deep(.el-menu-item) {
  pointer-events: none;
  cursor: not-allowed !important;
  opacity: 0.6;
}
.is-locked :deep(.el-sub-menu__title) {
  pointer-events: none;
  cursor: not-allowed !important;
  opacity: 0.6;
}
</style>
