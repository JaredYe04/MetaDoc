<template>
  <div class="workflow-canvas" :style="containerStyle">
    <!-- 工具栏：工具模式 + 节点创建按钮 -->
    <div class="canvas-toolbar">
      <div class="toolbar-left">
        <!-- 工具模式切换 -->
        <div v-if="!props.readOnly" class="flex items-center gap-0">
          <Button
            size="sm"
            :type="toolMode === 'pointer' ? 'primary' : 'default'"
            @click="toolMode = 'pointer'"
            :title="t('agent.workflow.toolbar.pointer')"
          >
            <Pointer />
          </Button>
          <Button
            size="sm"
            :type="toolMode === 'select' ? 'primary' : 'default'"
            @click="toolMode = 'select'"
            :title="t('agent.workflow.toolbar.select')"
          >
            <SelectIcon />
          </Button>
          <Button
            size="sm"
            :type="toolMode === 'pan' ? 'primary' : 'default'"
            @click="toolMode = 'pan'"
            :title="t('agent.workflow.toolbar.pan')"
          >
            <Rank />
          </Button>
          <Button
            size="sm"
            :type="toolMode === 'text-edit' ? 'primary' : 'default'"
            @click="toolMode = 'text-edit'"
            :title="t('agent.workflow.toolbar.textEdit')"
          >
            <Edit />
          </Button>
          <Button
            size="sm"
            :type="toolMode === 'delete' ? 'primary' : 'default'"
            @click="toolMode = 'delete'"
            :title="t('agent.workflow.toolbar.delete')"
          >
            <Delete />
          </Button>
        </div>

        <Divider v-if="!props.readOnly" orientation="vertical" class="mx-2" />

        <!-- 节点创建按钮（支持拖拽） -->
        <div v-if="!props.readOnly" class="node-toolbar">
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <div class="flex items-center gap-0">
                <Button
                  size="sm"
                  draggable="true"
                  @dragstart="(e) => handleNodeDragStart(e, 'tool')"
                  @dragend="handleNodeDragEnd"
                  @click="handleAddArtifactNode('tool')"
                >
                  {{ t('agent.workflow.addTool') }}
                </Button>
                <Button
                  size="sm"
                  draggable="true"
                  @dragstart="(e) => handleNodeDragStart(e, 'llm-decision')"
                  @dragend="handleNodeDragEnd"
                  @click="handleAddArtifactNode('llm-decision')"
                >
                  {{ t('agent.workflow.addLLM') }}
                </Button>
                <Button
                  size="sm"
                  draggable="true"
                  @dragstart="(e) => handleNodeDragStart(e, 'workflow')"
                  @dragend="handleNodeDragEnd"
                  @click="handleAddArtifactNode('workflow')"
                >
                  {{ t('agent.workflow.addWorkflow') }}
                </Button>
                <Button
                  size="sm"
                  draggable="true"
                  @dragstart="(e) => handleNodeDragStart(e, 'agent-config')"
                  @dragend="handleNodeDragEnd"
                  @click="handleAddArtifactNode('agent-config')"
                >
                  {{ t('agent.workflow.addAgent') }}
                </Button>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                v-for="tool in availableTools"
                :key="tool.config.id"
                @click="handleDragNodeCreate(tool.config.id)"
              >
                {{ agentToolManager.getLocalizedText(tool.config.name) }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div class="flex items-center gap-0" style="margin-left: 8px">
            <Button
              size="sm"
              draggable="true"
              @dragstart="(e) => handleNodeDragStart(e, 'condition', false)"
              @dragend="handleNodeDragEnd"
              @click="handleAddControlFlowNode('condition')"
            >
              {{ t('agent.workflow.addCondition') }}
            </Button>
            <Button
              size="sm"
              draggable="true"
              @dragstart="(e) => handleNodeDragStart(e, 'loop', false)"
              @dragend="handleNodeDragEnd"
              @click="handleAddControlFlowNode('loop')"
            >
              {{ t('agent.workflow.addLoop') }}
            </Button>
            <Button
              size="sm"
              draggable="true"
              @dragstart="(e) => handleNodeDragStart(e, 'parallel', false)"
              @dragend="handleNodeDragEnd"
              @click="handleAddControlFlowNode('parallel')"
            >
              {{ t('agent.workflow.addParallel') }}
            </Button>
            <Button
              size="sm"
              draggable="true"
              @dragstart="(e) => handleNodeDragStart(e, 'merge', false)"
              @dragend="handleNodeDragEnd"
              @click="handleAddControlFlowNode('merge')"
            >
              {{ t('agent.workflow.addMerge') }}
            </Button>
            <Button
              size="sm"
              draggable="true"
              @dragstart="(e) => handleNodeDragStart(e, 'async', false)"
              @dragend="handleNodeDragEnd"
              @click="handleAddControlFlowNode('async')"
            >
              {{ t('agent.workflow.addAsync') }}
            </Button>
            <Button
              size="sm"
              draggable="true"
              @dragstart="(e) => handleNodeDragStart(e, 'aggregate', false)"
              @dragend="handleNodeDragEnd"
              @click="handleAddControlFlowNode('aggregate')"
            >
              {{ t('agent.workflow.addAggregate') }}
            </Button>
          </div>
        </div>
      </div>

      <div class="toolbar-center">
        <!-- 视图切换 -->
        <RadioGroup v-model="viewMode" class="flex">
          <div class="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
            <div class="flex items-center">
              <RadioGroupItem value="graph" id="view-graph" class="sr-only peer" />
              <label for="view-graph" class="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all cursor-pointer peer-data-[state=checked]:bg-background peer-data-[state=checked]:text-foreground peer-data-[state=checked]:shadow">
                {{ t('agent.workflow.viewMode.graph') }}
              </label>
            </div>
            <div class="flex items-center">
              <RadioGroupItem value="code" id="view-code" class="sr-only peer" />
              <label for="view-code" class="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all cursor-pointer peer-data-[state=checked]:bg-background peer-data-[state=checked]:text-foreground peer-data-[state=checked]:shadow">
                {{ t('agent.workflow.viewMode.code') }}
              </label>
            </div>
          </div>
        </RadioGroup>
      </div>

      <div class="toolbar-right">
        <!-- 编辑操作 -->
        <div v-if="!props.readOnly" class="flex items-center gap-0">
          <Button
            size="sm"
            @click="handleCopy"
            :disabled="!hasSelection"
            :title="t('agent.workflow.toolbar.copy')"
          >
            <CopyDocument />
          </Button>
          <Button
            size="sm"
            @click="handlePaste"
            :disabled="!clipboardData"
            :title="t('agent.workflow.toolbar.paste')"
          >
            <DocumentCopy />
          </Button>
          <Button
            size="sm"
            @click="handleDelete"
            :disabled="!hasSelection"
            :title="t('agent.workflow.toolbar.delete')"
          >
            <Delete />
          </Button>
        </div>

        <Divider orientation="vertical" class="mx-2" />

        <!-- 缩放控制 -->
        <div class="flex items-center gap-0">
          <Button
            size="sm"
            @click="handleZoomOut"
            :title="t('agent.workflow.toolbar.zoomOut')"
          >
            <ZoomOut />
          </Button>
          <Button
            size="sm"
            @click="handleZoomIn"
            :title="t('agent.workflow.toolbar.zoomIn')"
          >
            <ZoomIn />
          </Button>
          <Button
            size="sm"
            @click="handleZoomFit"
            :title="t('agent.workflow.toolbar.zoomFit')"
          >
            <FullScreen />
          </Button>
        </div>

        <Divider orientation="vertical" class="mx-2" />

        <Button size="sm" @click="handleValidate">{{
          t('agent.workflow.validate')
        }}</Button>
        <Button size="sm" type="primary" @click="handleSave" :disabled="props.readOnly">{{
          t('common.save')
        }}</Button>
        <Button size="sm" @click="$emit('cancel')">{{ t('common.cancel') }}</Button>
      </div>
    </div>

    <!-- 画布区域：图形视图或代码视图 -->
    <div class="canvas-content-wrapper">
      <!-- 图形视图 -->
      <div
        v-show="viewMode === 'graph'"
        class="canvas-content"
        ref="graphContainer"
        @drop="handleDrop"
        @dragover.prevent
        @dragenter.prevent
      >
        <MxGraphCanvas
          ref="mxGraphCanvas"
          :workflow="workflowData"
          :tool-mode="toolMode"
          @workflow-changed="handleWorkflowChanged"
          @node-added="handleNodeAdded"
          @node-removed="handleNodeRemoved"
          @node-updated="handleNodeUpdated"
          @node-selected="handleNodeSelected"
          @edge-added="handleEdgeAdded"
          @edge-removed="handleEdgeRemoved"
          @edge-updated="handleEdgeUpdated"
          @selection-changed="handleSelectionChanged"
        />
      </div>

      <!-- 代码视图 -->
      <div v-show="viewMode === 'code'" class="code-content">
        <WorkflowCodeEditor
          :workflow="workflowData"
          :read-only="props.readOnly"
          @workflow-changed="handleWorkflowChangedFromCode"
        />
      </div>
    </div>

    <!-- 属性面板 -->
    <div class="canvas-properties" v-if="selectedNode && viewMode === 'graph'">
      <h3>{{ t('agent.workflow.nodeProperties') }}</h3>
      <Form class="space-y-3">
        <FormField label="ID" name="nodeId">
          <Input :model-value="selectedNode.id" disabled class="w-full" />
        </FormField>
        <FormField :label="t('agent.workflow.nodeLabel')" name="nodeLabel">
          <Input v-model="selectedNodeForm.label" @change="handleNodeLabelChange" class="w-full" />
        </FormField>
        <FormField v-if="isArtifactNode(selectedNode)" :label="t('agent.workflow.artifactId')" name="artifactId">
          <Select
            v-if="selectedNode.type === 'tool'"
            v-model="selectedNodeForm.artifactId"
            @update:model-value="handleNodeArtifactIdChange"
          >
            <SelectTrigger style="width: 100%">
              <SelectValue :placeholder="t('agent.workflow.selectToolPlaceholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="tool in availableTools"
                :key="tool.config.id"
                :value="tool.config.id"
              >
                {{ agentToolManager.getLocalizedText(tool.config.name) }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select
            v-else-if="selectedNode.type === 'workflow'"
            v-model="selectedNodeForm.artifactId"
            @update:model-value="handleNodeArtifactIdChange"
          >
            <SelectTrigger style="width: 100%">
              <SelectValue :placeholder="t('agent.workflow.selectWorkflowPlaceholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="wf in availableWorkflows"
                :key="wf.id"
                :value="wf.id"
              >
                {{ getLocalizedText(wf.name) }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Input
            v-else
            v-model="selectedNodeForm.artifactId"
            @change="handleNodeArtifactIdChange"
            class="w-full"
          />
        </FormField>
        <FormField v-if="!isArtifactNode(selectedNode)" label="类型" name="nodeType">
          <Badge variant="outline">{{ (selectedNode as ControlFlowNode).type }}</Badge>
        </FormField>
      </Form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, h } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import {
  Pointer,
  Rank,
  Edit,
  Delete,
  CopyDocument,
  DocumentCopy,
  ZoomIn,
  ZoomOut,
  FullScreen
} from '@element-plus/icons-vue'
import { Select as SelectIcon } from '@element-plus/icons-vue'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Form, FormField } from '@renderer/components/ui/form'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from '@renderer/components/ui/dropdown-menu'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'
import { Badge } from '@renderer/components/ui/badge'
import { Divider } from '@renderer/components/ui/separator'
import { themeState } from '../../../utils/themes'
import { workflowManager, agentConfigManager } from '../../../utils/agent-framework'
import { agentToolManager } from '../../../utils/agent-tool-manager'
import type {
  Workflow,
  ArtifactNode,
  ControlFlowNode,
  WorkflowEdge,
  LocalizedText
} from '../../../types/agent-framework'
import type { LocalizedText as ToolLocalizedText } from '../../../types/agent-tool'
import MxGraphCanvas from './MxGraphCanvas.vue'
import WorkflowCodeEditor from './WorkflowCodeEditor.vue'

const props = defineProps<{
  workflow?: Workflow | null
  readOnly?: boolean
}>()

const emit = defineEmits<{
  save: [workflow: Workflow]
  cancel: []
}>()

const { t } = useI18n()

const mxGraphCanvas = ref<InstanceType<typeof MxGraphCanvas>>()
const graphContainer = ref<HTMLElement>()
const selectedNodeId = ref<string | null>(null)

// 工具模式：pointer, select, pan, text-edit, delete
const toolMode = ref<'pointer' | 'select' | 'pan' | 'text-edit' | 'delete'>('pointer')
const viewMode = ref<'graph' | 'code'>('graph')
const hasSelection = ref(false)
const clipboardData = ref<any>(null)
const draggingNodeType = ref<{ type: string; isArtifact: boolean } | null>(null)

// 可用工具和工作流
const availableTools = computed(() => agentToolManager.getAllTools())
const availableWorkflows = computed(() => workflowManager.getAllWorkflows())

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

const selectedNode = computed(() => {
  if (!selectedNodeId.value) return null
  const allNodes = [...workflowData.value.artifactNodes, ...workflowData.value.controlFlowNodes]
  return allNodes.find((n) => n.id === selectedNodeId.value) || null
})

const selectedNodeForm = computed({
  get() {
    if (!selectedNode.value) return { label: '', artifactId: '' }
    return {
      label: selectedNode.value.label || '',
      artifactId: isArtifactNode(selectedNode.value) ? selectedNode.value.artifactId || '' : ''
    }
  },
  set(val) {
    // Not used
  }
})

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  height: '100%',
  display: 'flex',
  flexDirection: 'column'
}))

const getLocalizedText = (text: LocalizedText): string => {
  if (typeof text === 'string') return text
  return text['zh_cn']?.name || text['en_us']?.name || ''
}

const isArtifactNode = (node: ArtifactNode | ControlFlowNode): node is ArtifactNode => {
  return 'artifactId' in node
}

// 确保新建工作流拥有默认的入口/出口节点
const ensureStartEndNodesForNewWorkflow = () => {
  // 仅在完全空白的新工作流上初始化，避免破坏已有工作流
  if (
    workflowData.value.artifactNodes.length > 0 ||
    workflowData.value.controlFlowNodes.length > 0 ||
    workflowData.value.edges.length > 0
  ) {
    return
  }

  const startId = 'start-node'
  const endId = 'end-node'

  if (!workflowData.value.controlFlowNodes.find((n) => n.type === 'start')) {
    const startNode: ControlFlowNode = {
      id: startId,
      type: 'start',
      label: '开始',
      position: { x: 80, y: 150 },
      config: {}
    }
    workflowData.value.controlFlowNodes.push(startNode)
  }

  if (!workflowData.value.controlFlowNodes.find((n) => n.type === 'end')) {
    const endNode: ControlFlowNode = {
      id: endId,
      type: 'end',
      label: '结束',
      position: { x: 600, y: 150 },
      config: {}
    }
    workflowData.value.controlFlowNodes.push(endNode)
  }

  if (!workflowData.value.entryNodeId) {
    workflowData.value.entryNodeId = startId
  }
  if (!workflowData.value.exitNodeIds || workflowData.value.exitNodeIds.length === 0) {
    workflowData.value.exitNodeIds = [endId]
  }
}

const handleDragNodeCreate = (toolId: string) => {
  if (!mxGraphCanvas.value) return
  // 在画布中心添加工具节点
  const graph = mxGraphCanvas.value.getGraph()
  const view = graph ? graph.getView() : null
  const containerRect = graphContainer.value?.getBoundingClientRect()
  let position = { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 }

  if (view && containerRect) {
    const scale = view.scale || 1
    const translate = view.translate || { x: 0, y: 0 }
    position = {
      x: (containerRect.width / 2 - translate.x * scale) / scale,
      y: (containerRect.height / 2 - translate.y * scale) / scale
    }
  }

  const nodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const tool = availableTools.value.find((t) => t.config.id === toolId)
  const label = tool ? agentToolManager.getLocalizedText(tool.config.name) : '工具节点'

  const cell = mxGraphCanvas.value.addNode('artifact', 'tool', label, position, nodeId)

  if (cell) {
    const node: ArtifactNode = {
      id: nodeId,
      type: 'tool',
      artifactId: toolId,
      label,
      position
    }
    workflowData.value.artifactNodes.push(node)
    if (!workflowData.value.entryNodeId) {
      workflowData.value.entryNodeId = nodeId
    }
  }
}

const handleNodeDragStart = (e: DragEvent, type: string, isArtifact: boolean = true) => {
  draggingNodeType.value = { type, isArtifact }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', JSON.stringify({ type, isArtifact }))
  }
}

const handleNodeDragEnd = () => {
  draggingNodeType.value = null
}

const handleDrop = (e: DragEvent) => {
  e.preventDefault()
  if (!mxGraphCanvas.value || !draggingNodeType.value) return

  const rect = graphContainer.value?.getBoundingClientRect()
  if (!rect) return

  const graph = mxGraphCanvas.value.getGraph()
  const view = graph ? graph.getView() : null
  if (!graph || !view) return

  const scale = view.scale || 1
  const translate = view.translate || { x: 0, y: 0 }

  // 计算画布坐标
  const x = (e.clientX - rect.left - translate.x * scale) / scale
  const y = (e.clientY - rect.top - translate.y * scale) / scale

  const { type, isArtifact } = draggingNodeType.value
  const nodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const label = getNodeTypeLabelByType(type, isArtifact)
  const position = { x, y }

  const cell = mxGraphCanvas.value.addNode(
    isArtifact ? 'artifact' : 'control-flow',
    type,
    label,
    position,
    nodeId
  )

  if (cell) {
    if (isArtifact) {
      const node: ArtifactNode = {
        id: nodeId,
        type: type as ArtifactNode['type'],
        artifactId: '',
        label,
        position
      }
      workflowData.value.artifactNodes.push(node)
      if (!workflowData.value.entryNodeId) {
        workflowData.value.entryNodeId = nodeId
      }
    } else {
      const node: ControlFlowNode = {
        id: nodeId,
        type: type as ControlFlowNode['type'],
        label,
        position,
        config: {}
      }
      workflowData.value.controlFlowNodes.push(node)
    }
  }

  draggingNodeType.value = null
}

const getNodeTypeLabelByType = (type: string, isArtifact: boolean): string => {
  if (isArtifact) {
    const labels: Record<string, string> = {
      tool: '工具节点',
      workflow: '工作流节点',
      'llm-decision': 'LLM决策',
      'agent-config': 'Agent配置'
    }
    return labels[type] || `新${type}节点`
  } else {
    const labels: Record<string, string> = {
      condition: '条件',
      loop: '循环',
      parallel: '并行',
      merge: '合并',
      async: '异步',
      aggregate: '汇总'
    }
    return labels[type] || `新${type}节点`
  }
}

const handleAddArtifactNode = (type: ArtifactNode['type']) => {
  if (!mxGraphCanvas.value) return

  const nodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const label = getNodeTypeLabelByType(type, true)
  const graph = mxGraphCanvas.value.getGraph()
  const view = graph ? graph.getView() : null
  const containerRect = graphContainer.value?.getBoundingClientRect()
  let position = { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 }

  if (view && containerRect) {
    const scale = view.scale || 1
    const translate = view.translate || { x: 0, y: 0 }
    position = {
      x: (containerRect.width / 2 - translate.x * scale) / scale,
      y: (containerRect.height / 2 - translate.y * scale) / scale
    }
  }

  const cell = mxGraphCanvas.value.addNode('artifact', type, label, position, nodeId)

  if (cell) {
    const node: ArtifactNode = {
      id: nodeId,
      type,
      artifactId: '',
      label,
      position
    }
    workflowData.value.artifactNodes.push(node)
    if (!workflowData.value.entryNodeId) {
      workflowData.value.entryNodeId = nodeId
    }
  }
}

const handleAddControlFlowNode = (type: ControlFlowNode['type']) => {
  if (!mxGraphCanvas.value) return

  const nodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const label = getNodeTypeLabelByType(type, false)
  const position = { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 }

  const cell = mxGraphCanvas.value.addNode('control-flow', type, label, position, nodeId)

  if (cell) {
    const node: ControlFlowNode = {
      id: nodeId,
      type,
      label,
      position,
      config: {}
    }
    workflowData.value.controlFlowNodes.push(node)
  }
}

const handleWorkflowChanged = (workflow: Workflow) => {
  workflowData.value = workflow
}

const handleWorkflowChangedFromCode = (workflow: Workflow) => {
  workflowData.value = workflow
  // 如果当前是代码视图，切换到图形视图
  if (viewMode.value === 'code') {
    viewMode.value = 'graph'
  }
}

const handleNodeAdded = (nodeId: string, nodeType: 'artifact' | 'control-flow') => {
  // 节点已通过addNode方法添加
}

const handleNodeSelected = (nodeId: string | null) => {
  selectedNodeId.value = nodeId
}

const handleNodeRemoved = (nodeId: string) => {
  // 保护入口/出口节点（start/end）不被删除
  const controlNode = workflowData.value.controlFlowNodes.find((n) => n.id === nodeId)
  if (controlNode && (controlNode.type === 'start' || controlNode.type === 'end')) {
    ElMessage.warning(t('agent.workflow.cannotDeleteStartEnd'))
    // 重新加载工作流到画布，恢复被误删的节点
    if (mxGraphCanvas.value) {
      mxGraphCanvas.value.loadWorkflow(workflowData.value, false)
    }
    return
  }

  workflowData.value.artifactNodes = workflowData.value.artifactNodes.filter((n) => n.id !== nodeId)
  workflowData.value.controlFlowNodes = workflowData.value.controlFlowNodes.filter(
    (n) => n.id !== nodeId
  )

  if (workflowData.value.entryNodeId === nodeId) {
    workflowData.value.entryNodeId = ''
  }
  workflowData.value.exitNodeIds = workflowData.value.exitNodeIds.filter((id) => id !== nodeId)
  workflowData.value.edges = workflowData.value.edges.filter(
    (e) => e.source !== nodeId && e.target !== nodeId
  )

  if (selectedNodeId.value === nodeId) {
    selectedNodeId.value = null
  }
}

const handleNodeUpdated = (nodeId: string, updates: Partial<ArtifactNode | ControlFlowNode>) => {
  const artifactIndex = workflowData.value.artifactNodes.findIndex((n) => n.id === nodeId)
  if (artifactIndex !== -1) {
    workflowData.value.artifactNodes[artifactIndex] = {
      ...workflowData.value.artifactNodes[artifactIndex],
      ...updates
    } as ArtifactNode
    return
  }

  const controlFlowIndex = workflowData.value.controlFlowNodes.findIndex((n) => n.id === nodeId)
  if (controlFlowIndex !== -1) {
    workflowData.value.controlFlowNodes[controlFlowIndex] = {
      ...workflowData.value.controlFlowNodes[controlFlowIndex],
      ...updates
    } as ControlFlowNode
  }
}

const handleEdgeAdded = (edge: WorkflowEdge) => {
  if (!workflowData.value.edges.find((e) => e.id === edge.id)) {
    workflowData.value.edges.push(edge)

    // 如果来自条件节点，为两条出边自动标记 true/false 语义
    const sourceNode = workflowData.value.controlFlowNodes.find(
      (n) => n.id === edge.source && n.type === 'condition'
    )
    if (sourceNode) {
      const outgoing = workflowData.value.edges.filter((e) => e.source === edge.source)
      const order = outgoing.length
      let label = ''
      if (order === 1) {
        label = 'true'
      } else if (order === 2) {
        label = 'false'
      }

      if (label) {
        const idx = workflowData.value.edges.findIndex((e) => e.id === edge.id)
        if (idx !== -1) {
          workflowData.value.edges[idx].label = label
        }

        // 同步更新画布中的边标签
        const graph = mxGraphCanvas.value?.getGraph?.()
        if (graph) {
          const cell = graph.getModel().getCell(edge.id)
          if (cell) {
            graph.getModel().beginUpdate()
            try {
              graph.cellLabelChanged(cell, label, false)
            } finally {
              graph.getModel().endUpdate()
            }
          }
        }
      }
    }
  }
}

const handleEdgeRemoved = (edgeId: string) => {
  workflowData.value.edges = workflowData.value.edges.filter((e) => e.id !== edgeId)
}

const handleEdgeUpdated = (edgeId: string, updates: Partial<WorkflowEdge>) => {
  const index = workflowData.value.edges.findIndex((e) => e.id === edgeId)
  if (index !== -1) {
    workflowData.value.edges[index] = {
      ...workflowData.value.edges[index],
      ...updates
    }
  }
}

const handleNodeLabelChange = () => {
  if (selectedNode.value && selectedNodeId.value) {
    handleNodeUpdated(selectedNodeId.value, { label: selectedNodeForm.value.label })
  }
}

const handleNodeArtifactIdChange = () => {
  if (selectedNode.value && isArtifactNode(selectedNode.value) && selectedNodeId.value) {
    handleNodeUpdated(selectedNodeId.value, { artifactId: selectedNodeForm.value.artifactId })
  }
}

const handleSelectionChanged = (hasSelectionValue: boolean) => {
  hasSelection.value = hasSelectionValue
}

const handleCopy = () => {
  if (!mxGraphCanvas.value) return
  const graph = mxGraphCanvas.value.getGraph()
  if (!graph) return

  const cells = graph.getSelectionCells()
  if (cells && cells.length > 0) {
    clipboardData.value = {
      cells: cells.map((cell: any) => ({
        nodeId: cell.nodeId,
        nodeType: cell.nodeType,
        type: cell.artifactType || cell.controlFlowType,
        label: cell.getValue()?.toString() || '',
        position: cell.getGeometry()
          ? {
              x: cell.getGeometry().x,
              y: cell.getGeometry().y
            }
          : null
      })),
      timestamp: Date.now()
    }
    graph.copy()
    ElMessage.success(t('agent.workflow.toolbar.copy') + ' ' + t('common.success'))
  }
}

const handlePaste = () => {
  if (!mxGraphCanvas.value || !clipboardData.value) return
  const graph = mxGraphCanvas.value.getGraph()
  if (!graph) return

  // 使用mxgraph的粘贴功能
  graph.paste()
  ElMessage.success(t('agent.workflow.toolbar.paste') + ' ' + t('common.success'))
}

const handleDelete = () => {
  if (!mxGraphCanvas.value) return
  const graph = mxGraphCanvas.value.getGraph()
  if (!graph) return

  const cells = graph.getSelectionCells()
  if (cells && cells.length > 0) {
    graph.removeCells(cells)
    ElMessage.success(t('agent.workflow.toolbar.delete') + ' ' + t('common.success'))
  }
}

const handleZoomIn = () => {
  if (!mxGraphCanvas.value) return
  const graph = mxGraphCanvas.value.getGraph()
  if (!graph) return
  graph.zoomIn()
}

const handleZoomOut = () => {
  if (!mxGraphCanvas.value) return
  const graph = mxGraphCanvas.value.getGraph()
  if (!graph) return
  graph.zoomOut()
}

const handleZoomFit = () => {
  if (!mxGraphCanvas.value) return
  const graph = mxGraphCanvas.value.getGraph()
  if (!graph) return
  graph.fit()
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

// 监听工具模式变化，更新画布行为
watch(
  () => toolMode.value,
  (newMode) => {
    if (!mxGraphCanvas.value) return
    mxGraphCanvas.value.setToolMode(newMode)
  }
)

// 监听视图模式变化，实现图形和代码的同步
watch(
  () => viewMode.value,
  async (newMode, oldMode) => {
    if (oldMode === null) return // 初始化时不触发

    if (oldMode === 'graph' && newMode === 'code') {
      // 从图形视图切换到代码视图：代码视图会从workflowData自动获取最新数据
      // 无需额外操作，WorkflowCodeEditor会监听workflowData变化
    } else if (oldMode === 'code' && newMode === 'graph') {
      // 从代码视图切换到图形视图：代码视图的更改已经通过handleWorkflowChangedFromCode更新到workflowData
      // 图形视图会通过watch自动更新
      // 这里可以触发一次图形视图的刷新以确保同步
      await nextTick()
      if (mxGraphCanvas.value) {
        mxGraphCanvas.value.loadWorkflow(workflowData.value, false)
      }
    }
  }
)

onMounted(() => {
  if (props.workflow) {
    workflowData.value = JSON.parse(JSON.stringify(props.workflow))
  } else {
    // 新建工作流：自动插入入口/出口节点
    ensureStartEndNodesForNewWorkflow()
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
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-left,
.toolbar-center,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-center {
  flex: 1;
  justify-content: center;
}

.node-toolbar {
  display: flex;
  gap: 8px;
}

.canvas-content-wrapper {
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;
}

.canvas-content {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: var(--el-bg-color-page);
}

.code-content {
  flex: 1;
  overflow: auto;
  background: var(--el-bg-color-page);
  padding: 16px;
}

.canvas-properties {
  width: 300px;
  padding: 16px;
  border-left: 1px solid var(--el-border-color);
  overflow-y: auto;
  background: var(--el-bg-color);
}

.canvas-properties h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
}

@media (max-width: 1200px) {
  .canvas-properties {
    width: 250px;
  }
}
</style>
