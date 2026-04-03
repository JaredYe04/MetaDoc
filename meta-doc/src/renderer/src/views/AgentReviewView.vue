<template>
  <div class="agent-review-view">
    <header class="agent-review-header">
      <h2>{{ t('agent.staging.reviewWindow', '编辑审阅') }}</h2>
      <div class="agent-review-header-actions">
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="agent-review-undo-redo"
          :disabled="!canReviewUndo"
          @click="doUndo"
        >
          <Undo2 class="h-3.5 w-3.5" />
          {{ t('common.undo', '撤销') }}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="agent-review-undo-redo"
          :disabled="!canReviewRedo"
          @click="doRedo"
        >
          <Redo2 class="h-3.5 w-3.5" />
          {{ t('common.redo', '重做') }}
        </Button>
      </div>
    </header>
    <div class="agent-review-body">
      <aside class="agent-review-list-wrap">
        <div class="agent-review-list-toolbar">
          <Button
            type="button"
            size="sm"
            class="agent-review-toolbar-btn agent-review-toolbar-accept"
            :disabled="!sessionHasPendingChunks"
            @click="acceptAllSession"
          >
            {{ t('agent.staging.acceptAllSession', '接受全部') }}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            class="agent-review-toolbar-btn"
            :disabled="!sessionHasPendingChunks"
            @click="rejectAllSession"
          >
            {{ t('agent.staging.rejectAllSession', '拒绝全部') }}
          </Button>
        </div>
        <div class="agent-review-list">
          <div
            v-for="edit in sessionEdits"
            :key="edit.id"
            class="agent-review-item"
            :class="{ selected: selectedEdit?.id === edit.id }"
            @click="selectEdit(edit)"
          >
            <span class="agent-review-item-path">{{
              edit.filePath.replace(/^.*[/\\]/, '') || edit.filePath
            }}</span>
            <span class="agent-review-item-diff">
              <span class="add">+{{ edit.addedLines }}</span>
              <span class="del">-{{ edit.removedLines }}</span>
            </span>
          </div>
          <div v-if="sessionEdits.length === 0" class="agent-review-empty">
            {{ t('agent.staging.empty') }}
          </div>
        </div>
      </aside>
      <div class="agent-review-main">
        <template v-if="selectedFresh">
          <div class="agent-review-diff-toolbar">
            <span class="agent-review-diff-path">{{ selectedFresh.filePath }}</span>
            <template v-if="selectedFresh.status === 'pending'">
              <Button
                v-if="showPendingDiff"
                type="button"
                variant="outline"
                size="sm"
                class="agent-review-diff-layout-toggle"
                @click="toggleSideBySide"
              >
                {{
                  sideBySide
                    ? t('agent.staging.diffUnified', '统一视图')
                    : t('agent.staging.diffSplit', '分列视图')
                }}
              </Button>
              <span class="agent-review-diff-actions">
                <Button size="sm" class="agent-review-toolbar-accept" @click="acceptAllCurrentFile">
                  {{ t('agent.staging.acceptAllFile', '接受全部') }}
                </Button>
                <Button size="sm" variant="destructive" @click="rejectAllCurrentFile">
                  {{ t('agent.staging.rejectAllFile', '拒绝全部') }}
                </Button>
              </span>
            </template>
            <span v-else class="agent-review-diff-status">
              {{
                selectedFresh.status === 'accepted'
                  ? t('agent.staging.accepted')
                  : t('agent.staging.rejected')
              }}
            </span>
          </div>
          <div v-if="showPendingDiff" class="agent-review-diff-row">
            <div
              ref="diffWrapRef"
              class="agent-review-diff-editor-wrap"
              @mousemove="onDiffHostMouseMove"
              @mouseleave="hideHunkHover"
            >
              <div id="agent-review-diff-root" class="agent-review-diff-editor-host" />
              <div
                v-show="inlinePanel.visible && inlinePanel.hunkId"
                class="agent-review-inline-hover"
                :style="{ top: Math.max(0, inlinePanel.topPx) + 'px' }"
                @mouseenter="hunkPopoverPinned = true"
                @mouseleave="hunkPopoverPinned = false"
              >
                <div v-if="chunkNavTotal > 0" class="agent-review-inline-nav">
                  <button
                    type="button"
                    class="agent-review-inline-icon-btn"
                    :disabled="chunkNavTotal === 0 || chunkNavIndex <= 0"
                    :aria-label="t('agent.staging.prevChunk', '上一处')"
                    @click="goPrevChunk"
                  >
                    <ChevronUp class="h-3 w-3" />
                  </button>
                  <span class="agent-review-inline-nav-counter">{{ chunkNavCounterLabel }}</span>
                  <button
                    type="button"
                    class="agent-review-inline-icon-btn"
                    :disabled="chunkNavTotal === 0 || chunkNavIndex >= chunkNavTotal - 1"
                    :aria-label="t('agent.staging.nextChunk', '下一处')"
                    @click="goNextChunk"
                  >
                    <ChevronDown class="h-3 w-3" />
                  </button>
                </div>
                <Button size="sm" variant="outline" class="agent-review-inline-reject" @click="rejectHoveredHunk">
                  {{ t('agent.staging.rejectHunk', '拒绝') }}
                </Button>
                <Button size="sm" class="agent-review-inline-accept" @click="acceptHoveredHunk">
                  {{ t('agent.staging.acceptHunk', '接受') }}
                </Button>
              </div>
            </div>
          </div>
          <div v-else-if="selectedFresh" class="agent-review-result-row">
            <div id="agent-review-single-root" class="agent-review-single-editor-host" />
          </div>
        </template>
        <div v-else class="agent-review-no-selection">
          {{ t('agent.staging.selectEdit', '请从左侧选择一条编辑') }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { ChevronDown, ChevronUp, Redo2, Undo2 } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { useAgentWorkspaceStore } from '../stores/agent-workspace-store'
import {
  useAgentEditStagingStore,
  type StagingEditRecord
} from '../stores/agent-edit-staging-store'
import { buildPendingHunkDiffLeftLineRanges } from '../utils/agent-edit-staging-line-stats'
import * as monaco from 'monaco-editor'
import { setupMonacoWorker } from '../utils/monaco-worker-config'
import { themeState } from '../utils/themes'

const { t } = useI18n()
const agentStore = useAgentWorkspaceStore()
const stagingStore = useAgentEditStagingStore()
const { canReviewUndo, canReviewRedo, reviewFocusEditId } = storeToRefs(stagingStore)

const WHOLE_FILE_HUNK = '__whole__'

const selectedEdit = ref<StagingEditRecord | null>(null)
const chunkNavIndex = ref(0)
const diffWrapRef = ref<HTMLElement | null>(null)
const sideBySide = ref(true)
const chunkNavItems = ref<{ origStartLine: number; hunkId: string }[]>([])

const inlinePanel = ref({ visible: false, topPx: 0, hunkId: '' as string })
const hoverAnchor = ref<{ line: number; isOriginal: boolean } | null>(null)
const hunkPopoverPinned = ref(false)

let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null
let diffUpdateListener: monaco.IDisposable | null = null
const diffScrollDisposables: monaco.IDisposable[] = []
let originalModel: monaco.editor.ITextModel | null = null
let modifiedModel: monaco.editor.ITextModel | null = null

let singleEditor: monaco.editor.IStandaloneCodeEditor | null = null
let singleModel: monaco.editor.ITextModel | null = null

const sessionEdits = computed(() => {
  const sid = agentStore.activeSessionId
  if (!sid) return []
  return stagingStore.getEditsForSession(sid)
})

const sessionHasPendingChunks = computed(() =>
  sessionEdits.value.some((e) => stagingStore.recordHasPendingReviewChunks(e))
)

const selectedFresh = computed(() => {
  const e = selectedEdit.value
  if (!e) return null
  return stagingStore.records.find((r) => r.id === e.id) ?? null
})

const selectedHasPendingChunks = computed(() => {
  const e = selectedFresh.value
  return e ? stagingStore.recordHasPendingReviewChunks(e) : false
})

/** 仍有待审 hunk（或整文件无 hunk 的 pending）时才显示 diff；否则显示折叠后的单栏结果 */
const showPendingDiff = computed(() => {
  const e = selectedFresh.value
  return !!(e && e.status === 'pending' && stagingStore.recordHasPendingReviewChunks(e))
})

function recordNeedsDiffEditor(e: StagingEditRecord): boolean {
  return e.status === 'pending' && stagingStore.recordHasPendingReviewChunks(e)
}

const pendingHunkRanges = computed(() => {
  const e = selectedFresh.value
  if (!e?.hunkOperations?.length || e.status !== 'pending') return []
  return buildPendingHunkDiffLeftLineRanges(e)
})

const chunkNavTotal = computed(() => chunkNavItems.value.length)

const chunkNavCounterLabel = computed(() => {
  const n = chunkNavTotal.value
  if (n === 0) return '—'
  return `${chunkNavIndex.value + 1} / ${n}`
})

watch(chunkNavTotal, (n) => {
  if (chunkNavIndex.value >= n) chunkNavIndex.value = Math.max(0, n - 1)
})

watch(
  sessionEdits,
  (edits) => {
    const id = selectedEdit.value?.id
    if (id && !edits.some((x) => x.id === id)) selectedEdit.value = null
  },
  { deep: true }
)

function selectEdit(edit: StagingEditRecord) {
  selectedEdit.value = edit
  chunkNavIndex.value = 0
}

function disposeDiffEditor() {
  for (const d of diffScrollDisposables) d.dispose()
  diffScrollDisposables.length = 0
  diffUpdateListener?.dispose()
  diffUpdateListener = null
  diffEditor?.dispose()
  diffEditor = null
  originalModel?.dispose()
  modifiedModel?.dispose()
  originalModel = null
  modifiedModel = null
  chunkNavItems.value = []
}

function disposeSingleEditor() {
  singleEditor?.dispose()
  singleEditor = null
  singleModel?.dispose()
  singleModel = null
}

function getMonacoTheme(): string {
  return themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs'
}

function ensureDiffEditor(edit: StagingEditRecord) {
  setupMonacoWorker()
  const el = document.getElementById('agent-review-diff-root')
  if (!el) return

  const oldC = stagingStore.foldRecordContentDiffLeftSide(edit)
  const newC = stagingStore.foldRecordContent(edit)

  if (!diffEditor) {
    diffEditor = monaco.editor.createDiffEditor(el, {
      readOnly: true,
      renderSideBySide: sideBySide.value,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      automaticLayout: true,
      originalEditable: false,
      enableSplitViewResizing: true,
      wordWrap: 'on'
    })
    diffUpdateListener = diffEditor.onDidUpdateDiff(() => {
      refreshChunkNavItems()
      nextTick(() => {
        if (chunkNavTotal.value > 0) revealCurrentChunk()
        if (inlinePanel.value.visible && hoverAnchor.value) updateInlinePanelPosition()
      })
    })
    const o = diffEditor.getOriginalEditor().onDidScrollChange(() => {
      if (inlinePanel.value.visible && hoverAnchor.value) updateInlinePanelPosition()
    })
    const m = diffEditor.getModifiedEditor().onDidScrollChange(() => {
      if (inlinePanel.value.visible && hoverAnchor.value) updateInlinePanelPosition()
    })
    diffScrollDisposables.push(o, m)
    monaco.editor.setTheme(getMonacoTheme())
  }

  originalModel?.dispose()
  modifiedModel?.dispose()
  originalModel = monaco.editor.createModel(oldC, 'plaintext')
  modifiedModel = monaco.editor.createModel(newC, 'plaintext')
  diffEditor.setModel({ original: originalModel, modified: modifiedModel })
  monaco.editor.setTheme(getMonacoTheme())
  refreshChunkNavItems()
}

function refreshChunkNavItems() {
  const e = selectedFresh.value
  if (!e || e.status !== 'pending' || !diffEditor) {
    chunkNavItems.value = []
    return
  }
  if (e.hunkOperations?.length) {
    chunkNavItems.value = buildPendingHunkDiffLeftLineRanges(e).map((r) => ({
      origStartLine: r.origStartLine,
      hunkId: r.hunkId
    }))
    return
  }
  const changes = diffEditor.getLineChanges() ?? []
  chunkNavItems.value = changes.map((c) => ({
    origStartLine: Math.max(1, c.originalStartLineNumber),
    hunkId: WHOLE_FILE_HUNK
  }))
}

function toggleSideBySide() {
  sideBySide.value = !sideBySide.value
  diffEditor?.updateOptions({ renderSideBySide: sideBySide.value })
}

function updateDiffEditorValues(edit: StagingEditRecord) {
  if (!originalModel || !modifiedModel) return
  const oldC = stagingStore.foldRecordContentDiffLeftSide(edit)
  const newC = stagingStore.foldRecordContent(edit)
  if (originalModel.getValue() !== oldC) originalModel.setValue(oldC)
  if (modifiedModel.getValue() !== newC) modifiedModel.setValue(newC)
  nextTick(() => refreshChunkNavItems())
}

function ensureSingleEditor(edit: StagingEditRecord) {
  setupMonacoWorker()
  const el = document.getElementById('agent-review-single-root')
  if (!el) return
  const text = stagingStore.foldRecordContent(edit)
  if (!singleEditor) {
    singleEditor = monaco.editor.create(el, {
      readOnly: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      automaticLayout: true,
      wordWrap: 'on'
    })
  }
  singleModel?.dispose()
  singleModel = monaco.editor.createModel(text, 'plaintext')
  singleEditor.setModel(singleModel)
  monaco.editor.setTheme(getMonacoTheme())
}

function updateSingleEditorValue(edit: StagingEditRecord) {
  if (!singleModel || !singleEditor) return
  const text = stagingStore.foldRecordContent(edit)
  if (singleModel.getValue() !== text) singleModel.setValue(text)
}

watch(
  () => selectedFresh.value,
  (edit) => {
    if (!edit) {
      disposeDiffEditor()
      disposeSingleEditor()
      return
    }
    nextTick(() => {
      setTimeout(() => {
        if (recordNeedsDiffEditor(edit)) {
          disposeSingleEditor()
          if (!diffEditor) ensureDiffEditor(edit)
          else updateDiffEditorValues(edit)
        } else {
          disposeDiffEditor()
          if (!singleEditor) ensureSingleEditor(edit)
          else updateSingleEditorValue(edit)
        }
      }, 50)
    })
  },
  { immediate: true, deep: true }
)

function applyReviewFocusId(id: string | null) {
  if (!id) return
  const rec = stagingStore.records.find((r) => r.id === id)
  if (rec) {
    selectedEdit.value = rec
    chunkNavIndex.value = 0
  }
  stagingStore.setReviewFocusEditId(null)
}

watch(
  reviewFocusEditId,
  (id) => {
    if (!id) return
    nextTick(() => applyReviewFocusId(id))
  },
  { immediate: true }
)

watch(
  () => themeState.currentTheme.type,
  () => {
    monaco.editor.setTheme(getMonacoTheme())
  }
)

function modifiedLineForOrigLine(origLine: number): number {
  if (!diffEditor) return origLine
  const changes = diffEditor.getLineChanges() ?? []
  for (const c of changes) {
    if (
      origLine >= c.originalStartLineNumber &&
      (c.originalEndLineNumber === 0
        ? origLine === c.originalStartLineNumber
        : origLine <= c.originalEndLineNumber)
    ) {
      return c.modifiedStartLineNumber || 1
    }
  }
  return origLine
}

function dismissInlinePanelAfterChunkNav() {
  hunkPopoverPinned.value = false
  if (hoverHideTimer) {
    clearTimeout(hoverHideTimer)
    hoverHideTimer = null
  }
  inlinePanel.value = { visible: false, topPx: 0, hunkId: '' }
  hoverAnchor.value = null
}

function goPrevChunk() {
  if (chunkNavIndex.value > 0) chunkNavIndex.value--
  revealCurrentChunk()
  dismissInlinePanelAfterChunkNav()
}

function goNextChunk() {
  if (chunkNavIndex.value < chunkNavTotal.value - 1) chunkNavIndex.value++
  revealCurrentChunk()
  dismissInlinePanelAfterChunkNav()
}

function revealCurrentChunk() {
  const item = chunkNavItems.value[chunkNavIndex.value]
  if (!item || !diffEditor) return
  const oLine = item.origStartLine
  const mLine = modifiedLineForOrigLine(oLine)
  diffEditor.getOriginalEditor().revealLineInCenter(oLine)
  diffEditor.getModifiedEditor().revealLineInCenter(mLine)
}

watch([chunkNavItems, () => diffEditor], () => {
  if (chunkNavItems.value.length && diffEditor) {
    nextTick(() => revealCurrentChunk())
  }
})

function findHunkIdAtOriginalLine(line: number): string | null {
  const e = selectedFresh.value
  if (!e || e.status !== 'pending') return null
  for (const g of pendingHunkRanges.value) {
    if (line >= g.origStartLine && line <= g.origEndLine) return g.hunkId
  }
  return null
}

function resolveHoverHunkId(line: number, isOriginal: boolean): string | null {
  const e = selectedFresh.value
  if (!e || e.status !== 'pending' || !diffEditor) return null
  if (e.hunkOperations?.length) {
    const origLine = isOriginal ? line : findOrigLineForModifiedLine(line)
    if (origLine == null) return null
    return findHunkIdAtOriginalLine(origLine)
  }
  const changes = diffEditor.getLineChanges() ?? []
  for (const c of changes) {
    if (isOriginal) {
      if (
        line >= c.originalStartLineNumber &&
        (c.originalEndLineNumber === 0
          ? line === c.originalStartLineNumber
          : line <= c.originalEndLineNumber)
      ) {
        return WHOLE_FILE_HUNK
      }
    } else if (
      line >= c.modifiedStartLineNumber &&
      (c.modifiedEndLineNumber === 0
        ? line === c.modifiedStartLineNumber
        : line <= c.modifiedEndLineNumber)
    ) {
      return WHOLE_FILE_HUNK
    }
  }
  return null
}

function syncChunkNavIndexForLine(origLine: number) {
  const items = chunkNavItems.value
  if (!items.length) return
  const e = selectedFresh.value
  if (e?.hunkOperations?.length) {
    const ranges = buildPendingHunkDiffLeftLineRanges(e)
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i]
      if (origLine >= r.origStartLine && origLine <= r.origEndLine) {
        chunkNavIndex.value = i
        return
      }
    }
    return
  }
  const changes = diffEditor?.getLineChanges() ?? []
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i]
    if (
      origLine >= c.originalStartLineNumber &&
      (c.originalEndLineNumber === 0
        ? origLine === c.originalStartLineNumber
        : origLine <= c.originalEndLineNumber)
    ) {
      chunkNavIndex.value = i
      return
    }
  }
}

function panelTopForEditorLine(
  editor: monaco.editor.ICodeEditor,
  line: number,
  wrapEl: HTMLElement
): number | null {
  const p = editor.getScrolledVisiblePosition({ lineNumber: line, column: 1 })
  if (!p) return null
  const edDom = editor.getDomNode()
  if (!edDom) return null
  const wrapRect = wrapEl.getBoundingClientRect()
  const edRect = edDom.getBoundingClientRect()
  return edRect.top - wrapRect.top + p.top
}

function updateInlinePanelPosition() {
  const wrap = diffWrapRef.value
  if (!wrap || !diffEditor || !hoverAnchor.value) return
  const ed = hoverAnchor.value.isOriginal
    ? diffEditor.getOriginalEditor()
    : diffEditor.getModifiedEditor()
  const top = panelTopForEditorLine(ed, hoverAnchor.value.line, wrap)
  if (top == null) {
    if (!hunkPopoverPinned.value) {
      inlinePanel.value.visible = false
    }
    return
  }
  inlinePanel.value.topPx = top
  inlinePanel.value.visible = true
}

let hoverHideTimer: ReturnType<typeof setTimeout> | null = null

function onDiffHostMouseMove(e: MouseEvent) {
  if (!diffEditor || !selectedFresh.value || selectedFresh.value.status !== 'pending') {
    hideHunkHover()
    return
  }
  const t = e.target as HTMLElement | null
  if (t?.closest?.('.agent-review-inline-hover')) {
    return
  }
  const wrap = diffWrapRef.value
  if (!wrap?.contains(e.target as Node)) {
    scheduleHideHover()
    return
  }
  const origEd = diffEditor.getOriginalEditor()
  const modEd = diffEditor.getModifiedEditor()
  const oRoot = origEd.getDomNode()
  const mRoot = modEd.getDomNode()
  if (!oRoot?.contains(e.target as Node) && !mRoot?.contains(e.target as Node)) {
    scheduleHideHover()
    return
  }
  const editor = oRoot?.contains(e.target as Node) ? origEd : modEd
  const isOriginal = editor === origEd
  const pos = editor.getTargetAtClientPoint(e.clientX, e.clientY)
  const line = pos?.position?.lineNumber
  if (!line) {
    scheduleHideHover()
    return
  }
  const hunkId = resolveHoverHunkId(line, isOriginal)
  if (!hunkId) {
    scheduleHideHover()
    return
  }
  if (hoverHideTimer) {
    clearTimeout(hoverHideTimer)
    hoverHideTimer = null
  }
  const origLine = isOriginal ? line : findOrigLineForModifiedLine(line) ?? line
  syncChunkNavIndexForLine(origLine)
  hoverAnchor.value = { line, isOriginal }
  inlinePanel.value.hunkId = hunkId
  updateInlinePanelPosition()
}

function findOrigLineForModifiedLine(modLine: number): number | null {
  if (!diffEditor) return null
  const changes = diffEditor.getLineChanges() ?? []
  for (const c of changes) {
    if (
      modLine >= c.modifiedStartLineNumber &&
      (c.modifiedEndLineNumber === 0
        ? modLine === c.modifiedStartLineNumber
        : modLine <= c.modifiedEndLineNumber)
    ) {
      return c.originalStartLineNumber
    }
  }
  return modLine
}

function scheduleHideHover() {
  if (hunkPopoverPinned.value) return
  if (hoverHideTimer) clearTimeout(hoverHideTimer)
  hoverHideTimer = setTimeout(() => {
    if (!hunkPopoverPinned.value) {
      inlinePanel.value = { visible: false, topPx: 0, hunkId: '' }
      hoverAnchor.value = null
    }
    hoverHideTimer = null
  }, 200)
}

function hideHunkHover() {
  scheduleHideHover()
}

async function acceptHoveredHunk() {
  const id = inlinePanel.value.hunkId
  const rec = selectedFresh.value
  if (!id || !rec) return
  stagingStore.pushReviewUndoSnapshot()
  try {
    if (id === WHOLE_FILE_HUNK) {
      stagingStore.acceptEdit(rec.id)
    } else {
      await stagingStore.setHunkStatus(rec.id, id, 'accepted')
    }
  } catch (e) {
    console.error(e)
  }
  inlinePanel.value = { visible: false, topPx: 0, hunkId: '' }
  hoverAnchor.value = null
}

async function rejectHoveredHunk() {
  const id = inlinePanel.value.hunkId
  const rec = selectedFresh.value
  if (!id || !rec) return
  stagingStore.pushReviewUndoSnapshot()
  try {
    if (id === WHOLE_FILE_HUNK) {
      await stagingStore.rejectEdit(rec)
    } else {
      await stagingStore.setHunkStatus(rec.id, id, 'rejected')
    }
  } catch (e) {
    console.error(e)
  }
  inlinePanel.value = { visible: false, topPx: 0, hunkId: '' }
  hoverAnchor.value = null
}

function acceptAllCurrentFile() {
  const rec = selectedFresh.value
  if (!rec || rec.status !== 'pending') return
  stagingStore.pushReviewUndoSnapshot()
  stagingStore.acceptEdit(rec.id)
}

async function rejectAllCurrentFile() {
  const rec = selectedFresh.value
  if (!rec || rec.status !== 'pending') return
  stagingStore.pushReviewUndoSnapshot()
  try {
    await stagingStore.rejectEdit(rec)
  } catch (e) {
    console.error(e)
  }
}

function acceptAllSession() {
  const sid = agentStore.activeSessionId
  if (!sid || !sessionHasPendingChunks.value) return
  stagingStore.pushReviewUndoSnapshot()
  stagingStore.acceptAll(sid)
}

async function rejectAllSession() {
  const sid = agentStore.activeSessionId
  if (!sid || !sessionHasPendingChunks.value) return
  stagingStore.pushReviewUndoSnapshot()
  try {
    await stagingStore.rejectAll(sid)
  } catch (e) {
    console.error(e)
  }
}

async function doUndo() {
  try {
    await stagingStore.undoReview()
  } catch (e) {
    console.error(e)
  }
}

async function doRedo() {
  try {
    await stagingStore.redoReview()
  } catch (e) {
    console.error(e)
  }
}

onBeforeUnmount(() => {
  disposeDiffEditor()
  disposeSingleEditor()
  if (hoverHideTimer) clearTimeout(hoverHideTimer)
})
</script>

<style scoped>
.agent-review-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.agent-review-header {
  flex-shrink: 0;
  padding: 6px 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.agent-review-header h2 { margin: 0; font-size: 14px; font-weight: 600; }
.agent-review-header-actions { display: flex; align-items: center; gap: 6px; }
.agent-review-undo-redo {
  display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 8px; font-size: 12px;
}
.agent-review-body { flex: 1; min-height: 0; display: flex; }
.agent-review-list-wrap {
  width: 220px; flex-shrink: 0; border-right: 1px solid var(--el-border-color-lighter);
  display: flex; flex-direction: column; min-height: 0;
}
.agent-review-list-toolbar {
  flex-shrink: 0; display: flex; align-items: center; gap: 4px; padding: 2px 6px;
  min-height: 22px; height: 22px; box-sizing: border-box;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.agent-review-toolbar-btn {
  flex: 1; min-width: 0; height: 18px; min-height: 18px; padding: 0 4px; font-size: 11px; line-height: 16px;
}
.agent-review-toolbar-accept { background: var(--el-color-success); color: #fff; }
.agent-review-toolbar-accept:hover { opacity: 0.92; color: #fff; }
.agent-review-list { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 0; }
.agent-review-item {
  display: flex; align-items: center; gap: 6px; padding: 2px 8px; min-height: 22px; height: 22px;
  box-sizing: border-box; font-size: 13px; line-height: 20px; cursor: pointer; margin: 0;
}
.agent-review-item:hover { background: var(--el-fill-color-light); }
.agent-review-item.selected {
  background: var(--el-color-primary-light-9); color: var(--el-text-color-primary);
}
html.dark .agent-review-item.selected,
[data-theme=dark] .agent-review-item.selected {
  background: rgba(64, 158, 255, 0.22); color: var(--el-text-color-primary);
}
.agent-review-item-path {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.agent-review-item-diff { flex-shrink: 0; font-size: 11px; line-height: 1; }
.agent-review-item-diff .add { color: var(--el-color-success); margin-right: 4px; }
.agent-review-item-diff .del { color: var(--el-color-danger); }
.agent-review-empty { padding: 10px 8px; font-size: 12px; color: var(--el-text-color-secondary); }
.agent-review-main { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.agent-review-diff-toolbar {
  flex-shrink: 0; padding: 6px 10px; border-bottom: 1px solid var(--el-border-color-lighter);
  display: flex; align-items: center; gap: 10px; font-size: 12px;
}
.agent-review-diff-path { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.agent-review-diff-layout-toggle { flex-shrink: 0; height: 26px; padding: 0 10px; font-size: 12px; }
.agent-review-diff-actions { display: flex; gap: 6px; flex-shrink: 0; }
.agent-review-diff-row {
  flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: stretch;
}
.agent-review-diff-editor-wrap {
  position: relative; flex: 1; min-width: 0; min-height: 200px; display: flex; flex-direction: column;
}
.agent-review-diff-editor-host { flex: 1; min-width: 0; min-height: 200px; }
.agent-review-result-row {
  flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column;
}
.agent-review-single-editor-host { flex: 1; min-width: 0; min-height: 200px; }
.agent-review-no-selection {
  flex: 1; display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: var(--el-text-color-secondary);
}
.agent-review-inline-hover {
  position: absolute; right: 8px; z-index: 30; display: flex; flex-direction: row; align-items: center;
  gap: 3px; padding: 1px 4px; margin-right: 8px; pointer-events: auto; overflow: hidden; opacity: 1;
  background: var(--el-bg-color-overlay); border: 1px solid var(--el-border-color-lighter);
  border-radius: 3px; box-shadow: var(--el-box-shadow-light);
}
.agent-review-inline-nav {
  display: flex; flex-direction: row; align-items: center; gap: 0; margin-right: 1px;
}
.agent-review-inline-nav-counter {
  font-size: 10px; font-weight: 600; color: var(--el-text-color-secondary); padding: 0 3px;
  line-height: 16px; user-select: none; white-space: nowrap; min-width: 2.2em; text-align: center;
}
.agent-review-inline-icon-btn {
  display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px;
  min-width: 16px; min-height: 16px; padding: 0; border: none; border-radius: 3px; background: transparent;
  color: var(--el-text-color-regular); cursor: pointer;
}
.agent-review-inline-icon-btn:hover:not(:disabled) { background: var(--el-fill-color-light); }
.agent-review-inline-icon-btn:disabled { opacity: 0.35; cursor: default; }
.agent-review-inline-accept { background: var(--el-color-success) !important; color: #fff !important; }
.agent-review-inline-accept:hover { opacity: 0.92; color: #fff !important; }
</style>
