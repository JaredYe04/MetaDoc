<template>
  <div class="metadata-display" :style="containerStyle">
    <div
      v-if="
        displayData.stage === 'loading' ||
        displayData.stage === 'generating' ||
        displayData.stage === 'updating'
      "
      class="status-message"
      :style="statusMessageStyle"
    >
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ getStageMessage(displayData.stage) }}</span>
    </div>

    <div
      v-else-if="displayData.stage === 'completed' && displayData.metadata"
      class="completed-state"
      :style="completedStateStyle"
    >
      <Result icon="success" :title="$t('agent.display.metadata.completed')" />
      <div class="metadata-info" :style="metadataInfoStyle">
        <div class="metadata-item" v-if="displayData.metadata.title">
          <strong>{{ $t('agent.display.metadata.title') }}:</strong>
          <span>{{ displayData.metadata.title }}</span>
        </div>
        <div class="metadata-item" v-if="displayData.metadata.author">
          <strong>{{ $t('agent.display.metadata.author') }}:</strong>
          <span>{{ displayData.metadata.author }}</span>
        </div>
        <div class="metadata-item" v-if="displayData.metadata.description">
          <strong>{{ $t('agent.display.metadata.description') }}:</strong>
          <span>{{ displayData.metadata.description }}</span>
        </div>
        <div
          class="metadata-item"
          v-if="displayData.metadata.keywords && displayData.metadata.keywords.length > 0"
        >
          <strong>{{ $t('agent.display.metadata.keywords') }}:</strong>
          <div class="keywords-list">
            <Badge
              v-for="(keyword, index) in displayData.metadata.keywords"
              :key="index"
              variant="secondary"
              class="keyword-badge"
            >
              {{ keyword }}
            </Badge>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="error-state">
      <Alert variant="destructive">
        <XCircle class="h-4 w-4" />
        <AlertTitle>{{ displayData.error || $t('agent.display.metadata.error') }}</AlertTitle>
      </Alert>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { Alert, AlertTitle, AlertDescription } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Result } from '@renderer/components/ui/result'
import { XCircle } from 'lucide-vue-next'
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
    const getStage = (): 'loading' | 'generating' | 'completed' | 'error' => {
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
    metadata: undefined,
    error: undefined
  }
})

const getStageMessage = (stage: string) => {
  if (stage === 'loading') return t('agent.display.metadata.loading')
  if (stage === 'generating') return t('agent.display.metadata.generating')
  if (stage === 'updating') return t('agent.display.metadata.updating')
  return t('agent.display.metadata.processing')
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

const completedStateStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const metadataInfoStyle = computed(() => ({
  marginTop: '16px',
  padding: '12px',
  backgroundColor: themeState.currentTheme.background,
  borderRadius: '6px',
  color: themeState.currentTheme.textColor
}))

const metadataItemStyle = computed(() => ({
  marginBottom: '8px',
  paddingBottom: '8px',
  borderBottom: `1px solid ${themeState.currentTheme.textColor2}20`
}))
</script>

<style scoped>
.metadata-display {
  width: 100%;
}

.metadata-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.metadata-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metadata-item strong {
  color: v-bind('themeState.currentTheme.textColor2');
  font-size: 12px;
  text-transform: uppercase;
}

.keywords-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.keyword-badge {
  font-size: 12px;
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
