<template>
  <div class="workspace-split-root">
    <WorkspaceSplitRenderer :node="layoutNode" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspace } from '../stores/workspace'
import WorkspaceSplitRenderer from './WorkspaceSplitRenderer.vue'

const workspace = useWorkspace()

const layoutNode = computed(() => workspace.workspaceLayoutRoot.value)
</script>

<style scoped>
.workspace-split-root {
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
