<template>
  <div class="data-analysis-result-display" :style="containerStyle">
    <div v-if="result" class="completed-state" :style="completedStateStyle">
      <div class="analysis-header" :style="headerStyle">
        <div class="header-stats">
          <div class="stat-item" :style="statItemStyle">
            <span class="stat-label" :style="statLabelStyle">{{
              t('agent.display.dataAnalysis.totalRows')
            }}</span>
            <span class="stat-value" :style="statValueStyle">{{ result.rowCount }}</span>
          </div>
          <div class="stat-item" :style="statItemStyle">
            <span class="stat-label" :style="statLabelStyle">{{
              t('agent.display.dataAnalysis.totalColumns')
            }}</span>
            <span class="stat-value" :style="statValueStyle">{{ result.columnCount }}</span>
          </div>
          <div class="stat-item" :style="statItemStyle">
            <span class="stat-label" :style="statLabelStyle">{{
              t('agent.display.dataAnalysis.fieldCount')
            }}</span>
            <span class="stat-value" :style="statValueStyle">{{ result.fields.length }}</span>
          </div>
        </div>
      </div>

      <Tabs v-model="activeTab" class="analysis-tabs border-card">
        <TabsList>
          <TabsTrigger value="fields">{{ t('agent.display.dataAnalysis.fields') }}</TabsTrigger>
          <TabsTrigger value="stats">{{ t('agent.display.dataAnalysis.statsLabel') }}</TabsTrigger>
          <TabsTrigger v-if="result.aggregations && result.aggregations.length > 0" value="aggregations">{{ t('agent.display.dataAnalysis.aggregations') }}</TabsTrigger>
        </TabsList>
        <!-- 字段信息 -->
        <TabsContent value="fields">
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
                  <Badge :variant="getBadgeVariant(field.type)">
                    {{ field.type }}
                  </Badge>
                  <Badge v-if="field.nullable" variant="warning" class="warning-badge">
                    {{ t('agent.display.dataAnalysis.nullable') }}
                  </Badge>
                  <span class="field-unique" :style="fieldUniqueStyle"
                    >{{ t('agent.display.dataAnalysis.uniqueValues') }}:
                    {{ field.uniqueCount }}</span
                  >
                </div>
                <div
                  v-if="field.sampleValues && field.sampleValues.length > 0"
                  class="field-samples"
                  :style="fieldSamplesStyle"
                >
                  <span class="samples-label" :style="samplesLabelStyle"
                    >{{ t('agent.display.dataAnalysis.sampleValues') }}:</span
                  >
                  <div class="samples-list">
                    <Badge
                      v-for="(value, index) in field.sampleValues"
                      :key="index"
                      variant="outline"
                      class="sample-badge"
                    >
                      {{ formatValue(value) }}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </el-scrollbar>
        </TabsContent>

        <!-- 描述统计 -->
        <TabsContent value="stats">
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
                  <span
                    v-if="data.value !== undefined"
                    class="node-value"
                    :style="nodeValueStyle"
                    >{{ formatValue(data.value) }}</span
                  >
                </div>
              </template>
            </el-tree>
          </el-scrollbar>
        </TabsContent>

        <!-- 聚合分析 -->
        <TabsContent value="aggregations">
          <el-scrollbar max-height="400px">
            <div v-if="result.aggregations && result.aggregations.length > 0">
              <div
                v-for="(agg, index) in result.aggregations"
                :key="index"
                class="aggregation-item"
                :style="aggregationItemStyle"
              >
                <div
                  class="aggregation-header"
                  :style="aggregationHeaderStyle"
                  @click="toggleAggregation(index)"
                >
                  <el-icon
                    class="collapse-icon"
                    :class="{ collapsed: !aggregationExpanded[index] }"
                  >
                    <ArrowRight v-if="!aggregationExpanded[index]" />
                    <ArrowDown v-else />
                  </el-icon>
                  <el-icon><Connection /></el-icon>
                  <span class="aggregation-title" :style="aggregationTitleStyle">{{
                    t('agent.display.dataAnalysis.groupBy', { field: agg.groupBy })
                  }}</span>
                </div>
                <el-tree
                  v-show="aggregationExpanded[index]"
                  :data="buildAggregationTree(agg)"
                  :props="{ children: 'children', label: 'label' }"
                  class="aggregation-tree"
                >
                  <template #default="{ node, data }">
                    <div class="tree-node">
                      <span class="node-label" :style="nodeLabelStyle">{{ data.label }}</span>
                      <span
                        v-if="data.value !== undefined"
                        class="node-value"
                        :style="nodeValueStyle"
                        >{{ formatValue(data.value) }}</span
                      >
                    </div>
                  </template>
                </el-tree>
              </div>
            </div>
            <div v-else class="empty-aggregations" :style="emptyAggregationsStyle">
              {{ t('agent.display.dataAnalysis.noAggregations', '暂无聚合分析数据') }}
            </div>
          </el-scrollbar>
        </TabsContent>
      </Tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Connection, ArrowRight, ArrowDown } from '@element-plus/icons-vue'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs'
import { Badge } from '../ui/badge'
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

// 聚合分析折叠状态（使用对象存储每个聚合项的展开状态，默认展开）
const aggregationExpanded = ref<Record<string | number, boolean>>({})

// 切换聚合分析的展开/折叠状态
const toggleAggregation = (index: string | number) => {
  aggregationExpanded.value[index] = !aggregationExpanded.value[index]
}

// 监听聚合分析数据变化，初始化展开状态（默认展开）
watch(
  () => props.result?.aggregations,
  (aggregations) => {
    if (aggregations && Array.isArray(aggregations)) {
      aggregations.forEach((_, index) => {
        if (aggregationExpanded.value[index] === undefined) {
          aggregationExpanded.value[index] = true // 默认展开
        }
      })
    }
  },
  { immediate: true }
)

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

const getBadgeVariant = (type: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  const map: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    number: 'default',
    string: 'secondary',
    boolean: 'outline',
    date: 'secondary',
    null: 'destructive'
  }
  return map[type] || 'secondary'
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
  // 新的结构：aggregations 的键是分组值（如"北京"），值是该组的统计信息
  // 检查是否是旧格式（aggregations 的键是字段名）
  const firstKey = Object.keys(agg.aggregations)[0]
  const firstValue = agg.aggregations[firstKey]

  // 如果第一个值有 numericFields/stringFields 等字段，说明是新格式
  const isNewFormat =
    firstValue &&
    typeof firstValue === 'object' &&
    (firstValue.numericFields !== undefined ||
      firstValue.stringFields !== undefined ||
      firstValue.booleanFields !== undefined ||
      firstValue.dateFields !== undefined ||
      firstValue.count !== undefined)

  if (isNewFormat) {
    // 新格式：按组显示统计信息
    return Object.entries(agg.aggregations).map(([groupKey, groupStats]: [string, any]) => {
      const children: any[] = []

      // 添加组的基本信息（行数）
      if (groupStats.count !== undefined) {
        children.push({
          label: t('agent.display.dataAnalysis.groupCount', '组内行数'),
          value: groupStats.count
        })
      }

      // 数值字段统计
      if (groupStats.numericFields) {
        Object.entries(groupStats.numericFields).forEach(([fieldName, stats]: [string, any]) => {
          const fieldChildren: any[] = []
          if (stats.sum !== undefined)
            fieldChildren.push({
              label: t('agent.display.dataAnalysis.stats.sum', '总和'),
              value: stats.sum
            })
          if (stats.avg !== undefined)
            fieldChildren.push({
              label: t('agent.display.dataAnalysis.stats.avg', '平均值'),
              value: stats.avg
            })
          if (stats.count !== undefined)
            fieldChildren.push({
              label: t('agent.display.dataAnalysis.stats.count', '数量'),
              value: stats.count
            })
          if (stats.min !== undefined)
            fieldChildren.push({
              label: t('agent.display.dataAnalysis.stats.min', '最小值'),
              value: stats.min
            })
          if (stats.max !== undefined)
            fieldChildren.push({
              label: t('agent.display.dataAnalysis.stats.max', '最大值'),
              value: stats.max
            })

          children.push({
            label: `${fieldName} (${t('agent.display.dataAnalysis.numeric', '数值')})`,
            value: undefined,
            children: fieldChildren
          })
        })
      }

      // 字符串字段统计
      if (groupStats.stringFields) {
        Object.entries(groupStats.stringFields).forEach(([fieldName, stats]: [string, any]) => {
          const fieldChildren: any[] = []
          if (stats.uniqueCount !== undefined) {
            fieldChildren.push({
              label: t('agent.display.dataAnalysis.uniqueCount', '唯一值数量'),
              value: stats.uniqueCount
            })
          }
          if (stats.totalCount !== undefined) {
            fieldChildren.push({
              label: t('agent.display.dataAnalysis.totalCount', '总数量'),
              value: stats.totalCount
            })
          }

          // 显示前几个最常见的值
          if (stats.topValues && stats.topValues.length > 0) {
            const topValuesChildren = stats.topValues.map((item: any) => ({
              label: `${item.value} (${item.count}, ${(item.ratio * 100).toFixed(2)}%)`,
              value: undefined
            }))
            fieldChildren.push({
              label: t('agent.display.dataAnalysis.topValues', '常见值'),
              value: undefined,
              children: topValuesChildren
            })
          }

          children.push({
            label: `${fieldName} (${t('agent.display.dataAnalysis.string', '字符串')})`,
            value: undefined,
            children: fieldChildren.length > 0 ? fieldChildren : undefined
          })
        })
      }

      // 布尔字段统计
      if (groupStats.booleanFields) {
        Object.entries(groupStats.booleanFields).forEach(([fieldName, stats]: [string, any]) => {
          const fieldChildren: any[] = []
          if (stats.trueCount !== undefined) {
            fieldChildren.push({
              label: `True: ${stats.trueCount} (${(stats.trueRatio * 100).toFixed(2)}%)`,
              value: undefined
            })
          }
          if (stats.falseCount !== undefined) {
            fieldChildren.push({
              label: `False: ${stats.falseCount} (${(stats.falseRatio * 100).toFixed(2)}%)`,
              value: undefined
            })
          }

          children.push({
            label: `${fieldName} (${t('agent.display.dataAnalysis.boolean', '布尔')})`,
            value: undefined,
            children: fieldChildren
          })
        })
      }

      // 日期字段统计
      if (groupStats.dateFields) {
        Object.entries(groupStats.dateFields).forEach(([fieldName, stats]: [string, any]) => {
          const fieldChildren: any[] = []
          if (stats.min !== undefined)
            fieldChildren.push({
              label: t('agent.display.dataAnalysis.stats.min', '最小值'),
              value: stats.min
            })
          if (stats.max !== undefined)
            fieldChildren.push({
              label: t('agent.display.dataAnalysis.stats.max', '最大值'),
              value: stats.max
            })
          if (stats.uniqueCount !== undefined)
            fieldChildren.push({
              label: t('agent.display.dataAnalysis.uniqueCount', '唯一值数量'),
              value: stats.uniqueCount
            })
          if (stats.totalCount !== undefined)
            fieldChildren.push({
              label: t('agent.display.dataAnalysis.totalCount', '总数量'),
              value: stats.totalCount
            })

          children.push({
            label: `${fieldName} (${t('agent.display.dataAnalysis.date', '日期')})`,
            value: undefined,
            children: fieldChildren
          })
        })
      }

      return {
        label: `${groupKey} (${groupStats.count || 0} ${t('agent.display.dataAnalysis.rows', '行')})`,
        value: undefined,
        children: children.length > 0 ? children : undefined
      }
    })
  } else {
    // 旧格式：直接展开字段统计
    return Object.entries(agg.aggregations).map(([fieldName, aggData]) => ({
      label: fieldName,
      value: undefined,
      children: Object.entries(aggData).map(([key, value]) => ({
        label: key,
        value
      }))
    }))
  }
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
  borderBottomColor:
    themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
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
  borderColor:
    themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
}))

const fieldNameStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const fieldUniqueStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.7
}))

const fieldSamplesStyle = computed(() => ({
  borderTopColor:
    themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
}))

const samplesLabelStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.7
}))

const aggregationItemStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  borderColor:
    themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
}))

const aggregationHeaderStyle = computed(() => ({
  borderBottomColor:
    themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
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

.sample-badge {
  margin: 0;
}

.warning-badge {
  background-color: hsl(var(--warning));
  color: hsl(var(--warning-foreground));
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
  cursor: pointer;
  user-select: none;
  transition: opacity 0.2s;
}

.aggregation-header:hover {
  opacity: 0.8;
}

.collapse-icon {
  font-size: 14px;
  transition: transform 0.2s;
  flex-shrink: 0;
}

.aggregation-title {
  font-weight: 500;
  font-size: 15px;
}
</style>
