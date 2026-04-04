<template>
  <form
    class="chat-composer"
    @submit.prevent="handleSubmit"
    :class="{ 'chat-composer--compact': compact }"
  >
    <div
      class="composer-shell"
      :class="{
        'is-multiline': isMultiline,
        'composer-shell--no-leading': !isMultiline && !hasLeadingColumn
      }"
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
          v-if="showPrimarySubmit || showPrimaryAsStop || showPrimaryAsQueueSend"
          :title="
            showPrimaryAsStop
              ? t('aiChat.cancelTooltip')
              : showPrimaryAsQueueSend
                ? t('aiChat.queueSendTooltip')
                : t('aiChat.sendTooltip')
          "
          :variant="showPrimaryAsStop ? 'destructive' : 'default'"
          size="icon"
          class="composer-btn"
          :disabled="showPrimaryAsStop ? false : disabled || !hasContentToSend"
          @click.prevent="showPrimaryAsStop ? emit('cancel') : handleSubmit()"
        >
          <ArrowUp v-if="!showPrimaryAsStop" class="w-4 h-4" />
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
          v-if="showReasoning"
          :title="t('aiChat.reasoningToggleTooltip')"
          :variant="enableReasoning ? 'default' : 'ghost'"
          size="icon"
          class="composer-btn"
          :class="{ 'composer-btn-reasoning-active': enableReasoning }"
          :disabled="disabled || loading"
          @click.prevent="toggleReasoning"
        >
          <Brain class="w-4 h-4" />
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
import { ref, watch, onMounted, nextTick, onBeforeUnmount, computed, useSlots } from 'vue'
import { Paperclip, Mic, ArrowUp, RefreshCw, Link, Brain } from 'lucide-vue-next'
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
    /** 显示「深度思考」开关（默认关闭；不展示时仍可通过 v-model 由父组件控制） */
    showReasoning?: boolean
    showReset?: boolean
    enableKnowledgeBaseQuery?: boolean
    /** 是否开启深度思考 / reasoning（默认 false） */
    enableReasoning?: boolean
    /** 紧凑模式：小字号、小内边距、小圆角、小按钮 */
    compact?: boolean
    /** 是否在输入 @ 时触发打开选择器（插入 @path 或 @tab:id 到输入框） */
    showReferencePicker?: boolean
    /** 根据 @ 的原始值返回展示文案（如文件名、标签页标题） */
    getAtLabel?: (rawValue: string) => string
    /** 为真时始终使用多行布局（如主页 Agent 输入区默认多行工具条） */
    forceMultilineLayout?: boolean
    /** 为真时允许在输入框无文字时仍发送（如主页仅带上传附件发送） */
    allowSendWithoutComposerText?: boolean
    /**
     * 生成中且为真时：输入框有内容则主按钮为发送（入队），无内容则为终止。
     * 未开启时保持原行为：生成中主按钮始终为终止。
     */
    queueWhileLoading?: boolean
    /**
     * 为假时隐藏主「发送」按钮；生成中仍会显示「停止」或入队发送（与 Graph 快速对话框首轮由页脚统一发送一致）
     */
    showPrimarySubmit?: boolean
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
    showReasoning: false,
    showReset: false,
    enableKnowledgeBaseQuery: false,
    enableReasoning: false,
    compact: false,
    showReferencePicker: false,
    getAtLabel: undefined,
    forceMultilineLayout: false,
    allowSendWithoutComposerText: false,
    queueWhileLoading: false,
    showPrimarySubmit: true
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit', enableKnowledgeBaseQuery?: boolean, content?: string, enableReasoning?: boolean): void
  (e: 'reset'): void
  (e: 'attach', file?: File | File[]): void
  (e: 'voice'): void
  (e: 'cancel'): void
  (e: 'update:enableKnowledgeBaseQuery', value: boolean): void
  (e: 'update:enableReasoning', value: boolean): void
  (e: 'open-reference-picker'): void
  /** 输入区键盘事件（先于组件默认处理；可 preventDefault） */
  (e: 'composer-keydown', event: KeyboardEvent): void
}>()

const { t } = useI18n()
const slots = useSlots()
/** 无 leading 列时仍用三列 grid 会把输入区挤进第一列 auto，导致宽度极窄 */
const hasLeadingColumn = computed(() => props.showAttach || !!slots.leading)
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
const enableReasoning = ref(props.enableReasoning)

const updateMaxScrollHeight = () => {
  maxScrollHeight.value = Math.max(180, Math.floor(window.innerHeight * 0.3))
}

const scrollContainerStyle = computed(() => ({
  maxHeight: `${maxScrollHeight.value}px`
}))

const scrollWrapStyle = computed(() => ({
  overflowX: 'hidden' as const,
  overflowY: 'auto' as const
}))

const effectiveInputTrim = computed(() => {
  const v = props.modelValue || ''
  return v.replace(/@\[[^\]]+\]/g, '').trim()
})

const hasContentToSend = computed(() => {
  const v = props.modelValue || ''
  const hasTyped =
    v.replace(/@\[[^\]]*\]/g, '').trim().length > 0 || /@\[[^\]]*\]/.test(v)
  if (hasTyped) return true
  return !!props.allowSendWithoutComposerText
})

const showPrimaryAsQueueSend = computed(
  () => props.loading && props.queueWhileLoading && hasContentToSend.value
)

const showPrimaryAsStop = computed(
  () => props.loading && !showPrimaryAsQueueSend.value
)

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
  // 带 @ 时从输入框取最新内容并随 submit 传出，避免父组件读 store 时拿到不完整
  const content =
    props.showReferencePicker && refInputRef.value?.getValue
      ? refInputRef.value.getValue()
      : (props.modelValue ?? '')
  emit('submit', enableKnowledgeBaseQuery.value, content, enableReasoning.value)
  // 提交后主动清空本地输入值，确保输入框在父组件异步处理前也会被清空
  emit('update:modelValue', '')
}

const toggleKnowledgeBaseQuery = () => {
  if (!knowledgeBaseEnabled.value || props.disabled) return
  enableKnowledgeBaseQuery.value = !enableKnowledgeBaseQuery.value
  emit('update:enableKnowledgeBaseQuery', enableKnowledgeBaseQuery.value)
}

const toggleReasoning = () => {
  if (props.disabled || props.loading) return
  enableReasoning.value = !enableReasoning.value
  emit('update:enableReasoning', enableReasoning.value)
}

const handleKeydown = (event: KeyboardEvent) => {
  if (props.disabled) return
  emit('composer-keydown', event)
  if (event.defaultPrevented) return
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
      if (props.forceMultilineLayout) {
        isMultiline.value = true
        return
      }
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
  () => props.forceMultilineLayout,
  (v) => {
    if (v && props.showReferencePicker) {
      isMultiline.value = true
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

watch(
  () => props.enableReasoning,
  (value) => {
    enableReasoning.value = value
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
    nextTick(() => {
      refInputRef.value?.insertAtCursor(value)
    })
  },
  insertRefAtCursor(value: string) {
    nextTick(() => {
      refInputRef.value?.insertAtCursor(value)
    })
  },
  /** 提交前取当前内容：使用 ref 输入框时从 DOM 刷新再返回，避免只发出 @tag 而丢失其他文字 */
  getContentForSubmit(): string {
    if (props.showReferencePicker && refInputRef.value?.getValue) {
      const v = refInputRef.value.getValue()
      if (v !== undefined && v !== null) return String(v)
    }
    return props.modelValue ?? ''
  }
})

onMounted(async () => {
  updateMaxScrollHeight()
  window.addEventListener('resize', updateMaxScrollHeight)
  if (props.forceMultilineLayout && props.showReferencePicker) {
    isMultiline.value = true
  } else {
    isMultiline.value = false
    await nextTick()
    if (textareaRef.value) {
      const el = textareaRef.value
      el.style.height = 'auto'
      const style = window.getComputedStyle(el)
      const lineHeight = parseFloat(style.lineHeight || '0') || 24
      const padding = parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0')
      singleLineHeight.value = Math.ceil(lineHeight + padding) || 24
      el.style.height = `${singleLineHeight.value}px`
      isMultiline.value = false
    }
    nextTick(() => {
      autoResize()
    })
  }
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
  max-width: 100%;
  min-width: 0;
  display: flex;
  justify-content: center;
  box-sizing: border-box;
}

.composer-shell {
  width: 100%;
  max-width: min(960px, 100%);
  min-width: 0;
  box-sizing: border-box;
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

/* 仅滚动区 + 操作区时：输入区应占满剩余空间（见 hasLeadingColumn） */
.composer-shell.composer-shell--no-leading:not(.is-multiline) {
  grid-template-columns: 1fr auto;
}

/* 紧凑模式：占满 panel 宽度，长文本时输入框右边界为 panel 边界 */
.chat-composer--compact .composer-shell {
  width: 100%;
  max-width: 100%;
  min-width: 0;
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
  z-index: 11;
  align-items: flex-end;
  pointer-events: auto;
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

.composer-btn-reasoning-active {
  background: hsl(var(--primary)) !important;
  color: hsl(var(--primary-foreground)) !important;
}

.composer-btn-reasoning-active:hover:not(:disabled) {
  background: hsl(var(--primary) / 0.9) !important;
}
</style>
