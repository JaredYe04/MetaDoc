<template>
  <div class="terminal-execution-display" :style="containerStyle">
    <div
      v-if="effectiveData.stage === 'waiting_approval'"
      class="approval-state"
      :style="approvalStateStyle"
    >
      <div class="approval-header" :style="approvalHeaderStyle">
        <el-icon class="warning-icon"><WarningFilled /></el-icon>
        <h4 :style="headerTitleStyle">{{ $t('agent.display.terminalExecution.approvalTitle') }}</h4>
      </div>

        <div class="command-display">
          <div class="command-label" :style="labelStyle">
            {{ $t('agent.display.terminalExecution.commandToExecute') }}
          </div>
          <Textarea
            :model-value="(effectiveData as any)?.command || ''"
            :rows="3"
            readonly
            class="command-input w-full"
          />
        </div>

      <div class="trust-mode-section" :style="trustModeSectionStyle">
        <Checkbox v-model:checked="trustMode" @update:checked="handleTrustModeChange">
          {{ $t('agent.display.terminalExecution.trustMode') }}
        </Checkbox>
        <Button
          v-if="trustMode"
          variant="ghost"
          size="sm"
          @click="resetTrustMode"
          style="margin-left: 8px"
        >
          {{ $t('agent.display.terminalExecution.resetTrust') }}
        </Button>
      </div>

      <div class="approval-actions">
        <Button variant="destructive" @click="handleReject">
          {{ $t('agent.display.terminalExecution.reject') }}
        </Button>
        <Button variant="default" @click="handleApprove">
          {{
            trustMode
              ? $t('agent.display.terminalExecution.approveWithTrust')
              : $t('agent.display.terminalExecution.approve')
          }}
        </Button>
      </div>
    </div>

    <div
      v-else-if="effectiveData.stage === 'executing' || effectiveData.stage === 'analyzing'"
      class="executing-state"
      :style="executingStateStyle"
    >
      <div class="status-message" :style="statusMessageStyle">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>{{
          effectiveData.stage === 'analyzing'
            ? $t('agent.display.terminalExecution.analyzingOutput')
            : $t('agent.display.terminalExecution.executingCommand')
        }}</span>
      </div>
      <div class="command-display">
        <div class="command-label" :style="labelStyle">
          {{ $t('agent.display.terminalExecution.executing') }}
        </div>
        <code class="command-text" :style="commandTextStyle">{{
          (effectiveData as any)?.command || ''
        }}</code>
      </div>

      <!-- 流式终端输出 -->
      <div class="terminal-output" :style="terminalOutputStyle">
        <div class="terminal-header" :style="terminalHeaderStyle">
          <span>{{ $t('agent.display.terminalExecution.terminalOutput') }}</span>
        </div>
        <div class="terminal-body" ref="terminalBodyRef" :style="terminalBodyStyle">
          <!-- 命令提示符 -->
          <div class="terminal-line">
            <span class="terminal-prompt" :style="promptStyle">$</span>
            <span class="terminal-command" :style="commandStyle">{{
              (effectiveData as any)?.command || ''
            }}</span>
          </div>

          <!-- stdout 输出（流式显示） -->
          <div
            v-for="(line, index) in stdoutLines"
            :key="`stdout-${index}`"
            class="terminal-line terminal-out"
            :style="outLineStyle"
          >
            {{ line }}
          </div>

          <!-- stderr 输出（流式显示） -->
          <div
            v-for="(line, index) in stderrLines"
            :key="`stderr-${index}`"
            class="terminal-line terminal-err"
            :style="errLineStyle"
          >
            {{ line }}
          </div>

          <!-- 执行中提示 -->
          <div
            v-if="
              effectiveData.stage === 'executing' &&
              stdoutLines.length === 0 &&
              stderrLines.length === 0
            "
            class="terminal-line terminal-info"
            :style="infoLineStyle"
          >
            {{ $t('agent.display.terminalExecution.executingCommand') }}...
          </div>
        </div>
      </div>
    </div>

    <div
      v-else-if="(effectiveData as any)?.stage === 'completed'"
      class="completed-state"
      :style="completedStateStyle"
    >
      <div class="result-header" :style="resultHeaderStyle">
        <el-tag
          :type="((effectiveData as any)?.exitCode || 0) === 0 ? 'success' : 'danger'"
          size="small"
        >
          {{ $t('agent.display.terminalExecution.exitCode') }}:
          {{ (effectiveData as any)?.exitCode || 0 }}
        </el-tag>
        <span class="command-text" :style="commandTextStyle">{{
          (effectiveData as any)?.command || ''
        }}</span>
      </div>

      <div v-if="(effectiveData as any)?.stdout" class="output-section">
        <div class="output-header" :style="outputHeaderStyle">
          <strong>{{ $t('agent.display.terminalExecution.stdout') }}</strong>
        </div>
        <ScrollArea class="max-h-[300px]">
          <pre class="output-text" :style="outputTextStyle">{{
            (effectiveData as any).stdout
          }}</pre>
        </ScrollArea>
      </div>

      <div v-if="(effectiveData as any)?.stderr" class="output-section error-output">
        <div class="output-header" :style="outputHeaderStyle">
          <strong>{{ $t('agent.display.terminalExecution.stderr') }}</strong>
        </div>
        <ScrollArea class="max-h-[200px]">
          <pre class="output-text error-text" :style="errorTextStyle">{{
            (effectiveData as any).stderr
          }}</pre>
        </ScrollArea>
      </div>

      <div v-if="(effectiveData as any)?.summary" class="summary-section">
        <el-divider>{{ $t('agent.display.terminalExecution.aiSummary') }}</el-divider>
        <div class="summary-text" :style="summaryTextStyle">
          {{ (effectiveData as any).summary }}
        </div>
      </div>
    </div>

    <div v-else-if="(effectiveData as any)?.stage === 'rejected'" class="rejected-state">
      <Alert variant="warning">
        <AlertTriangle class="h-4 w-4" />
        <AlertTitle>{{ $t('agent.display.terminalExecution.rejected') }}</AlertTitle>
        <AlertDescription>
          <div class="command-text" :style="commandTextStyle">
            {{ (effectiveData as any)?.command || '' }}
          </div>
        </AlertDescription>
      </Alert>
    </div>

    <div v-else-if="(effectiveData as any)?.stage === 'error'" class="error-state">
      <Alert variant="destructive">
        <XCircle class="h-4 w-4" />
        <AlertTitle>
          {{ (effectiveData as any)?.error || $t('agent.display.terminalExecution.executionFailed') }}
        </AlertTitle>
      </Alert>
    </div>

    <!-- 进度条 -->
    <el-progress
      v-if="
        effectiveProgress &&
        effectiveProgress.percentage > 0 &&
        (effectiveData as any)?.stage !== 'completed'
      "
      :percentage="effectiveProgress.percentage"
      :status="progressStatus"
      :stroke-width="6"
      style="margin-top: 12px"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Loading, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Textarea } from '@renderer/components/ui/textarea'
import { Alert, AlertTitle, AlertDescription } from '../../../components/ui/alert'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { AlertTriangle, XCircle } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { ToolDisplayComponentProps, ToolExecutionStatus } from '../../../types/agent-tool'
import eventBus from '../../../utils/event-bus.js'
import { useToolDisplayRealtime, parseToolData } from '../composables/useToolDisplayRealtime'
import { themeState } from '../../themes'
import { createRendererLogger } from '../../logger'

const { t } = useI18n()

const STORAGE_KEY = 'agent-tool-terminal-trust-mode'

const props = defineProps<ToolDisplayComponentProps>()

const terminalBodyRef = ref<HTMLDivElement | null>(null)
const logger = createRendererLogger('TerminalExecutionDisplay')
logger.debug(
  `[TerminalExecutionDisplay] 组件初始化，invocationId: ${props.invocationId}, status: ${props.status}, data:`,
  props.data
)
logger.debug(`[TerminalExecutionDisplay] props 完整内容:`, props)

// 使用实时通信
const { realtimeData, realtimeStatus, realtimeProgress } = useToolDisplayRealtime(
  props.invocationId,
  props.data,
  props.status,
  props.progress
)

logger.debug(`[TerminalExecutionDisplay] useToolDisplayRealtime 返回:`, {
  realtimeData: realtimeData.value,
  realtimeStatus: realtimeStatus.value,
  realtimeProgress: realtimeProgress.value
})

// 解析显示数据（优先使用实时数据）
const displayData = computed(() => {
  const data = realtimeData.value !== null ? realtimeData.value : props.data
  const parsed = parseToolData(data)

  if (typeof parsed === 'object' && parsed !== null) {
    return parsed as {
      stage: 'waiting_approval' | 'executing' | 'analyzing' | 'completed' | 'rejected' | 'error'
      command?: string
      exitCode?: number
      stdout?: string
      stderr?: string
      summary?: string
      error?: string
      approved?: boolean
    }
  }
  return { stage: 'waiting_approval' }
})

// 信任模式
const trustMode = ref(false)

// 加载信任模式设置
const loadTrustMode = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    trustMode.value = stored === 'true'
  } catch {
    trustMode.value = false
  }
}

// 保存信任模式设置
const saveTrustMode = (enabled: boolean) => {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled))
  } catch (error) {
    console.error('保存信任模式失败:', error)
  }
}

// 处理信任模式变化
const handleTrustModeChange = (enabled: boolean) => {
  saveTrustMode(enabled)
  if (enabled) {
    ElMessage.success(
      t('agent.display.terminalExecution.trustMode') +
        ' - ' +
        t('agent.display.terminalExecution.approveWithTrust')
    )
  } else {
    ElMessage.info(t('agent.display.terminalExecution.resetTrust'))
  }
}

// 重置信任模式
const resetTrustMode = () => {
  trustMode.value = false
  saveTrustMode(false)
  ElMessage.info(t('agent.display.terminalExecution.resetTrust'))
}

// 主题样式
const containerStyle = computed(() => ({
  backgroundColor: 'transparent',
  color: themeState.currentTheme.textColor
}))

const approvalStateStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const approvalHeaderStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const headerTitleStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const labelStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const trustModeSectionStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor
}))

const executingStateStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const statusMessageStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const completedStateStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const resultHeaderStyle = computed(() => ({
  borderBottomColor:
    themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
}))

const commandTextStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor
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

const summaryTextStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor
}))

const terminalOutputStyle = computed(() => ({
  marginTop: '16px',
  border: `1px solid ${themeState.currentTheme.background2nd}`,
  borderRadius: '6px',
  overflow: 'hidden',
  backgroundColor: themeState.currentTheme.background2nd
}))

const terminalHeaderStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  padding: '8px 12px',
  borderBottom: `1px solid ${themeState.currentTheme.background2nd}`,
  fontSize: '13px',
  fontWeight: '500'
}))

const terminalBodyStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  fontFamily: 'JetBrains Mono, Consolas, monospace',
  fontSize: '13px',
  lineHeight: '1.6',
  padding: '12px',
  maxHeight: '400px',
  overflowY: 'auto',
  overflowX: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word'
}))

const promptStyle = computed(() => ({
  color: '#4ec9b0',
  marginRight: '8px',
  fontWeight: 'bold'
}))

const commandStyle = computed(() => ({
  color: themeState.currentTheme.type === 'dark' ? '#d4d4d4' : '#000000'
}))

const outLineStyle = computed(() => ({
  color: themeState.currentTheme.type === 'dark' ? '#d4d4d4' : '#000000'
}))

const errLineStyle = computed(() => ({
  color: '#f48771'
}))

const infoLineStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontStyle: 'italic'
}))

// 处理批准
const handleApprove = () => {
  const data = effectiveData.value as any
  if (!data?.command) return

  // 发送批准事件
  eventBus.emit('terminal-command-approved', {
    command: data.command,
    trustMode: trustMode.value
  })
}

// 处理拒绝
const handleReject = () => {
  const data = effectiveData.value as any
  if (!data?.command) return

  // 发送拒绝事件
  eventBus.emit('terminal-command-rejected', {
    command: data.command
  })
}

// 进度状态
const progressStatus = computed(() => {
  if (effectiveStatus.value === 'failed') return 'exception'
  if (effectiveStatus.value === 'succeeded') return 'success'
  return undefined
})

// 初始化
loadTrustMode()

// 使用实时数据或props数据
const effectiveData = computed(() => displayData.value)

const effectiveStatus = computed(() => {
  return realtimeStatus.value !== 'running' ? realtimeStatus.value : props.status
})

const effectiveProgress = computed(() => {
  return realtimeProgress.value || props.progress
})

// 流式输出处理：将 stdout 和 stderr 分割成行
const stdoutLines = computed(() => {
  const data = effectiveData.value as any
  const stdout = data?.stdout || ''
  if (!stdout) return []
  // 保留所有行，包括空行（流式输出可能包含）
  return stdout.split(/\r?\n/)
})

const stderrLines = computed(() => {
  const data = effectiveData.value as any
  const stderr = data?.stderr || ''
  if (!stderr) return []
  // 保留所有行，包括空行（流式输出可能包含）
  return stderr.split(/\r?\n/)
})

// 自动滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (terminalBodyRef.value) {
      terminalBodyRef.value.scrollTop = terminalBodyRef.value.scrollHeight
    }
  })
}

// 监听输出变化，自动滚动
watch(
  [stdoutLines, stderrLines],
  () => {
    scrollToBottom()
  },
  { deep: true }
)

// 监听stage变化，如果是waiting_approval且信任模式开启，自动批准
watch(
  () => effectiveData.value.stage,
  (stage) => {
    if (stage === 'waiting_approval' && trustMode.value) {
      // 延迟一下，让UI先渲染
      setTimeout(() => {
        handleApprove()
      }, 100)
    }
    // 当输出更新时滚动到底部
    if (stage === 'executing' || stage === 'analyzing') {
      scrollToBottom()
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.terminal-execution-display {
  width: 100%;
}

.approval-state {
  padding: 16px;
}

.approval-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.approval-header h4 {
  margin: 0;
}

.warning-icon {
  color: var(--el-color-warning);
  font-size: 20px;
}

.command-display {
  margin: 16px 0;
}

.command-label {
  font-size: 13px;
  margin-bottom: 8px;
}

.command-input {
  font-family: 'JetBrains Mono', 'Consolas', monospace;
}

.command-text {
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 4px;
  display: block;
  word-break: break-all;
}

.trust-mode-section {
  margin: 16px 0;
  padding: 12px;
  border-radius: 4px;
}

.approval-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
}

.executing-state {
  padding: 16px;
}

.status-message {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
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

.summary-section {
  margin-top: 16px;
}

.summary-text {
  padding: 12px;
  border-radius: 4px;
  line-height: 1.6;
}

.rejected-state {
  padding: 12px;
}

.error-state {
  padding: 12px;
}

.output-preview {
  margin-top: 12px;
}

.output-label {
  font-size: 13px;
  margin-bottom: 8px;
}

.terminal-output {
  margin-top: 16px;
}

.terminal-line {
  margin: 2px 0;
  word-break: break-all;
}

.terminal-out {
  color: v-bind('themeState.currentTheme.type === "dark" ? "#d4d4d4" : "#000000"');
}

.terminal-err {
  color: #f48771;
}

.terminal-info {
  color: v-bind('themeState.currentTheme.textColor2');
  font-style: italic;
}

.terminal-prompt {
  color: #4ec9b0;
  font-weight: bold;
  margin-right: 8px;
}

.terminal-command {
  color: v-bind('themeState.currentTheme.type === "dark" ? "#d4d4d4" : "#000000"');
}
</style>
