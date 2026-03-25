<template>
  <!-- max-height 必须用 prop：EP 把高度写在 .el-scrollbar__wrap 上，只写外层 class 会导致 wrap 随内容撑满、根区域无法纵向滚动 -->
  <el-scrollbar
    ref="rootScrollbarRef"
    class="workspace-display-scrollbar"
    max-height="min(70vh, 640px)"
  >
    <div class="workspace-display" :style="containerStyle">
      <div
        v-if="
          displayData.stage === 'loading-tree' ||
          displayData.stage === 'reading' ||
          displayData.stage === 'searching' ||
          displayData.stage === 'operating'
        "
        class="status-message"
        :style="statusMessageStyle"
      >
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>{{ getStageMessage(displayData.stage) }}</span>
      </div>

      <!-- 目录树显示（含模糊搜索结果） -->
      <div
        v-else-if="displayData.stage === 'completed' && displayData.tree"
        class="tree-view"
        :style="treeViewStyle"
      >
        <div class="tree-header" :style="headerStyle">
          <h3 class="tree-title" :style="titleStyle">
            {{
              displayData.searchQuery
                ? $t('agent.display.workspace.searchResultsTitle', {
                    query: displayData.searchQuery
                  })
                : $t('agent.display.workspace.directoryTree')
            }}
          </h3>
          <Badge variant="secondary">
            <template v-if="displayData.searchQuery">
              {{ $t('agent.display.workspace.matchCount', {
                count: displayData.treeTotalCount ?? displayData.tree.length
              }) }}
              <template v-if="displayData.treeTruncated"> ({{ $t('agent.display.workspace.truncated') }})</template>
            </template>
            <template v-else>
              {{ $t('agent.display.workspace.workspaceFolder') }}:
              {{ displayData.workspaceFolder }}
              <template v-if="displayData.treeTruncated"> — {{ $t('agent.display.workspace.truncated') }}</template>
            </template>
          </Badge>
        </div>
        <div v-if="displayData.treeTruncationMessage" class="truncation-notice" :style="truncationNoticeStyle">
          {{ displayData.treeTruncationMessage }}
        </div>
        <el-scrollbar
          ref="treeScrollbarRef"
          class="workspace-tree-scrollbar"
          max-height="500px"
        >
          <div class="tree-content">
            <div
              v-for="(entry, index) in displayData.tree"
              :key="index"
              class="tree-entry"
              :class="{ 'is-file-clickable': !entry.isDirectory }"
              :style="getTreeEntryStyle(entry)"
              @click="!entry.isDirectory && openFileInPreview(entry.path, displayData.workspaceFolder)"
            >
              <el-icon v-if="entry.isDirectory" class="folder-icon">
                <Folder />
              </el-icon>
              <el-icon v-else class="file-icon">
                <Document />
              </el-icon>
              <span class="entry-name" :style="entryNameStyle">{{ entry.name }}</span>
              <span class="entry-path" :style="entryPathStyle">{{ entry.path }}</span>
            </div>
          </div>
        </el-scrollbar>
      </div>

      <!-- 文件/目录操作结果显示 -->
      <div
        v-else-if="
          displayData.stage === 'completed' &&
          displayData.operations &&
          Array.isArray(displayData.operations)
        "
        class="operations-view"
        :style="filesViewStyle"
      >
        <div class="files-header" :style="headerStyle">
          <h3 class="files-title" :style="titleStyle">
            {{ $t('agent.display.workspace.operationsTitle') }}
          </h3>
          <div class="header-tags" :style="headerTagsStyle">
            <Badge variant="secondary">{{
              $t('agent.display.workspace.operationsCount', {
                count: displayData.operations.length
              })
            }}</Badge>
          </div>
        </div>

        <el-scrollbar class="workspace-files-scrollbar" max-height="400px">
          <div class="files-content">
            <div
              v-for="(op, index) in displayData.operations"
              :key="index"
              class="file-item"
              :class="{ 'is-path-clickable': op.type === 'createFile' }"
              :style="getOperationItemStyle(op)"
              @click="op.type === 'createFile' && openFileInPreview(op.path)"
            >
              <div class="file-header" :style="fileHeaderStyle">
                <Badge :variant="op.success ? 'default' : 'destructive'">
                  {{ op.type }} — {{ op.success ? $t('common.success') : $t('common.failed') }}
                </Badge>
              </div>
              <div class="file-meta" :style="fileMetaStyle">
                <div>
                  <strong>{{ $t('agent.display.workspace.targetPath') }}:</strong>
                  <span>{{ op.path }}</span>
                </div>
                <div v-if="op.message">
                  <strong>{{ $t('agent.display.workspace.message') }}:</strong>
                  <span>{{ op.message }}</span>
                </div>
              </div>
            </div>
          </div>
        </el-scrollbar>
      </div>

      <!-- 文件内容 / 目录列表显示 -->
      <div
        v-else-if="
          displayData.stage === 'completed' &&
          displayData.result &&
          (displayData.result.files?.length || displayData.result.directoryListings?.length)
        "
        class="files-view"
        :style="filesViewStyle"
      >
        <div class="files-header" :style="headerStyle">
          <h3 class="files-title" :style="titleStyle">
            {{ $t('agent.display.workspace.filesTitle') }}
          </h3>
          <div class="header-tags" :style="headerTagsStyle">
            <Badge variant="secondary">{{
              $t('agent.display.workspace.filesCount', { count: displayData.result.totalFiles ?? 0 })
            }}</Badge>
            <Badge v-if="displayData.result.directoryListings?.length" variant="outline">
              {{ $t('agent.display.workspace.directoryListingsCount', {
                count: displayData.result.directoryListings.length
              }) }}
            </Badge>
            <Badge v-if="displayData.result.summarized">
              {{ $t('agent.display.workspace.summarized') }}
            </Badge>
          </div>
        </div>

        <!-- 目录列举（paths 中传入目录时） -->
        <div
          v-for="(listing, listIdx) in displayData.result.directoryListings"
          :key="'dir-' + listIdx"
          class="directory-listing-block"
          :style="directoryListingBlockStyle"
        >
          <div class="directory-listing-header" :style="fileHeaderStyle">
            <el-icon class="folder-icon"><Folder /></el-icon>
            <strong>{{ $t('agent.display.workspace.directoryListing') }}:</strong>
            <span>{{ listing.path }}</span>
            <Badge v-if="listing.truncated || listing.totalEntries" variant="secondary">
              {{ listing.totalEntries ?? listing.tree?.length }}{{ $t('agent.display.workspace.entries') }}
            </Badge>
          </div>
          <div v-if="listing.message" class="truncation-notice" :style="truncationNoticeStyle">
            {{ listing.message }}
          </div>
          <el-scrollbar class="workspace-dir-scrollbar" max-height="300px">
            <div class="tree-content">
              <div
                v-for="(entry, idx) in listing.tree"
                :key="idx"
                class="tree-entry"
                :class="{ 'is-file-clickable': !entry.isDirectory }"
                :style="getTreeEntryStyle(entry)"
                @click="!entry.isDirectory && openFileInPreview(entry.path)"
              >
                <el-icon v-if="entry.isDirectory" class="folder-icon"><Folder /></el-icon>
                <el-icon v-else class="file-icon"><Document /></el-icon>
                <span class="entry-name" :style="entryNameStyle">{{ entry.name }}</span>
                <span class="entry-path" :style="entryPathStyle">{{ entry.path }}</span>
              </div>
            </div>
          </el-scrollbar>
        </div>

        <!-- 文件内容 -->
        <el-scrollbar
          v-if="displayData.result.files?.length"
          ref="filesScrollbarRef"
          class="workspace-files-scrollbar"
          max-height="560px"
        >
          <div ref="filesContentRef" class="files-content">
            <div
              v-for="(file, index) in displayData.result.files"
              :key="index"
              class="file-item is-file-clickable"
              :style="getFileItemStyle(index)"
              @click="openFileInPreview(file.path)"
            >
              <div class="file-header" :style="fileHeaderStyle">
                <Badge variant="default">{{ file.path }}</Badge>
                <div class="file-meta" :style="fileMetaStyle">
                  <span v-if="file.startLine !== undefined && file.endLine !== undefined">
                    {{
                      $t('agent.display.workspace.linesRange', {
                        start: file.startLine,
                        end: file.endLine,
                        total: file.totalLines
                      })
                    }}
                  </span>
                  <span v-else>
                    {{ $t('agent.display.workspace.totalLines', { count: file.totalLines }) }}
                  </span>
                  <Badge v-if="file.truncated" variant="outline" class="ml-1">
                    {{ $t('agent.display.workspace.truncated') }}
                  </Badge>
                </div>
              </div>
              <div v-if="file.truncationMessage" class="truncation-notice" :style="truncationNoticeStyle">
                {{ file.truncationMessage }}
              </div>

              <!-- 摘要显示 -->
              <div
                v-if="file.summarized && file.summary"
                class="file-summary"
                :style="fileSummaryStyle"
              >
                <div class="summary-header" :style="summaryHeaderStyle">
                  <strong>{{ $t('agent.display.workspace.summary') }}</strong>
                </div>
                <div class="summary-content" :style="summaryContentStyle">{{ file.summary }}</div>
              </div>

              <!-- 文件内容显示 -->
              <div
                v-if="!file.summarized || displayFullContentMap.get(index)"
                class="file-content"
                :style="fileContentStyle"
              >
                <div class="content-header" :style="contentHeaderStyle">
                  <strong>{{ $t('agent.display.workspace.content') }}</strong>
                  <Button
                    v-if="file.summarized && file.summary"
                    size="sm"
                    :variant="displayFullContentMap.get(index) ? 'outline' : 'default'"
                    @click="toggleFullContent(index)"
                  >
                    {{
                      displayFullContentMap.get(index)
                        ? $t('agent.display.workspace.hideContent')
                        : $t('agent.display.workspace.showContent')
                    }}
                  </Button>
                </div>
                <WorkspaceFileContent
                  :file="file"
                  :content-text-style="contentTextStyle"
                />
              </div>
            </div>
          </div>
        </el-scrollbar>
      </div>

      <div v-else-if="displayData.stage === 'error'" class="error-state">
        <Alert variant="destructive">
          <XCircle class="h-4 w-4" />
          <AlertTitle>{{ displayData.error || $t('agent.display.workspace.error') }}</AlertTitle>
        </Alert>
      </div>
    </div>
  </el-scrollbar>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Loading, Folder, Document } from '@element-plus/icons-vue'
import { Button } from '@renderer/components/ui/button'
import { Alert, AlertTitle } from '@renderer/components/ui/alert'
import { XCircle } from 'lucide-vue-next'
import { Badge } from '@renderer/components/ui/badge'
import { useI18n } from 'vue-i18n'
import type { ToolDisplayComponentProps } from '../../../types/agent-tool'
import { useToolDisplayRealtime, parseToolData } from '../composables/useToolDisplayRealtime'
import { themeState } from '../../themes'
import type { WorkspaceToolResult } from '../workspace-tool'
import { attachWheelScrollChainForElement } from '../monaco-scroll-chain'
import eventBus from '../../event-bus'
import { extname, isAbsolute } from '../../path-utils'
import { formatRegistry } from '../../format-registry'
import WorkspaceFileContent from './WorkspaceFileContent.vue'

const { t } = useI18n()
const props = defineProps<ToolDisplayComponentProps>()

const rootScrollbarRef = ref<InstanceType<typeof import('element-plus').ElScrollbar> | null>(null)
const treeScrollbarRef = ref<InstanceType<typeof import('element-plus').ElScrollbar> | null>(null)
const filesScrollbarRef = ref<InstanceType<typeof import('element-plus').ElScrollbar> | null>(null)
const filesContentRef = ref<HTMLElement | null>(null)

let scrollChainCleanups: Array<() => void> = []

function attachScrollChains() {
  scrollChainCleanups.forEach((f) => f())
  scrollChainCleanups = []

  const wrap = (el: HTMLElement | null) => {
    if (!el) return
    const w = el.querySelector?.('.el-scrollbar__wrap') as HTMLElement | null
    if (w && w.scrollHeight > w.clientHeight) {
      scrollChainCleanups.push(attachWheelScrollChainForElement(w))
    }
  }

  wrap(rootScrollbarRef.value?.$el ?? null)
  wrap(treeScrollbarRef.value?.$el ?? null)
  wrap(filesScrollbarRef.value?.$el ?? null)

  const filesEl = filesContentRef.value
  if (filesEl) {
    filesEl.querySelectorAll('.file-content-scroll .el-scrollbar__wrap').forEach((el) => {
      const w = el as HTMLElement
      if (w.scrollHeight > w.clientHeight) {
        scrollChainCleanups.push(attachWheelScrollChainForElement(w))
      }
    })
  }
}

const { realtimeData, realtimeStatus, realtimeProgress } = useToolDisplayRealtime(
  props.invocationId,
  props.data,
  props.status,
  props.progress
)

const displayFullContentMap = ref<Map<number, boolean>>(new Map())

const displayData = computed(() => {
  const data = realtimeData.value !== null ? realtimeData.value : props.data
  const parsed = parseToolData(data) as any

  if (parsed && typeof parsed === 'object') {
    const getStage = (): 'loading-tree' | 'reading' | 'searching' | 'operating' | 'completed' | 'error' => {
      if (parsed.stage) {
        return parsed.stage
      }
      if (props.status === 'succeeded') {
        return 'completed'
      }
      if (props.status === 'failed') {
        return 'error'
      }
      return 'reading'
    }

    return {
      ...parsed,
      stage: getStage()
    }
  }

  const defaultStage =
    props.status === 'succeeded' ? 'completed' : props.status === 'failed' ? 'error' : 'reading'
  return {
    stage: defaultStage,
    tree: undefined,
    result: undefined,
    error: undefined
  }
})

/** 用于 attachScrollChains 的依赖：仅当“结构”变化时重挂滚动链，避免对 displayData 做 deep watch 导致大结果时频繁跑全量逻辑 */
const displayDataScrollSignature = computed(() => {
  const d = displayData.value as any
  if (!d || typeof d !== 'object') return ''
  const stage = d.stage ?? ''
  const treeLen = Array.isArray(d.tree) ? d.tree.length : 0
  const filesLen = d.result?.files?.length ?? 0
  const dirListLen = d.result?.directoryListings?.length ?? 0
  return `${stage}-${treeLen}-${filesLen}-${dirListLen}`
})

const toggleFullContent = (index: number) => {
  const current = displayFullContentMap.value.get(index) || false
  displayFullContentMap.value.set(index, !current)
  nextTick(attachScrollChains)
}

/** 解析路径为绝对路径（相对路径则基于工作区根目录） */
function resolveFilePath(pathStr: string, workspaceFolder?: string): string {
  if (!pathStr || typeof pathStr !== 'string') return ''
  const normalized = pathStr.replace(/\\/g, '/').trim()
  if (isAbsolute(normalized)) return normalized
  try {
    const saved = localStorage.getItem('workspaceFolders')
    const root = workspaceFolder || (saved ? (JSON.parse(saved) as string[])?.[0] : null)
    if (root) {
      const base = root.replace(/[/\\]+$/, '')
      const clean = normalized.replace(/^[/\\]+/, '')
      return `${base}/${clean}`.replace(/\/+/g, '/')
    }
  } catch {}
  return normalized
}

/** 打开文件到预览 tab（已打开则 focus） */
function openFileInPreview(filePath: string, workspaceFolder?: string) {
  const resolved = resolveFilePath(filePath, workspaceFolder)
  if (!resolved) return
  const ext = extname(resolved)
  const formatId = formatRegistry.getFormatByExtension(ext) || 'txt'
  eventBus.emit('workspace-open-document', {
    path: resolved,
    format: formatId,
    content: '',
    preview: true
  })
}

onMounted(() => {
  nextTick(attachScrollChains)
})

onBeforeUnmount(() => {
  scrollChainCleanups.forEach((f) => f())
  scrollChainCleanups = []
})

watch(
  displayDataScrollSignature,
  () => nextTick(attachScrollChains),
  { immediate: true }
)

const getStageMessage = (stage: string) => {
  if (stage === 'loading-tree') return t('agent.display.workspace.loadingTree')
  if (stage === 'reading') return t('agent.display.workspace.reading')
  if (stage === 'searching') return t('agent.display.workspace.searching')
  if (stage === 'operating') return t('agent.tool.workspace.progress.operating', '正在执行文件/目录操作...')
  return t('agent.display.workspace.processing')
}

const getTreeEntryStyle = (entry: { isDirectory: boolean }) => {
  return {
    backgroundColor: entry.isDirectory
      ? themeState.currentTheme.background2nd
      : themeState.currentTheme.background,
    padding: '8px 12px',
    marginBottom: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  }
}

const getFileItemStyle = (index: number) => {
  return {
    backgroundColor: themeState.currentTheme.background,
    border: `1px solid ${themeState.currentTheme.textColor2}20`,
    borderRadius: '6px',
    padding: '16px',
    marginBottom: '16px'
  }
}

const getOperationItemStyle = (op: { success?: boolean }) => {
  return {
    backgroundColor: themeState.currentTheme.background,
    border: `1px solid ${
      op.success ? `${themeState.currentTheme.primaryColor}60` : `${themeState.currentTheme.textColor2}60`
    }`,
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '12px'
  }
}

const containerStyle = computed(() => ({
  padding: '16px',
  backgroundColor: 'transparent',
  borderRadius: '0',
  color: themeState.currentTheme.textColor
}))

const statusMessageStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '20px',
  textAlign: 'center',
  justifyContent: 'center'
}))

const treeViewStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const filesViewStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const headerStyle = computed(() => ({
  marginBottom: '16px',
  paddingBottom: '12px',
  borderBottom: `1px solid ${themeState.currentTheme.textColor2}20`,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap'
}))

const headerTagsStyle = computed(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap'
}))

const titleStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  margin: 0
}))

const entryNameStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  fontSize: '13px',
  fontWeight: '500'
}))

const entryPathStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '11px',
  fontFamily: 'monospace',
  marginLeft: 'auto'
}))

const fileHeaderStyle = computed(() => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '12px',
  flexWrap: 'wrap',
  gap: '8px'
}))

const fileMetaStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '12px',
  fontFamily: 'monospace'
}))

const truncationNoticeStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '12px',
  marginBottom: '8px',
  padding: '6px 10px',
  backgroundColor: themeState.currentTheme.background2nd,
  borderRadius: '4px'
}))

const directoryListingBlockStyle = computed(() => ({
  marginBottom: '16px',
  padding: '12px',
  backgroundColor: themeState.currentTheme.background2nd,
  borderRadius: '6px',
  border: `1px solid ${themeState.currentTheme.textColor2}20`
}))

const fileSummaryStyle = computed(() => ({
  marginBottom: '12px',
  padding: '12px',
  backgroundColor: themeState.currentTheme.background2nd,
  borderRadius: '4px'
}))

const summaryHeaderStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  fontSize: '13px',
  marginBottom: '8px'
}))

const summaryContentStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  fontSize: '13px',
  lineHeight: '1.6',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word'
}))

const fileContentStyle = computed(() => ({
  marginTop: '12px'
}))

const contentHeaderStyle = computed(() => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '8px',
  color: themeState.currentTheme.textColor,
  fontSize: '13px'
}))

const contentTextStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  padding: '12px',
  borderRadius: '4px',
  fontSize: '12px',
  fontFamily: 'monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflowX: 'auto',
  color: themeState.currentTheme.textColor,
  margin: 0
}))
</script>

<style scoped>
.workspace-display-scrollbar {
  width: 100%;
  max-height: min(70vh, 640px);
  min-height: 0;
  display: block;
}

/* 与 max-height prop 一致，防止仅外层受限而 wrap 仍被内容撑开 */
.workspace-display-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: auto !important;
  overflow-y: auto !important;
  max-height: min(70vh, 640px);
}

.workspace-display {
  width: 100%;
}

/* 目录树/搜索结果列表 panel：限制最大高度，使 el-scrollbar 内部可纵向滚动 */
.workspace-tree-scrollbar {
  width: 100%;
  max-height: 500px;
  display: block;
}

.workspace-files-scrollbar {
  width: 100%;
  max-height: 600px;
  display: block;
}

/* el-scrollbar 内部可滚动区域：限制高度并启用滚动 */
.workspace-tree-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: auto;
  overflow-y: scroll;
  max-height: 500px;
}

.workspace-files-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: auto;
  overflow-y: scroll;
  max-height: 600px;
}

.workspace-tree-scrollbar :deep(.el-scrollbar__view),
.workspace-files-scrollbar :deep(.el-scrollbar__view) {
  display: block;
}

.workspace-dir-scrollbar {
  width: 100%;
  display: block;
}

.workspace-dir-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: auto;
  overflow-y: auto;
  max-height: 300px;
}

/* 单个文件内容块内的 pre 滚动 */
.file-content-scroll {
  width: 100%;
  max-height: 400px;
  display: block;
}

.file-content-scroll :deep(.el-scrollbar__wrap) {
  overflow-x: auto;
  overflow-y: scroll;
  max-height: 400px;
}

.tree-content {
  padding: 8px;
}

.tree-entry {
  transition: background-color 0.2s;
}

.tree-entry:hover {
  background-color: v-bind('themeState.currentTheme.background2nd');
}

.tree-entry.is-file-clickable,
.file-item.is-file-clickable,
.file-item.is-path-clickable {
  cursor: pointer;
}

.files-content {
  padding: 8px;
}

.file-item {
  transition: box-shadow 0.2s;
}

.file-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.folder-icon {
  color: v-bind('themeState.currentTheme.primaryColor');
}

.file-icon {
  color: v-bind('themeState.currentTheme.textColor2');
}

.is-loading {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
