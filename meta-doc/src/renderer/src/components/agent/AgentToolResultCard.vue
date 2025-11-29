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

    <!-- 工具调用参数（默认折叠，仅在存在参数时显示） -->
    <el-collapse 
      v-if="toolCallParams !== null" 
      v-model="paramsCollapseActive" 
      class="params-collapse"
    >
      <el-collapse-item name="params">
        <template #title>
          <div class="params-title">
            <span>{{ t('agent.tool.params', '调用参数') }}</span>
            <el-tag size="small" effect="light">JSON</el-tag>
          </div>
        </template>
        <div :id="paramsEditorId" class="params-editor-container" :style="paramsEditorContainerStyle"></div>
      </el-collapse-item>
    </el-collapse>

    <!-- 原始结果（JSON，默认折叠） -->
    <el-collapse 
      v-if="rawResultJson !== null" 
      v-model="rawResultCollapseActive" 
      class="raw-result-collapse"
    >
      <el-collapse-item name="rawResult">
        <template #title>
          <div class="raw-result-title">
            <span>{{ t('agent.tool.rawResult', '原始结果') }}</span>
            <el-tag size="small" effect="light">JSON</el-tag>
          </div>
        </template>
        <div :id="rawResultEditorId" class="raw-result-editor-container" :style="rawResultEditorContainerStyle"></div>
      </el-collapse-item>
    </el-collapse>

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
import { computed, ref, watch, defineAsyncComponent, h, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { dayjs, ElMessage } from 'element-plus'
import type { ToolAgentMessage, ToolOutputDescriptor, AgentMessage, ChatAgentMessage } from '../../types/agent'
import { WarningFilled, Download } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { themeState } from '../../utils/themes'
import { agentToolManager } from '../../utils/agent-tool-manager'
import {
  createSnapshotFromHistoryEntry,
  serializeToolExecutionSnapshot
} from '../../utils/agent-tools/tool-serialization'
import * as monaco from 'monaco-editor'
import { setupMonacoWorker } from '../../utils/monaco-worker-config'

const props = defineProps<{
  message: ToolAgentMessage
  messages?: AgentMessage[]
  messageIndex?: number
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

// 参数编辑器相关
const paramsCollapseActive = ref<string[]>([]) // 默认折叠（空数组）
const paramsEditorId = ref(`tool-params-editor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
let paramsMonacoEditor: monaco.editor.IStandaloneCodeEditor | null = null

// 原始结果编辑器相关
const rawResultCollapseActive = ref<string[]>([]) // 默认折叠（空数组）
const rawResultEditorId = ref(`tool-raw-result-editor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
let rawResultMonacoEditor: monaco.editor.IStandaloneCodeEditor | null = null

// 获取工具调用参数（通过tool_call_id查找对应的assistant消息）
const toolCallParams = computed(() => {
  const toolMessage = props.message
  if (!toolMessage.tool_call_id || !props.messages || props.messageIndex === undefined) {
    // 如果message中有params字段，直接使用
    if ((toolMessage as any).params) {
      return (toolMessage as any).params
    }
    return null
  }

  // 从之前的消息中查找对应的assistant消息
  for (let i = props.messageIndex - 1; i >= 0; i--) {
    const msg = props.messages[i]
    if (msg.type === 'chat' && msg.role === 'assistant') {
      const chatMsg = msg as ChatAgentMessage
      if (chatMsg.tool_calls && Array.isArray(chatMsg.tool_calls)) {
        const toolCall = chatMsg.tool_calls.find(tc => tc.id === toolMessage.tool_call_id)
        if (toolCall && toolCall.parameters) {
          return toolCall.parameters
        }
      }
    }
    // 如果遇到下一个assistant消息，停止查找
    if (msg.role === 'assistant' && msg.type === 'chat') {
      break
    }
  }
  
  return null
})

// 参数JSON字符串
const paramsJsonString = computed(() => {
  const params = toolCallParams.value
  if (!params) {
    return '{}'
  }
  try {
    return JSON.stringify(params, null, 2)
  } catch (error) {
    return '{}'
  }
})

// 获取原始结果JSON（从outputs[0].data或result字段）
const rawResultJson = computed(() => {
  // 优先从第一个output的data获取
  if (props.message.outputs && props.message.outputs.length > 0) {
    const firstOutput = props.message.outputs[0]
    if (firstOutput.data) {
      try {
        // 如果data是对象，转换为JSON字符串
        if (typeof firstOutput.data === 'object') {
          return JSON.stringify(firstOutput.data, null, 2)
        }
        // 如果已经是字符串，尝试解析并重新格式化
        if (typeof firstOutput.data === 'string') {
          try {
            const parsed = JSON.parse(firstOutput.data)
            return JSON.stringify(parsed, null, 2)
          } catch {
            // 如果不是JSON字符串，直接返回
            return firstOutput.data
          }
        }
      } catch (error) {
        console.warn('[AgentToolResultCard] 无法序列化原始结果:', error)
      }
    }
  }
  
  // 如果没有outputs，检查是否有result字段
  if ((props.message as any).result) {
    try {
      const result = (props.message as any).result
      if (typeof result === 'object') {
        return JSON.stringify(result, null, 2)
      }
      if (typeof result === 'string') {
        try {
          const parsed = JSON.parse(result)
          return JSON.stringify(parsed, null, 2)
        } catch {
          return result
        }
      }
    } catch (error) {
      console.warn('[AgentToolResultCard] 无法序列化result字段:', error)
    }
  }
  
  return null
})

// 初始化参数编辑器
const initParamsEditor = async () => {
  if (paramsMonacoEditor) return
  
  await nextTick()
  
  const container = document.getElementById(paramsEditorId.value)
  if (!container) {
    console.warn('[AgentToolResultCard] 参数编辑器容器未找到')
    return
  }

  // 确保 Monaco Worker 已配置
  setupMonacoWorker()

  // 从全局获取编辑器实例（如果已存在则先销毁）
  const editors = monaco.editor.getEditors()
  const existingEditor = editors.find(e => {
    try {
      const editorContainer = e.getContainerDomNode()
      return editorContainer && editorContainer.id === paramsEditorId.value
    } catch {
      return false
    }
  })
  
  if (existingEditor) {
    existingEditor.dispose()
  }
  
  // 清理缓存（如果有）
  if (paramsMonacoEditor) {
    try {
      const editor = paramsMonacoEditor as monaco.editor.IStandaloneCodeEditor
      editor.dispose()
    } catch {
      // 忽略错误
    }
    paramsMonacoEditor = null
  }

  // 确保容器有ID
  container.id = paramsEditorId.value

  try {
    paramsMonacoEditor = monaco.editor.create(container, {
      value: paramsJsonString.value,
      language: 'json',
      theme: themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs',
      readOnly: true,
      lineNumbers: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      automaticLayout: true,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      renderLineHighlight: 'all',
      lineDecorationsWidth: 10
    })
  } catch (error) {
    console.error('[AgentToolResultCard] 创建参数编辑器失败:', error)
  }
}

// 清理参数编辑器
const disposeParamsEditor = () => {
  if (paramsMonacoEditor) {
    paramsMonacoEditor.dispose()
    paramsMonacoEditor = null
  }
}

// 初始化原始结果编辑器
const initRawResultEditor = async () => {
  if (rawResultMonacoEditor) return
  
  await nextTick()
  
  const container = document.getElementById(rawResultEditorId.value)
  if (!container) {
    console.warn('[AgentToolResultCard] 原始结果编辑器容器未找到')
    return
  }

  // 确保 Monaco Worker 已配置
  setupMonacoWorker()

  // 从全局获取编辑器实例（如果已存在则先销毁）
  const editors = monaco.editor.getEditors()
  const existingEditor = editors.find(e => {
    try {
      const editorContainer = e.getContainerDomNode()
      return editorContainer && editorContainer.id === rawResultEditorId.value
    } catch {
      return false
    }
  })
  
  if (existingEditor) {
    existingEditor.dispose()
  }
  
  // 清理缓存（如果有）
  if (rawResultMonacoEditor) {
    try {
      const editor = rawResultMonacoEditor as monaco.editor.IStandaloneCodeEditor
      editor.dispose()
    } catch {
      // 忽略错误
    }
    rawResultMonacoEditor = null
  }

  // 确保容器有ID
  container.id = rawResultEditorId.value

  try {
    rawResultMonacoEditor = monaco.editor.create(container, {
      value: rawResultJson.value || '{}',
      language: 'json',
      theme: themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs',
      readOnly: true,
      lineNumbers: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      automaticLayout: true,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      renderLineHighlight: 'all',
      lineDecorationsWidth: 10
    })
  } catch (error) {
    console.error('[AgentToolResultCard] 创建原始结果编辑器失败:', error)
  }
}

// 清理原始结果编辑器
const disposeRawResultEditor = () => {
  if (rawResultMonacoEditor) {
    rawResultMonacoEditor.dispose()
    rawResultMonacoEditor = null
  }
}

// 监听参数折叠状态变化
watch(paramsCollapseActive, async (newValue) => {
  if (newValue.includes('params')) {
    // 展开时才初始化编辑器
    await nextTick()
    initParamsEditor()
  } else {
    // 折叠时清理编辑器（可选，也可以保留）
    // disposeParamsEditor()
  }
})

// 监听原始结果折叠状态变化
watch(rawResultCollapseActive, async (newValue) => {
  if (newValue.includes('rawResult')) {
    // 展开时才初始化编辑器
    await nextTick()
    initRawResultEditor()
  } else {
    // 折叠时清理编辑器（可选，也可以保留）
    // disposeRawResultEditor()
  }
})

// 监听参数内容变化
watch(() => paramsJsonString.value, async (newValue) => {
  if (paramsMonacoEditor && newValue) {
    paramsMonacoEditor.setValue(newValue)
  } else if (paramsCollapseActive.value.includes('params')) {
    // 如果编辑器已经展开，重新初始化
    await nextTick()
    initParamsEditor()
  }
})

// 监听原始结果内容变化
watch(() => rawResultJson.value, async (newValue) => {
  if (rawResultMonacoEditor && newValue) {
    rawResultMonacoEditor.setValue(newValue || '{}')
  } else if (rawResultCollapseActive.value.includes('rawResult')) {
    // 如果编辑器已经展开，重新初始化
    await nextTick()
    initRawResultEditor()
  }
})

// 监听主题变化
watch(() => themeState.currentTheme.type, () => {
  if (paramsMonacoEditor) {
    const theme = themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs'
    monaco.editor.setTheme(theme)
  }
  if (rawResultMonacoEditor) {
    const theme = themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs'
    monaco.editor.setTheme(theme)
  }
})

onMounted(async () => {
  // 不自动初始化，等用户展开时才初始化
})

onBeforeUnmount(() => {
  disposeParamsEditor()
  disposeRawResultEditor()
})

const paramsEditorContainerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  height: '300px',
  minHeight: '200px'
}))

const rawResultEditorContainerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  height: '300px',
  minHeight: '200px'
}))

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
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

/* 确保工具结果卡片内的所有直接子元素都不会超出容器 */
.tool-result-card > * {
  max-width: 100%;
  box-sizing: border-box;
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
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
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
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: auto;
  overflow-y: visible;
}

/* 确保 Display 组件的根容器不会超出父容器 */
.output-body :deep(> *) {
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
}

/* 确保所有以 -display 结尾的类名的组件不会超出容器 */
.output-body :deep([class$="-display"]) {
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
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

.params-collapse {
  margin-bottom: 12px;
}

.params-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
}

.params-editor-container {
  border-radius: 6px;
  border: 1px solid v-bind('contentBorderColor');
  overflow: hidden;
}

.raw-result-collapse {
  margin-bottom: 12px;
}

.raw-result-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
}

.raw-result-editor-container {
  border-radius: 6px;
  border: 1px solid v-bind('contentBorderColor');
  overflow: hidden;
}
</style>

