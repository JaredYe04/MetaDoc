<template>
  <ResizablePanel
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
        <!-- <el-button
          size="small"
          type="primary" 
          text
          @click="handleMarkAllRead"
          :disabled="unreadCount === 0"
        >
          {{ t('notificationQueue.markAllRead') }}
        </el-button> -->
        <el-tooltip :content="t('notificationQueue.clear')" placement="right">
          <el-button
            size="small"
            type="danger"
            circle plain
            @click="handleClear"
          >
            <el-icon><Minus /></el-icon>
          </el-button>
        </el-tooltip>

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
            <span
              class="status-dot"
              :class="'type-' + (item.type || 'info')"
            />
            <span class="item-title">{{ item.title }}</span>
          </div>
          <span class="item-time">{{ formatTimestamp(item.timestamp) }}</span>
        </div>
        <div class="item-message">
          {{ item.message }}
        </div>
        <div class="item-actions">
          <!-- <el-button size="small" text type="primary"  @click="handleRead(item.id)" :disabled="item.read">
            {{ t('notificationQueue.markRead') }}
          </el-button> -->
          <el-tooltip :content="t('notificationQueue.remove')" placement="right">
            <el-button size="small" circle plain type="danger"  @click="handleRemove(item.id)">
              <el-icon><Minus /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </div>
    </el-scrollbar>
    </div>
  </ResizablePanel>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useNotificationStack, markAllNotificationsRead, markNotificationRead, removeNotification, clearNotifications, initializeNotificationListeners } from '../utils/notifications'
import ResizablePanel from './base/ResizablePanel.vue'
import eventBus, { getWindowType } from '../utils/event-bus'
import { themeState } from '../utils/themes'
import { useI18n } from 'vue-i18n'
import { createRendererLogger } from '../utils/logger.ts'

const { t } = useI18n()
initializeNotificationListeners(t)

const visible = ref(false)
const { notifications, unreadCount } = useNotificationStack()
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
  }
}

function toggleVisibility() {
  visible.value = !visible.value
  ensureExclusiveOpen(visible.value)
}

function closePanel() {
  visible.value = false
}

function handleMarkAllRead() {
  markAllNotificationsRead()
}

function handleClear() {
  clearNotifications()
}

function handleRead(id: string) {
  markNotificationRead(id)
}

function handleRemove(id: string) {
  removeNotification(id)
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

watch(visible, (value) => {
  if (value) {
    markAllNotificationsRead()
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
  border-left: 4px solid #67c23a;
}

.notification-item.type-info {
  border-left: 4px solid #409eff;
}

.notification-item.type-warning {
  border-left: 4px solid #e6a23c;
}

.notification-item.type-error {
  border-left: 4px solid #f56c6c;
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
  background-color: #909399;
  flex: 0 0 auto;
}

.status-dot.type-success {
  background-color: #67c23a;
}

.status-dot.type-warning {
  background-color: #e6a23c;
}

.status-dot.type-error {
  background-color: #f56c6c;
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

