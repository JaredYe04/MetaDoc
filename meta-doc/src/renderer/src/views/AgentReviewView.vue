<template>
  <div class="agent-review-view">
    <header class="agent-review-header">
      <h2>{{ t('agent.staging.reviewWindow', '编辑审阅') }}</h2>
    </header>
    <div class="agent-review-body">
      <aside class="agent-review-list">
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
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="agent-review-item-close"
            :title="t('agent.staging.dismiss', '关闭并拒绝')"
            @click.stop="dismissEdit(edit)"
          >
            <X class="h-3.5 w-3.5" />
          </Button>
        </div>
        <div v-if="sessionEdits.length === 0" class="agent-review-empty">
          {{ t('agent.staging.empty') }}
        </div>
      </aside>
      <div class="agent-review-diff">
        <template v-if="selectedEdit">
          <div class="agent-review-diff-toolbar">
            <span class="agent-review-diff-path">{{ selectedEdit.filePath }}</span>
            <span v-if="selectedEdit.status === 'pending'" class="agent-review-diff-actions">
              <Button size="sm" @click="acceptSelected">{{ t('agent.staging.accept') }}</Button>
              <Button size="sm" variant="destructive" @click="rejectSelected">{{
                t('agent.staging.reject')
              }}</Button>
            </span>
            <span v-else class="agent-review-diff-status">
              {{
                selectedEdit.status === 'accepted'
                  ? t('agent.staging.accepted')
                  : t('agent.staging.rejected')
              }}
            </span>
          </div>
          <div
            v-if="selectedEdit.hunkOperations?.length && selectedEdit.status === 'pending'"
            class="agent-review-hunks"
          >
            <div class="agent-review-hunks-title">
              {{ t('agent.staging.rejectByHunk', '按编辑块拒绝（将重算文件）') }}
            </div>
            <div
              v-for="h in selectedEdit.hunkOperations"
              :key="h.id"
              class="agent-review-hunk-row"
            >
              <span class="agent-review-hunk-meta"
                >{{ h.operation.type }} · {{ h.editId }}</span
              >
              <code class="agent-review-hunk-anchor">{{
                (h.operation.target?.anchor || '').slice(0, 100)
              }}</code>
              <Button
                v-if="h.status !== 'rejected'"
                size="sm"
                variant="outline"
                type="button"
                @click="rejectStagingHunk(h)"
              >
                {{ t('agent.staging.rejectHunk', '拒绝此块') }}
              </Button>
              <span v-else class="agent-review-hunk-rejected">{{
                t('agent.staging.hunkRejected', '此块已拒绝')
              }}</span>
            </div>
          </div>
          <div class="agent-review-monaco-wrap">
            <div class="editor-panel">
              <div class="editor-panel-label">{{ t('agent.display.diff.oldText', '旧文本') }}</div>
              <div :id="oldEditorContainerId" class="monaco-editor-container" />
            </div>
            <div class="editor-panel">
              <div class="editor-panel-label">{{ t('agent.display.diff.newText', '新文本') }}</div>
              <div :id="newEditorContainerId" class="monaco-editor-container" />
            </div>
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
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { useAgentWorkspaceStore } from '../stores/agent-workspace-store'
import {
  useAgentEditStagingStore,
  type StagingEditHunk,
  type StagingEditRecord
} from '../stores/agent-edit-staging-store'
import * as monaco from 'monaco-editor'
import { setupMonacoWorker } from '../utils/monaco-worker-config'
import { themeState } from '../utils/themes'

const { t } = useI18n()
const agentStore = useAgentWorkspaceStore()
const stagingStore = useAgentEditStagingStore()

const selectedEdit = ref<StagingEditRecord | null>(null)
const oldEditorContainerId = 'agent-review-old-container'
const newEditorContainerId = 'agent-review-new-container'
/** 从全局 getEditors() 中查找用：创建时保存 Monaco 分配的 id */
const oldEditorIdRef = ref<string | null>(null)
const newEditorIdRef = ref<string | null>(null)

const sessionEdits = computed(() => {
  const sid = agentStore.activeSessionId
  if (!sid) return []
  return stagingStore.getEditsForSession(sid)
})

function selectEdit(edit: StagingEditRecord) {
  selectedEdit.value = edit
}

function getEditorById(id: string | null): monaco.editor.IStandaloneCodeEditor | null {
  if (!id) return null
  const editors = monaco.editor.getEditors()
  const found = editors.find((e) => e.getId() === id)
  return (found as monaco.editor.IStandaloneCodeEditor) ?? null
}

function disposeEditors() {
  const oldE = getEditorById(oldEditorIdRef.value)
  const newE = getEditorById(newEditorIdRef.value)
  if (oldE) {
    oldE.dispose()
  }
  if (newE) {
    newE.dispose()
  }
  oldEditorIdRef.value = null
  newEditorIdRef.value = null
}

function ensureMonacoEditors(edit: StagingEditRecord) {
  setupMonacoWorker()
  const oldContainer = document.getElementById(oldEditorContainerId)
  const newContainer = document.getElementById(newEditorContainerId)
  if (!oldContainer || !newContainer) return

  disposeEditors()

  const theme = themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs'
  const oldContent = edit.oldContent ?? ''
  const newContent = edit.newContent ?? ''

  const oldEditor = monaco.editor.create(oldContainer, {
    value: oldContent,
    language: 'plaintext',
    theme,
    readOnly: true,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    fontSize: 13
  })
  oldEditorIdRef.value = oldEditor.getId()

  const newEditor = monaco.editor.create(newContainer, {
    value: newContent,
    language: 'plaintext',
    theme,
    readOnly: true,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    fontSize: 13
  })
  newEditorIdRef.value = newEditor.getId()
}

watch(
  selectedEdit,
  (edit) => {
    if (!edit) {
      disposeEditors()
      return
    }
    setTimeout(() => ensureMonacoEditors(edit), 50)
  },
  { immediate: true }
)

watch(
  () => themeState.currentTheme.type,
  () => {
    // Monaco 主题由 monaco-global-theme 统一管理
  }
)

function acceptSelected() {
  if (selectedEdit.value) {
    stagingStore.acceptEdit(selectedEdit.value.id)
  }
}

async function rejectSelected() {
  if (!selectedEdit.value) return
  try {
    await stagingStore.rejectEdit(selectedEdit.value)
  } catch (e) {
    console.error(e)
  }
}

async function rejectStagingHunk(h: StagingEditHunk) {
  if (!selectedEdit.value) return
  const rid = selectedEdit.value.id
  try {
    await stagingStore.setHunkStatus(rid, h.id, 'rejected')
  } catch (e) {
    console.error(e)
    return
  }
  const fresh = stagingStore.records.find((r) => r.id === rid)
  if (fresh) {
    selectedEdit.value = fresh
    setTimeout(() => ensureMonacoEditors(fresh), 50)
  }
}

async function dismissEdit(edit: StagingEditRecord) {
  try {
    await stagingStore.removeEdit(edit)
    if (selectedEdit.value?.id === edit.id) selectedEdit.value = null
  } catch (e) {
    console.error(e)
  }
}

onBeforeUnmount(() => {
  disposeEditors()
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
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.agent-review-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.agent-review-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.agent-review-list {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--el-border-color-lighter);
  overflow-y: auto;
  padding: 8px;
}

.agent-review-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  margin-bottom: 2px;
}

.agent-review-item:hover {
  background: var(--el-fill-color-light);
}

.agent-review-item.selected {
  background: var(--el-color-primary-light-9);
  color: var(--el-text-color-primary);
}
/* 暗色下避免白底白字：高亮用半透明主色，文字保持可读 */
html.dark .agent-review-item.selected,
[data-theme='dark'] .agent-review-item.selected {
  background: rgba(64, 158, 255, 0.22);
  color: var(--el-text-color-primary);
}

.agent-review-item-close {
  flex-shrink: 0;
  margin-left: auto;
  opacity: 0.6;
}
.agent-review-item-close:hover {
  opacity: 1;
}

.agent-review-item-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-review-item-diff {
  font-size: 11px;
  margin-top: 2px;
}

.agent-review-item-diff .add {
  color: var(--el-color-success);
  margin-right: 6px;
}

.agent-review-item-diff .del {
  color: var(--el-color-danger);
}

.agent-review-empty {
  padding: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.agent-review-diff {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.agent-review-diff-toolbar {
  flex-shrink: 0;
  padding: 6px 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.agent-review-diff-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-review-hunks {
  flex-shrink: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  max-height: 160px;
  overflow-y: auto;
}

.agent-review-hunks-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--el-text-color-secondary);
}

.agent-review-hunk-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--el-border-color-extra-light);
  font-size: 12px;
}

.agent-review-hunk-meta {
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.agent-review-hunk-anchor {
  flex: 1;
  min-width: 120px;
  font-size: 11px;
  word-break: break-word;
  white-space: pre-wrap;
  background: var(--el-fill-color-light);
  padding: 4px 6px;
  border-radius: 4px;
}

.agent-review-hunk-rejected {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.agent-review-monaco-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 0;
}

.agent-review-monaco-wrap .editor-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.agent-review-monaco-wrap .editor-panel-label {
  flex-shrink: 0;
  padding: 4px 8px;
  font-size: 11px;
  background: var(--el-fill-color-light);
}

.agent-review-monaco-wrap .monaco-editor-container {
  flex: 1;
  min-height: 200px;
}

.agent-review-no-selection {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
