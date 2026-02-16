<template>
  <div class="title-format-display" :style="containerStyle">
    <div
      v-if="
        displayData.stage === 'loading' ||
        displayData.stage === 'processing' ||
        displayData.stage === 'saving'
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
      <div class="format-header" :style="headerStyle">
        <div class="header-content">
          <el-icon><Edit /></el-icon>
          <h3 class="format-title" :style="titleStyle">
            {{ $t('agent.display.titleFormat.title') }}
          </h3>
        </div>
      </div>

      <el-result icon="success" :title="$t('agent.display.titleFormat.completed')" />

      <div
        v-if="displayData.operations && displayData.operations.length > 0"
        class="operations-info"
        :style="operationsInfoStyle"
      >
        <div class="operations-summary" :style="summaryStyle">
          <strong>{{ $t('agent.display.titleFormat.operationsPerformed') }}:</strong>
          <ul>
            <li v-for="(op, index) in displayData.operations" :key="index">{{ op }}</li>
          </ul>
        </div>
      </div>

      <div v-if="displayData.summary" class="summary-info" :style="summaryInfoStyle">
        <p>{{ displayData.summary }}</p>
      </div>
    </div>

    <div v-else class="error-state">
      <el-alert
        :title="displayData.error || $t('agent.display.titleFormat.error')"
        type="error"
        :closable="false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loading, Edit } from '@element-plus/icons-vue'
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
    const getStage = (): 'loading' | 'processing' | 'saving' | 'completed' | 'error' => {
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
      return 'loading'
    }

    return {
      ...parsed,
      stage: getStage()
    }
  }

  // 如果没有数据，根据status设置默认stage
  const defaultStage =
    props.status === 'succeeded' ? 'completed' : props.status === 'failed' ? 'error' : 'loading'
  return {
    stage: defaultStage,
    operations: undefined,
    summary: undefined,
    error: undefined
  }
})

const getStageMessage = (stage: string) => {
  if (stage === 'loading') return t('agent.display.titleFormat.loading')
  if (stage === 'processing') return t('agent.display.titleFormat.processing')
  if (stage === 'saving') return t('agent.display.titleFormat.saving')
  return t('agent.display.titleFormat.processing')
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
  textAlign: 'center' as const,
  justifyContent: 'center'
}))

const completedStateStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const headerStyle = computed(() => ({
  marginBottom: '16px',
  paddingBottom: '12px',
  borderBottom: `1px solid ${themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px'
}))

const headerContentStyle = computed(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
}))

const titleStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  margin: 0
}))

const operationsInfoStyle = computed(() => ({
  marginTop: '16px',
  padding: '12px',
  backgroundColor: themeState.currentTheme.background,
  borderRadius: '6px',
  color: themeState.currentTheme.textColor
}))

const summaryStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const summaryInfoStyle = computed(() => ({
  marginTop: '12px',
  padding: '12px',
  backgroundColor: themeState.currentTheme.background,
  borderRadius: '6px',
  color: themeState.currentTheme.textColor
}))
</script>

<style scoped>
.title-format-display {
  width: 100%;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.operations-info {
  margin-top: 16px;
}

.operations-summary ul {
  margin: 8px 0 0 20px;
  padding: 0;
}

.operations-summary li {
  margin: 4px 0;
}

.summary-info {
  margin-top: 12px;
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

.error-state {
  padding: 12px;
}
</style>
