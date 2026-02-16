<template>
  <component
    v-if="editorComponent"
    :is="editorComponent"
    :tab-id="tab.id"
    :active="active"
    :editor-dom-id="editorDomId"
    class="workspace-tab-pane"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MarkdownEditor from '../../views/MarkdownEditor.vue'
import LaTeXEditor from '../../views/LaTeXEditor.vue'
import PlainTextEditor from '../../views/PlainTextEditor.vue'
import NewDocumentWorkspace from '../../views/NewDocumentWorkspace.vue'
import type { WorkspaceTab } from '../../stores/workspace'
import { formatRegistry } from '../../utils/format-registry'

const props = withDefaults(
  defineProps<{
    tab: WorkspaceTab
    active: boolean
  }>(),
  {
    active: true
  }
)

const editorComponent = computed(() => {
  if (props.tab.kind === 'new') return NewDocumentWorkspace

  // 使用格式注册系统获取编辑器组件
  const format = formatRegistry.getFormat(props.tab.format)
  if (format && format.editorComponent) {
    return format.editorComponent
  }

  // 回退到硬编码的映射（向后兼容）
  if (props.tab.format === 'tex') return LaTeXEditor
  if (props.tab.format === 'txt') return PlainTextEditor
  return MarkdownEditor
})

const editorDomId = computed(() => {
  if (props.tab.kind === 'new') return ''

  // 根据格式生成编辑器DOM ID
  const format = props.tab.format
  if (format === 'tex') return `latex-editor-${props.tab.id}`
  if (format === 'txt') return `plaintext-editor-${props.tab.id}`
  return `vditor-${props.tab.id}`
})
</script>

<style scoped>
.workspace-tab-pane {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

/* 关键：无论渲染的是 MarkdownEditor/LaTeXEditor/NewDocumentWorkspace，
   都确保其“根节点元素”在 flex 容器中铺满可用空间，避免首次布局宽度/高度为 0 或不稳定 */
.workspace-tab-pane > :first-child {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
