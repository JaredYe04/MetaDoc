<template>
  <ResizablePanel
    ref="panelRef"
    :visible="visible"
    :initial-width="380"
    :initial-height="400"
    :min-width="320"
    :min-height="300"
    :max-width="maxWidth"
    :max-height="maxHeight"
    position="fixed"
    :bottom="70"
    :right="16"
    :enable-top-resize="true"
    :enable-left-resize="true"
    :content-padding="0"
    @resize="onResize"
  >
    <Card class="h-full flex flex-col border shadow-lg">
      <!-- Header -->
      <CardHeader class="flex flex-row items-center justify-between py-3 px-4 border-b">
        <CardTitle class="text-base font-semibold flex items-center gap-2">
          <Bell class="h-4 w-4" />
          {{ t('notificationQueue.title') }}
          <Badge v-if="unreadCount > 0" variant="secondary" class="ml-1">
            {{ unreadCount }}
          </Badge>
        </CardTitle>
        <div class="flex items-center gap-1">
          <Button
            v-if="unreadCount > 0"
            variant="ghost"
            size="sm"
            class="h-8 px-2 text-xs"
            @click="handleMarkAllRead"
          >
            <Check class="h-3.5 w-3.5 mr-1" />
            {{ t('notificationQueue.markAllRead') }}
          </Button>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button variant="ghost" size="icon" class="h-8 w-8" @click="handleClear">
                <Trash2 class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ t('notificationQueue.clear') }}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>

      <!-- Content -->
      <CardContent class="flex-1 p-0 overflow-hidden">
        <ScrollArea class="h-full">
          <div v-if="notifications.length === 0" class="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Inbox class="h-12 w-12 mb-3 opacity-40" />
            <p class="text-sm">{{ t('notificationQueue.empty') }}</p>
          </div>
          
          <div class="p-4 space-y-3" data-sonner-wrapper>
            <div
              v-for="item in notifications"
              :key="item.id"
              class="sonner-notification"
              :class="[
                getSonnerTypeClass(item.type),
                { 'sonner-unread': !item.read }
              ]"
            >
              <!-- Icon -->
              <div data-icon class="sonner-icon">
                <component :is="getIconForType(item.type)" class="h-5 w-5" />
              </div>

              <!-- Content -->
              <div data-content class="sonner-content">
                <div data-title class="sonner-title">{{ item.title }}</div>
                <div data-description class="sonner-description">{{ item.message }}</div>
                <div data-timestamp class="sonner-timestamp">{{ formatTime(item.timestamp) }}</div>
              </div>

              <!-- Close button (top-right, consistent with Sonner toast) -->
              <button
                class="sonner-close-btn"
                aria-label="Close notification"
                @click.stop="handleRemove(item.id)"
              >
                <X class="h-3 w-3" />
              </button>

              <!-- Unread indicator (top-left, opposite of close button) -->
              <div v-if="!item.read" class="sonner-unread-dot" :class="getSonnerDotClass(item.type)" />
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  </ResizablePanel>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick, type Component } from 'vue'
import { storeToRefs } from 'pinia'
import { useNotificationStore } from '../stores/notification'
import ResizablePanel from './base/ResizablePanel.vue'
import eventBus, { getWindowType } from '../utils/event-bus'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { useI18n } from 'vue-i18n'
import { createRendererLogger } from '../utils/logger.ts'
import type { NotificationType } from '../types/notification'
import {
  Bell,
  Trash2,
  X,
  Inbox,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info
} from 'lucide-vue-next'

const { t } = useI18n()
const notificationStore = useNotificationStore()
const { notifications, unreadCount } = storeToRefs(notificationStore)

const visible = ref(false)
const panelRef = ref<InstanceType<typeof ResizablePanel> | null>(null)
const logger = createRendererLogger('NotificationQueue', {
  windowTypeProvider: () => getWindowType()
})

const maxWidth = computed(() => Math.floor(window.innerWidth * 0.4))
const maxHeight = computed(() => Math.floor(window.innerHeight * 0.8))

function getSonnerTypeClass(type: NotificationType | undefined): string {
  const classes: Record<string, string> = {
    success: 'sonner-success',
    error: 'sonner-error',
    warning: 'sonner-warning',
    info: 'sonner-info'
  }
  return classes[type || 'info']
}

function getSonnerDotClass(type: NotificationType | undefined): string {
  const classes: Record<string, string> = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-amber-500',
    info: 'bg-blue-500'
  }
  return classes[type || 'info']
}

function getIconForType(type: NotificationType | undefined): Component {
  const icons: Record<string, Component> = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertCircle,
    info: Info
  }
  return icons[type || 'info']
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  // Less than 1 minute
  if (diff < 60000) {
    return t('notificationQueue.justNow')
  }
  // Less than 1 hour
  if (diff < 3600000) {
    return t('notificationQueue.minutesAgo', { count: Math.floor(diff / 60000) })
  }
  // Less than 24 hours
  if (diff < 86400000) {
    return t('notificationQueue.hoursAgo', { count: Math.floor(diff / 3600000) })
  }
  
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

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

function handleClickOutside(event: MouseEvent) {
  if (!visible.value) return

  const target = event.target as HTMLElement
  const panelElement = panelRef.value?.$el as HTMLElement | undefined

  if (panelElement && panelElement.contains(target)) {
    return
  }

  const bottomMenu = target.closest('.bottom-menu')
  if (bottomMenu) {
    const isToggleButton = target.closest('.status-logger, .status-notification, .ai-task-menu')
    if (isToggleButton) {
      return
    }
  }

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
/* Sonner-style notification item */
.sonner-notification {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  width: 100%;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transition: all 200ms ease;
}

.sonner-notification:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  transform: translateY(-1px);
}

/* Close button (top-right, consistent with Sonner toast) */
.sonner-close-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  opacity: 0;
  transition: all 200ms ease;
}

.sonner-notification:hover .sonner-close-btn {
  opacity: 1;
}

.sonner-close-btn:hover {
  background: hsl(var(--muted) / 0.4);
  color: hsl(var(--foreground));
}

/* Icon styling */
.sonner-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-top: 2px;
}

.sonner-icon svg {
  width: 20px;
  height: 20px;
}

/* Content area */
.sonner-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sonner-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  color: hsl(var(--foreground));
}

.sonner-description {
  font-size: 14px;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
}

.sonner-timestamp {
  font-size: 12px;
  line-height: 1.4;
  color: hsl(var(--muted-foreground) / 0.8);
  margin-top: 4px;
}

/* Type-specific styling */
.sonner-success {
  --notification-color: hsl(var(--success));
}

.sonner-error {
  --notification-color: hsl(var(--destructive));
}

.sonner-warning {
  --notification-color: hsl(38 92% 50%);
}

.sonner-info {
  --notification-color: hsl(var(--primary));
}

.sonner-success .sonner-icon,
.sonner-error .sonner-icon,
.sonner-warning .sonner-icon,
.sonner-info .sonner-icon {
  color: var(--notification-color);
}

/* Unread indicator dot (top-left, opposite of close button) */
.sonner-unread-dot {
  position: absolute;
  top: 10px;
  left: 10px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--notification-color);
}

/* Unread state */
.sonner-unread {
  background: hsl(var(--background));
}
</style>
