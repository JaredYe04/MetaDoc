<template>
  <form
    class="chat-composer"
    @submit.prevent="handleSubmit"
    :class="{ 'chat-composer--compact': compact }"
  >
    <div
      class="composer-shell"
      :class="{ 'is-multiline': isMultiline }"
      :style="{
        backgroundColor: themeState.currentTheme.background,
        color: themeState.currentTheme.textColor,
        borderColor: themeState.currentTheme.background2nd ?? 'rgba(0,0,0,0.08)'
      }"
    >
      <div class="composer-leading" v-if="showAttach || $slots.leading">
        <slot name="leading">
          <Button
            v-if="showAttach"
            :title="t('aiChat.attachTooltip')"
            variant="ghost"
            size="icon"
            class="composer-btn"
            :disabled="disabled"
            @click.prevent="handleSelectFiles"
          >
            <Paperclip class="w-4 h-4" />
          </Button>
        </slot>
      </div>

      <el-scrollbar
        ref="scrollContainerRef"
        class="composer-scroll"
        :style="scrollContainerStyle"
        :wrap-style="scrollWrapStyle"
      >
        <AgentRefComposerInput
          v-if="showReferencePicker"
          ref="refInputRef"
          :model-value="modelValue"
          :get-at-label="getAtLabel"
          :placeholder="placeholder || t('aiChat.inputPlaceholder')"
          :disabled="disabled"
          @update:model-value="emit('update:modelValue', $event)"
          @open-reference-picker="emit('open-reference-picker')"
          @keydown="handleKeydown"
        />
        <textarea
          v-else
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
          <Button
            :title="t('aiChat.changeSendMode')"
            variant="ghost"
            size="sm"
            class="composer-send-toggle"
            @click.prevent="toggleSendMode"
          >
            {{ sendModeLabel }}
          </Button>
        </div>

        <Button
          v-if="showVoice"
          :title="t('aiChat.voiceTooltip')"
          variant="ghost"
          size="icon"
          class="composer-btn"
          :disabled="disabled"
          @click.prevent="emit('voice')"
        >
          <Mic class="w-4 h-4" />
        </Button>

        <Button
          :title="loading ? t('aiChat.cancelTooltip') : t('aiChat.sendTooltip')"
          :variant="loading ? 'destructive' : 'default'"
          size="icon"
          class="composer-btn"
          :disabled="loading ? false : (disabled || !hasContentToSend)"
          @click.prevent="loading ? emit('cancel') : handleSubmit()"
        >
          <ArrowUp v-if="!loading" class="w-4 h-4" />
          <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </Button>

        <Button
          v-if="showKnowledgeBase"
          :title="t('aiChat.knowledgeBaseTooltip')"
          :variant="enableKnowledgeBaseQuery ? 'default' : 'ghost'"
          size="icon"
          class="composer-btn"
          :class="{ 'composer-btn-knowledge-base-active': enableKnowledgeBaseQuery }"
          :disabled="disabled || !knowledgeBaseEnabled"
          @click.prevent="toggleKnowledgeBaseQuery"
        >
          <Link class="w-4 h-4" />
        </Button>

        <Button
          v-if="showReset"
          :title="t('aiChat.resetTooltip', '重置')"
          variant="ghost"
          size="icon"
          class="composer-btn"
          :disabled="disabled"
          @click.prevent="emit('reset')"
        >
          <RefreshCw class="w-4 h-4" />
        </Button>
      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick, onBeforeUnmount, computed } from 'vue'
import { Paperclip, Mic, ArrowUp, RefreshCw, Link } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { useI18n } from 'vue-i18n'
import { ElScrollbar } from 'element-plus'
import { themeState } from '../../utils/themes'
import { selectReferenceFiles } from '../../utils/agent-framework/reference-processor'
import messageBridge from '../../bridge/message-bridge'
import AgentRefComposerInput from '../agent/AgentRefComposerInput.vue'

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
    showReset?: boolean
    enableKnowledgeBaseQuery?: boolean
    /** 紧凑模式：小字号、小内边距、小圆角、小按钮 */
    compact?: boolean
    /** 是否在输入 @ 时触发打开选择器（插入 @path 或 @tab:id 到输入框） */
    showReferencePicker?: boolean
    /** 根据 @ 的原始值返回展示文案（如文件名、标签页标题） */
    getAtLabel?: (rawValue: string) => string
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
    showReset: true,
    enableKnowledgeBaseQuery: false,
    compact: false,
    showReferencePicker: false,
    getAtLabel: undefined
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
  (e: 'open-reference-picker'): void
}>()

const { t } = useI18n()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const refInputRef = ref<InstanceType<typeof AgentRefComposerInput> | null>(null)
const scrollContainerRef = ref<InstanceType<typeof ElScrollbar> | null>(null)
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

const scrollContainerStyle = computed(() => ({
  maxHeight: `${maxScrollHeight.value}px`
}))

const scrollWrapStyle = computed(() => ({
  overflowX: 'hidden',
  overflowY: 'auto'
}))

const effectiveInputTrim = computed(() => {
  const v = props.modelValue || ''
  return v.replace(/@\[[^\]]+\]/g, '').trim()
})

const hasContentToSend = computed(() => {
  const v = props.modelValue || ''
  if (!v) return false
  if (v.replace(/@\[[^\]]*\]/g, '').trim().length > 0) return true
  return /@\[[^\]]*\]/.test(v)
})

const multilineThreshold = 6
const autoResize = () => {
  if (props.showReferencePicker) return
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
      scrollToBottom()
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
    scrollToBottom()
  })
}

const scrollToBottom = () => {
  const el = scrollContainerRef.value?.$el as HTMLElement | undefined
  const wrap = el?.querySelector('.el-scrollbar__wrap') as HTMLElement | null
  if (wrap && wrap.scrollHeight > wrap.clientHeight) {
    wrap.scrollTop = wrap.scrollHeight
  }
}

const handleInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
  autoResize()
}

const handleSubmit = () => {
  if (props.disabled || !hasContentToSend.value) return
  emit('submit', enableKnowledgeBaseQuery.value)
}

const toggleKnowledgeBaseQuery = () => {
  if (!knowledgeBaseEnabled.value || props.disabled) return
  enableKnowledgeBaseQuery.value = !enableKnowledgeBaseQuery.value
  emit('update:enableKnowledgeBaseQuery', enableKnowledgeBaseQuery.value)
}

const handleKeydown = (event: KeyboardEvent) => {
  if (props.disabled) return
  if (event.key === '@' && props.showReferencePicker) {
    emit('open-reference-picker')
    return
  }
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
  const result = (await messageBridge.invoke('read-file-for-upload', filePath)) as {
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
    if (props.showReferencePicker) {
      const text = props.modelValue || ''
      const lines = text.split(/\n/).length
      const textOnlyLen = text.replace(/@\[[^\]]*\]/g, '').length
      isMultiline.value = lines > multilineThreshold || textOnlyLen > 400
    } else {
      nextTick(autoResize)
    }
  },
  { immediate: true }
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

defineExpose({
  /** 在光标处插入 @path 或 @tab:tabId（仅当 showReferencePicker 时有效） */
  insertAtCursor(value: string) {
    refInputRef.value?.insertAtCursor(value)
  },
  insertRefAtCursor(value: string) {
    refInputRef.value?.insertAtCursor(value)
  }
})

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

/* 紧凑模式：占满 panel 宽度，长文本时输入框右边界为 panel 边界 */
.chat-composer--compact .composer-shell {
  width: 100%;
  border-radius: 5px;
  padding: 4px 6px;
  gap: 4px;
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.06);
}

.chat-composer--compact .composer-textarea {
  font-size: 13px;
  line-height: 1.4;
  min-height: 20px;
}

.chat-composer--compact .composer-actions {
  gap: 2px;
}

.chat-composer--compact .composer-send-toggle {
  padding: 1px 4px;
  font-size: 10px;
  border-radius: 4px;
}

.chat-composer--compact .composer-btn {
  width: 22px;
  height: 22px;
  padding: 0;
}

.chat-composer--compact .composer-btn .w-4.h-4,
.chat-composer--compact .composer-btn svg {
  width: 12px;
  height: 12px;
}

.chat-composer--compact .composer-shell.is-multiline .composer-leading,
.chat-composer--compact .composer-shell.is-multiline .composer-actions {
  bottom: 6px;
}

.chat-composer--compact .composer-shell.is-multiline .composer-scroll {
  padding-bottom: 20px;
  padding-left: 28px;
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

.composer-scroll :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
  overflow-y: auto;
}

.composer-scroll :deep(.el-scrollbar__view) {
  width: 100%;
}

.composer-shell.is-multiline .composer-scroll {
  width: 100%;
  padding-right: 0;
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
  height: auto;
  background: transparent;
}

.composer-shell.is-multiline .composer-actions {
  position: absolute;
  bottom: 16px;
  right: 16px;
  align-items: flex-end;
}

.composer-btn {
  transition:
    transform 0.15s ease,
    background 0.2s ease;
}

.composer-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.composer-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.composer-btn-knowledge-base-active {
  background: hsl(var(--primary)) !important;
  color: hsl(var(--primary-foreground)) !important;
}

.composer-btn-knowledge-base-active:hover:not(:disabled) {
  background: hsl(var(--primary) / 0.9) !important;
}
</style>
