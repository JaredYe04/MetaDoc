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
      <LoggerConsoleContent
        ref="loggerContentRef"
        :title="t('setting.loggerConsoleTitle')"
        :filter-text="filterText"
        :filter-placeholder="t('setting.loggingFilterPlaceholder')"
        :filter-level="filterLevel"
        :history="filteredLogHistory"
        @update:filter-text="onFilterTextChange"
        @update:filter-level="filterLevel = $event as LogLevel"
        @clear="clearLogs"
        @save="saveLogs"
      >
        <template #extra-actions>
          <Button
            size="sm"
            variant="ghost"
            class="text-red-500 hover:text-red-600"
            @click="closePanel"
          >
            {{ t('common.close') }}
          </Button>
        </template>
      </LoggerConsoleContent>
    </div>
  </ResizablePanel>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import ResizablePanel from './base/ResizablePanel.vue'
import LoggerConsoleContent from './LoggerConsoleContent.vue'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import eventBus from '../utils/event-bus'
import messageBridge from '../bridge/message-bridge'
import { themeState } from '../utils/themes'
import { fetchLoggerHistory, getRendererLoggerConfig } from '../utils/logger.ts'
import type { LoggerHistoryEntry } from '../utils/logger.ts'
import { settings, setSetting } from '../utils/settings.js'
import { LOG_LEVEL_PRIORITY } from '../../../common/logger-constants'
import type { LogLevel } from '../../../common/logger-constants'

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
const filterLevel = ref<LogLevel>('info')
const loggerContentRef = ref<InstanceType<typeof LoggerConsoleContent> | null>(null)

const onLoggerConfigUpdated = (_event: unknown, config: { level?: LogLevel }) => {
  if (config?.level) filterLevel.value = config.level
}

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

const entryLevelPriority = (type: LoggerHistoryEntry['type']): number => {
  const map: Record<LoggerHistoryEntry['type'], number> = {
    debug: 0,
    out: 1,
    warn: 2,
    err: 3
  }
  return map[type] ?? 1
}

/**
 * 过滤后的日志历史（scope + 日志等级）
 */
const filteredLogHistory = computed(() => {
  let result = logHistory.value
  if (filterText.value?.trim()) {
    result = result.filter((entry) => matchesLogFilter(entry.content, filterText.value))
  }
  const minLevel = LOG_LEVEL_PRIORITY[filterLevel.value] ?? 1
  result = result.filter((entry) => entryLevelPriority(entry.type) >= minLevel)
  return result
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

function onFilterTextChange(v: string) {
  filterText.value = v
  setSetting('loggingFilter', v)
}

function renderLogsToTerminal() {
  loggerContentRef.value?.renderLogs?.()
}

function clearLogs() {
  loggerContentRef.value?.clear?.()
}

async function saveLogs() {
  const text = loggerContentRef.value?.getFullBufferText?.() || ''
  if (!text) return
  try {
    if (!messageBridge.getIpc()) {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'logger-output.log'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      eventBus.emit('show-success', t('console.logSaved'))
      return
    }
    const result = (await messageBridge.invoke('save-file-dialog', {
      defaultName: 'logger-output.log',
      filters: [
        { name: 'Log Files', extensions: ['log', 'txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })) as { canceled?: boolean; filePath?: string }
    if (result.canceled || !result.filePath) return
    await messageBridge.invoke('write-file-content', {
      filePath: result.filePath,
      content: text,
      encoding: 'utf8'
    })
    eventBus.emit('show-success', t('console.logSaved'))
  } catch (e) {
    console.error('Save logs failed:', e)
    eventBus.emit('show-error', t('console.logSaveFailed') || '保存日志失败')
  }
}

// 处理点击外部区域关闭面板
function handleClickOutside(event: MouseEvent) {
  if (!visible.value) return

  const target = event.target as HTMLElement

  // 如果点击的是日志等级 Dropdown 内部（通过 Portal 渲染在 body 下），不关闭
  if (target.closest('.logger-level-dropdown')) {
    return
  }

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

watch(filteredLogHistory, renderLogsToTerminal, { deep: true })

watch(visible, (v) => {
  if (v) nextTick(renderLogsToTerminal)
})

onMounted(async () => {
  try {
    const config = await getRendererLoggerConfig()
    filterLevel.value = config.level
  } catch (_) {}
  fetchLoggerHistory().then((history) => {
    logHistory.value = history
    renderLogsToTerminal()
  })
  eventBus.on('toggle-logger-console', toggleVisibility)
  eventBus.on('close-logger-console', closePanel)
  messageBridge.on('logger-config-updated', onLoggerConfigUpdated)
})

onBeforeUnmount(() => {
  eventBus.off('toggle-logger-console', toggleVisibility)
  eventBus.off('close-logger-console', closePanel)
  messageBridge.removeListener('logger-config-updated', onLoggerConfigUpdated)
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


/* Demo 模式：在手册中展示时需要固定高度 */
.logger-console-wrapper.demo-mode {
  min-height: 300px;
  height: 300px;
}
</style>
