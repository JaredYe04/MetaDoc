<template>
  <div class="unit-test-result-display" :style="containerStyle">
    <div class="test-summary">
      <el-statistic :title="$t('setting.debug.unitTest.totalTests')" :value="summary.total" />
      <el-statistic :title="$t('setting.debug.unitTest.passed')" :value="summary.passed">
        <template #suffix>
          <el-tag type="success" size="small" style="margin-left: 8px">
            {{ summary.passedRate }}%
          </el-tag>
        </template>
      </el-statistic>
      <el-statistic :title="$t('setting.debug.unitTest.failed')" :value="summary.failed">
        <template #suffix>
          <el-tag type="danger" size="small" style="margin-left: 8px">
            {{ summary.failedRate }}%
          </el-tag>
        </template>
      </el-statistic>
      <el-statistic :title="$t('setting.debug.unitTest.duration')" :value="summary.duration">
        <template #suffix>ms</template>
      </el-statistic>
    </div>

    <el-divider />

    <div class="test-actions">
      <el-button type="primary" :icon="Document" @click="copyMarkdown">
        {{ $t('setting.debug.unitTest.copyMarkdown') }}
      </el-button>
      <el-button :icon="Download" @click="downloadMarkdown">
        {{ $t('setting.debug.unitTest.downloadMarkdown') }}
      </el-button>
    </div>

    <el-divider />

    <el-tabs v-model="activeTab" type="border-card" tab-position="top">
      <el-tab-pane :label="$t('setting.debug.unitTest.testResults')" name="results">
        <el-scrollbar style="height: 100%;">
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
                  <el-tag :type="result.passed ? 'success' : 'danger'" size="small">
                    {{ result.passed ? $t('setting.debug.unitTest.passed') : $t('setting.debug.unitTest.failed') }}
                  </el-tag>
                </div>
              </div>
              
              <div v-if="result.params && result.params.length > 0" class="test-params" :style="testSectionStyle">
                <strong :style="sectionLabelStyle">{{ $t('setting.debug.parameters') }}:</strong>
                <pre :style="preStyle">{{ JSON.stringify(result.params, null, 2) }}</pre>
              </div>

              <div v-if="!result.passed && result.error" class="test-error" :style="testSectionStyle">
                <strong :style="sectionLabelStyle">{{ $t('setting.debug.error') }}:</strong>
                <pre :style="errorPreStyle">{{ result.error }}</pre>
              </div>

              <div v-if="result.result !== undefined" class="test-result-data" :style="testSectionStyle">
                <strong :style="sectionLabelStyle">{{ $t('setting.debug.result') }}:</strong>
                <pre :style="preStyle">{{ formatResult(result.result) }}</pre>
              </div>

              <div v-if="result.duration !== undefined" class="test-duration" :style="testDurationStyle">
                {{ $t('setting.debug.unitTest.executionTime') }}: {{ result.duration }}ms
              </div>
            </div>
          </div>
        </el-scrollbar>
      </el-tab-pane>

      <el-tab-pane :label="$t('setting.debug.unitTest.markdownSummary')" name="markdown">
        <el-scrollbar style="height: 100%;">
          <div class="markdown-content" :style="markdownContentStyle">
            <div ref="markdownContainerRef" class="markdown-render-container" :style="{
                color: themeState.currentTheme.textColor
              }"></div>
          </div>
        </el-scrollbar>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { Document, Download, Check, Close } from '@element-plus/icons-vue'
import { themeState } from '../utils/themes'
import Vditor from 'vditor'
import { localVditorCDN, vditorCDN } from './vditor-cdn'
import { isElectronEnv } from './event-bus'
import { getSetting } from './settings'
import { createRendererLogger } from './logger'

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
    ElMessage.error(`${t('setting.debug.unitTest.copyFailed')}: ${error instanceof Error ? error.message : String(error)}`)
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
    borderColor: themeState.currentTheme.type === 'dark' 
      ? 'rgba(255, 255, 255, 0.1)' 
      : 'rgba(0, 0, 0, 0.08)',
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
    // 获取 CDN 和主题设置
    const cdn = isElectronEnv() ? localVditorCDN : vditorCDN
    const contentTheme = await getSetting('contentTheme') || 'light'
    const codeTheme = themeState.currentTheme.codeTheme
    const lineNumber = await getSetting('lineNumber') ?? true

    // 清空容器
    container.innerHTML = ''

    // 使用 Vditor.preview 渲染
    const previewOptions: any = {
      cdn,
      mode: themeState.currentTheme.type === 'dark' ? 'dark' : 'light',
      markdown: {
        theme: { current: contentTheme }
      },
      hljs: {
        style: codeTheme,
        lineNumber: lineNumber
      },
      theme: themeState.currentTheme.vditorTheme
    }
    
    Vditor.preview(container, markdownContent, previewOptions)

    // 等待 preview 完成后再调用其他渲染方法
    await nextTick()

    // 渲染代码块
    if (typeof Vditor.codeRender === 'function') {
      Vditor.codeRender(container)
    }

    // 渲染数学公式
    if (typeof Vditor.mathRender === 'function') {
      Vditor.mathRender(container, {
        cdn
      })
    }
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

.unit-test-result-display :deep(.el-tabs) {
  display: flex;
  flex-direction: column !important;
  height: 100%;
  flex: 1;
  overflow: hidden;
}

.unit-test-result-display :deep(.el-tabs__header) {
  order: -999 !important;
  flex-shrink: 0 !important;
  flex-grow: 0 !important;
  margin: 0 !important;
  position: relative !important;
}

.unit-test-result-display :deep(.el-tabs__content) {
  order: 0 !important;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative !important;
}

.unit-test-result-display :deep(.el-tab-pane) {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.unit-test-result-display :deep(.el-scrollbar) {
  height: 100%;
  flex: 1;
  overflow: hidden;
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

