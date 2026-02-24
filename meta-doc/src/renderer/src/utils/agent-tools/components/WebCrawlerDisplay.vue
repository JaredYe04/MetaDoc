<template>
  <div class="web-crawler-display" :style="containerStyle">
    <div
      v-if="displayData.stage === 'fetching' || displayData.stage === 'processing'"
      class="status-message"
      :style="statusMessageStyle"
    >
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ getStageMessage(displayData.stage) }}</span>
    </div>

    <div
      v-else-if="displayData.stage === 'completed' && resultData"
      class="completed-state"
      :style="completedStateStyle"
    >
      <div class="result-header" :style="headerStyle">
        <div class="header-info">
          <h3 class="result-title" :style="titleStyle">
            {{ $t('agent.display.webCrawler.title') }}
          </h3>
          <div class="result-meta" :style="metaStyle">
            <Badge
              :variant="
                resultData.status >= 200 && resultData.status < 300 ? 'default' : 'destructive'
              "
            >
              HTTP {{ resultData.status }} {{ resultData.statusText }}
            </Badge>
            <Badge variant="secondary"
              >{{ $t('agent.display.webCrawler.size') }}:
              {{ formatSize(resultData.size || 0) }}</Badge
            >
            <Badge variant="outline">{{ resultData.contentType }}</Badge>
          </div>
        </div>
        <div class="header-url" :style="urlStyle">
          <Link :href="resultData.url" target="_blank" type="primary">{{ resultData.url }}</Link>
        </div>
      </div>

      <Tabs v-model="activeTab" class="content-tabs border-card">
        <TabsList>
          <TabsTrigger value="render">{{ $t('agent.display.webCrawler.renderView') }}</TabsTrigger>
          <TabsTrigger value="raw">{{ $t('agent.display.webCrawler.rawContent') }}</TabsTrigger>
          <TabsTrigger value="headers">{{ $t('agent.display.webCrawler.headers') }}</TabsTrigger>
        </TabsList>
        <!-- 渲染视图 -->
        <TabsContent value="render">
          <ScrollArea class="max-h-[500px]">
            <div class="render-container">
              <!-- JSON 渲染 - 使用 Monaco 编辑器 -->
              <div v-if="isJsonContent" class="monaco-renderer" :style="rendererStyle">
                <div
                  :id="jsonEditorId"
                  class="monaco-editor-container"
                  :style="monacoEditorStyle"
                ></div>
              </div>
              <!-- HTML 渲染 -->
              <div v-else-if="isHtmlContent" class="html-renderer" :style="rendererStyle">
                <iframe
                  :srcdoc="sanitizedHtmlContent"
                  class="html-iframe"
                  frameborder="0"
                  sandbox="allow-same-origin allow-scripts"
                  @load="preventIframeNavigation"
                ></iframe>
              </div>
              <!-- XML 渲染 - 使用 Monaco 编辑器 -->
              <div v-else-if="isXmlContent" class="monaco-renderer" :style="rendererStyle">
                <div
                  :id="xmlEditorId"
                  class="monaco-editor-container"
                  :style="monacoEditorStyle"
                ></div>
              </div>
              <!-- 纯文本渲染 -->
              <div v-else class="text-renderer" :style="rendererStyle">
                <pre class="text-content" :style="codeStyle">{{ resultData.content }}</pre>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <!-- 原始内容 -->
        <TabsContent value="raw">
          <ScrollArea class="max-h-[500px]">
            <pre class="raw-content" :style="codeStyle">{{ resultData.content }}</pre>
          </ScrollArea>
        </TabsContent>

        <!-- 响应头 -->
        <TabsContent value="headers">
          <ScrollArea class="max-h-[500px]">
            <div class="headers-list" :style="headersStyle">
              <div
                v-for="(value, key) in resultData.headers"
                :key="key"
                class="header-item"
                :style="headerItemStyle"
              >
                <span class="header-key" :style="keyStyle">{{ key }}:</span>
                <span class="header-value" :style="valueStyle">{{ value }}</span>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>

    <div
      v-else-if="displayData.stage === 'error' || (props.status === 'failed' && !resultData)"
      class="error-state"
    >
      <Alert variant="destructive">
        <XCircle class="h-4 w-4" />
        <AlertTitle>{{
          displayData.error || props.error || $t('agent.display.webCrawler.error')
        }}</AlertTitle>
        <AlertDescription>
          <p>{{ displayData.error || props.error || $t('agent.display.webCrawler.error') }}</p>
          <p
            v-if="displayData.message"
            style="margin-top: 8px; font-size: 12px; color: var(--el-text-color-secondary)"
          >
            {{ displayData.message }}
          </p>
        </AlertDescription>
      </Alert>
    </div>

    <!-- 调试：显示原始数据（仅在开发环境） -->
    <div
      v-if="
        !resultData &&
        displayData.stage !== 'fetching' &&
        displayData.stage !== 'processing' &&
        displayData.stage !== 'error'
      "
      class="debug-info"
      style="padding: 16px; font-size: 12px; color: var(--el-text-color-secondary)"
    >
      <p>调试信息：无法解析结果数据</p>
      <details>
        <summary>显示原始数据</summary>
        <pre style="margin-top: 8px; font-size: 11px; overflow: auto; max-height: 200px">{{
          JSON.stringify(
            { displayData, propsData: props.data, realtimeData: realtimeData.value },
            null,
            2
          )
        }}</pre>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import type { ToolDisplayComponentProps } from '../../../types/agent-tool'
import { useToolDisplayRealtime, parseToolData } from '../composables/useToolDisplayRealtime'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/tabs'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Alert, AlertTitle, AlertDescription } from '../../../components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { XCircle } from 'lucide-vue-next'
import { Link } from '@renderer/components/ui/link'
import { themeState } from '../../themes'
import * as monaco from 'monaco-editor'
import { setupMonacoWorker } from '../../monaco-worker-config'

const { t } = useI18n()
const props = defineProps<ToolDisplayComponentProps>()

const { realtimeData, realtimeStatus, realtimeProgress } = useToolDisplayRealtime(
  props.invocationId,
  props.data,
  props.status,
  props.progress
)

const activeTab = ref('render')
const jsonEditorId = ref(
  `webcrawler-json-editor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
)
const xmlEditorId = ref(
  `webcrawler-xml-editor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
)
let jsonMonacoEditor: monaco.editor.IStandaloneCodeEditor | null = null
let xmlMonacoEditor: monaco.editor.IStandaloneCodeEditor | null = null

interface WebCrawlerResult {
  url: string
  status: number
  statusText: string
  headers: Record<string, string>
  content: string
  contentType: string
  size: number
}

const displayData = computed(() => {
  const data = realtimeData.value !== null ? realtimeData.value : props.data
  const parsed = parseToolData(data) as any

  if (parsed && typeof parsed === 'object') {
    const getStage = (): 'fetching' | 'processing' | 'completed' | 'error' => {
      if (parsed.stage) {
        return parsed.stage
      }
      if (props.status === 'succeeded') {
        return 'completed'
      }
      if (props.status === 'failed') {
        return 'error'
      }
      return 'fetching'
    }

    const stage = getStage()

    return {
      ...parsed,
      stage,
      // 确保错误信息被包含
      error: parsed.error || props.error || (stage === 'error' ? '未知错误' : undefined)
    }
  }

  const defaultStage =
    props.status === 'succeeded' ? 'completed' : props.status === 'failed' ? 'error' : 'fetching'
  return {
    stage: defaultStage,
    result: undefined,
    error: props.error || (defaultStage === 'error' ? '未知错误' : undefined)
  }
})

const resultData = computed((): WebCrawlerResult | null => {
  const data = realtimeData.value !== null ? realtimeData.value : props.data
  const parsed = parseToolData(data) as any

  if (parsed && typeof parsed === 'object') {
    // 尝试从多个可能的路径提取 result
    // 1. 直接从 parsed.result
    // 2. 从 parsed.content.result
    // 3. 从 parsed.data.result
    // 4. 从 parsed.content (如果包含所有必需字段)
    // 5. 从 parsed.data.content (根据 web-crawler-tool.ts 的返回结构)
    const result =
      parsed.result ||
      parsed.content?.result ||
      parsed.data?.result ||
      parsed.data?.content ||
      parsed.content

    if (result && typeof result === 'object') {
      // 检查是否包含必需的字段（url 和 status）
      // 注意：如果 stage === 'completed'，result 应该包含所有字段
      if (typeof result.url === 'string' && typeof result.status === 'number') {
        return {
          url: result.url,
          status: result.status,
          statusText: result.statusText || '',
          headers: result.headers || {},
          content: result.content || '',
          contentType: result.contentType || 'text/plain',
          size: result.size || (result.content ? new Blob([result.content]).size : 0)
        }
      }

      // 如果 stage === 'completed'，即使没有 url，也可能直接包含这些字段
      if (parsed.stage === 'completed' && typeof result.status === 'number') {
        return {
          url: result.url || parsed.url || '',
          status: result.status,
          statusText: result.statusText || '',
          headers: result.headers || {},
          content: result.content || '',
          contentType: result.contentType || 'text/plain',
          size: result.size || (result.content ? new Blob([result.content]).size : 0)
        }
      }
    }

    // 如果 parsed 本身包含了必需的字段（可能在 stage === 'completed' 时）
    if (parsed.stage === 'completed' && typeof parsed.status === 'number') {
      return {
        url: parsed.url || '',
        status: parsed.status,
        statusText: parsed.statusText || '',
        headers: parsed.headers || {},
        content: parsed.content || '',
        contentType: parsed.contentType || 'text/plain',
        size: parsed.size || (parsed.content ? new Blob([parsed.content]).size : 0)
      }
    }
  }

  // 如果从实时数据无法获取，尝试从 props.data 直接解析
  if (props.data) {
    const propsParsed = parseToolData(props.data) as any
    if (propsParsed && typeof propsParsed === 'object') {
      const result =
        propsParsed.result ||
        propsParsed.content?.result ||
        propsParsed.data?.result ||
        propsParsed.data?.content ||
        propsParsed.content

      if (
        result &&
        typeof result === 'object' &&
        typeof result.url === 'string' &&
        typeof result.status === 'number'
      ) {
        return {
          url: result.url,
          status: result.status,
          statusText: result.statusText || '',
          headers: result.headers || {},
          content: result.content || '',
          contentType: result.contentType || 'text/plain',
          size: result.size || (result.content ? new Blob([result.content]).size : 0)
        }
      }

      // 如果 propsParsed 本身包含了必需的字段
      if (propsParsed.stage === 'completed' && typeof propsParsed.status === 'number') {
        return {
          url: propsParsed.url || '',
          status: propsParsed.status,
          statusText: propsParsed.statusText || '',
          headers: propsParsed.headers || {},
          content: propsParsed.content || '',
          contentType: propsParsed.contentType || 'text/plain',
          size: propsParsed.size || (propsParsed.content ? new Blob([propsParsed.content]).size : 0)
        }
      }
    }
  }

  return null
})

const isJsonContent = computed(() => {
  if (!resultData.value) return false
  const contentType = resultData.value.contentType || ''
  const content = resultData.value.content || ''
  // 检查 content-type 或内容本身
  if (contentType.includes('application/json') || contentType.includes('text/json')) {
    return true
  }
  // 尝试解析内容判断是否为 JSON
  if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
    try {
      JSON.parse(content)
      return true
    } catch {
      return false
    }
  }
  return false
})

const isHtmlContent = computed(() => {
  if (!resultData.value) return false
  const contentType = resultData.value.contentType || ''
  return contentType.includes('text/html')
})

const isXmlContent = computed(() => {
  if (!resultData.value) return false
  const contentType = resultData.value.contentType || ''
  return (
    contentType.includes('application/xml') ||
    contentType.includes('text/xml') ||
    resultData.value.content.trim().startsWith('<?xml') ||
    resultData.value.content.trim().startsWith('<')
  )
})

// 获取格式化的 JSON 内容
const formattedJsonContent = computed(() => {
  if (!resultData.value || !isJsonContent.value) return ''
  try {
    const parsed = JSON.parse(resultData.value.content)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return resultData.value.content
  }
})

// 获取格式化的 XML 内容
const formattedXmlContent = computed(() => {
  if (!resultData.value || !isXmlContent.value) return ''
  return resultData.value.content || ''
})

// 获取经过处理的 HTML 内容（防止跳转）
const sanitizedHtmlContent = computed(() => {
  if (!resultData.value || !isHtmlContent.value) return ''
  let html = resultData.value.content || ''

  // 为所有链接添加 target="_blank" 和禁用默认行为
  html = html.replace(/<a\s+([^>]*?)>/gi, (match, attrs) => {
    // 如果已经有 target 属性，替换它
    attrs = attrs.replace(/target\s*=\s*["'][^"']*["']/gi, '')
    // 添加 target="_blank" 和 onclick 阻止默认行为
    return `<a ${attrs} target="_blank" onclick="event.preventDefault(); return false;" style="pointer-events: none; cursor: default;">`
  })

  // 添加一个全局脚本，阻止所有链接的默认行为
  const preventNavScript = `
    <script>
      (function() {
        document.addEventListener('click', function(e) {
          if (e.target.tagName === 'A' || e.target.closest('a')) {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }
        }, true);
        // 阻止表单提交
        document.addEventListener('submit', function(e) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }, true);
      })();
    <\/script>
  `

  // 将脚本插入到 head 或 body 开头
  if (html.includes('</head>')) {
    html = html.replace('</head>', preventNavScript + '</head>')
  } else if (html.includes('<body')) {
    html = html.replace('<body', preventNavScript + '<body')
  } else {
    html = preventNavScript + html
  }

  return html
})

// 防止 iframe 内导航
const preventIframeNavigation = (event: Event) => {
  const iframe = event.target as HTMLIFrameElement
  if (iframe && iframe.contentWindow) {
    try {
      // 监听 iframe 内的链接点击
      iframe.contentWindow.addEventListener(
        'click',
        (e) => {
          e.preventDefault()
          e.stopPropagation()
        },
        true
      )
    } catch (error) {
      // 跨域限制，无法访问 iframe 内容
      console.warn('无法阻止 iframe 导航，可能是跨域限制:', error)
    }
  }
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const getStageMessage = (stage: string) => {
  if (stage === 'fetching') return t('agent.display.webCrawler.fetching')
  if (stage === 'processing') return t('agent.display.webCrawler.processing')
  return t('agent.display.webCrawler.loading')
}

const containerStyle = computed(() => ({
  padding: '16px',
  backgroundColor: 'transparent',
  borderRadius: '0',
  color: themeState.currentTheme.textColor
}))

const statusMessageStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '20px',
  textAlign: 'center' as const,
  justifyContent: 'center'
}))

const completedStateStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const headerStyle = computed(() => ({
  marginBottom: '16px',
  paddingBottom: '12px',
  borderBottom: `1px solid ${themeState.currentTheme.textColor2}20`,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '12px'
}))

const titleStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  margin: 0
}))

const metaStyle = computed(() => ({
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap' as const
}))

const urlStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '13px',
  wordBreak: 'break-all' as const
}))

const rendererStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  borderRadius: '6px',
  overflow: 'hidden'
}))

const codeStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  fontFamily: 'JetBrains Mono, Consolas, monospace',
  fontSize: '13px',
  lineHeight: '1.6',
  padding: '16px',
  margin: 0,
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-word' as const,
  overflowX: 'auto' as const
}))

const headersStyle = computed(() => ({
  padding: '16px'
}))

const headerItemStyle = computed(() => ({
  display: 'flex',
  padding: '8px 0',
  borderBottom: `1px solid ${themeState.currentTheme.textColor2}10`
}))

const keyStyle = computed(() => ({
  color: '#409EFF', // Element Plus 默认主色
  fontWeight: '500',
  minWidth: '200px',
  fontFamily: 'monospace',
  fontSize: '13px'
}))

const valueStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  fontSize: '13px',
  wordBreak: 'break-all' as const
}))

const monacoEditorStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  height: '500px',
  width: '100%'
}))

// 初始化 JSON Monaco 编辑器
const initJsonMonacoEditor = async () => {
  if (!isJsonContent.value || !resultData.value || !formattedJsonContent.value) return

  // 确保 Monaco Worker 已配置
  setupMonacoWorker()

  await nextTick()

  const container = document.getElementById(jsonEditorId.value)
  if (!container) {
    console.warn('JSON Monaco编辑器容器未找到')
    return
  }

  // 从全局获取编辑器实例（如果已存在则先销毁）
  const editors = monaco.editor.getEditors()
  const existingEditor = editors.find((e) => {
    const editorContainer = e.getContainerDomNode()
    return editorContainer && editorContainer.id === jsonEditorId.value
  })

  if (existingEditor) {
    existingEditor.dispose()
  }

  // 创建 Monaco 编辑器
  jsonMonacoEditor = monaco.editor.create(container, {
    value: formattedJsonContent.value,
    language: 'json',
    theme: themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs',
    readOnly: true,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    fontSize: 13,
    fontFamily: 'JetBrains Mono, Consolas, monospace'
  })

  // 确保容器有 ID
  if (container) {
    container.id = jsonEditorId.value
  }
}

// 初始化 XML Monaco 编辑器
const initXmlMonacoEditor = async () => {
  if (!isXmlContent.value || !resultData.value || !formattedXmlContent.value) return

  // 确保 Monaco Worker 已配置
  setupMonacoWorker()

  await nextTick()

  const container = document.getElementById(xmlEditorId.value)
  if (!container) {
    console.warn('XML Monaco编辑器容器未找到')
    return
  }

  // 从全局获取编辑器实例（如果已存在则先销毁）
  const editors = monaco.editor.getEditors()
  const existingEditor = editors.find((e) => {
    const editorContainer = e.getContainerDomNode()
    return editorContainer && editorContainer.id === xmlEditorId.value
  })

  if (existingEditor) {
    existingEditor.dispose()
  }

  // 创建 Monaco 编辑器
  xmlMonacoEditor = monaco.editor.create(container, {
    value: formattedXmlContent.value,
    language: 'xml',
    theme: themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs',
    readOnly: true,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    fontSize: 13,
    fontFamily: 'JetBrains Mono, Consolas, monospace'
  })

  // 确保容器有 ID
  if (container) {
    container.id = xmlEditorId.value
  }
}

// 销毁编辑器
const disposeJsonMonacoEditor = () => {
  if (jsonMonacoEditor) {
    jsonMonacoEditor.dispose()
    jsonMonacoEditor = null
  }
}

const disposeXmlMonacoEditor = () => {
  if (xmlMonacoEditor) {
    xmlMonacoEditor.dispose()
    xmlMonacoEditor = null
  }
}

// 监听内容变化，重新初始化编辑器
watch(
  [() => isJsonContent.value, () => formattedJsonContent.value, () => activeTab.value],
  async () => {
    if (isJsonContent.value && activeTab.value === 'render') {
      await nextTick()
      initJsonMonacoEditor()
    } else {
      disposeJsonMonacoEditor()
    }
  },
  { immediate: true }
)

watch(
  [() => isXmlContent.value, () => formattedXmlContent.value, () => activeTab.value],
  async () => {
    if (isXmlContent.value && activeTab.value === 'render') {
      await nextTick()
      initXmlMonacoEditor()
    } else {
      disposeXmlMonacoEditor()
    }
  },
  { immediate: true }
)

// 监听主题变化
watch(
  () => themeState.currentTheme.type,
  () => {
    const theme = themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs'
    monaco.editor.setTheme(theme)

    // 更新编辑器内容（如果内容变化）
    if (jsonMonacoEditor && formattedJsonContent.value) {
      jsonMonacoEditor.setValue(formattedJsonContent.value)
    }
    if (xmlMonacoEditor && formattedXmlContent.value) {
      xmlMonacoEditor.setValue(formattedXmlContent.value)
    }
  }
)

onMounted(async () => {
  if (isJsonContent.value && activeTab.value === 'render') {
    await nextTick()
    initJsonMonacoEditor()
  }
  if (isXmlContent.value && activeTab.value === 'render') {
    await nextTick()
    initXmlMonacoEditor()
  }
})

onBeforeUnmount(() => {
  disposeJsonMonacoEditor()
  disposeXmlMonacoEditor()
})
</script>

<style scoped>
.web-crawler-display {
  width: 100%;
}

.render-container {
  padding: 16px;
}

.json-content,
.xml-content,
.text-content {
  background-color: v-bind('themeState.currentTheme.background2nd');
  border-radius: 6px;
  overflow-x: auto;
}

.html-iframe {
  width: 100%;
  height: 500px;
  border: none;
  background-color: white;
}

.is-loading {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.header-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.content-tabs {
  margin-top: 16px;
}

.monaco-renderer {
  width: 100%;
  height: 500px;
}

.monaco-editor-container {
  width: 100%;
  height: 100%;
}

.html-iframe {
  width: 100%;
  height: 500px;
  border: none;
  background-color: v-bind('themeState.currentTheme.background');
}
</style>
