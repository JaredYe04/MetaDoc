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
            @click.prevent="emit('attach')"
          >
            <Plus />
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
        />
      </el-scrollbar>

      <div class="composer-actions">
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
import { Plus, Microphone, Position, Refresh } from '@element-plus/icons-vue'
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
}>(), {
  modelValue: '',
  loading: false,
  disabled: false,
  placeholder: '',
  showAttach: true,
  showVoice: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit'): void
  (e: 'reset'): void
  (e: 'attach'): void
  (e: 'voice'): void
}>()

const { t } = useI18n()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const scrollbarRef = ref<ScrollbarInstance | null>(null)
const maxScrollHeight = ref(0)
const singleLineHeight = ref<number | null>(null)
const isMultiline = ref(false)

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

watch(() => props.modelValue, () => {
  nextTick(autoResize)
})

onMounted(() => {
  updateMaxScrollHeight()
  window.addEventListener('resize', updateMaxScrollHeight)
  nextTick(autoResize)
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

