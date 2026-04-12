<template>
  <div
    class="workspace-pane-group"
    :class="{ 'is-focused-pane': isFocusedPane }"
    @mousedown.self="focusPane"
  >
    <div
      v-if="showPaneTabStrip"
      class="pane-tab-strip"
      role="tablist"
      @dragover.prevent="onPaneStripDragOver"
      @drop.prevent="onPaneStripDrop"
    >
      <button
        v-for="tid in group.tabIds"
        :key="tid"
        type="button"
        role="tab"
        class="pane-tab-item tab-item"
        :data-pane-tab-id="tid"
        :class="paneTabItemClass(tid)"
        :aria-selected="tid === displayedTabId"
        :draggable="canDragPaneTab(tid)"
        @click="activateTabId(tid)"
        @dragstart.stop="onPaneDragStart(tid, $event)"
        @dragover.prevent="onPaneDragOver(tid, $event)"
        @dragleave="onPaneDragLeave"
        @drop.stop="onPaneDrop(tid, $event)"
        @dragend.stop="onPaneDragEnd($event)"
      >
        <span class="pane-tab-item__label">{{ tabLabel(tid) }}</span>
        <span v-if="tabDirty(tid)" class="pane-tab-item__dot" aria-hidden="true" />
        <span
          v-if="canCloseStripTab(tid)"
          class="pane-tab-item__close"
          title=""
          @click.stop="onCloseTab(tid)"
        >
          ×
        </span>
      </button>
      <div class="pane-tab-strip__filler" aria-hidden="true" />
    </div>
    <div
      class="pane-tab-content"
      data-editor-pane-drop-root
      :data-layout-group-id="group.id"
      @mousedown="focusPane"
    >
      <EditorPaneDropOverlay :pane-key="group.id" />
      <PaneTabBody
        v-if="displayedTabId"
        :tab-id="displayedTabId"
        @pane-activate="focusPane"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { isLayoutSplit, type LayoutTabGroup } from '../stores/workspace-layout'
import { useWorkspace } from '../stores/workspace'
import { useCloseTab } from '../composables/useCloseTab'
import { useFocusMode } from '../composables/useFocusMode'
import { useEditorChromeLayout } from '../composables/useEditorChromeLayout'
import eventBus from '../utils/event-bus'
import {
  useTabDrag,
  consumeTabDropPreviewIfNeeded,
  consumeEditorContentDropIfNeeded,
  setTabDragSourceSurface,
  snapshotEditorPaneDropHighlightBeforeConsume,
  snapshotDragEndDropHighlightFromPreview,
  TAB_DRAG_MIME_TYPE,
  WORKSPACE_FILE_PATH_DRAG_MIME,
  dndLog,
  readWorkspacePathFromDataTransfer,
  shouldTreatAsExternalWorkspacePathDrag
} from '../composables/useTabDrag'
import PaneTabBody from './PaneTabBody.vue'
import EditorPaneDropOverlay from './EditorPaneDropOverlay.vue'

const props = defineProps<{
  group: LayoutTabGroup
}>()

const workspace = useWorkspace()
const { closeTab } = useCloseTab()
const { isFocusMode } = useFocusMode()
const { editorChromeLayout } = useEditorChromeLayout()

/**
 * 窗格条：工作区布局始终显示；专注模式仅在有分屏（布局根为 split）时显示。
 */
const showPaneTabStrip = computed(() => {
  if (editorChromeLayout.value === 'workspace') return true
  if (isFocusMode.value) {
    return isLayoutSplit(workspace.workspaceLayoutRoot.value)
  }
  return false
})

const {
  draggingId,
  dropPreview,
  handleDragStart: tabDragStart,
  handleDragOver: tabDragOver,
  handleDragLeave: tabDragLeave,
  handleDrop: tabDrop,
  handleDragEnd: tabDragEnd,
  computeDropMode,
  findTabItemElement
} = useTabDrag()

const displayedTabId = computed(() => {
  const g = props.group
  if (g.activeTabId && g.tabIds.includes(g.activeTabId)) return g.activeTabId
  return g.tabIds[0] ?? ''
})

function canDragPaneTab(tabId: string): boolean {
  if (workspace.uiLocked?.value) return false
  const t = workspace.tabs.find((x) => x.id === tabId)
  return !!(t && !t._isClosing)
}

/** 与主栏 path 插入几何一致：条上空白区也可投放并显示缝高亮 */
function computePaneStripInsertHint(
  strip: HTMLElement,
  clientX: number
): { tabId: string; mode: 'before' | 'after' } | null {
  const items = [...strip.querySelectorAll(':scope > .pane-tab-item[data-pane-tab-id]')] as HTMLElement[]
  if (!items.length) return null

  const rects = items
    .map((el) => {
      const id = el.dataset.paneTabId?.trim() ?? ''
      return id ? { id, r: el.getBoundingClientRect() } : null
    })
    .filter((x): x is { id: string; r: DOMRect } => x !== null)

  if (!rects.length) return null

  const { id: firstId, r: fr } = rects[0]
  if (clientX < fr.left + fr.width / 2) {
    return { tabId: firstId, mode: 'before' }
  }

  for (let i = 0; i < rects.length; i++) {
    const { id, r } = rects[i]
    const mid = r.left + r.width / 2
    if (clientX >= r.left && clientX <= r.right) {
      return { tabId: id, mode: clientX < mid ? 'before' : 'after' }
    }
    if (i < rects.length - 1) {
      const nr = rects[i + 1].r
      if (clientX > r.right && clientX < nr.left) {
        return { tabId: id, mode: 'after' }
      }
    }
  }

  const { id: lastId } = rects[rects.length - 1]
  return { tabId: lastId, mode: 'after' }
}

function paneTabItemClass(tid: string): Record<string, boolean> {
  const dp = dropPreview.value
  return {
    'is-active': tid === displayedTabId.value,
    'drop-before': dp.targetId === tid && dp.mode === 'before',
    'drop-after': dp.targetId === tid && dp.mode === 'after',
    'drop-split-left': dp.targetId === tid && dp.splitEdge === 'left',
    'drop-split-right': dp.targetId === tid && dp.splitEdge === 'right',
    'drop-split-top': dp.targetId === tid && dp.splitEdge === 'top',
    'drop-split-bottom': dp.targetId === tid && dp.splitEdge === 'bottom'
  }
}

function onPaneDragStart(tabId: string, event: DragEvent): void {
  const tab = workspace.tabs.find((t) => t.id === tabId)
  if (!tab) {
    event.preventDefault()
    return
  }
  setTabDragSourceSurface('pane')
  dndLog('dragstart', 'pane-tab', { tabId, title: tab.title || tab.subtitle || '' })
  tabDragStart(tab, event)
}

function onPaneStripDragOver(event: DragEvent): void {
  const strip = event.currentTarget as HTMLElement
  const dt = event.dataTransfer
  if (!dt) return
  if (shouldTreatAsExternalWorkspacePathDrag(dt)) {
    dt.dropEffect = 'copy'
    return
  }
  const types = dt.types ?? []
  if (types.includes(TAB_DRAG_MIME_TYPE)) {
    dt.dropEffect = 'move'
    const hint = computePaneStripInsertHint(strip, event.clientX)
    if (hint) {
      dropPreview.value = { targetId: hint.tabId, mode: hint.mode, splitEdge: null }
    }
  }
}

async function onPaneStripDrop(event: DragEvent): Promise<void> {
  const path = readWorkspacePathFromDataTransfer(event.dataTransfer)
  if (path) {
    dndLog('drop', 'pane-strip', { path, groupId: props.group.id })
    event.stopPropagation()
    eventBus.emit('workspace-open-document', {
      path,
      workspacePlacement: 'workbench',
      layoutTargetGroupId: props.group.id,
      layoutInsertBeforeTabId: null
    })
    return
  }
  if (event.dataTransfer?.types.includes(TAB_DRAG_MIME_TYPE)) {
    event.stopPropagation()
    const strip = event.currentTarget as HTMLElement
    const hint = computePaneStripInsertHint(strip, event.clientX)
    if (hint) {
      const tab = workspace.tabs.find((t) => t.id === hint.tabId)
      if (tab) {
        dropPreview.value = { targetId: hint.tabId, mode: hint.mode, splitEdge: null }
        await tabDrop(tab, event)
        return
      }
    }
  }
}

function onPaneDragOver(tabId: string, event: DragEvent): void {
  const dt = event.dataTransfer
  if (shouldTreatAsExternalWorkspacePathDrag(dt)) {
    event.preventDefault()
    if (dt) dt.dropEffect = 'copy'
    return
  }
  const tab = workspace.tabs.find((t) => t.id === tabId)
  if (!tab) return
  tabDragOver(tab, event)
}

function onPaneDragLeave(): void {
  tabDragLeave()
}

async function onPaneDrop(tabId: string, event: DragEvent): Promise<void> {
  const path = readWorkspacePathFromDataTransfer(event.dataTransfer)
  if (path) {
    dndLog('drop', 'pane-tab-item', { path, tabId, groupId: props.group.id })
    event.preventDefault()
    event.stopPropagation()
    const el = findTabItemElement(event.currentTarget as HTMLElement)
    const mode = el ? computeDropMode(event, el) : 'after'
    const idx = props.group.tabIds.indexOf(tabId)
    let layoutInsertBeforeTabId: string | null = null
    if (idx >= 0) {
      layoutInsertBeforeTabId = mode === 'before' ? tabId : props.group.tabIds[idx + 1] ?? null
    }
    eventBus.emit('workspace-open-document', {
      path,
      workspacePlacement: 'workbench',
      layoutTargetGroupId: props.group.id,
      layoutInsertBeforeTabId
    })
    return
  }
  const tab = workspace.tabs.find((t) => t.id === tabId)
  if (!tab) return
  await tabDrop(tab, event)
}

async function onPaneDragEnd(event: DragEvent): Promise<void> {
  snapshotEditorPaneDropHighlightBeforeConsume()
  await consumeEditorContentDropIfNeeded(workspace)
  const previewSnap = { ...dropPreview.value }
  dndLog('dragend', 'pane-tab', {
    draggingId: draggingId.value,
    dropPreview: previewSnap
  })
  snapshotDragEndDropHighlightFromPreview(previewSnap)
  await consumeTabDropPreviewIfNeeded(workspace, previewSnap, draggingId.value)
  await tabDragEnd(event)
}

const isFocusedPane = computed(() => {
  const id = workspace.activeTabId.value
  return id ? props.group.tabIds.includes(id) : false
})

function tabLabel(tabId: string): string {
  const t = workspace.tabs.find((x) => x.id === tabId)
  if (!t) return ''
  return (t.title || t.subtitle || '').trim() || tabId.slice(0, 8)
}

function tabDirty(tabId: string): boolean {
  const t = workspace.tabs.find((x) => x.id === tabId)
  return !!(t?.dirty && !t.pinned)
}

function canCloseStripTab(tabId: string): boolean {
  const t = workspace.tabs.find((x) => x.id === tabId)
  if (!t || t.pinned) return false
  return workspace.canRemoveTab(tabId)
}

function activateTabId(tabId: string): void {
  workspace.activateTab(tabId)
}

function focusPane(): void {
  const id = displayedTabId.value
  if (id) workspace.activateTab(id)
}

async function onCloseTab(tabId: string): Promise<void> {
  await closeTab(tabId)
}
</script>

<style scoped>
.workspace-pane-group {
  display: flex;
  flex-direction: column;
  flex: 1 1 0%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 2px;
}

.workspace-pane-group.is-focused-pane {
  border-color: hsl(var(--primary) / 0.35);
}

.pane-tab-strip {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  gap: 2px;
  align-items: flex-end;
  min-height: 30px;
  padding: 2px 4px 0;
  background: hsl(var(--muted) / 0.35);
  border-bottom: 1px solid hsl(var(--border));
  overflow-x: auto;
}

.pane-tab-strip__filler {
  flex: 1 1 auto;
  min-width: 8px;
  align-self: stretch;
  margin-bottom: 0;
}

.pane-tab-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 180px;
  padding: 4px 8px;
  font-size: 12px;
  line-height: 1.2;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 4px 4px 0 0;
  background: transparent;
  color: hsl(var(--foreground));
  cursor: pointer;
  flex-shrink: 0;
}

.pane-tab-item:hover {
  background: hsl(var(--muted) / 0.5);
}

.pane-tab-item.is-active {
  background: hsl(var(--background));
  border-color: hsl(var(--border));
  border-bottom-color: hsl(var(--background));
  margin-bottom: -1px;
  z-index: 1;
}

.pane-tab-item.drop-before::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: hsl(var(--primary));
  z-index: 10;
}

.pane-tab-item.drop-after::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: hsl(var(--primary));
  z-index: 10;
}

.pane-tab-item.drop-split-left {
  box-shadow: inset 3px 0 0 hsl(var(--primary));
}

.pane-tab-item.drop-split-right {
  box-shadow: inset -3px 0 0 hsl(var(--primary));
}

.pane-tab-item.drop-split-top {
  box-shadow: inset 0 3px 0 hsl(var(--primary));
}

.pane-tab-item.drop-split-bottom {
  box-shadow: inset 0 -3px 0 hsl(var(--primary));
}

.pane-tab-item__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pane-tab-item__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: hsl(var(--primary));
  flex-shrink: 0;
}

.pane-tab-item__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 2px;
  font-size: 14px;
  line-height: 1;
  opacity: 0.65;
  flex-shrink: 0;
}

.pane-tab-item__close:hover {
  opacity: 1;
  background: hsl(var(--destructive) / 0.15);
}

.pane-tab-content {
  position: relative;
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: hsl(var(--background));
}
</style>
