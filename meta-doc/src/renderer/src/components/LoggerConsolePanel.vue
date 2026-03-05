<template>
  <ResizablePanel
    ref="panelRef"
    :visible="visible"
    :initial-width="560"
    :initial-height="320"
    :min-width="360"
    :min-height="220"
    :max-width="maxWidth"
    :max-height="maxHeight"
    :background-color="themeState.currentTheme.background"
    :position="props.mode === 'demo' ? 'relative' : 'fixed'"
    :bottom="props.mode === 'demo' ? undefined : 30"
    :right="props.mode === 'demo' ? undefined : 16"
    :enable-top-resize="props.mode !== 'demo'"
    :enable-left-resize="props.mode !== 'demo'"
    :content-padding="10"
    :class="{ 'demo-mode': props.mode === 'demo' }"
  >
    <div
      class="logger-console-wrapper"
      :class="{ 'demo-mode': props.mode === 'demo' }"
      :style="wrapperStyle"
    >
      <div class="logger-console-header">
        <h3>{{ t('setting.loggerConsoleTitle') }}</h3>
        <Button
          size="sm"
          variant="ghost"
          class="text-red-500 hover:text-red-600"
          @click="closePanel"
        >
          {{ t('common.close') }}
        </Button>
      </div>
      <div class="logger-filter">
        <div class="relative">
          <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            v-model="filterText"
            :placeholder="t('setting.loggingFilterPlaceholder')"
            class="pl-9 w-full"
            @input="handleFilterChange"
          />
        </div>
      </div>
      <ConsoleOutput console-key="logger" :history="filteredLogHistory" :mode="props.mode" />
    </div>
  </ResizablePanel>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import ResizablePanel from './base/ResizablePanel.vue'
import ConsoleOutput from './ConsoleOutput.vue'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import eventBus from '../utils/event-bus'
import { themeState } from '../utils/themes'
import { fetchLoggerHistory } from '../utils/logger.ts'
import type { LoggerHistoryEntry } from '../utils/logger.ts'
import { settings, setSetting } from '../utils/settings.js'

const { t } = useI18n()

const props = defineProps({
  mode: {
    type: String,
    default: 'normal',
    validator: (value) => ['normal', 'demo'].includes(value)
  }
})

const visible = ref(props.mode === 'demo' ? true : false)
const panelRef = ref<InstanceType<typeof ResizablePanel> | null>(null)
const logHistory = ref<LoggerHistoryEntry[]>([])
const filterText = ref(settings.loggingFilter || '')

/**
 * 从日志内容中提取 scope 信息
 * 日志格式: HH:mm:ss [LEVEL] [PROCESS][windowType?][scope] content
 * 例如: "12:00:00 [INFO] [MAIN][Logger] message"
 * 或: "12:00:00 [ERROR] [RENDERER][main][ai-graph][WorkflowTool] message"
 */
const extractScopeFromLog = (content: string): string | undefined => {
  const bracketMatches = content.match(/\[([^\]]+)\]/g)
  if (!bracketMatches || bracketMatches.length < 2) {
    return undefined
  }

  const parts = bracketMatches.map((p) => p.slice(1, -1))
  // 新格式：第一个是 LEVEL，第二个是 PROCESS (MAIN/RENDERER)，之后是 windowType 或 scope
  const levelProcess = 2
  if (parts.length <= levelProcess) {
    return undefined
  }
  const rest = parts.slice(levelProcess)
  const commonWindowTypes = ['main', 'renderer', 'agent', 'settings']
  const scopes = rest.filter((p) => {
    if (p.includes('][')) return true
    if (p.includes('-')) return true
    if (!commonWindowTypes.includes(p.toLowerCase())) return true
    return false
  })
  if (scopes.length === 0) {
    return rest[rest.length - 1]
  }
  if (scopes.length === 1) {
    return scopes[0]
  }
  return scopes.join('][')
}

/**
 * 检查日志内容是否匹配过滤条件（大小写不敏感）
 */
const matchesLogFilter = (content: string, filter: string): boolean => {
  if (!filter || !filter.trim()) {
    return true
  }
  const filterLower = filter.trim().toLowerCase()
  const scope = extractScopeFromLog(content)
  if (!scope) {
    return false // 无法提取scope，不匹配
  }
  const scopeLower = scope.toLowerCase()
  // 完整匹配
  if (scopeLower === filterLower) {
    return true
  }
  // 前缀匹配或包含匹配
  if (scopeLower.includes(`[${filterLower}]`) || scopeLower.startsWith(filterLower)) {
    return true
  }
  return false
}

/**
 * 过滤后的日志历史
 */
const filteredLogHistory = computed(() => {
  if (!filterText.value || !filterText.value.trim()) {
    return logHistory.value
  }
  return logHistory.value.filter((entry) => matchesLogFilter(entry.content, filterText.value))
})

const maxWidth = computed(() => Math.floor(window.innerWidth * 0.6))
const maxHeight = computed(() => Math.floor(window.innerHeight * 0.7))

const wrapperStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  background: themeState.currentTheme.background
}))

function toggleVisibility() {
  visible.value = !visible.value
  if (visible.value) {
    eventBus.emit('close-notification-queue')
    eventBus.emit('close-ai-task-queue')
  }
}

function closePanel() {
  visible.value = false
}

function handleFilterChange() {
  setSetting('loggingFilter', filterText.value)
}

// 处理点击外部区域关闭面板
function handleClickOutside(event: MouseEvent) {
  if (!visible.value) return

  const target = event.target as HTMLElement

  // 获取面板DOM元素
  const panelElement = panelRef.value?.$el as HTMLElement | undefined

  // 如果点击的是面板内部，不关闭
  if (panelElement && panelElement.contains(target)) {
    return
  }

  // 如果点击的是BottomMenu中的按钮，不关闭（让toggle处理）
  const bottomMenu = target.closest('.bottom-menu')
  if (bottomMenu) {
    const isToggleButton = target.closest('.status-logger, .status-notification, .ai-task-menu')
    if (isToggleButton) {
      return // 让toggle事件处理
    }
  }

  // 点击外部区域，关闭面板
  closePanel()
}

// 监听settings变化，同步filterText
watch(
  () => settings.loggingFilter,
  (newFilter) => {
    if (filterText.value !== newFilter) {
      filterText.value = newFilter || ''
    }
  }
)

// 监听visible变化，添加/移除点击外部区域监听器
watch(visible, (isVisible) => {
  if (isVisible) {
    // 使用nextTick确保DOM已更新
    nextTick(() => {
      document.addEventListener('click', handleClickOutside, true)
    })
  } else {
    document.removeEventListener('click', handleClickOutside, true)
  }
})

onMounted(() => {
  fetchLoggerHistory().then((history) => {
    logHistory.value = history
  })
  eventBus.on('toggle-logger-console', toggleVisibility)
  eventBus.on('close-logger-console', closePanel)
})

onBeforeUnmount(() => {
  eventBus.off('toggle-logger-console', toggleVisibility)
  eventBus.off('close-logger-console', closePanel)
  document.removeEventListener('click', handleClickOutside, true)
})
</script>

<style scoped>
.logger-console-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 12px;
  overflow: hidden;
}

.logger-console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--queue-border-color, rgba(0, 0, 0, 0.08));
  padding-bottom: 6px;
  flex-shrink: 0;
}

.logger-filter {
  flex-shrink: 0;
  margin-bottom: 8px;
}

.logger-console-header h3 {
  margin: 0;
  font-size: 16px;
}

/* 确保 Console 组件不会超出容器 */
.logger-console-wrapper :deep(.console-container) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.logger-console-wrapper :deep(.console-body) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  user-select: text !important;
  -webkit-user-select: text !important;
  -moz-user-select: text !important;
  -ms-user-select: text !important;
}

/* Demo 模式：在手册中展示时需要固定高度 */
.logger-console-wrapper.demo-mode {
  min-height: 300px;
  height: 300px;
}
</style>
