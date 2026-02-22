<template>
  <div class="unit-test-result-display" :style="containerStyle">
    <div class="test-summary">
      <el-statistic :title="$t('setting.debug.unitTest.totalTests')" :value="summary.total" />
      <el-statistic :title="$t('setting.debug.unitTest.passed')" :value="summary.passed">
        <template #suffix>
          <Badge style="margin-left: 8px">
            {{ summary.passedRate }}%
          </Badge>
        </template>
      </el-statistic>
      <el-statistic :title="$t('setting.debug.unitTest.failed')" :value="summary.failed">
        <template #suffix>
          <Badge variant="destructive" style="margin-left: 8px">
            {{ summary.failedRate }}%
          </Badge>
        </template>
      </el-statistic>
      <el-statistic :title="$t('setting.debug.unitTest.duration')" :value="summary.duration">
        <template #suffix>ms</template>
      </el-statistic>
    </div>

    <el-divider />

    <div class="test-actions">
      <Button type="primary" @click="copyMarkdown">
        <Document />
        {{ $t('setting.debug.unitTest.copyMarkdown') }}
      </Button>
      <Button @click="downloadMarkdown">
        <Download />
        {{ $t('setting.debug.unitTest.downloadMarkdown') }}
      </Button>
    </div>

    <el-divider />

    <Tabs v-model="activeTab" class="border-card">
      <TabsList>
        <TabsTrigger value="results">{{ $t('setting.debug.unitTest.testResults') }}</TabsTrigger>
        <TabsTrigger value="markdown">{{ $t('setting.debug.unitTest.markdownSummary') }}</TabsTrigger>
      </TabsList>
      <TabsContent value="results">
        <ScrollArea class="h-full">
          <div class="test-results-list">
            <div
              v-for="(result, index) in testResults"
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
                  <span class="test-name" :style="testNameStyle">
                    {{ result.module }} - {{ result.testName }}
                  </span>
                </div>
                <div class="test-result-actions">
                  <Badge :variant="result.passed ? 'default' : 'destructive'">
                    {{
                      result.passed
                        ? $t('setting.debug.unitTest.passed')
                        : $t('setting.debug.unitTest.failed')
                    }}
                  </Badge>
                </div>
              </div>

              <div
                v-if="result.params && result.params.length > 0"
                class="test-params"
                :style="testSectionStyle"
              >
                <strong :style="sectionLabelStyle">{{ $t('setting.debug.parameters') }}:</strong>
                <pre :style="preStyle">{{ JSON.stringify(result.params, null, 2) }}</pre>
              </div>

              <div
                v-if="!result.passed && result.error"
                class="test-error"
                :style="testSectionStyle"
              >
                <strong :style="sectionLabelStyle">{{ $t('setting.debug.error') }}:</strong>
                <pre :style="errorPreStyle">{{ result.error }}</pre>
              </div>

              <div
                v-if="result.result !== undefined"
                class="test-result-data"
                :style="testSectionStyle"
              >
                <strong :style="sectionLabelStyle">{{ $t('setting.debug.result') }}:</strong>
                <pre :style="preStyle">{{ formatResult(result.result) }}</pre>
              </div>

              <div
                v-if="result.duration !== undefined"
                class="test-duration"
                :style="testDurationStyle"
              >
                {{ $t('setting.debug.unitTest.executionTime') }}: {{ result.duration }}ms
              </div>
            </div>
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="markdown">
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
import { useI18n } from 'vue-i18n'
import { Document, Download, Check, Close } from '@element-plus/icons-vue'
import { themeState } from '../utils/themes'
import { renderMarkdownPreview } from './md-utils'
import { createRendererLogger } from './logger'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Badge } from '../components/ui/badge'

const { t } = useI18n()

export interface UnitTestResult {
  testId: string
  testName: string
  module: string
  params: any[]
  passed: boolean
  error?: string
  result?: any
  duration?: number
}

interface Props {
  testResults: UnitTestResult[]
  summary: {
    total: number
    passed: number
    failed: number
    passedRate: number
    failedRate: number
    duration: number
  }
  markdownSummary: string
}

const props = defineProps<Props>()

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

const copyMarkdown = async () => {
  try {
    await navigator.clipboard.writeText(props.markdownSummary)
    ElMessage.success(t('setting.debug.unitTest.copySuccess'))
  } catch (error) {
    ElMessage.error(
      `${t('setting.debug.unitTest.copyFailed')}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

const downloadMarkdown = () => {
  const blob = new Blob([props.markdownSummary], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `unit-test-report-${new Date().toISOString().replace(/[:.]/g, '-')}.md`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  ElMessage.success(t('setting.debug.unitTest.downloadSuccess'))
}

// 主题样式
const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
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

  const markdownContent = props.markdownSummary
  if (!markdownContent) {
    markdownContainerRef.value.innerHTML = ''
    return
  }

  const container = markdownContainerRef.value as HTMLDivElement

  try {
    // 使用统一的 Markdown 预览渲染函数
    await renderMarkdownPreview(container, markdownContent)
  } catch (error) {
    const logger = createRendererLogger('UnitTestResultDisplay')
    logger.error('渲染 Markdown 摘要失败:', error)
    container.innerHTML = `<p style="color: var(--el-color-danger);">渲染失败: ${error instanceof Error ? error.message : String(error)}</p>`
  }
}

// 监听 Markdown 内容变化和标签页切换
watch(
  [() => props.markdownSummary, activeTab, () => themeState.currentTheme.type],
  () => {
    if (activeTab.value === 'markdown' && props.markdownSummary) {
      nextTick(() => {
        renderMarkdown()
      })
    }
  },
  { immediate: true }
)

onMounted(() => {
  if (activeTab.value === 'markdown' && props.markdownSummary) {
    nextTick(() => {
      renderMarkdown()
    })
  }
})
</script>

<style scoped>
.unit-test-result-display {
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* shadcn-vue Tabs styling */
.unit-test-result-display :deep([role="tablist"]) {
  flex-shrink: 0;
}

.unit-test-result-display :deep([role="tabpanel"]) {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.unit-test-result-display :deep([role="tabpanel"][data-state="active"]) {
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
</style>
