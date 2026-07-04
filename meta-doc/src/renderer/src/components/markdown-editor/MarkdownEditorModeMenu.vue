<template>
  <div
    class="markdown-editor-mode-menu"
    :class="{ 'markdown-editor-mode-menu--vditor': variant === 'vditor' }"
    :style="panelStyle"
  >
    <button
      v-for="item in menuItems"
      :key="item.value"
      type="button"
      class="markdown-editor-mode-menu__item"
      :class="{ 'markdown-editor-mode-menu__item--current': currentChoice === item.value }"
      @click="onSelect(item.value)"
    >
      <component :is="item.icon" class="markdown-editor-mode-menu__icon" />
      <span class="markdown-editor-mode-menu__label">{{ t(item.labelKey) }}</span>
      <Check v-if="currentChoice === item.value" class="markdown-editor-mode-menu__check" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileText, Zap, Columns2, Check } from 'lucide-vue-next'
import { themeState } from '../../utils/themes'
import type { MarkdownDefaultEditorModeChoice } from '../../utils/markdown-editor-mode'

const props = withDefaults(
  defineProps<{
    currentChoice: MarkdownDefaultEditorModeChoice
    variant?: 'default' | 'vditor'
  }>(),
  {
    variant: 'default'
  }
)

const emit = defineEmits<{
  select: [choice: MarkdownDefaultEditorModeChoice]
}>()

const { t } = useI18n()

const menuItems = computed(() => [
  { value: 'ir' as const, icon: Zap, labelKey: 'setting.editorModeIr' },
  { value: 'wysiwyg' as const, icon: FileText, labelKey: 'setting.editorModeWysiwyg' },
  { value: 'code' as const, icon: Columns2, labelKey: 'setting.editorModeCode' }
])

const panelStyle = computed(() => {
  if (props.variant !== 'vditor') return undefined
  const textColor = themeState.currentTheme.textColor
  const panelBg =
    themeState.currentTheme.editorPanelBackgroundColor ||
    themeState.currentTheme.background2nd ||
    themeState.currentTheme.background
  return {
    color: textColor,
    backgroundColor: panelBg,
    border: `1px solid color-mix(in srgb, ${textColor} 15%, transparent)`,
    boxShadow: `0 4px 6px color-mix(in srgb, #000000 8%, transparent), 0 12px 28px color-mix(in srgb, #000000 18%, transparent)`
  }
})

const onSelect = (choice: MarkdownDefaultEditorModeChoice) => {
  emit('select', choice)
}
</script>

<style scoped>
.markdown-editor-mode-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 168px;
}

.markdown-editor-mode-menu--vditor {
  padding: 4px;
  border-radius: 10px;
}

.markdown-editor-mode-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 13px;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
}

.markdown-editor-mode-menu__item:hover,
.markdown-editor-mode-menu__item:focus-visible {
  background: color-mix(in srgb, currentColor 10%, transparent);
}

.markdown-editor-mode-menu__item--current {
  background: color-mix(in srgb, var(--el-color-primary, #409eff) 14%, transparent);
}

.markdown-editor-mode-menu__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  opacity: 0.85;
}

.markdown-editor-mode-menu__label {
  flex: 1;
}

.markdown-editor-mode-menu__check {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: 0.9;
}
</style>
