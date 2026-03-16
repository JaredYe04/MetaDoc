<template>
  <div class="agent-engine-manager" :style="containerStyle">
    <div class="manager-header">
      <h2>{{ t('agent.manage.agentEngine.title') }}</h2>
      <div class="manager-header-actions">
        <Button @click="handleImport">{{ t('agent.manage.import') }}</Button>
        <Button type="primary" @click="handleCreate">
          <Plus class="h-4 w-4 mr-1" />
          {{ t('agent.manage.agentEngine.create') }}
        </Button>
      </div>
    </div>

    <CardGrid
      :items="engines"
      :loading="loading"
      :show-thumbnail="false"
      :get-item-id="(item) => item.id || ''"
      :get-item-title="(item) => getItemTitle(item as AgentEngine) || ''"
      :get-item-description="(item) => getLocalizedText((item as AgentEngine).description) || ''"
      :get-item-meta="
        (item) => [
          t('agent.manage.agentEngine.engineType') +
            ': ' +
            getEngineTypeLabel((item as AgentEngine).engineType),
          t('agent.manage.agentEngine.llmMode') +
            ': ' +
            getLlmModeLabel((item as AgentEngine).llmConfigMode),
          item.enabled !== false ? t('agent.manage.enabled') : t('agent.manage.disabled')
        ]
      "
      :get-badge="
        (item) => ((item as AgentEngine).isBuiltIn ? t('agent.manage.agentEngine.builtIn') : null)
      "
      :get-actions="(item) => getActions(item as AgentEngine)"
      :is-disabled="() => false"
      @item-click="(item) => handleEdit(item as AgentEngine)"
      @action="(cmd, item) => handleAction(cmd, item as AgentEngine)"
    />

    <!-- 创建/编辑对话框 -->
    <Dialog v-model:open="dialogVisible">
      <DialogContent class="max-w-[800px]" :style="dialogStyle">
        <DialogHeader>
          <DialogTitle>
            {{
              editingEngine
                ? editingEngine.isBuiltIn
                  ? t('agent.manage.agentEngine.view')
                  : t('agent.manage.agentEngine.edit')
                : t('agent.manage.agentEngine.create')
            }}
          </DialogTitle>
        </DialogHeader>
        <Form class="space-y-4">
          <FormField :label="t('agent.manage.agentEngine.name')" name="name" required>
            <Input v-model="formData.name" :disabled="editingEngine?.isBuiltIn" class="w-full" />
          </FormField>
          <FormField :label="t('agent.manage.agentEngine.description')" name="description">
            <Textarea
              v-model="formData.description"
              :rows="3"
              :disabled="editingEngine?.isBuiltIn"
              class="w-full"
            />
          </FormField>
          <FormField :label="t('agent.manage.agentEngine.engineType')" name="engineType" required>
            <Select v-model="formData.engineType" :disabled="!!editingEngine">
              <SelectTrigger style="width: 100%">
                <SelectValue :placeholder="t('agent.manage.agentEngine.selectEngineType')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="autogpt">
                  {{ t('agent.manage.agentEngine.engineTypes.autogpt') }}
                </SelectItem>
                <SelectItem value="react">
                  {{ t('agent.manage.agentEngine.engineTypes.react') }}
                </SelectItem>
                <SelectItem value="plan-execute">
                  {{ t('agent.manage.agentEngine.engineTypes.planExecute') }}
                </SelectItem>
                <SelectItem value="simple-chat">
                  {{ t('agent.manage.agentEngine.engineTypes.simpleChat') }}
                </SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField
            :label="t('agent.manage.agentEngine.llmConfigMode')"
            name="llmConfigMode"
            required
          >
            <RadioGroup
              v-model="formData.llmConfigMode"
              :disabled="editingEngine?.isBuiltIn"
              class="flex flex-row gap-4"
            >
              <div class="flex items-center gap-2">
                <RadioGroupItem value="global" id="llm-global" />
                <label for="llm-global" class="text-sm cursor-pointer">{{
                  t('agent.manage.agentEngine.useGlobalLLM')
                }}</label>
              </div>
              <div class="flex items-center gap-2">
                <RadioGroupItem value="custom" id="llm-custom" />
                <label for="llm-custom" class="text-sm cursor-pointer">{{
                  t('agent.manage.agentEngine.useCustomLLM')
                }}</label>
              </div>
            </RadioGroup>
            <div class="form-hint">
              {{ t('agent.manage.agentEngine.llmConfigModeHint') }}
            </div>
          </FormField>
          <template v-if="formData.llmConfigMode === 'custom'">
            <FormField :label="t('agent.manage.agentEngine.apiBaseUrl')" name="apiBaseUrl" required>
              <Input
                v-model="formData.customLlmConfig.baseUrl"
                :placeholder="t('agent.manage.agentEngine.apiBaseUrlPlaceholder')"
                :disabled="editingEngine?.isBuiltIn"
                class="w-full"
              />
            </FormField>
            <FormField :label="t('agent.manage.agentEngine.apiKey')" name="apiKey" required>
              <Input
                v-model="formData.customLlmConfig.apiKey"
                type="password"
                :placeholder="t('agent.manage.agentEngine.apiKeyPlaceholder')"
                :disabled="editingEngine?.isBuiltIn"
                class="w-full"
              />
            </FormField>
            <FormField :label="t('agent.manage.agentEngine.model')" name="model" required>
              <Input
                v-model="formData.customLlmConfig.model"
                :placeholder="t('agent.manage.agentEngine.modelPlaceholder')"
                :disabled="editingEngine?.isBuiltIn"
                class="w-full"
              />
            </FormField>
            <FormField :label="t('agent.manage.agentEngine.temperature')" name="temperature">
              <NumberField
                v-model="formData.customLlmConfig.temperature"
                :min="0"
                :max="2"
                :step="0.1"
                :disabled="editingEngine?.isBuiltIn"
              >
                <NumberFieldContent>
                  <NumberFieldDecrement />
                  <NumberFieldInput class="w-[120px]" />
                  <NumberFieldIncrement />
                </NumberFieldContent>
              </NumberField>
            </FormField>
            <FormField :label="t('agent.manage.agentEngine.maxTokens')" name="maxTokens">
              <NumberField
                v-model="formData.customLlmConfig.maxTokens"
                :min="1"
                :max="100000"
                :disabled="editingEngine?.isBuiltIn"
              >
                <NumberFieldContent>
                  <NumberFieldDecrement />
                  <NumberFieldInput class="w-[120px]" />
                  <NumberFieldIncrement />
                </NumberFieldContent>
              </NumberField>
            </FormField>
          </template>
          <template v-if="formData.engineType === 'autogpt'">
            <Divider />
            <FormField :label="t('agent.manage.agentEngine.maxIterations')" name="maxIterations">
              <NumberField
                v-model="formData.engineConfig.maxIterations"
                :min="1"
                :max="100"
                :disabled="editingEngine?.isBuiltIn"
              >
                <NumberFieldContent>
                  <NumberFieldDecrement />
                  <NumberFieldInput class="w-[120px]" />
                  <NumberFieldIncrement />
                </NumberFieldContent>
              </NumberField>
            </FormField>
            <FormField
              :label="t('agent.manage.agentEngine.enableReflection')"
              name="enableReflection"
            >
              <Switch
                :checked="formData.engineConfig.enableReflection"
                :disabled="editingEngine?.isBuiltIn"
                @update:checked="(val) => (formData.engineConfig.enableReflection = val)"
              />
            </FormField>
            <FormField :label="t('agent.manage.agentEngine.enablePlanning')" name="enablePlanning">
              <Switch
                :checked="formData.engineConfig.enablePlanning"
                :disabled="editingEngine?.isBuiltIn"
                @update:checked="(val) => (formData.engineConfig.enablePlanning = val)"
              />
            </FormField>
          </template>
          <template v-if="formData.engineType === 'react'">
            <Divider />
            <FormField :label="t('agent.manage.agentEngine.thinkingDepth')" name="thinkingDepth">
              <NumberField
                v-model="formData.engineConfig.thinkingDepth"
                :min="1"
                :max="20"
                :disabled="editingEngine?.isBuiltIn"
              >
                <NumberFieldContent>
                  <NumberFieldDecrement />
                  <NumberFieldInput class="w-[120px]" />
                  <NumberFieldIncrement />
                </NumberFieldContent>
              </NumberField>
            </FormField>
          </template>
        </Form>
        <DialogFooter>
          <Button @click="dialogVisible = false">{{ t('common.cancel') }}</Button>
          <Button type="primary" @click="handleSave" :disabled="editingEngine?.isBuiltIn">
            {{
              editingEngine?.isBuiltIn ? t('agent.manage.agentEngine.viewOnly') : t('common.save')
            }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from '@renderer/utils/toast'
import { messageBox } from '../../../utils/messageBox'
import { Plus } from '@element-plus/icons-vue'
import { themeState } from '../../../utils/themes'
import { agentEngineManager } from '../../../utils/agent-framework'
import type { AgentEngine, EngineType, LlmConfigMode } from '../../../types/agent-framework'
import type { LocalizedText } from '../../../types/agent-tool'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Form, FormField } from '@renderer/components/ui/form'
import { Switch } from '@renderer/components/ui/switch'
import CardGrid from '../../common/CardGrid.vue'
import type { CardGridAction } from '../../common/CardGrid.vue'
import { getLlmTemperature } from '../../../utils/settings.js'
import {
  NumberField,
  NumberFieldInput,
  NumberFieldIncrement,
  NumberFieldDecrement,
  NumberFieldContent
} from '@renderer/components/ui/number-field'
import { Divider } from '@renderer/components/ui/separator'

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
    autogpt: t('agent.manage.agentEngine.engineTypes.autogpt'),
    react: t('agent.manage.agentEngine.engineTypes.react'),
    'plan-execute': t('agent.manage.agentEngine.engineTypes.planExecute'),
    'simple-chat': t('agent.manage.agentEngine.engineTypes.simpleChat')
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
    {
      command: 'view',
      label: isBuiltIn ? t('agent.manage.agentEngine.view') : t('agent.manage.edit'),
      disabled: false
    },
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
    description:
      typeof engine.description === 'string'
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
    toast.warning(t('agent.manage.agentEngine.nameRequired'))
    return
  }

  if (formData.value.llmConfigMode === 'custom') {
    if (!formData.value.customLlmConfig.baseUrl) {
      toast.warning(t('agent.manage.agentEngine.baseUrlRequired'))
      return
    }
    if (!formData.value.customLlmConfig.apiKey) {
      toast.warning(t('agent.manage.agentEngine.apiKeyRequired'))
      return
    }
    if (!formData.value.customLlmConfig.model) {
      toast.warning(t('agent.manage.agentEngine.modelRequired'))
      return
    }
  }

  try {
    if (editingEngine.value) {
      if (editingEngine.value.isBuiltIn) {
        toast.warning(t('agent.manage.agentEngine.cannotEditBuiltIn'))
        return
      }

      agentEngineManager.updateEngine(editingEngine.value.id, {
        name: formData.value.name,
        description: formData.value.description,
        llmConfigMode: formData.value.llmConfigMode,
        customLlmConfig:
          formData.value.llmConfigMode === 'custom' ? formData.value.customLlmConfig : undefined,
        engineConfig: formData.value.engineConfig
      })
      toast.success(t('agent.manage.agentEngine.updateSuccess'))
    } else {
      agentEngineManager.createEngine(
        formData.value.name,
        formData.value.description,
        formData.value.engineType,
        formData.value.llmConfigMode,
        formData.value.llmConfigMode === 'custom' ? formData.value.customLlmConfig : undefined
      )
      toast.success(t('agent.manage.agentEngine.createSuccess'))
    }
    dialogVisible.value = false
    loadEngines()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}

const handleDuplicate = async (engine: AgentEngine) => {
  try {
    const baseName = getLocalizedText(engine.name) || engine.id
    const newName = `${baseName} - ${t('agent.sessions.duplicate')}`
    const desc =
      typeof engine.description === 'string'
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

    toast.success(t('agent.sessions.duplicateSuccess'))
    loadEngines()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}

const handleDelete = async (engine: AgentEngine) => {
  if (engine.isBuiltIn) {
    toast.warning(t('agent.manage.agentEngine.cannotDeleteBuiltIn'))
    return
  }

  try {
    await messageBox.confirm(
      t('agent.manage.agentEngine.confirmDelete', { name: getLocalizedText(engine.name) }),
      t('common.confirm'),
      { type: 'warning' }
    )
    agentEngineManager.deleteEngine(engine.id)
    toast.success(t('agent.manage.agentEngine.deleteSuccess'))
    loadEngines()
  } catch (error) {
    if (error !== 'cancel') {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }
}

const handleValidate = (engine: AgentEngine) => {
  const validation = agentEngineManager.validateEngine(engine)
  if (validation.valid) {
    if (validation.warnings.length > 0) {
      toast.warning(
        t('agent.manage.agentEngine.validationWarnings') + ': ' + validation.warnings.join(', ')
      )
    } else {
      toast.success(t('agent.manage.agentEngine.validationSuccess'))
    }
  } else {
    toast.error(
      t('agent.manage.agentEngine.validationFailed') + ': ' + validation.errors.join(', ')
    )
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
      toast.success(t('agent.manage.exportSuccess'))
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
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
      toast.success(t('agent.manage.importSuccess'))
      loadEngines()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
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

.manager-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.form-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
</style>
