<template>
  <div
    class="tool-result-card"
    :class="[`status-${message.status}`]"
    :style="cardStyle"
  >
    <header class="tool-result-header">
      <div class="title-block">
        <span class="tool-name">{{ message.tool.name }}</span>
        <el-tag size="small" :type="statusTagType">{{ statusLabel }}</el-tag>
      </div>
      <small class="timestamp">{{ formatTimestamp(message.timestamp) }}</small>
    </header>

    <p v-if="message.summary" class="summary">{{ message.summary }}</p>

    <div class="outputs">
      <el-collapse v-model="activePanels" accordion>
        <el-collapse-item
          v-for="output in message.outputs"
          :key="output.id"
          :name="output.id"
        >
          <template #title>
            <div class="output-title">
              <span>{{ output.label }}</span>
              <el-tag size="small" effect="light">{{ output.format }}</el-tag>
            </div>
          </template>
          <div class="output-body" :style="outputBodyStyle">
            <component
              v-if="output.renderer"
              :is="output.renderer"
              :data="output.data"
            />
            <pre v-else class="raw-text">{{ formatOutput(output) }}</pre>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <div v-if="message.error" class="error-block">
      <el-icon><WarningFilled /></el-icon>
      <span>{{ message.error }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { dayjs } from 'element-plus'
import type { ToolAgentMessage, ToolOutputDescriptor } from '../../types/agent'
import { WarningFilled } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { themeState } from '../../utils/themes'

const props = defineProps<{
  message: ToolAgentMessage
}>()

const { t } = useI18n()

const statusLabel = computed(() => {
  switch (props.message.status) {
    case 'pending':
      return t('agent.tool.status.pending')
    case 'running':
      return t('agent.tool.status.running')
    case 'succeeded':
      return t('agent.tool.status.success')
    case 'failed':
      return t('agent.tool.status.failed')
    default:
      return props.message.status
  }
})

const statusTagType = computed(() => {
  switch (props.message.status) {
    case 'pending':
      return 'info'
    case 'running':
      return 'warning'
    case 'succeeded':
      return 'success'
    case 'failed':
      return 'danger'
    default:
      return 'info'
  }
})

const activePanels = ref<string[]>([])

watch(
  () => props.message.outputs,
  () => {
    activePanels.value = props.message.outputs.map((output) => output.id)
  },
  { immediate: true }
)

const formatTimestamp = (timestamp: string) => {
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')
}

const formatOutput = (output: ToolOutputDescriptor) => {
  if (output.format === 'json' && typeof output.data === 'object') {
    return JSON.stringify(output.data, null, 2)
  }
  if (typeof output.data === 'string') {
    return output.data
  }
  return String(output.data)
}

const cardBorderColor = computed(() =>
  themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)',
)

const contentBorderColor = computed(() =>
  themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
)

const cardStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  borderColor: cardBorderColor.value,
}))

const outputBodyStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  borderColor: contentBorderColor.value,
}))
</script>

<style scoped>
.tool-result-card {
  border-radius: 12px;
  padding: 16px;
  border: 1px solid;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.tool-result-card:hover {
  border-color: rgba(64, 158, 255, 0.6);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}

.tool-result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.title-block {
  display: flex;
  gap: 8px;
  align-items: center;
}

.tool-name {
  font-weight: 600;
  font-size: 16px;
}

.timestamp {
  opacity: 0.65;
}

.summary {
  margin-bottom: 12px;
  opacity: 0.75;
}

.outputs {
  margin-bottom: 12px;
}

.output-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
}

.output-body {
  border-radius: 8px;
  padding: 12px;
  font-size: 13px;
  border: 1px solid;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.raw-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--code-font-family, 'JetBrains Mono', monospace);
}

.error-block {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background-color: rgba(245, 108, 108, 0.12);
  color: #f56c6c;
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-failed {
  border-color: rgba(245, 108, 108, 0.4);
}
.status-running {
  border-color: rgba(230, 162, 60, 0.4);
}
.status-succeeded {
  border-color: rgba(103, 194, 58, 0.4);
}
</style>

