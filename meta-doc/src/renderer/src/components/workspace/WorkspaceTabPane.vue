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
import { computed } from 'vue';
import MarkdownEditor from '../../views/MarkdownEditor.vue';
import LaTeXEditor from '../../views/LaTeXEditor.vue';
import NewDocumentWorkspace from '../../views/NewDocumentWorkspace.vue';
import type { WorkspaceTab } from '../../stores/workspace';

const props = withDefaults(
  defineProps<{
    tab: WorkspaceTab;
    active: boolean;
  }>(),
  {
    active: true,
  },
);

const editorComponent = computed(() => {
  if (props.tab.kind === 'new') return NewDocumentWorkspace;
  return props.tab.format === 'tex' ? LaTeXEditor : MarkdownEditor;
});

const editorDomId = computed(() => {
  if (props.tab.kind === 'new') return '';
  return props.tab.format === 'tex'
    ? `latex-editor-${props.tab.id}`
    : `vditor-${props.tab.id}`;
});
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
