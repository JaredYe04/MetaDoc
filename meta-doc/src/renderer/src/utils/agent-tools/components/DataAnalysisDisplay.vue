<template>
  <div class="data-analysis-display" :style="containerStyle">
    <div v-if="displayData.stage === 'parsing'" class="status-message" :style="statusMessageStyle">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ $t('agent.display.dataAnalysis.parsing') }}</span>
    </div>

    <div v-else-if="displayData.stage === 'extracting'" class="status-message" :style="statusMessageStyle">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ $t('agent.display.dataAnalysis.extracting') }}</span>
    </div>

    <div v-else-if="displayData.stage === 'calculating'" class="status-message" :style="statusMessageStyle">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ $t('agent.display.dataAnalysis.calculating') }}</span>
    </div>

    <div v-else-if="displayData.stage === 'aggregating'" class="status-message" :style="statusMessageStyle">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ $t('agent.display.dataAnalysis.aggregating') }}</span>
    </div>

    <div v-else-if="displayData.stage === 'summarizing'" class="status-message" :style="statusMessageStyle">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ $t('agent.display.dataAnalysis.summarizing') }}</span>
    </div>

    <div v-else-if="displayData.stage === 'completed' && displayData.result" class="completed-state" :style="completedStateStyle">
      <div class="analysis-header" :style="headerStyle">
        <div class="header-stats">
          <div class="stat-item" :style="statItemStyle">
            <span class="stat-label" :style="statLabelStyle">{{ $t('agent.display.dataAnalysis.totalRows') }}</span>
            <span class="stat-value" :style="statValueStyle">{{ displayData.result.rowCount }}</span>
          </div>
          <div class="stat-item" :style="statItemStyle">
            <span class="stat-label" :style="statLabelStyle">{{ $t('agent.display.dataAnalysis.totalColumns') }}</span>
            <span class="stat-value" :style="statValueStyle">{{ displayData.result.columnCount }}</span>
          </div>
          <div class="stat-item" :style="statItemStyle">
            <span class="stat-label" :style="statLabelStyle">{{ $t('agent.display.dataAnalysis.fieldCount') }}</span>
            <span class="stat-value" :style="statValueStyle">{{ displayData.result.fields.length }}</span>
          </div>
        </div>
      </div>

      <el-tabs v-model="activeTab" type="border-card" class="analysis-tabs">
        <!-- 字段信息 -->
        <el-tab-pane :label="$t('agent.display.dataAnalysis.fields')" name="fields">
          <el-scrollbar max-height="400px">
            <div class="fields-list">
              <div
                v-for="field in displayData.result.fields"
                :key="field.name"
                class="field-item"
              >
                <div class="field-header">
                  <span class="field-name">{{ field.name }}</span>
                  <el-tag :type="getTypeTagType(field.type)" size="small">
                    {{ field.type }}
                  </el-tag>
                  <el-tag v-if="field.nullable" type="warning" size="small">{{ $t('agent.display.dataAnalysis.nullable') }}</el-tag>
                  <span class="field-unique">{{ $t('agent.display.dataAnalysis.uniqueValues') }}: {{ field.uniqueCount }}</span>
                </div>
                <div v-if="field.sampleValues && field.sampleValues.length > 0" class="field-samples">
                  <span class="samples-label">{{ $t('agent.display.dataAnalysis.sampleValues') }}:</span>
                  <div class="samples-list">
                    <el-tag
                      v-for="(value, index) in field.sampleValues"
                      :key="index"
                      size="small"
                      effect="plain"
                      class="sample-tag"
                    >
                      {{ formatValue(value) }}
                    </el-tag>
                  </div>
                </div>
              </div>
            </div>
          </el-scrollbar>
        </el-tab-pane>

        <!-- 描述统计 -->
        <el-tab-pane :label="$t('agent.display.dataAnalysis.stats')" name="stats">
          <el-scrollbar max-height="400px">
            <el-tree
              :data="statsTreeData"
              :props="{ children: 'children', label: 'label' }"
              default-expand-all
              class="stats-tree"
            >
              <template #default="{ node, data }">
                <div class="tree-node">
                  <span class="node-label">{{ data.label }}</span>
                  <span v-if="data.value !== undefined" class="node-value">{{ formatValue(data.value) }}</span>
                </div>
              </template>
            </el-tree>
          </el-scrollbar>
        </el-tab-pane>

        <!-- 聚合分析 -->
        <el-tab-pane v-if="displayData.result.aggregations && displayData.result.aggregations.length > 0" :label="$t('agent.display.dataAnalysis.aggregations')" name="aggregations">
          <el-scrollbar max-height="400px">
            <div
              v-for="(agg, index) in displayData.result.aggregations"
              :key="index"
              class="aggregation-item"
              :style="aggregationItemStyle"
            >
              <div class="aggregation-header" :style="aggregationHeaderStyle">
                <el-icon><Connection /></el-icon>
                <span class="aggregation-title" :style="aggregationTitleStyle">{{ $t('agent.display.dataAnalysis.groupBy', { field: agg.groupBy }) }}</span>
              </div>
              <el-tree
                :data="buildAggregationTree(agg)"
                :props="{ children: 'children', label: 'label' }"
                default-expand-all
                class="aggregation-tree"
              >
                <template #default="{ node, data }">
                  <div class="tree-node">
                    <span class="node-label">{{ data.label }}</span>
                    <span v-if="data.value !== undefined" class="node-value">{{ formatValue(data.value) }}</span>
                  </div>
                </template>
              </el-tree>
            </div>
          </el-scrollbar>
        </el-tab-pane>

        <!-- 分析摘要 -->
        <el-tab-pane v-if="displayData.result.summary" :label="$t('agent.display.dataAnalysis.summary')" name="summary">
          <el-scrollbar max-height="400px">
            <div class="summary-content">
              <div ref="summaryContainerRef" class="summary-render-container" :style="{
                color: themeState.currentTheme.textColor
              }"></div>
            </div>
          </el-scrollbar>
        </el-tab-pane>
      </el-tabs>
    </div>

    <div v-else class="error-state">
      <el-alert
        :title="displayData.error || $t('agent.display.dataAnalysis.analysisFailed')"
        type="error"
        :closable="false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, nextTick } from 'vue'
import { Loading, Connection } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import type { ToolDisplayComponentProps } from '../../../types/agent-tool'
import { useToolDisplayRealtime, parseToolData } from '../composables/useToolDisplayRealtime'
import { themeState } from '../../themes'
import Vditor from 'vditor'
import { localVditorCDN, vditorCDN } from '../../vditor-cdn'
import { isElectronEnv } from '../../event-bus'
import { getSetting } from '../../settings'

const { t } = useI18n()

const props = defineProps<ToolDisplayComponentProps>()

const activeTab = ref('fields')
const summaryContainerRef = ref<HTMLElement | null>(null)

// 使用实时通信
const { realtimeData, realtimeStatus } = useToolDisplayRealtime(
  props.invocationId,
  props.data,
  props.status,
  props.progress
)

// 解析显示数据（优先使用实时数据）
const displayData = computed(() => {
  const data = realtimeData.value !== null ? realtimeData.value : props.data
  const parsed = parseToolData(data)
  
  if (typeof parsed === 'object' && parsed !== null) {
    const parsedObj = parsed as any
    
    // 根据status确定stage，优先使用数据中的stage，如果没有则根据status推断
    const getStage = (): 'parsing' | 'extracting' | 'calculating' | 'aggregating' | 'summarizing' | 'completed' | 'error' => {
      if (parsedObj.stage) {
        return parsedObj.stage
      }
      // 根据status推断stage
      if (props.status === 'succeeded') {
        return 'completed'
      }
      if (props.status === 'failed') {
        return 'error'
      }
      return 'parsing'
    }
    
    const stage = getStage()
    
    // 如果数据中有result字段，使用result；否则使用整个对象作为result
    const result = parsedObj.result !== undefined ? parsedObj.result : parsedObj
    
    return {
      stage,
      result: result,
      error: parsedObj.error
    }
  }
  
  // 如果没有数据，根据status设置默认stage
  const defaultStage = props.status === 'succeeded' ? 'completed' : (props.status === 'failed' ? 'error' : 'parsing')
  return { 
    stage: defaultStage, 
    result: undefined, 
    error: undefined 
  }
})

const statsTreeData = computed(() => {
  if (!displayData.value.result?.descriptiveStats) return []
  
  const stats = displayData.value.result.descriptiveStats
  return Object.entries(stats as Record<string, any>).map(([fieldName, stat]) => ({
    label: fieldName,
    value: undefined,
    children: Object.entries(stat as Record<string, any>).map(([key, value]) => ({
      label: getStatLabel(key),
      value
    }))
  }))
})

const getTypeTagType = (type: string) => {
  const map: Record<string, string> = {
    number: 'success',
    string: 'primary',
    boolean: 'warning',
    date: 'info',
    null: 'danger'
  }
  return map[type] || ''
}

const getStatLabel = (key: string) => {
  const map: Record<string, string> = {
    count: '数量',
    mean: '均值',
    median: '中位数',
    mode: '众数',
    std: '标准差',
    variance: '方差',
    min: '最小值',
    max: '最大值',
    q25: '第一四分位数',
    q75: '第三四分位数'
  }
  return map[key] || key
}

const formatValue = (value: any): string => {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value)
    return value.toFixed(4)
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}

const buildAggregationTree = (agg: { groupBy: string; aggregations: Record<string, any> }) => {
  return Object.entries(agg.aggregations).map(([fieldName, aggData]) => ({
    label: fieldName,
    value: undefined,
    children: Object.entries(aggData).map(([key, value]) => ({
      label: key,
      value
    }))
  }))
}

// 主题样式
const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const statusMessageStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const completedStateStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const headerStyle = computed(() => ({
  borderBottomColor: themeState.currentTheme.type === 'dark' 
    ? 'rgba(255, 255, 255, 0.1)' 
    : 'rgba(0, 0, 0, 0.08)'
}))

const statItemStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor
}))

const statLabelStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const statValueStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const aggregationItemStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  borderColor: themeState.currentTheme.type === 'dark' 
    ? 'rgba(255, 255, 255, 0.1)' 
    : 'rgba(0, 0, 0, 0.08)'
}))

const aggregationHeaderStyle = computed(() => ({
  borderBottomColor: themeState.currentTheme.type === 'dark' 
    ? 'rgba(255, 255, 255, 0.1)' 
    : 'rgba(0, 0, 0, 0.08)'
}))

const aggregationTitleStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

// 渲染分析摘要（使用 Vditor）
const renderSummary = async () => {
  if (!summaryContainerRef.value) {
    return
  }

  const result = displayData.value.result
  if (!result?.summary) {
    summaryContainerRef.value.innerHTML = ''
    return
  }

  const container = summaryContainerRef.value as HTMLDivElement
  const summary = result.summary

  if (!summary) {
    container.innerHTML = ''
    return
  }

  try {
    // 获取 CDN 和主题设置
    const cdn = isElectronEnv() ? localVditorCDN : vditorCDN
    const contentTheme = await getSetting('contentTheme') || 'light'
    const codeTheme = await getSetting('codeTheme') || 'github'
    const lineNumber = await getSetting('lineNumber') ?? true

    // 清空容器
    container.innerHTML = ''

    // 使用 Vditor.preview 渲染
    const previewOptions: any = {
      cdn,
      mode: 'light', // 摘要使用浅色主题，或者可以根据全局主题调整
      markdown: {
        theme: { current: contentTheme }
      },
      hljs: {
        style: codeTheme,
        lineNumber: lineNumber
      }
    }
    
    Vditor.preview(container, summary, previewOptions)

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
    console.error('渲染分析摘要失败:', error)
    container.innerHTML = `<p style="color: var(--el-color-danger);">渲染失败: ${error instanceof Error ? error.message : String(error)}</p>`
  }
}

// 监听摘要内容变化和标签页切换
watch(
  [() => displayData.value.result?.summary, activeTab],
  () => {
    if (activeTab.value === 'summary' && displayData.value.result?.summary) {
      nextTick(() => {
        renderSummary()
      })
    }
  },
  { immediate: true }
)

onMounted(() => {
  if (activeTab.value === 'summary' && displayData.value.result?.summary) {
    nextTick(() => {
      renderSummary()
    })
  }
})
</script>

<style scoped>
.data-analysis-display {
  width: 100%;
}

.status-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
}

.completed-state {
  width: 100%;
}

.analysis-header {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 2px solid;
}

.header-stats {
  display: flex;
  gap: 20px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 20px;
  border-radius: 8px;
  min-width: 80px;
}

.stat-label {
  font-size: 12px;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
}

.analysis-tabs {
  margin-top: 16px;
}

.fields-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field-item {
  padding: 16px;
  border: 1px solid;
  border-radius: 8px;
  transition: all 0.2s;
  background-color: transparent;
}

.field-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.field-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.field-name {
  font-weight: 500;
  font-size: 15px;
  flex: 1;
}

.field-unique {
  font-size: 12px;
}

.field-samples {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid;
}

.samples-label {
  font-size: 12px;
  flex-shrink: 0;
}

.samples-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.sample-tag {
  margin: 0;
}

.stats-tree,
.aggregation-tree {
  background-color: transparent;
}

.tree-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 4px 0;
}

.node-label {
  font-size: 14px;
}

.node-value {
  font-size: 13px;
  font-weight: 500;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  margin-left: 12px;
}

.aggregation-item {
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid;
  border-radius: 8px;
  background-color: transparent;
}

.aggregation-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid;
}

.aggregation-title {
  font-weight: 500;
  font-size: 15px;
}

.summary-content {
  padding: 16px;
}

.summary-render-container {
  width: 100%;
  min-height: 100px;
  padding: 16px;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* Vditor 渲染样式 */
.summary-render-container :deep(.vditor-reset) {
  padding: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

.summary-render-container :deep(.vditor-reset h1),
.summary-render-container :deep(.vditor-reset h2),
.summary-render-container :deep(.vditor-reset h3),
.summary-render-container :deep(.vditor-reset h4),
.summary-render-container :deep(.vditor-reset h5),
.summary-render-container :deep(.vditor-reset h6) {
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.summary-render-container :deep(.vditor-reset p) {
  margin: 8px 0;
  line-height: 1.8;
}

.summary-render-container :deep(.vditor-reset code) {
  background-color: var(--el-fill-color-light);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 0.9em;
}

.summary-render-container :deep(.vditor-reset pre) {
  background-color: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 12px 0;
}

.summary-render-container :deep(.vditor-reset pre code) {
  background-color: transparent;
  padding: 0;
}

.summary-render-container :deep(.vditor-reset ul),
.summary-render-container :deep(.vditor-reset ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.summary-render-container :deep(.vditor-reset li) {
  margin: 4px 0;
  line-height: 1.6;
}

.summary-render-container :deep(.vditor-reset blockquote) {
  border-left: 4px solid var(--el-color-primary);
  padding-left: 12px;
  margin: 12px 0;
  color: var(--el-text-color-secondary);
  font-style: italic;
}

.summary-render-container :deep(.vditor-reset table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
}

.summary-render-container :deep(.vditor-reset table th),
.summary-render-container :deep(.vditor-reset table td) {
  border: 1px solid var(--el-border-color-lighter);
  padding: 8px 12px;
  text-align: left;
}

.summary-render-container :deep(.vditor-reset table th) {
  background-color: var(--el-fill-color-light);
  font-weight: 600;
}

.error-state {
  padding: 12px;
}
</style>

