<template>
  <div class="grep-display" :style="containerStyle">
    <div v-if="displayData.stage === 'searching'" class="status-message" :style="statusMessageStyle">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ $t('agent.display.grep.searching') }}</span>
    </div>

    <div v-else-if="displayData.stage === 'completed' && displayData.matches" class="completed-state" :style="completedStateStyle">
      <div class="grep-header" :style="headerStyle">
        <h3 class="grep-title" :style="titleStyle">{{ $t('agent.display.grep.title') }}</h3>
        <el-tag type="info" size="small">{{ $t('agent.display.grep.matchesCount', { count: displayData.matches.length }) }}</el-tag>
      </div>

      <el-scrollbar max-height="500px">
        <div class="matches-list">
          <div
            v-for="(match, index) in displayData.matches"
            :key="index"
            class="match-item"
            :style="matchItemStyle"
          >
            <div class="match-header">
              <el-tag :type="getLocationType(match.location.type)" size="small">
                {{ getLocationLabel(match.location) }}
              </el-tag>
              <span class="match-value" :style="matchValueStyle">{{ match.value }}</span>
            </div>
            <div v-if="match.preContext || match.postContext" class="match-context" :style="contextStyle">
              <div v-if="match.preContext" class="context-pre" :style="contextTextStyle">
                <span class="context-label">{{ $t('agent.display.grep.preContext') }}:</span>
                <code>{{ match.preContext }}</code>
              </div>
              <div class="context-match" :style="matchHighlightStyle">
                <span class="context-label">{{ $t('agent.display.grep.match') }}:</span>
                <code>{{ match.value }}</code>
              </div>
              <div v-if="match.postContext" class="context-post" :style="contextTextStyle">
                <span class="context-label">{{ $t('agent.display.grep.postContext') }}:</span>
                <code>{{ match.postContext }}</code>
              </div>
            </div>
          </div>
        </div>
      </el-scrollbar>
    </div>

    <div v-else-if="displayData.stage === 'completed' && (!displayData.matches || displayData.matches.length === 0)" class="no-results" :style="noResultsStyle">
      <el-empty :description="$t('agent.display.grep.noMatches')" />
    </div>

    <div v-else class="error-state">
      <el-alert
        :title="displayData.error || $t('agent.display.grep.error')"
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
    const getStage = (): 'searching' | 'completed' | 'error' => {
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
      return 'searching'
    }
    
    return {
      ...parsed,
      stage: getStage()
    }
  }
  
  // 如果没有数据，根据status设置默认stage
  const defaultStage = props.status === 'succeeded' ? 'completed' : (props.status === 'failed' ? 'error' : 'searching')
  return {
    stage: defaultStage,
    matches: undefined,
    error: undefined
  }
})

const effectiveStatus = computed(() => {
  return realtimeStatus.value !== 'running' ? realtimeStatus.value : props.status
})

const getLocationType = (type: string) => {
  return type === 'content' ? 'primary' : 'warning'
}

const getLocationLabel = (location: any) => {
  if (location.type === 'content') {
    return location.line ? `${t('agent.display.grep.line')} ${location.line}` : t('agent.display.grep.content')
  } else {
    return location.field ? `${t('agent.display.grep.metadata')}: ${location.field}` : t('agent.display.grep.metadata')
  }
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
  gap: '12px'
}))

const titleStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  margin: 0
}))

const matchItemStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  border: `1px solid ${themeState.currentTheme.textColor2}20`,
  borderRadius: '6px',
  padding: '12px',
  marginBottom: '8px'
}))

const matchValueStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  fontWeight: 'bold',
  fontFamily: 'monospace'
}))

const contextStyle = computed(() => ({
  marginTop: '8px',
  paddingTop: '8px',
  borderTop: `1px solid ${themeState.currentTheme.textColor2}20`
}))

const contextTextStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '12px',
  marginBottom: '4px'
}))

const matchHighlightStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  fontSize: '13px',
  fontWeight: 'bold',
  marginBottom: '4px'
}))

const noResultsStyle = computed(() => ({
  padding: '40px 20px',
  textAlign: 'center'
}))
</script>

<style scoped>
.grep-display {
  width: 100%;
}

.matches-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.match-item {
  transition: all 0.2s;
}

.match-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.match-header {
  display: flex;
  align-items: center;
  gap: '8px';
  flex-wrap: wrap;
}

.match-context {
  font-family: monospace;
}

.context-label {
  font-weight: bold;
  margin-right: 8px;
  font-size: 11px;
  text-transform: uppercase;
}

code {
  background-color: v-bind('themeState.currentTheme.background2nd');
  padding: 2px 6px;
  border-radius: 3px;
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

