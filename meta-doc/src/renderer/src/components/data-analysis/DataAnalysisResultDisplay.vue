<template>
  <div class="data-analysis-result-display" :style="containerStyle">
    <div v-if="result" class="completed-state" :style="completedStateStyle">
      <div class="analysis-header" :style="headerStyle">
        <div class="header-stats">
          <div class="stat-item" :style="statItemStyle">
            <span class="stat-label" :style="statLabelStyle">{{ t('agent.display.dataAnalysis.totalRows') }}</span>
            <span class="stat-value" :style="statValueStyle">{{ result.rowCount }}</span>
          </div>
          <div class="stat-item" :style="statItemStyle">
            <span class="stat-label" :style="statLabelStyle">{{ t('agent.display.dataAnalysis.totalColumns') }}</span>
            <span class="stat-value" :style="statValueStyle">{{ result.columnCount }}</span>
          </div>
          <div class="stat-item" :style="statItemStyle">
            <span class="stat-label" :style="statLabelStyle">{{ t('agent.display.dataAnalysis.fieldCount') }}</span>
            <span class="stat-value" :style="statValueStyle">{{ result.fields.length }}</span>
          </div>
        </div>
      </div>

      <el-tabs v-model="activeTab" type="border-card" class="analysis-tabs">
        <!-- 字段信息 -->
        <el-tab-pane :label="t('agent.display.dataAnalysis.fields')" name="fields">
          <el-scrollbar max-height="400px">
            <div class="fields-list">
              <div
                v-for="field in result.fields"
                :key="field.name"
                class="field-item"
                :style="fieldItemStyle"
              >
                <div class="field-header">
                  <span class="field-name" :style="fieldNameStyle">{{ field.name }}</span>
                  <el-tag :type="getTypeTagType(field.type)" size="small">
                    {{ field.type }}
                  </el-tag>
                  <el-tag v-if="field.nullable" type="warning" size="small">{{ t('agent.display.dataAnalysis.nullable') }}</el-tag>
                  <span class="field-unique" :style="fieldUniqueStyle">{{ t('agent.display.dataAnalysis.uniqueValues') }}: {{ field.uniqueCount }}</span>
                </div>
                <div v-if="field.sampleValues && field.sampleValues.length > 0" class="field-samples" :style="fieldSamplesStyle">
                  <span class="samples-label" :style="samplesLabelStyle">{{ t('agent.display.dataAnalysis.sampleValues') }}:</span>
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
        <el-tab-pane :label="t('agent.display.dataAnalysis.stats')" name="stats">
          <el-scrollbar max-height="400px">
            <el-tree
              :data="statsTreeData"
              :props="{ children: 'children', label: 'label' }"
              default-expand-all
              class="stats-tree"
            >
              <template #default="{ node, data }">
                <div class="tree-node">
                  <span class="node-label" :style="nodeLabelStyle">{{ data.label }}</span>
                  <span v-if="data.value !== undefined" class="node-value" :style="nodeValueStyle">{{ formatValue(data.value) }}</span>
                </div>
              </template>
            </el-tree>
          </el-scrollbar>
        </el-tab-pane>

        <!-- 聚合分析 -->
        <el-tab-pane :label="t('agent.display.dataAnalysis.aggregations')" name="aggregations">
          <el-scrollbar max-height="400px">
            <div v-if="result.aggregations && result.aggregations.length > 0">
              <div
                v-for="(agg, index) in result.aggregations"
                :key="index"
                class="aggregation-item"
                :style="aggregationItemStyle"
              >
                <div class="aggregation-header" :style="aggregationHeaderStyle">
                  <el-icon><Connection /></el-icon>
                  <span class="aggregation-title" :style="aggregationTitleStyle">{{ t('agent.display.dataAnalysis.groupBy', { field: agg.groupBy }) }}</span>
                </div>
                <el-tree
                  :data="buildAggregationTree(agg)"
                  :props="{ children: 'children', label: 'label' }"
                  default-expand-all
                  class="aggregation-tree"
                >
                  <template #default="{ node, data }">
                    <div class="tree-node">
                      <span class="node-label" :style="nodeLabelStyle">{{ data.label }}</span>
                      <span v-if="data.value !== undefined" class="node-value" :style="nodeValueStyle">{{ formatValue(data.value) }}</span>
                    </div>
                  </template>
                </el-tree>
              </div>
            </div>
            <div v-else class="empty-aggregations" :style="emptyAggregationsStyle">
              {{ t('agent.display.dataAnalysis.noAggregations', '暂无聚合分析数据') }}
            </div>
          </el-scrollbar>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Connection } from '@element-plus/icons-vue'
import { themeState } from '../../utils/themes'

interface DataAnalysisResult {
  fields: Array<{
    name: string
    type: string
    nullable: boolean
    uniqueCount: number
    sampleValues: any[]
  }>
  rowCount: number
  columnCount: number
  descriptiveStats?: Record<string, any>
  aggregations?: Array<{
    groupBy: string
    aggregations: Record<string, any>
  }>
  summary?: string
}

const props = defineProps<{
  result: DataAnalysisResult | null
}>()

const { t } = useI18n()
const activeTab = ref('fields')

const statsTreeData = computed(() => {
  if (!props.result?.descriptiveStats) return []
  
  const stats = props.result.descriptiveStats
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
    count: t('agent.display.dataAnalysis.stats.count', '数量'),
    mean: t('agent.display.dataAnalysis.stats.mean', '均值'),
    median: t('agent.display.dataAnalysis.stats.median', '中位数'),
    mode: t('agent.display.dataAnalysis.stats.mode', '众数'),
    std: t('agent.display.dataAnalysis.stats.std', '标准差'),
    variance: t('agent.display.dataAnalysis.stats.variance', '方差'),
    min: t('agent.display.dataAnalysis.stats.min', '最小值'),
    max: t('agent.display.dataAnalysis.stats.max', '最大值'),
    q25: t('agent.display.dataAnalysis.stats.q25', '第一四分位数'),
    q75: t('agent.display.dataAnalysis.stats.q75', '第三四分位数')
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

const fieldItemStyle = computed(() => ({
  borderColor: themeState.currentTheme.type === 'dark' 
    ? 'rgba(255, 255, 255, 0.1)' 
    : 'rgba(0, 0, 0, 0.08)'
}))

const fieldNameStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const fieldUniqueStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.7
}))

const fieldSamplesStyle = computed(() => ({
  borderTopColor: themeState.currentTheme.type === 'dark' 
    ? 'rgba(255, 255, 255, 0.1)' 
    : 'rgba(0, 0, 0, 0.08)'
}))

const samplesLabelStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.7
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

const nodeLabelStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const nodeValueStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const emptyAggregationsStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.6,
  textAlign: 'center',
  padding: '40px'
}))
</script>

<style scoped>
.data-analysis-result-display {
  width: 100%;
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
</style>

