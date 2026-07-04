<template>
  <div class="editor-mode-picker" :class="{ 'editor-mode-picker--embedded': embedded }">
    <div v-if="!embedded" class="editor-mode-panel-header">
      <h2 class="editor-mode-panel-title">{{ t('editorModeFirstTime.title') }}</h2>
    </div>
    <p class="editor-mode-panel-desc">{{ t('editorModeFirstTime.message') }}</p>
    <div class="editor-mode-cards">
      <div
        v-for="opt in editorModeOptions"
        :key="opt.value"
        class="editor-mode-card"
        :class="{ selected: modelValue === opt.value }"
        :style="editorModeCardBgStyle"
        @click="emit('update:modelValue', opt.value)"
      >
        <div class="editor-mode-card-icon">
          <component :is="opt.icon" :size="40" :stroke-width="1.75" />
        </div>
        <h3 class="editor-mode-card-title">{{ t(opt.titleKey) }}</h3>
        <p class="editor-mode-card-desc">{{ t(opt.descKey) }}</p>
      </div>
    </div>
    <div v-if="showConfirm" class="editor-mode-panel-footer">
      <Button variant="default" size="lg" @click="emit('confirm')">
        {{ t('common.confirm') }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileText, Zap, Columns2 } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { themeState } from '../../utils/themes'
import type { MarkdownDefaultEditorModeChoice } from '../../utils/markdown-editor-mode'

withDefaults(
  defineProps<{
    modelValue: MarkdownDefaultEditorModeChoice
    embedded?: boolean
    showChangeLaterHint?: boolean
    showConfirm?: boolean
  }>(),
  {
    embedded: false,
    showChangeLaterHint: true,
    showConfirm: false
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: MarkdownDefaultEditorModeChoice]
  confirm: []
}>()

const { t } = useI18n()

const editorModeOptions = [
  {
    value: 'wysiwyg' as const,
    icon: FileText,
    titleKey: 'setting.editorModeWysiwyg',
    descKey: 'setting.editorModeWysiwygHint'
  },
  {
    value: 'ir' as const,
    icon: Zap,
    titleKey: 'setting.editorModeIr',
    descKey: 'setting.editorModeIrHint'
  },
  {
    value: 'code' as const,
    icon: Columns2,
    titleKey: 'setting.editorModeCode',
    descKey: 'setting.editorModeCodeHint'
  }
]

const editorModeCardBgStyle = computed(() => ({
  background: themeState.currentTheme.quickStartBackground2 ?? themeState.currentTheme.background
}))
</script>

<style scoped>
.editor-mode-picker--embedded .editor-mode-panel-desc {
  margin-bottom: 16px;
}

.editor-mode-panel-header {
  margin-bottom: 8px;
}

.editor-mode-panel-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: v-bind('themeState.currentTheme.textColor');
  letter-spacing: -0.02em;
}

.editor-mode-panel-desc {
  font-size: 14px;
  line-height: 1.5;
  margin: 0 0 24px 0;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.85;
}

.editor-mode-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 24px;
  margin-bottom: 20px;
}

.editor-mode-card {
  min-width: 160px;
  padding: 28px 24px;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 2px solid transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  position: relative;
  overflow: hidden;
}

.editor-mode-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.editor-mode-card:hover::before {
  opacity: 1;
}

.editor-mode-card:hover {
  transform: translateY(-4px);
  border-color: v-bind('themeState.currentTheme.borderColor || "rgba(0, 0, 0, 0.2)"');
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
}

.editor-mode-card.selected {
  border-color: hsl(var(--primary));
  box-shadow:
    0 0 0 1px hsl(var(--primary)),
    0 8px 24px rgba(0, 0, 0, 0.1);
}

.editor-mode-card-icon {
  margin-bottom: 16px;
  color: v-bind('themeState.currentTheme.textColor');
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.1));
  transition: transform 0.3s ease;
}

.editor-mode-card:hover .editor-mode-card-icon {
  transform: scale(1.08);
}

.editor-mode-card-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 10px 0;
  color: v-bind('themeState.currentTheme.textColor');
  letter-spacing: -0.01em;
}

.editor-mode-card-desc {
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.8;
}

.editor-mode-panel-footer {
  display: flex;
  justify-content: center;
}
</style>
