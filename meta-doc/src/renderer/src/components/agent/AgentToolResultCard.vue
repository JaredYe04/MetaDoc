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
      <div class="header-actions">
        <el-button
          text
          size="small"
          :icon="Download"
          @click="exportSnapshot"
          :title="t('agent.tool.exportSnapshot')"
        >
          {{ t('agent.tool.exportSnapshot') }}
        </el-button>
        <small class="timestamp">{{ formatTimestamp(message.timestamp) }}</small>
      </div>
    </header>

    <p v-if="message.summary" class="summary">{{ message.summary }}</p>

    <!-- 进度条 -->
    <div v-if="message.progress && message.progress.percentage > 0" class="progress-container">
      <el-progress
        :percentage="message.progress.percentage"
        :status="progressStatus"
        :stroke-width="6"
        :show-text="true"
      >
        <template #default="{ percentage }">
          <span class="progress-text">{{ percentage }}%</span>
          <span v-if="message.progress?.message" class="progress-message">
            {{ message.progress.message }}
          </span>
        </template>
      </el-progress>
    </div>

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
            <!-- 如果有显示组件，使用组件渲染 -->
            <component
              v-if="output.renderer && resolveComponent(output.renderer)"
              :is="resolveComponent(output.renderer)"
              :data="output.data"
              :status="message.status"
              :progress="message.progress"
              :error="message.error"
              :tool-config="toolConfig"
              @update="handleComponentUpdate"
              @cancel="handleComponentCancel"
            />
            <!-- 否则使用纯文本渲染 -->
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
import { computed, ref, watch, defineAsyncComponent, h } from 'vue'
import { dayjs, ElMessage } from 'element-plus'
import type { ToolAgentMessage, ToolOutputDescriptor } from '../../types/agent'
import { WarningFilled, Download } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { themeState } from '../../utils/themes'
import { agentToolManager } from '../../utils/agent-tool-manager'
import {
  createSnapshotFromHistoryEntry,
  serializeToolExecutionSnapshot
} from '../../utils/agent-tools/tool-serialization'

const props = defineProps<{
  message: ToolAgentMessage
}>()

const { t } = useI18n()

// 获取Tool配置
const toolConfig = computed(() => {
  const tool = agentToolManager.getTool(props.message.tool.id)
  return tool?.config
})

// 处理组件更新（用于交互式组件）
const handleComponentUpdate = (data: unknown) => {
  // 这里可以触发Tool的更新回调
  // 具体实现取决于交互需求
  console.log('Component update:', data)
}

// 处理组件取消
const handleComponentCancel = () => {
  // 取消Tool执行
  // 需要从message中获取invocationId
  console.log('Component cancel')
}

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

// 进度条状态
const progressStatus = computed(() => {
  if (props.message.status === 'failed') return 'exception'
  if (props.message.status === 'succeeded') return 'success'
  if (props.message.status === 'running') return undefined
  return undefined
})

// 从工具配置中提取组件名称
const extractComponentName = (displayComponent: any): string | undefined => {
  if (!displayComponent) return undefined
  
  // 如果是字符串，直接返回
  if (typeof displayComponent === 'string') {
    return displayComponent
  }
  
  // 如果是组件对象，尝试提取名称
  if (typeof displayComponent === 'object') {
    // 方法1：从组件对象的name属性获取
    const name = displayComponent.name || 
                 displayComponent.__name || 
                 displayComponent.displayName
    
    if (name && typeof name === 'string') {
      return name
    }
    
    // 方法2：尝试从组件文件的路径提取名称
    const filePath = (displayComponent as any).__file
    if (filePath && typeof filePath === 'string') {
      const match = filePath.match(/([^/\\]+)\.vue$/)
      if (match && match[1]) {
        return match[1]
      }
    }
  }
  
  return undefined
}

// 解析组件 - 支持字符串组件名称或组件对象
const resolveComponent = (renderer: string | any) => {
  if (!renderer) return null
  
  // 如果是字符串，尝试动态导入
  if (typeof renderer === 'string') {
    // 组件名称映射表
    const componentMap: Record<string, () => Promise<any>> = {
      'OutlineTreeDisplay': () => import('../../utils/agent-tools/components/OutlineTreeDisplay.vue'),
      // 可以添加更多组件的映射
    }
    
    const componentLoader = componentMap[renderer]
    if (componentLoader) {
      return defineAsyncComponent(componentLoader)
    }
    
    // 如果不在映射表中，尝试使用组件名称作为路径（假设在 components 目录下）
    try {
      return defineAsyncComponent(() => import(`../../utils/agent-tools/components/${renderer}.vue`))
    } catch {
      console.warn(`无法加载组件: ${renderer}`)
      return null
    }
  }
  
  // 如果已经是组件对象，直接返回
  if (typeof renderer === 'object' && ('setup' in renderer || 'render' in renderer || 'name' in renderer)) {
    return renderer
  }
  
  return null
}

// 导出执行快照
const exportSnapshot = async () => {
  try {
    // 从message创建快照
    // AgentView中的message可能没有完整的params信息，使用空对象
    const snapshot = createSnapshotFromHistoryEntry({
      toolId: props.message.tool.id,
      toolName: props.message.tool.name,
      timestamp: new Date(props.message.timestamp).getTime(),
      status: props.message.status,
      params: (props.message as any).params || {}, // AgentView中的message可能没有params
      result: props.message.outputs?.[0]?.data,
      data: props.message.outputs?.[0]?.data ? {
        content: props.message.outputs?.[0]?.data,
        format: (props.message.outputs?.[0]?.format === 'table' ? 'json' : (props.message.outputs?.[0]?.format || 'json')) as 'json' | 'text' | 'markdown' | 'xml' | 'html' | 'custom',
        componentName: props.message.outputs?.[0]?.renderer
      } : undefined,
      progress: props.message.progress,
      error: props.message.error,
      outputs: props.message.outputs?.map(output => ({
        id: output.id,
        label: output.label,
        format: output.format,
        data: output.data,
        timestamp: new Date(props.message.timestamp).getTime()
      })),
      invocationId: (props.message as any).invocationId
    }, toolConfig.value ? {
      id: toolConfig.value.id,
      name: toolConfig.value.name,
      description: toolConfig.value.description,
      origin: toolConfig.value.origin,
      displayComponent: extractComponentName(toolConfig.value.displayComponent)
    } : undefined)

    // 序列化快照
    const serialized = serializeToolExecutionSnapshot(snapshot)

    // 创建下载链接
    const blob = new Blob([serialized], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tool-snapshot-${snapshot.toolId}-${snapshot.timestamp}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    ElMessage.success(t('agent.tool.exportSnapshotSuccess'))
  } catch (error) {
    console.error('导出快照失败:', error)
    ElMessage.error(`${t('agent.tool.exportSnapshotFailed')}: ${error instanceof Error ? error.message : String(error)}`)
  }
}
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
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

.progress-container {
  margin: 12px 0;
  padding: 8px 0;
}

.progress-text {
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.progress-message {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-left: 8px;
}
</style>

