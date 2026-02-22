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
          
          <div class="p-2 space-y-2">
            <div
              v-for="item in notifications"
              :key="item.id"
              class="group relative flex gap-3 p-3 rounded-lg border transition-all duration-200"
              :class="[
                getNotificationStyles(item.type),
                item.read ? 'opacity-70' : 'opacity-100'
              ]"
            >
              <!-- Icon -->
              <div class="flex-shrink-0 mt-0.5">
                <div
                  class="w-8 h-8 rounded-full flex items-center justify-center"
                  :class="getIconBackgroundClass(item.type)"
                >
                  <component
                    :is="getIconForType(item.type)"
                    class="h-4 w-4"
                    :class="getIconClass(item.type)"
                  />
                </div>
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <p class="text-sm font-semibold leading-tight">{{ item.title }}</p>
                  <span class="text-xs text-muted-foreground flex-shrink-0">{{ formatTime(item.timestamp) }}</span>
                </div>
                <p class="text-sm text-muted-foreground mt-1 leading-relaxed">{{ item.message }}</p>
                
                <!-- Actions -->
                <div class="flex items-center gap-2 mt-2">
                  <Button
                    v-if="!item.read"
                    variant="ghost"
                    size="sm"
                    class="h-7 px-2 text-xs"
                    @click.stop="handleRead(item.id)"
                  >
                    <Check class="h-3 w-3 mr-1" />
                    {{ t('notificationQueue.markRead') }}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    @click.stop="handleRemove(item.id)"
                  >
                    <X class="h-3 w-3 mr-1" />
                    {{ t('notificationQueue.remove') }}
                  </Button>
                </div>
              </div>

              <!-- Unread Indicator -->
              <div
                v-if="!item.read"
                class="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary"
              />
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
  Check,
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

function getNotificationStyles(type: NotificationType | undefined): string {
  const styles: Record<string, string> = {
    success: 'border-l-4 border-l-green-500 bg-green-50/50 dark:bg-green-950/20',
    error: 'border-l-4 border-l-red-500 bg-red-50/50 dark:bg-red-950/20',
    warning: 'border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20',
    info: 'border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
  }
  return styles[type || 'info']
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

function getIconClass(type: NotificationType | undefined): string {
  const classes: Record<string, string> = {
    success: 'text-green-600 dark:text-green-400',
    error: 'text-red-600 dark:text-red-400',
    warning: 'text-amber-600 dark:text-amber-400',
    info: 'text-blue-600 dark:text-blue-400'
  }
  return classes[type || 'info']
}

function getIconBackgroundClass(type: NotificationType | undefined): string {
  const classes: Record<string, string> = {
    success: 'bg-green-100 dark:bg-green-900/30',
    error: 'bg-red-100 dark:bg-red-900/30',
    warning: 'bg-amber-100 dark:bg-amber-900/30',
    info: 'bg-blue-100 dark:bg-blue-900/30'
  }
  return classes[type || 'info']
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
