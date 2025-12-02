<template>
  <div class="agent-engine-manager" :style="containerStyle">
    <div class="manager-header">
      <h2>{{ t('agent.manage.agentEngine.title') }}</h2>
      <div>
        <el-button @click="handleImport">{{ t('agent.manage.import') }}</el-button>
        <el-button type="primary" :icon="Plus" @click="handleCreate">
          {{ t('agent.manage.agentEngine.create') }}
        </el-button>
      </div>
    </div>

    <CardGrid
      :items="engines"
      :loading="loading"
      :show-thumbnail="false"
      :get-item-id="(item) => item.id || ''"
      :get-item-title="(item) => getItemTitle(item as AgentEngine) || ''"
      :get-item-description="(item) => getLocalizedText((item as AgentEngine).description) || ''"
      :get-item-meta="(item) => [
        t('agent.manage.agentEngine.engineType') + ': ' + getEngineTypeLabel((item as AgentEngine).engineType),
        t('agent.manage.agentEngine.llmMode') + ': ' + getLlmModeLabel((item as AgentEngine).llmConfigMode),
        item.enabled !== false ? t('agent.manage.enabled') : t('agent.manage.disabled')
      ]"
      :get-badge="(item) => (item as AgentEngine).isBuiltIn ? t('agent.manage.agentEngine.builtIn') : null"
      :get-actions="(item) => getActions(item as AgentEngine)"
      :is-disabled="() => false"
      @item-click="(item) => handleEdit(item as AgentEngine)"
      @action="(cmd, item) => handleAction(cmd, item as AgentEngine)"
    />

    <!-- 创建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingEngine ? (editingEngine.isBuiltIn ? t('agent.manage.agentEngine.view') : t('agent.manage.agentEngine.edit')) : t('agent.manage.agentEngine.create')"
      width="800px"
      :style="dialogStyle"
    >
      <el-form :model="formData" label-width="160px">
        <el-form-item :label="t('agent.manage.agentEngine.name')" required>
          <el-input v-model="formData.name" :disabled="editingEngine?.isBuiltIn" />
        </el-form-item>
        <el-form-item :label="t('agent.manage.agentEngine.description')">
          <el-input v-model="formData.description" type="textarea" :rows="3" :disabled="editingEngine?.isBuiltIn" />
        </el-form-item>
        <el-form-item :label="t('agent.manage.agentEngine.engineType')" required>
          <el-select
            v-model="formData.engineType"
            :placeholder="t('agent.manage.agentEngine.selectEngineType')"
            :disabled="!!editingEngine"
            style="width: 100%"
          >
            <el-option
              :label="t('agent.manage.agentEngine.engineTypes.autogpt')"
              value="autogpt"
            />
            <el-option
              :label="t('agent.manage.agentEngine.engineTypes.react')"
              value="react"
            />
            <el-option
              :label="t('agent.manage.agentEngine.engineTypes.planExecute')"
              value="plan-execute"
            />
            <el-option
              :label="t('agent.manage.agentEngine.engineTypes.simpleChat')"
              value="simple-chat"
            />
            <el-option
              :label="t('agent.manage.agentEngine.engineTypes.workflow')"
              value="workflow"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('agent.manage.agentEngine.llmConfigMode')" required>
          <el-radio-group v-model="formData.llmConfigMode" :disabled="editingEngine?.isBuiltIn">
            <el-radio label="global">{{ t('agent.manage.agentEngine.useGlobalLLM') }}</el-radio>
            <el-radio label="custom">{{ t('agent.manage.agentEngine.useCustomLLM') }}</el-radio>
          </el-radio-group>
          <div class="form-hint">
            {{ t('agent.manage.agentEngine.llmConfigModeHint') }}
          </div>
        </el-form-item>
        <template v-if="formData.llmConfigMode === 'custom'">
          <el-form-item :label="t('agent.manage.agentEngine.apiBaseUrl')" required>
            <el-input
              v-model="formData.customLlmConfig.baseUrl"
              :placeholder="t('agent.manage.agentEngine.apiBaseUrlPlaceholder')"
              :disabled="editingEngine?.isBuiltIn"
            />
          </el-form-item>
          <el-form-item :label="t('agent.manage.agentEngine.apiKey')" required>
            <el-input
              v-model="formData.customLlmConfig.apiKey"
              type="password"
              :placeholder="t('agent.manage.agentEngine.apiKeyPlaceholder')"
              :disabled="editingEngine?.isBuiltIn"
            />
          </el-form-item>
          <el-form-item :label="t('agent.manage.agentEngine.model')" required>
            <el-input
              v-model="formData.customLlmConfig.model"
              :placeholder="t('agent.manage.agentEngine.modelPlaceholder')"
              :disabled="editingEngine?.isBuiltIn"
            />
          </el-form-item>
          <el-form-item :label="t('agent.manage.agentEngine.temperature')">
            <el-input-number
              v-model="formData.customLlmConfig.temperature"
              :min="0"
              :max="2"
              :step="0.1"
              :disabled="editingEngine?.isBuiltIn"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('agent.manage.agentEngine.maxTokens')">
            <el-input-number
              v-model="formData.customLlmConfig.maxTokens"
              :min="1"
              :max="100000"
              :disabled="editingEngine?.isBuiltIn"
              style="width: 100%"
            />
          </el-form-item>
        </template>
        <template v-if="formData.engineType === 'autogpt'">
          <el-divider />
          <el-form-item :label="t('agent.manage.agentEngine.maxIterations')">
            <el-input-number
              v-model="formData.engineConfig.maxIterations"
              :min="1"
              :max="100"
              :disabled="editingEngine?.isBuiltIn"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('agent.manage.agentEngine.enableReflection')">
            <el-switch
              v-model="formData.engineConfig.enableReflection"
              :disabled="editingEngine?.isBuiltIn"
            />
          </el-form-item>
          <el-form-item :label="t('agent.manage.agentEngine.enablePlanning')">
            <el-switch
              v-model="formData.engineConfig.enablePlanning"
              :disabled="editingEngine?.isBuiltIn"
            />
          </el-form-item>
        </template>
        <template v-if="formData.engineType === 'react'">
          <el-divider />
          <el-form-item :label="t('agent.manage.agentEngine.thinkingDepth')">
            <el-input-number
              v-model="formData.engineConfig.thinkingDepth"
              :min="1"
              :max="20"
              :disabled="editingEngine?.isBuiltIn"
              style="width: 100%"
            />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button
          type="primary"
          @click="handleSave"
          :disabled="editingEngine?.isBuiltIn"
        >
          {{ editingEngine?.isBuiltIn ? t('agent.manage.agentEngine.viewOnly') : t('common.save') }}
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
import { agentEngineManager } from '../../../utils/agent-framework'
import type { AgentEngine, EngineType, LlmConfigMode } from '../../../types/agent-framework'
import type { LocalizedText } from '../../../types/agent-tool'
import CardGrid from '../../common/CardGrid.vue'
import type { CardGridAction } from '../../common/CardGrid.vue'
import { getLlmTemperature } from '../../../utils/settings.js'

const { t } = useI18n()

const engines = ref<AgentEngine[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const editingEngine = ref<AgentEngine | null>(null)

// 默认温度配置（将在onMounted时从全局配置加载）
const defaultTemperature = ref(1.3)

const formData = ref({
  name: '',
  description: '',
  engineType: 'autogpt' as EngineType,
  llmConfigMode: 'global' as LlmConfigMode,
  customLlmConfig: {
    baseUrl: '',
    apiKey: '',
    model: '',
    temperature: 1.3,
    maxTokens: undefined as number | undefined
  },
  engineConfig: {
    maxIterations: 10,
    thinkingDepth: 5,
    enableReflection: true,
    enablePlanning: true
  }
})

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  padding: '20px'
}))

const getItemTitle = (item: AgentEngine): string => {
  return getLocalizedText(item.name) || item.id || ''
}

const getEngineTypeLabel = (type: EngineType): string => {
  const labels: Record<EngineType, string> = {
    'autogpt': t('agent.manage.agentEngine.engineTypes.autogpt'),
    'react': t('agent.manage.agentEngine.engineTypes.react'),
    'plan-execute': t('agent.manage.agentEngine.engineTypes.planExecute'),
    'simple-chat': t('agent.manage.agentEngine.engineTypes.simpleChat'),
    'workflow': t('agent.manage.agentEngine.engineTypes.workflow')
  }
  return labels[type] || type
}

const getLlmModeLabel = (mode: LlmConfigMode): string => {
  return mode === 'global' 
    ? t('agent.manage.agentEngine.useGlobalLLM')
    : t('agent.manage.agentEngine.useCustomLLM')
}

const getActions = (item: AgentEngine): CardGridAction[] => {
  const isBuiltIn = item.isBuiltIn === true
  return [
    { command: 'view', label: isBuiltIn ? t('agent.manage.agentEngine.view') : t('agent.manage.edit'), disabled: false },
    { command: 'edit', label: t('agent.manage.edit'), disabled: isBuiltIn },
    { command: 'validate', label: t('agent.manage.validate') },
    { command: 'duplicate', label: t('agent.sessions.duplicate') },
    { command: 'export', label: t('agent.manage.export') },
    { command: 'delete', label: t('agent.manage.delete'), disabled: isBuiltIn, danger: true }
  ]
}

const handleAction = async (command: string, engine: AgentEngine) => {
  if (command === 'view') {
    handleView(engine)
  } else if (command === 'edit') {
    handleEdit(engine)
  } else if (command === 'validate') {
    handleValidate(engine)
  } else if (command === 'duplicate') {
    await handleDuplicate(engine)
  } else if (command === 'export') {
    handleExport(engine)
  } else if (command === 'delete') {
    await handleDelete(engine)
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

const loadEngines = () => {
  loading.value = true
  try {
    engines.value = agentEngineManager.getAllEngines()
  } finally {
    loading.value = false
  }
}

const handleCreate = async () => {
  editingEngine.value = null
  const globalTemp = await getLlmTemperature()
  formData.value = {
    name: '',
    description: '',
    engineType: 'autogpt',
    llmConfigMode: 'global',
    customLlmConfig: {
      baseUrl: '',
      apiKey: '',
      model: '',
      temperature: globalTemp,
      maxTokens: undefined
    },
    engineConfig: {
      maxIterations: 10,
      thinkingDepth: 5,
      enableReflection: true,
      enablePlanning: true
    }
  }
  dialogVisible.value = true
}

const handleView = async (engine: AgentEngine) => {
  editingEngine.value = engine
  const globalTemp = await getLlmTemperature()
  formData.value = {
    name: getLocalizedText(engine.name),
    description: typeof engine.description === 'string' 
      ? engine.description 
      : engine.description['zh_cn']?.description || '',
    engineType: engine.engineType,
    llmConfigMode: engine.llmConfigMode,
    customLlmConfig: engine.customLlmConfig || {
      baseUrl: '',
      apiKey: '',
      model: '',
      temperature: globalTemp,
      maxTokens: undefined
    },
    engineConfig: engine.engineConfig || {
      maxIterations: 10,
      thinkingDepth: 5,
      enableReflection: true,
      enablePlanning: true
    }
  }
  dialogVisible.value = true
}

const handleEdit = (engine: AgentEngine) => {
  if (engine.isBuiltIn) {
    handleView(engine) // 内置引擎使用查看模式
    return
  }
  handleView(engine)
}

const handleSave = () => {
  if (!formData.value.name.trim()) {
    ElMessage.warning(t('agent.manage.agentEngine.nameRequired'))
    return
  }

  if (formData.value.llmConfigMode === 'custom') {
    if (!formData.value.customLlmConfig.baseUrl) {
      ElMessage.warning(t('agent.manage.agentEngine.baseUrlRequired'))
      return
    }
    if (!formData.value.customLlmConfig.apiKey) {
      ElMessage.warning(t('agent.manage.agentEngine.apiKeyRequired'))
      return
    }
    if (!formData.value.customLlmConfig.model) {
      ElMessage.warning(t('agent.manage.agentEngine.modelRequired'))
      return
    }
  }

  try {
    if (editingEngine.value) {
      if (editingEngine.value.isBuiltIn) {
        ElMessage.warning(t('agent.manage.agentEngine.cannotEditBuiltIn'))
        return
      }

      agentEngineManager.updateEngine(editingEngine.value.id, {
        name: formData.value.name,
        description: formData.value.description,
        llmConfigMode: formData.value.llmConfigMode,
        customLlmConfig: formData.value.llmConfigMode === 'custom' ? formData.value.customLlmConfig : undefined,
        engineConfig: formData.value.engineConfig
      })
      ElMessage.success(t('agent.manage.agentEngine.updateSuccess'))
    } else {
      agentEngineManager.createEngine(
        formData.value.name,
        formData.value.description,
        formData.value.engineType,
        formData.value.llmConfigMode,
        formData.value.llmConfigMode === 'custom' ? formData.value.customLlmConfig : undefined
      )
      ElMessage.success(t('agent.manage.agentEngine.createSuccess'))
    }
    dialogVisible.value = false
    loadEngines()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

const handleDuplicate = async (engine: AgentEngine) => {
  try {
    const baseName = getLocalizedText(engine.name) || engine.id
    const newName = `${baseName} - ${t('agent.sessions.duplicate')}`
    const desc = typeof engine.description === 'string'
      ? engine.description
      : engine.description['zh_cn']?.description || engine.description['en_us']?.description || ''

    const duplicated = agentEngineManager.createEngine(
      newName,
      desc,
      engine.engineType,
      engine.llmConfigMode,
      engine.customLlmConfig
    )

    agentEngineManager.updateEngine(duplicated.id, {
      engineConfig: engine.engineConfig,
      interceptors: engine.interceptors,
      enabled: engine.enabled,
      tags: engine.tags
    })

    ElMessage.success(t('agent.sessions.duplicateSuccess'))
    loadEngines()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

const handleDelete = async (engine: AgentEngine) => {
  if (engine.isBuiltIn) {
    ElMessage.warning(t('agent.manage.agentEngine.cannotDeleteBuiltIn'))
    return
  }

  try {
    await ElMessageBox.confirm(
      t('agent.manage.agentEngine.confirmDelete', { name: getLocalizedText(engine.name) }),
      t('common.confirm'),
      { type: 'warning' }
    )
    agentEngineManager.deleteEngine(engine.id)
    ElMessage.success(t('agent.manage.agentEngine.deleteSuccess'))
    loadEngines()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error instanceof Error ? error.message : String(error))
    }
  }
}

const handleValidate = (engine: AgentEngine) => {
  const validation = agentEngineManager.validateEngine(engine)
  if (validation.valid) {
    if (validation.warnings.length > 0) {
      ElMessage.warning(t('agent.manage.agentEngine.validationWarnings') + ': ' + validation.warnings.join(', '))
    } else {
      ElMessage.success(t('agent.manage.agentEngine.validationSuccess'))
    }
  } else {
    ElMessage.error(t('agent.manage.agentEngine.validationFailed') + ': ' + validation.errors.join(', '))
  }
}

const handleExport = (engine: AgentEngine) => {
  try {
    const entity = agentEngineManager.exportEngine(engine.id)
    if (entity) {
      const json = JSON.stringify(entity, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `agent-engine-${engine.id}.json`
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
      agentEngineManager.importEngine(entity, true)
      ElMessage.success(t('agent.manage.importSuccess'))
      loadEngines()
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : String(error))
    }
  }
  input.click()
}

onMounted(async () => {
  // 加载全局温度配置作为默认值
  defaultTemperature.value = await getLlmTemperature()
  formData.value.customLlmConfig.temperature = defaultTemperature.value
  loadEngines()
})
</script>

<style scoped>
.agent-engine-manager {
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

