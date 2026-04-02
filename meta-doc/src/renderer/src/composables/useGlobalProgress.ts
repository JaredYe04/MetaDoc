import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import eventBus from '../utils/event-bus'
import { useWorkspace } from '../stores/workspace'

export interface GlobalProgressEvent {
  visible: boolean
  message?: string
  subMessage?: string
  percentage?: number
  status?: 'success' | 'exception' | 'warning' | ''
  showPercentage?: boolean
  canCancel?: boolean
  requestId?: string
  params?: Record<string, unknown>
}

/**
 * 全局进度条状态（原 GlobalProgressBar）：由 eventBus `global-progress` 驱动，供 BottomMenu 等嵌入展示。
 */
export function useGlobalProgress() {
  const { t } = useI18n()
  const workspace = useWorkspace()

  const visible = ref(false)
  const message = ref('')
  const subMessage = ref('')
  const percentage = ref(0)
  const status = ref<'success' | 'exception' | 'warning' | ''>('')
  const showPercentage = ref(true)
  const canCancel = ref(false)
  const currentRequestId = ref<string | null>(null)
  const completedRequestIds = new Set<string>()

  const uiLocked = ref(false)

  const handleProgressEvent = (event: GlobalProgressEvent | unknown) => {
    const evt = event as GlobalProgressEvent
    const isVisible = evt.visible !== false
    const requestId = evt.requestId

    if (requestId && completedRequestIds.has(requestId)) {
      return
    }

    if (!isVisible && currentRequestId.value) {
      completedRequestIds.add(currentRequestId.value)
      if (completedRequestIds.size > 10) {
        const idsArray = Array.from(completedRequestIds)
        const toRemove = idsArray.slice(0, idsArray.length - 10)
        toRemove.forEach((id) => completedRequestIds.delete(id))
      }
    }

    if (isVisible && !uiLocked.value) {
      workspace.lockUI?.()
      uiLocked.value = true
    } else if (!isVisible && uiLocked.value) {
      workspace.unlockUI?.()
      uiLocked.value = false
    }

    if (!isVisible) {
      visible.value = false
      setTimeout(() => {
        message.value = ''
        subMessage.value = ''
        percentage.value = 0
        status.value = ''
        canCancel.value = false
        currentRequestId.value = null
      }, 300)
    } else {
      visible.value = true
      const params = evt.params || {}
      const msg = evt.message || ''
      const subMsg = evt.subMessage || ''
      message.value = msg ? t(msg, params as Record<string, unknown>) : ''
      subMessage.value = subMsg ? t(subMsg, params as Record<string, unknown>) : ''

      const percent =
        typeof evt.percentage === 'number' ? Math.max(0, Math.min(100, evt.percentage)) : 0
      percentage.value = Math.round(percent * 100) / 100
      status.value = evt.status || ''
      showPercentage.value = evt.showPercentage !== false
      canCancel.value = evt.canCancel !== false && evt.requestId !== undefined
      if (evt.requestId) {
        currentRequestId.value = evt.requestId
      }
    }
  }

  onMounted(() => {
    eventBus.on('global-progress', handleProgressEvent)
  })

  onUnmounted(() => {
    eventBus.off('global-progress', handleProgressEvent)
    if (uiLocked.value) {
      workspace.unlockUI?.()
      uiLocked.value = false
    }
  })

  return {
    visible,
    message,
    subMessage,
    percentage,
    status,
    showPercentage,
    canCancel,
    currentRequestId
  }
}
