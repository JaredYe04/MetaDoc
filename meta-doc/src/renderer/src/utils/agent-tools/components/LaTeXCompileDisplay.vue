<template>
  <div class="latex-compile-display" :style="containerStyle">
    <template v-if="compact">
      <div v-if="effectiveData.stage === 'compiling'" class="latex-compact-status">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>{{ $t('agent.display.latexCompile.compiling') }}</span>
      </div>
      <template v-else>
        <div class="latex-compact-result">
          <Badge :type="badgeSuccess ? 'success' : 'danger'" size="small">
            {{ badgeSuccess ? $t('agent.display.latexCompile.success') : $t('agent.display.latexCompile.failed') }}
          </Badge>
          <span v-if="effectiveData.pdfPath" class="latex-compact-path">{{ effectiveData.pdfPath }}</span>
        </div>
        <div
          v-if="showPdfPreview"
          class="latex-compile-pdf-embed latex-compile-pdf-embed--compact"
        >
          <LaTeXAgentPdfFirstPagePreview
            :pdf-url="pdfPreviewUrl"
            :file-path="String(effectiveData.pdfPath)"
          />
        </div>
      </template>
    </template>

    <template v-else>
      <div
        v-if="effectiveData.stage === 'compiling'"
        class="compiling-state"
        :style="compilingStateStyle"
      >
        <div class="status-message" :style="statusMessageStyle">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>{{ $t('agent.display.latexCompile.compiling') }}</span>
        </div>
        <div v-if="effectiveData.outputPdfPath" class="output-path-label" :style="labelStyle">
          {{ $t('agent.display.latexCompile.outputPdfPath') }}: {{ effectiveData.outputPdfPath }}
        </div>
        <Collapsible v-if="stderrLines.length > 0" v-model:open="stderrOpen" class="output-collapsible">
          <CollapsibleTrigger class="latex-output-trigger">
            <strong :style="outputHeaderStyle">{{ $t('agent.display.latexCompile.stderr') }}</strong>
          </CollapsibleTrigger>
          <CollapsibleContent class="latex-output-collapsible-body">
            <ScrollArea ref="stderrScrollRef" class="max-h-[300px]">
              <pre class="output-text error-text" :style="errorTextStyle">{{ effectiveData.stderr }}</pre>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
        <Collapsible v-if="stdoutLines.length > 0" v-model:open="stdoutOpen" class="output-collapsible">
          <CollapsibleTrigger class="latex-output-trigger">
            <strong :style="outputHeaderStyle">{{ $t('agent.display.latexCompile.stdout') }}</strong>
          </CollapsibleTrigger>
          <CollapsibleContent class="latex-output-collapsible-body">
            <ScrollArea ref="stdoutScrollRef" class="max-h-[200px]">
              <pre class="output-text" :style="outputTextStyle">{{ effectiveData.stdout }}</pre>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div
        v-else-if="effectiveData.stage === 'completed'"
        class="completed-state"
        :style="completedStateStyle"
      >
        <div class="result-header" :style="resultHeaderStyle">
          <Badge
            :type="badgeSuccess ? 'success' : 'danger'"
            size="small"
          >
            {{ badgeSuccess ? $t('agent.display.latexCompile.success') : $t('agent.display.latexCompile.failed') }}
          </Badge>
          <span v-if="effectiveData.pdfPath" class="pdf-path" :style="pathStyle">{{ effectiveData.pdfPath }}</span>
        </div>

        <Collapsible v-if="effectiveData.stderr" v-model:open="stderrOpen" class="output-collapsible">
          <CollapsibleTrigger class="latex-output-trigger">
            <strong :style="outputHeaderStyle">{{ $t('agent.display.latexCompile.stderr') }}</strong>
          </CollapsibleTrigger>
          <CollapsibleContent class="latex-output-collapsible-body">
            <ScrollArea class="max-h-[300px]">
              <pre class="output-text error-text" :style="errorTextStyle">{{ effectiveData.stderr }}</pre>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible v-if="effectiveData.stdout" v-model:open="stdoutOpen" class="output-collapsible">
          <CollapsibleTrigger class="latex-output-trigger">
            <strong :style="outputHeaderStyle">{{ $t('agent.display.latexCompile.stdout') }}</strong>
          </CollapsibleTrigger>
          <CollapsibleContent class="latex-output-collapsible-body">
            <ScrollArea class="max-h-[200px]">
              <pre class="output-text" :style="outputTextStyle">{{ effectiveData.stdout }}</pre>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>

        <div v-if="showPdfPreview" class="latex-compile-pdf-embed latex-compile-pdf-embed--expanded">
          <LaTeXAgentPdfFirstPagePreview
            :pdf-url="pdfPreviewUrl"
            :file-path="String(effectiveData.pdfPath)"
          />
        </div>
      </div>

      <div
        v-if="
          effectiveProgress &&
          effectiveProgress.percentage > 0 &&
          effectiveData.stage !== 'completed'
        "
        style="margin-top: 12px"
      >
        <Progress
          :percentage="effectiveProgress.percentage"
          :status="progressStatus"
          :stroke-width="6"
          :show-text="true"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, toRef } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Progress } from '@renderer/components/ui/progress'
import { Badge } from '@renderer/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import LaTeXAgentPdfFirstPagePreview from './LaTeXAgentPdfFirstPagePreview.vue'
import type { ToolDisplayComponentProps } from '../../../types/agent-tool'
import { useToolDisplayRealtime, parseToolData } from '../composables/useToolDisplayRealtime'
import { themeState } from '../../themes'

const props = withDefaults(defineProps<ToolDisplayComponentProps>(), { compact: false })

const stderrScrollRef = ref<InstanceType<typeof ScrollArea> | null>(null)
const stdoutScrollRef = ref<InstanceType<typeof ScrollArea> | null>(null)
/** 默认折叠，避免长日志占满 Agent 气泡 */
const stderrOpen = ref(false)
const stdoutOpen = ref(false)

// toRef：message 落盘/完成后 props.data 更新时能同步；与 TimestampDisplay 一致，避免 tool-complete 竞态下一直空白
const { realtimeData, realtimeStatus, realtimeProgress } = useToolDisplayRealtime(
  props.invocationId,
  toRef(props, 'data'),
  toRef(props, 'status'),
  props.progress
)

type LaTeXCompileDisplayData = {
  stage: 'compiling' | 'completed'
  outputPdfPath?: string
  success?: boolean
  stderr?: string
  stdout?: string
  pdfPath?: string
  exitCode?: number
}

const displayData = computed((): LaTeXCompileDisplayData => {
  const dataSource =
    !props.invocationId && props.data != null
      ? props.data
      : props.status === 'succeeded' && props.data != null
        ? props.data
        : realtimeData.value != null
          ? realtimeData.value
          : props.data
  const parsed = parseToolData(dataSource)
  if (typeof parsed !== 'object' || parsed === null) {
    return { stage: 'compiling' }
  }
  const p = parsed as Record<string, unknown>
  const st = p.stage
  if (st === 'compiling' || st === 'completed') {
    return p as LaTeXCompileDisplayData
  }
  // tool-complete / 会话里有时只有裸 result（success、stderr、pdfPath…）而无 stage，否则两个 v-if 全假、整块空白
  const hasLatexResultShape =
    typeof p.success === 'boolean' ||
    typeof p.pdfPath === 'string' ||
    typeof p.stderr === 'string' ||
    typeof p.stdout === 'string' ||
    typeof p.exitCode === 'number'
  if (hasLatexResultShape) {
    return { ...(p as object), stage: 'completed' } as LaTeXCompileDisplayData
  }
  return { stage: 'compiling' }
})

const effectiveData = computed(() => displayData.value)

// 实时 stderr/stdout 行（与 TerminalExecutionDisplay 一致，便于编译过程中流式显示）
const stderrLines = computed(() => {
  const stderr = effectiveData.value?.stderr ?? ''
  if (!stderr) return []
  return stderr.split(/\r?\n/)
})

const stdoutLines = computed(() => {
  const stdout = effectiveData.value?.stdout ?? ''
  if (!stdout) return []
  return stdout.split(/\r?\n/)
})

// 输出变化时滚动到底部
function scrollStderrToBottom() {
  nextTick(() => {
    const el = stderrScrollRef.value?.$el?.querySelector?.('[data-radix-scroll-area-viewport]') ?? stderrScrollRef.value?.$el
    if (el && 'scrollTop' in el) (el as HTMLElement).scrollTop = (el as HTMLElement).scrollHeight
  })
}

function scrollStdoutToBottom() {
  nextTick(() => {
    const el = stdoutScrollRef.value?.$el?.querySelector?.('[data-radix-scroll-area-viewport]') ?? stdoutScrollRef.value?.$el
    if (el && 'scrollTop' in el) (el as HTMLElement).scrollTop = (el as HTMLElement).scrollHeight
  })
}

watch(
  [stderrLines, stderrOpen],
  () => {
    if (stderrOpen.value) scrollStderrToBottom()
  },
  { deep: true }
)
watch(
  [stdoutLines, stdoutOpen],
  () => {
    if (stdoutOpen.value) scrollStdoutToBottom()
  },
  { deep: true }
)

// 徽章：以 effectiveData.success 为准；若已完成但无 success 字段则用 effectiveStatus 兜底，避免“实际成功却显示失败”
const badgeSuccess = computed(() => {
  if (effectiveData.value?.stage === 'completed') return effectiveData.value?.success === true
  return effectiveStatus.value === 'succeeded'
})

const effectiveProgress = computed(() => realtimeProgress.value || props.progress)
const effectiveStatus = computed(() =>
  realtimeStatus.value !== 'running' ? realtimeStatus.value : props.status
)

const progressStatus = computed(() => {
  if (effectiveStatus.value === 'failed') return 'exception'
  if (effectiveStatus.value === 'succeeded') return 'success'
  return undefined
})

const containerStyle = computed(() => ({
  backgroundColor: 'transparent',
  color: themeState.currentTheme.textColor
}))

const compilingStateStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const statusMessageStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const labelStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '13px',
  marginTop: '8px'
}))

const completedStateStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const resultHeaderStyle = computed(() => ({
  borderBottomColor:
    themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
}))

const pathStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '13px',
  fontFamily: 'JetBrains Mono, Consolas, monospace',
  marginLeft: '12px'
}))

const outputHeaderStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const outputTextStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor
}))

const errorTextStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: '#f56c6c'
}))

/** 与 LaTeXEditor 一致：本地路径 → file:// URL，供 vue3-pdfjs 加载 */
function encodeFilePathToUrl(filePath: string): string {
  if (!filePath) return ''
  let path = filePath.replace(/^file:\/\/\//, '')
  path = path.replace(/\\/g, '/')
  const parts = path.split('/')
  const encodedParts = parts.map((part: string, index: number) => {
    if (index === 0 && part.endsWith(':')) return part
    return encodeURIComponent(part).replace(/%2F/g, '/')
  })
  return `file:///${encodedParts.join('/')}`
}

const pdfPreviewBust = ref(0)

watch(
  () => ({
    stage: effectiveData.value?.stage,
    path: effectiveData.value?.pdfPath,
    ok: badgeSuccess.value
  }),
  ({ stage, path, ok }) => {
    if (stage === 'completed' && ok && path && String(path).trim() !== '') {
      pdfPreviewBust.value = Date.now()
    }
  },
  { immediate: true }
)

const showPdfPreview = computed(
  () =>
    effectiveData.value?.stage === 'completed' &&
    badgeSuccess.value === true &&
    !!effectiveData.value?.pdfPath &&
    String(effectiveData.value.pdfPath).trim() !== ''
)

const pdfPreviewUrl = computed(() => {
  if (!showPdfPreview.value || !effectiveData.value?.pdfPath) return ''
  const normalized = String(effectiveData.value.pdfPath).replace(/\\/g, '/')
  const base = encodeFilePathToUrl(normalized)
  if (!base) return ''
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}t=${pdfPreviewBust.value}`
})
</script>

<style scoped>
.latex-compile-display {
  width: 100%;
  max-width: 100%;
  margin: 0;
  min-width: 0;
  overflow: hidden;
  box-sizing: border-box;
}

.compiling-state {
  padding: 16px;
  min-width: 0;
  overflow: hidden;
  box-sizing: border-box;
}

.status-message {
  display: flex;
  align-items: center;
  gap: 8px;
}

.output-path-label {
  word-break: break-all;
}

.completed-state {
  width: 100%;
  min-width: 0;
  overflow: hidden;
  box-sizing: border-box;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid;
  overflow: hidden;
  min-width: 0;
  max-width: 100%;
}

.pdf-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.output-section {
  margin: 16px 0;
}

.output-section.error-output {
  margin-top: 12px;
}

.output-header {
  font-size: 13px;
  margin-bottom: 8px;
}

.output-text {
  margin: 0;
  padding: 12px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
}

.error-text {
  background-color: rgba(245, 108, 108, 0.1);
}

.latex-compact-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  font-size: 12px;
  overflow: hidden;
  min-width: 0;
  max-width: 100%;
}

.latex-compact-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 12px;
  overflow: hidden;
  min-width: 0;
  max-width: 100%;
}

.latex-compact-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-secondary);
}

.output-collapsible {
  width: 100%;
  margin: 10px 0;
}
/* 覆盖 CollapsibleTrigger 默认 hover，与工具卡片风格一致 */
.latex-output-trigger {
  background: var(--el-fill-color-light, rgba(0, 0, 0, 0.04)) !important;
  border: 1px solid var(--el-border-color-lighter);
  font-weight: normal;
}
.latex-output-trigger :deep(svg) {
  width: 16px !important;
  height: 16px !important;
}
.latex-output-collapsible-body {
  margin-top: 8px;
}

/* Agent 消息内嵌 PDF：按父容器自适应缩放，避免无脑占满与横向滚动 */
.latex-compile-pdf-embed {
  width: min(
    100%,
    clamp(
      var(--latex-agent-pdf-min-width, 280px),
      calc(100% * var(--latex-agent-pdf-width-scale, 0.9)),
      var(--latex-agent-pdf-max-width, 680px)
    )
  );
  max-width: 100%;
  margin-left: auto;
  margin-right: auto;
  min-width: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  box-sizing: border-box;
  contain: inline-size;
}

/* 高度可由 .tool-message-wrapper 上 CSS 变量覆盖 */
.latex-compile-pdf-embed--compact {
  height: var(--latex-agent-pdf-height-compact, min(320px, 50vh));
  min-height: var(--latex-agent-pdf-min-h-compact, 220px);
  margin-top: 10px;
}

.latex-compile-pdf-embed--expanded {
  height: var(--latex-agent-pdf-height-expanded, min(420px, 55vh));
  min-height: var(--latex-agent-pdf-min-h-expanded, 260px);
  margin-top: 14px;
}
</style>
