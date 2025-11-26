<template>
  <div class="terminal-execution-display" :style="containerStyle">
    <div v-if="effectiveData.stage === 'waiting_approval'" class="approval-state" :style="approvalStateStyle">
      <div class="approval-header" :style="approvalHeaderStyle">
        <el-icon class="warning-icon"><WarningFilled /></el-icon>
        <h4 :style="headerTitleStyle">{{ $t('agent.display.terminalExecution.approvalTitle') }}</h4>
      </div>
      
      <div class="command-display">
        <div class="command-label" :style="labelStyle">{{ $t('agent.display.terminalExecution.commandToExecute') }}</div>
        <el-input
          :model-value="(effectiveData as any)?.command || ''"
          type="textarea"
          :rows="3"
          readonly
          class="command-input"
        />
      </div>

      <div class="trust-mode-section" :style="trustModeSectionStyle">
        <el-checkbox v-model="trustMode" @change="handleTrustModeChange">
          {{ $t('agent.display.terminalExecution.trustMode') }}
        </el-checkbox>
        <el-button
          v-if="trustMode"
          type="text"
          size="small"
          @click="resetTrustMode"
          style="margin-left: 8px;"
        >
          {{ $t('agent.display.terminalExecution.resetTrust') }}
        </el-button>
      </div>

      <div class="approval-actions">
        <el-button type="danger" @click="handleReject">
          {{ $t('agent.display.terminalExecution.reject') }}
        </el-button>
        <el-button type="primary" @click="handleApprove">
          {{ trustMode ? $t('agent.display.terminalExecution.approveWithTrust') : $t('agent.display.terminalExecution.approve') }}
        </el-button>
      </div>
    </div>

    <div v-else-if="effectiveData.stage === 'executing' || effectiveData.stage === 'analyzing'" class="executing-state" :style="executingStateStyle">
      <div class="status-message" :style="statusMessageStyle">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>{{ effectiveData.stage === 'analyzing' ? $t('agent.display.terminalExecution.analyzingOutput') : $t('agent.display.terminalExecution.executingCommand') }}</span>
      </div>
      <div class="command-display">
        <div class="command-label" :style="labelStyle">{{ $t('agent.display.terminalExecution.executing') }}</div>
        <code class="command-text" :style="commandTextStyle">{{ (effectiveData as any)?.command || '' }}</code>
      </div>
      <div v-if="(effectiveData as any)?.stdout && (effectiveData as any).stage === 'analyzing'" class="output-preview">
        <div class="output-label" :style="labelStyle">{{ $t('agent.display.terminalExecution.outputPreview') }}</div>
        <el-scrollbar max-height="200px">
          <pre class="output-text" :style="outputTextStyle">{{ ((effectiveData as any).stdout || '').substring(0, 1000) }}{{ ((effectiveData as any).stdout || '').length > 1000 ? '...' : '' }}</pre>
        </el-scrollbar>
      </div>
    </div>

    <div v-else-if="(effectiveData as any)?.stage === 'completed'" class="completed-state" :style="completedStateStyle">
      <div class="result-header" :style="resultHeaderStyle">
        <el-tag :type="((effectiveData as any)?.exitCode || 0) === 0 ? 'success' : 'danger'" size="small">
          {{ $t('agent.display.terminalExecution.exitCode') }}: {{ (effectiveData as any)?.exitCode || 0 }}
        </el-tag>
        <span class="command-text" :style="commandTextStyle">{{ (effectiveData as any)?.command || '' }}</span>
      </div>

      <div v-if="(effectiveData as any)?.stdout" class="output-section">
        <div class="output-header" :style="outputHeaderStyle">
          <strong>{{ $t('agent.display.terminalExecution.stdout') }}</strong>
        </div>
        <el-scrollbar max-height="300px">
          <pre class="output-text" :style="outputTextStyle">{{ (effectiveData as any).stdout }}</pre>
        </el-scrollbar>
      </div>

      <div v-if="(effectiveData as any)?.stderr" class="output-section error-output">
        <div class="output-header" :style="outputHeaderStyle">
          <strong>{{ $t('agent.display.terminalExecution.stderr') }}</strong>
        </div>
        <el-scrollbar max-height="200px">
          <pre class="output-text error-text" :style="errorTextStyle">{{ (effectiveData as any).stderr }}</pre>
        </el-scrollbar>
      </div>

      <div v-if="(effectiveData as any)?.summary" class="summary-section">
        <el-divider>{{ $t('agent.display.terminalExecution.aiSummary') }}</el-divider>
        <div class="summary-text" :style="summaryTextStyle">{{ (effectiveData as any).summary }}</div>
      </div>
    </div>

    <div v-else-if="(effectiveData as any)?.stage === 'rejected'" class="rejected-state">
      <el-alert
        :title="$t('agent.display.terminalExecution.rejected')"
        type="warning"
        :closable="false"
      >
        <template #default>
          <div class="command-text" :style="commandTextStyle">{{ (effectiveData as any)?.command || '' }}</div>
        </template>
      </el-alert>
    </div>

    <div v-else-if="(effectiveData as any)?.stage === 'error'" class="error-state">
      <el-alert
        :title="(effectiveData as any)?.error || $t('agent.display.terminalExecution.executionFailed')"
        type="error"
        :closable="false"
      />
    </div>

    <!-- 进度条 -->
    <el-progress
      v-if="effectiveProgress && effectiveProgress.percentage > 0 && (effectiveData as any)?.stage !== 'completed'"
      :percentage="effectiveProgress.percentage"
      :status="progressStatus"
      :stroke-width="6"
      style="margin-top: 12px;"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { Loading, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import type { ToolDisplayComponentProps, ToolExecutionStatus } from '../../../types/agent-tool'
import eventBus from '../../../utils/event-bus.js'
import { useToolDisplayRealtime, parseToolData } from '../composables/useToolDisplayRealtime'
import { themeState } from '../../themes'

const { t } = useI18n()

const STORAGE_KEY = 'agent-tool-terminal-trust-mode'

const props = defineProps<ToolDisplayComponentProps>()

console.log(`[TerminalExecutionDisplay] 组件初始化，invocationId: ${props.invocationId}, status: ${props.status}, data:`, props.data)
console.log(`[TerminalExecutionDisplay] props 完整内容:`, props)

// 使用实时通信
const { realtimeData, realtimeStatus, realtimeProgress } = useToolDisplayRealtime(
  props.invocationId,
  props.data,
  props.status,
  props.progress
)

console.log(`[TerminalExecutionDisplay] useToolDisplayRealtime 返回:`, { realtimeData: realtimeData.value, realtimeStatus: realtimeStatus.value, realtimeProgress: realtimeProgress.value })

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
    ElMessage.success(t('agent.display.terminalExecution.trustMode') + ' - ' + t('agent.display.terminalExecution.approveWithTrust'))
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
  backgroundColor: themeState.currentTheme.background,
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
  borderBottomColor: themeState.currentTheme.type === 'dark' 
    ? 'rgba(255, 255, 255, 0.1)' 
    : 'rgba(0, 0, 0, 0.08)'
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
  color: themeState.currentTheme.errorColor || '#f56c6c'
}))

const summaryTextStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor
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

// 监听stage变化，如果是waiting_approval且信任模式开启，自动批准
watch(() => effectiveData.value.stage, (stage) => {
  if (stage === 'waiting_approval' && trustMode.value) {
    // 延迟一下，让UI先渲染
    setTimeout(() => {
      handleApprove()
    }, 100)
  }
}, { immediate: true })
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
</style>

