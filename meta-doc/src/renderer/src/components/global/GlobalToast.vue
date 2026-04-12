<template>
  <Teleport to="body">
    <div class="global-toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="item in store.items"
          :key="item.id"
          class="global-toast"
          :class="[`toast-${item.type}`]"
          :style="getToastStyle(item.type)"
          @click="store.removeToast(item.id)"
        >
          <component :is="getIcon(item.type)" class="toast-icon" :style="{ color: typeColors[item.type].icon }" />
          <span class="toast-message">{{ item.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useToastStore } from '../../stores/toast'
import { themeState } from '../../utils/themes'
import { CheckCircle2, XCircle, AlertCircle, Info } from 'lucide-vue-next'
import type { ToastType } from '../../stores/toast'

const store = useToastStore()

const typeColors: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: '#22c55e20', border: '#22c55e', icon: '#22c55e' },
  error: { bg: '#ef444420', border: '#ef4444', icon: '#ef4444' },
  warning: { bg: '#f59e0b20', border: '#f59e0b', icon: '#f59e0b' },
  info: { bg: '#3b82f620', border: '#3b82f6', icon: '#3b82f6' }
}

function getToastStyle(type: ToastType) {
  const base = themeState.currentTheme
  const colors = typeColors[type]
  const isDark = base.type === 'dark'
  return {
    backgroundColor: isDark ? base.background2nd || base.background : base.background,
    color: base.textColor,
    borderColor: colors.border
  }
}

function getIcon(type: ToastType) {
  const icons = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertCircle,
    info: Info
  }
  return icons[type]
}
</script>

<style scoped>
/* 顶层：z-index 100002，与 GlobalMessageBox 同级，低于顶栏浮动层 300000 */
.global-toast-container {
  position: fixed;
  top: 48px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100002;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 0;
  pointer-events: none;
}

.global-toast-container > * {
  pointer-events: auto;
}

.global-toast {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 280px;
  max-width: 480px;
  padding: 12px 16px;
  border-radius: 10px;
  border: 1px solid;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.global-toast:hover {
  opacity: 0.95;
}

.toast-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
}

.toast-message {
  flex: 1;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

.toast-move {
  transition: transform 0.25s ease;
}
</style>
