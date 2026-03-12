<template>
  <div class="timestamp-display" :style="containerStyle">
    <div
      v-if="displayData.stage === 'running' || displayData.stage === 'loading'"
      class="status-message"
      :style="statusMessageStyle"
    >
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ $t('agent.display.timestamp.processing') }}</span>
    </div>

    <div
      v-else-if="displayData.stage === 'completed' && displayData.result !== undefined"
      class="completed-state"
      :style="completedStateStyle"
    >
      <!-- format: timestamp (number only) -->
      <div v-if="displayData.format === 'timestamp'" class="timestamp-only" :style="cardStyle">
        <div class="label" :style="labelStyle">{{ $t('agent.display.timestamp.unixTimestamp') }}</div>
        <code class="value" :style="codeStyle">{{ displayData.result }}</code>
      </div>

      <!-- format: iso or date (utc + local strings) -->
      <div
        v-else-if="(displayData.format === 'iso' || displayData.format === 'date') && typeof displayData.result === 'object' && displayData.result?.utc != null"
        class="timestamp-iso-date"
        :style="cardStyle"
      >
        <div class="row">
          <span class="label" :style="labelStyle">UTC</span>
          <code :style="codeStyle">{{ displayData.result.utc }}</code>
        </div>
        <div class="row" v-if="displayData.result.local != null">
          <span class="label" :style="labelStyle">{{ $t('agent.display.timestamp.local') }}</span>
          <code :style="codeStyle">{{ displayData.result.local }}</code>
        </div>
      </div>

      <!-- format: all (current, previous, timeDiff) -->
      <div v-else-if="isAllFormat" class="timestamp-all">
        <div class="section card" :style="cardStyle">
          <div class="section-title" :style="labelStyle">{{ $t('agent.display.timestamp.current') }}</div>
          <div class="time-row">
            <span class="sub-label" :style="labelStyle">{{ $t('agent.display.timestamp.local') }}</span>
            <span>{{ displayData.result.current?.local?.date }} {{ displayData.result.current?.local?.time }}</span>
            <span v-if="displayData.result.current?.local?.timezone" class="tz" :style="mutedStyle">{{ displayData.result.current.local.timezone }}</span>
          </div>
          <div class="time-row">
            <span class="sub-label" :style="labelStyle">UTC</span>
            <span>{{ displayData.result.current?.utc?.date }} {{ displayData.result.current?.utc?.time }}</span>
          </div>
          <div class="time-row" v-if="displayData.result.current?.timestamp != null">
            <span class="sub-label" :style="labelStyle">{{ $t('agent.display.timestamp.unixTimestamp') }}</span>
            <code :style="codeStyle">{{ displayData.result.current.timestamp }}</code>
          </div>
        </div>

        <div v-if="displayData.result.previous != null" class="section card" :style="cardStyle">
          <div class="section-title" :style="labelStyle">{{ $t('agent.display.timestamp.previous') }}</div>
          <div class="time-row">
            <span>{{ displayData.result.previous?.local?.iso ?? displayData.result.previous?.local?.date }} {{ displayData.result.previous?.local?.time }}</span>
          </div>
          <div class="time-row" v-if="displayData.result.previous?.timestamp != null">
            <code :style="codeStyle">{{ displayData.result.previous.timestamp }}</code>
          </div>
        </div>

        <div v-if="displayData.result.timeDiff != null" class="section card diff" :style="cardStyle">
          <div class="section-title" :style="labelStyle">{{ $t('agent.display.timestamp.timeDiff') }}</div>
          <div class="diff-row" :style="mutedStyle">{{ formatTimeDiff(displayData.result.timeDiff) }}</div>
          <div class="diff-detail" :style="mutedStyle">
            {{ displayData.result.timeDiff.milliseconds }} ms
            · {{ displayData.result.timeDiff.seconds?.toFixed(2) }} s
            <template v-if="displayData.result.timeDiff.minutes != null && displayData.result.timeDiff.minutes >= 0.01">
              · {{ displayData.result.timeDiff.minutes?.toFixed(2) }} min
            </template>
            <template v-if="displayData.result.timeDiff.hours != null && displayData.result.timeDiff.hours >= 0.01">
              · {{ displayData.result.timeDiff.hours?.toFixed(2) }} h
            </template>
            <template v-if="displayData.result.timeDiff.days != null && displayData.result.timeDiff.days >= 0.01">
              · {{ displayData.result.timeDiff.days?.toFixed(2) }} d
            </template>
          </div>
        </div>
      </div>

      <!-- fallback: raw result (e.g. number from timestamp format stored differently) -->
      <div v-else class="timestamp-fallback card" :style="cardStyle">
        <div class="label" :style="labelStyle">{{ $t('agent.display.timestamp.result') }}</div>
        <code class="value" :style="codeStyle">{{ typeof displayData.result === 'object' ? JSON.stringify(displayData.result) : displayData.result }}</code>
      </div>
    </div>

    <div v-else-if="displayData.stage === 'error'" class="error-state">
      <Alert variant="destructive">
        <XCircle class="h-4 w-4" />
        <AlertTitle>{{ displayData.error || $t('agent.display.timestamp.error') }}</AlertTitle>
      </Alert>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { Alert, AlertTitle } from '../../../components/ui/alert'
import { XCircle } from 'lucide-vue-next'
import type { ToolDisplayComponentProps } from '../../../types/agent-tool'
import { useToolDisplayRealtime, parseToolData } from '../composables/useToolDisplayRealtime'
import { themeState } from '../../themes'

const { t } = useI18n()
const props = defineProps<ToolDisplayComponentProps>()

// 传 toRef 以便 message 完成后自动同步最终数据，避免执行过快未收到 tool-complete 时一直显示「正在获取时间」
const { realtimeData, realtimeStatus, realtimeProgress } = useToolDisplayRealtime(
  props.invocationId,
  toRef(props, 'data'),
  toRef(props, 'status'),
  props.progress
)

const displayData = computed(() => {
  // 无 invocationId 表示持久化恢复的会话，直接使用 props.data；否则优先 succeeded 的 props.data，再 fallback 到 realtimeData
  const dataSource =
    !props.invocationId && props.data != null
      ? props.data
      : props.status === 'succeeded' && props.data != null
        ? props.data
        : realtimeData.value != null && realtimeData.value !== undefined
          ? realtimeData.value
          : props.data
  const parsed = parseToolData(dataSource) as any

  if (parsed && typeof parsed === 'object') {
    const getStage = (): 'loading' | 'running' | 'completed' | 'error' => {
      if (parsed.stage) return parsed.stage
      if (props.status === 'succeeded') return 'completed'
      if (props.status === 'failed') return 'error'
      return 'running'
    }
    return {
      ...parsed,
      stage: getStage(),
      result: parsed.result,
      format: parsed.format ?? 'all'
    }
  }

  const defaultStage =
    props.status === 'succeeded' ? 'completed' : props.status === 'failed' ? 'error' : 'running'
  return { stage: defaultStage, result: undefined, format: 'all', error: undefined }
})

const isAllFormat = computed(() => {
  const r = displayData.value.result
  return (
    displayData.value.format === 'all' &&
    r &&
    typeof r === 'object' &&
    r.current != null
  )
})

function formatTimeDiff(td: { days?: number; hours?: number; minutes?: number; seconds?: number; milliseconds?: number }): string {
  if (!td) return ''
  const parts: string[] = []
  if (td.days != null && td.days >= 1) parts.push(`${Math.floor(td.days)} d`)
  if (td.hours != null && td.hours >= 1) parts.push(`${Math.floor(td.hours)} h`)
  if (td.minutes != null && td.minutes >= 1) parts.push(`${Math.floor(td.minutes)} min`)
  if (td.seconds != null && td.seconds >= 1) parts.push(`${td.seconds.toFixed(1)} s`)
  if (parts.length) return parts.join(' ')
  if (td.milliseconds != null) return `${td.milliseconds} ms`
  return ''
}

const containerStyle = computed(() => ({
  padding: '12px 0',
  color: themeState.currentTheme.textColor
}))

const statusMessageStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '12px',
  justifyContent: 'center'
}))

const completedStateStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const cardStyle = computed(() => ({
  padding: '12px 16px',
  backgroundColor: themeState.currentTheme.background,
  borderRadius: '8px',
  color: themeState.currentTheme.textColor,
  border: `1px solid ${themeState.currentTheme.textColor2}20`
}))

const labelStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontWeight: 500
}))

const mutedStyle = computed(() => ({
  color: themeState.currentTheme.textColor2
}))

const codeStyle = computed(() => ({
  fontFamily: 'var(--font-mono), monospace',
  fontSize: '13px',
  backgroundColor: `${themeState.currentTheme.textColor2}15`,
  padding: '2px 6px',
  borderRadius: '4px',
  color: themeState.currentTheme.textColor
}))
</script>

<style scoped>
.timestamp-display {
  width: 100%;
}

.status-message {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timestamp-only .value,
.timestamp-fallback .value {
  display: block;
  margin-top: 6px;
  word-break: break-all;
}

.timestamp-iso-date .row {
  margin-bottom: 8px;
}
.timestamp-iso-date .row:last-child {
  margin-bottom: 0;
}
.timestamp-iso-date .label {
  margin-right: 8px;
}

.timestamp-all .section {
  margin-bottom: 12px;
}
.timestamp-all .section:last-child {
  margin-bottom: 0;
}
.timestamp-all .section-title {
  margin-bottom: 8px;
  font-size: 13px;
}
.timestamp-all .time-row,
.timestamp-all .diff-row {
  margin-bottom: 4px;
  font-size: 13px;
}
.timestamp-all .time-row .tz,
.timestamp-all .diff-detail {
  font-size: 12px;
  margin-top: 4px;
}
.timestamp-all .sub-label {
  display: inline-block;
  min-width: 72px;
  margin-right: 8px;
}
</style>
