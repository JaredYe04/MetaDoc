<template>
  <div
    v-if="wrapDocumentChrome"
    class="pane-tab-body pane-tab-body--with-view-menu"
    @mousedown.capture="onBodyMouseDown"
  >
    <ViewMenu class="pane-document-view-menu" :context-tab-id="tabId" />
    <div class="pane-document-editor-host">
      <keep-alive :max="24">
        <Editor
          v-if="isDocumentTab && tab"
          :key="`editor-${tab.id}`"
          :tab-id="tab.id"
        />
      </keep-alive>
    </div>
  </div>
  <div v-else class="pane-tab-body" @mousedown.capture="onBodyMouseDown">
    <keep-alive :max="24">
      <Editor
        v-if="isDocumentTab && tab"
        :key="`editor-${tab.id}`"
        :tab-id="tab.id"
      />
      <component
        v-else-if="activeMappedComponent && tab"
        :is="activeMappedComponent"
        :key="`${tab.kind}-${tab.route}-${tab.id}`"
      />
      <router-view
        v-else-if="useRouterFallback && tab"
        :key="`router-${tab.id}`"
      />
    </keep-alive>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspace } from '../stores/workspace'
import { getEditorChromeLayoutSync } from '../stores/editor-chrome-layout-state'
import { useFocusMode } from '../composables/useFocusMode'
import { getTabComponent } from '../config/tab-content-config'
import Editor from '../views/Editor.vue'
import ViewMenu from './ViewMenu.vue'

const props = defineProps<{
  tabId: string
}>()

const emit = defineEmits<{
  paneActivate: []
}>()

const workspace = useWorkspace()
const { isFocusMode } = useFocusMode()

const tab = computed(() => workspace.tabs.find((t) => t.id === props.tabId) ?? null)

const isDocumentTab = computed(() => {
  const t = tab.value
  return !!t && (t.kind === 'file' || t.kind === 'new')
})

/** 分屏工作区：每格文档左侧 ViewMenu；右侧 Explorer 等仅全局 ViewMenuContainer 一份 */
const wrapDocumentChrome = computed(() => {
  if (isFocusMode.value) return false
  if (getEditorChromeLayoutSync() !== 'workspace') return false
  return isDocumentTab.value
})

const activeMappedComponent = computed(() => {
  const t = tab.value
  if (!t || (t.kind !== 'system' && t.kind !== 'tool')) return null
  if (!t.route) return null
  return getTabComponent(t.kind, t.route)
})

const useRouterFallback = computed(() => {
  const t = tab.value
  if (!t || (t.kind !== 'system' && t.kind !== 'tool')) return false
  return !!t.route && !activeMappedComponent.value
})

function onBodyMouseDown() {
  emit('paneActivate')
}
</script>

<style scoped>
.pane-tab-body {
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pane-tab-body > :deep(*) {
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.pane-tab-body--with-view-menu {
  flex-direction: row;
  align-items: stretch;
}

.pane-tab-body--with-view-menu > :deep(.view-menu-container) {
  flex: 0 0 auto;
  width: auto;
  max-width: none;
  min-height: 0;
  align-self: stretch;
}

.pane-tab-body--with-view-menu > .pane-document-editor-host {
  flex: 1 1 0%;
  width: auto;
  max-width: none;
}

.pane-document-view-menu {
  flex-shrink: 0;
  height: 100%;
  min-height: 0;
}

.pane-document-editor-host {
  flex: 1 1 0%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pane-document-editor-host > :deep(*) {
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
}
</style>
