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
    <!-- 预设提示词：用绝对定位层把按钮浮在右上角，保证可点击、可 hover -->
    <div
      v-if="presetOptions && presetOptions.length > 0"
      class="preset-trigger-zone"
      aria-hidden="true"
    >
      <PopoverRoot v-model:open="showPresetDropdown">
        <PopoverTrigger as-child>
          <Button variant="link" size="sm" class="preset-dropdown-trigger">
            <ChevronDown class="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent
            class="preset-popover-content preset-popover-content--styled w-[300px] p-0"
            align="end"
            side="bottom"
            :side-offset="4"
          >
            <el-scrollbar class="preset-list-scrollbar" max-height="280px">
              <div class="preset-list">
                <div
                  v-for="preset in presetOptions"
                  :key="preset.value"
                  class="preset-item"
                  role="button"
                  tabindex="0"
                  @click.prevent="handlePresetClick(preset)"
                >
                  {{ preset.label }}
                </div>
              </div>
            </el-scrollbar>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import { themeState, colorWithOpacity } from '../../utils/themes'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { ElScrollbar } from 'element-plus'
import { Button } from '@renderer/components/ui/button'
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from 'reka-ui'
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

// 处理预设点击：先更新 modelValue，再关闭下拉并聚焦
const handlePresetClick = (preset: PresetOption) => {
  const value = preset?.value ?? ''
  emit('update:modelValue', value)
  showPresetDropdown.value = false
  nextTick(() => {
    textareaRef.value?.focus()
  })
}
</script>

<!-- 预设下拉通过 portal 渲染到 body，需全局样式才能生效；z-index 必须高于 Dialog(10000) 否则会被遮罩挡住无法点击 -->
<style lang="less">
.preset-popover-content {
  z-index: 11000 !important;
  pointer-events: auto !important;
}
/* 圆角、边框、背景（portal 内无 scoped，此处全局写） */
.preset-popover-content.preset-popover-content--styled {
  border-radius: 10px;
  overflow: hidden;
  background: var(--el-bg-color-overlay, var(--el-bg-color, #ffffff)) !important;
  border: 1px solid rgba(145, 145, 145, 0.35) !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12) !important;
  pointer-events: auto !important;
}
/* 确保列表和项可接收 hover/click，不被上层遮挡 */
.preset-popover-content--styled .preset-list-scrollbar,
.preset-popover-content--styled .preset-list,
.preset-popover-content--styled .preset-item {
  pointer-events: auto !important;
}
.preset-popover-content--styled .preset-item {
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.2s;
  color: var(--el-text-color-primary, inherit);
}
.preset-popover-content--styled .preset-item:hover {
  background-color: rgba(0, 0, 0, 0.06);
}
.preset-popover-content--styled .preset-item:active {
  background-color: rgba(0, 0, 0, 0.1);
}
</style>

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

/* 预设按钮容器：绝对定位在右上角，置于 ScrollArea 之上，仅按钮可点击 */
.preset-trigger-zone {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  pointer-events: none;
}

.preset-trigger-zone .preset-dropdown-trigger {
  pointer-events: auto;
  border: 1px solid rgba(145, 145, 145, 0.5);
  background: v-bind('themeState.currentTheme.background2nd || themeState.currentTheme.background');
  border-radius: 6px;
  color: v-bind('themeState.currentTheme.textColor');
  transition:
    background-color 0.15s,
    border-color 0.15s,
    box-shadow 0.15s;
}
.preset-trigger-zone .preset-dropdown-trigger:hover {
  background: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)"'
  );
  border-color: rgba(145, 145, 145, 0.7);
}
.preset-trigger-zone .preset-dropdown-trigger:active {
  background: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"'
  );
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
}

.preset-dropdown-trigger {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 21;
  padding: 4px;
  min-height: auto;
  height: auto;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
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

/* 预设列表容器：圆角、背景、el-scrollbar */
.preset-popover-content--styled {
  border-radius: 10px;
  overflow: hidden;
  background: v-bind('themeState.currentTheme.background2nd || themeState.currentTheme.background');
  border: 1px solid rgba(145, 145, 145, 0.35);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.preset-list-scrollbar {
  width: 100%;
}
.preset-list-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}
.preset-list-scrollbar :deep(.el-scrollbar__view) {
  padding: 6px 0;
}

.preset-list {
  padding: 4px 8px;
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
