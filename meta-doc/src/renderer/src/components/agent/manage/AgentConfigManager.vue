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

    <CardGrid
      :items="configs"
      :loading="loading"
      :show-thumbnail="false"
      :get-item-id="(item) => item.id || ''"
      :get-item-title="(item) => getItemTitle(item as AgentConfig) || ''"
      :get-item-description="(item) => (item as AgentConfig).id === 'default-agent-config' ? '' : (getLocalizedText((item as AgentConfig).description) || '')"
      :get-item-meta="(item) => [
        t('agent.manage.agentConfig.toolCount') + ': ' + getAvailableToolCount((item as AgentConfig).id),
        item.enabled !== false ? t('agent.manage.enabled') : t('agent.manage.disabled')
      ]"
      :get-badge="(item) => (item as AgentConfig).id === 'default-agent-config' ? t('agent.manage.agentConfig.default') : null"
      :get-actions="(item) => getActions(item as AgentConfig)"
      :is-disabled="() => false"
      @item-click="(item) => handleEdit(item as AgentConfig)"
      @action="(cmd, item) => handleAction(cmd, item as AgentConfig)"
    />

    <!-- 创建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingConfig ? (editingConfig.id === 'default-agent-config' ? t('agent.manage.agentConfig.view') : t('agent.manage.agentConfig.edit')) : t('agent.manage.agentConfig.create')"
      width="700px"
      :style="dialogStyle"
    >
      <el-form :model="formData" label-width="140px">
        <el-form-item :label="t('agent.manage.agentConfig.name')" required>
          <el-input v-model="formData.name" :disabled="editingConfig?.id === 'default-agent-config'" />
        </el-form-item>
        <el-form-item :label="t('agent.manage.agentConfig.description')">
          <el-input v-model="formData.description" type="textarea" :rows="3" :disabled="editingConfig?.id === 'default-agent-config'" />
        </el-form-item>
        <el-form-item :label="t('agent.manage.agentConfig.toolCollections')" required>
          <el-select
            v-model="formData.toolCollectionIds"
            multiple
            filterable
            style="width: 100%"
            :placeholder="t('agent.manage.agentConfig.selectToolCollections')"
            :disabled="editingConfig?.id === 'default-agent-config'"
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
        <el-form-item :label="t('agent.manage.agentConfig.maxToolCalls')">
          <div style="display: flex; align-items: center; gap: 12px;">
            <el-input-number 
              v-model="formData.maxToolCalls" 
              :min="1" 
              :max="100" 
              :disabled="formData.unlimitedToolCalls"
            />
            <el-checkbox v-model="formData.unlimitedToolCalls">
              {{ t('agent.manage.agentConfig.unlimited') }}
            </el-checkbox>
          </div>
        </el-form-item>
        <el-form-item :label="t('agent.manage.agentConfig.systemPrompt')">
          <el-input
            v-model="formData.systemPrompt"
            type="textarea"
            :rows="8"
            :placeholder="t('agent.manage.agentConfig.systemPromptPlaceholder')"
            :disabled="editingConfig?.id === 'default-agent-config'"
          />
          <div class="form-hint">
            {{ t('agent.manage.agentConfig.systemPromptHint') }}
          </div>
        </el-form-item>
        <el-form-item :label="t('agent.manage.agentConfig.injectTimestamp')">
          <el-checkbox v-model="formData.injectTimestamp" :disabled="editingConfig?.id === 'default-agent-config'">
            {{ t('agent.manage.agentConfig.injectTimestampLabel') }}
          </el-checkbox>
          <div class="form-hint">
            {{ t('agent.manage.agentConfig.injectTimestampHint') }}
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button 
          type="primary" 
          @click="handleSave"
          :disabled="editingConfig?.id === 'default-agent-config'"
        >
          {{ editingConfig?.id === 'default-agent-config' ? t('agent.manage.agentConfig.viewOnly') : t('common.save') }}
        </el-button>
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
import CardGrid from '../../common/CardGrid.vue'
import type { CardGridAction, CardGridItem } from '../../common/CardGrid.vue'

const { t } = useI18n()

const configs = ref<AgentConfig[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const editingConfig = ref<AgentConfig | null>(null)

const formData = ref({
  name: '',
  description: '',
  toolCollectionIds: ['default-tool-set'] as string[], // 默认选择default工具集
  maxToolCalls: null as number | null,
  unlimitedToolCalls: true, // 默认无限次
  systemPrompt: '',
  injectTimestamp: true // 默认勾选时间戳
})

const availableCollections = computed(() => {
  return toolCollectionManager.getAllCollections()
})

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  padding: '20px'
}))

const getItemTitle = (item: AgentConfig): string => {
  return getLocalizedText(item.name) || item.id || ''
}

const getActions = (item: AgentConfig): CardGridAction[] => {
  const isDefault = item.id === 'default-agent-config'
  return [
    { command: 'view', label: isDefault ? t('agent.manage.agentConfig.view') : t('agent.manage.edit'), disabled: false },
    { command: 'edit', label: t('agent.manage.edit'), disabled: isDefault },
    { command: 'validate', label: t('agent.manage.validate') },
    { command: 'duplicate', label: t('agent.sessions.duplicate') },
    { command: 'export', label: t('agent.manage.export') },
    { command: 'delete', label: t('agent.manage.delete'), disabled: isDefault, danger: true }
  ]
}

const handleAction = async (command: string, config: AgentConfig) => {
  if (command === 'view') {
    handleView(config)
  } else if (command === 'edit') {
    handleEdit(config)
  } else if (command === 'validate') {
    handleValidate(config)
  } else if (command === 'duplicate') {
    await handleDuplicate(config)
  } else if (command === 'export') {
    handleExport(config)
  } else if (command === 'delete') {
    await handleDelete(config)
  }
}

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
    toolCollectionIds: ['default-tool-set'], // 默认选择default工具集
    maxToolCalls: null,
    unlimitedToolCalls: true, // 默认无限次
    systemPrompt: '',
    injectTimestamp: true // 默认勾选时间戳
  }
  dialogVisible.value = true
}

const handleView = (config: AgentConfig) => {
  editingConfig.value = config
  formData.value = {
    name: typeof config.name === 'string' ? config.name : config.name['zh_cn']?.name || '',
    description: typeof config.description === 'string' ? config.description : config.description['zh_cn']?.description || '',
    toolCollectionIds: [...config.toolCollectionIds],
    maxToolCalls: config.maxToolCalls ?? null,
    unlimitedToolCalls: config.maxToolCalls === null,
    systemPrompt: config.llmConfig?.systemPrompt || '',
    injectTimestamp: config.llmConfig?.injectTimestamp || false
  }
  dialogVisible.value = true
}

const handleEdit = (config: AgentConfig) => {
  if (config.id === 'default-agent-config') {
    handleView(config) // 默认配置使用查看模式
    return
  }
  editingConfig.value = config
  formData.value = {
    name: typeof config.name === 'string' ? config.name : config.name['zh_cn']?.name || '',
    description: typeof config.description === 'string' ? config.description : config.description['zh_cn']?.description || '',
    toolCollectionIds: [...config.toolCollectionIds],
    maxToolCalls: config.maxToolCalls ?? null,
    unlimitedToolCalls: config.maxToolCalls === null,
    systemPrompt: config.llmConfig?.systemPrompt || '',
    injectTimestamp: config.llmConfig?.injectTimestamp || false
  }
  dialogVisible.value = true
}

const handleSave = () => {
  if (!formData.value.name.trim()) {
    ElMessage.warning(t('agent.manage.agentConfig.nameRequired'))
    return
  }

  if (formData.value.toolCollectionIds.length === 0) {
    ElMessage.warning(t('agent.manage.agentConfig.toolCollectionRequired'))
    return
  }

  try {
    if (editingConfig.value) {
      // 更新（默认配置不允许保存）
      if (editingConfig.value.id === 'default-agent-config') {
        ElMessage.warning(t('agent.manage.agentConfig.cannotEditDefault'))
        return
      }
      
      agentConfigManager.updateConfig(editingConfig.value.id, {
        name: formData.value.name,
        description: formData.value.description,
        toolCollectionIds: formData.value.toolCollectionIds,
        maxToolCalls: formData.value.unlimitedToolCalls ? null : formData.value.maxToolCalls,
        llmConfig: {
          systemPrompt: formData.value.systemPrompt || undefined,
          injectTimestamp: formData.value.injectTimestamp || false
        }
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
        maxToolCalls: formData.value.unlimitedToolCalls ? null : formData.value.maxToolCalls,
        llmConfig: {
          systemPrompt: formData.value.systemPrompt || undefined,
          injectTimestamp: formData.value.injectTimestamp || false
        }
      })
      ElMessage.success(t('agent.manage.agentConfig.createSuccess'))
    }
    dialogVisible.value = false
    loadConfigs()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

const handleDuplicate = async (config: AgentConfig) => {
  try {
    const baseName = getLocalizedText(config.name) || config.id
    const newName = `${baseName} - ${t('agent.sessions.duplicate')}`
    const desc =
      typeof config.description === 'string'
        ? config.description
        : config.description['zh_cn']?.description ||
          config.description['en_us']?.description ||
          ''

    const duplicated = agentConfigManager.createConfig(
      newName,
      desc,
      [...config.toolCollectionIds]
    )

    // 继承行为和LLM配置等
    agentConfigManager.updateConfig(duplicated.id, {
      maxToolCalls: config.maxToolCalls ?? null,
      llmConfig: config.llmConfig,
      behavior: config.behavior,
      enabled: config.enabled,
      tags: config.tags
    })

    ElMessage.success(t('agent.sessions.duplicateSuccess'))
    loadConfigs()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}
const handleDelete = async (config: AgentConfig) => {
  if (config.id === 'default-agent-config') {
    ElMessage.warning(t('agent.manage.agentConfig.cannotDeleteDefault'))
    return
  }

  try {
    await ElMessageBox.confirm(
      t('agent.manage.agentConfig.confirmDelete', { name: getLocalizedText(config.name) }),
      t('common.confirm'),
      { type: 'warning' }
    )
    agentConfigManager.deleteConfig(config.id)
    ElMessage.success(t('agent.manage.agentConfig.deleteSuccess'))
    loadConfigs()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error instanceof Error ? error.message : String(error))
    }
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

