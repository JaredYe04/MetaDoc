<template>
  <div class="edit-display" :style="containerStyle">
    <!-- 紧凑模式：默认折叠的单一 Monaco 面板，仅文件名 + diff -->
    <template v-if="compact">
      <Collapsible v-model:open="compactPanelOpen" class="edit-display-compact-panel">
        <CollapsibleTrigger class="edit-display-compact-trigger">
          <ChevronRight v-if="!compactPanelOpen" class="edit-display-compact-chevron" />
          <ChevronDown v-else class="edit-display-compact-chevron" />
          <span class="edit-display-compact-filename">{{
            editFileName || t('agent.display.edit.title')
          }}</span>
          <span v-if="displayData.stage !== 'completed'" class="edit-display-compact-status">
            <el-icon class="is-loading"><Loading /></el-icon>
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div
            :id="compactDiffEditorId"
            class="edit-display-compact-monaco"
            :style="compactMonacoStyle"
          ></div>
        </CollapsibleContent>
      </Collapsible>
    </template>

    <!-- 非紧凑模式 -->
    <template v-else>
      <!-- Cursor 风格内联：文件名 + 最多 4 行 diff + 可展开 -->
      <div v-if="showCompactInline" class="edit-compact-inline" :style="compactInlineStyle">
        <div class="edit-compact-header" :style="chunkHeaderStyle">
          <span class="edit-compact-filename">{{
            editFileName || t('agent.display.edit.title')
          }}</span>
          <span v-if="displayData.stage !== 'completed'" class="edit-compact-status">
            <el-icon v-if="displayData.stage !== 'completed'" class="is-loading"
              ><Loading
            /></el-icon>
            {{ getStageMessage(displayData.stage) }}
          </span>
        </div>
        <div class="edit-compact-diff" :style="diffCompactStyle">
          <div
            v-for="(line, idx) in compactDiffLinesVisible"
            :key="idx"
            :class="['edit-compact-line', line.type === 'delete' ? 'diff-delete' : 'diff-insert']"
            :style="getDiffLineStyle(line.type)"
          >
            <span class="line-prefix">{{ line.type === 'delete' ? '-' : '+' }}</span>
            <span class="line-text">{{ line.text }}</span>
          </div>
        </div>
        <button
          v-if="hasMoreDiffLines && !compactDiffExpanded"
          type="button"
          class="edit-compact-expand-bar"
          @click="compactDiffExpanded = true"
        >
          <ChevronDown class="edit-compact-chevron" />
          <span>{{ t('agent.display.edit.expandDiff', '展开') }}</span>
        </button>
        <button
          v-else-if="hasMoreDiffLines && compactDiffExpanded"
          type="button"
          class="edit-compact-expand-bar"
          @click="compactDiffExpanded = false"
        >
          <ChevronUp class="edit-compact-chevron" />
          <span>{{ t('agent.display.edit.collapseDiff', '收起') }}</span>
        </button>
      </div>

      <div
        v-if="
          displayData.stage === 'loading' ||
          displayData.stage === 'applying' ||
          displayData.stage === 'updating'
        "
        class="status-message"
        :style="statusMessageStyle"
      >
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>{{ getStageMessage(displayData.stage) }}</span>
      </div>

      <div
        v-else-if="displayData.stage === 'completed'"
        class="completed-state"
        :style="completedStateStyle"
      >
        <div v-if="resultData" class="edit-header" :style="headerStyle">
          <h3 class="edit-title" :style="titleStyle">{{ $t('agent.display.edit.title') }}</h3>
          <div class="edit-stats" :style="statsStyle">
            <Badge variant="default"
              >{{ $t('agent.display.edit.appliedEdits') }}: {{ resultData.appliedEdits }}</Badge
            >
            <Badge v-if="resultData.failedEdits > 0" variant="destructive"
              >{{ $t('agent.display.edit.failedEdits') }}: {{ resultData.failedEdits }}</Badge
            >
            <Badge variant="secondary"
              >{{ $t('agent.display.edit.totalOperations') }}:
              {{ resultData.operations.length }}</Badge
            >
          </div>
        </div>

        <!-- 如果没有resultData，显示成功消息 -->
        <div v-else-if="!resultData" class="no-data-message" :style="noDataMessageStyle">
          <Result
            icon="success"
            :title="$t('agent.display.edit.completed') || '编辑完成'"
            :sub-title="$t('agent.display.edit.noDetails') || '编辑操作已成功完成'"
          />
        </div>

        <!-- Unified Diff 视图（如果有 hunks） -->
        <div v-if="hasHunks" class="diff-view">
          <ScrollArea class="max-h-[500px]">
            <div class="diff-content">
              <div
                v-for="(hunk, hunkIndex) in hunks"
                :key="`hunk-${hunkIndex}`"
                class="diff-chunk"
                :style="diffChunkStyle"
              >
                <div class="chunk-header" :style="chunkHeaderStyle">
                  <span class="chunk-info" :style="chunkInfoStyle">
                    @@ -{{ hunk.oldStart }},{{ hunk.oldCount }} +{{ hunk.newStart }},{{
                      hunk.newCount
                    }}
                    @@
                  </span>
                  <Badge :variant="getHunkTypeTag(hunk)">
                    {{ getHunkTypeLabel(hunk) }}
                  </Badge>
                </div>
                <!-- 显示删除的行 -->
                <div v-if="hunk.oldLines && hunk.oldLines.length > 0" class="diff-lines old-lines">
                  <div
                    v-for="(line, lineIndex) in hunk.oldLines"
                    :key="`old-${hunkIndex}-${lineIndex}`"
                    class="diff-line diff-delete"
                    :style="getDiffLineStyle('delete')"
                  >
                    <span class="line-number" :style="lineNumberStyle">{{
                      hunk.oldStart + lineIndex
                    }}</span>
                    <span class="line-content">- {{ line }}</span>
                  </div>
                </div>
                <!-- 显示新增的行 -->
                <div v-if="hunk.newLines && hunk.newLines.length > 0" class="diff-lines new-lines">
                  <div
                    v-for="(line, lineIndex) in hunk.newLines"
                    :key="`new-${hunkIndex}-${lineIndex}`"
                    class="diff-line diff-insert"
                    :style="getDiffLineStyle('insert')"
                  >
                    <span class="line-number" :style="lineNumberStyle">{{
                      hunk.newStart + lineIndex
                    }}</span>
                    <span class="line-content">+ {{ line }}</span>
                  </div>
                </div>
                <!-- 显示上下文行 -->
                <div
                  v-if="hunk.contextLines && hunk.contextLines.length > 0"
                  class="diff-lines context-lines"
                >
                  <div
                    v-for="(line, lineIndex) in hunk.contextLines"
                    :key="`context-${hunkIndex}-${lineIndex}`"
                    class="diff-line diff-context"
                    :style="getDiffLineStyle('context')"
                  >
                    <span class="line-number" :style="lineNumberStyle"></span>
                    <span class="line-content"> {{ line }}</span>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        <!-- 操作列表（有 operations 时） -->
        <div v-else-if="resultData && resultData.operations?.length">
          <ScrollArea class="max-h-[500px]">
            <div class="operations-list">
              <div
                v-for="(operation, index) in resultData.operations"
                :key="index"
                class="operation-item"
                :style="operationItemStyle"
              >
                <div class="operation-header" :style="operationHeaderStyle">
                  <Badge :variant="getOperationTypeTag(operation.type)">
                    {{ getOperationTypeLabel(operation.type) }}
                  </Badge>
                  <span class="operation-range" :style="rangeStyle">
                    {{ formatRange(operation.range) }}
                  </span>
                </div>
                <div class="operation-content" :style="contentStyle">
                  <div
                    v-if="operation.type === 'insert' || operation.type === 'replace'"
                    class="operation-new"
                  >
                    <span class="content-label" :style="labelStyle"
                      >{{ $t('agent.display.edit.newContent') }}:</span
                    >
                    <pre class="content-text" :style="textStyle">{{ operation.content || '' }}</pre>
                  </div>
                  <div
                    v-if="operation.type === 'delete' || operation.type === 'replace'"
                    class="operation-old"
                  >
                    <span class="content-label" :style="labelStyle"
                      >{{ $t('agent.display.edit.oldContent') }}:</span
                    >
                    <pre class="content-text deleted-text" :style="deletedTextStyle">{{
                      getOldContent(operation)
                    }}</pre>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>

      <div v-else class="error-state">
        <Alert variant="destructive">
          <XCircle class="h-4 w-4" />
          <AlertTitle>{{ displayData.error || $t('agent.display.edit.error') }}</AlertTitle>
        </Alert>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '../../../components/ui/alert'
import { XCircle, ChevronDown, ChevronUp } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Result } from '@renderer/components/ui/result'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import type { ToolDisplayComponentProps } from '../../../types/agent-tool'
import { useToolDisplayRealtime, parseToolData } from '../composables/useToolDisplayRealtime'
import { themeState } from '../../themes'
import * as monaco from 'monaco-editor'
import type { EditResult, EditOperation, UnifiedDiffHunk } from '../edit-tool'
import { parseUnifiedDiff } from '../edit-tool'
import { useWorkspace } from '../../../stores/workspace'
import { setupMonacoWorker } from '../../monaco-worker-config'

const { t } = useI18n()
const props = withDefaults(defineProps<ToolDisplayComponentProps & { paramsDiff?: string }>(), {
  compact: false
})

const { realtimeData, realtimeStatus, realtimeProgress } = useToolDisplayRealtime(
  props.invocationId,
  props.data,
  props.status,
  props.progress
)

const workspace = useWorkspace()

const displayData = computed(() => {
  // 优先使用实时数据（通过onUpdate发送的），这是工具主动发送的，更可靠
  const data = realtimeData.value !== null ? realtimeData.value : props.data
  const parsed = parseToolData(data) as any

  // 优先使用实时状态（通过eventBus更新的）
  const currentStatus = realtimeStatus.value !== 'running' ? realtimeStatus.value : props.status

  if (parsed && typeof parsed === 'object') {
    const getStage = (): 'loading' | 'applying' | 'updating' | 'completed' | 'error' => {
      // 优先使用parsed中的stage（来自onUpdate）
      if (parsed.stage) {
        return parsed.stage
      }
      // 其次使用实时状态
      if (currentStatus === 'succeeded') {
        return 'completed'
      }
      if (currentStatus === 'failed') {
        return 'error'
      }
      return 'loading'
    }

    return {
      ...parsed,
      stage: getStage()
    }
  }

  // 如果没有解析到数据，根据状态推断stage
  const defaultStage =
    currentStatus === 'succeeded' ? 'completed' : currentStatus === 'failed' ? 'error' : 'loading'
  return {
    stage: defaultStage,
    result: undefined,
    error: undefined
  }
})

const resultData = computed((): EditResult | null => {
  const data = displayData.value
  if (data && typeof data === 'object') {
    // 尝试多种路径提取 result（兼容 parseToolData 提取后的 content、完整回调、持久化后的形状）
    // 1. 直接从 data.result 获取（最直接，如 { stage, result }）
    // 2. 从 data.data?.content?.result（完整回调未解包时）
    // 3. 从 data.content?.result / data.content
    // 4. 若 data 本身带 operations/hunks，则 data 即为 result
    const raw = data as Record<string, unknown>
    let result =
      raw.result ??
      (raw.data as any)?.content?.result ??
      (raw.content as any)?.result ??
      raw.content ??
      raw

    if (result && typeof result === 'object') {
      const hasOps = 'operations' in result && Array.isArray((result as any).operations)
      const hasHunks = 'hunks' in result && Array.isArray((result as any).hunks)
      const hasRawDiff = 'rawDiff' in result && typeof (result as any).rawDiff === 'string'
      if (hasOps || hasHunks || hasRawDiff) {
        return result as EditResult
      }
    }
  }
  return null
})

// 仅当 result 中无 rawDiff/hunks 时，用调用参数中的 diff 构造一个“仅展示用”的 result，便于显示 git diff 样式（不读真实文件）
const resultDataOrFromParams = computed((): EditResult | null => {
  const r = resultData.value
  if (r && (r.rawDiff || (r.hunks && r.hunks.length > 0))) return r
  const diffFromParams = props.paramsDiff && props.paramsDiff.trim()
  if (!diffFromParams) return r
  return {
    appliedEdits: 0,
    failedEdits: 0,
    operations: [],
    hunks: [],
    rawDiff: diffFromParams
  } as EditResult
})

// 检查是否有 hunks 或可从 params 解析的 diff（用于展示）
const hasHunks = computed(() => {
  const r = resultDataOrFromParams.value
  if (r?.hunks && r.hunks.length > 0) return true
  if (r?.rawDiff && r.rawDiff.trim()) return true
  return false
})

// 获取 hunks（优先 result，否则从 params 的 rawDiff 解析，便于只显示调用参数中的 git diff）
const hunks = computed((): UnifiedDiffHunk[] => {
  const r = resultDataOrFromParams.value
  if (r?.hunks && r.hunks.length > 0) return r.hunks
  if (r?.rawDiff && r.rawDiff.trim()) {
    try {
      return parseUnifiedDiff(r.rawDiff)
    } catch {
      return []
    }
  }
  return []
})

// Cursor 风格：编辑文件名（用于内联展示，支持流式时的 content.filePath）
const editFileName = computed(() => {
  const r = resultData.value
  if (r?.filePath) return r.filePath.replace(/^.*[/\\]/, '') || r.filePath
  const data = displayData.value as any
  const path = data?.filePath ?? data?.content?.filePath
  return path ? String(path).replace(/^.*[/\\]/, '') : ''
})

// 是否显示 Cursor 风格内联面板（有 filePath 且有 hunks 或进行中）
const showCompactInline = computed(() => {
  const hasPath = !!editFileName.value
  const data = displayData.value as any
  const stage = data?.stage
  const isRunning = stage === 'loading' || stage === 'applying' || stage === 'updating'
  const hasHunksData = hunks.value.length > 0
  return hasPath && (hasHunksData || isRunning)
})

const compactDiffExpanded = ref(false)
const COMPACT_DIFF_LINES = 4

// 紧凑模式：有结果时默认展开，便于看到 diff
const compactPanelOpen = ref(false)

// 紧凑 diff 显示行（来自 hunks：仅行内容，无 + - @@ 符号）
const compactDiffLines = computed(() => {
  const lines: { type: 'delete' | 'insert'; text: string }[] = []
  for (const hunk of hunks.value) {
    for (const line of hunk.oldLines || []) {
      lines.push({ type: 'delete', text: line })
    }
    for (const line of hunk.newLines || []) {
      lines.push({ type: 'insert', text: line })
    }
  }
  return lines
})

// 紧凑 Monaco：仅正文拼接（无 + - @@），用于设置 editor value
const compactDiffMonacoContent = computed(() =>
  compactDiffLines.value.map((l) => l.text).join('\n')
)
// 每行类型，用于红/绿行背景（1-based 行号对应 index）
const compactDiffLineTypes = computed(() => compactDiffLines.value.map((l) => l.type))

const compactDiffEditorId = ref(
  `edit-compact-diff-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
)
let compactDiffMonaco: monaco.editor.IStandaloneCodeEditor | null = null
let compactDiffDecorationIds: string[] = []
let compactMonacoWheelCleanup: (() => void) | null = null

function getScrollableAncestor(el: HTMLElement): HTMLElement | null {
  // reka-ui / radix ScrollArea 的视口（Compact 消息列表用）
  const viewport =
    (el.closest('[data-reka-scroll-area-viewport]') as HTMLElement | null) ||
    (el.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null)
  if (viewport && viewport.scrollHeight > viewport.clientHeight) return viewport
  let p: HTMLElement | null = el.parentElement
  while (p) {
    const style = getComputedStyle(p)
    const oy = style.overflowY
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && p.scrollHeight > p.clientHeight)
      return p
    p = p.parentElement
  }
  return null
}

const compactMonacoStyle = computed(() => ({
  height: '280px',
  backgroundColor: themeState.currentTheme.background
}))

/** 根据文件名推断 Monaco 语言（仅展示高亮，不改变逻辑） */
function getLanguageFromFileName(fileName: string): string {
  if (!fileName) return 'plaintext'
  const ext = fileName.replace(/^.*\./, '').toLowerCase()
  const map: Record<string, string> = {
    md: 'markdown',
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    vue: 'vue',
    html: 'html',
    css: 'css',
    scss: 'scss',
    yaml: 'yaml',
    yml: 'yaml',
    py: 'python',
    sh: 'shell',
    bash: 'shell'
  }
  return map[ext] || 'plaintext'
}

function applyCompactDiffDecorations() {
  if (!compactDiffMonaco) return
  const model = compactDiffMonaco.getModel()
  if (!model) return
  const types = compactDiffLineTypes.value
  const isDark = themeState.currentTheme.type === 'dark'
  const redBg = isDark ? 'rgba(255,100,100,0.18)' : 'rgba(255,200,200,0.45)'
  const greenBg = isDark ? 'rgba(100,255,130,0.18)' : 'rgba(200,255,200,0.45)'
  const decorations: monaco.editor.IModelDeltaDecoration[] = []
  for (let i = 0; i < types.length; i++) {
    const lineNum = i + 1
    const type = types[i]
    decorations.push({
      range: new monaco.Range(lineNum, 1, lineNum, 1),
      options: {
        isWholeLine: true,
        className: type === 'delete' ? 'compact-diff-line-delete' : 'compact-diff-line-insert'
      }
    })
  }
  compactDiffDecorationIds = compactDiffMonaco.deltaDecorations(
    compactDiffDecorationIds,
    decorations
  )
}

function syncCompactMonacoValue() {
  if (!compactDiffMonaco) return
  const text = compactDiffMonacoContent.value
  if (compactDiffMonaco.getValue() !== text) {
    compactDiffMonaco.setValue(text)
  }
  const lang = getLanguageFromFileName(editFileName.value)
  const model = compactDiffMonaco.getModel()
  if (model && model.getLanguageId() !== lang) {
    monaco.editor.setModelLanguage(model, lang)
  }
  applyCompactDiffDecorations()
}

const initCompactMonaco = (retryCount = 0) => {
  if (!props.compact) return
  setupMonacoWorker()
  const tryInit = () => {
    const el = document.getElementById(compactDiffEditorId.value)
    if (!el) {
      if (retryCount < 5) {
        setTimeout(() => initCompactMonaco(retryCount + 1), 50 * (retryCount + 1))
      }
      return
    }
    if (compactDiffMonaco) {
      syncCompactMonacoValue()
      return
    }
    const lang = getLanguageFromFileName(editFileName.value)
    compactDiffMonaco = monaco.editor.create(el, {
      value: compactDiffMonacoContent.value,
      language: lang,
      theme: themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs',
      readOnly: true,
      lineNumbers: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      automaticLayout: true,
      fontSize: 12,
      fontFamily: 'JetBrains Mono, Consolas, monospace'
    })
    syncCompactMonacoValue()
    setTimeout(syncCompactMonacoValue, 0)
    setTimeout(syncCompactMonacoValue, 100)

    compactMonacoWheelCleanup?.()
    const onWheel = (e: WheelEvent) => {
      if (!compactDiffMonaco) return
      const st = compactDiffMonaco.getScrollTop()
      const sh = compactDiffMonaco.getScrollHeight()
      const layout = compactDiffMonaco.getLayoutInfo()
      const height = layout?.height ?? el.clientHeight
      const atTop = st <= 0
      const atBottom = st + height >= sh - 1
      // 在顶部且用户向上滚(deltaY<0) 或 在底部且用户向下滚(deltaY>0)：把滚动交给外层消息框
      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
        e.preventDefault()
        e.stopPropagation()
        const scrollable = getScrollableAncestor(el)
        if (scrollable) scrollable.scrollBy(0, e.deltaY)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false, capture: true })
    compactMonacoWheelCleanup = () => {
      el.removeEventListener('wheel', onWheel, { capture: true })
      compactMonacoWheelCleanup = null
    }
  }
  nextTick().then(() => nextTick().then(tryInit))
}

function disposeCompactMonaco() {
  compactMonacoWheelCleanup?.()
  compactMonacoWheelCleanup = null
  if (compactDiffMonaco) {
    compactDiffMonaco.dispose()
    compactDiffMonaco = null
  }
  compactDiffDecorationIds = []
}

watch(
  () =>
    [
      props.compact,
      compactPanelOpen.value,
      compactDiffMonacoContent.value,
      compactDiffLineTypes.value
    ] as const,
  ([isCompact, open]) => {
    if (isCompact && open) {
      nextTick().then(() =>
        nextTick().then(() => {
          initCompactMonaco()
          nextTick(syncCompactMonacoValue)
        })
      )
    }
  }
)

watch(
  () => (props.compact ? compactDiffMonacoContent.value : ''),
  () => {
    if (props.compact) nextTick(syncCompactMonacoValue)
  }
)

onBeforeUnmount(() => {
  disposeCompactMonaco()
})

const compactDiffLinesVisible = computed(() => {
  const list = compactDiffLines.value
  if (compactDiffExpanded.value) return list
  return list.slice(0, COMPACT_DIFF_LINES)
})

const hasMoreDiffLines = computed(() => compactDiffLines.value.length > COMPACT_DIFF_LINES)

const getStageMessage = (stage: string) => {
  if (stage === 'loading') return t('agent.display.edit.loading')
  if (stage === 'applying') return t('agent.display.edit.applying')
  if (stage === 'updating') return t('agent.display.edit.updating')
  return t('agent.display.edit.processing')
}

const formatRange = (range: {
  start: { line: number; column: number }
  end: { line: number; column: number }
}) => {
  if (range.start.line === range.end.line && range.start.column === range.end.column) {
    return `行 ${range.start.line}, 列 ${range.start.column}`
  }
  return `行 ${range.start.line}:${range.start.column} - ${range.end.line}:${range.end.column}`
}

const getOldContent = (operation: EditOperation) => {
  if (!resultData.value?.originalContent) return ''

  if (operation.type === 'delete' || operation.type === 'replace') {
    // 从原始内容中提取被删除/替换的部分
    const lines = resultData.value.originalContent.split(/\r?\n/)
    if (operation.range.start.line > 0 && operation.range.start.line <= lines.length) {
      const lineIndex = operation.range.start.line - 1
      const line = lines[lineIndex]

      if (operation.range.start.line === operation.range.end.line) {
        // 同一行的内容
        const startCol = operation.range.start.column - 1
        const endCol = operation.range.end.column - 1
        return line.substring(startCol, endCol)
      } else {
        // 跨行的内容
        let content = line.substring(operation.range.start.column - 1) + '\n'
        for (let i = operation.range.start.line; i < operation.range.end.line - 1; i++) {
          content += lines[i] + '\n'
        }
        content += lines[operation.range.end.line - 1].substring(0, operation.range.end.column - 1)
        return content
      }
    }
  }
  return ''
}

const getOperationTypeTag = (type: string) => {
  const map: Record<string, string> = {
    insert: 'default',
    replace: 'warning',
    delete: 'destructive'
  }
  return map[type] || 'secondary'
}

const getOperationTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    insert: t('agent.display.edit.type.insert'),
    replace: t('agent.display.edit.type.replace'),
    delete: t('agent.display.edit.type.delete')
  }
  return map[type] || type
}

// Diff hunk 相关函数
const getHunkTypeTag = (hunk: UnifiedDiffHunk) => {
  if (hunk.oldLines.length === 0 && hunk.newLines.length > 0) {
    return 'default' // 插入
  } else if (hunk.oldLines.length > 0 && hunk.newLines.length === 0) {
    return 'destructive' // 删除
  } else {
    return 'warning' // 替换
  }
}

const getHunkTypeLabel = (hunk: UnifiedDiffHunk) => {
  if (hunk.oldLines.length === 0 && hunk.newLines.length > 0) {
    return t('agent.display.edit.type.insert') || '插入'
  } else if (hunk.oldLines.length > 0 && hunk.newLines.length === 0) {
    return t('agent.display.edit.type.delete') || '删除'
  } else {
    return t('agent.display.edit.type.replace') || '替换'
  }
}

const getDiffLineStyle = (type: 'insert' | 'delete' | 'context') => {
  const baseStyle = {
    padding: '4px 8px',
    fontFamily: 'JetBrains Mono, Consolas, monospace',
    fontSize: '13px',
    lineHeight: '1.5',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px'
  }

  if (type === 'delete') {
    return {
      ...baseStyle,
      backgroundColor:
        themeState.currentTheme.type === 'dark'
          ? 'rgba(245, 108, 108, 0.15)'
          : 'rgba(245, 108, 108, 0.1)',
      color: themeState.currentTheme.type === 'dark' ? '#f56c6c' : '#c45656'
    }
  } else if (type === 'insert') {
    return {
      ...baseStyle,
      backgroundColor:
        themeState.currentTheme.type === 'dark'
          ? 'rgba(103, 194, 58, 0.15)'
          : 'rgba(103, 194, 58, 0.1)',
      color: themeState.currentTheme.type === 'dark' ? '#67c23a' : '#529b2e'
    }
  } else {
    return {
      ...baseStyle,
      color: themeState.currentTheme.textColor2
    }
  }
}

// 紧凑模式：完成或有 diff（含 paramsDiff）时默认展开面板，便于看到内容
watch(
  () =>
    props.compact &&
    (displayData.value?.stage === 'completed' || !!props.paramsDiff?.trim()) &&
    (hunks.value.length > 0 ||
      (resultData.value?.operations?.length ?? 0) > 0 ||
      !!resultDataOrFromParams.value?.rawDiff?.trim()),
  (shouldOpen) => {
    if (shouldOpen) compactPanelOpen.value = true
  },
  { immediate: true }
)

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

const completedStateStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const headerStyle = computed(() => ({
  marginBottom: '16px',
  paddingBottom: '12px',
  borderBottom: `1px solid ${themeState.currentTheme.textColor2}20`,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '12px'
}))

const titleStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  margin: 0
}))

const statsStyle = computed(() => ({
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  alignItems: 'center'
}))

const operationItemStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  border: `1px solid ${themeState.currentTheme.textColor2}20`,
  borderRadius: '6px',
  padding: '12px',
  marginBottom: '12px'
}))

const operationHeaderStyle = computed(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '8px'
}))

const rangeStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '12px',
  fontFamily: 'monospace'
}))

const contentStyle = computed(() => ({
  marginTop: '8px',
  paddingTop: '8px',
  borderTop: `1px solid ${themeState.currentTheme.textColor2}10`
}))

const labelStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '12px',
  fontWeight: '500',
  marginBottom: '4px',
  display: 'block'
}))

const textStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  fontFamily: 'JetBrains Mono, Consolas, monospace',
  fontSize: '13px',
  margin: 0,
  padding: '8px',
  backgroundColor: themeState.currentTheme.background2nd,
  borderRadius: '4px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word'
}))

const deletedTextStyle = computed(() => ({
  ...textStyle.value,
  textDecoration: 'line-through',
  color: themeState.currentTheme.textColor2
}))

const noDataMessageStyle = computed(() => ({
  padding: '40px 20px',
  textAlign: 'center',
  color: themeState.currentTheme.textColor
}))

// Diff 视图样式
const diffChunkStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  border: `1px solid ${themeState.currentTheme.textColor2}20`,
  borderRadius: '6px',
  padding: '12px',
  marginBottom: '12px'
}))

const chunkHeaderStyle = computed(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '8px',
  paddingBottom: '8px',
  borderBottom: `1px solid ${themeState.currentTheme.textColor2}20`
}))

const chunkInfoStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '12px',
  fontFamily: 'JetBrains Mono, Consolas, monospace',
  fontWeight: '500'
}))

const lineNumberStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '12px',
  fontFamily: 'JetBrains Mono, Consolas, monospace',
  minWidth: '40px',
  textAlign: 'right',
  userSelect: 'none'
}))

const compactInlineStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  border: `1px solid ${themeState.currentTheme.textColor2}20`,
  borderRadius: '6px',
  overflow: 'hidden',
  marginBottom: '8px'
}))

const diffCompactStyle = computed(() => ({
  maxHeight: compactDiffExpanded.value ? 'none' : `${COMPACT_DIFF_LINES * 22}px`,
  overflow: 'auto',
  fontFamily: 'JetBrains Mono, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '22px'
}))
</script>

<style scoped>
.edit-display {
  width: 100%;
}

.edit-header {
  margin-bottom: 16px;
}

.operations-list {
  padding: 8px;
}

.operation-item {
  transition: all 0.2s;
}

.operation-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.operation-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.content-text {
  margin: 0;
}

.deleted-text {
  text-decoration: line-through;
  opacity: 0.7;
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

/* Diff 视图样式 */
.diff-view {
  width: 100%;
}

.diff-content {
  padding: 8px;
}

.diff-chunk {
  transition: all 0.2s;
}

.diff-chunk:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.chunk-header {
  flex-shrink: 0;
}

.diff-lines {
  margin-top: 4px;
}

.diff-line {
  white-space: pre-wrap;
  word-break: break-word;
}

.diff-line .line-content {
  flex: 1;
}

.diff-delete .line-content {
  text-decoration: line-through;
}

.diff-insert .line-content {
  font-weight: 500;
}

.diff-context {
  opacity: 0.7;
}

/* Cursor 风格内联 */
.edit-compact-inline {
  width: 100%;
}

.edit-compact-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 500;
  border-bottom: 1px solid rgba(128, 128, 128, 0.15);
}

.edit-compact-filename {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edit-compact-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.edit-compact-diff {
  padding: 0 8px;
}

.edit-compact-line {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 0 4px;
  white-space: pre;
  word-break: break-all;
}

.edit-compact-line .line-prefix {
  user-select: none;
  flex-shrink: 0;
}

.edit-compact-line .line-text {
  flex: 1;
  min-width: 0;
}

.edit-compact-expand-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  background: rgba(128, 128, 128, 0.06);
  border: none;
  border-top: 1px solid rgba(128, 128, 128, 0.12);
  cursor: pointer;
}

.edit-compact-expand-bar:hover {
  background: rgba(128, 128, 128, 0.1);
  color: var(--el-text-color-primary);
}

.edit-compact-chevron {
  width: 12px;
  height: 12px;
}

/* 紧凑模式（AgentViewCompact） */
.edit-display-compact-panel {
  width: 100%;
  border: 1px solid v-bind('themeState.currentTheme.textColor2 + "20"');
  border-radius: 4px;
  overflow: hidden;
}

.edit-display-compact-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 12px;
  background: v-bind('themeState.currentTheme.background2nd');
  border: none;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.edit-display-compact-chevron {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.edit-display-compact-filename {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edit-display-compact-status {
  flex-shrink: 0;
}

/* 紧凑模式 Monaco：仅行背景红/绿，字体保持 Monaco 语言高亮 */
.edit-display-compact-monaco {
  width: 100%;
  min-height: 200px;
}
.edit-display-compact-monaco :deep(.compact-diff-line-delete) {
  background-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,100,100,0.18)" : "rgba(255,200,200,0.45)"'
  );
}
.edit-display-compact-monaco :deep(.compact-diff-line-insert) {
  background-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(100,255,130,0.18)" : "rgba(200,255,200,0.45)"'
  );
}
</style>
