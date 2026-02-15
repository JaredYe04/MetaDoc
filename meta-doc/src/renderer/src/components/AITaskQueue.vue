<template>
  <ResizablePanel
    ref="panelRef"
    :visible="visible"
    :initial-width="360"
    :initial-height="320"
    :min-width="260"
    :min-height="220"
    :max-width="maxWidth"
    :max-height="maxHeight"
    :background-color="themeState.currentTheme.background"
    position="fixed"
    :bottom="30"
    :right="16"
    :enable-top-resize="true"
    :enable-left-resize="true"
    :content-padding="10"
    @resize="onResize"
  >
    <div class="queue-wrapper" :style="wrapperStyle">
      <div class="queue-header">
        <el-tooltip :content="t('aiTaskQueue.switchWarning')" placement="right">
          <h3>{{ t('aiTaskQueue.title') }}</h3>
        </el-tooltip>
        <div class="header-actions">
          <el-switch
            v-model="settings.autoCompletion"
            :active-text="$t('setting.autoCompletion')"
            class="auto-switch"
            @change="setSetting('autoCompletion', settings.autoCompletion)"
          />
        </div>
      </div>

      <!-- 延迟控制区域 -->
      <div v-if="settings.autoCompletion" class="delay-control">
        <div class="delay-info">
          <span v-if="remainingDelay > 0" class="delay-text">
            {{ t('aiTaskQueue.delayRemaining', { time: formatDelayTime(remainingDelay) }) }}
          </span>
          <span v-else class="delay-text delay-active">
            {{ t('aiTaskQueue.delayActive') }}
          </span>
        </div>
        <div class="delay-actions">
          <el-button
            v-if="remainingDelay > 0"
            size="small"
            type="danger"
            @click="cancelDelay"
            class="delay-button"
          >
            {{ t('aiTaskQueue.cancelDelay') }}
          </el-button>
          <el-button size="small" type="primary" @click="delayCompletion(5)" class="delay-button">
            {{ t('aiTaskQueue.delayButton', { minutes: 5 }) }}
          </el-button>
        </div>
      </div>

      <el-scrollbar
        :style="{
          maxWidth: '100%',
          flex: 1,
          overflow: 'auto'
        }"
        min-size="5"
      >
        <AITask
          v-for="task in tasks"
          :key="task.handle"
          :task="task"
          @start="() => startAiTask(task.handle)"
          @cancel="() => cancelAiTask(task.handle)"
        />

        <div v-if="tasks.length === 0" class="empty-state">
          {{ t('aiTaskQueue.empty') }}
        </div>
      </el-scrollbar>
    </div>
  </ResizablePanel>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useAiTasks, startAiTask, cancelAiTask } from '../utils/ai_tasks.ts'
import AITask from './AITask.vue'
import ResizablePanel from './base/ResizablePanel.vue'
import eventBus, { getWindowType } from '../utils/event-bus'
import { themeState } from '../utils/themes'
import { useI18n } from 'vue-i18n'
import { setSetting, settings } from '../utils/settings'
import { createRendererLogger } from '../utils/logger.ts'
import { aiCompletionService } from '../utils/ai-completion-service'

const { t } = useI18n()
const logger = createRendererLogger('AITaskQueue', {
  windowTypeProvider: () => getWindowType()
})

// 组件状态
const visible = ref(false)
const panelRef = ref<InstanceType<typeof ResizablePanel> | null>(null)
const tasks = useAiTasks()

// 延迟相关状态
const remainingDelay = ref(0)
let delayCheckInterval: NodeJS.Timeout | null = null

/**
 * 格式化延迟时间
 */
function formatDelayTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}${t('aiTaskQueue.seconds')}`
  }
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (secs === 0) {
    return `${minutes}${t('aiTaskQueue.minutes')}`
  }
  return `${minutes}${t('aiTaskQueue.minutes')}${secs}${t('aiTaskQueue.seconds')}`
}

/**
 * 延迟补全
 */
function delayCompletion(minutes: number) {
  eventBus.emit('ai-completion-delay', minutes)
  updateRemainingDelay()
}

/**
 * 取消延迟
 */
function cancelDelay() {
  eventBus.emit('ai-completion-cancel-delay')
  updateRemainingDelay()
}

/**
 * 更新剩余延迟时间
 */
function updateRemainingDelay() {
  remainingDelay.value = aiCompletionService.getRemainingDelay()
}

/**
 * 开始检查延迟时间
 */
function startDelayCheck() {
  if (delayCheckInterval) {
    clearInterval(delayCheckInterval)
  }
  delayCheckInterval = setInterval(() => {
    updateRemainingDelay()
  }, 1000) // 每秒更新一次
  updateRemainingDelay()
}

// 类型断言以解决类型问题
type TaskType = (typeof tasks.value)[0]

// 面板尺寸限制
const maxWidth = computed(() => Math.floor(window.innerWidth * 0.3))
const maxHeight = computed(() => Math.floor(window.innerHeight * 0.7))

const wrapperStyle = computed(() => {
  const isDark = themeState.currentTheme?.type === 'dark'
  return {
    color: themeState.currentTheme.textColor,
    '--queue-border-color': isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.1)',
    '--queue-item-bg': isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.02)',
    '--queue-item-hover-bg': isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.05)',
    '--queue-empty-opacity': isDark ? 0.6 : 0.4,
    '--queue-time-opacity': isDark ? 0.7 : 0.45
  }
})

// 面板尺寸变化处理
function onResize(width: number, height: number) {
  // 可以在这里处理尺寸变化的逻辑
  // 例如保存到本地存储等
  logger.debug('AI 任务队列尺寸调整', { width, height })
}

function toggleVisibility() {
  const next = !visible.value
  visible.value = next
  if (next) {
    eventBus.emit('close-notification-queue')
    eventBus.emit('close-logger-console')
    eventBus.emit('close-version-info-panel')
  }
}

function closePanel() {
  visible.value = false
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

// 组件挂载后设置事件监听
onMounted(() => {
  eventBus.on('toggle-ai-task-queue', toggleVisibility)
  eventBus.on('close-ai-task-queue', closePanel)
  eventBus.on('ai-completion-delay-updated', () => {
    updateRemainingDelay()
  })
  eventBus.on('ai-completion-cancel-delay', () => {
    aiCompletionService.cancelDelay()
    updateRemainingDelay()
  })

  // 开始检查延迟时间
  startDelayCheck()
})

onBeforeUnmount(() => {
  eventBus.off('toggle-ai-task-queue', toggleVisibility)
  eventBus.off('close-ai-task-queue', closePanel)
  eventBus.off('ai-completion-delay-updated')
  eventBus.off('ai-completion-cancel-delay')
  document.removeEventListener('click', handleClickOutside, true)

  if (delayCheckInterval) {
    clearInterval(delayCheckInterval)
    delayCheckInterval = null
  }
})
</script>

<style scoped>
.queue-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: inherit;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  user-select: none;
  border-bottom: 1px solid var(--queue-border-color);
  padding-bottom: 6px;
}

.queue-header h3 {
  margin: 0;
  font-size: 16px;
}

.header-actions {
  display: flex;
  align-items: center;
}

/* 开关配色使用全局 element-plus-theme-override.css */

.empty-state {
  text-align: center;
  padding: 16px 8px;
  opacity: var(--queue-empty-opacity);
  color: inherit;
}

.delay-control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--queue-border-color);
}

.delay-info {
  flex: 1;
}

.delay-text {
  font-size: 12px;
  opacity: var(--queue-time-opacity);
  color: inherit;
}

.delay-text.delay-active {
  opacity: 1;
  color: var(--el-color-success);
}

.delay-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.delay-button {
  flex-shrink: 0;
}
</style>
