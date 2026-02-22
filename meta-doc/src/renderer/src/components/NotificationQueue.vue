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
        <h3>{{ t('notificationQueue.title') }}</h3>
        <div class="header-actions">
          <!-- <Button
          size="small"
          type="primary"
          variant="ghost"
          @click="handleMarkAllRead"
          :disabled="unreadCount === 0"
        >
          {{ t('notificationQueue.markAllRead') }}
        </Button> -->
          <Tooltip>
            <TooltipTrigger as-child>
              <Button size="small" type="danger" circle plain @click="handleClear">
                <el-icon><Minus /></el-icon>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{{ t('notificationQueue.clear') }}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <ScrollArea class="flex-1 w-full overflow-auto">
        <div v-if="notifications.length === 0" class="empty-state">
          {{ t('notificationQueue.empty') }}
        </div>
        <div
          v-for="item in notifications"
          :key="item.id"
          class="notification-item"
          :class="['type-' + (item.type || 'info'), { unread: !item.read }]"
        >
          <div class="item-header">
            <div class="item-header-left">
              <span class="status-dot" :class="'type-' + (item.type || 'info')" />
              <span class="item-title">{{ item.title }}</span>
            </div>
            <span class="item-time">{{ formatTimestamp(item.timestamp) }}</span>
          </div>
          <div class="item-message">
            {{ item.message }}
          </div>
          <div class="item-actions">
            <Button
              v-if="!item.read"
              size="small"
              variant="ghost"
              type="primary"
              @click.stop="handleRead(item.id)"
            >
              {{ t('notificationQueue.markRead') }}
            </Button>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button size="small" circle plain type="danger" @click.stop="handleRemove(item.id)">
                  <el-icon><Minus /></el-icon>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{{ t('notificationQueue.remove') }}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </ScrollArea>
    </div>
  </ResizablePanel>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useNotificationStore } from '../stores/notification'
import ResizablePanel from './base/ResizablePanel.vue'
import eventBus, { getWindowType } from '../utils/event-bus'
import { themeState } from '../utils/themes'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { useI18n } from 'vue-i18n'
import { createRendererLogger } from '../utils/logger.ts'

const { t } = useI18n()
const notificationStore = useNotificationStore()
const { notifications, unreadCount } = storeToRefs(notificationStore)

const visible = ref(false)
const panelRef = ref<InstanceType<typeof ResizablePanel> | null>(null)
const logger = createRendererLogger('NotificationQueue', {
  windowTypeProvider: () => getWindowType()
})

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

function onResize(width: number, height: number) {
  logger.debug('通知队列尺寸调整', { width, height })
}

function ensureExclusiveOpen(targetVisible: boolean) {
  if (targetVisible) {
    eventBus.emit('close-ai-task-queue')
    eventBus.emit('close-logger-console')
    eventBus.emit('close-version-info-panel')
  }
}

function toggleVisibility() {
  visible.value = !visible.value
  ensureExclusiveOpen(visible.value)
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

function handleMarkAllRead() {
  notificationStore.markAllAsRead()
}

function handleClear() {
  notificationStore.removeAll()
}

function handleRead(id: string) {
  notificationStore.markAsRead(id)
}

function handleRemove(id: string) {
  notificationStore.remove(id)
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 监听visible变化，添加/移除点击外部区域监听器
watch(visible, (isVisible) => {
  if (isVisible) {
    nextTick(() => {
      document.addEventListener('click', handleClickOutside, true)
    })
  } else {
    document.removeEventListener('click', handleClickOutside, true)
  }
})

function setupEventListeners() {
  eventBus.on('toggle-notification-queue', toggleVisibility)
  eventBus.on('close-notification-queue', closePanel)
}

function removeEventListeners() {
  eventBus.off('toggle-notification-queue', toggleVisibility)
  eventBus.off('close-notification-queue', closePanel)
}

onMounted(() => {
  setupEventListeners()
})

onBeforeUnmount(() => {
  removeEventListeners()
  document.removeEventListener('click', handleClickOutside, true)
})
</script>

<style scoped>
.queue-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: inherit;
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
  gap: 4px;
}

.empty-state {
  text-align: center;
  padding: 16px 8px;
  opacity: var(--queue-empty-opacity);
  color: inherit;
}

.notification-item {
  border-radius: 8px;
  border: 1px solid var(--queue-border-color);
  padding: 8px 10px;
  margin-bottom: 8px;
  transition: background-color 0.2s ease;
  background-color: var(--queue-item-bg);
}

.notification-item.unread {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.notification-item:last-of-type {
  margin-bottom: 0;
}

.notification-item.type-success {
  border-left: 4px solid var(--el-color-success, #67c23a);
}

.notification-item.type-info {
  border-left: 4px solid var(--el-color-primary, #409eff);
}

.notification-item.type-warning {
  border-left: 4px solid var(--el-color-warning, #e6a23c);
}

.notification-item.type-error {
  border-left: 4px solid var(--el-color-danger, #f56c6c);
}

.notification-item:hover {
  background-color: var(--queue-item-hover-bg);
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.item-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--el-color-info, #909399);
  flex: 0 0 auto;
}

.status-dot.type-success {
  background-color: var(--el-color-success, #67c23a);
}

.status-dot.type-warning {
  background-color: var(--el-color-warning, #e6a23c);
}

.status-dot.type-error {
  background-color: var(--el-color-danger, #f56c6c);
}

.status-dot.type-info {
  background-color: #909399;
}

.item-time {
  opacity: var(--queue-time-opacity);
  font-weight: normal;
}

.item-message {
  font-size: 13px;
  line-height: 1.4;
  margin-bottom: 6px;
}

.item-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
</style>
