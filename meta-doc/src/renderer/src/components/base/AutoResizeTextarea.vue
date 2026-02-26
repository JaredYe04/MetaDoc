<template>
  <div class="auto-resize-textarea-wrapper" :style="wrapperStyle">
    <ScrollArea :class="scrollAreaClasses" :style="scrollbarStyle">
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
    </ScrollArea>
    <!-- 预设提示词下拉菜单：以按钮为 reference，使 popover 定位在按钮旁 -->
    <Popover v-if="presetOptions && presetOptions.length > 0" v-model:open="showPresetDropdown">
      <PopoverTrigger as-child>
        <Button variant="link" size="sm" class="preset-dropdown-trigger">
          <ChevronDown class="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-[300px] p-0" align="end">
        <ScrollArea class="h-[280px]">
          <div class="preset-list">
            <div
              v-for="preset in presetOptions"
              :key="preset.value"
              class="preset-item"
              @click="handlePresetClick(preset)"
            >
              {{ preset.label }}
            </div>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import { themeState, colorWithOpacity } from '../../utils/themes'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { ChevronDown } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface PresetOption {
  label: string
  value: string
}

interface Props {
  modelValue?: string
  disabled?: boolean
  placeholder?: string
  autosize?: { minRows?: number; maxRows?: number } | boolean
  maxHeight?: string
  height?: string
  presetOptions?: PresetOption[]
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  disabled: false,
  autosize: () => ({ minRows: 3 }),
  maxHeight: '10vh',
  height: '10vh',
  presetOptions: () => []
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const showPresetDropdown = ref(false)

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
watch(
  () => props.modelValue,
  () => {
    nextTick(() => {
      if (textareaRef.value) {
        adjustHeight(textareaRef.value)
      }
    })
  }
)

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
    borderRadius: '8px'
  }
})

const scrollAreaClasses = computed(() => {
  return 'auto-resize-textarea-scrollarea border border-[rgba(145,145,145,0.5)] rounded-[8px] p-1'
})

const inputStyle = computed(() => {
  const textColor = themeState.currentTheme.textColor
  return {
    '--textarea-text-color': textColor,
    '--textarea-placeholder-color': colorWithOpacity(textColor, 0.6)
  } as Record<string, string>
})

const wrapperStyle = computed(() => ({
  width: '100%',
  position: 'relative'
}))

// 计算下拉菜单位置
const dropdownMenuStyle = computed(() => {
  if (!textareaRef.value || !triggerButtonRef.value) {
    return {}
  }
  const textareaRect = textareaRef.value.getBoundingClientRect()
  const buttonRect = triggerButtonRef.value.getBoundingClientRect()
  return {
    position: 'fixed',
    top: `${buttonRect.bottom + 4}px`,
    left: `${textareaRect.left}px`,
    width: `${Math.max(textareaRect.width, 300)}px`,
    zIndex: 2000
  }
})

// 处理预设点击
const handlePresetClick = (preset: PresetOption) => {
  if (preset.value) {
    emit('update:modelValue', preset.value)
  }
  showPresetDropdown.value = false
  // 聚焦回textarea
  nextTick(() => {
    textareaRef.value?.focus()
  })
}
</script>

<style scoped lang="less">
.auto-resize-textarea-wrapper {
  width: 100%;
  position: relative;
}

.auto-resize-textarea-scrollarea {
  border: 1px solid rgba(145, 145, 145, 0.5);
  border-radius: 8px;
  padding: 4px;
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

.preset-dropdown-trigger {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 10;
  padding: 4px;
  min-height: auto;
  height: auto;
  width: 24px;
  height: 24px;
}

.preset-dropdown-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1999;
  background: transparent;
}

.preset-dropdown-menu {
  background: v-bind('themeState.currentTheme.background2nd || themeState.currentTheme.background');
  border: 1px solid rgba(145, 145, 145, 0.3);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  max-height: 300px;
  overflow-y: auto;
}

.preset-list-scrollbar {
  width: 100%;
}
.preset-list-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}
.preset-list {
  padding: 4px;
}

.preset-item {
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.2s;
  color: v-bind('themeState.currentTheme.textColor');
}

.preset-item:hover {
  background-color: rgba(0, 0, 0, 0.05);
}
</style>
