<template>
  <el-tooltip :content="!selectedAiTool ? $t('outline.editNode') : getAiToolTip(selectedAiTool)" placement="top">
    <el-button
      size="small"
      type="text"
      :class="['aero-btn', 'node-action-btn']"
      @click.stop="onClick"
      v-if="node.path !== 'dummy'"
      :disabled="pendingAccept || generating"
    >
      <el-icon v-if="!selectedAiTool">
        <More />
      </el-icon>
      <img v-else-if="selectedAiTool === 'generateChildren'" :src="themeState.currentTheme.BranchIcon" class="node-action-btn__icon" alt="" />
      <img v-else-if="selectedAiTool === 'generateContent'" :src="themeState.currentTheme.WriteIcon" class="node-action-btn__icon" alt="" />
      <img v-else-if="selectedAiTool === 'generateChildrenChildren'" :src="themeState.currentTheme.MultiBranchIcon" class="node-action-btn__icon" alt="" />
      <img v-else-if="selectedAiTool === 'generateChildrenContent'" :src="themeState.currentTheme.MultiWriteIcon" class="node-action-btn__icon" alt="" />
    </el-button>
  </el-tooltip>
</template>

<script setup lang="ts">
import { inject, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { More } from '@element-plus/icons-vue'
import { themeState } from '../../utils/themes'
import type { DocumentOutlineNode } from '../../../../types'

type AiTool = 'generateChildren' | 'generateContent' | 'generateChildrenChildren' | 'generateChildrenContent' | null

const props = defineProps<{
  node: DocumentOutlineNode
  pendingAccept: boolean
  generating: boolean
}>()

const { t } = useI18n()
const selectedAiToolRef = inject<{ value: AiTool }>('outlineSelectedAiTool')!
const selectedAiTool = computed(() => selectedAiToolRef.value)
const handleNodeButtonClick = inject<(node: DocumentOutlineNode) => void>('outlineHandleNodeButtonClick')!

const getAiToolTip = (tool: string): string => {
  const toolTips: Record<string, string> = {
    'generateChildren': t('outline.generateChildChapter'),
    'generateContent': t('outline.generateContent'),
    'generateChildrenChildren': t('outline.generateChildrenChildren'),
    'generateChildrenContent': t('outline.generateChildrenContent')
  }
  return toolTips[tool] || ''
}

const onClick = () => {
  handleNodeButtonClick(props.node)
}
</script>

<style scoped>
.node-action-btn__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: block;
  object-fit: contain;
  vertical-align: middle;
}
</style>
