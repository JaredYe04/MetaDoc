<template>
  <div
    class="manual-doc-outline vditor-outline"
    :style="{
      backgroundColor: themeState.currentTheme.sidebarBackground || themeState.currentTheme.background2nd,
      color: themeState.currentTheme.SideTextColor || themeState.currentTheme.textColor,
      borderColor: themeState.currentTheme.borderColor
    }"
  >
    <div class="manual-doc-outline__title vditor-outline__title">
      {{ $t('userManual.documentOutline') }}
    </div>
    <el-scrollbar class="manual-doc-outline__scrollbar">
      <Tree
        v-if="treeData.length"
        class="manual-doc-outline-tree"
        :data="treeData"
        :props="{ children: 'children', label: 'label' }"
        node-key="treeKey"
        :default-expand-all="true"
        :expand-on-click-node="false"
        @node-click="onTreeNodeClick"
      >
        <template #default="{ data }">
          <span
            class="manual-doc-outline__span"
            :class="{ 'manual-doc-outline__span--muted': data.headingIndex < 0 }"
            >{{ data.label }}</span
          >
        </template>
      </Tree>
      <div v-else class="manual-doc-outline__empty">{{ $t('userManual.documentOutlineEmpty') }}</div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { themeState } from '../../utils/themes'
import { stripManualInternalLinksToPlainText } from '../../manuals/utils'
import { extractOutlineTreeFromMarkdown } from '../../utils/md-utils'
import type { DocumentOutlineNode } from '../../../../types'
import { Tree } from '@renderer/components/ui/tree'

export interface OutlineTreeNode {
  treeKey: string
  path: string
  label: string
  headingIndex: number
  children: OutlineTreeNode[]
}

const props = defineProps<{
  markdown: string
}>()

const emit = defineEmits<{
  jump: [headingIndex: number]
}>()

function buildTreeFromRoot(root: DocumentOutlineNode): OutlineTreeNode[] {
  let headingSeq = 0

  function mapNode(n: DocumentOutlineNode): OutlineTreeNode | null {
    const rawTitle = (n.title || '').trim()
    const label = rawTitle ? stripManualInternalLinksToPlainText(rawTitle) : ''
    const childNodes = (n.children || [])
      .map(mapNode)
      .filter((x): x is OutlineTreeNode => x !== null)

    if (n.path === 'dummy') {
      return null
    }

    if (!label && childNodes.length === 0) return null

    const headingIndex = label ? headingSeq++ : -1
    const pathPart = n.path && n.path !== 'dummy' ? n.path : `n-${headingSeq}`
    const treeKey = `${pathPart}#${headingIndex >= 0 ? headingIndex : 'g'}`

    if (!label && childNodes.length > 0) {
      return {
        treeKey: `${pathPart}__group`,
        path: n.path,
        label: '…',
        headingIndex: -1,
        children: childNodes
      }
    }

    return {
      treeKey,
      path: n.path,
      label,
      headingIndex,
      children: childNodes
    }
  }

  if (root.path === 'dummy') {
    return (root.children || []).map(mapNode).filter((x): x is OutlineTreeNode => x !== null)
  }
  const one = mapNode(root)
  return one ? [one] : []
}

const treeData = computed((): OutlineTreeNode[] => {
  const raw = props.markdown ?? ''
  if (!raw.trim()) return []
  try {
    const root = extractOutlineTreeFromMarkdown(raw, true)
    return buildTreeFromRoot(root)
  } catch {
    return []
  }
})

function onTreeNodeClick(data: OutlineTreeNode) {
  if (data.headingIndex >= 0) {
    emit('jump', data.headingIndex)
  }
}
</script>

<style scoped>
.manual-doc-outline {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  border: 1px solid color-mix(in srgb, var(--el-border-color, #dcdfe6) 80%, transparent);
  border-radius: 8px;
  overflow: hidden;
  box-sizing: border-box;
}

.manual-doc-outline__title {
  font-weight: 600;
  font-size: 13px;
  padding: 8px 10px !important;
  border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent) !important;
  flex-shrink: 0;
}

.manual-doc-outline__scrollbar {
  flex: 1;
  min-height: 0;
}

.manual-doc-outline__scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.manual-doc-outline-tree {
  padding: 6px 4px 10px;
  background: transparent;
}

.manual-doc-outline-tree :deep(.el-tree-node__content) {
  height: auto;
  min-height: 30px;
  padding: 2px 4px;
  border-radius: 6px;
  background: transparent !important;
}

.manual-doc-outline-tree :deep(.el-tree-node__content:hover) {
  background-color: color-mix(in srgb, currentColor 8%, transparent) !important;
}

.manual-doc-outline-tree :deep(.el-tree-node__expand-icon) {
  color: inherit;
  padding: 4px;
}

.manual-doc-outline__span {
  flex: 1;
  cursor: pointer;
  padding: 4px 6px;
  font-size: 13px;
  line-height: 1.35;
  text-align: left;
  transition:
    background-color 0.15s ease,
    transform 0.08s ease;
}

.manual-doc-outline__span--muted {
  cursor: default;
  opacity: 0.55;
}

.manual-doc-outline__empty {
  padding: 16px 12px;
  font-size: 12px;
  opacity: 0.65;
}
</style>
