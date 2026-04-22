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
        <div class="editor-mode-card-icon">{{ opt.icon }}</div>
        <h3 class="editor-mode-card-title">{{ t(opt.titleKey) }}</h3>
        <p class="editor-mode-card-desc">{{ t(opt.descKey) }}</p>
      </div>
    </div>
    <!-- <p v-if="showChangeLaterHint" class="editor-mode-change-later">
      {{ t('editorModeFirstTime.changeLaterHint') }}
    </p> -->
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
import { Button } from '@renderer/components/ui/button'
import { themeState } from '../../utils/themes'

const props = withDefaults(
  defineProps<{
    modelValue: 'wysiwyg' | 'ir' | 'sv'
    /** 首次向导内嵌：不显示大标题、不显示底部确定（由外层向导处理） */
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
  'update:modelValue': [value: 'wysiwyg' | 'ir' | 'sv']
  confirm: []
}>()

const { t } = useI18n()

const editorModeOptions = [
  {
    value: 'wysiwyg' as const,
    icon: '📝',
    titleKey: 'setting.editorModeWysiwyg',
    descKey: 'setting.editorModeWysiwygHint'
  },
  {
    value: 'ir' as const,
    icon: '⚡',
    titleKey: 'setting.editorModeIr',
    descKey: 'setting.editorModeIrHint'
  },
  {
    value: 'sv' as const,
    icon: '📋',
    titleKey: 'setting.editorModeSv',
    descKey: 'setting.editorModeSvHint'
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
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.editor-mode-card {
  flex: 1;
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
  font-size: 48px;
  margin-bottom: 16px;
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

.editor-mode-change-later {
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.7;
  margin: 0 0 20px 0;
}

.editor-mode-panel-footer {
  display: flex;
  justify-content: center;
}
</style>
