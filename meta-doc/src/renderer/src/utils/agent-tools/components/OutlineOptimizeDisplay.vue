<template>
  <div class="outline-optimize-display" :style="containerStyle">
    <div
      v-if="
        displayData.stage === 'loading' ||
        displayData.stage === 'generating' ||
        displayData.stage === 'syncing'
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
      <Result icon="success" :title="$t('agent.display.outlineOptimize.completed')" />
      <div class="result-info" :style="resultInfoStyle">
        <p>
          <strong>{{ $t('agent.display.outlineOptimize.operationLabel') }}:</strong>
          {{ getOperationLabel(displayData.operation) }}
        </p>
        <p v-if="displayData.nodePath">
          <strong>{{ $t('agent.display.outlineOptimize.nodePath') }}:</strong>
          {{ displayData.nodePath }}
        </p>
        <p v-if="displayData.nodeTitle">
          <strong>{{ $t('agent.display.outlineOptimize.nodeTitle') }}:</strong>
          {{ displayData.nodeTitle }}
        </p>
        <div v-if="displayData.childrenCount !== undefined" class="result-stat">
          <Badge class="bg-green-500 hover:bg-green-600 text-white">{{
            $t('agent.display.outlineOptimize.generatedChildrenCount', {
              count: displayData.childrenCount
            })
          }}</Badge>
        </div>
        <div v-if="displayData.totalChildrenCount !== undefined" class="result-stat">
          <Badge class="bg-green-500 hover:bg-green-600 text-white">{{
            $t('agent.display.outlineOptimize.totalChildrenCount', {
              count: displayData.totalChildrenCount
            })
          }}</Badge>
        </div>
        <div v-if="displayData.contentLength !== undefined" class="result-stat">
          <Badge variant="secondary">{{
            $t('agent.display.outlineOptimize.contentLength', { length: displayData.contentLength })
          }}</Badge>
        </div>
        <div v-if="displayData.totalContentCount !== undefined" class="result-stat">
          <Badge variant="secondary">{{
            $t('agent.display.outlineOptimize.totalContentCount', {
              count: displayData.totalContentCount
            })
          }}</Badge>
        </div>
      </div>

      <!-- 大纲树形结构显示 -->
      <div
        v-if="outlineTreeData && outlineTreeData.length > 0"
        class="outline-tree-section"
        :style="treeSectionStyle"
      >
        <div class="tree-header" :style="treeHeaderStyle">
          <el-icon><Document /></el-icon>
          <span>{{ $t('agent.display.outlineOptimize.outlineTree') }}</span>
        </div>
        <ScrollArea class="max-h-[400px]">
          <Tree
            :data="outlineTreeData"
            :props="{ children: 'children', label: 'label' }"
            default-expand-all
            class="outline-tree"
          >
            <template #default="{ node, data }">
              <div class="tree-node" :style="treeNodeStyle">
                <span class="node-label" :style="nodeLabelStyle">{{ data.label }}</span>
                <div class="node-info">
                  <Badge v-if="data.path" variant="secondary" class="text-xs" :style="nodeTagStyle">
                    {{ $t('agent.display.outlineOptimize.path') }}: {{ data.path }}
                  </Badge>
                  <Badge
                    v-if="data.titleLevel !== undefined"
                    class="bg-amber-500 hover:bg-amber-600 text-white text-xs"
                    :style="nodeTagStyle"
                  >
                    {{ $t('agent.display.outlineOptimize.level') }}: {{ data.titleLevel }}
                  </Badge>
                  <Badge
                    v-if="data.hasContent"
                    class="bg-green-500 hover:bg-green-600 text-white text-xs"
                    :style="nodeTagStyle"
                  >
                    {{ $t('agent.display.outlineOptimize.hasContent') }}
                  </Badge>
                  <Badge
                    v-if="data.childrenCount !== undefined"
                    class="text-xs"
                    :style="nodeTagStyle"
                  >
                    {{
                      $t('agent.display.outlineOptimize.childrenCount', {
                        count: data.childrenCount
                      })
                    }}
                  </Badge>
                </div>
              </div>
            </template>
          </Tree>
        </ScrollArea>
      </div>
    </div>

    <div v-else class="error-state">
      <Alert variant="destructive">
        <XCircle class="h-4 w-4" />
        <AlertTitle>{{
          displayData.error || $t('agent.display.outlineOptimize.error')
        }}</AlertTitle>
      </Alert>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { Loading, Document } from '@element-plus/icons-vue'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Alert, AlertTitle, AlertDescription } from '../../../components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Result } from '@renderer/components/ui/result'
import { Tree } from '@renderer/components/ui/tree'
import { XCircle } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { ToolDisplayComponentProps } from '../../../types/agent-tool'
import { useToolDisplayRealtime, parseToolData } from '../composables/useToolDisplayRealtime'
import { themeState } from '../../themes'
import type { DocumentOutlineNode } from '@/types'
import { getActiveDocumentInfoViaBroadcast } from '../document-broadcast-helper'
import { getWindowType } from '../../event-bus'
import { useWorkspace } from '../../../stores/workspace'

const { t } = useI18n()
const props = defineProps<ToolDisplayComponentProps>()
const workspace = useWorkspace()

const { realtimeData, realtimeStatus, realtimeProgress } = useToolDisplayRealtime(
  props.invocationId,
  props.data,
  props.status,
  props.progress
)

const outlineTree = ref<DocumentOutlineNode | null>(null)

const displayData = computed(() => {
  const data = realtimeData.value !== null ? realtimeData.value : props.data
  const parsed = parseToolData(data) as any

  if (parsed && typeof parsed === 'object') {
    // 根据status确定stage，优先使用数据中的stage，如果没有则根据status推断
    const getStage = (): 'loading' | 'generating' | 'syncing' | 'completed' | 'error' => {
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
    operation: undefined,
    success: undefined,
    error: undefined
  }
})

const getStageMessage = (stage: string) => {
  if (stage === 'loading') return t('agent.display.outlineOptimize.loading')
  if (stage === 'generating') return t('agent.display.outlineOptimize.generating')
  if (stage === 'syncing') return t('agent.display.outlineOptimize.syncing')
  return t('agent.display.outlineOptimize.processing')
}

const getOperationLabel = (operation: string) => {
  const labels: Record<string, string> = {
    generateChildren: t('agent.display.outlineOptimize.operation.generateChildren'),
    generateContent: t('agent.display.outlineOptimize.operation.generateContent'),
    generateChildrenChildren: t('agent.display.outlineOptimize.operation.generateChildrenChildren'),
    generateChildrenContent: t('agent.display.outlineOptimize.operation.generateChildrenContent')
  }
  return labels[operation] || operation
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

const resultInfoStyle = computed(() => ({
  marginTop: '16px',
  padding: '12px',
  backgroundColor: themeState.currentTheme.background,
  borderRadius: '6px',
  color: themeState.currentTheme.textColor
}))

const resultStatStyle = computed(() => ({
  marginTop: '8px'
}))

const treeSectionStyle = computed(() => ({
  marginTop: '20px',
  padding: '16px',
  backgroundColor: themeState.currentTheme.background,
  borderRadius: '8px',
  border: `1px solid ${themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`
}))

const treeHeaderStyle = computed(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '12px',
  paddingBottom: '12px',
  borderBottom: `1px solid ${themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
  color: themeState.currentTheme.textColor,
  fontWeight: 500,
  fontSize: '15px'
}))

const treeNodeStyle = computed(() => ({
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '4px',
  width: '100%',
  padding: '4px 0'
}))

const nodeLabelStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  fontSize: '14px',
  fontWeight: 500
}))

const nodeTagStyle = computed(() => ({
  marginRight: '4px'
}))

// 将 DocumentOutlineNode 转换为 el-tree 需要的格式
const convertNodeToTreeData = (node: DocumentOutlineNode): any => {
  const hasContent = node.text && node.text.trim().length > 0
  const childrenCount = node.children ? node.children.length : 0

  const treeNode: any = {
    label: node.title || t('agent.display.outlineOptimize.emptyTitle'),
    path: node.path,
    titleLevel: node.title_level,
    hasContent,
    childrenCount,
    children:
      node.children && node.children.length > 0
        ? node.children.map((child: DocumentOutlineNode) => convertNodeToTreeData(child))
        : undefined
  }

  return treeNode
}

// 获取大纲树数据
const loadOutlineTree = async () => {
  try {
    const windowType = getWindowType()
    let doc: any = null

    if (windowType === 'setting') {
      // 在设置窗口中，通过广播获取文档信息
      const docInfo = await getActiveDocumentInfoViaBroadcast()
      if (docInfo && docInfo.outline) {
        outlineTree.value = docInfo.outline
      }
    } else {
      // 在主窗口中，直接使用workspace
      const activeTabId = workspace.activeTabId.value
      if (activeTabId) {
        const doc = workspace.ensureDocument(activeTabId)
        if (doc && doc.outline) {
          outlineTree.value = doc.outline
        }
      }
    }
  } catch (error) {
    console.error('获取大纲树失败:', error)
  }
}

// 计算树形数据
const outlineTreeData = computed(() => {
  if (!outlineTree.value) {
    return []
  }

  // 只显示根节点的子节点（不显示虚拟根节点）
  if (outlineTree.value.children && outlineTree.value.children.length > 0) {
    return outlineTree.value.children.map((child: DocumentOutlineNode) =>
      convertNodeToTreeData(child)
    )
  }

  return []
})

// 监听完成状态，加载大纲树
watch(
  () => displayData.value.stage,
  (newStage) => {
    if (newStage === 'completed') {
      loadOutlineTree()
    }
  },
  { immediate: true }
)

onMounted(() => {
  if (displayData.value.stage === 'completed') {
    loadOutlineTree()
  }
})
</script>

<style scoped>
.outline-optimize-display {
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

.outline-tree-section {
  margin-top: 20px;
}

.tree-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid;
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

.error-state {
  padding: 12px;
}
</style>
