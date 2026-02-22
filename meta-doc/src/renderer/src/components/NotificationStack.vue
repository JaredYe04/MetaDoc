<template>
  <div
    ref="containerRef"
    class="toast-stack-container"
    :class="{
      'is-expanded': isExpanded,
      'is-animating': isAnimating
    }"
  >
    <!-- 3D 堆叠的通知 -->
    <div class="toast-stack" :class="{ 'is-expanded': isExpanded }">
      <div
        v-for="(toast, index) in notifications"
        :key="toast.id"
        class="stack-toast"
        :class="[
          `toast-${toast.type}`,
          { 'is-read': toast.read },
          getStackClass(index)
        ]"
        :style="getToastTransform(index)"
        @click="handleToastClick(toast)"
      >
        <button class="toast-close" @click.stop="removeToast(toast.id)">
          <X class="h-3 w-3" />
        </button>

        <div class="toast-icon">
          <component :is="getIconForType(toast.type)" class="h-5 w-5" />
        </div>

        <div class="toast-content">
          <div class="toast-title">{{ toast.title }}</div>
          <div class="toast-description">{{ toast.message }}</div>
        </div>

        <div v-if="!toast.read" class="toast-unread" :class="`type-${toast.type}`" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, type Component } from 'vue'
import { storeToRefs } from 'pinia'
import { useNotificationStore } from '../stores/notification'
import eventBus from '../utils/event-bus'
import type { NotificationType, NotificationItem } from '../types/notification'
import {
  X,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info
} from 'lucide-vue-next'

const store = useNotificationStore()
const { notifications } = storeToRefs(store)

const containerRef = ref<HTMLElement | null>(null)
const isExpanded = ref(false)
const isAnimating = ref(false)
const animationFrame = ref<number | null>(null)
const currentProgress = ref(0)
const targetProgress = ref(0)

const toastHeight = 76
const expandedGap = 8

function getStackClass(index: number): string {
  return `stack-index-${Math.min(index, 9)}`
}

function getToastTransform(index: number) {
  const total = notifications.value.length
  if (total === 0) return {}

  const progress = currentProgress.value

  if (progress <= 0) {
    // 完全收起 - 所有 toast 在屏幕外底部
    return {
      transform: `translate3d(0, ${100 + index * 20}px, ${-index * 50}px) scale(${1 - index * 0.05})`,
      opacity: Math.max(0, 0.3 - index * 0.1),
      zIndex: 10 - index
    }
  }

  if (progress >= 1) {
    // 完全展开 - 列表形式
    const yOffset = -index * (toastHeight + expandedGap)
    return {
      transform: `translate3d(0, ${yOffset}px, 0) scale(1)`,
      opacity: 1,
      zIndex: 100 - index
    }
  }

  // 动画过渡中 - 插值计算
  const collapsedY = 100 + index * 20
  const expandedY = -index * (toastHeight + expandedGap)
  const currentY = collapsedY + (expandedY - collapsedY) * progress

  const collapsedScale = 1 - index * 0.05
  const expandedScale = 1
  const currentScale = collapsedScale + (expandedScale - collapsedScale) * progress

  const collapsedZ = -index * 50
  const expandedZ = 0
  const currentZ = collapsedZ + (expandedZ - collapsedZ) * progress

  const collapsedOpacity = Math.max(0, 0.3 - index * 0.1)
  const expandedOpacity = 1
  const currentOpacity = collapsedOpacity + (expandedOpacity - collapsedOpacity) * progress

  return {
    transform: `translate3d(0, ${currentY}px, ${currentZ}px) scale(${currentScale})`,
    opacity: currentOpacity,
    zIndex: Math.round(10 + 90 * progress - index)
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

// 动画循环
function animate() {
  const speed = 0.08
  const diff = targetProgress.value - currentProgress.value

  if (Math.abs(diff) < 0.01) {
    currentProgress.value = targetProgress.value
    isAnimating.value = false
    isExpanded.value = targetProgress.value > 0.5
    return
  }

  currentProgress.value += diff * speed
  isAnimating.value = true
  animationFrame.value = requestAnimationFrame(animate)
}

// 切换展开/收起
function toggleExpand() {
  targetProgress.value = targetProgress.value > 0.5 ? 0 : 1

  if (animationFrame.value) {
    cancelAnimationFrame(animationFrame.value)
  }
  animate()
}

// 快速收起（可打断）
function collapseQuickly() {
  targetProgress.value = 0
  if (animationFrame.value) {
    cancelAnimationFrame(animationFrame.value)
  }
  animate()
}

// 点击 toast
function handleToastClick(toast: NotificationItem) {
  if (!toast.read) {
    store.markAsRead(toast.id)
  }
}

// 移除 toast
function removeToast(id: string) {
  store.remove(id)
}

// 监听新通知
onMounted(() => {
  eventBus.on('toggle-notification-queue', toggleExpand)
  eventBus.on('close-notification-stack', collapseQuickly)

  // 点击外部收起
  document.addEventListener('click', (e) => {
    if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
      if (targetProgress.value > 0.5) {
        collapseQuickly()
      }
    }
  })
})

onBeforeUnmount(() => {
  eventBus.off('toggle-notification-queue', toggleExpand)
  eventBus.off('close-notification-stack', collapseQuickly)
  if (animationFrame.value) {
    cancelAnimationFrame(animationFrame.value)
  }
})
</script>

<style scoped>
.toast-stack-container {
  position: fixed;
  bottom: 48px;
  right: 16px;
  width: 356px;
  height: 600px;
  pointer-events: none;
  z-index: 9999;
  perspective: 1200px;
}

.toast-stack-container.is-expanded {
  pointer-events: auto;
}

.toast-stack {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
}

/* Toast 项 */
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
  background: hsl(var(--background) / 0.98);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  pointer-events: auto;
  will-change: transform, opacity;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.stack-toast:hover {
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
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

.stack-toast.toast-success .toast-icon { color: hsl(var(--success)); }
.stack-toast.toast-error .toast-icon { color: hsl(var(--destructive)); }
.stack-toast.toast-warning .toast-icon { color: hsl(38 92% 50%); }
.stack-toast.toast-info .toast-icon { color: hsl(var(--primary)); }

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
  opacity: 0.7;
}

/* 确保动画流畅 */
.stack-toast {
  transition: box-shadow 0.2s ease;
}
</style>
