<template>
  <div class="ai-toolbar aero-div">
    <el-button
      :class="['ai-toolbar-btn', 'ai-toolbar-btn--expandable', { 'ai-toolbar-btn--selected': selectedAiTool === 'generateChildren', 'ai-toolbar-btn--expanded': selectedAiTool === 'generateChildren' }]"
      :type="selectedAiTool === 'generateChildren' ? 'primary' : 'default'"
      size="small"
      @click="toggleAiTool('generateChildren')"
    >
      <img :src="themeState.currentTheme.BranchIcon" class="ai-toolbar-btn__icon" alt="" />
      <span class="ai-toolbar-btn__label">{{ $t('outline.aiTool.generateChildren') }}</span>
    </el-button>
    <el-button
      :class="['ai-toolbar-btn', 'ai-toolbar-btn--expandable', { 'ai-toolbar-btn--selected': selectedAiTool === 'generateContent', 'ai-toolbar-btn--expanded': selectedAiTool === 'generateContent' }]"
      :type="selectedAiTool === 'generateContent' ? 'primary' : 'default'"
      size="small"
      @click="toggleAiTool('generateContent')"
    >
      <img :src="themeState.currentTheme.WriteIcon" class="ai-toolbar-btn__icon" alt="" />
      <span class="ai-toolbar-btn__label">{{ $t('outline.aiTool.generateContent') }}</span>
    </el-button>
    <el-button
      :class="['ai-toolbar-btn', 'ai-toolbar-btn--expandable', { 'ai-toolbar-btn--selected': selectedAiTool === 'generateChildrenChildren', 'ai-toolbar-btn--expanded': selectedAiTool === 'generateChildrenChildren' }]"
      :type="selectedAiTool === 'generateChildrenChildren' ? 'primary' : 'default'"
      size="small"
      @click="toggleAiTool('generateChildrenChildren')"
    >
      <img :src="themeState.currentTheme.MultiBranchIcon" class="ai-toolbar-btn__icon" alt="" />
      <span class="ai-toolbar-btn__label">{{ $t('outline.aiTool.generateChildrenChildren') }}</span>
    </el-button>
    <el-button
      :class="['ai-toolbar-btn', 'ai-toolbar-btn--expandable', { 'ai-toolbar-btn--selected': selectedAiTool === 'generateChildrenContent', 'ai-toolbar-btn--expanded': selectedAiTool === 'generateChildrenContent' }]"
      :type="selectedAiTool === 'generateChildrenContent' ? 'primary' : 'default'"
      size="small"
      @click="toggleAiTool('generateChildrenContent')"
    >
      <img :src="themeState.currentTheme.MultiWriteIcon" class="ai-toolbar-btn__icon" alt="" />
      <span class="ai-toolbar-btn__label">{{ $t('outline.aiTool.generateChildrenContent') }}</span>
    </el-button>
    <el-tooltip :content="$t('outline.formatTitle')" placement="right">
      <el-button
        type="default"
        size="small"
        class="ai-toolbar-btn ai-toolbar-btn--action"
        @click="formatTitle"
      >
        <img :src="themeState.currentTheme.FormatIcon" class="ai-toolbar-btn__icon" alt="" />
      </el-button>
    </el-tooltip>
  </div>
</template>

<script setup lang="ts">
import { inject, computed } from 'vue'
import { themeState } from '../../utils/themes'

type AiTool = 'generateChildren' | 'generateContent' | 'generateChildrenChildren' | 'generateChildrenContent' | null
type ToggleAiToolFn = (tool: Exclude<AiTool, null>) => void

const selectedAiToolRef = inject<{ value: AiTool }>('outlineSelectedAiTool')!
const selectedAiTool = computed(() => selectedAiToolRef.value)
const toggleAiTool = inject<ToggleAiToolFn>('outlineToggleAiTool')!
const formatTitle = inject<() => void>('outlineFormatTitle')!
</script>

<style scoped>
.ai-toolbar-btn__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: block;
  object-fit: contain;
}
</style>
