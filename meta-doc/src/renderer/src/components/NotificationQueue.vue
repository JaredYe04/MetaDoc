<template>
  <div
    class="notification-history-container"
    :class="{ 
      'is-expanded': isExpanded, 
      'is-hovering': isHovering,
      'is-fading': isFading 
    }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- 堆叠的通知历史 -->
    <div class="toast-stack" :class="{ 'is-visible': isExpanded || isHovering }">
      <div
        v-for="(item, index) in notifications.slice(0, maxVisible)"
        :key="item.id"
        class="history-toast"
        :class="[
          `toast-${item.type}`,
          { 'is-read': item.read },
          getStackClass(index)
        ]"
        :style="getToastStyle(index)"
        @click="handleToastClick(item)"
      >
        <!-- 关闭按钮 - 右上角 -->
        <button
          class="toast-close"
          aria-label="Close"
          @click.stop="removeNotification(item.id)"
        >
          <X class="h-3 w-3" />
        </button>

        <!-- 图标 -->
        <div class="toast-icon">
          <component :is="getIconForType(item.type)" class="h-5 w-5" />
        </div>

        <!-- 内容 -->
        <div class="toast-content">
          <div class="toast-title">{{ item.title }}</div>
          <div class="toast-description">{{ item.message }}</div>
        </div>

        <!-- 未读标记 - 左上角 -->
        <div v-if="!item.read" class="toast-unread" />
      </div>
    </div>

    <!-- 触发器按钮 -->
    <button
      class="stack-trigger"
      :class="{ 'has-unread': unreadCount > 0 }"
      @click="toggleExpanded"
    >
      <Bell class="h-4 w-4" />
      <span v-if="notifications.length > 0" class="trigger-badge">
        {{ notifications.length }}
      </span>
      <span v-if="unreadCount > 0" class="unread-dot" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, type Component } from 'vue'
import { storeToRefs } from 'pinia'
import { useNotificationStore } from '../stores/notification'
import eventBus from '../utils/event-bus'
import type { NotificationType, NotificationItem } from '../types/notification'
import {
  Bell,
  X,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info
} from 'lucide-vue-next'

const notificationStore = useNotificationStore()
const { notifications, unreadCount } = storeToRefs(notificationStore)

const isExpanded = ref(false)
const isHovering = ref(false)
const isFading = ref(false)
const fadeTimer = ref<number | null>(null)
const collapseTimer = ref<number | null>(null)
const maxVisible = 8

function getStackClass(index: number): string {
  if (isExpanded.value || isHovering.value) {
    return 'position-expanded'
  }
  return `position-${Math.min(index, 4)}`
}

function getToastStyle(index: number) {
  const baseTransition = 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
  
  if (isExpanded.value || isHovering.value) {
    return {
      transform: `translateY(${-index * 76}px) scale(1)`,
      opacity: 1,
      zIndex: 100 - index,
      transition: baseTransition
    }
  }

  const offsets = [0, -8, -14, -18, -20]
  const scales = [1, 0.96, 0.93, 0.91, 0.9]
  const opacities = isFading.value ? [0.3, 0.2, 0.15, 0.1, 0.05] : [1, 0.9, 0.8, 0.7, 0.6]
  
  return {
    transform: `translateY(${offsets[Math.min(index, 4)]}px) scale(${scales[Math.min(index, 4)]})`,
    opacity: opacities[Math.min(index, 4)],
    zIndex: 50 - index,
    transition: isFading.value 
      ? 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)' 
      : baseTransition
  }
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

function handleMouseEnter() {
  isHovering.value = true
  isFading.value = false
  clearTimers()
}

function handleMouseLeave() {
  isHovering.value = false
  if (isExpanded.value) {
    startCollapseTimer()
  }
}

function toggleExpanded() {
  isExpanded.value = !isExpanded.value
  isFading.value = false
  
  if (isExpanded.value) {
    clearTimers()
  } else {
    startFadeTimer()
  }
}

function handleToastClick(item: NotificationItem) {
  if (!item.read) {
    notificationStore.markAsRead(item.id)
  }
}

function removeNotification(id: string) {
  notificationStore.remove(id)
}

function startCollapseTimer() {
  clearTimers()
  collapseTimer.value = window.setTimeout(() => {
    isExpanded.value = false
    startFadeTimer()
  }, 2000)
}

function startFadeTimer() {
  clearTimers()
  fadeTimer.value = window.setTimeout(() => {
    isFading.value = true
  }, 500)
}

function clearTimers() {
  if (collapseTimer.value) {
    clearTimeout(collapseTimer.value)
    collapseTimer.value = null
  }
  if (fadeTimer.value) {
    clearTimeout(fadeTimer.value)
    fadeTimer.value = null
  }
}

watch(() => notifications.value.length, (newVal, oldVal) => {
  if (newVal > oldVal) {
    isExpanded.value = true
    isFading.value = false
    clearTimers()
    
    setTimeout(() => {
      if (!isHovering.value) {
        isExpanded.value = false
        startFadeTimer()
      }
    }, 2000)
  }
})

onMounted(() => {
  eventBus.on('toggle-notification-queue', toggleExpanded)
})

onBeforeUnmount(() => {
  eventBus.off('toggle-notification-queue', toggleExpanded)
  clearTimers()
})
</script>

<style scoped>
.notification-history-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  pointer-events: none;
}

.notification-history-container.is-expanded,
.notification-history-container.is-hovering {
  pointer-events: auto;
}

.toast-stack {
  position: absolute;
  bottom: 56px;
  right: 0;
  width: 356px;
  height: 0;
}

.toast-stack.is-visible {
  height: auto;
}

.history-toast {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--background));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform-origin: center bottom;
  cursor: pointer;
  pointer-events: auto;
}

.history-toast:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.history-toast.position-expanded {
  position: relative;
  margin-bottom: 8px;
  transform: none !important;
  opacity: 1 !important;
}

.history-toast.toast-success { border-left: 4px solid hsl(var(--success)); }
.history-toast.toast-error { border-left: 4px solid hsl(var(--destructive)); }
.history-toast.toast-warning { border-left: 4px solid hsl(38 92% 50%); }
.history-toast.toast-info { border-left: 4px solid hsl(var(--primary)); }

.toast-close {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  opacity: 0;
  transition: all 150ms ease;
  border: none;
}

.history-toast:hover .toast-close {
  opacity: 1;
}

.toast-close:hover {
  background: hsl(var(--muted) / 0.4);
  color: hsl(var(--foreground));
}

.toast-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.toast-success .toast-icon { color: hsl(var(--success)); }
.toast-error .toast-icon { color: hsl(var(--destructive)); }
.toast-warning .toast-icon { color: hsl(38 92% 50%); }
.toast-info .toast-icon { color: hsl(var(--primary)); }

.toast-content {
  flex: 1;
  min-width: 0;
  padding-right: 20px;
}

.toast-title {
  font-size: 14px;
  font-weight: 600;
  color: hsl(var(--foreground));
  margin-bottom: 4px;
}

.toast-description {
  font-size: 13px;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
}

.toast-unread {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: hsl(var(--primary));
}

.toast-success .toast-unread { background: hsl(var(--success)); }
.toast-error .toast-unread { background: hsl(var(--destructive)); }
.toast-warning .toast-unread { background: hsl(38 92% 50%); }
.toast-info .toast-unread { background: hsl(var(--primary)); }

.history-toast.is-read {
  opacity: 0.6;
}

.stack-trigger {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.3s ease;
  pointer-events: auto;
  color: hsl(var(--foreground));
}

.stack-trigger:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

.stack-trigger.has-unread {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border-color: hsl(var(--primary));
}

.trigger-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: hsl(var(--foreground));
  color: hsl(var(--background));
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stack-trigger.has-unread .trigger-badge {
  background: hsl(var(--primary-foreground));
  color: hsl(var(--primary));
}

.unread-dot {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: hsl(var(--destructive));
}
</style>
