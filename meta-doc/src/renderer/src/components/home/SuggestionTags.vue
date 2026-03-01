<template>
  <div class="suggestion-tags-container">
    <div class="suggestion-tags-header">
      <span class="suggestion-tags-title">{{ title }}</span>
      <Button
        size="sm"
        variant="ghost"
        circle
        :disabled="disabled"
        @click="handleRefresh"
        class="refresh-button"
      >
        <el-icon><Refresh /></el-icon>
      </Button>
    </div>
    <div class="suggestion-tags-wrapper">
      <transition-group name="tag-fade" tag="div" class="suggestion-tags-list">
        <div
          v-for="(tag, index) in tags"
          :key="`${tag.label}-${index}`"
          class="suggestion-tag"
          :class="{ disabled }"
          @click="!disabled && handleTagClick(tag.prompt)"
        >
          <span class="tag-content">{{ tag.label }}</span>
        </div>
      </transition-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Refresh } from '@element-plus/icons-vue'
import { Button } from '@renderer/components/ui/button'
import { themeState } from '../../utils/themes'

const { t } = useI18n()

interface SuggestionTag {
  label: string
  prompt: string
}

interface Props {
  tags: SuggestionTag[]
  title?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: t('home.suggestionTagsTitle', '建议标签'),
  disabled: false
})

const emit = defineEmits<{
  (e: 'select', prompt: string): void
  (e: 'refresh'): void
}>()

const handleTagClick = (prompt: string) => {
  emit('select', prompt)
}

const handleRefresh = () => {
  emit('refresh')
}
</script>

<style scoped>
.suggestion-tags-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.suggestion-tags-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px;
}

.suggestion-tags-title {
  font-size: 13px;
  font-weight: 500;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.85;
  letter-spacing: 0.3px;
}

.refresh-button {
  padding: 4px;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.6;
  transition: all 0.2s ease;
}

.refresh-button:hover:not(:disabled) {
  opacity: 1;
  transform: rotate(90deg);
}

.refresh-button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.suggestion-tags-wrapper {
  width: 100%;
}

.suggestion-tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-start;
}

.suggestion-tag {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  border-radius: 20px;
  background: v-bind(
    'themeState.currentTheme.suggestionTagBg || (themeState.currentTheme.type === "dark" ? "rgba(64, 158, 255, 0.12)" : "rgba(64, 158, 255, 0.08)")'
  );
  border: 1px solid
    v-bind(
      'themeState.currentTheme.suggestionTagBorder || (themeState.currentTheme.type === "dark" ? "rgba(64, 158, 255, 0.25)" : "rgba(64, 158, 255, 0.2)")'
    );
  color: v-bind(
    'themeState.currentTheme.suggestionTagColor || (themeState.currentTheme.type === "dark" ? "rgba(100, 180, 255, 0.95)" : "rgb(64, 158, 255)")'
  );
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.suggestion-tag::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0) 100%);
  opacity: 0;
  transition: opacity 0.25s ease;
  pointer-events: none;
}

.suggestion-tag:hover:not(.disabled) {
  background: v-bind(
    'themeState.currentTheme.suggestionTagHoverBg || (themeState.currentTheme.type === "dark" ? "rgba(64, 158, 255, 0.22)" : "rgba(64, 158, 255, 0.15)")'
  );
  border-color: v-bind(
    'themeState.currentTheme.suggestionTagHoverBorder || (themeState.currentTheme.type === "dark" ? "rgba(64, 158, 255, 0.4)" : "rgba(64, 158, 255, 0.35)")'
  );
  color: v-bind(
    'themeState.currentTheme.suggestionTagHoverColor || (themeState.currentTheme.type === "dark" ? "rgba(120, 200, 255, 1)" : "rgb(64, 158, 255)")'
  );
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 6px 16px rgba(64, 158, 255, 0.25);
}

.suggestion-tag:hover:not(.disabled)::before {
  opacity: 1;
}

.suggestion-tag:active:not(.disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.1);
}

.suggestion-tag.disabled {
  opacity: 0.45;
  cursor: not-allowed;
  background: v-bind(
    'themeState.currentTheme.suggestionTagDisabledBg || (themeState.currentTheme.type === "dark" ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)")'
  );
  border-color: v-bind(
    'themeState.currentTheme.suggestionTagDisabledBorder || (themeState.currentTheme.type === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)")'
  );
  color: v-bind(
    'themeState.currentTheme.suggestionTagDisabledColor || (themeState.currentTheme.type === "dark" ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.35)")'
  );
  transform: none;
  box-shadow: none;
}

.tag-content {
  position: relative;
  z-index: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
  letter-spacing: 0.2px;
  line-height: 1.4;
}

/* 过渡动画 */
.tag-fade-enter-active,
.tag-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.tag-fade-enter-from {
  opacity: 0;
  transform: scale(0.8) translateY(-10px);
}

.tag-fade-leave-to {
  opacity: 0;
  transform: scale(0.8) translateY(10px);
}

.tag-fade-move {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
