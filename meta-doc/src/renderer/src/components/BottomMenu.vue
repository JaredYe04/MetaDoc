<template>
  <div
    class="bottom-menu"
    :style="{
      background: themeState.currentTheme.background,
      color: themeState.currentTheme.textColor
    }"
  >
    <div class="status-group">
      <el-tooltip :content="$t('llmStatistics.tooltip')" placement="top">
        <span
          class="status-item status-llm-statistics"
          @click="showLlmStatisticsDialog = true"
        >
          {{ $t('bottomMenu.llmStatistics') }}
        </span>
      </el-tooltip>
      <span class="status-divider">|</span>
      <el-tooltip :content="$t('wordCountDialog.tooltip')" placement="top">
        <span
          class="status-item status-word-count"
          @click="showWordCountDialog = true"
        >
          {{ $t('bottomMenu.wordCount') }} {{ wordCount }}
        </span>
      </el-tooltip>
      <span class="status-divider">|</span>
      <span class="status-item status-file">
        {{ $t('bottomMenu.currentFile') }}{{ currentFilePath ? currentFilePath : $t('bottomMenu.newFile') }}
      </span>
      

    </div>
    <WordCountDialog
      v-model="showWordCountDialog"
      :content="documentContent"
      :format="documentFormat"
    />
    <LlmStatisticsDialog
      v-model="showLlmStatisticsDialog"
    />
    <div class="actions-group">
        <el-tooltip :content="$t('bottomMenu.logConsoleTooltip')" placement="top">
        <span class="status-item status-logger" @click.prevent="toggleLoggerConsole">
          <el-icon class="status-icon" size="14">
            <Document />
          </el-icon>
          <span class="status-text">{{ $t('bottomMenu.logConsoleLabel') }}</span>
        </span>
      </el-tooltip>
      <span class="status-divider">|</span>
        <el-tooltip :content="notificationTooltip" placement="top">
        <span
          class="status-item status-notification"
          :class="{ 'is-shaking': isShaking }"
          @click.prevent="toggleNotificationQueue"
        >
          <el-icon class="status-icon" size="14">
            <BellFilled />
          </el-icon>
          <span class="status-text">{{ notificationSummary }}</span>
          <span
            v-if="unreadCount > 0"
            class="status-badge"
            :style="{ backgroundColor: badgeColor }"
          >
            {{ unreadCount }}
          </span>
        </span>
      </el-tooltip>
      <span class="status-divider">|</span>
      <el-tooltip :content="$t('bottomMenu.aiTaskQueueTooltip')" placement="top">
        <span class="ai-task-menu" @click.prevent="eventBus.emit('toggle-ai-task-queue')">
          <img 
            :src="themeState.currentTheme.AiLogo" 
            alt="AI" 
            :class="{ 'ai-logo-rotating': hasRunningCompletionTask }"
          />
          <span class="ai-task-label">{{ $t('bottomMenu.aiTaskQueueLabel') }}</span>
          <span v-if="tasks.length > 0" class="ai-task-count">{{ tasks.length }}</span>
        </span>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import eventBus from '../utils/event-bus'
import { themeState } from '../utils/themes'
import { useNotificationStack, initializeNotificationListeners } from '../utils/notifications'
import { useWorkspace } from '../stores/workspace'
import WordCountDialog from './WordCountDialog.vue'
import LlmStatisticsDialog from './LlmStatisticsDialog.vue'

const workspace = useWorkspace()

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

import { useI18n } from 'vue-i18n'
import { BellFilled, Document } from '@element-plus/icons-vue'
import { useAiTasks } from '../utils/ai_tasks'

const { t } = useI18n()
initializeNotificationListeners(t)
const tasks = useAiTasks()

const { latestNotification, unreadCount } = useNotificationStack()
const notificationType = computed(() => latestNotification.value?.type ?? null)

// 检查是否有AI任务（简化：只要任务队列里有任务就旋转）
const hasRunningCompletionTask = computed(() => {
  return tasks.value.length > 0
})

const badgeColor = computed(() => {
    switch (notificationType.value) {
        case 'success':
            return '#67c23a'
        case 'warning':
            return '#e6a23c'
        case 'error':
            return '#f56c6c'
        default:
            return '#909399'
    }
})

const isShaking = ref(false)
let lastNotificationId = -1;

watch(
    () => latestNotification.value?.id,
    (currentId) => {
        if (!currentId || currentId === lastNotificationId) return
        lastNotificationId = currentId
        isShaking.value = true
        setTimeout(() => {
            isShaking.value = false
        }, 800)
    },
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

function toggleNotificationQueue() {
    eventBus.emit('toggle-notification-queue')
}

function toggleLoggerConsole() {
    eventBus.emit('toggle-logger-console')
}
</script>
<style scoped>
.bottom-menu {
    height: 30px;
    width: 100%;
    border: 1px solid #cccccc44;
    /*字体加粗 */
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 5%;
    font-size: 12px;
    box-sizing: border-box;
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

.status-notification.is-shaking {
    animation: bottom-menu-shake 0.8s ease-in-out;
}

.status-icon {
    display: flex;
}

.status-text {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.status-badge {
    min-width: 16px;
    height: 16px;
    border-radius: 8px;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    padding: 0 4px;
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
    font-weight: bold;
}

@keyframes bottom-menu-shake {
  0% { transform: translateX(0); }
  20% { transform: translateX(-2px); }
  40% { transform: translateX(2px); }
  60% { transform: translateX(-1px); }
  80% { transform: translateX(1px); }
  100% { transform: translateX(0); }
}
.status-icon {
    display: flex;
}

.status-text {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.status-badge {
    min-width: 16px;
    height: 16px;
    border-radius: 8px;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    padding: 0 4px;
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
    font-weight: bold;
}
</style>