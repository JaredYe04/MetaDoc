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
    active: false,
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
  flex: 1;
  min-height: 0;
}
</style>
