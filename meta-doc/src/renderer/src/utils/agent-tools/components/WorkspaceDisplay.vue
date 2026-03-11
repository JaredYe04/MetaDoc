<template>
  <el-scrollbar ref="rootScrollbarRef" class="workspace-display-scrollbar">
    <div class="workspace-display" :style="containerStyle">
      <div
        v-if="
          displayData.stage === 'loading-tree' ||
          displayData.stage === 'reading' ||
          displayData.stage === 'searching'
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
              {{ $t('agent.display.workspace.matchCount', { count: displayData.tree.length }) }}
            </template>
            <template v-else>
              {{ $t('agent.display.workspace.workspaceFolder') }}:
              {{ displayData.workspaceFolder }}
            </template>
          </Badge>
        </div>
        <el-scrollbar ref="treeScrollbarRef" class="workspace-tree-scrollbar max-h-[500px]">
          <div class="tree-content">
            <div
              v-for="(entry, index) in displayData.tree"
              :key="index"
              class="tree-entry"
              :style="getTreeEntryStyle(entry)"
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

      <!-- 文件内容显示 -->
      <div
        v-else-if="
          displayData.stage === 'completed' && displayData.result && displayData.result.files
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
              $t('agent.display.workspace.filesCount', { count: displayData.result.totalFiles })
            }}</Badge>
            <Badge v-if="displayData.result.summarized">
              {{ $t('agent.display.workspace.summarized') }}
            </Badge>
          </div>
        </div>

        <el-scrollbar ref="filesScrollbarRef" class="workspace-files-scrollbar max-h-[600px]">
          <div ref="filesContentRef" class="files-content">
            <div
              v-for="(file, index) in displayData.result.files"
              :key="index"
              class="file-item"
              :style="getFileItemStyle(index)"
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
                </div>
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
                <el-scrollbar class="file-content-scroll max-h-[400px]">
                  <pre class="content-text" :style="contentTextStyle">{{ file.content }}</pre>
                </el-scrollbar>
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
    const getStage = (): 'loading-tree' | 'reading' | 'searching' | 'completed' | 'error' => {
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

const toggleFullContent = (index: number) => {
  const current = displayFullContentMap.value.get(index) || false
  displayFullContentMap.value.set(index, !current)
  nextTick(attachScrollChains)
}

onMounted(() => {
  nextTick(attachScrollChains)
})

onBeforeUnmount(() => {
  scrollChainCleanups.forEach((f) => f())
  scrollChainCleanups = []
})

watch(
  () => displayData.value,
  () => nextTick(attachScrollChains),
  { deep: true }
)

const getStageMessage = (stage: string) => {
  if (stage === 'loading-tree') return t('agent.display.workspace.loadingTree')
  if (stage === 'reading') return t('agent.display.workspace.reading')
  if (stage === 'searching') return t('agent.display.workspace.searching')
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
  max-height: 80vh;
}

.workspace-display-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: auto;
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
