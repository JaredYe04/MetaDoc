<template>
  <div class="agent-config-manager" :style="containerStyle">
    <div class="manager-header">
      <h2>{{ t('agent.manage.agentConfig.title') }}</h2>
      <div>
        <el-button @click="handleImport">{{ t('agent.manage.import') }}</el-button>
        <el-button type="primary" :icon="Plus" @click="handleCreate">
          {{ t('agent.manage.agentConfig.create') }}
        </el-button>
      </div>
    </div>

    <el-table
      :data="configs"
      border
      stripe
      :style="tableStyle"
      v-loading="loading"
    >
      <el-table-column prop="id" label="ID" width="200" />
      <el-table-column :label="t('agent.manage.agentConfig.name')" min-width="150">
        <template #default="{ row }">
          {{ getLocalizedText(row.name) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.manage.agentConfig.description')" min-width="200">
        <template #default="{ row }">
          {{ getLocalizedText(row.description) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.manage.agentConfig.scenario')" width="120">
        <template #default="{ row }">
          <el-tag size="small">{{ row.scenario || 'custom' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.manage.agentConfig.toolCount')" width="120">
        <template #default="{ row }">
          {{ getAvailableToolCount(row.id) }}
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
          <el-button size="small" @click="handleValidate(row)">{{ t('agent.manage.validate') }}</el-button>
          <el-button size="small" @click="handleExport(row)">{{ t('agent.manage.export') }}</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)">{{ t('agent.manage.delete') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingConfig ? t('agent.manage.agentConfig.edit') : t('agent.manage.agentConfig.create')"
      width="700px"
      :style="dialogStyle"
    >
      <el-form :model="formData" label-width="140px">
        <el-form-item :label="t('agent.manage.agentConfig.name')" required>
          <el-input v-model="formData.name" />
        </el-form-item>
        <el-form-item :label="t('agent.manage.agentConfig.description')">
          <el-input v-model="formData.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item :label="t('agent.manage.agentConfig.scenario')">
          <el-select v-model="formData.scenario" style="width: 100%">
            <el-option label="大纲" value="outline" />
            <el-option label="编辑器" value="editor" />
            <el-option label="分析" value="analysis" />
            <el-option label="可视化" value="visualization" />
            <el-option label="自定义" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('agent.manage.agentConfig.toolCollections')">
          <el-select
            v-model="formData.toolCollectionIds"
            multiple
            filterable
            style="width: 100%"
            :placeholder="t('agent.manage.agentConfig.selectToolCollections')"
          >
            <el-option
              v-for="collection in availableCollections"
              :key="collection.id"
              :label="getLocalizedText(collection.name)"
              :value="collection.id"
            />
          </el-select>
          <div class="form-hint">
            {{ t('agent.manage.agentConfig.toolCollectionHint') }}
          </div>
        </el-form-item>
        <el-form-item :label="t('agent.manage.agentConfig.llmModel')">
          <el-input v-model="formData.llmConfig.model" placeholder="gpt-4" />
        </el-form-item>
        <el-form-item :label="t('agent.manage.agentConfig.temperature')">
          <el-slider v-model="formData.llmConfig.temperature" :min="0" :max="2" :step="0.1" />
        </el-form-item>
        <el-form-item :label="t('agent.manage.agentConfig.systemPrompt')">
          <el-input
            v-model="formData.llmConfig.systemPrompt"
            type="textarea"
            :rows="4"
            placeholder="系统提示词..."
          />
        </el-form-item>
        <el-form-item :label="t('agent.manage.agentConfig.maxToolCalls')">
          <el-input-number v-model="formData.behavior.maxToolCalls" :min="1" :max="100" />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="formData.behavior.allowToolCalls">
            {{ t('agent.manage.agentConfig.allowToolCalls') }}
          </el-checkbox>
          <el-checkbox v-model="formData.behavior.allowWorkflowCalls">
            {{ t('agent.manage.agentConfig.allowWorkflowCalls') }}
          </el-checkbox>
          <el-checkbox v-model="formData.behavior.enableThoughts">
            {{ t('agent.manage.agentConfig.enableThoughts') }}
          </el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleSave">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { themeState } from '../../../utils/themes'
import { agentConfigManager, toolCollectionManager } from '../../../utils/agent-framework'
import type { AgentConfig } from '../../../types/agent-framework'
import type { LocalizedText } from '../../../types/agent-tool'

const { t } = useI18n()

const configs = ref<AgentConfig[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const editingConfig = ref<AgentConfig | null>(null)

const formData = ref({
  name: '',
  description: '',
  scenario: 'custom' as AgentConfig['scenario'],
  toolCollectionIds: [] as string[],
  llmConfig: {
    model: '',
    temperature: 0.7,
    maxTokens: 2000,
    systemPrompt: ''
  },
  behavior: {
    allowToolCalls: true,
    allowWorkflowCalls: true,
    maxToolCalls: 10,
    enableThoughts: false
  }
})

const availableCollections = computed(() => {
  return toolCollectionManager.getAllCollections()
})

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

const getAvailableToolCount = (configId: string): number => {
  return agentConfigManager.getAvailableToolIds(configId).length
}

const loadConfigs = () => {
  loading.value = true
  try {
    configs.value = agentConfigManager.getAllConfigs()
  } finally {
    loading.value = false
  }
}

const handleCreate = () => {
  editingConfig.value = null
  formData.value = {
    name: '',
    description: '',
    scenario: 'custom',
    toolCollectionIds: [],
    llmConfig: {
      model: '',
      temperature: 0.7,
      maxTokens: 2000,
      systemPrompt: ''
    },
    behavior: {
      allowToolCalls: true,
      allowWorkflowCalls: true,
      maxToolCalls: 10,
      enableThoughts: false
    }
  }
  dialogVisible.value = true
}

const handleEdit = (config: AgentConfig) => {
  editingConfig.value = config
  formData.value = {
    name: typeof config.name === 'string' ? config.name : config.name['zh_cn']?.name || '',
    description: typeof config.description === 'string' ? config.description : config.description['zh_cn']?.description || '',
    scenario: config.scenario || 'custom',
    toolCollectionIds: [...config.toolCollectionIds],
    llmConfig: {
      model: config.llmConfig?.model || '',
      temperature: config.llmConfig?.temperature ?? 0.7,
      maxTokens: config.llmConfig?.maxTokens ?? 2000,
      systemPrompt: config.llmConfig?.systemPrompt || ''
    },
    behavior: {
      allowToolCalls: config.behavior?.allowToolCalls ?? true,
      allowWorkflowCalls: config.behavior?.allowWorkflowCalls ?? true,
      maxToolCalls: config.behavior?.maxToolCalls ?? 10,
      enableThoughts: config.behavior?.enableThoughts ?? false
    }
  }
  dialogVisible.value = true
}

const handleSave = () => {
  if (!formData.value.name.trim()) {
    ElMessage.warning(t('agent.manage.agentConfig.nameRequired'))
    return
  }

  try {
    if (editingConfig.value) {
      // 更新
      agentConfigManager.updateConfig(editingConfig.value.id, {
        name: formData.value.name,
        description: formData.value.description,
        scenario: formData.value.scenario,
        toolCollectionIds: formData.value.toolCollectionIds,
        llmConfig: formData.value.llmConfig,
        behavior: formData.value.behavior
      })
      ElMessage.success(t('agent.manage.agentConfig.updateSuccess'))
    } else {
      // 创建
      const created = agentConfigManager.createConfig(
        formData.value.name,
        formData.value.description,
        formData.value.toolCollectionIds
      )
      agentConfigManager.updateConfig(created.id, {
        scenario: formData.value.scenario,
        llmConfig: formData.value.llmConfig,
        behavior: formData.value.behavior
      })
      ElMessage.success(t('agent.manage.agentConfig.createSuccess'))
    }
    dialogVisible.value = false
    loadConfigs()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

const handleDelete = async (config: AgentConfig) => {
  try {
    await ElMessageBox.confirm(
      t('agent.manage.agentConfig.confirmDelete', { name: getLocalizedText(config.name) }),
      t('common.confirm'),
      { type: 'warning' }
    )
    agentConfigManager.deleteConfig(config.id)
    ElMessage.success(t('agent.manage.agentConfig.deleteSuccess'))
    loadConfigs()
  } catch {
    // 用户取消
  }
}

const handleValidate = (config: AgentConfig) => {
  const validation = agentConfigManager.validateConfig(config)
  if (validation.valid) {
    if (validation.warnings.length > 0) {
      ElMessage.warning(t('agent.manage.agentConfig.validationWarnings') + ': ' + validation.warnings.join(', '))
    } else {
      ElMessage.success(t('agent.manage.agentConfig.validationSuccess'))
    }
  } else {
    ElMessage.error(t('agent.manage.agentConfig.validationFailed') + ': ' + validation.errors.join(', '))
  }
}

const handleExport = (config: AgentConfig) => {
  try {
    const entity = agentConfigManager.exportConfig(config.id, true)
    if (entity) {
      const json = JSON.stringify(entity, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `agent-config-${config.id}.json`
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
      agentConfigManager.importConfig(entity, true)
      ElMessage.success(t('agent.manage.importSuccess'))
      loadConfigs()
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : String(error))
    }
  }
  input.click()
}

onMounted(() => {
  loadConfigs()
})
</script>

<style scoped>
.agent-config-manager {
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

.form-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
</style>

