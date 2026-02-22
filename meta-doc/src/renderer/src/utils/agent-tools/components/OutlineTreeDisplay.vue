<template>
  <div class="outline-tree-display" :style="containerStyle">
    <div
      v-if="
        displayData.stage === 'retrieving' ||
        displayData.stage === 'loading' ||
        displayData.stage === 'extracting'
      "
      class="status-message"
      :style="statusMessageStyle"
    >
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ getStageMessage(displayData.stage) }}</span>
    </div>

    <div
      v-else-if="displayData.stage === 'completed' && displayData.outlineTree"
      class="completed-state"
      :style="completedStateStyle"
    >
      <div class="outline-header" :style="headerStyle">
        <div class="header-content">
          <el-icon><Document /></el-icon>
          <h3 class="outline-title" :style="titleStyle">
            {{ $t('agent.display.outlineTree.title') }}
          </h3>
        </div>
        <Badge type="info" size="small">{{
          $t('agent.display.outlineTree.nodeCount', { count: nodeCount })
        }}</Badge>
      </div>

      <ScrollArea class="h-[500px]">
        <el-tree
          :data="treeData"
          :props="{ children: 'children', label: 'label' }"
          default-expand-all
          class="outline-tree"
        >
          <template #default="{ node, data }">
            <div class="tree-node" :style="treeNodeStyle">
              <span class="node-label" :style="nodeLabelStyle">{{ data.label }}</span>
              <div class="node-info">
                <Badge v-if="data.path" size="small" type="info" :class="nodeTagClass">
                  {{ $t('agent.display.outlineTree.path') }}: {{ data.path }}
                </Badge>
                <Badge
                  v-if="data.titleLevel !== undefined"
                  size="small"
                  type="warning"
                  :class="nodeTagClass"
                >
                  {{ $t('agent.display.outlineTree.level') }}: {{ data.titleLevel }}
                </Badge>
                <Badge v-if="data.hasContent" size="small" type="success" :class="nodeTagClass">
                  {{ $t('agent.display.outlineTree.hasContent') }}
                </Badge>
                <Badge
                  v-if="data.childrenCount !== undefined && data.childrenCount > 0"
                  size="small"
                  :class="nodeTagClass"
                >
                  {{ $t('agent.display.outlineTree.childrenCount', { count: data.childrenCount }) }}
                </Badge>
              </div>
            </div>
          </template>
        </el-tree>
      </ScrollArea>
    </div>

    <div v-else class="error-state">
      <Alert variant="destructive">
        <XCircle class="h-4 w-4" />
        <AlertTitle>{{ displayData.error || $t('agent.display.outlineTree.error') }}</AlertTitle>
      </Alert>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loading, Document } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Alert, AlertTitle, AlertDescription } from '../../../components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { XCircle } from 'lucide-vue-next'
import type { ToolDisplayComponentProps } from '../../../types/agent-tool'
import { useToolDisplayRealtime, parseToolData } from '../composables/useToolDisplayRealtime'
import { themeState } from '../../themes'
import type { DocumentOutlineNode } from '@/types'

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
    const getStage = (): 'retrieving' | 'loading' | 'extracting' | 'completed' | 'error' => {
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
      return 'retrieving'
    }

    return {
      ...parsed,
      stage: getStage(),
      // 兼容 outline 和 outlineTree 两种字段名
      outlineTree: parsed.outlineTree || parsed.outline
    }
  }

  // 如果没有数据，根据status设置默认stage
  const defaultStage =
    props.status === 'succeeded' ? 'completed' : props.status === 'failed' ? 'error' : 'retrieving'
  return {
    stage: defaultStage,
    outlineTree: undefined,
    error: undefined
  }
})

const getStageMessage = (stage: string) => {
  if (stage === 'loading') return t('agent.display.outlineTree.loading')
  if (stage === 'extracting') return t('agent.display.outlineTree.extracting')
  return t('agent.display.outlineTree.retrieving')
}

const effectiveStatus = computed(() => {
  return realtimeStatus.value !== 'running' ? realtimeStatus.value : props.status
})

const countNodes = (node: DocumentOutlineNode): number => {
  let count = 1
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child)
    }
  }
  return count
}

const nodeCount = computed(() => {
  if (!displayData.value.outlineTree) return 0
  return countNodes(displayData.value.outlineTree)
})

const convertToTreeData = (node: DocumentOutlineNode): any => {
  const hasContent = node.text && node.text.trim().length > 0
  const childrenCount = node.children ? node.children.length : 0

  return {
    label: node.title || t('agent.display.outlineTree.emptyTitle'),
    path: node.path,
    titleLevel: node.title_level,
    hasContent,
    childrenCount,
    children:
      node.children && node.children.length > 0
        ? node.children.map((child: DocumentOutlineNode) => convertToTreeData(child))
        : undefined
  }
}

const treeData = computed(() => {
  if (!displayData.value.outlineTree) return []

  // 只显示根节点的子节点（不显示虚拟根节点）
  if (displayData.value.outlineTree.children && displayData.value.outlineTree.children.length > 0) {
    return displayData.value.outlineTree.children.map((child: DocumentOutlineNode) =>
      convertToTreeData(child)
    )
  }

  return []
})

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

const treeNodeStyle = computed(() => ({
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '6px',
  width: '100%',
  minWidth: 0,
  padding: 0,
  boxSizing: 'border-box' as const
}))

const nodeLabelStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  fontSize: '14px',
  fontWeight: 500,
  lineHeight: 1.5,
  wordBreak: 'break-word' as const,
  overflowWrap: 'break-word' as const,
  flexShrink: 0
}))

const nodeTagClass = 'shrink-0'
</script>

<style scoped>
.outline-tree-display {
  width: 100%;
}

.outline-tree {
  background-color: transparent;
}

.outline-tree :deep(.el-tree-node__content) {
  height: auto;
  min-height: 32px;
  padding: 4px 0;
  align-items: flex-start;
}

.outline-tree :deep(.el-tree-node__expand-icon) {
  margin-top: 4px;
}

.tree-node {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-width: 0;
  padding: 0;
  box-sizing: border-box;
}

.node-label {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  word-break: break-word;
  overflow-wrap: break-word;
  flex-shrink: 0;
}

.node-info {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  width: 100%;
}

.node-info :deep(.badge) {
  margin: 0;
  flex-shrink: 0;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 8px;
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
