<template>
  <div
    ref="containerRef"
    class="toast-stack-container"
    :class="{
      'is-visible': isVisible,
      'is-expanded': isExpanded,
      'has-notifications': notifications.length > 0
    }"
  >
    <!-- 3D 堆叠的通知 -->
    <div
      ref="toastStackRef"
      class="toast-stack"
      :class="{ 'is-expanded': isExpanded }"
      @mouseenter="handleStackMouseEnter"
      @mouseleave="handleStackMouseLeave"
    >
      <div
        v-for="(toast, index) in notifications"
        :key="toast.id"
        class="stack-toast"
        :class="[`toast-${toast.type}`, { 'is-read': toast.read }]"
        :style="getToastStyle(index)"
        @click="handleToastClick($event, toast)"
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

        <div v-if="!toast.read" class="toast-unread" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, type Component } from 'vue'
import { storeToRefs } from 'pinia'
import { useNotificationStore } from '../stores/notification'
import eventBus from '../utils/event-bus'
import type { NotificationType, NotificationItem } from '../types/notification'
import { X, CheckCircle2, XCircle, AlertCircle, Info } from 'lucide-vue-next'

const store = useNotificationStore()
const { notifications } = storeToRefs(store)

const containerRef = ref<HTMLElement | null>(null)
const toastStackRef = ref<HTMLElement | null>(null)

// 三个状态：隐藏(0) / 堆叠(1) / 展开(2)
// 使用两个布尔值组合：isVisible + isExpanded
const isVisible = ref(false) // false=隐藏/docked, true=显示
const isExpanded = ref(false) // false=3D堆叠, true=展开列表

// 动画进度
const visibilityProgress = ref(0)
const expandProgress = ref(0)
let visibilityRaf: number | null = null
let expandRaf: number | null = null

// 自动隐藏计时器
let autoHideTimer: ReturnType<typeof setTimeout> | null = null
const AUTO_HIDE_DELAY = 2000 // 2000ms 后自动隐藏

// 鼠标离开延迟计时器（处理展开态间隙问题）
let mouseLeaveTimer: ReturnType<typeof setTimeout> | null = null
const MOUSE_LEAVE_DELAY = 500 // 500ms 延迟，允许在间隙间滑动

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

  // 关键：只有可见时才启用点击，docked 态时所有 toast 都不拦截点击
  const canInteract = isVisible.value && vProgress > 0.5

  return {
    transform: `translate3d(0, ${finalY}px, ${finalZ}px) scale(${finalScale})`,
    opacity: finalOpacity,
    zIndex: Math.round((10 + 90 * eProgress - index) * vProgress),
    pointerEvents: canInteract ? 'auto' : 'none'
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
    expandProgress.value += diff * 0.12
    expandRaf = requestAnimationFrame(step)
  }
  expandRaf = requestAnimationFrame(step)
}

function toggleVisibility() {
  console.log('[NotificationStack] toggleVisibility called, current isVisible:', isVisible.value)
  const newVisible = !isVisible.value
  isVisible.value = newVisible
  animateVisibility(newVisible ? 1 : 0)
  console.log('[NotificationStack] toggled to:', newVisible)

  // 如果手动呼出，启动自动隐藏计时器
  if (newVisible && !isExpanded.value) {
    startAutoHideTimer()
  } else if (!newVisible) {
    // 如果手动缩回，清除计时器
    clearAutoHideTimer()
  }
}

function handleStackMouseEnter() {
  // 清除所有计时器
  clearAutoHideTimer()
  if (mouseLeaveTimer) {
    clearTimeout(mouseLeaveTimer)
    mouseLeaveTimer = null
  }

  if (isVisible.value) {
    isExpanded.value = true
    animateExpand(1)
  }
}

function handleStackMouseLeave() {
  // 延迟处理 mouseleave，允许在 toast 间隙间滑动
  mouseLeaveTimer = setTimeout(() => {
    isExpanded.value = false
    animateExpand(0)

    // 启动自动隐藏计时器（仅在堆叠态时）
    if (isVisible.value && !isExpanded.value) {
      startAutoHideTimer()
    }
  }, MOUSE_LEAVE_DELAY)
}

function startAutoHideTimer() {
  // 清除旧计时器
  if (autoHideTimer) {
    clearTimeout(autoHideTimer)
  }

  // 2000ms 后自动隐藏到 docked 态
  autoHideTimer = setTimeout(() => {
    if (isVisible.value && !isExpanded.value) {
      // 只有在仍然处于堆叠态时才隐藏
      isVisible.value = false
      animateVisibility(0)
    }
  }, AUTO_HIDE_DELAY)
}

function clearAutoHideTimer() {
  if (autoHideTimer) {
    clearTimeout(autoHideTimer)
    autoHideTimer = null
  }
}

function clearMouseLeaveTimer() {
  if (mouseLeaveTimer) {
    clearTimeout(mouseLeaveTimer)
    mouseLeaveTimer = null
  }
}

function handleToastMouseEnter(index: number) {
  // 鼠标在任意 toast 上时重置所有计时器
  clearAutoHideTimer()
  clearMouseLeaveTimer()
}

function handleToastClick(event: MouseEvent, toast: NotificationItem) {
  // 阻止事件冒泡，防止触发 toggle
  event.stopPropagation()
  if (!toast.read) {
    store.markAsRead(toast.id)
  }
}

function removeToast(id: string) {
  store.remove(id)
}

onMounted(() => {
  eventBus.on('toggle-notification-queue', toggleVisibility)
  // 初始状态：docked（隐藏），除非有未读通知
  if (notifications.value.length > 0 && notifications.value.some((n) => !n.read)) {
    isVisible.value = true
    visibilityProgress.value = 1
  } else {
    isVisible.value = false
    visibilityProgress.value = 0
  }
  expandProgress.value = 0
})

// 监听展开状态变化，展开时清除自动隐藏计时器
watch(isExpanded, (expanded) => {
  if (expanded) {
    // 展开时清除计时器
    clearAutoHideTimer()
  } else if (isVisible.value) {
    // 从展开回到堆叠态时，重新启动计时器
    startAutoHideTimer()
  }
})

// 监听通知列表变化，为空时清除计时器
watch(notifications, (notifs) => {
  if (notifs.length === 0) {
    clearAutoHideTimer()
  }
})

onBeforeUnmount(() => {
  eventBus.off('toggle-notification-queue', toggleVisibility)
  if (visibilityRaf) cancelAnimationFrame(visibilityRaf)
  if (expandRaf) cancelAnimationFrame(expandRaf)
  clearAutoHideTimer()
  clearMouseLeaveTimer()
})
</script>

<style scoped>
.toast-stack-container {
  position: fixed;
  bottom: 48px;
  right: 16px;
  width: 356px;
  height: 500px;
  /* 容器始终不拦截点击，由每个 toast 自己控制 */
  pointer-events: none;
  z-index: 9999;
  perspective: 1200px;
}

.toast-stack {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  /* 堆叠容器也不拦截点击，由每个 toast 自己控制 */
  pointer-events: none;
}

/* 展开态时使用 flex 布局 */
.toast-stack.is-expanded {
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
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
  /* 默认不拦截点击，由 JS 根据状态动态设置 */
  pointer-events: none;
  transition:
    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 展开态时的 toast 样式 */
.toast-stack-container.is-expanded .stack-toast {
  /* 展开态时移除 absolute 定位，使用 flex 布局自然排列 */
  position: relative !important;
  bottom: auto !important;
  left: auto !important;
  right: auto !important;
  transform: none !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  margin-bottom: 0 !important;
  will-change: auto !important;
}

/* docked 态（不可见）：滑出屏幕 */
.toast-stack-container:not(.is-visible) .stack-toast {
  transform: translate3d(0, 150px, 0) scale(0.8) !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

/* 堆叠态（可见但未展开）：3D 堆叠效果 */
.toast-stack-container.is-visible:not(.is-expanded) .stack-toast {
  pointer-events: auto;
}

.toast-stack-container.is-visible:not(.is-expanded) .stack-toast:nth-child(1) {
  transform: translate3d(0, 0, 0) scale(1);
  opacity: 1;
  z-index: 10;
}

.toast-stack-container.is-visible:not(.is-expanded) .stack-toast:nth-child(2) {
  transform: translate3d(0, 12px, -30px) scale(0.97);
  opacity: 0.85;
  z-index: 9;
}

.toast-stack-container.is-visible:not(.is-expanded) .stack-toast:nth-child(3) {
  transform: translate3d(0, 24px, -60px) scale(0.94);
  opacity: 0.7;
  z-index: 8;
}

/* 堆叠态只显示前 3 个 */
.toast-stack-container.is-visible:not(.is-expanded) .stack-toast:nth-child(n + 4) {
  opacity: 0;
  pointer-events: none;
}

.stack-toast:hover {
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
  transition: box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.stack-toast.toast-success {
  border-left: 4px solid hsl(var(--success));
}
.stack-toast.toast-error {
  border-left: 4px solid hsl(var(--destructive));
}
.stack-toast.toast-warning {
  border-left: 4px solid hsl(38 92% 50%);
}
.stack-toast.toast-info {
  border-left: 4px solid hsl(var(--primary));
}

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

.stack-toast.toast-success .toast-icon {
  color: hsl(var(--success));
}
.stack-toast.toast-error .toast-icon {
  color: hsl(var(--destructive));
}
.stack-toast.toast-warning .toast-icon {
  color: hsl(38 92% 50%);
}
.stack-toast.toast-info .toast-icon {
  color: hsl(var(--primary));
}

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

.stack-toast.is-read {
  opacity: 0.7;
}
</style>
