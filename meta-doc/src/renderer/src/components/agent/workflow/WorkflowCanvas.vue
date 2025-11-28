<template>
  <div class="workflow-canvas" :style="containerStyle">
    <div class="canvas-toolbar">
      <div class="toolbar-left">
        <el-button size="small" @click="handleAddArtifactNode('tool')">添加工具节点</el-button>
        <el-button size="small" @click="handleAddArtifactNode('llm-decision')">添加LLM决策</el-button>
        <el-button size="small" @click="handleAddArtifactNode('workflow')">添加工作流</el-button>
        <el-button size="small" @click="handleAddControlFlowNode('condition')">添加条件</el-button>
        <el-button size="small" @click="handleAddControlFlowNode('loop')">添加循环</el-button>
      </div>
      <div class="toolbar-right">
        <el-button size="small" @click="handleValidate">{{ t('agent.workflow.validate') }}</el-button>
        <el-button size="small" type="primary" @click="handleSave">{{ t('common.save') }}</el-button>
        <el-button size="small" @click="$emit('cancel')">{{ t('common.cancel') }}</el-button>
      </div>
    </div>
    <div class="canvas-content" ref="canvasContainer">
      <!-- 简化的画布实现 -->
      <!-- 实际应该集成draw.io或类似的图形库 -->
      <div class="canvas-placeholder">
        <el-empty :description="t('agent.workflow.canvasPlaceholder')" />
        <div class="canvas-nodes">
          <div
            v-for="node in allNodes"
            :key="node.id"
            class="canvas-node"
            :class="{ 'node-selected': selectedNodeId === node.id }"
            :style="getNodeStyle(node)"
            @click="selectNode(node.id)"
          >
            <div class="node-label">{{ node.label }}</div>
            <div class="node-type">{{ getNodeTypeLabel(node) }}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="canvas-properties" v-if="selectedNode">
      <h3>{{ t('agent.workflow.nodeProperties') }}</h3>
      <el-form :model="selectedNode" label-width="100px" size="small">
        <el-form-item label="ID">
          <el-input v-model="selectedNode.id" disabled />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="selectedNode.label" />
        </el-form-item>
        <el-form-item v-if="isArtifactNode(selectedNode)" label="工件ID">
          <el-input v-model="(selectedNode as any).artifactId" />
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { themeState } from '../../../utils/themes'
import { workflowManager } from '../../../utils/agent-framework'
import type { Workflow, ArtifactNode, ControlFlowNode } from '../../../types/agent-framework'

const props = defineProps<{
  workflow?: Workflow | null
}>()

const emit = defineEmits<{
  save: [workflow: Workflow]
  cancel: []
}>()

const { t } = useI18n()

const canvasContainer = ref<HTMLElement>()
const selectedNodeId = ref<string | null>(null)

const workflowData = ref<Workflow>(
  props.workflow || {
    entityType: 'workflow',
    id: '',
    name: '新工作流',
    description: '',
    version: '1.0.0',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    artifactNodes: [],
    controlFlowNodes: [],
    edges: [],
    entryNodeId: '',
    exitNodeIds: [],
    enabled: true
  }
)

const allNodes = computed(() => {
  return [...workflowData.value.artifactNodes, ...workflowData.value.controlFlowNodes]
})

const selectedNode = computed(() => {
  if (!selectedNodeId.value) return null
  return allNodes.value.find(n => n.id === selectedNodeId.value) || null
})

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  height: '100%',
  display: 'flex',
  flexDirection: 'column'
}))

const isArtifactNode = (node: ArtifactNode | ControlFlowNode): node is ArtifactNode => {
  return 'artifactId' in node
}

const getNodeTypeLabel = (node: ArtifactNode | ControlFlowNode): string => {
  if (isArtifactNode(node)) {
    return node.type
  }
  return node.type
}

const getNodeStyle = (node: ArtifactNode | ControlFlowNode) => {
  return {
    left: `${(node.position?.x || 0)}px`,
    top: `${(node.position?.y || 0)}px`
  }
}

const selectNode = (nodeId: string) => {
  selectedNodeId.value = nodeId
}

const handleAddArtifactNode = (type: ArtifactNode['type']) => {
  const node: ArtifactNode = {
    id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    artifactId: '',
    label: `新${type}节点`,
    position: { x: Math.random() * 400, y: Math.random() * 300 }
  }
  workflowData.value.artifactNodes.push(node)
  if (!workflowData.value.entryNodeId) {
    workflowData.value.entryNodeId = node.id
  }
}

const handleAddControlFlowNode = (type: ControlFlowNode['type']) => {
  const node: ControlFlowNode = {
    id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    label: `新${type}节点`,
    position: { x: Math.random() * 400, y: Math.random() * 300 },
    config: {}
  }
  workflowData.value.controlFlowNodes.push(node)
}

const handleValidate = () => {
  const validation = workflowManager.validateWorkflow(workflowData.value)
  if (validation.valid) {
    ElMessage.success(t('agent.workflow.validationSuccess'))
  } else {
    ElMessage.error(t('agent.workflow.validationFailed') + ': ' + validation.errors.join(', '))
  }
}

const handleSave = () => {
  if (!workflowData.value.entryNodeId) {
    ElMessage.warning(t('agent.workflow.entryNodeRequired'))
    return
  }
  emit('save', workflowData.value)
}

onMounted(() => {
  if (props.workflow) {
    workflowData.value = JSON.parse(JSON.stringify(props.workflow))
  }
})
</script>

<style scoped>
.workflow-canvas {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.canvas-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-bottom: 1px solid var(--el-border-color);
}

.toolbar-left,
.toolbar-right {
  display: flex;
  gap: 8px;
}

.canvas-content {
  flex: 1;
  position: relative;
  overflow: auto;
  background: var(--el-bg-color-page);
}

.canvas-placeholder {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 500px;
}

.canvas-nodes {
  position: relative;
  width: 100%;
  height: 100%;
}

.canvas-node {
  position: absolute;
  min-width: 120px;
  min-height: 60px;
  padding: 8px;
  background: var(--el-bg-color);
  border: 2px solid var(--el-border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.canvas-node:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.canvas-node.node-selected {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-8);
}

.node-label {
  font-weight: 500;
  margin-bottom: 4px;
}

.node-type {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.canvas-properties {
  width: 300px;
  padding: 16px;
  border-left: 1px solid var(--el-border-color);
  overflow-y: auto;
}

.canvas-properties h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
}
</style>

