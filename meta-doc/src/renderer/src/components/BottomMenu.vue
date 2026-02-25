<template>
  <div
    class="bottom-menu"
    :style="{
      background: themeState.currentTheme.background,
      color: themeState.currentTheme.textColor
    }"
  >
    <div class="status-group">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <span class="status-item status-version" @click.prevent="toggleVersionInfoPanel">
              <!-- {{ $t('bottomMenu.versionLabel') }}  -->
              {{ currentVersion }}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{{ $t('bottomMenu.versionTooltip') }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span class="status-divider">|</span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <span class="status-item status-llm-statistics" @click="showLlmStatisticsDialog = true">
              {{ $t('bottomMenu.llmStatistics') }}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{{ $t('llmStatistics.tooltip') }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span class="status-divider">|</span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <span class="status-item status-word-count" @click="showWordCountDialog = true">
              {{ $t('bottomMenu.wordCount') }} {{ wordCount }}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{{ $t('wordCountDialog.tooltip') }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span class="status-divider">|</span>
      <span class="status-item status-file">
        {{ $t('bottomMenu.currentFile')
        }}{{ currentFilePath ? currentFilePath : $t('bottomMenu.newFile') }}
      </span>
    </div>
    <WordCountDialog
      v-model="showWordCountDialog"
      :content="documentContent"
      :format="documentFormat"
    />
    <LlmStatisticsDialog v-model="showLlmStatisticsDialog" />
    <VersionInfoPanel />
    <GlobalProgressBar />
    <div class="actions-group">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <span class="status-item status-logger" @click.prevent="toggleLoggerConsole">
              <el-icon class="status-icon" size="14">
                <Document />
              </el-icon>
              <span class="status-text">{{ $t('bottomMenu.logConsoleLabel') }}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{{ $t('bottomMenu.logConsoleTooltip') }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span class="status-divider">|</span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <span
              class="status-item status-notification"
              :class="{ 'is-shaking': isShaking }"
              @click.prevent="toggleNotificationQueue"
            >
              <el-icon class="status-icon" size="14">
                <BellFilled />
              </el-icon>
              <span class="status-text">{{ notificationSummary }}</span>
              <span v-if="unreadCount > 0" class="status-badge" :style="badgeStyle">
                <span class="badge-icon">{{ badgeIcon }}</span>
                {{ unreadCount }}
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{{ notificationTooltip }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span class="status-divider">|</span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <span class="ai-task-menu" @click.prevent="eventBus.emit('toggle-ai-task-queue')">
              <img
                :src="themeState.currentTheme.AiLogo"
                alt="AI"
                :class="{ 'ai-logo-rotating': hasRunningCompletionTask }"
              />
              <span class="ai-task-label">{{ $t('bottomMenu.aiTaskQueueLabel') }}</span>
              <span v-if="tasks.length > 0" class="ai-task-count">{{ tasks.length }}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{{ $t('bottomMenu.aiTaskQueueTooltip') }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { BellFilled, Document } from '@element-plus/icons-vue'
import eventBus from '../utils/event-bus'
import { themeState } from '../utils/themes'
import { useNotificationStore } from '../stores/notification'
import { useWorkspace } from '../stores/workspace'
import { useAiTasks } from '../utils/ai_tasks'
import { getAppVersion } from '../utils/version'
import WordCountDialog from './WordCountDialog.vue'
import LlmStatisticsDialog from './LlmStatisticsDialog.vue'
import VersionInfoPanel from './VersionInfoPanel.vue'
import GlobalProgressBar from './GlobalProgressBar.vue'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@renderer/components/ui/tooltip'

const workspace = useWorkspace()
const { t } = useI18n()

const tasks = useAiTasks()

const activeDocument = computed(() => workspace.activeDocument.value)
const activeTab = computed(() => workspace.activeTab.value)

const wordCount = computed(() => {
  const doc = activeDocument.value
  if (!doc) return 0
  if (doc.format === 'tex') {
    return doc.tex?.trim().length ?? 0
  }
  return doc.markdown?.trim().length ?? 0
})

const currentFilePath = computed(() => activeDocument.value?.path ?? '')

const showWordCountDialog = ref(false)
const showLlmStatisticsDialog = ref(false)
const currentVersion = ref<string>('')

// 加载版本信息
const loadVersion = async (): Promise<void> => {
  try {
    currentVersion.value = await getAppVersion()
  } catch (error) {
    console.error('加载版本信息失败:', error)
    currentVersion.value = 'Unknown'
  }
}

function toggleVersionInfoPanel(): void {
  eventBus.emit('toggle-version-info-panel')
}

const documentContent = computed(() => {
  const doc = activeDocument.value
  if (!doc) return ''
  if (doc.format === 'tex') {
    return doc.tex ?? ''
  }
  return doc.markdown ?? ''
})

const documentFormat = computed(() => {
  const doc = activeDocument.value
  if (!doc) return 'md'
  return doc.format
})

const notificationStore = useNotificationStore()
const { latestNotification, unreadCount } = storeToRefs(notificationStore)
const notificationType = computed(() => latestNotification.value?.type ?? 'info')

// 检查是否有AI任务（简化：只要任务队列里有任务就旋转）
const hasRunningCompletionTask = computed(() => {
  return tasks.value.length > 0
})

// 辅助函数：调整颜色色相
function adjustHue(hexColor: string, hueShift: number): { bg: string; text: string } {
  // 将 hex 转为 RGB
  const r = parseInt(hexColor.slice(1, 3), 16) / 255
  const g = parseInt(hexColor.slice(3, 5), 16) / 255
  const b = parseInt(hexColor.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  // 调整色相
  h = (h * 360 + hueShift) % 360
  if (h < 0) h += 360

  // 保持较高的饱和度以保证颜色鲜艳
  const bgColor = `hsl(${Math.round(h)} 75% 50%)`

  // 根据背景亮度决定文字颜色
  // 计算原始颜色的亮度
  const luminance =
    0.299 * parseInt(hexColor.slice(1, 3), 16) +
    0.587 * parseInt(hexColor.slice(3, 5), 16) +
    0.114 * parseInt(hexColor.slice(5, 7), 16)
  const textColor = luminance > 128 ? '#000000' : '#ffffff'

  return { bg: bgColor, text: textColor }
}

// badge 颜色跟随主题，不同类型用主题色的不同变体
const badgeStyle = computed(() => {
  const theme = themeState.currentTheme
  const primaryColor = theme.primaryColor || '#000000'

  // 基于主题色相进行偏移
  switch (notificationType.value) {
    case 'success': {
      // 成功 - 偏向绿色 (hue + 40)
      const colors = adjustHue(primaryColor, 40)
      return { backgroundColor: colors.bg, color: colors.text }
    }
    case 'warning': {
      // 警告 - 偏向黄色 (hue - 60)
      const colors = adjustHue(primaryColor, -60)
      return { backgroundColor: colors.bg, color: colors.text }
    }
    case 'error': {
      // 错误 - 偏向红色 (hue - 120)
      const colors = adjustHue(primaryColor, -120)
      return { backgroundColor: colors.bg, color: colors.text }
    }
    default:
      // info - 使用主题主色
      return { backgroundColor: 'hsl(var(--primary))', color: themeState.currentTheme.textColor }
  }
})

// 获取类型图标
const badgeIcon = computed(() => {
  switch (notificationType.value) {
    case 'success':
      return '✓'
    case 'warning':
      return '!'
    case 'error':
      return '✕'
    default:
      return '•'
  }
})

const isShaking = ref(false)
let lastNotificationId: string | null = null

watch(
  () => latestNotification.value?.id,
  (currentId) => {
    if (!currentId || currentId === lastNotificationId) return
    lastNotificationId = currentId
    isShaking.value = true
    setTimeout(() => {
      isShaking.value = false
    }, 800)
  }
)

const notificationSummary = computed(() => {
  if (!latestNotification.value) {
    return t('bottomMenu.notificationEmpty')
  }
  return latestNotification.value.message
})

const notificationTooltip = computed(() => {
  if (!latestNotification.value) {
    return t('bottomMenu.notificationTooltip')
  }
  return `${latestNotification.value.title} - ${latestNotification.value.message}`
})

function toggleNotificationQueue(): void {
  eventBus.emit('toggle-notification-queue')
}

function toggleLoggerConsole(): void {
  eventBus.emit('toggle-logger-console')
}

// 组件挂载时加载版本信息
onMounted(() => {
  loadVersion()
})
</script>
<style scoped>
.bottom-menu {
  height: 30px;
  width: 100%;
  border: 1px solid #cccccc44;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 5%;
  font-size: 12px;
  box-sizing: border-box;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.status-group {
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
  flex: 1 1 auto;
  min-width: 0;
}

.status-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.status-file {
  max-width: 40vw;
}

.status-divider {
  opacity: 0.4;
  user-select: none;
}

.status-notification {
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  transition: background-color 0.2s ease;
  min-height: 24px;
  line-height: 1;
}

.status-notification:hover {
  background-color: rgba(0, 0, 0, 0.08);
}

.status-logger {
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  transition: background-color 0.2s ease;
}

.status-logger:hover {
  background-color: rgba(0, 0, 0, 0.08);
}

.status-word-count {
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  transition: background-color 0.2s ease;
}

.status-word-count:hover {
  background-color: rgba(0, 0, 0, 0.08);
}

.status-llm-statistics {
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  transition: background-color 0.2s ease;
}

.status-llm-statistics:hover {
  background-color: rgba(0, 0, 0, 0.08);
}

.status-version {
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  transition: background-color 0.2s ease;
}

.status-version:hover {
  background-color: rgba(0, 0, 0, 0.08);
}

.status-notification.is-shaking {
  animation: bottom-menu-shake 0.8s ease-in-out;
}

.status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.status-text {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1;
  display: inline-flex;
  align-items: center;
}

.status-badge {
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  font-size: 10px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0 4px;
  box-sizing: border-box;
  gap: 2px;
}

.badge-icon {
  font-size: 8px;
  font-weight: bold;
  opacity: 0.9;
}

.actions-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
  margin-left: 12px;
  flex-shrink: 0;
}

.ai-task-menu {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background-color 0.2s ease;
}

.ai-task-menu:hover {
  background-color: rgba(0, 0, 0, 0.08);
}

.ai-task-menu img {
  width: 18px;
  height: 18px;
}

.ai-logo-rotating {
  animation: ai-logo-rotate 2s linear infinite !important;
}

@keyframes ai-logo-rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.ai-task-label {
  font-weight: 500;
}

.ai-task-count {
  font-weight: 500;
}

@keyframes bottom-menu-shake {
  0% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-2px);
  }
  40% {
    transform: translateX(2px);
  }
  60% {
    transform: translateX(-1px);
  }
  80% {
    transform: translateX(1px);
  }
  100% {
    transform: translateX(0);
  }
}
.status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.status-text {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1;
  display: inline-flex;
  align-items: center;
}

.status-badge {
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  font-size: 10px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
  padding: 0 4px;
  box-sizing: border-box;
}

.actions-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
  margin-left: 12px;
  flex-shrink: 0;
}

.ai-task-menu {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background-color 0.2s ease;
}

.ai-task-menu:hover {
  background-color: rgba(0, 0, 0, 0.08);
}

.ai-task-menu img {
  width: 18px;
  height: 18px;
}

.ai-task-label {
  font-weight: 500;
}

.ai-task-count {
  font-weight: 500;
}
</style>
