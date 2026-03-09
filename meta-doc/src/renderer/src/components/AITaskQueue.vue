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
    <div class="queue-wrapper flex flex-col h-full text-foreground" :style="wrapperStyle">
      <div class="queue-header flex items-center justify-between gap-3 border-b border-border pb-2 mb-2">
        <Tooltip :content="t('aiTaskQueue.switchWarning')" placement="right">
          <h3 class="text-sm font-medium m-0 text-foreground">{{ t('aiTaskQueue.title') }}</h3>
        </Tooltip>
        <div class="header-actions flex items-center gap-2 shrink-0">
          <span class="text-xs text-muted-foreground whitespace-nowrap">{{ t('aiTaskQueue.autoCompletionHint') }}</span>
          <Switch
            :checked="settings.autoCompletion"
            class="auto-switch"
            @update:checked="
              (val) => {
                settings.autoCompletion = val
                setSetting('autoCompletion', val)
              }
            "
          />
        </div>
      </div>

      <div v-if="settings.autoCompletion" class="delay-control flex items-center justify-between gap-2 py-2 mb-2 border-b border-border">
        <div class="delay-info min-w-0">
          <span v-if="remainingDelay > 0" class="text-xs text-muted-foreground">
            {{ t('aiTaskQueue.delayRemaining', { time: formatDelayTime(remainingDelay) }) }}
          </span>
          <span v-else class="text-xs text-foreground">
            {{ t('aiTaskQueue.delayActive') }}
          </span>
        </div>
        <div class="delay-actions flex gap-2 shrink-0">
          <Button
            v-if="remainingDelay > 0"
            size="sm"
            variant="ghost"
            class="text-muted-foreground hover:text-destructive"
            @click="cancelDelay"
          >
            {{ t('aiTaskQueue.cancelDelay') }}
          </Button>
          <Button size="sm" variant="outline" @click="delayCompletion(5)">
            {{ t('aiTaskQueue.delayButton', { minutes: 5 }) }}
          </Button>
        </div>
      </div>

      <ScrollArea class="flex-1 max-w-full min-h-0">
        <AITask
          v-for="task in tasks"
          :key="task.handle"
          :task="task"
          @start="() => startAiTask(task.handle)"
          @cancel="() => cancelAiTask(task.handle)"
        />

        <div v-if="tasks.length === 0" class="empty-state text-center py-4 text-sm text-muted-foreground">
          {{ t('aiTaskQueue.empty') }}
        </div>
      </ScrollArea>
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
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Switch } from '@renderer/components/ui/switch'
import { Tooltip } from '@renderer/components/ui/tooltip'

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

const wrapperStyle = computed(() => ({
  color: themeState.currentTheme?.textColor ?? 'inherit'
}))

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
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}
</style>
