<template>
  <div class="workflow-display" :style="containerStyle">
    <div class="workflow-header">
      <h3>{{ workflowName }}</h3>
      <Badge :type="getStatusType(status)" size="small">{{ getStatusText(status) }}</Badge>
    </div>

    <div class="workflow-content">
      <!-- 工作流结构可视化 -->
      <div class="workflow-structure" v-if="executionState">
        <div class="structure-title">{{ t('agent.workflow.display.structure') }}</div>
        <div class="nodes-list">
          <div
            v-for="node in allNodes"
            :key="node.id"
            class="node-item"
            :class="{
              'node-completed': executionState.completedNodeIds.includes(node.id),
              'node-current': executionState.currentNodeId === node.id,
              'node-pending':
                !executionState.completedNodeIds.includes(node.id) &&
                executionState.currentNodeId !== node.id
            }"
          >
            <div class="node-icon">
              <el-icon v-if="executionState.completedNodeIds.includes(node.id)">
                <Check />
              </el-icon>
              <el-icon v-else-if="executionState.currentNodeId === node.id">
                <Loading />
              </el-icon>
              <el-icon v-else>
                <Clock />
              </el-icon>
            </div>
            <div class="node-info">
              <div class="node-label">{{ node.label }}</div>
              <div class="node-type">{{ getNodeTypeLabel(node) }}</div>
            </div>
            <div class="node-result" v-if="executionState.nodeResults.has(node.id)">
              <Tooltip>
                <template #content>
                  <pre>{{ JSON.stringify(executionState.nodeResults.get(node.id), null, 2) }}</pre>
                </template>
                <el-icon><InfoFilled /></el-icon>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      <!-- 执行进度 -->
      <div class="workflow-progress" v-if="progress">
        <div class="progress-title">{{ t('agent.workflow.display.progress') }}</div>
        <Progress
          :percentage="progress.percentage"
          :status="progress.percentage === 100 ? 'success' : undefined"
          :stroke-width="6"
          :show-text="true"
        />
        <div class="progress-message" v-if="progress.message">{{ progress.message }}</div>
      </div>

      <!-- 错误信息 -->
      <div class="workflow-error" v-if="error">
        <Alert variant="destructive">
          <XCircle class="h-4 w-4" />
          <AlertTitle>{{ t('agent.workflow.display.error') }}</AlertTitle>
          <AlertDescription>{{ error }}</AlertDescription>
        </Alert>
      </div>

      <!-- 执行结果 -->
      <div class="workflow-result" v-if="result && status === 'succeeded'">
        <div class="result-title">{{ t('agent.workflow.display.result') }}</div>
        <pre class="result-content">{{ JSON.stringify(result, null, 2) }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Loading, Clock, InfoFilled } from '@element-plus/icons-vue'
import { Alert, AlertTitle, AlertDescription } from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Progress } from '@renderer/components/ui/progress'
import { Tooltip } from '@renderer/components/ui/tooltip'
import { XCircle } from 'lucide-vue-next'
import { themeState } from '../../../utils/themes'
import type { ToolDisplayComponentProps } from '../../../types/agent-tool'
import type { WorkflowExecutionState } from '../../../types/agent-framework'
import { workflowManager } from '../../../utils/agent-framework'

const props = defineProps<ToolDisplayComponentProps>()

const { t } = useI18n()

const workflowId = computed(() => {
  // 从data中获取workflowId
  const data = props.data as any
  return data?.workflowId || data?.id
})

const executionId = computed(() => {
  const data = props.data as any
  return data?.executionId
})

const workflowName = computed(() => {
  if (workflowId.value) {
    const workflow = workflowManager.getWorkflow(workflowId.value)
    if (workflow) {
      return typeof workflow.name === 'string'
        ? workflow.name
        : workflow.name['zh_cn']?.name || workflow.id
    }
  }
  return '工作流'
})

const executionState = computed<WorkflowExecutionState | null>(() => {
  if (executionId.value) {
    return workflowManager.getExecution(executionId.value) || null
  }
  // 从data中获取执行状态
  const data = props.data as any
  return data?.executionState || null
})

const allNodes = computed(() => {
  if (!workflowId.value) return []
  const workflow = workflowManager.getWorkflow(workflowId.value)
  if (!workflow) return []
  return [...workflow.artifactNodes, ...workflow.controlFlowNodes]
})

const progress = computed(() => {
  return props.progress
})

const error = computed(() => {
  return props.error || executionState.value?.error
})

const result = computed(() => {
  const data = props.data as any
  return (
    data?.result || executionState.value?.nodeResults.get(executionState.value?.currentNodeId || '')
  )
})

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  padding: '16px',
  borderRadius: '8px'
}))

const getStatusType = (status: string) => {
  switch (status) {
    case 'succeeded':
      return 'success'
    case 'failed':
      return 'danger'
    case 'running':
      return 'warning'
    default:
      return 'info'
  }
}

const getStatusText = (status: string) => {
  switch (status) {
    case 'succeeded':
      return t('agent.workflow.display.status.succeeded')
    case 'failed':
      return t('agent.workflow.display.status.failed')
    case 'running':
      return t('agent.workflow.display.status.running')
    case 'pending':
      return t('agent.workflow.display.status.pending')
    default:
      return status
  }
}

const getNodeTypeLabel = (node: any): string => {
  return node.type || 'unknown'
}
</script>

<style scoped>
.workflow-display {
  width: 100%;
}

.workflow-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.workflow-header h3 {
  margin: 0;
  font-size: 18px;
}

.workflow-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.workflow-structure {
  background: var(--el-bg-color);
  padding: 16px;
  border-radius: 8px;
}

.structure-title {
  font-weight: 500;
  margin-bottom: 12px;
}

.nodes-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.node-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--el-bg-color-page);
  border-radius: 6px;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.node-item.node-completed {
  border-color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.node-item.node-current {
  border-color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  animation: pulse 2s infinite;
}

.node-item.node-pending {
  opacity: 0.6;
}

.node-icon {
  font-size: 20px;
}

.node-info {
  flex: 1;
}

.node-label {
  font-weight: 500;
  margin-bottom: 4px;
}

.node-type {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.node-result {
  cursor: pointer;
}

.workflow-progress {
  background: var(--el-bg-color);
  padding: 16px;
  border-radius: 8px;
}

.progress-title {
  font-weight: 500;
  margin-bottom: 12px;
}

.progress-message {
  margin-top: 8px;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.workflow-error {
  margin-top: 16px;
}

.workflow-result {
  background: var(--el-bg-color);
  padding: 16px;
  border-radius: 8px;
}

.result-title {
  font-weight: 500;
  margin-bottom: 12px;
}

.result-content {
  background: var(--el-bg-color-page);
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  max-height: 400px;
  overflow-y: auto;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
}
</style>
