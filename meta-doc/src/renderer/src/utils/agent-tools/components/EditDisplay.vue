<template>
  <div class="edit-display" :style="containerStyle">
    <div v-if="displayData.stage === 'loading' || displayData.stage === 'applying' || displayData.stage === 'updating'" class="status-message" :style="statusMessageStyle">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ getStageMessage(displayData.stage) }}</span>
    </div>

    <div v-else-if="displayData.stage === 'completed' && displayData.result" class="completed-state" :style="completedStateStyle">
      <el-result icon="success" :title="$t('agent.display.edit.completed')" />
      <div class="result-info" :style="resultInfoStyle">
        <p><strong>{{ $t('agent.display.edit.appliedEdits') }}:</strong> {{ displayData.result.appliedEdits }}</p>
        <p v-if="displayData.result.failedEdits > 0"><strong>{{ $t('agent.display.edit.failedEdits') }}:</strong> {{ displayData.result.failedEdits }}</p>
        <p><strong>{{ $t('agent.display.edit.totalOperations') }}:</strong> {{ displayData.result.operations.length }}</p>
      </div>
    </div>

    <div v-else class="error-state">
      <el-alert
        :title="displayData.error || $t('agent.display.edit.error')"
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
    const getStage = (): 'loading' | 'applying' | 'updating' | 'completed' | 'error' => {
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
  const defaultStage = props.status === 'succeeded' ? 'completed' : (props.status === 'failed' ? 'error' : 'loading')
  return {
    stage: defaultStage,
    result: undefined,
    error: undefined
  }
})

const getStageMessage = (stage: string) => {
  if (stage === 'loading') return t('agent.display.edit.loading')
  if (stage === 'applying') return t('agent.display.edit.applying')
  if (stage === 'updating') return t('agent.display.edit.updating')
  return t('agent.display.edit.processing')
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

const resultInfoStyle = computed(() => ({
  marginTop: '16px',
  padding: '12px',
  backgroundColor: themeState.currentTheme.background,
  borderRadius: '6px',
  color: themeState.currentTheme.textColor
}))
</script>

<style scoped>
.edit-display {
  width: 100%;
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

