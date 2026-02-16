<template>
  <form class="chat-composer" @submit.prevent="handleSubmit">
    <div
      class="composer-shell"
      :class="{ 'is-multiline': isMultiline }"
      :style="{
        backgroundColor: themeState.currentTheme.background,
        color: themeState.currentTheme.textColor,
        borderColor: themeState.currentTheme.background2nd ?? 'rgba(0,0,0,0.08)'
      }"
    >
      <div class="composer-leading">
        <el-tooltip v-if="showAttach" :content="t('aiChat.attachTooltip')" placement="top">
          <el-button
            circle
            class="composer-btn"
            :disabled="disabled"
            @click.prevent="handleSelectFiles"
          >
            <el-icon><Paperclip /></el-icon>
          </el-button>
        </el-tooltip>
      </div>

      <el-scrollbar
        ref="scrollbarRef"
        class="composer-scroll"
        :wrap-style="scrollbarWrapStyle"
        :view-class="'composer-scroll-view'"
      >
        <textarea
          ref="textareaRef"
          :value="modelValue"
          class="composer-textarea"
          :placeholder="placeholder || t('aiChat.inputPlaceholder')"
          :disabled="disabled"
          rows="1"
          @input="handleInput"
          @keydown="handleKeydown"
        />
      </el-scrollbar>

      <div class="composer-actions">
        <div class="composer-send-switch">
          <el-tooltip :content="t('aiChat.changeSendMode')" placement="top">
            <el-button
              class="composer-send-toggle"
              size="small"
              text
              @click.prevent="toggleSendMode"
            >
              {{ sendModeLabel }}
            </el-button>
          </el-tooltip>
        </div>

        <el-tooltip v-if="showVoice" :content="t('aiChat.voiceTooltip')" placement="top">
          <el-button
            circle
            class="composer-btn"
            :disabled="disabled"
            @click.prevent="emit('voice')"
          >
            <Microphone />
          </el-button>
        </el-tooltip>

        <el-tooltip
          :content="loading ? t('aiChat.cancelTooltip') : t('aiChat.sendTooltip')"
          placement="top"
        >
          <el-button
            circle
            class="composer-btn primary"
            :type="loading ? 'danger' : 'primary'"
            :loading="false"
            :disabled="disabled || (loading ? false : !modelValue.trim().length)"
            @click.prevent="loading ? emit('cancel') : handleSubmit()"
          >
            <el-icon v-if="!loading"><ArrowUp /></el-icon>
            <el-icon v-else class="stop-icon">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </el-icon>
          </el-button>
        </el-tooltip>

        <el-tooltip
          v-if="showKnowledgeBase"
          :content="t('aiChat.knowledgeBaseTooltip')"
          placement="top"
        >
          <el-button
            circle
            class="composer-btn"
            :class="{ 'composer-btn-knowledge-base-active': enableKnowledgeBaseQuery }"
            :disabled="disabled || !knowledgeBaseEnabled"
            :type="enableKnowledgeBaseQuery ? 'primary' : 'default'"
            @click.prevent="toggleKnowledgeBaseQuery"
          >
            <el-icon><Connection /></el-icon>
          </el-button>
        </el-tooltip>

        <el-tooltip :content="t('aiChat.resetTooltip', '重置')" placement="top">
          <el-button
            circle
            class="composer-btn"
            :disabled="disabled"
            @click.prevent="emit('reset')"
          >
            <el-icon><Refresh /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick, onBeforeUnmount, computed } from 'vue'
import { Paperclip, Microphone, ArrowUp, Refresh, Close, Connection } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { themeState } from '../../utils/themes'
import type { ScrollbarInstance } from 'element-plus'
import { selectReferenceFiles } from '../../utils/agent-framework/reference-processor'

const props = withDefaults(
  defineProps<{
    modelValue: string
    loading?: boolean
    disabled?: boolean
    placeholder?: string
    showAttach?: boolean
    showVoice?: boolean
    showCancel?: boolean
    showKnowledgeBase?: boolean
    enableKnowledgeBaseQuery?: boolean
  }>(),
  {
    modelValue: '',
    loading: false,
    disabled: false,
    placeholder: '',
    showAttach: false,
    showVoice: false,
    showCancel: false,
    showKnowledgeBase: false,
    enableKnowledgeBaseQuery: false
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit', enableKnowledgeBaseQuery?: boolean): void
  (e: 'reset'): void
  (e: 'attach', file?: File | File[]): void
  (e: 'voice'): void
  (e: 'cancel'): void
  (e: 'update:enableKnowledgeBaseQuery', value: boolean): void
}>()

const { t } = useI18n()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const scrollbarRef = ref<ScrollbarInstance | null>(null)
const maxScrollHeight = ref(0)
const singleLineHeight = ref<number | null>(null)
const isMultiline = ref(false)
const SEND_PREF_KEY = 'meta-doc-chat-send-on-enter'
const sendOnEnter = ref(true)
const knowledgeBaseEnabled = ref(false)
const enableKnowledgeBaseQuery = ref(props.enableKnowledgeBaseQuery)

const updateMaxScrollHeight = () => {
  maxScrollHeight.value = Math.max(180, Math.floor(window.innerHeight * 0.3))
}

const scrollbarWrapStyle = computed(() => ({
  maxHeight: `${maxScrollHeight.value}px`,
  overflowX: 'hidden',
  overflowY: 'auto'
}))

const multilineThreshold = 6
const autoResize = () => {
  if (!textareaRef.value) return
  const el = textareaRef.value
  const content = el.value || props.modelValue || ''

  // 先计算单行高度（如果还没有计算）
  if (!singleLineHeight.value) {
    // 临时设置内容为空，计算单行高度
    const originalValue = el.value
    el.value = ''
    el.style.height = 'auto'
    const style = window.getComputedStyle(el)
    const lineHeight = parseFloat(style.lineHeight || '0')
    const padding = parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0')
    const base = Math.ceil(lineHeight + padding)
    singleLineHeight.value = base > 0 ? base : el.scrollHeight
    // 恢复原始值
    el.value = originalValue
  }

  // 如果内容为空，强制设置为单行模式
  if (!content.trim()) {
    el.style.height = 'auto'
    isMultiline.value = false
    if (singleLineHeight.value) {
      el.style.height = `${singleLineHeight.value}px`
    }
    nextTick(() => {
      scrollbarRef.value?.update()
    })
    return
  }

  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
  if (singleLineHeight.value) {
    const lines = Math.round(el.scrollHeight / singleLineHeight.value)
    isMultiline.value = lines > multilineThreshold
  } else {
    isMultiline.value = false
  }
  nextTick(() => {
    scrollbarRef.value?.update()
    const wrap = scrollbarRef.value?.wrapRef
    if (wrap && wrap.scrollHeight > wrap.clientHeight) {
      wrap.scrollTop = wrap.scrollHeight
    }
  })
}

const handleInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
  autoResize()
}

const handleSubmit = () => {
  if (props.disabled || !props.modelValue.trim().length) return
  emit('submit', enableKnowledgeBaseQuery.value)
}

const toggleKnowledgeBaseQuery = () => {
  if (!knowledgeBaseEnabled.value || props.disabled) return
  enableKnowledgeBaseQuery.value = !enableKnowledgeBaseQuery.value
  emit('update:enableKnowledgeBaseQuery', enableKnowledgeBaseQuery.value)
}

const handleKeydown = (event: KeyboardEvent) => {
  if (props.disabled) return
  if (event.key !== 'Enter') return
  const isModifierPressed = event.altKey || event.shiftKey
  if (sendOnEnter.value) {
    if (!isModifierPressed && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      handleSubmit()
    }
  } else {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }
}

const sendModeLabel = computed(() =>
  sendOnEnter.value ? t('aiChat.enterToSend') : t('aiChat.ctrlEnterToSend')
)

const toggleSendMode = () => {
  sendOnEnter.value = !sendOnEnter.value
}

/**
 * 将文件路径转换为 File 对象
 */
async function pathToFile(filePath: string): Promise<File> {
  // 获取IPC渲染器
  let ipcRenderer: any = null
  if (typeof window !== 'undefined') {
    if ((window as any).electron?.ipcRenderer) {
      ipcRenderer = (window as any).electron.ipcRenderer
    } else {
      const { localIpcRenderer } = await import('../../utils/web-adapter/local-ipc-renderer')
      ipcRenderer = localIpcRenderer
    }
  }

  if (!ipcRenderer) {
    throw new Error('IPC渲染器不可用')
  }

  // 通过 IPC 调用主进程读取文件
  const result = (await ipcRenderer.invoke('read-file-for-upload', filePath)) as {
    name: string
    data: string
    mimeType: string
  }

  // 将 base64 转换为 Blob
  const binaryString = atob(result.data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: result.mimeType })

  return new File([blob], result.name, { type: result.mimeType })
}

/**
 * 处理文件选择
 */
const handleSelectFiles = async () => {
  if (props.disabled) return

  try {
    // 使用主进程文件选择服务
    const filePaths = await selectReferenceFiles('all', true, t('aiChat.attachTooltip'))

    if (filePaths.length === 0) {
      return // 用户取消了选择
    }

    // 将文件路径转换为 File 对象
    const files: File[] = []
    for (const filePath of filePaths) {
      try {
        const file = await pathToFile(filePath)
        files.push(file)
      } catch (error) {
        console.error(`无法读取文件 ${filePath}:`, error)
      }
    }

    if (files.length > 0) {
      // 发送所有文件（单个文件发送 File，多个文件发送数组）
      emit('attach', files.length === 1 ? files[0] : files)
    }
  } catch (error) {
    console.error('文件选择失败:', error)
  }
}

watch(
  () => props.modelValue,
  () => {
    nextTick(autoResize)
  }
)

watch(
  () => props.enableKnowledgeBaseQuery,
  (value) => {
    enableKnowledgeBaseQuery.value = value
  }
)

watch(sendOnEnter, (value) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SEND_PREF_KEY, String(value))
})

// 检查知识库总开关状态
const checkKnowledgeBaseEnabled = async () => {
  const { getSetting } = await import('../../utils/settings.js')
  knowledgeBaseEnabled.value = (await getSetting('enableKnowledgeBase')) || false
  // 如果总开关关闭，确保查询开关也关闭
  if (!knowledgeBaseEnabled.value) {
    enableKnowledgeBaseQuery.value = false
    emit('update:enableKnowledgeBaseQuery', false)
  }
}

onMounted(async () => {
  updateMaxScrollHeight()
  window.addEventListener('resize', updateMaxScrollHeight)
  // 确保初始状态为单行模式
  isMultiline.value = false
  // 等待 DOM 完全渲染后再调整大小
  await nextTick()
  // 强制设置为单行高度
  if (textareaRef.value) {
    const el = textareaRef.value
    el.style.height = 'auto'
    // 先计算单行高度
    const style = window.getComputedStyle(el)
    const lineHeight = parseFloat(style.lineHeight || '0') || 24
    const padding = parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0')
    singleLineHeight.value = Math.ceil(lineHeight + padding) || 24
    el.style.height = `${singleLineHeight.value}px`
    isMultiline.value = false
  }
  // 然后再调用 autoResize 确保状态正确
  nextTick(() => {
    autoResize()
  })
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(SEND_PREF_KEY)
    if (stored !== null) {
      sendOnEnter.value = stored === 'true'
    }
  }
  await checkKnowledgeBaseEnabled()

  // 监听知识库总开关变化
  const eventBus = (await import('../../utils/event-bus.js')).default
  eventBus.on('knowledge-base-toggle', () => {
    checkKnowledgeBaseEnabled()
  })
})

onBeforeUnmount(async () => {
  // 清理事件监听
  const eventBus = (await import('../../utils/event-bus.js')).default
  eventBus.off('knowledge-base-toggle')
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateMaxScrollHeight)
})
</script>

<style scoped>
.chat-composer {
  width: 100%;
  display: flex;
  justify-content: center;
}

.composer-shell {
  width: min(960px, 100%);
  border-radius: 28px;
  border: 1px solid transparent;
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.08);
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  padding: 16px;
  align-items: flex-end;
  transition:
    background-color 0.2s,
    color 0.2s,
    border-color 0.2s;
  overflow: hidden;
  position: relative;
  z-index: 10;
}

.composer-shell.is-multiline {
  grid-template-columns: 1fr;
  align-items: stretch;
}

.composer-leading {
  display: flex;
  align-items: center;
  align-self: flex-end;
}

.composer-shell.is-multiline .composer-leading {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 10;
  align-self: auto;
}

.composer-scroll {
  width: 100%;
  min-width: 0;
}

.composer-shell.is-multiline .composer-scroll {
  width: 100%;
  padding-right: 0;
}

.composer-scroll :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
  overflow-y: auto;
  padding-bottom: 0;
}

.composer-scroll :deep(.el-scrollbar__view) {
  width: 100%;
}

.composer-scroll :deep(.el-scrollbar__bar.is-horizontal) {
  display: none;
}

.composer-shell.is-multiline .composer-scroll :deep(.el-scrollbar__wrap) {
  padding-bottom: 28px;
  padding-left: 48px;
}

.composer-textarea {
  width: 100%;
  background: transparent;
  border: none;
  resize: none;
  outline: none;
  font-size: 16px;
  line-height: 1.5;
  color: inherit;
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  padding: 0;
  margin: 0;
  min-height: 24px;
  vertical-align: bottom;
}

.composer-textarea::placeholder {
  color: rgba(128, 128, 128, 0.8);
}

.composer-textarea::-webkit-scrollbar,
.composer-textarea::-webkit-scrollbar-thumb,
.composer-textarea::-webkit-scrollbar-track {
  display: none;
}

.composer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  align-self: flex-end;
}

.composer-send-switch {
  display: flex;
  align-items: center;
}

.composer-send-toggle {
  padding: 2px 8px;
  font-size: 12px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.composer-shell.is-multiline .composer-actions {
  position: absolute;
  bottom: 16px;
  right: 16px;
  align-items: flex-end;
}

.composer-btn {
  background: rgba(0, 0, 0, 0.04);
  border: none;
  color: inherit;
  transition:
    transform 0.15s ease,
    background 0.2s ease;
}

.composer-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.composer-btn.primary {
  background: var(--el-color-primary);
  color: #fff;
}

.composer-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.composer-btn-knowledge-base-active {
  background: var(--el-color-primary) !important;
  color: #fff !important;
  border-color: var(--el-color-primary) !important;
}

.composer-btn-knowledge-base-active:hover:not(:disabled) {
  background: var(--el-color-primary-light-3) !important;
  border-color: var(--el-color-primary-light-3) !important;
}

.stop-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
