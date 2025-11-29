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

    <el-scrollbar class="workflow-list-scroll">
      <div class="workflow-grid" v-loading="loading">
        <div
          v-for="workflow in workflows"
          :key="workflow.id"
          class="workflow-card"
          @click="handleEdit(workflow)"
        >
          <div class="workflow-card__image" :class="{ 'is-placeholder': !workflowThumbnails[workflow.id] }">
            <img
              v-if="workflowThumbnails[workflow.id]"
              :src="workflowThumbnails[workflow.id]"
              :alt="getLocalizedText(workflow.name)"
            />
            <div v-else class="workflow-card__placeholder">
              <el-icon><Document /></el-icon>
            </div>
            <div v-if="workflow.isBuiltIn" class="workflow-card__badge">
              <el-tag size="small" type="info">{{ t('agent.manage.workflow.builtIn') }}</el-tag>
            </div>
          </div>
          <div class="workflow-card__body">
            <h3>{{ getLocalizedText(workflow.name) }}</h3>
            <p>{{ getLocalizedText(workflow.description) }}</p>
            <div class="workflow-card__meta">
              <el-tag size="small" effect="plain">
                {{ workflow.version }}
              </el-tag>
              <el-tag size="small" effect="plain">
                {{ workflow.artifactNodes.length + workflow.controlFlowNodes.length }} {{ t('agent.manage.workflow.nodes') }}
              </el-tag>
              <el-tag
                size="small"
                :type="workflow.enabled !== false ? 'success' : 'info'"
                effect="plain"
              >
                {{ workflow.enabled !== false ? t('agent.manage.enabled') : t('agent.manage.disabled') }}
              </el-tag>
            </div>
          </div>
          <div class="workflow-card__actions" @click.stop>
            <el-dropdown trigger="click" @command="(cmd: string) => handleAction(cmd, workflow)">
              <el-button text circle :icon="More" size="small" />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit" :disabled="workflow.isBuiltIn">
                    {{ t('agent.manage.edit') }}
                  </el-dropdown-item>
                  <el-dropdown-item command="validate">
                    {{ t('agent.manage.workflow.validate') }}
                  </el-dropdown-item>
                  <el-dropdown-item command="duplicate">
                    {{ t('agent.sessions.duplicate') }}
                  </el-dropdown-item>
                  <el-dropdown-item command="export">
                    {{ t('agent.manage.export') }}
                  </el-dropdown-item>
                  <el-dropdown-item divided command="delete" :disabled="workflow.isBuiltIn" class="danger">
                    {{ t('agent.manage.delete') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </div>
    </el-scrollbar>

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
          :read-only="editingWorkflow?.isBuiltIn || false"
          @save="handleCanvasSave"
          @cancel="canvasVisible = false"
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, More, Document } from '@element-plus/icons-vue'
import { themeState } from '../../../utils/themes'
import { workflowManager } from '../../../utils/agent-framework'
import type { Workflow } from '../../../types/agent-framework'
import type { LocalizedText } from '../../../types/agent-tool'
import { getWorkflowThumbnail } from '../../../utils/agent-framework/workflow-thumbnail'
// @ts-ignore - Vue组件类型声明
import WorkflowCanvas from '../workflow/WorkflowCanvas.vue'

const { t } = useI18n()

const workflows = ref<Workflow[]>([])
const loading = ref(false)
const canvasVisible = ref(false)
const editingWorkflow = ref<Workflow | null>(null)
const workflowThumbnails = ref<Record<string, string>>({})
const loadingThumbnails = ref<Record<string, boolean>>({})

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  padding: '20px',
  height: '100%',
  display: 'flex',
  flexDirection: 'column' as const
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
    // 加载缩略图
    loadThumbnails()
  } finally {
    loading.value = false
  }
}

const loadThumbnails = async () => {
  for (const workflow of workflows.value) {
    if (!loadingThumbnails.value[workflow.id] && !workflowThumbnails.value[workflow.id]) {
      loadingThumbnails.value[workflow.id] = true
      try {
        const thumbnail = await getWorkflowThumbnail(workflow)
        workflowThumbnails.value[workflow.id] = thumbnail
      } catch (error) {
        console.error(`加载工作流 ${workflow.id} 缩略图失败:`, error)
      } finally {
        loadingThumbnails.value[workflow.id] = false
      }
    }
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

const handleAction = async (action: string, workflow: Workflow) => {
  if (action === 'edit') {
    handleEdit(workflow)
  } else if (action === 'validate') {
    handleValidate(workflow)
  } else if (action === 'duplicate') {
    await handleDuplicate(workflow)
  } else if (action === 'export') {
    handleExport(workflow)
  } else if (action === 'delete') {
    await handleDelete(workflow)
  }
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
  if (workflow.isBuiltIn) {
    ElMessage.warning(t('agent.manage.workflow.cannotDeleteBuiltIn'))
    return
  }
  
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

const handleDuplicate = async (workflow: Workflow) => {
  try {
    const baseName = getLocalizedText(workflow.name) || workflow.id
    const newNameZh = `${baseName} - ${t('agent.sessions.duplicate')}`

    const newName: LocalizedText =
      typeof workflow.name === 'string'
        ? {
            zh_cn: { name: newNameZh },
            en_us: { name: `${workflow.name} - Copy` }
          }
        : {
            ...workflow.name,
            zh_cn: { name: newNameZh },
            en_us: {
              name:
                (workflow.name['en_us']?.name || baseName) +
                ' - Copy'
            }
          }

    const description = workflow.description

    const created = await workflowManager.createWorkflow(
      newName as any,
      description as any,
      workflow.entryNodeId,
      workflow.exitNodeIds
    )

    await workflowManager.updateWorkflow(created.id, {
      artifactNodes: workflow.artifactNodes,
      controlFlowNodes: workflow.controlFlowNodes,
      edges: workflow.edges,
      variables: workflow.variables,
      config: workflow.config,
      enabled: workflow.enabled,
      tags: workflow.tags,
      isBuiltIn: false
    })

    ElMessage.success(t('agent.sessions.duplicateSuccess'))
    loadWorkflows()
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

watch(() => workflows.value, () => {
  loadThumbnails()
}, { deep: true })

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

.workflow-list-scroll {
  flex: 1;
  min-height: 0;
}

.workflow-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  padding: 4px;
}

.workflow-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  background-color: var(--el-fill-color-blank);
  position: relative;
}

.workflow-card:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
}

.workflow-card__image {
  position: relative;
  padding-top: 60%;
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.1), rgba(64, 158, 255, 0.05));
  display: flex;
  align-items: center;
  justify-content: center;
}

.workflow-card__image img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: transparent;
}

.workflow-card__image.is-placeholder {
  background: linear-gradient(135deg, rgba(144, 147, 153, 0.15), rgba(144, 147, 153, 0.05));
}

.workflow-card__placeholder {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  color: rgba(144, 147, 153, 0.8);
}

.workflow-card__badge {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 1;
}

.workflow-card__body {
  padding: 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workflow-card__body h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-card__body p {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.workflow-card__meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: auto;
}

.workflow-card__actions {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
}

.workflow-card__actions :deep(.el-button) {
  background-color: transparent;
  border: none;
}

.workflow-canvas-container {
  height: 70vh;
  min-height: 500px;
}

:deep(.el-dropdown-menu__item.danger) {
  color: var(--el-color-danger);
}
</style>
