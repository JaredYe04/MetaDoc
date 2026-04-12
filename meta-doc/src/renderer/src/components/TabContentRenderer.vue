<template>
  <div class="tab-content-wrapper">
    <router-view v-if="tabs.length === 0" key="router-fallback" />
    <div v-else class="tab-content-inner">
      <!-- 经典：工具/系统全宽；工作区：top 独立文档 / 工具 / 系统 单 Pane，workbench 成员走分屏树 -->
      <div
        v-if="useSinglePaneBody"
        class="tab-active-pane-root"
        data-editor-pane-drop-root
        :data-layout-group-id="singlePaneDropGroupId || undefined"
      >
        <EditorPaneDropOverlay :pane-key="singlePaneDropPaneKey" />
        <PaneTabBody
          v-if="activeWorkspaceTab"
          :key="`single-${activeWorkspaceTab.id}`"
          :tab-id="activeWorkspaceTab.id"
        />
      </div>
      <WorkspaceSplitRoot v-else class="tab-split-root" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, nextTick } from 'vue'
import { useWorkspace } from '../stores/workspace'
import { getEditorChromeLayoutSync } from '../stores/editor-chrome-layout-state'
import { collectTabIdsInLayout, findGroupContainingTab } from '../stores/workspace-layout'
import PaneTabBody from './PaneTabBody.vue'
import WorkspaceSplitRoot from './WorkspaceSplitRoot.vue'
import EditorPaneDropOverlay from './EditorPaneDropOverlay.vue'

const workspace = useWorkspace()
const { tabs, activeTabId, workspaceLayoutRoot } = workspace

const activeWorkspaceTab = computed(() => {
  const id = activeTabId.value
  if (!id) return null
  return tabs.find((t) => t.id === id) ?? null
})

const singlePaneDropGroupId = computed(() => {
  const id = activeTabId.value
  if (!id) return null as string | null
  return findGroupContainingTab(workspaceLayoutRoot.value, id)?.id ?? null
})

const singlePaneDropPaneKey = computed(() => singlePaneDropGroupId.value ?? '__single_pane__')

/** 单 PaneTabBody：经典下文档走分屏根下的单组；工作区下 top 文档/工具/系统单栏，workbench 走 SplitRoot */
const useSinglePaneBody = computed(() => {
  const t = activeWorkspaceTab.value
  if (!t) return true
  if (getEditorChromeLayoutSync() === 'classic') {
    if (t.kind === 'tool' || t.kind === 'system') return true
    return false
  }
  // workspace：在分屏树内的系统/工具页（如工作台里的主页）必须与文档格一起走 SplitRoot，不能单 Pane 盖住整个工作台
  if (t.kind === 'tool' || t.kind === 'system') {
    const inWorkbenchTree = collectTabIdsInLayout(workspaceLayoutRoot.value).has(t.id)
    if (inWorkbenchTree) return false
    return true
  }
  if (t.kind === 'file' || t.kind === 'new') {
    return t.workspacePlacement === 'top'
  }
  return false
})

const ensureActiveTab = () => {
  if (tabs.length > 0 && !activeTabId.value) {
    workspace.activateTab(tabs[0].id)
  }
}
watch([() => tabs.length, activeTabId], ensureActiveTab)
onMounted(() => {
  nextTick(ensureActiveTab)
})
</script>

<style scoped>
.tab-content-wrapper {
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tab-content-inner {
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tab-active-pane-root {
  position: relative;
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.tab-active-pane-root > :deep(*) {
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.tab-split-root {
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
</style>
