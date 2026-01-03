<template>
  <el-scrollbar 
    class="auto-resize-textarea-scrollbar"
    :style="scrollbarStyle">
    <textarea
      ref="textareaRef"
      :value="modelValue"
      @input="handleInput"
      class="auto-resize-textarea-input"
      :disabled="disabled"
      :placeholder="placeholder"
      :rows="minRows"
      :style="inputStyle"
    />
  </el-scrollbar>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import { themeState, colorWithOpacity } from '../../utils/themes'

interface Props {
  modelValue?: string
  disabled?: boolean
  placeholder?: string
  autosize?: { minRows?: number; maxRows?: number } | boolean
  maxHeight?: string
  height?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  disabled: false,
  autosize: () => ({ minRows: 3 }),
  maxHeight: '10vh',
  height: '10vh'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)

const handleInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
  // 自动调整高度
  adjustHeight(target)
}

// 自动调整 textarea 高度以显示所有内容
const adjustHeight = (textarea: HTMLTextAreaElement) => {
  // 重置高度以获取正确的 scrollHeight
  textarea.style.height = 'auto'
  // 设置高度为内容高度
  textarea.style.height = textarea.scrollHeight + 'px'
}

const minRows = computed(() => {
  if (typeof props.autosize === 'boolean') {
    return props.autosize ? 3 : 1
  }
  return props.autosize?.minRows || 3
})

// 监听 modelValue 变化，自动调整高度
watch(() => props.modelValue, () => {
  nextTick(() => {
    if (textareaRef.value) {
      adjustHeight(textareaRef.value)
    }
  })
})

onMounted(() => {
  nextTick(() => {
    if (textareaRef.value) {
      adjustHeight(textareaRef.value)
    }
  })
})

const scrollbarStyle = computed(() => {
  return {
    maxHeight: props.maxHeight,
    height: props.height,
    borderRadius: '8px',
  }
})

const inputStyle = computed(() => {
  const textColor = themeState.currentTheme.textColor
  return {
    '--textarea-text-color': textColor,
    '--textarea-placeholder-color': colorWithOpacity(textColor, 0.6)
  } as Record<string, string>
})
</script>

<style scoped lang="less">
.auto-resize-textarea-scrollbar {
  border: 1px solid rgba(145, 145, 145, 0.5);
  border-radius: 8px;
  padding: 4px;
}

/* 确保 el-scrollbar 内部可以滚动 */
.auto-resize-textarea-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
  overflow-y: auto;
  max-height: 100%;
}

.auto-resize-textarea-scrollbar :deep(.el-scrollbar__view) {
  width: 100%;
}

.auto-resize-textarea-input {
  width: 100%;
  border: none;
  background-color: transparent;
  background: transparent;
  box-shadow: none;
  outline: none;
  resize: none;
  overflow: hidden; /* textarea 自己不要滚动，让父容器滚动 */
  color: var(--textarea-text-color, inherit);
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  padding: 0;
  margin: 0;
  display: block;
  /* 不设置固定高度，让内容决定高度 */
  min-height: 1em;
}

.auto-resize-textarea-input::placeholder {
  color: var(--textarea-placeholder-color, rgba(145, 145, 145, 0.6));
}

.auto-resize-textarea-input:hover {
  border: none;
  box-shadow: none;
  outline: none;
}

.auto-resize-textarea-input:focus {
  border: none;
  box-shadow: none;
  outline: none;
}

.auto-resize-textarea-input:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>

