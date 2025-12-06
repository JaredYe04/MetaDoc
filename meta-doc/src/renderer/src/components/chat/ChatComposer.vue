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
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :on-change="handleFileChange"
            :on-remove="handleFileRemove"
            :show-file-list="false"
            accept="*/*"
            :disabled="disabled"
            multiple
            :limit="100"
          >
            <el-button
              circle
              class="composer-btn"
              :disabled="disabled"
              @click.prevent
            >
              <Plus />
            </el-button>
          </el-upload>
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

        <el-tooltip v-if="showCancel && loading" :content="t('aiChat.cancelTooltip') || t('common.cancel')" placement="top">
          <el-button
            circle
            class="composer-btn"
            type="danger"
            :disabled="false"
            @click.prevent="emit('cancel')"
          >
            <Close />
          </el-button>
        </el-tooltip>

        <el-button
          circle
          class="composer-btn primary"
          type="primary"
          :loading="loading"
          :disabled="disabled || !modelValue.trim().length"
          @click.prevent="handleSubmit"
        >
          <Position />
        </el-button>

        <el-button
          circle
          class="composer-btn"
          :disabled="disabled"
          @click.prevent="emit('reset')"
        >
          <Refresh />
        </el-button>
      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick, onBeforeUnmount, computed } from 'vue'
import { Plus, Microphone, Position, Refresh, Close } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { themeState } from '../../utils/themes'
import type { ScrollbarInstance } from 'element-plus'

const props = withDefaults(defineProps<{
  modelValue: string
  loading?: boolean
  disabled?: boolean
  placeholder?: string
  showAttach?: boolean
  showVoice?: boolean
  showCancel?: boolean
}>(), {
  modelValue: '',
  loading: false,
  disabled: false,
  placeholder: '',
  showAttach: false,
  showVoice: false,
  showCancel: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit'): void
  (e: 'reset'): void
  (e: 'attach', file?: File | File[]): void
  (e: 'voice'): void
  (e: 'cancel'): void
}>()

const { t } = useI18n()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const scrollbarRef = ref<ScrollbarInstance | null>(null)
const uploadRef = ref<any>(null)
const maxScrollHeight = ref(0)
const singleLineHeight = ref<number | null>(null)
// 用于防抖处理文件选择，等待所有文件选择完成
let fileChangeTimer: ReturnType<typeof setTimeout> | null = null
const isMultiline = ref(false)
const SEND_PREF_KEY = 'meta-doc-chat-send-on-enter'
const sendOnEnter = ref(true)

const updateMaxScrollHeight = () => {
  maxScrollHeight.value = Math.max(180, Math.floor(window.innerHeight * 0.4))
}

const scrollbarWrapStyle = computed(() => ({
  maxHeight: `${maxScrollHeight.value}px`,
  overflowX: 'hidden'
}))


const multilineThreshold = 6
const autoResize = () => {
  if (!textareaRef.value) return
  const el = textareaRef.value
  el.style.height = 'auto'
  if (!singleLineHeight.value) {
    const style = window.getComputedStyle(el)
    const lineHeight = parseFloat(style.lineHeight || '0')
    const padding = parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0')
    const base = Math.ceil(lineHeight + padding)
    singleLineHeight.value = base > 0 ? base : el.scrollHeight
  }
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
  emit('submit')
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
  sendOnEnter.value ? t('aiChat.enterToSend') : t('aiChat.ctrlEnterToSend'),
)

const toggleSendMode = () => {
  sendOnEnter.value = !sendOnEnter.value
}

// 用于存储当前选择的文件列表
const currentFileList = ref<any[]>([])

const handleFileChange = (file: any, fileList: any[]) => {
  // 更新当前文件列表（fileList 会累积所有已选择的文件）
  currentFileList.value = fileList || []
  
  // 清除之前的定时器
  if (fileChangeTimer) {
    clearTimeout(fileChangeTimer)
  }
  
  // 当文件列表变化时，延迟处理，等待所有文件选择完成
  // 使用防抖机制，等待文件选择对话框关闭后再处理所有文件
  // 注意：el-upload 的 on-change 会在每个文件被选择时触发
  // fileList 会累积所有已选择的文件，最后一次调用时包含所有文件
  fileChangeTimer = setTimeout(() => {
    // 使用最新的文件列表
    const finalFileList = currentFileList.value
    if (finalFileList && finalFileList.length > 0) {
      // 提取所有文件的原始 File 对象
      // fileList 中的每个元素都有 raw 属性（原始 File 对象）
      const files: File[] = []
      for (const item of finalFileList) {
        if (item && item.raw && item.raw instanceof File) {
          files.push(item.raw)
        }
      }
      
      if (files.length > 0) {
        // 调试日志
        console.log('[ChatComposer] 准备发送文件:', {
          fileListLength: finalFileList.length,
          filesLength: files.length,
          fileNames: files.map(f => f.name),
          willSendAsArray: files.length > 1
        })
        
        // 使用 nextTick 确保文件选择对话框已关闭
        nextTick(() => {
          // 发送所有文件（单个文件发送 File，多个文件发送数组）
          emit('attach', files.length === 1 ? files[0] : files)
          
          // 清空文件列表，以便下次选择时重新开始
          setTimeout(() => {
            if (uploadRef.value) {
              uploadRef.value.clearFiles()
            }
            currentFileList.value = []
          }, 200)
        })
      }
    }
    fileChangeTimer = null
  }, 300) // 增加延迟时间，确保所有文件都被添加到 fileList
}

const handleFileRemove = () => {
  // 文件被移除时，更新文件列表
  if (uploadRef.value) {
    currentFileList.value = uploadRef.value.fileList || []
  }
}

watch(() => props.modelValue, () => {
  nextTick(autoResize)
})

watch(sendOnEnter, (value) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SEND_PREF_KEY, String(value))
})

onMounted(() => {
  updateMaxScrollHeight()
  window.addEventListener('resize', updateMaxScrollHeight)
  nextTick(autoResize)
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(SEND_PREF_KEY)
    if (stored !== null) {
      sendOnEnter.value = stored === 'true'
    }
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateMaxScrollHeight)
  // 清理文件选择定时器
  if (fileChangeTimer) {
    clearTimeout(fileChangeTimer)
    fileChangeTimer = null
  }
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
  transition: background-color 0.2s, color 0.2s, border-color 0.2s;
  overflow: hidden;
  position: relative;
}

.composer-shell.is-multiline {
  grid-template-columns: auto 1fr;
  align-items: stretch;
}

.composer-leading {
  display: flex;
  align-items: center;
}

.composer-shell.is-multiline .composer-leading {
  align-self: flex-start;
}

.composer-scroll {
  width: 100%;
}

.composer-scroll :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
  padding-bottom: 4px;
}

.composer-scroll :deep(.el-scrollbar__view) {
  width: 100%;
}

.composer-scroll :deep(.el-scrollbar__bar.is-horizontal) {
  display: none;
}

.composer-shell.is-multiline .composer-scroll :deep(.el-scrollbar__wrap) {
  padding-bottom: 28px;
}

.composer-textarea {
  width: 100%;
  background: transparent;
  border: none;
  resize: none;
  outline: none;
  font-size: 16px;
  line-height: 1.6;
  color: inherit;
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
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
  transition: transform 0.15s ease, background 0.2s ease;
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
</style>

