<template>
  <div
    ref="containerRef"
    class="toast-stack-container"
    :class="{ 
      'is-visible': isVisible,
      'is-expanded': isExpanded 
    }"
  >
    <!-- 3D 堆叠的通知 -->
    <div 
      class="toast-stack"
      @mouseenter="handleStackMouseEnter"
      @mouseleave="handleStackMouseLeave"
    >
      <div
        v-for="(toast, index) in notifications"
        :key="toast.id"
        class="stack-toast"
        :class="[
          `toast-${toast.type}`,
          { 'is-read': toast.read }
        ]"
        :style="getToastStyle(index)"
        @click="handleToastClick(toast)"
        @mouseenter="handleToastMouseEnter(index)"
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
import { ref, onMounted, onBeforeUnmount, type Component } from 'vue'
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

// 两个独立的状态
const isVisible = ref(true)
const isExpanded = ref(false)

// 动画进度
const visibilityProgress = ref(1)
const expandProgress = ref(0)
let visibilityRaf: number | null = null
let expandRaf: number | null = null

const toastHeight = 76
const expandedGap = 8

function getIconForType(type: NotificationType | undefined): Component {
  const icons: Record<string, Component> = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertCircle,
    info: Info
  }
  return icons[type || 'info']
}

function getToastStyle(index: number) {
  const total = notifications.value.length
  if (total === 0) return {}

  const vProgress = visibilityProgress.value
  const eProgress = expandProgress.value

  // 3D堆叠收起时的参数
  const stackYOffset = index * 12
  const stackScale = Math.max(0.85, 1 - index * 0.03)
  const stackZ = -index * 30

  // 展开列表时的参数
  const expandedYOffset = -index * (toastHeight + expandedGap)

  // 插值计算当前Y偏移
  const currentYOffset = stackYOffset + (expandedYOffset - stackYOffset) * eProgress

  // 屏幕内外偏移
  const offscreenY = 150 + index * 30
  const onscreenY = currentYOffset
  const finalY = offscreenY + (onscreenY - offscreenY) * vProgress

  const finalScale = stackScale + (1 - stackScale) * eProgress
  const finalZ = stackZ * (1 - eProgress)

  const stackOpacity = Math.max(0.4, 1 - index * 0.15)
  const expandedOpacity = 1
  const currentOpacity = stackOpacity + (expandedOpacity - stackOpacity) * eProgress
  const finalOpacity = currentOpacity * vProgress

  return {
    transform: `translate3d(0, ${finalY}px, ${finalZ}px) scale(${finalScale})`,
    opacity: finalOpacity,
    zIndex: Math.round((10 + 90 * eProgress - index) * vProgress),
    pointerEvents: vProgress > 0.5 ? 'auto' : 'none'
  }
}

function animateVisibility(target: number) {
  if (visibilityRaf) cancelAnimationFrame(visibilityRaf)

  const step = () => {
    const diff = target - visibilityProgress.value
    if (Math.abs(diff) < 0.02) {
      visibilityProgress.value = target
      return
    }
    visibilityProgress.value += diff * 0.1
    visibilityRaf = requestAnimationFrame(step)
  }
  visibilityRaf = requestAnimationFrame(step)
}

function animateExpand(target: number) {
  if (expandRaf) cancelAnimationFrame(expandRaf)

  const step = () => {
    const diff = target - expandProgress.value
    if (Math.abs(diff) < 0.02) {
      expandProgress.value = target
      return
    }
    expandProgress.value += diff * 0.15
    expandRaf = requestAnimationFrame(step)
  }
  expandRaf = requestAnimationFrame(step)
}

function toggleVisibility() {
  isVisible.value = !isVisible.value
  animateVisibility(isVisible.value ? 1 : 0)
}

function handleStackMouseEnter() {
  if (isVisible.value) {
    isExpanded.value = true
    animateExpand(1)
  }
}

function handleStackMouseLeave() {
  isExpanded.value = false
  animateExpand(0)
}

function handleToastMouseEnter(index: number) {
}

function handleToastClick(toast: NotificationItem) {
  if (!toast.read) {
    store.markAsRead(toast.id)
  }
}

function removeToast(id: string) {
  store.remove(id)
}

onMounted(() => {
  eventBus.on('toggle-notification-queue', toggleVisibility)
  visibilityProgress.value = 1
  expandProgress.value = 0
})

onBeforeUnmount(() => {
  eventBus.off('toggle-notification-queue', toggleVisibility)
  if (visibilityRaf) cancelAnimationFrame(visibilityRaf)
  if (expandRaf) cancelAnimationFrame(expandRaf)
})
</script>

<style scoped>
.toast-stack-container {
  position: fixed;
  bottom: 48px;
  right: 16px;
  width: 356px;
  height: 500px;
  pointer-events: none;
  z-index: 9999;
  perspective: 1200px;
}

.toast-stack-container.is-visible {
  pointer-events: auto;
}

.toast-stack {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
}

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
  will-change: transform, opacity;
  backface-visibility: hidden;
}

.stack-toast:hover {
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
}

.stack-toast.toast-success { border-left: 4px solid hsl(var(--success)); }
.stack-toast.toast-error { border-left: 4px solid hsl(var(--destructive)); }
.stack-toast.toast-warning { border-left: 4px solid hsl(38 92% 50%); }
.stack-toast.toast-info { border-left: 4px solid hsl(var(--primary)); }

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
  transition: opacity 150ms ease;
  border: none;
}

.stack-toast:hover .toast-close {
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

.stack-toast.toast-success .toast-icon { color: hsl(var(--success)); }
.stack-toast.toast-error .toast-icon { color: hsl(var(--destructive)); }
.stack-toast.toast-warning .toast-icon { color: hsl(38 92% 50%); }
.stack-toast.toast-info .toast-icon { color: hsl(var(--primary)); }

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
}

.toast-unread.type-success { background: hsl(var(--success)); }
.toast-unread.type-error { background: hsl(var(--destructive)); }
.toast-unread.type-warning { background: hsl(38 92% 50%); }
.toast-unread.type-info { background: hsl(var(--primary)); }

.stack-toast.is-read {
  opacity: 0.7;
}
</style>
