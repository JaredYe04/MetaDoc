<template>
  <transition name="progress-fade">
    <div v-if="visible" class="global-progress-bar" :style="progressBarStyle">
      <div class="progress-content">
        <div class="progress-info">
          <span class="progress-message">{{ message }}</span>
          <span v-if="subMessage" class="progress-sub-message">{{ subMessage }}</span>
        </div>
        <div class="progress-bar-container">
          <Progress :model-value="percentage" :class="progressClass" class="h-1" />
          <span v-if="showPercentage" class="progress-percentage"
            >{{ Math.round(percentage) }}%</span
          >
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Progress } from '@renderer/components/ui/progress'
import { Close } from '@element-plus/icons-vue'
import eventBus from '../utils/event-bus'
import { themeState } from '../utils/themes'
import { useI18n } from 'vue-i18n'
import { useWorkspace } from '../stores/workspace'

const { t } = useI18n()
const workspace = useWorkspace()

interface ProgressEvent {
  visible: boolean
  message?: string
  subMessage?: string
  percentage?: number
  status?: 'success' | 'exception' | 'warning' | ''
  showPercentage?: boolean
  canCancel?: boolean
  requestId?: string
  params?: Record<string, any>
}

const visible = ref(false)
const message = ref('')
const subMessage = ref('')
const percentage = ref(0)
const status = ref<'success' | 'exception' | 'warning' | ''>('')
const showPercentage = ref(true)
const canCancel = ref(false)
const currentRequestId = ref<string | null>(null)
// 跟踪已完成或已取消的requestId，用于忽略旧任务的进度更新
const completedRequestIds = new Set<string>()

const progressBarStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || 'rgba(255, 255, 255, 0.95)',
  color: themeState.currentTheme.textColor || '#333',
  borderColor: themeState.currentTheme.borderColor || '#e4e7ed'
}))

// 根据状态计算进度条样式类
const progressClass = computed(() => {
  switch (status.value) {
    case 'success':
      return 'bg-green-500'
    case 'exception':
      return 'bg-red-500'
    case 'warning':
      return 'bg-yellow-500'
    default:
      return 'bg-primary'
  }
})

// 跟踪UI锁状态，避免重复锁定/解锁
const uiLocked = ref(false)

const handleProgressEvent = (event: ProgressEvent | unknown) => {
  const evt = event as ProgressEvent
  const isVisible = evt.visible !== false
  const requestId = evt.requestId

  // 如果事件有requestId，检查是否已完成或已取消
  if (requestId && completedRequestIds.has(requestId)) {
    // 忽略已完成或已取消任务的进度更新
    return
  }

  // 如果事件没有requestId，但当前有requestId，且事件是隐藏，则标记当前requestId为已完成
  if (!isVisible && currentRequestId.value) {
    completedRequestIds.add(currentRequestId.value)
    // 清理旧的已完成requestId（保留最近10个）
    if (completedRequestIds.size > 10) {
      const idsArray = Array.from(completedRequestIds)
      const toRemove = idsArray.slice(0, idsArray.length - 10)
      toRemove.forEach((id) => completedRequestIds.delete(id))
    }
  }

  // 如果事件有新的requestId，且与当前不同，说明新任务开始，清理旧任务标记
  if (requestId && requestId !== currentRequestId.value) {
    // 新任务开始，清理旧任务标记（可选，因为已经有Set管理）
  }

  // 管理UI锁：显示进度条时锁定，隐藏时解锁
  if (isVisible && !uiLocked.value) {
    workspace.lockUI?.()
    uiLocked.value = true
  } else if (!isVisible && uiLocked.value) {
    workspace.unlockUI?.()
    uiLocked.value = false
  }

  if (!isVisible) {
    // 隐藏进度条
    visible.value = false
    // 延迟重置状态，让动画完成
    setTimeout(() => {
      message.value = ''
      subMessage.value = ''
      percentage.value = 0
      status.value = ''
      canCancel.value = false
      currentRequestId.value = null
    }, 300)
  } else {
    // 显示进度条
    visible.value = true
    // 处理i18n翻译，支持参数替换
    const msg = evt.message || ''
    const subMsg = evt.subMessage || ''
    const params = evt.params || {}

    // 如果message是i18n key，使用t函数翻译，否则直接使用
    message.value = msg.includes('.') && msg.startsWith('agent.') ? t(msg, params) : msg
    subMessage.value =
      subMsg.includes('.') && subMsg.startsWith('agent.') ? t(subMsg, params) : subMsg

    // 确保百分比是数字类型，并在 0-100 范围内
    const percent =
      typeof evt.percentage === 'number' ? Math.max(0, Math.min(100, evt.percentage)) : 0
    percentage.value = Math.round(percent * 100) / 100 // 保留两位小数，避免浮点误差
    status.value = evt.status || ''
    showPercentage.value = evt.showPercentage !== false
    canCancel.value = evt.canCancel !== false && evt.requestId !== undefined
    if (evt.requestId) {
      currentRequestId.value = evt.requestId
    }
  }
}

const handleCancel = () => {
  // 标记当前requestId为已完成（已取消）
  if (currentRequestId.value) {
    completedRequestIds.add(currentRequestId.value)
  }

  // 发送取消事件
  eventBus.emit('cancel-progress', { requestId: currentRequestId.value })

  // 通过发送 visible: false 事件来统一处理隐藏和解锁
  handleProgressEvent({ visible: false })
}

onMounted(() => {
  eventBus.on('global-progress', handleProgressEvent)
})

onUnmounted(() => {
  eventBus.off('global-progress', handleProgressEvent)
  // 确保组件卸载时解锁UI
  if (uiLocked.value) {
    workspace.unlockUI?.()
    uiLocked.value = false
  }
})
</script>

<style scoped>
.global-progress-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  padding: 12px 20px;
  border-top: 1px solid;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
}

.progress-content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
}

.progress-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.progress-message {
  font-size: 14px;
  font-weight: 500;
}

.progress-sub-message {
  font-size: 12px;
  opacity: 0.7;
}

.progress-bar-container {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-percentage {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  opacity: 0.8;
}

.progress-actions {
  flex-shrink: 0;
}

.progress-fade-enter-active,
.progress-fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.progress-fade-enter-from {
  opacity: 0;
  transform: translateY(100%);
}

.progress-fade-leave-to {
  opacity: 0;
  transform: translateY(100%);
}
</style>
