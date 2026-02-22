<template>
  <div class="tool-result-card" :class="[`status-${message.status}`]" :style="cardStyle">
    <header class="tool-result-header">
      <div class="title-block">
        <span class="tool-name">{{ message.tool.name }}</span>
        <Badge size="small" :type="statusTagType">{{ statusLabel }}</Badge>
      </div>
      <div class="header-actions">
        <Button
          type="ghost"
          size="sm"
          @click="exportSnapshot"
          :title="t('agent.tool.exportSnapshot')"
        >
          <Download />
          {{ t('agent.tool.exportSnapshot') }}
        </Button>
        <small class="timestamp">{{ formatTimestamp(message.timestamp) }}</small>
      </div>
    </header>

    <!-- 工具调用参数（默认折叠，仅在存在参数时显示） -->
    <Collapsible
      v-if="toolCallParams !== null"
      v-model:open="paramsCollapseOpen"
      class="params-collapse"
    >
      <CollapsibleTrigger class="collapsible-trigger">
        <div class="params-title">
          <span>{{ t('agent.tool.params', '调用参数') }}</span>
          <Badge size="small" variant="secondary">JSON</Badge>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          :id="paramsEditorId"
          class="params-editor-container"
          :style="paramsEditorContainerStyle"
        ></div>
      </CollapsibleContent>
    </Collapsible>

    <!-- 原始结果（JSON，默认折叠） -->
    <Collapsible
      v-if="rawResultJson !== null"
      v-model:open="rawResultCollapseOpen"
      class="raw-result-collapse"
    >
      <CollapsibleTrigger class="collapsible-trigger">
        <div class="raw-result-title">
          <span>{{ t('agent.tool.rawResult', '原始结果') }}</span>
          <Badge size="small" variant="secondary">JSON</Badge>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          :id="rawResultEditorId"
          class="raw-result-editor-container"
          :style="rawResultEditorContainerStyle"
        ></div>
      </CollapsibleContent>
    </Collapsible>

    <!-- 进度条 -->
    <div v-if="message.progress && message.progress.percentage > 0" class="progress-container">
      <Progress
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
      </Progress>
    </div>

    <div class="outputs">
      <Collapsible
        v-for="output in message.outputs"
        :key="output.id"
        v-model:open="outputCollapseState[output.id]"
        class="output-collapsible"
      >
        <CollapsibleTrigger class="collapsible-trigger">
          <div class="output-title">
            <span>{{ output.label }}</span>
            <Badge size="small" variant="secondary">{{ output.format }}</Badge>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
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
        </CollapsibleContent>
      </Collapsible>
    </div>

    <div v-if="message.error" class="error-block">
      <el-icon><WarningFilled /></el-icon>
      <span>{{ message.error }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  ref,
  reactive,
  watch,
  defineAsyncComponent,
  h,
  onMounted,
  onBeforeUnmount,
  nextTick
} from 'vue'
import { dayjs, ElMessage } from 'element-plus'
import type {
  ToolAgentMessage,
  ToolOutputDescriptor,
  AgentMessage,
  ChatAgentMessage
} from '../../types/agent'
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
import { createRendererLogger } from '../../utils/logger'
import messageBridge from '../../bridge/message-bridge'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { Progress } from '@renderer/components/ui/progress'

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
  const logger = createRendererLogger('AgentToolResultCard')
  // 这里可以触发Tool的更新回调
  // 具体实现取决于交互需求
  logger.debug('Component update:', data)
}

// 处理组件取消
const handleComponentCancel = () => {
  const logger = createRendererLogger('AgentToolResultCard')
  // 取消Tool执行
  // 需要从message中获取invocationId
  logger.debug('Component cancel')
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

// 输出折叠状态管理（accordion-like behavior: 只有一个可以展开）
const outputCollapseState = reactive<Record<string, boolean>>({})

// 初始化所有输出为展开状态
watch(
  () => props.message.outputs,
  () => {
    props.message.outputs.forEach((output) => {
      if (!(output.id in outputCollapseState)) {
        outputCollapseState[output.id] = true
      }
    })
  },
  { immediate: true }
)

// 参数编辑器相关
const paramsCollapseOpen = ref(false) // 默认折叠（false）
const paramsEditorId = ref(
  `tool-params-editor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
)
let paramsMonacoEditor: monaco.editor.IStandaloneCodeEditor | null = null

// 原始结果编辑器相关
const rawResultCollapseOpen = ref(false) // 默认折叠（false）
const rawResultEditorId = ref(
  `tool-raw-result-editor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
)
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
        const toolCall = chatMsg.tool_calls.find((tc) => tc.id === toolMessage.tool_call_id)
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
  const existingEditor = editors.find((e) => {
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
  const existingEditor = editors.find((e) => {
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
watch(paramsCollapseOpen, async (newValue) => {
  if (newValue) {
    // 展开时才初始化编辑器
    await nextTick()
    initParamsEditor()
  } else {
    // 折叠时清理编辑器（可选，也可以保留）
    // disposeParamsEditor()
  }
})

// 监听原始结果折叠状态变化
watch(rawResultCollapseOpen, async (newValue) => {
  if (newValue) {
    // 展开时才初始化编辑器
    await nextTick()
    initRawResultEditor()
  } else {
    // 折叠时清理编辑器（可选，也可以保留）
    // disposeRawResultEditor()
  }
})

// 监听参数内容变化
watch(
  () => paramsJsonString.value,
  async (newValue) => {
    if (paramsMonacoEditor && newValue) {
      paramsMonacoEditor.setValue(newValue)
    } else if (paramsCollapseOpen.value) {
      // 如果编辑器已经展开，重新初始化
      await nextTick()
      initParamsEditor()
    }
  }
)

// 监听原始结果内容变化
watch(
  () => rawResultJson.value,
  async (newValue) => {
    if (rawResultMonacoEditor && newValue) {
      rawResultMonacoEditor.setValue(newValue || '{}')
    } else if (rawResultCollapseOpen.value) {
      // 如果编辑器已经展开，重新初始化
      await nextTick()
      initRawResultEditor()
    }
  }
)

// 监听主题变化
watch(
  () => themeState.currentTheme.type,
  () => {
    if (paramsMonacoEditor) {
      const theme = themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs'
      monaco.editor.setTheme(theme)
    }
    if (rawResultMonacoEditor) {
      const theme = themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs'
      monaco.editor.setTheme(theme)
    }
  }
)

onMounted(async () => {
  // 不自动初始化，等用户展开时才初始化
})

onBeforeUnmount(() => {
  disposeParamsEditor()
  disposeRawResultEditor()
})

const paramsEditorContainerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  height: '300px',
  minHeight: '200px'
}))

const rawResultEditorContainerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
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
  themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)'
)

const contentBorderColor = computed(() =>
  themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
)

const cardStyle = computed(() => ({
  backgroundColor: 'transparent',
  color: themeState.currentTheme.textColor,
  borderColor: 'transparent'
}))

const outputBodyStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  borderColor: contentBorderColor.value
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
    const name = displayComponent.name || displayComponent.__name || displayComponent.displayName

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
      OutlineTreeDisplay: () => import('../../utils/agent-tools/components/OutlineTreeDisplay.vue')
      // 可以添加更多组件的映射
    }

    const componentLoader = componentMap[renderer]
    if (componentLoader) {
      return defineAsyncComponent(componentLoader)
    }

    // 如果不在映射表中，尝试使用组件名称作为路径（假设在 components 目录下）
    try {
      return defineAsyncComponent(
        () => import(`../../utils/agent-tools/components/${renderer}.vue`)
      )
    } catch {
      console.warn(`无法加载组件: ${renderer}`)
      return null
    }
  }

  // 如果已经是组件对象，直接返回
  if (
    typeof renderer === 'object' &&
    ('setup' in renderer || 'render' in renderer || 'name' in renderer)
  ) {
    return renderer
  }

  return null
}

// 导出执行快照
const exportSnapshot = async () => {
  try {
    // 从message创建快照
    // 优先使用toolCallParams（从assistant消息的tool_calls中提取），如果没有则使用message中的params
    const params = toolCallParams.value || (props.message as any).params || {}

    // 获取工具配置（优先使用 toolConfig.value，如果不存在则从 agentToolManager 获取）
    let effectiveToolConfig = toolConfig.value
    if (!effectiveToolConfig) {
      const tool = agentToolManager.getTool(props.message.tool.id)
      effectiveToolConfig = tool?.config
    }

    // 获取 displayComponent（优先从 toolConfig，其次从 outputs 的 renderer）
    let displayComponentName: string | undefined = undefined
    if (effectiveToolConfig?.displayComponent) {
      displayComponentName = extractComponentName(effectiveToolConfig.displayComponent)
    } else if (props.message.outputs?.[0]?.renderer) {
      // 如果 toolConfig 中没有，尝试从 outputs 中获取
      displayComponentName = props.message.outputs[0].renderer
    }

    const snapshot = createSnapshotFromHistoryEntry(
      {
        toolId: props.message.tool.id,
        toolName: props.message.tool.name,
        timestamp: new Date(props.message.timestamp).getTime(),
        status: props.message.status,
        params: params, // 确保包含输入参数
        result: props.message.outputs?.[0]?.data,
        data: props.message.outputs?.[0]?.data
          ? {
              content: props.message.outputs?.[0]?.data,
              format: (props.message.outputs?.[0]?.format === 'table'
                ? 'json'
                : props.message.outputs?.[0]?.format || 'json') as
                | 'json'
                | 'text'
                | 'markdown'
                | 'xml'
                | 'html'
                | 'custom',
              componentName: props.message.outputs?.[0]?.renderer || displayComponentName
            }
          : undefined,
        progress: props.message.progress,
        error: props.message.error,
        outputs: props.message.outputs?.map((output) => ({
          id: output.id,
          label: output.label,
          format: output.format,
          data: output.data,
          timestamp: new Date(props.message.timestamp).getTime()
        })),
        invocationId: (props.message as any).invocationId
      },
      effectiveToolConfig
        ? {
            id: effectiveToolConfig.id,
            name: effectiveToolConfig.name,
            description: effectiveToolConfig.description,
            origin: effectiveToolConfig.origin,
            displayComponent: displayComponentName
          }
        : displayComponentName
          ? {
              id: props.message.tool.id,
              name: props.message.tool.name,
              description: {
                zh_cn: { name: props.message.tool.name },
                en_us: { name: props.message.tool.name }
              },
              origin: 'internal' as const,
              displayComponent: displayComponentName
            }
          : undefined
    )

    // 序列化快照
    const serialized = serializeToolExecutionSnapshot(snapshot)

    const fileName = `tool-snapshot-${snapshot.toolId}-${snapshot.timestamp}.json`

    const logger = createRendererLogger('AgentToolResultCard')
    logger.debug('[导出快照] 开始调用保存文件对话框，文件名:', fileName)

    // 通过消息桥调用保存文件对话框
    const result = await messageBridge.invoke('save-json-file', serialized, fileName)

    logger.debug('[导出快照] 保存文件对话框返回结果:', result)

    if (!result) {
      console.error('[导出快照] 保存文件调用返回空结果')
      throw new Error('保存文件调用返回空结果')
    }

    if (result.success) {
      logger.debug('[导出快照] 文件保存成功，路径:', result.path)
      ElMessage.success(t('agent.tool.exportSnapshotSuccess'))
    } else {
      // 用户取消对话框，不显示错误
      if (result.canceled) {
        logger.debug('[导出快照] 用户取消了保存对话框')
        return
      }
      // 其他错误，显示错误消息
      console.error('[导出快照] 保存失败:', result.error)
      throw new Error(result.error || '保存失败')
    }
  } catch (error) {
    console.error('导出快照失败:', error)
    ElMessage.error(
      `${t('agent.tool.exportSnapshotFailed')}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
</script>

<style scoped>
.tool-result-card {
  border-radius: 0;
  padding: 4px 0;
  border: none;
  background-color: transparent;
  transition: none;
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
  border-color: transparent;
  box-shadow: none;
}

.tool-result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
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

.output-collapsible {
  margin-bottom: 8px;
}

.collapsible-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  padding: 10px 12px;
  background-color: v-bind('themeState.currentTheme.background2nd');
  color: v-bind('themeState.currentTheme.textColor');
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.collapsible-trigger:hover {
  background-color: v-bind('themeState.currentTheme.background2ndHover || themeState.currentTheme.background2nd');
}

.output-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
}

.output-body {
  border-radius: 8px;
  padding: 0;
  font-size: 13px;
  border: 1px solid;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  margin: 0;
  /* 确保圆角边缘的背景色正确 */
  background-color: v-bind('themeState.currentTheme.background2nd');
}

/* 确保 Display 组件的根容器不会超出父容器 */
.output-body :deep(> *) {
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  display: block;
}

/* 确保所有以 -display 结尾的类名的组件不会超出容器 */
.output-body :deep([class$='-display']) {
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  display: block;
  margin-bottom: 0 !important;
}

/* 消除所有子元素的底部空隙 */
.output-body :deep(*) {
  margin-bottom: 0;
}

.output-body :deep(*:last-child) {
  margin-bottom: 0 !important;
  padding-bottom: 0 !important;
}

/* 消除pre标签的底部空隙 */
.output-body :deep(pre) {
  margin: 0;
  padding: 12px;
  background-color: v-bind('themeState.currentTheme.background2nd');
}

/* 确保monaco编辑器容器没有底部空隙 */
.output-body :deep(.monaco-editor),
.output-body :deep(.monaco-editor-container) {
  margin: 0;
}

/* 消除display组件内部可能存在的底部间距 */
.output-body :deep([class*='display']) {
  margin-bottom: 0 !important;
}

.output-body :deep([class*='display'] > *:last-child) {
  margin-bottom: 0 !important;
  padding-bottom: 0 !important;
}

/* 确保所有内部容器都没有底部空隙 */
.output-body :deep(div),
.output-body :deep(section),
.output-body :deep(article) {
  margin-bottom: 0;
}

.output-body :deep(div:last-child),
.output-body :deep(section:last-child),
.output-body :deep(article:last-child) {
  margin-bottom: 0 !important;
}

.raw-text {
  margin: 0;
  padding: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--code-font-family, 'JetBrains Mono', monospace);
  background-color: v-bind('themeState.currentTheme.background2nd');
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
  border-color: transparent;
}
.status-running {
  border-color: transparent;
}
.status-succeeded {
  border-color: transparent;
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
  margin: 0;
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
  margin: 0;
}
</style>
