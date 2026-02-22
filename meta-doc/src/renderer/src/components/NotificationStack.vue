<template>
  <div class="toast-stack-container" :class="{ 'is-expanded': isExpanded, 'is-hovering': isHovering }">
    <!-- 活跃的通知堆叠 -->
    <TransitionGroup 
      name="toast" 
      tag="div" 
      class="toast-wrapper"
      :class="{ 'is-collapsed': !isExpanded && !isHovering }"
    >
      <div
        v-for="(toast, index) in activeToasts"
        :key="toast.id"
        class="stack-toast"
        :class="[
          `toast-${toast.type}`,
          { 'is-read': toast.read },
          getPositionClass(index)
        ]"
        :style="getToastStyle(index)"
        @click="handleToastClick(toast)"
        @mouseenter="handleToastHover(index)"
      >
        <!-- 关闭按钮 -->
        <button class="toast-close" @click.stop="dismissToast(toast.id)">
          <X class="h-3 w-3" />
        </button>

        <!-- 图标 -->
        <div class="toast-icon">
          <component :is="getIconForType(toast.type)" class="h-5 w-5" />
        </div>

        <!-- 内容 -->
        <div class="toast-content">
          <div class="toast-title">{{ toast.title }}</div>
          <div class="toast-description">{{ toast.message }}</div>
        </div>

        <!-- 未读标记 -->
        <div v-if="!toast.read" class="toast-unread" :class="`type-${toast.type}`" />
      </div>
    </TransitionGroup>

    <!-- 触发器 -->
    <button
      v-if="allToasts.length > 0"
      class="stack-trigger"
      :class="{ 'has-unread': unreadCount > 0 }"
      @click="toggleExpanded"
    >
      <Bell class="h-4 w-4" />
      <span class="trigger-count">{{ allToasts.length }}</span>
      <span v-if="unreadCount > 0" class="unread-badge">{{ unreadCount }}</span>
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

const store = useNotificationStore()
const { notifications: allToasts, unreadCount } = storeToRefs(store)

const isExpanded = ref(false)
const isHovering = ref(false)
const hoveredIndex = ref(-1)
const collapseTimer = ref<number | null>(null)

// 活跃的通知（限制数量避免性能问题）
const activeToasts = computed(() => {
  return allToasts.value.slice(0, 10)
})

function getPositionClass(index: number): string {
  if (isExpanded.value || isHovering.value) {
    return 'position-expanded'
  }
  if (hoveredIndex.value === index) {
    return 'position-hovered'
  }
  return `position-stack-${Math.min(index, 4)}`
}

function getToastStyle(index: number) {
  const isExpandedState = isExpanded.value || isHovering.value
  
  if (isExpandedState) {
    // 展开状态：列表形式，垂直排列
    return {
      transform: `translateY(${-index * 84}px)`,
      opacity: 1,
      zIndex: 100 - index,
      transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
    }
  }

  // 堆叠收起状态
  const baseOffset = 0
  const stackOffset = index * 12
  const scale = Math.max(0.85, 1 - index * 0.05)
  const opacity = Math.max(0.4, 1 - index * 0.15)

  return {
    transform: `translateY(${-(baseOffset + stackOffset)}px) scale(${scale})`,
    opacity: opacity,
    zIndex: 50 - index,
    transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
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

function handleToastClick(toast: NotificationItem) {
  if (!toast.read) {
    store.markAsRead(toast.id)
  }
}

function handleToastHover(index: number) {
  if (!isExpanded.value) {
    hoveredIndex.value = index
  }
}

function dismissToast(id: string) {
  store.remove(id)
}

function toggleExpanded() {
  isExpanded.value = !isExpanded.value
  if (isExpanded.value) {
    clearCollapseTimer()
  } else {
    startCollapseTimer()
  }
}

function startCollapseTimer() {
  clearCollapseTimer()
  collapseTimer.value = window.setTimeout(() => {
    if (!isHovering.value) {
      isExpanded.value = false
    }
  }, 3000)
}

function clearCollapseTimer() {
  if (collapseTimer.value) {
    clearTimeout(collapseTimer.value)
    collapseTimer.value = null
  }
}

// 监听鼠标进入/离开容器
function handleMouseEnter() {
  isHovering.value = true
  clearCollapseTimer()
}

function handleMouseLeave() {
  isHovering.value = false
  hoveredIndex.value = -1
  if (isExpanded.value) {
    startCollapseTimer()
  }
}

// 监听新通知自动展开
watch(() => allToasts.value.length, (newVal, oldVal) => {
  if (newVal > oldVal && !isExpanded.value) {
    // 新通知到达，短暂展开
    isExpanded.value = true
    clearCollapseTimer()
    setTimeout(() => {
      if (!isHovering.value) {
        isExpanded.value = false
      }
    }, 1500)
  }
})

onMounted(() => {
  eventBus.on('toggle-notification-queue', toggleExpanded)
  // 添加全局鼠标监听
  document.addEventListener('mouseenter', handleMouseEnter, true)
  document.addEventListener('mouseleave', handleMouseLeave, true)
})

onBeforeUnmount(() => {
  eventBus.off('toggle-notification-queue', toggleExpanded)
  document.removeEventListener('mouseenter', handleMouseEnter, true)
  document.removeEventListener('mouseleave', handleMouseLeave, true)
  clearCollapseTimer()
})
</script>

<style scoped>
.toast-stack-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  pointer-events: none;
}

.toast-stack-container.is-expanded,
.toast-stack-container.is-hovering {
  pointer-events: auto;
}

/* Toast 包装器 */
.toast-wrapper {
  position: absolute;
  bottom: 64px;
  right: 0;
  width: 356px;
  height: auto;
  perspective: 1000px;
}

/* 单个 Toast */
.stack-toast {
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
  cursor: pointer;
  pointer-events: auto;
  transform-origin: center bottom;
}

.stack-toast:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

/* 展开状态 */
.stack-toast.position-expanded {
  position: relative;
  margin-bottom: 8px;
  transform: none !important;
  opacity: 1 !important;
}

/* 悬停展开单个 */
.stack-toast.position-hovered {
  transform: translateY(-20px) scale(1.02) !important;
  z-index: 100 !important;
  opacity: 1 !important;
}

/* 类型样式 */
.stack-toast.toast-success { border-left: 4px solid hsl(var(--success)); }
.stack-toast.toast-error { border-left: 4px solid hsl(var(--destructive)); }
.stack-toast.toast-warning { border-left: 4px solid hsl(38 92% 50%); }
.stack-toast.toast-info { border-left: 4px solid hsl(var(--primary)); }

/* 关闭按钮 */
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

.stack-toast:hover .toast-close {
  opacity: 1;
}

.toast-close:hover {
  background: hsl(var(--muted) / 0.4);
  color: hsl(var(--foreground));
}

/* 图标 */
.toast-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.toast-success .toast-icon { color: hsl(var(--success)); }
.toast-error .toast-icon { color: hsl(var(--destructive)); }
.toast-warning .toast-icon { color: hsl(38 92% 50%); }
.toast-info .toast-icon { color: hsl(var(--primary)); }

/* 内容 */
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

/* 未读标记 */
.toast-unread {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.toast-unread.type-success { background: hsl(var(--success)); }
.toast-unread.type-error { background: hsl(var(--destructive)); }
.toast-unread.type-warning { background: hsl(38 92% 50%); }
.toast-unread.type-info { background: hsl(var(--primary)); }

/* 已读状态 */
.stack-toast.is-read {
  opacity: 0.6;
}

/* 触发器 */
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
  z-index: 10000;
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

.trigger-count {
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

.stack-trigger.has-unread .trigger-count {
  background: hsl(var(--primary-foreground));
  color: hsl(var(--primary));
}

.unread-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: hsl(var(--destructive));
}

/* Transition animations */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(50px) scale(0.9);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100px);
}
</style>
