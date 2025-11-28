<template>
  <div class="workflow-manager" :style="containerStyle">
    <div class="manager-header">
      <h2>{{ t('agent.manage.workflow.title') }}</h2>
      <div>
        <el-button @click="handleImport">{{ t('agent.manage.import') }}</el-button>
        <el-button type="primary" :icon="Plus" @click="handleCreate">
          {{ t('agent.manage.workflow.create') }}
        </el-button>
      </div>
    </div>

    <el-table
      :data="workflows"
      border
      stripe
      :style="tableStyle"
      v-loading="loading"
    >
      <el-table-column prop="id" label="ID" width="200" />
      <el-table-column :label="t('agent.manage.workflow.name')" min-width="150">
        <template #default="{ row }">
          {{ getLocalizedText(row.name) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.manage.workflow.description')" min-width="200">
        <template #default="{ row }">
          {{ getLocalizedText(row.description) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.manage.workflow.version')" width="100">
        <template #default="{ row }">
          {{ row.version }}
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.manage.workflow.nodeCount')" width="120">
        <template #default="{ row }">
          {{ row.artifactNodes.length + row.controlFlowNodes.length }}
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.manage.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="row.enabled !== false ? 'success' : 'info'" size="small">
            {{ row.enabled !== false ? t('agent.manage.enabled') : t('agent.manage.disabled') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.manage.actions')" width="250" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="handleEdit(row)">{{ t('agent.manage.edit') }}</el-button>
          <el-button size="small" @click="handleValidate(row)">{{ t('agent.manage.workflow.validate') }}</el-button>
          <el-button size="small" @click="handleExport(row)">{{ t('agent.manage.export') }}</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)">{{ t('agent.manage.delete') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 工作流画布对话框 -->
    <el-dialog
      v-model="canvasVisible"
      :title="editingWorkflow ? t('agent.manage.workflow.edit') : t('agent.manage.workflow.create')"
      width="90%"
      :style="dialogStyle"
      :close-on-click-modal="false"
    >
      <div class="workflow-canvas-container">
        <WorkflowCanvas
          v-if="canvasVisible"
          :workflow="editingWorkflow"
          @save="handleCanvasSave"
          @cancel="canvasVisible = false"
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { themeState } from '../../../utils/themes'
import { workflowManager } from '../../../utils/agent-framework'
import type { Workflow } from '../../../types/agent-framework'
import type { LocalizedText } from '../../../types/agent-tool'
// @ts-ignore - Vue组件类型声明
import WorkflowCanvas from '../workflow/WorkflowCanvas.vue'

const { t } = useI18n()

const workflows = ref<Workflow[]>([])
const loading = ref(false)
const canvasVisible = ref(false)
const editingWorkflow = ref<Workflow | null>(null)

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  padding: '20px'
}))

const tableStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd
}))

const dialogStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const getLocalizedText = (text: LocalizedText): string => {
  if (typeof text === 'string') {
    return text
  }
  return text['zh_cn']?.name || text['en_us']?.name || ''
}

const loadWorkflows = () => {
  loading.value = true
  try {
    workflows.value = workflowManager.getAllWorkflows()
  } finally {
    loading.value = false
  }
}

const handleCreate = () => {
  editingWorkflow.value = null
  canvasVisible.value = true
}

const handleEdit = (workflow: Workflow) => {
  editingWorkflow.value = workflow
  canvasVisible.value = true
}

const handleCanvasSave = async (workflow: Workflow) => {
  try {
    if (editingWorkflow.value) {
      await workflowManager.updateWorkflow(editingWorkflow.value.id, workflow)
      ElMessage.success(t('agent.manage.workflow.updateSuccess'))
    } else {
      // 创建新工作流
      const created = await workflowManager.createWorkflow(
        workflow.name,
        workflow.description,
        workflow.entryNodeId,
        workflow.exitNodeIds
      )
      // 更新为新创建的工作流
      await workflowManager.updateWorkflow(created.id, workflow)
      ElMessage.success(t('agent.manage.workflow.createSuccess'))
    }
    canvasVisible.value = false
    loadWorkflows()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

const handleDelete = async (workflow: Workflow) => {
  try {
    await ElMessageBox.confirm(
      t('agent.manage.workflow.confirmDelete', { name: getLocalizedText(workflow.name) }),
      t('common.confirm'),
      { type: 'warning' }
    )
    await workflowManager.deleteWorkflow(workflow.id)
    ElMessage.success(t('agent.manage.workflow.deleteSuccess'))
    loadWorkflows()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error instanceof Error ? error.message : String(error))
    }
  }
}

const handleValidate = (workflow: Workflow) => {
  const validation = workflowManager.validateWorkflow(workflow)
  if (validation.valid) {
    ElMessage.success(t('agent.manage.workflow.validationSuccess'))
  } else {
    ElMessage.error(t('agent.manage.workflow.validationFailed') + ': ' + validation.errors.join(', '))
  }
}

const handleExport = (workflow: Workflow) => {
  try {
    const entity = workflowManager.exportWorkflow(workflow.id, true)
    if (entity) {
      const json = JSON.stringify(entity, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `workflow-${workflow.id}.json`
      a.click()
      URL.revokeObjectURL(url)
      ElMessage.success(t('agent.manage.exportSuccess'))
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

const handleImport = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const entity = JSON.parse(text)
      workflowManager.importWorkflow(entity, true)
      ElMessage.success(t('agent.manage.importSuccess'))
      loadWorkflows()
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : String(error))
    }
  }
  input.click()
}

onMounted(() => {
  loadWorkflows()
})
</script>

<style scoped>
.workflow-manager {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.manager-header h2 {
  margin: 0;
}

.workflow-canvas-container {
  height: 70vh;
  min-height: 500px;
}
</style>

