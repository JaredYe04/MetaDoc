<template>
  <div class="latex-compile-display" :style="containerStyle">
    <template v-if="compact">
      <div v-if="effectiveData.stage === 'compiling'" class="latex-compact-status">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>{{ $t('agent.display.latexCompile.compiling') }}</span>
      </div>
      <div v-else class="latex-compact-result">
        <Badge :type="badgeSuccess ? 'success' : 'danger'" size="small">
          {{ badgeSuccess ? $t('agent.display.latexCompile.success') : $t('agent.display.latexCompile.failed') }}
        </Badge>
        <span v-if="effectiveData.pdfPath" class="latex-compact-path">{{ effectiveData.pdfPath }}</span>
      </div>
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
        <div v-if="stderrLines.length > 0" class="output-section error-output">
          <div class="output-header" :style="outputHeaderStyle">
            <strong>{{ $t('agent.display.latexCompile.stderr') }}</strong>
          </div>
          <ScrollArea ref="stderrScrollRef" class="max-h-[300px]">
            <pre class="output-text error-text" :style="errorTextStyle">{{ effectiveData.stderr }}</pre>
          </ScrollArea>
        </div>
        <div v-if="stdoutLines.length > 0" class="output-section">
          <div class="output-header" :style="outputHeaderStyle">
            <strong>{{ $t('agent.display.latexCompile.stdout') }}</strong>
          </div>
          <ScrollArea ref="stdoutScrollRef" class="max-h-[200px]">
            <pre class="output-text" :style="outputTextStyle">{{ effectiveData.stdout }}</pre>
          </ScrollArea>
        </div>
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

        <div v-if="effectiveData.stderr" class="output-section error-output">
          <div class="output-header" :style="outputHeaderStyle">
            <strong>{{ $t('agent.display.latexCompile.stderr') }}</strong>
          </div>
          <ScrollArea class="max-h-[300px]">
            <pre class="output-text error-text" :style="errorTextStyle">{{ effectiveData.stderr }}</pre>
          </ScrollArea>
        </div>

        <div v-if="effectiveData.stdout" class="output-section">
          <div class="output-header" :style="outputHeaderStyle">
            <strong>{{ $t('agent.display.latexCompile.stdout') }}</strong>
          </div>
          <ScrollArea class="max-h-[200px]">
            <pre class="output-text" :style="outputTextStyle">{{ effectiveData.stdout }}</pre>
          </ScrollArea>
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
import { computed, ref, watch, nextTick } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Progress } from '@renderer/components/ui/progress'
import { Badge } from '@renderer/components/ui/badge'
import type { ToolDisplayComponentProps } from '../../../types/agent-tool'
import { useToolDisplayRealtime, parseToolData } from '../composables/useToolDisplayRealtime'
import { themeState } from '../../themes'

const props = withDefaults(defineProps<ToolDisplayComponentProps>(), { compact: false })

const stderrScrollRef = ref<InstanceType<typeof ScrollArea> | null>(null)
const stdoutScrollRef = ref<InstanceType<typeof ScrollArea> | null>(null)

const { realtimeData, realtimeStatus, realtimeProgress } = useToolDisplayRealtime(
  props.invocationId,
  props.data,
  props.status,
  props.progress
)

const displayData = computed(() => {
  const data = realtimeData.value !== null ? realtimeData.value : props.data
  const parsed = parseToolData(data)
  if (typeof parsed === 'object' && parsed !== null) {
    return parsed as {
      stage: 'compiling' | 'completed'
      outputPdfPath?: string
      success?: boolean
      stderr?: string
      stdout?: string
      pdfPath?: string
      exitCode?: number
    }
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

watch([stderrLines], scrollStderrToBottom, { deep: true })
watch([stdoutLines], scrollStdoutToBottom, { deep: true })

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
</script>

<style scoped>
.latex-compile-display {
  width: 100%;
}

.compiling-state {
  padding: 16px;
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
}

.result-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid;
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
}

.latex-compact-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 12px;
}

.latex-compact-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-secondary);
}
</style>
