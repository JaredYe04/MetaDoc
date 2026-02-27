<template>
  <div class="ai-toolbar">
    <Button
      :class="[
        'ai-toolbar-btn',
        'ai-toolbar-btn--expandable',
        {
          'ai-toolbar-btn--selected': selectedAiTool === 'generateChildren',
          'ai-toolbar-btn--expanded': selectedAiTool === 'generateChildren'
        }
      ]"
      :variant="selectedAiTool === 'generateChildren' ? 'default' : 'outline'"
      size="icon"
      @click="handleToggleAiTool('generateChildren')"
    >
      <img :src="themeState.currentTheme.BranchIcon" class="ai-toolbar-btn__icon" alt="" />
      <span class="ai-toolbar-btn__label">{{ $t('outline.aiTool.generateChildren') }}</span>
    </Button>
    <Button
      :class="[
        'ai-toolbar-btn',
        'ai-toolbar-btn--expandable',
        {
          'ai-toolbar-btn--selected': selectedAiTool === 'generateContent',
          'ai-toolbar-btn--expanded': selectedAiTool === 'generateContent'
        }
      ]"
      :variant="selectedAiTool === 'generateContent' ? 'default' : 'outline'"
      size="icon"
      @click="handleToggleAiTool('generateContent')"
    >
      <img :src="themeState.currentTheme.WriteIcon" class="ai-toolbar-btn__icon" alt="" />
      <span class="ai-toolbar-btn__label">{{ $t('outline.aiTool.generateContent') }}</span>
    </Button>
    <Button
      :class="[
        'ai-toolbar-btn',
        'ai-toolbar-btn--expandable',
        {
          'ai-toolbar-btn--selected': selectedAiTool === 'generateChildrenChildren',
          'ai-toolbar-btn--expanded': selectedAiTool === 'generateChildrenChildren'
        }
      ]"
      :variant="selectedAiTool === 'generateChildrenChildren' ? 'default' : 'outline'"
      size="icon"
      @click="handleToggleAiTool('generateChildrenChildren')"
    >
      <img :src="themeState.currentTheme.MultiBranchIcon" class="ai-toolbar-btn__icon" alt="" />
      <span class="ai-toolbar-btn__label">{{ $t('outline.aiTool.generateChildrenChildren') }}</span>
    </Button>
    <Button
      :class="[
        'ai-toolbar-btn',
        'ai-toolbar-btn--expandable',
        {
          'ai-toolbar-btn--selected': selectedAiTool === 'generateChildrenContent',
          'ai-toolbar-btn--expanded': selectedAiTool === 'generateChildrenContent'
        }
      ]"
      :variant="selectedAiTool === 'generateChildrenContent' ? 'default' : 'outline'"
      size="icon"
      @click="handleToggleAiTool('generateChildrenContent')"
    >
      <img :src="themeState.currentTheme.MultiWriteIcon" class="ai-toolbar-btn__icon" alt="" />
      <span class="ai-toolbar-btn__label">{{ $t('outline.aiTool.generateChildrenContent') }}</span>
    </Button>
    <Button
      variant="outline"
      size="icon"
      class="ai-toolbar-btn ai-toolbar-btn--action"
      @click="handleFormatTitle"
    >
      <img :src="themeState.currentTheme.FormatIcon" class="ai-toolbar-btn__icon" alt="" />
      <span class="ai-toolbar-btn__label">{{ $t('outline.formatTitle') }}</span>
    </Button>
  </div>
</template>

<script setup lang="ts">
import { inject, computed } from 'vue'
import { Button } from '@renderer/components/ui/button'
import { themeState, colorWithOpacity } from '../../utils/themes'
import { notifyInfo } from '../../utils/notify'

// Demo mode support
const props = defineProps<{ mode?: string }>()
const isDemo = computed(() => props.mode === 'demo')

type AiTool =
  | 'generateChildren'
  | 'generateContent'
  | 'generateChildrenChildren'
  | 'generateChildrenContent'
  | null
type ToggleAiToolFn = (tool: Exclude<AiTool, null>) => void

const selectedAiToolRef = inject<{ value: AiTool }>('outlineSelectedAiTool')!
const selectedAiTool = computed(() => selectedAiToolRef.value)
const toggleAiTool = inject<ToggleAiToolFn>('outlineToggleAiTool')!
const formatTitle = inject<() => void>('outlineFormatTitle')!

// 判断当前是否为暗色主题
const isDarkTheme = computed(() => themeState.currentTheme.type === 'dark')

// Demo mode handler for AI tools
const handleToggleAiTool = (tool: Exclude<AiTool, null>) => {
  if (isDemo.value) {
    notifyInfo('Demo mode: AI ' + tool + ' is simulated')
    return
  }
  toggleAiTool(tool)
}

// Demo mode handler for format title
const handleFormatTitle = () => {
  if (isDemo.value) {
    notifyInfo('Demo mode: Format title is simulated')
    return
  }
  formatTitle()
}
</script>

<style scoped>
/* 工具栏容器 - 纵向排列，悬浮定位 */
.ai-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  position: absolute;
  left: 8px;
  top: 8px;
  z-index: 100;
}

/* 按钮基础样式 - 使用 size="icon" 默认尺寸 */
.ai-toolbar-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 !important;
  overflow: hidden;
  transition: all 0.3s ease;
  border-radius: 8px;
}

/* 收起时强制图标居中 */
.ai-toolbar-btn:not(:hover):not(.ai-toolbar-btn--expanded) {
  justify-content: center !important;
}

/* 收起时隐藏文字，确保不影响布局 */
.ai-toolbar-btn:not(:hover):not(.ai-toolbar-btn--expanded) .ai-toolbar-btn__label {
  display: none !important;
  width: 0;
  margin: 0;
  padding: 0;
}

/* 按钮 hover 时展开 - 固定宽度 160px，使用 sidebar 背景色 */
.ai-toolbar-btn:hover,
.ai-toolbar-btn--expanded {
  width: 160px;
  padding: 0 12px !important;
  justify-content: flex-start;
  align-items: center;
  background-color: v-bind(
    'themeState.currentTheme.sidebarBackground || themeState.currentTheme.background'
  ) !important;
  border: 2px solid v-bind('themeState.currentTheme.textColor') !important;
  color: v-bind('themeState.currentTheme.textColor') !important;
}

/* 选中状态的按钮样式 - 使用 sidebar 背景色 */
.ai-toolbar-btn--selected {
  background-color: v-bind(
    'themeState.currentTheme.sidebarBackground || themeState.currentTheme.background'
  ) !important;
  border: 2px solid v-bind('themeState.currentTheme.textColor') !important;
  color: v-bind('themeState.currentTheme.textColor') !important;
}

/* 确保选中状态下hover保持 */
.ai-toolbar-btn--selected:hover {
  background-color: v-bind(
    'themeState.currentTheme.sidebarBackground || themeState.currentTheme.background'
  ) !important;
  border: 2px solid v-bind('themeState.currentTheme.textColor') !important;
  color: v-bind('themeState.currentTheme.textColor') !important;
  opacity: 0.9;
}

/* 图标样式 - 在按钮内垂直水平居中 */
.ai-toolbar-btn__icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 文字标签 - 默认完全隐藏，不占空间 */
.ai-toolbar-btn__label {
  display: none;
  opacity: 0;
  overflow: hidden;
  white-space: nowrap;
  transition: all 0.3s ease;
  margin-left: 0;
}

/* hover 或展开时显示文字 - 使用主题文字颜色确保对比度 */
.ai-toolbar-btn:hover .ai-toolbar-btn__label,
.ai-toolbar-btn--expanded .ai-toolbar-btn__label {
  display: inline;
  opacity: 1;
  margin-left: 8px;
  color: v-bind('themeState.currentTheme.textColor') !important;
}

/* 图标在主题色背景上的颜色 - 保持原样，不反转 */
.ai-toolbar-btn:hover .ai-toolbar-btn__icon,
.ai-toolbar-btn--expanded .ai-toolbar-btn__icon,
.ai-toolbar-btn--selected .ai-toolbar-btn__icon {
  filter: none;
}

/* 格式化按钮的 hover 样式 - 使用 sidebar 背景色 */
.ai-toolbar-btn--action:hover {
  background-color: v-bind(
    'themeState.currentTheme.sidebarBackground || themeState.currentTheme.background'
  ) !important;
  border: 2px solid v-bind('themeState.currentTheme.textColor') !important;
  color: v-bind('themeState.currentTheme.textColor') !important;
}

.ai-toolbar-btn--action:hover .ai-toolbar-btn__icon {
  filter: none;
}
</style>
