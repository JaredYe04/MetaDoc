<template>
  <el-menu
    :class="['modern-top-menu', { 'is-locked': isLocked }]"
    mode="horizontal"
    :menu-trigger="isLocked ? 'manual' : 'hover'"
    @select="handleSelect"
    :default-active="activeMenuIndex"
    :background-color="themeState.currentTheme.headerBackground"
    :text-color="themeState.currentTheme.textColor"
    :active-text-color="themeState.currentTheme.textColor2"
  >
    <el-menu-item>
      <el-tooltip :content="appVersion" placement="bottom" :disabled="!appVersion">
        <h1>{{ $t('headMenu.title') }}</h1>
      </el-tooltip>
    </el-menu-item>

    <el-menu-item index="/">{{ $t('headMenu.home') }}</el-menu-item>
    <el-menu-item index="/outline">{{ $t('headMenu.outline') }}</el-menu-item>
    <el-menu-item index="/editor">{{ $t('headMenu.editor') }}</el-menu-item>
    <el-menu-item index="/visualize">{{ $t('headMenu.visualize') }}</el-menu-item>
    <el-menu-item index="/agent">{{ $t('headMenu.agent') }}</el-menu-item>
    <el-menu-item 
      index="/knowledge-base"
      :disabled="!knowledgeBaseEnabled"
    >
      {{ $t('headMenu.knowledgeBase') }}
    </el-menu-item>
    <el-menu-item index="/proofread" v-if="activeDocument">{{ $t('headMenu.proofread') }}</el-menu-item>
    <el-menu-item v-if="isDev" index="/debug">{{ $t('setting.debug.title') }}</el-menu-item>
    
  </el-menu>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import eventBus from '../utils/event-bus'
import { mixColors, themeState } from '../utils/themes'
import { useActiveDocument } from '../composables/useActiveDocument'
import { useWorkspace } from '../stores/workspace'
import { isDevEnvironment } from '../utils/dev-env'
import { getAppVersion } from '../utils/version'

// 获取路由实例
const router = useRouter()
const route = useRoute()

const activeMenuIndex = ref<string>(route.path)
const { activeDocument } = useActiveDocument()
const currentFormat = computed(() => activeDocument.value?.format ?? 'md')
const workspace = useWorkspace()
const isLocked = computed(() => workspace.uiLocked?.value === true)
const isDev = ref<boolean>(false)
const appVersion = ref<string>('')
const knowledgeBaseEnabled = ref<boolean>(true)

// 计算选中状态的背景色（使用辅助背景色）
const activeBackgroundColor = computed(() => mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.textColor, 0.3))
const activeTextColor = computed(() => themeState.currentTheme.textColor)

// 方法
const goHome = (): void => {
  router.push('/')
}

const handleSelect = (key: string): void => {
  if (isLocked.value) return
  router.push(key)
}

// 检查知识库总开关状态
const checkKnowledgeBaseEnabled = async () => {
  const { getSetting } = await import('../utils/settings.js')
  const enabled = await getSetting('enableKnowledgeBase') || false
  return enabled
}

// 生命周期钩子
onMounted(async (): Promise<void> => {
  eventBus.on('nav-to', (path: unknown) => {
    if (typeof path === 'string') {
      activeMenuIndex.value = path
      router.push(path)
    }
  })
  
  // 监听知识库总开关变化
  eventBus.on('knowledge-base-toggle', async (data: { enabled: boolean }) => {
    knowledgeBaseEnabled.value = data.enabled
    if (!data.enabled) {
      // 如果总开关被关闭，且当前在知识库页面，则切换到首页
      if (route.path === '/knowledge-base') {
        router.push('/')
      }
    }
  })
  
  // 检查是否为开发环境
  isDev.value = await isDevEnvironment()
  // 获取应用版本号
  appVersion.value = await getAppVersion()
  
  // 初始化时检查知识库开关状态
  const kbEnabled = await checkKnowledgeBaseEnabled()
  knowledgeBaseEnabled.value = kbEnabled
  if (!kbEnabled && route.path === '/knowledge-base') {
    router.push('/')
  }
})

// 监听知识库开关变化
watch(
  () => route.path,
  async () => {
    const kbEnabled = await checkKnowledgeBaseEnabled()
    knowledgeBaseEnabled.value = kbEnabled
    if (!kbEnabled && route.path === '/knowledge-base') {
      router.push('/')
    }
  }
)

// 组件卸载前清除事件监听
onBeforeUnmount((): void => {
  eventBus.off('nav-to')
})
</script>

<style scoped>
/* 现代桌面应用风格的顶部菜单 */
.modern-top-menu {
  height: 40px;
  line-height: 40px;
  border-bottom: 1px solid var(--el-border-color-lighter, #f0f0f0);
  padding: 0 8px;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.modern-top-menu :deep(.el-menu-item) {
  height: 36px;
  line-height: 36px;
  margin: 2px 4px;
  padding: 0 16px;
  border-radius: 6px;
  transition: all 0.2s ease;
  font-size: 13px;
}

.modern-top-menu :deep(.el-menu-item:hover) {
  background-color: var(--el-menu-hover-bg-color, rgba(0, 0, 0, 0.06)) !important;
  border-radius: 6px;
}

.modern-top-menu :deep(.el-menu-item.is-active) {
  background-color: v-bind('activeBackgroundColor') !important;
  border-radius: 6px;
  border-color: v-bind('activeBackgroundColor') !important;
  color: v-bind('activeTextColor') !important;
}

/* 标题样式 */
.modern-top-menu :deep(.el-menu-item:first-child h1) {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 36px;
}

/* 锁定状态 */
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
