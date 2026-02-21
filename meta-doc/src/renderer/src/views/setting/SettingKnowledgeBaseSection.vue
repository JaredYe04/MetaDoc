<template>
  <div class="knowledge-base-settings">
    <h3 class="section-title">{{ t('setting.knowledgeBaseSettings') }}</h3>
    <Form class="settings-form">
      <FormField :label="t('setting.enableKnowledgeBase')" name="">
        <el-tooltip :content="t('setting.knowledgeBaseTooltip')" placement="bottom">
          <div class="flex items-center gap-2">
            <Switch
              :checked="settings.enableKnowledgeBase"
              @update:checked="handleKnowledgeBaseToggleChange"
            />
            <span class="text-sm text-muted-foreground">{{ settings.enableKnowledgeBase ? t('setting.enabled') : t('setting.disabled') }}</span>
          </div>
        </el-tooltip>
      </FormField>

      <FormField v-if="settings.enableKnowledgeBase" :label="t('setting.embeddingMode')" name="">
        <el-tooltip :content="t('setting.embeddingModeTooltip')" placement="top">
          <Select
            v-model="settings.embeddingMode"
            @update:model-value="handleEmbeddingModeChange"
          >
            <SelectTrigger class="w-[300px]">
              <SelectValue :placeholder="t('setting.chooseEmbeddingMode')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="api">{{ t('setting.embeddingModeApi') }}</SelectItem>
              <SelectItem value="local" disabled>{{ t('setting.embeddingModeLocal') }}</SelectItem>
            </SelectContent>
          </Select>
        </el-tooltip>
      </FormField>

      <FormField v-if="settings.enableKnowledgeBase" :label="t('setting.knowledgeBaseScoreThreshold')" name="">
        <el-tooltip :content="t('setting.knowledgeBaseScoreThresholdTooltip')" placement="top">
          <el-slider
            v-model="settings.knowledgeBaseScoreThreshold"
            show-input
            :min="0.01"
            :max="0.99"
            :step="0.01"
            @change="handleKnowledgeBaseThresholdChange"
            :marks="sliderMarks"
            style="margin-bottom: 10px; width: 400px"
          />
        </el-tooltip>
      </FormField>
    </Form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
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

const { t } = useI18n()

const sliderMarks = computed(() => ({
  0.1: '0.1',
  0.5: '0.5',
  0.9: '0.9'
}))

// 监听知识库开关事件（从其他组件同步状态）
const handleKnowledgeBaseToggle = (payload: unknown) => {
  const data = payload as { enabled?: boolean }
  if (typeof data?.enabled === 'boolean' && settings.enableKnowledgeBase !== data.enabled) {
    settings.enableKnowledgeBase = data.enabled
    setSetting('enableKnowledgeBase', data.enabled)
  }
}

const handleKnowledgeBaseToggleChange = () => {
  setSetting('enableKnowledgeBase', settings.enableKnowledgeBase)
  // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
  eventBus.emit('knowledge-base-toggle', { enabled: settings.enableKnowledgeBase })
}

onMounted(() => {
  // 监听知识库开关事件，同步状态
  eventBus.on('knowledge-base-toggle', handleKnowledgeBaseToggle)
})

onBeforeUnmount(() => {
  // 清理事件监听器
  eventBus.off('knowledge-base-toggle', handleKnowledgeBaseToggle)
})

const handleKnowledgeBaseThresholdChange = () => {
  setSetting('knowledgeBaseScoreThreshold', settings.knowledgeBaseScoreThreshold)
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
</style>
