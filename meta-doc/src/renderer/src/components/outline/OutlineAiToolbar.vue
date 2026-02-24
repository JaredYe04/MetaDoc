<template>
  <div class="ai-toolbar aero-div">
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
      size="sm"
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
      size="sm"
      @click="toggleAiTool('generateContent')"
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
      size="sm"
      @click="toggleAiTool('generateChildrenChildren')"
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
      size="sm"
      @click="toggleAiTool('generateChildrenContent')"
    >
      <img :src="themeState.currentTheme.MultiWriteIcon" class="ai-toolbar-btn__icon" alt="" />
      <span class="ai-toolbar-btn__label">{{ $t('outline.aiTool.generateChildrenContent') }}</span>
    </Button>
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="outline"
            size="sm"
            class="ai-toolbar-btn ai-toolbar-btn--action"
            @click="formatTitle"
          >
            <img :src="themeState.currentTheme.FormatIcon" class="ai-toolbar-btn__icon" alt="" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>{{ $t('outline.formatTitle') }}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
</template>

<script setup lang="ts">
import { inject, computed } from 'vue'
import { Button } from '@renderer/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@renderer/components/ui/tooltip'
import { themeState } from '../../utils/themes'
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
.ai-toolbar-btn__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: block;
  object-fit: contain;
}
</style>
