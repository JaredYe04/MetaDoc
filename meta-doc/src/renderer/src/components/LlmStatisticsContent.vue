<template>
  <div class="llm-statistics-content">
    <!-- 日期范围选择 -->
    <div class="date-range-section">
      <Select
        v-model="quickSelect"
        @update:model-value="handleQuickSelect"
        :style="{ width: '150px' }"
      >
        <SelectTrigger>
          <SelectValue :placeholder="$t('llmStatistics.quickSelect')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">{{ $t('llmStatistics.today') }}</SelectItem>
          <SelectItem value="thisWeek">{{ $t('llmStatistics.thisWeek') }}</SelectItem>
          <SelectItem value="thisMonth">{{ $t('llmStatistics.thisMonth') }}</SelectItem>
          <SelectItem value="thisYear">{{ $t('llmStatistics.thisYear') }}</SelectItem>
          <SelectItem value="custom">{{ $t('llmStatistics.custom') }}</SelectItem>
        </SelectContent>
      </Select>
      <DatePicker
        v-model="dateRange"
        type="datetimerange"
        :range-separator="$t('llmStatistics.to')"
        :start-placeholder="$t('llmStatistics.startDate')"
        :end-placeholder="$t('llmStatistics.endDate')"
        format="YYYY-MM-DD HH:mm:ss"
        value-format="YYYY-MM-DD HH:mm:ss"
        @change="handleDateRangeChange"
      />
      <Button @click="loadAllStatistics">
        {{ $t('llmStatistics.loadAll') }}
      </Button>
    </div>

    <!-- 统计摘要 -->
    <div class="summary-section">
      <div class="summary-item">
        <span class="summary-label">{{ $t('llmStatistics.totalRequests') }}</span>
        <span class="summary-value">{{ statistics.totalRequests }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">{{ $t('llmStatistics.totalPromptTokens') }}</span>
        <span class="summary-value">{{ formatNumber(statistics.totalPromptTokens) }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">{{ $t('llmStatistics.totalCompletionTokens') }}</span>
        <span class="summary-value">{{ formatNumber(statistics.totalCompletionTokens) }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">{{ $t('llmStatistics.totalTokens') }}</span>
        <span class="summary-value">{{ formatNumber(statistics.totalTokens) }}</span>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="charts-section">
      <div class="chart-container">
        <div class="chart-title">{{ $t('llmStatistics.requestCountChart') }}</div>
        <div ref="requestCountChartRef" class="chart" style="width: 100%; height: 300px"></div>
      </div>
      <div class="chart-container">
        <div class="chart-title">{{ $t('llmStatistics.tokenUsageChart') }}</div>
        <div ref="tokenUsageChartRef" class="chart" style="width: 100%; height: 300px"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { themeState } from '../utils/themes'
import {
  getStatistics,
  exportStatistics,
  clearStatistics
} from '../utils/llm-statistics-service.js'
import * as echarts from 'echarts'
import { ElMessageBox, ElMessage } from 'element-plus'
import { createRendererLogger } from '../utils/logger'
import * as XLSX from 'xlsx'
import messageBridge from '../bridge/message-bridge'
import { Button } from '@renderer/components/ui/button'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@renderer/components/ui/select'
import { DatePicker } from '@renderer/components/ui/date-picker'

// Demo mode support
const props = defineProps<{ isDemo?: boolean }>()

const { t } = useI18n()
const logger = createRendererLogger('LlmStatisticsContent')

const dateRange = ref<[string, string] | null>(null)
const quickSelect = ref<string>('custom')
const statistics = ref({
  requests: [],
  totalRequests: 0,
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  totalTokens: 0
})

const requestCountChartRef = ref<HTMLElement | null>(null)
const tokenUsageChartRef = ref<HTMLElement | null>(null)
let requestCountChart: echarts.ECharts | null = null
let tokenUsageChart: echarts.ECharts | null = null

// 获取当前主题类型
const isDarkTheme = computed(() => themeState.currentTheme.type === 'dark')
const textColor = computed(() => themeState.currentTheme.textColor)
const backgroundColor = computed(
  () => themeState.currentTheme.background2nd || themeState.currentTheme.background
)

// 格式化数字
function formatNumber(num: number): string {
  return new Intl.NumberFormat('zh-CN').format(num)
}

// 获取 ECharts 主题配置
function getEChartsThemeConfig() {
  const isDark = isDarkTheme.value
  return {
    textStyle: {
      color: textColor.value
    },
    backgroundColor: 'transparent',
    tooltip: {
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.9)',
      borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
      textStyle: {
        color: isDark ? '#fff' : '#333'
      }
    },
    legend: {
      textStyle: {
        color: textColor.value
      }
    },
    grid: {
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
    },
    xAxis: {
      axisLine: {
        lineStyle: {
          color: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'
        }
      },
      axisLabel: {
        color: textColor.value
      },
      splitLine: {
        lineStyle: {
          color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'
        }
      }
    },
    yAxis: {
      axisLine: {
        lineStyle: {
          color: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'
        }
      },
      axisLabel: {
        color: textColor.value
      },
      splitLine: {
        lineStyle: {
          color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'
        }
      },
      nameTextStyle: {
        color: textColor.value
      }
    }
  }
}

// Demo data generator
const loadDemoData = () => {
  const today = new Date()
  const demoRequests = []
  const models = ['gpt-4', 'gpt-3.5-turbo', 'claude-3-opus', 'gemini-pro']
  const types = ['chat', 'completion', 'embedding']

  // Generate 30 days of demo data
  for (let i = 0; i < 30; i++) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    const dayRequests = Math.floor(Math.random() * 50) + 10

    for (let j = 0; j < dayRequests; j++) {
      const promptTokens = Math.floor(Math.random() * 2000) + 100
      const completionTokens = Math.floor(Math.random() * 1000) + 50
      demoRequests.push({
        timestamp: `${dateStr}T${String(Math.floor(Math.random() * 24)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}Z`,
        date: dateStr,
        model: models[Math.floor(Math.random() * models.length)],
        type: types[Math.floor(Math.random() * types.length)],
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens
      })
    }
  }

  statistics.value = {
    requests: demoRequests,
    totalRequests: demoRequests.length,
    totalPromptTokens: demoRequests.reduce((sum, r) => sum + r.prompt_tokens, 0),
    totalCompletionTokens: demoRequests.reduce((sum, r) => sum + r.completion_tokens, 0),
    totalTokens: demoRequests.reduce((sum, r) => sum + r.total_tokens, 0)
  }
}

// 加载统计数据
async function loadStatistics() {
  // Demo mode: use mock data
  if (props.isDemo) {
    loadDemoData()
    await nextTick()
    updateCharts()
    return
  }

  try {
    let startDate: Date | undefined = undefined
    let endDate: Date | undefined = undefined

    if (dateRange.value && dateRange.value[0] && dateRange.value[1]) {
      startDate = new Date(dateRange.value[0])
      endDate = new Date(dateRange.value[1])
    }

    const data = await getStatistics(startDate, endDate)
    statistics.value = data as any
    await nextTick()
    updateCharts()
  } catch (error) {
    logger.error('加载统计数据失败:', error)
    ElMessage.error(t('llmStatistics.loadFailed'))
  }
}

// 加载全部统计
function loadAllStatistics() {
  dateRange.value = null
  quickSelect.value = 'custom'
  loadStatistics()
}

// 处理日期范围变化
function handleDateRangeChange() {
  quickSelect.value = 'custom'
  loadStatistics()
}

// 处理快速选择
function handleQuickSelect(value: string) {
  if (value === 'custom') {
    return // 保持当前日期范围
  }

  const now = new Date()
  let startDate: Date
  let endDate: Date = new Date(now)

  switch (value) {
    case 'today': {
      // 今天：从今天 00:00:00 到现在
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      break
    }
    case 'thisWeek': {
      // 本周：从本周一 00:00:00 到现在
      const dayOfWeek = now.getDay()
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // 周一是 0
      startDate = new Date(now)
      startDate.setDate(now.getDate() - diff)
      startDate.setHours(0, 0, 0, 0)
      break
    }
    case 'thisMonth': {
      // 本月：从本月 1 号 00:00:00 到现在
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      break
    }
    case 'thisYear': {
      // 本年：从今年 1 月 1 号 00:00:00 到现在
      startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
      break
    }
    default:
      return
  }

  // 格式化为字符串
  const formatDate = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }

  dateRange.value = [formatDate(startDate), formatDate(endDate)]
  loadStatistics()
}

// 更新图表
function updateCharts() {
  updateRequestCountChart()
  updateTokenUsageChart()
}

// 更新请求次数折线图
function updateRequestCountChart() {
  if (!requestCountChartRef.value) return

  if (!requestCountChart) {
    requestCountChart = echarts.init(requestCountChartRef.value)
  }

  // 按日期聚合请求数
  const dateMap = new Map<string, number>()
  statistics.value.requests.forEach((req: any) => {
    const date = req.date || req.timestamp.split('T')[0]
    dateMap.set(date, (dateMap.get(date) || 0) + 1)
  })

  const dates = Array.from(dateMap.keys()).sort()
  const counts = dates.map((date) => dateMap.get(date) || 0)

  const themeConfig = getEChartsThemeConfig()
  const isDark = isDarkTheme.value

  const option = {
    ...themeConfig,
    tooltip: {
      ...themeConfig.tooltip,
      trigger: 'axis',
      axisPointer: {
        type: 'cross'
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
      borderColor: themeConfig.grid.borderColor
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates,
      axisLabel: {
        rotate: 45,
        color: themeConfig.xAxis.axisLabel.color
      },
      axisLine: themeConfig.xAxis.axisLine,
      splitLine: themeConfig.xAxis.splitLine
    },
    yAxis: {
      type: 'value',
      name: t('llmStatistics.requestCount'),
      axisLabel: themeConfig.yAxis.axisLabel,
      axisLine: themeConfig.yAxis.axisLine,
      splitLine: themeConfig.yAxis.splitLine,
      nameTextStyle: themeConfig.yAxis.nameTextStyle
    },
    series: [
      {
        name: t('llmStatistics.requestCount'),
        type: 'line',
        smooth: true,
        data: counts,
        itemStyle: {
          color: '#409EFF'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: isDark ? 'rgba(64, 158, 255, 0.4)' : 'rgba(64, 158, 255, 0.3)' },
              { offset: 1, color: isDark ? 'rgba(64, 158, 255, 0.1)' : 'rgba(64, 158, 255, 0.1)' }
            ]
          }
        }
      }
    ]
  }

  requestCountChart.setOption(option)
}

// 更新 Token 用量柱状图
function updateTokenUsageChart() {
  if (!tokenUsageChartRef.value) return

  if (!tokenUsageChart) {
    tokenUsageChart = echarts.init(tokenUsageChartRef.value)
  }

  // 按日期聚合 token 用量
  const dateMap = new Map<string, { prompt: number; completion: number; total: number }>()
  statistics.value.requests.forEach((req: any) => {
    const date = req.date || req.timestamp.split('T')[0]
    const existing = dateMap.get(date) || { prompt: 0, completion: 0, total: 0 }
    existing.prompt += req.prompt_tokens || 0
    existing.completion += req.completion_tokens || 0
    existing.total += req.total_tokens || 0
    dateMap.set(date, existing)
  })

  const dates = Array.from(dateMap.keys()).sort()
  const promptTokens = dates.map((date) => dateMap.get(date)?.prompt || 0)
  const completionTokens = dates.map((date) => dateMap.get(date)?.completion || 0)
  const totalTokens = dates.map((date) => dateMap.get(date)?.total || 0)

  const themeConfig = getEChartsThemeConfig()

  const option = {
    ...themeConfig,
    tooltip: {
      ...themeConfig.tooltip,
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      }
    },
    legend: {
      ...themeConfig.legend,
      data: [
        t('llmStatistics.promptTokens'),
        t('llmStatistics.completionTokens'),
        t('llmStatistics.totalTokens')
      ]
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
      borderColor: themeConfig.grid.borderColor
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: {
        rotate: 45,
        color: themeConfig.xAxis.axisLabel.color
      },
      axisLine: themeConfig.xAxis.axisLine,
      splitLine: themeConfig.xAxis.splitLine
    },
    yAxis: {
      type: 'value',
      name: t('llmStatistics.tokenCount'),
      axisLabel: themeConfig.yAxis.axisLabel,
      axisLine: themeConfig.yAxis.axisLine,
      splitLine: themeConfig.yAxis.splitLine,
      nameTextStyle: themeConfig.yAxis.nameTextStyle
    },
    series: [
      {
        name: t('llmStatistics.promptTokens'),
        type: 'bar',
        data: promptTokens,
        itemStyle: { color: '#67C23A' }
      },
      {
        name: t('llmStatistics.completionTokens'),
        type: 'bar',
        data: completionTokens,
        itemStyle: { color: '#E6A23C' }
      },
      {
        name: t('llmStatistics.totalTokens'),
        type: 'bar',
        data: totalTokens,
        itemStyle: { color: '#409EFF' }
      }
    ]
  }

  tokenUsageChart.setOption(option)
}

// 将数据转换为 CSV 格式
function convertToCSV(data: any): string {
  const { requests } = data

  // CSV 表头
  const headers = [
    t('llmStatistics.csvHeaders.timestamp'),
    t('llmStatistics.csvHeaders.date'),
    t('llmStatistics.csvHeaders.model'),
    t('llmStatistics.csvHeaders.type'),
    t('llmStatistics.csvHeaders.promptTokens'),
    t('llmStatistics.csvHeaders.completionTokens'),
    t('llmStatistics.csvHeaders.totalTokens')
  ]

  // 转义 CSV 字段（处理包含逗号、引号或换行符的值）
  const escapeCSV = (value: any): string => {
    if (value === null || value === undefined) {
      return ''
    }
    const str = String(value)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  // 构建 CSV 内容
  const rows = [headers.map(escapeCSV).join(',')]

  // 添加汇总行
  rows.push(
    [
      t('llmStatistics.csvHeaders.summary'),
      '',
      '',
      '',
      data.totalPromptTokens || 0,
      data.totalCompletionTokens || 0,
      data.totalTokens || 0
    ]
      .map(escapeCSV)
      .join(',')
  )

  rows.push('') // 空行分隔

  // 添加详细数据
  requests.forEach((req: any) => {
    rows.push(
      [
        req.timestamp || '',
        req.date || '',
        req.model || '',
        req.type || '',
        req.prompt_tokens || 0,
        req.completion_tokens || 0,
        req.total_tokens || 0
      ]
        .map(escapeCSV)
        .join(',')
    )
  })

  return rows.join('\n')
}

// 将数据转换为 XLSX 格式
function convertToXLSX(data: any): ArrayBuffer {
  const { requests } = data

  // 创建工作簿
  const wb = XLSX.utils.book_new()

  // 创建汇总表
  const summaryData = [
    [t('llmStatistics.xlsxHeaders.metric'), t('llmStatistics.xlsxHeaders.value')],
    [t('llmStatistics.totalRequests'), data.totalRequests || 0],
    [t('llmStatistics.totalPromptTokens'), data.totalPromptTokens || 0],
    [t('llmStatistics.totalCompletionTokens'), data.totalCompletionTokens || 0],
    [t('llmStatistics.totalTokens'), data.totalTokens || 0]
  ]
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(wb, summaryWs, t('llmStatistics.xlsxSheetNames.summary'))

  // 创建详细数据表
  const detailData = [
    [
      t('llmStatistics.xlsxHeaders.timestamp'),
      t('llmStatistics.xlsxHeaders.date'),
      t('llmStatistics.xlsxHeaders.model'),
      t('llmStatistics.xlsxHeaders.type'),
      t('llmStatistics.xlsxHeaders.promptTokens'),
      t('llmStatistics.xlsxHeaders.completionTokens'),
      t('llmStatistics.xlsxHeaders.totalTokens')
    ]
  ]

  requests.forEach((req: any) => {
    detailData.push([
      req.timestamp || '',
      req.date || '',
      req.model || '',
      req.type || '',
      req.prompt_tokens || 0,
      req.completion_tokens || 0,
      req.total_tokens || 0
    ])
  })

  const detailWs = XLSX.utils.aoa_to_sheet(detailData)
  // 设置列宽
  detailWs['!cols'] = [
    { wch: 20 }, // timestamp
    { wch: 12 }, // date
    { wch: 20 }, // model
    { wch: 12 }, // type
    { wch: 15 }, // prompt_tokens
    { wch: 15 }, // completion_tokens
    { wch: 15 } // total_tokens
  ]
  XLSX.utils.book_append_sheet(wb, detailWs, t('llmStatistics.xlsxSheetNames.details'))

  // 转换为 ArrayBuffer
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

// 导出统计（暴露给父组件使用）
async function handleExport() {
  // Demo mode: simulate export
  if (props.isDemo) {
    ElMessage.success('Demo mode: Statistics exported (simulated)')
    return
  }

  try {
    // 显示格式选择对话框
    const formatOptions = [
      { label: t('llmStatistics.formatJson'), value: 'json' },
      { label: t('llmStatistics.formatCsv'), value: 'csv' },
      { label: t('llmStatistics.formatXlsx'), value: 'xlsx' }
    ]

    // 使用 ElMessageBox.prompt 让用户选择格式
    const formatChoice = await ElMessageBox.prompt(
      `${t('llmStatistics.exportFormatMessage')}\n\n1. ${formatOptions[0].label}\n2. ${formatOptions[1].label}\n3. ${formatOptions[2].label}`,
      t('llmStatistics.exportFormatTitle'),
      {
        confirmButtonText: t('llmStatistics.confirm'),
        cancelButtonText: t('llmStatistics.cancel'),
        inputPattern: /^[1-3]$/,
        inputErrorMessage: t('llmStatistics.exportFormatInvalid'),
        inputPlaceholder: '1-3'
      }
    ).catch(() => null)

    if (!formatChoice || !formatChoice.value) {
      return // 用户取消
    }

    const choice = parseInt(formatChoice.value.trim())
    if (choice < 1 || choice > 3) {
      ElMessage.warning(t('llmStatistics.exportFormatInvalid'))
      return
    }

    const format = formatOptions[choice - 1].value

    // 执行导出
    let startDate: Date | undefined = undefined
    let endDate: Date | undefined = undefined

    if (dateRange.value && dateRange.value[0] && dateRange.value[1]) {
      startDate = new Date(dateRange.value[0])
      endDate = new Date(dateRange.value[1])
    }

    const stats = await getStatistics(startDate, endDate)
    const dateStr = dateRange.value
      ? `${dateRange.value[0].split(' ')[0]}_${dateRange.value[1].split(' ')[0]}`
      : 'all'

    // 根据格式确定文件扩展名和过滤器
    let filters: Array<{ name: string; extensions: string[] }> = []
    let defaultFileName = ''
    let fileContent: string | ArrayBuffer = ''

    switch (format) {
      case 'json':
        filters = [{ name: 'JSON Files', extensions: ['json'] }]
        defaultFileName = `llm-statistics-${dateStr}.json`
        fileContent = JSON.stringify(stats, null, 2)
        break
      case 'csv':
        filters = [{ name: 'CSV Files', extensions: ['csv'] }]
        defaultFileName = `llm-statistics-${dateStr}.csv`
        fileContent = convertToCSV(stats)
        break
      case 'xlsx':
        filters = [{ name: 'Excel Files', extensions: ['xlsx'] }]
        defaultFileName = `llm-statistics-${dateStr}.xlsx`
        fileContent = convertToXLSX(stats)
        break
      default:
        throw new Error('不支持的导出格式')
    }

    const dialogResult = await messageBridge.invoke('save-file-dialog', {
      defaultName: defaultFileName,
      filters: filters
    })

    if (dialogResult.canceled || !dialogResult.filePath) {
      return // 用户取消
    }

    // 写入文件
    if (format === 'xlsx') {
      // XLSX 是二进制文件，需要特殊处理
      const buffer = fileContent as ArrayBuffer
      const uint8Array = new Uint8Array(buffer)
      // 使用更安全的方式将 ArrayBuffer 转换为 base64
      let binary = ''
      const chunkSize = 8192 // 分块处理，避免堆栈溢出
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize)
        binary += String.fromCharCode.apply(null, Array.from(chunk) as any)
      }
      const base64 = btoa(binary)
      await messageBridge.invoke('write-file-content', {
        filePath: dialogResult.filePath,
        content: base64,
        encoding: 'base64'
      })
    } else {
      await messageBridge.invoke('write-file-content', {
        filePath: dialogResult.filePath,
        content: fileContent as string,
        encoding: 'utf8'
      })
    }

    ElMessage.success(t('llmStatistics.exportSuccess'))
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') {
      logger.error('导出统计数据失败:', error)
      ElMessage.error(t('llmStatistics.exportFailed'))
    }
  }
}

// 清空统计（暴露给父组件使用）
async function handleClear() {
  // Demo mode: simulate clear
  if (props.isDemo) {
    ElMessage.success('Demo mode: Statistics cleared (simulated)')
    // Reset demo data
    statistics.value = {
      requests: [],
      totalRequests: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0
    }
    await nextTick()
    updateCharts()
    return
  }

  try {
    await ElMessageBox.confirm(
      t('llmStatistics.clearConfirm'),
      t('llmStatistics.clearConfirmTitle'),
      {
        confirmButtonText: t('llmStatistics.confirm'),
        cancelButtonText: t('llmStatistics.cancel'),
        type: 'warning'
      }
    )

    await ElMessageBox.confirm(
      t('llmStatistics.clearConfirmAgain'),
      t('llmStatistics.clearConfirmTitle'),
      {
        confirmButtonText: t('llmStatistics.confirm'),
        cancelButtonText: t('llmStatistics.cancel'),
        type: 'warning'
      }
    )

    await clearStatistics()
    await loadStatistics()
    ElMessage.success(t('llmStatistics.clearSuccess'))
  } catch (error) {
    if (error !== 'cancel') {
      logger.error('清空统计数据失败:', error)
      ElMessage.error(t('llmStatistics.clearFailed'))
    }
  }
}

// 暴露方法给父组件
defineExpose({
  handleExport,
  handleClear,
  loadStatistics
})

// 监听主题变化，重新渲染图表
watch(
  () => themeState.currentTheme.type,
  () => {
    nextTick(() => {
      updateCharts()
    })
  }
)

// 窗口大小变化时调整图表
function handleResize() {
  if (requestCountChart) {
    requestCountChart.resize()
  }
  if (tokenUsageChart) {
    tokenUsageChart.resize()
  }
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  loadStatistics()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (requestCountChart) {
    requestCountChart.dispose()
    requestCountChart = null
  }
  if (tokenUsageChart) {
    tokenUsageChart.dispose()
    tokenUsageChart = null
  }
})
</script>

<style scoped>
.llm-statistics-content {
  padding: 8px 0;
}

.date-range-section {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.summary-section {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
  padding: 16px;
  background-color: v-bind(
    'themeState.currentTheme.background2nd || themeState.currentTheme.background'
  );
  border-radius: 8px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.summary-label {
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.7;
}

.summary-value {
  font-size: 20px;
  font-weight: bold;
  color: v-bind('themeState.currentTheme.textColor');
}

.charts-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.chart-container {
  background-color: v-bind(
    'themeState.currentTheme.background2nd || themeState.currentTheme.background'
  );
  border-radius: 8px;
  padding: 16px;
}

.chart-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: v-bind('themeState.currentTheme.textColor');
}

.chart {
  min-height: 300px;
}
</style>
