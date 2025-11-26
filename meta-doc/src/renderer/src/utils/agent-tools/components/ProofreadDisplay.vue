<template>
  <div class="proofread-display" :style="containerStyle">
    <div v-if="displayData.stage === 'loading' || displayData.stage === 'proofreading'" class="status-message" :style="statusMessageStyle">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ $t('agent.display.proofread.proofreading') }}</span>
    </div>

    <div v-else-if="displayData.stage === 'completed' && displayData.result" class="completed-state" :style="completedStateStyle">
      <div class="proofread-header" :style="headerStyle">
        <h3 class="proofread-title" :style="titleStyle">{{ $t('agent.display.proofread.title') }}</h3>
        <div class="error-stats" :style="statsStyle">
          <el-tag type="danger" size="small">{{ $t('agent.display.proofread.totalErrors', { count: displayData.result.totalErrors }) }}</el-tag>
          <el-tag v-for="(count, type) in displayData.result.errorCounts" :key="type" :type="getErrorTypeTag(type)" size="small">
            {{ getErrorTypeLabel(type) }}: {{ count }}
          </el-tag>
        </div>
      </div>

      <el-scrollbar max-height="500px">
        <div class="errors-list">
          <div
            v-for="(error, index) in displayData.result.errors"
            :key="index"
            class="error-item"
            :class="`severity-${error.severity}`"
            :style="errorItemStyle"
          >
            <div class="error-header">
              <el-tag :type="getSeverityType(error.severity)" size="small">{{ getSeverityLabel(error.severity) }}</el-tag>
              <el-tag :type="getErrorTypeTag(error.type)" size="small">{{ getErrorTypeLabel(error.type) }}</el-tag>
              <span class="error-location" :style="locationStyle">
                {{ $t('agent.display.proofread.location', { line: error.line, column: error.column }) }}
              </span>
            </div>
            <div class="error-content" :style="contentStyle">
              <div class="error-text">
                <span class="label">{{ $t('agent.display.proofread.errorText') }}:</span>
                <code>{{ error.text }}</code>
              </div>
              <div class="error-suggestion">
                <span class="label">{{ $t('agent.display.proofread.suggestion') }}:</span>
                <code class="suggestion-text">{{ error.suggestion }}</code>
              </div>
              <div v-if="error.message" class="error-message" :style="messageStyle">
                {{ error.message }}
              </div>
            </div>
          </div>
        </div>
      </el-scrollbar>
    </div>

    <div v-else-if="displayData.stage === 'completed' && (!displayData.result || displayData.result.errors.length === 0)" class="no-errors" :style="noErrorsStyle">
      <el-result icon="success" :title="$t('agent.display.proofread.noErrors')" />
    </div>

    <div v-else class="error-state">
      <el-alert
        :title="displayData.error || $t('agent.display.proofread.error')"
        type="error"
        :closable="false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import type { ToolDisplayComponentProps } from '../../../types/agent-tool'
import { useToolDisplayRealtime, parseToolData } from '../composables/useToolDisplayRealtime'
import { themeState } from '../../themes'

const { t } = useI18n()
const props = defineProps<ToolDisplayComponentProps>()

const { realtimeData, realtimeStatus, realtimeProgress } = useToolDisplayRealtime(
  props.invocationId,
  props.data,
  props.status,
  props.progress
)

const displayData = computed(() => {
  const data = realtimeData.value !== null ? realtimeData.value : props.data
  const parsed = parseToolData(data) as any
  
  if (parsed && typeof parsed === 'object') {
    // 根据status确定stage，优先使用数据中的stage，如果没有则根据status推断
    const getStage = (): 'checking' | 'completed' | 'error' => {
      if (parsed.stage) {
        return parsed.stage
      }
      // 根据status推断stage
      if (props.status === 'succeeded') {
        return 'completed'
      }
      if (props.status === 'failed') {
        return 'error'
      }
      return 'checking'
    }
    
    return {
      ...parsed,
      stage: getStage()
    }
  }
  
  // 如果没有数据，根据status设置默认stage
  const defaultStage = props.status === 'succeeded' ? 'completed' : (props.status === 'failed' ? 'error' : 'checking')
  return {
    stage: defaultStage,
    result: undefined,
    error: undefined
  }
})

const effectiveStatus = computed(() => {
  return realtimeStatus.value !== 'running' ? realtimeStatus.value : props.status
})

const getSeverityType = (severity: string) => {
  if (severity === 'error') return 'danger'
  if (severity === 'warning') return 'warning'
  return 'info'
}

const getSeverityLabel = (severity: string) => {
  return t(`agent.display.proofread.severity.${severity}`)
}

const getErrorTypeTag = (type: string) => {
  const typeMap: Record<string, string> = {
    grammar: 'primary',
    spelling: 'warning',
    latex: 'danger',
    style: 'info',
    other: 'info'
  }
  return typeMap[type] || 'info'
}

const getErrorTypeLabel = (type: string) => {
  return t(`agent.display.proofread.errorType.${type}`)
}

const containerStyle = computed(() => ({
  padding: '16px',
  backgroundColor: themeState.currentTheme.background2nd,
  borderRadius: '8px',
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
  flexWrap: 'wrap'
}))

const errorItemStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  border: `1px solid ${themeState.currentTheme.textColor2}20`,
  borderRadius: '6px',
  padding: '12px',
  marginBottom: '8px'
}))

const locationStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '12px',
  fontFamily: 'monospace'
}))

const contentStyle = computed(() => ({
  marginTop: '8px',
  paddingTop: '8px',
  borderTop: `1px solid ${themeState.currentTheme.textColor2}20`
}))

const messageStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '12px',
  marginTop: '4px',
  fontStyle: 'italic'
}))

const noErrorsStyle = computed(() => ({
  padding: '40px 20px',
  textAlign: 'center'
}))
</script>

<style scoped>
.proofread-display {
  width: 100%;
}

.errors-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.error-item {
  transition: all 0.2s;
}

.error-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.error-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.error-text,
.error-suggestion {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.label {
  font-weight: bold;
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor2');
}

code {
  background-color: v-bind('themeState.currentTheme.background2nd');
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
  font-family: monospace;
}

.suggestion-text {
  color: #67c23a;
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

