<template>
  <div class="knowledge-base-settings">
    <h3 class="section-title">{{ t('setting.knowledgeBaseSettings') }}</h3>
    <Form class="settings-form">
      <FormField
        :label="t('setting.enableKnowledgeBase')"
        name="enableKnowledgeBase"
        layout="horizontal"
      >
        <template #label-extra>
          <Tooltip>
            <TooltipTrigger as-child>
              <HelpCircle class="metadata-info-icon h-4 w-4 inline-block align-middle" />
            </TooltipTrigger>
            <TooltipContent side="bottom">{{ t('setting.knowledgeBaseTooltip') }}</TooltipContent>
          </Tooltip>
        </template>
        <div class="flex items-center gap-2">
          <Switch
            :checked="settings.enableKnowledgeBase"
            @update:checked="handleKnowledgeBaseToggleChange"
          />
          <span class="text-sm text-muted-foreground">{{
            settings.enableKnowledgeBase ? t('setting.enabled') : t('setting.disabled')
          }}</span>
        </div>
      </FormField>

      <FormField
        v-if="settings.enableKnowledgeBase"
        :label="t('setting.embeddingMode')"
        name="embeddingMode"
        layout="horizontal"
      >
        <template #label-extra>
          <Tooltip>
            <TooltipTrigger as-child>
              <HelpCircle class="metadata-info-icon h-4 w-4 inline-block align-middle" />
            </TooltipTrigger>
            <TooltipContent side="top">{{ t('setting.embeddingModeTooltip') }}</TooltipContent>
          </Tooltip>
        </template>
        <Select v-model="settings.embeddingMode" @update:model-value="handleEmbeddingModeChange">
          <SelectTrigger class="w-[300px]">
            <SelectValue :placeholder="t('setting.chooseEmbeddingMode')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="api">{{ t('setting.embeddingModeApi') }}</SelectItem>
            <SelectItem value="local" disabled>{{ t('setting.embeddingModeLocal') }}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        v-if="settings.enableKnowledgeBase"
        :label="t('setting.knowledgeBaseScoreThreshold')"
        name="knowledgeBaseScoreThreshold"
        layout="horizontal"
      >
        <template #label-extra>
          <Tooltip>
            <TooltipTrigger as-child>
              <HelpCircle class="metadata-info-icon h-4 w-4 inline-block align-middle" />
            </TooltipTrigger>
            <TooltipContent side="top">{{
              t('setting.knowledgeBaseScoreThresholdTooltip')
            }}</TooltipContent>
          </Tooltip>
        </template>
        <div class="flex items-center gap-4 max-w-[400px] mb-2.5">
          <Slider
            :model-value="settings.knowledgeBaseScoreThreshold"
            :min="0.01"
            :max="0.99"
            :step="0.01"
            @update:model-value="
              (val) => {
                settings.knowledgeBaseScoreThreshold = val
                handleKnowledgeBaseThresholdChange()
              }
            "
            class="flex-1"
          />
          <NumberField
            :model-value="settings.knowledgeBaseScoreThreshold"
            :min="0.01"
            :max="0.99"
            :step="0.01"
            :precision="2"
            @update:model-value="
              (val) => {
                settings.knowledgeBaseScoreThreshold = val
                handleKnowledgeBaseThresholdChange()
              }
            "
            class="w-28"
          >
            <NumberFieldContent>
              <NumberFieldDecrement />
              <NumberFieldInput />
              <NumberFieldIncrement />
            </NumberFieldContent>
          </NumberField>
        </div>
      </FormField>
    </Form>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { settings, setSetting } from '../../utils/settings.js'
import { Form, FormField } from '@renderer/components/ui/form'
// 单窗口多Tab架构：不再需要sendBroadcast，直接使用eventBus
import eventBus from '../../utils/event-bus.js'
import messageBridge from '../../bridge/message-bridge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { Slider } from '@renderer/components/ui/slider'
import {
  NumberField,
  NumberFieldContent,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput
} from '@renderer/components/ui/number-field'
import { HelpCircle } from 'lucide-vue-next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'

const props = defineProps<{
  mode?: 'normal' | 'demo'
}>()

const isDemo = computed(() => props.mode === 'demo')

const { t } = useI18n()

// 监听知识库开关事件（从其他组件同步状态）
const handleKnowledgeBaseToggle = (payload: unknown) => {
  const data = payload as { enabled?: boolean }
  if (typeof data?.enabled === 'boolean' && settings.enableKnowledgeBase !== data.enabled) {
    settings.enableKnowledgeBase = data.enabled
    setSetting('enableKnowledgeBase', data.enabled)
  }
}

const handleKnowledgeBaseToggleChange = (val: boolean) => {
  settings.enableKnowledgeBase = val
  setSetting('enableKnowledgeBase', val)
  // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
  eventBus.emit('knowledge-base-toggle', { enabled: val })
}

// Demo 模式：加载 mock 数据
const loadDemoData = () => {
  settings.enableKnowledgeBase = true
  settings.embeddingMode = 'cloud'
  settings.knowledgeBaseScoreThreshold = 0.7
  settings.maxResults = 5
}

onMounted(() => {
  if (isDemo.value) {
    // Demo 模式：加载 mock 数据，跳过真实配置加载
    loadDemoData()
  } else {
    // 监听知识库开关事件，同步状态
    eventBus.on('knowledge-base-toggle', handleKnowledgeBaseToggle)
  }
})

onBeforeUnmount(() => {
  // Demo 模式下没有注册事件监听器，无需清理
  if (!isDemo.value) {
    // 清理事件监听器
    eventBus.off('knowledge-base-toggle', handleKnowledgeBaseToggle)
  }
})

const handleKnowledgeBaseThresholdChange = () => {
  // 确保值是数字，避免 Proxy 对象无法被 IPC 克隆
  const value = Number(settings.knowledgeBaseScoreThreshold)
  settings.knowledgeBaseScoreThreshold = value
  setSetting('knowledgeBaseScoreThreshold', value)
}

const handleEmbeddingModeChange = async () => {
  setSetting('embeddingMode', settings.embeddingMode)
  // 同步到主进程
  await messageBridge.invoke('set-embedding-mode', settings.embeddingMode)
}
</script>

<style scoped>
.knowledge-base-settings {
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  box-sizing: border-box;
}

.section-title {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.settings-form {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.settings-form :deep(.el-form-item) {
  margin-bottom: 24px;
}

.settings-form :deep(.el-input),
.settings-form :deep(.el-select),
.settings-form :deep(.el-slider) {
  width: 100%;
  max-width: 100%;
}

.settings-form :deep(.el-slider) {
  max-width: 100%;
}

.metadata-info-icon {
  margin-left: 4px;
  color: var(--el-text-color-secondary);
  cursor: help;
  font-size: 14px;
}

.metadata-info-icon:hover {
  color: var(--el-color-primary);
}
</style>
