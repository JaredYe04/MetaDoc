<template>
  <div class="auto-test-result-display" :style="containerStyle">
    <div class="test-summary">
      <Statistic :title="$t('agent.display.autoTest.totalTests')" :value="effectiveSummary.total" />
      <Statistic :title="$t('agent.display.autoTest.passed')" :value="effectiveSummary.passed">
        <template #suffix>
          <Badge class="ml-2"> {{ effectiveSummary.passedRate }}% </Badge>
        </template>
      </Statistic>
      <Statistic :title="$t('agent.display.autoTest.failed')" :value="effectiveSummary.failed">
        <template #suffix>
          <Badge variant="destructive" class="ml-2"> {{ effectiveSummary.failedRate }}% </Badge>
        </template>
      </Statistic>
      <Statistic :title="$t('agent.display.autoTest.duration')" :value="effectiveSummary.duration">
        <template #suffix>ms</template>
      </Statistic>
    </div>

    <Divider />

    <div class="test-actions">
      <Button @click="copyMarkdown">
        <Document class="w-4 h-4 mr-1" />
        {{ $t('agent.display.autoTest.copyMarkdown') }}
      </Button>
      <Button variant="outline" @click="downloadMarkdown">
        <Download class="w-4 h-4 mr-1" />
        {{ $t('agent.display.autoTest.downloadMarkdown') }}
      </Button>
    </div>

    <Divider />

    <Tabs v-model="activeTab" class="auto-test-tabs">
      <TabsList class="w-full grid grid-cols-2">
        <TabsTrigger value="results">{{ $t('agent.display.autoTest.testResults') }}</TabsTrigger>
        <TabsTrigger value="markdown">{{
          $t('agent.display.autoTest.markdownSummary')
        }}</TabsTrigger>
      </TabsList>

      <TabsContent value="results" class="auto-test-tabs-content">
        <ScrollArea class="h-full">
          <div class="test-results-list">
            <div
              v-for="(result, index) in effectiveTestResults"
              :key="index"
              class="test-result-item"
              :class="{
                'test-passed': result.passed,
                'test-failed': !result.passed
              }"
              :style="getTestResultItemStyle(result.passed) as any"
            >
              <div class="test-result-header">
                <div class="test-result-title">
                  <el-icon :class="result.passed ? 'success-icon' : 'error-icon'">
                    <Check v-if="result.passed" />
                    <Close v-else />
                  </el-icon>
                  <span class="test-name" :style="testNameStyle"
                    >{{ result.toolName }} - {{ result.testCaseName }}</span
                  >
                  <TooltipProvider v-if="result.testCaseId">
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Badge
                          variant="outline"
                          class="test-case-id-tag"
                          @click.stop="copyTestCaseId(result.testCaseId)"
                          style="cursor: pointer; margin-left: 8px; user-select: none"
                        >
                          <CopyDocument class="w-3 h-3 mr-1" />
                          {{ result.testCaseId }}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{{ $t('agent.display.autoTest.clickToCopy') }}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div class="test-result-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    @click="exportResultSnapshot(result)"
                    :title="$t('agent.tool.exportSnapshot')"
                  >
                    <Download class="w-4 h-4 mr-1" />
                    {{ $t('agent.tool.exportSnapshot') }}
                  </Button>
                  <Badge :variant="result.passed ? 'default' : 'destructive'">
                    {{
                      result.passed
                        ? $t('agent.display.autoTest.passed')
                        : $t('agent.display.autoTest.failed')
                    }}
                  </Badge>
                </div>
              </div>

              <div v-if="result.params" class="test-params" :style="testSectionStyle">
                <strong :style="sectionLabelStyle"
                  >{{ $t('agent.display.autoTest.params') }}:</strong
                >
                <pre :style="preStyle">{{ JSON.stringify(result.params, null, 2) }}</pre>
              </div>

              <div
                v-if="!result.passed && result.error"
                class="test-error"
                :style="testSectionStyle"
              >
                <strong :style="sectionLabelStyle"
                  >{{ $t('agent.display.autoTest.error') }}:</strong
                >
                <pre :style="errorPreStyle">{{ result.error }}</pre>
              </div>

              <div v-if="result.result" class="test-result-data" :style="testSectionStyle">
                <strong :style="sectionLabelStyle"
                  >{{ $t('agent.display.autoTest.result') }}:</strong
                >
                <!-- 如果有Display组件，使用组件渲染 -->
                <component
                  v-if="getDisplayComponentForTool(result.toolId)"
                  :is="getDisplayComponentForTool(result.toolId)"
                  :data="
                    formatDataForDisplay(result.result, result.passed ? 'succeeded' : 'failed')
                  "
                  :status="result.passed ? 'succeeded' : 'failed'"
                  :error="result.error"
                  :tool-config="getToolConfig(result.toolId)"
                  :invocation-id="result.invocationId"
                />
                <!-- 否则使用纯文本渲染 -->
                <pre v-else :style="preStyle">{{ formatResult(result.result) }}</pre>
              </div>

              <div
                v-if="result.duration !== undefined"
                class="test-duration"
                :style="testDurationStyle"
              >
                {{ $t('agent.display.autoTest.executionTime') }}: {{ result.duration }}ms
              </div>
            </div>
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="markdown" class="auto-test-tabs-content">
        <ScrollArea class="h-full">
          <div class="markdown-content" :style="markdownContentStyle">
            <div
              ref="markdownContainerRef"
              class="markdown-render-container"
              :style="{
                color: themeState.currentTheme.textColor
              }"
            ></div>
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Divider } from '@renderer/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@renderer/components/ui/tooltip'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@renderer/components/ui/tabs'
import { Statistic } from '@renderer/components/ui/statistic'
import { useI18n } from 'vue-i18n'
import { Document, Download, Check, Close, CopyDocument } from '@element-plus/icons-vue'
import {
  createSnapshotFromHistoryEntry,
  serializeToolExecutionSnapshot
} from '../tool-serialization'
import { themeState } from '../../themes'
import { agentToolManager } from '../../agent-tool-manager'
import { renderMarkdownPreview } from '../../md-utils'
// 导入所有Display组件
import ChartGenerationDisplay from './ChartGenerationDisplay.vue'
import RAGToolDisplay from './RAGToolDisplay.vue'
import TodoListDisplay from './TodoListDisplay.vue'
import DataAnalysisDisplay from './DataAnalysisDisplay.vue'
import TerminalExecutionDisplay from './TerminalExecutionDisplay.vue'
import DiffDisplay from './DiffDisplay.vue'
import GrepDisplay from './GrepDisplay.vue'
import ProofreadDisplay from './ProofreadDisplay.vue'
import EditDisplay from './EditDisplay.vue'
import MetadataDisplay from './MetadataDisplay.vue'
import OutlineTreeDisplay from './OutlineTreeDisplay.vue'
import OutlineOptimizeDisplay from './OutlineOptimizeDisplay.vue'
import messageBridge from '../../../bridge/message-bridge'
import ColorDisplay from './ColorDisplay.vue'
import TimestampDisplay from './TimestampDisplay.vue'
import { createRendererLogger } from '../../logger'

const { t } = useI18n()

// Display组件映射
const displayComponentMap: Record<string, any> = {
  ChartGenerationDisplay: ChartGenerationDisplay,
  RAGToolDisplay: RAGToolDisplay,
  TodoListDisplay: TodoListDisplay,
  DataAnalysisDisplay: DataAnalysisDisplay,
  TerminalExecutionDisplay: TerminalExecutionDisplay,
  DiffDisplay: DiffDisplay,
  GrepDisplay: GrepDisplay,
  ProofreadDisplay: ProofreadDisplay,
  EditDisplay: EditDisplay,
  MetadataDisplay: MetadataDisplay,
  OutlineTreeDisplay: OutlineTreeDisplay,
  OutlineOptimizeDisplay: OutlineOptimizeDisplay,
  ColorDisplay: ColorDisplay,
  TimestampDisplay: TimestampDisplay
}

// 获取Tool的Display组件
const getDisplayComponentForTool = (toolId: string) => {
  try {
    const tool = agentToolManager.getTool(toolId)
    if (!tool || !tool.config.displayComponent) {
      return null
    }

    const displayComponent = tool.config.displayComponent
    if (typeof displayComponent === 'string') {
      const component = displayComponentMap[displayComponent]
      if (!component) {
        console.warn(
          `Display component "${displayComponent}" not found in displayComponentMap for tool "${toolId}"`
        )
        return null
      }
      return component
    }

    // 如果是组件对象，尝试获取组件名称
    const componentName =
      (displayComponent as any)?.name ||
      (displayComponent as any)?.__name ||
      (displayComponent as any)?.__file
    if (componentName) {
      const component = displayComponentMap[componentName] || displayComponent
      // 验证组件是否有效
      if (!component || (typeof component === 'object' && !component.setup && !component.render)) {
        console.warn(`Invalid display component for tool "${toolId}":`, componentName)
        return null
      }
      return component
    }

    // 直接返回组件，但需要验证
    if (
      !displayComponent ||
      (typeof displayComponent === 'object' && !displayComponent.setup && !displayComponent.render)
    ) {
      console.warn(`Invalid display component object for tool "${toolId}"`)
      return null
    }

    return displayComponent
  } catch (error) {
    console.error(`Error getting display component for tool "${toolId}":`, error)
    return null
  }
}

// 获取Tool配置
const getToolConfig = (toolId: string) => {
  const tool = agentToolManager.getTool(toolId)
  return tool?.config || null
}

export interface TestResult {
  toolId: string
  toolName: string
  testCaseName: string
  testCaseId?: string // 测试用例ID
  params: any
  passed: boolean
  error?: string
  result?: any
  duration?: number
  invocationId?: string // 添加invocationId字段
}

interface Props {
  testResults: TestResult[]
  summary: {
    total: number
    passed: number
    failed: number
    passedRate: number
    failedRate: number
    duration: number
  }
  markdownSummary: string
  mode?: string
}

const props = defineProps<Props>()
const isDemo = computed(() => props.mode === 'demo')

// Demo data
const demoTestResults = ref<TestResult[]>([
  {
    toolId: 'chart-generation',
    toolName: '图表生成工具',
    testCaseName: '生成柱状图',
    testCaseId: 'CHART-001',
    params: { type: 'bar', data: [10, 20, 30] },
    passed: true,
    duration: 1200,
    result: {
      content: {
        stage: 'completed',
        chartType: 'bar',
        chartName: 'demo-chart',
        url: 'https://example.com/chart.png'
      },
      format: 'json'
    }
  },
  {
    toolId: 'diff-tool',
    toolName: '文本对比工具',
    testCaseName: '对比两段文本',
    testCaseId: 'DIFF-001',
    params: { text1: 'hello', text2: 'world' },
    passed: true,
    duration: 800,
    result: {
      content: {
        stage: 'completed',
        diffResult: {
          chunks: [],
          summary: { insertions: 1, deletions: 1, replacements: 0 }
        }
      },
      format: 'json'
    }
  },
  {
    toolId: 'grep-tool',
    toolName: '文本搜索工具',
    testCaseName: '搜索关键词',
    testCaseId: 'GREP-001',
    params: { pattern: 'function', text: 'function test() {}' },
    passed: false,
    error: '搜索超时，未能在规定时间内完成',
    duration: 5000
  }
])

const demoSummary = ref({
  total: 3,
  passed: 2,
  failed: 1,
  passedRate: 66.67,
  failedRate: 33.33,
  duration: 7000
})

const demoMarkdownSummary = ref(`# 自动化测试报告

## 测试概览
- **总测试数**: 3
- **通过**: 2 (66.67%)
- **失败**: 1 (33.33%)
- **总耗时**: 7000ms

## 详细结果

### 图表生成工具
- ✅ CHART-001: 生成柱状图 (1200ms)

### 文本对比工具
- ✅ DIFF-001: 对比两段文本 (800ms)

### 文本搜索工具
- ❌ GREP-001: 搜索关键词 (5000ms)
  - 错误: 搜索超时
`)

const loadDemoData = () => {
  // Demo data is set in the reactive refs above
}

onMounted(() => {
  if (isDemo.value) {
    loadDemoData()
  }
  // Real initialization continues below
})

// Computed properties for demo mode support
const effectiveTestResults = computed(() => {
  return isDemo.value ? demoTestResults.value : props.testResults
})

const effectiveSummary = computed(() => {
  return isDemo.value ? demoSummary.value : props.summary
})

const effectiveMarkdownSummary = computed(() => {
  return isDemo.value ? demoMarkdownSummary.value : props.markdownSummary
})

const activeTab = ref('results')
const markdownContainerRef = ref<HTMLElement | null>(null)
const formatResult = (result: any): string => {
  if (result === null || result === undefined) {
    return 'null'
  }
  if (typeof result === 'string') {
    return result
  }
  try {
    return JSON.stringify(result, null, 2)
  } catch {
    return String(result)
  }
}

// 格式化数据以供Display组件使用
// Display组件期望接收ToolCallbackData格式的数据，包含content、format等字段
const formatDataForDisplay = (result: any, status?: string) => {
  try {
    // 如果result已经是ToolCallbackData格式（有content字段），直接返回
    if (result && typeof result === 'object' && 'content' in result) {
      // 如果status是succeeded，确保content中有stage字段
      if (status === 'succeeded' && result.content && typeof result.content === 'object') {
        if (!('stage' in result.content)) {
          return {
            ...result,
            content: {
              ...result.content,
              stage: 'completed'
            }
          }
        }
      }
      return result
    }

    // 特殊处理：如果result是diffResult格式（有chunks和summary字段），需要包装成正确的格式
    if (result && typeof result === 'object' && 'chunks' in result && 'summary' in result) {
      // 这是diff tool的返回格式，需要包装成ToolCallbackData
      const stage =
        status === 'succeeded' ? 'completed' : status === 'failed' ? 'error' : 'computing'
      return {
        content: {
          stage,
          diffResult: result, // 保持原始diffResult结构
          source1: result.source1,
          source2: result.source2
        },
        format: 'json'
      }
    }

    // 如果result是对象，需要包装成ToolCallbackData格式
    if (result && typeof result === 'object') {
      // 根据status设置stage
      const stage = status === 'succeeded' ? 'completed' : status === 'failed' ? 'error' : 'parsing'
      return {
        content: {
          ...result,
          stage
        },
        format: 'json'
      }
    }

    // 否则，将result包装成ToolCallbackData格式
    const stage = status === 'succeeded' ? 'completed' : status === 'failed' ? 'error' : 'parsing'
    return {
      content: {
        ...(result || {}),
        stage
      },
      format: 'json'
    }
  } catch (error) {
    console.error('Error formatting data for display:', error)
    // 返回一个安全的默认格式
    return {
      content: {
        stage: status === 'succeeded' ? 'completed' : status === 'failed' ? 'error' : 'parsing',
        error: error instanceof Error ? error.message : String(error)
      },
      format: 'json'
    }
  }
}

const copyMarkdown = async () => {
  if (isDemo.value) {
    ElMessage.info(t('agent.display.autoTest.demoMode', '演示模式：复制功能已禁用'))
    return
  }
  try {
    await navigator.clipboard.writeText(effectiveMarkdownSummary.value)
    ElMessage.success(t('agent.display.autoTest.copySuccess'))
  } catch (error) {
    ElMessage.error(
      `${t('agent.display.autoTest.copyFailed')}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

const copyTestCaseId = async (testCaseId: string) => {
  if (!testCaseId) return
  try {
    await navigator.clipboard.writeText(testCaseId)
    ElMessage.success(t('agent.display.autoTest.testCaseIdCopied', { id: testCaseId }))
  } catch (error) {
    ElMessage.error(
      `${t('agent.display.autoTest.copyFailed')}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// 导出测试结果快照
const exportResultSnapshot = async (result: TestResult) => {
  if (isDemo.value) {
    ElMessage.info(t('agent.display.autoTest.demoMode', '演示模式：导出功能已禁用'))
    return
  }
  try {
    const tool = agentToolManager.getTool(result.toolId)
    if (!tool) {
      ElMessage.error('找不到工具配置')
      return
    }

    // 从result创建快照
    const snapshot = createSnapshotFromHistoryEntry(
      {
        toolId: result.toolId,
        toolName: result.toolName,
        timestamp: Date.now(), // 测试结果可能没有timestamp，使用当前时间
        status: result.passed ? 'succeeded' : 'failed',
        params: result.params,
        result: result.result,
        data: result.result
          ? {
              content: result.result,
              format: 'json',
              componentName: getDisplayComponentForTool(result.toolId)?.name || undefined
            }
          : undefined,
        progress: undefined,
        error: result.error,
        outputs: result.result
          ? [
              {
                id: 'output-1',
                label: '执行结果',
                format: 'json',
                data: result.result,
                timestamp: Date.now()
              }
            ]
          : undefined,
        invocationId: result.invocationId
      },
      tool.config
        ? {
            id: tool.config.id,
            name: tool.config.name,
            description: tool.config.description,
            origin: tool.config.origin,
            displayComponent:
              typeof tool.config.displayComponent === 'string'
                ? tool.config.displayComponent
                : (tool.config.displayComponent as any)?.name || undefined
          }
        : undefined
    )

    // 序列化快照
    const serialized = serializeToolExecutionSnapshot(snapshot)

    const fileName = `tool-snapshot-${result.toolId}-${result.testCaseName}-${Date.now()}.json`
    const logger = createRendererLogger('AutoTestResultDisplay')
    logger.debug('[导出快照] 开始调用保存文件对话框，文件名:', fileName)

    const saveResult = (await messageBridge.invoke('save-json-file', serialized, fileName)) as {
      success: boolean
      path?: string
      error?: string
      canceled?: boolean
    } | null

    logger.debug('[导出快照] 保存文件对话框返回结果:', saveResult)

    if (!saveResult) {
      console.error('[导出快照] 保存文件调用返回空结果')
      throw new Error('保存文件调用返回空结果')
    }

    if (saveResult.success) {
      logger.debug('[导出快照] 文件保存成功，路径:', saveResult.path)
      ElMessage.success(t('agent.tool.exportSnapshotSuccess'))
    } else {
      // 用户取消对话框，不显示错误
      if (saveResult.canceled) {
        logger.debug('[导出快照] 用户取消了保存对话框')
        return
      }
      // 其他错误，显示错误消息
      console.error('[导出快照] 保存失败:', saveResult.error)
      throw new Error(saveResult.error || '保存失败')
    }
  } catch (error) {
    console.error('导出快照失败:', error)
    ElMessage.error(
      `${t('agent.tool.exportSnapshotFailed')}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

const downloadMarkdown = () => {
  if (isDemo.value) {
    ElMessage.info(t('agent.display.autoTest.demoMode', '演示模式：下载功能已禁用'))
    return
  }
  const blob = new Blob([effectiveMarkdownSummary.value], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `tool-test-report-${new Date().toISOString().replace(/[:.]/g, '-')}.md`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  ElMessage.success(t('agent.display.autoTest.downloadSuccess'))
}

// 主题样式
const containerStyle = computed(() => ({
  backgroundColor: 'transparent',
  color: themeState.currentTheme.textColor
}))

const getTestResultItemStyle = (passed: boolean) => {
  return {
    backgroundColor: themeState.currentTheme.background,
    borderColor:
      themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
    borderLeftColor: passed ? '#67c23a' : '#f56c6c'
  }
}

const testNameStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const testSectionStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd
}))

const sectionLabelStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const preStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const errorPreStyle = computed(() => ({
  color: '#f56c6c'
}))

const testDurationStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const markdownContentStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

// 渲染 Markdown 摘要（使用 Vditor）
const renderMarkdown = async () => {
  if (!markdownContainerRef.value) {
    return
  }

  const markdownContent = effectiveMarkdownSummary.value
  if (!markdownContent) {
    markdownContainerRef.value.innerHTML = ''
    return
  }

  const container = markdownContainerRef.value as HTMLDivElement

  try {
    // 使用统一的 Markdown 预览渲染函数
    await renderMarkdownPreview(container, markdownContent)
  } catch (error) {
    console.error('渲染 Markdown 摘要失败:', error)
    container.innerHTML = `<p style="color: var(--el-color-danger);">渲染失败: ${error instanceof Error ? error.message : String(error)}</p>`
  }
}

// 监听 Markdown 内容变化和标签页切换
watch(
  [() => effectiveMarkdownSummary.value, activeTab, () => themeState.currentTheme.type],
  () => {
    if (activeTab.value === 'markdown' && effectiveMarkdownSummary.value) {
      nextTick(() => {
        renderMarkdown()
      })
    }
  },
  { immediate: true }
)

onMounted(() => {
  if (activeTab.value === 'markdown' && effectiveMarkdownSummary.value) {
    nextTick(() => {
      renderMarkdown()
    })
  }
})
</script>

<style scoped>
.auto-test-result-display {
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.auto-test-tabs {
  display: flex;
  flex-direction: column;
  height: 100%;
  flex: 1;
  overflow: hidden;
}

.auto-test-tabs :deep([data-state='active']) {
  flex: 1;
}

.auto-test-tabs-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin-top: 0;
}

.auto-test-tabs-content :deep(.scroll-area) {
  height: 100%;
  flex: 1;
  overflow: hidden;
}

.auto-test-tabs-content :deep([data-radix-scroll-area-viewport]) {
  height: 100%;
}

.test-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 0;
  flex-shrink: 0;
}

.test-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 0;
  flex-shrink: 0;
}

.auto-test-result-display :deep([data-slot='separator']) {
  margin: 16px 0;
  flex-shrink: 0;
}

.test-results-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.test-result-item {
  padding: 16px;
  border: 1px solid;
  border-left-width: 4px;
  border-radius: 4px;
}

.test-result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.test-result-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.test-result-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.test-name {
  font-weight: 500;
  font-size: 14px;
}

.success-icon {
  color: var(--el-color-success);
}

.error-icon {
  color: var(--el-color-danger);
}

.test-params,
.test-error,
.test-result-data {
  margin-top: 12px;
  padding: 8px;
  border-radius: 4px;
}

.test-params strong,
.test-error strong,
.test-result-data strong {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
}

.test-params pre,
.test-error pre,
.test-result-data pre {
  margin: 0;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

.test-duration {
  margin-top: 8px;
  font-size: 12px;
}

.markdown-content {
  padding: 16px;
  border-radius: 4px;
}

.markdown-content pre {
  margin: 0;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
.markdown-render-container {
  width: 100%;
  min-height: 100px;
  padding: 16px;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* Vditor 渲染样式 */
.markdown-render-container :deep(.vditor-reset) {
  padding: 0;
  font-size: 14px;
  line-height: 1.6;
  color: v-bind('themeState.currentTheme.textColor');
  background-color: v-bind('themeState.currentTheme.background');
}

.markdown-render-container :deep(.vditor-reset h1),
.markdown-render-container :deep(.vditor-reset h2),
.markdown-render-container :deep(.vditor-reset h3),
.markdown-render-container :deep(.vditor-reset h4),
.markdown-render-container :deep(.vditor-reset h5),
.markdown-render-container :deep(.vditor-reset h6) {
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.textColor');
}

.markdown-render-container :deep(.vditor-reset p) {
  margin: 8px 0;
  line-height: 1.8;
  color: v-bind('themeState.currentTheme.textColor');
}

.markdown-render-container :deep(.vditor-reset code) {
  background-color: v-bind('themeState.currentTheme.background2nd');
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 0.9em;
  color: v-bind('themeState.currentTheme.textColor');
}

.markdown-render-container :deep(.vditor-reset pre) {
  background-color: v-bind('themeState.currentTheme.background2nd');
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 12px 0;
  border: 1px solid;
}

.markdown-render-container :deep(.vditor-reset pre code) {
  background-color: transparent;
  padding: 0;
  border: none;
}

.markdown-render-container :deep(.vditor-reset ul),
.markdown-render-container :deep(.vditor-reset ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.markdown-render-container :deep(.vditor-reset li) {
  margin: 4px 0;
  line-height: 1.6;
  color: v-bind('themeState.currentTheme.textColor');
}

.markdown-render-container :deep(.vditor-reset blockquote) {
  border-left: 4px solid;
  padding-left: 12px;
  margin: 12px 0;
  font-style: italic;
}

.markdown-render-container :deep(.vditor-reset table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
}

.markdown-render-container :deep(.vditor-reset table th),
.markdown-render-container :deep(.vditor-reset table td) {
  border: 1px solid;
  padding: 8px 12px;
  text-align: left;
}

.markdown-render-container :deep(.vditor-reset table th) {
  background-color: v-bind('themeState.currentTheme.background2nd');
  font-weight: 600;
}

.markdown-render-container :deep(.vditor-reset a) {
  text-decoration: none;
}

.markdown-render-container :deep(.vditor-reset a:hover) {
  text-decoration: underline;
}

.markdown-render-container :deep(.vditor-reset hr) {
  border: none;
  border-top: 1px solid;
  margin: 16px 0;
}
</style>
