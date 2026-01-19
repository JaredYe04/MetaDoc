<template>
  <div class="node-agent-display" :style="containerStyle">
    <div v-if="displayData.stage === 'loading' || displayData.stage === 'traversing'" class="status-message" :style="statusMessageStyle">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ getStageMessage(displayData.stage) }}</span>
    </div>

    <!-- 节点执行状态 -->
    <div v-else-if="displayData.stage === 'node-executing' || displayData.stage === 'node-completed' || displayData.stage === 'node-failed'" class="node-execution-state" :style="nodeExecutionStyle">
      <div class="current-node-info" :style="currentNodeInfoStyle">
        <h3>{{ $t('agent.display.nodeAgent.currentNode') }}</h3>
        <p><strong>{{ $t('agent.display.nodeAgent.nodePath') }}:</strong> {{ displayData.currentNodePath }}</p>
        <p><strong>{{ $t('agent.display.nodeAgent.nodeTitle') }}:</strong> {{ displayData.currentNodeTitle }}</p>
      </div>

      <!-- 活动节点列表（高亮显示） -->
      <div v-if="displayData.activeNodePaths && displayData.activeNodePaths.length > 0" class="active-nodes-section" :style="activeNodesStyle">
        <h4>{{ $t('agent.display.nodeAgent.activeNodes') }}</h4>
        <div class="active-nodes-list">
          <el-tag
            v-for="path in displayData.activeNodePaths"
            :key="path"
            type="warning"
            effect="dark"
            class="active-node-tag"
            :style="tagStyle"
          >
            {{ path }}
          </el-tag>
        </div>
      </div>

      <!-- 已完成节点列表 -->
      <div v-if="displayData.executedNodePaths && displayData.executedNodePaths.length > 0" class="executed-nodes-section" :style="executedNodesStyle">
        <h4>{{ $t('agent.display.nodeAgent.executedNodes') }} ({{ displayData.executedNodePaths.length }})</h4>
        <el-scrollbar max-height="200px">
          <div class="executed-nodes-list">
            <el-tag
              v-for="path in displayData.executedNodePaths"
              :key="path"
              type="success"
              class="executed-node-tag"
              :style="tagStyle"
            >
              {{ path }}
            </el-tag>
          </div>
        </el-scrollbar>
      </div>

      <!-- 生成内容预览 -->
      <div v-if="displayData.generatedContent" class="content-preview" :style="contentPreviewStyle">
        <h4>{{ $t('agent.display.nodeAgent.generatedContent') }}</h4>
        <div class="preview-text" :style="previewTextStyle">{{ displayData.generatedContent }}</div>
      </div>

      <!-- 错误信息 -->
      <div v-if="displayData.stage === 'node-failed' && displayData.error" class="error-info" :style="errorInfoStyle">
        <el-alert :title="displayData.error" type="error" :closable="false" />
      </div>
    </div>

    <!-- 同步状态 -->
    <div v-else-if="displayData.stage === 'syncing'" class="status-message" :style="statusMessageStyle">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ getStageMessage(displayData.stage) }}</span>
    </div>

    <!-- 完成状态 -->
    <div v-else-if="displayData.stage === 'completed'" class="completed-state" :style="completedStateStyle">
      <el-result icon="success" :title="$t('agent.display.nodeAgent.completed')" />
      <div class="result-info" :style="resultInfoStyle">
        <p><strong>{{ $t('agent.display.nodeAgent.startNodePath') }}:</strong> {{ displayData.startNodePath || displayData.nodePath }}</p>
        <p v-if="displayData.startNodeTitle"><strong>{{ $t('agent.display.nodeAgent.startNodeTitle') }}:</strong> {{ displayData.startNodeTitle }}</p>
        <div v-if="displayData.totalNodesProcessed !== undefined" class="result-stat">
          <el-tag type="success">{{ $t('agent.display.nodeAgent.totalNodesProcessed', { count: displayData.totalNodesProcessed }) }}</el-tag>
        </div>
        <div v-if="displayData.executedNodePaths && displayData.executedNodePaths.length > 0" class="result-stat">
          <el-tag type="info">{{ $t('agent.display.nodeAgent.executedNodesCount', { count: displayData.executedNodePaths.length }) }}</el-tag>
        </div>
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else class="error-state">
      <el-alert
        :title="displayData.error || $t('agent.display.nodeAgent.error')"
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
    const getStage = (): string => {
      if (parsed.stage) {
        return parsed.stage
      }
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
  
  const defaultStage = props.status === 'succeeded' ? 'completed' : (props.status === 'failed' ? 'error' : 'loading')
  return {
    stage: defaultStage,
    error: undefined
  }
})

const getStageMessage = (stage: string) => {
  if (stage === 'loading') return t('agent.display.nodeAgent.loading')
  if (stage === 'traversing') return t('agent.display.nodeAgent.traversing')
  if (stage === 'syncing') return t('agent.display.nodeAgent.syncing')
  return t('agent.display.nodeAgent.processing')
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
  textAlign: 'center' as const,
  justifyContent: 'center'
}))

const nodeExecutionStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const currentNodeInfoStyle = computed(() => ({
  marginBottom: '16px',
  padding: '12px',
  backgroundColor: themeState.currentTheme.background,
  borderRadius: '6px',
  border: `2px solid ${themeState.currentTheme.type === 'dark' ? 'rgba(255, 193, 7, 0.3)' : 'rgba(255, 193, 7, 0.5)'}`
}))

const activeNodesStyle = computed(() => ({
  marginBottom: '16px',
  padding: '12px',
  backgroundColor: themeState.currentTheme.background,
  borderRadius: '6px'
}))

const executedNodesStyle = computed(() => ({
  marginBottom: '16px',
  padding: '12px',
  backgroundColor: themeState.currentTheme.background,
  borderRadius: '6px'
}))

const contentPreviewStyle = computed(() => ({
  marginTop: '16px',
  padding: '12px',
  backgroundColor: themeState.currentTheme.background,
  borderRadius: '6px',
  border: `1px solid ${themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`
}))

const previewTextStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  fontSize: '13px',
  lineHeight: '1.6',
  maxHeight: '150px',
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word'
}))

const errorInfoStyle = computed(() => ({
  marginTop: '16px'
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

const tagStyle = computed(() => ({
  marginRight: '6px',
  marginBottom: '6px'
}))
</script>

<style scoped>
.node-agent-display {
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

.result-stat {
  margin-top: 8px;
}

.active-nodes-list,
.executed-nodes-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.current-node-info h3,
.active-nodes-section h4,
.executed-nodes-section h4,
.content-preview h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 500;
}

.error-state {
  padding: 12px;
}
</style>

