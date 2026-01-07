<template>
  <div class="llm-statistics-content">
    <!-- 日期范围选择 -->
    <div class="date-range-section">
      <el-select
        v-model="quickSelect"
        :placeholder="$t('llmStatistics.quickSelect')"
        @change="handleQuickSelect"
        :style="{
          '--el-select-text-color': themeState.currentTheme.textColor,
          width: '150px',
        }"
      >
        <el-option
          :label="$t('llmStatistics.today')"
          value="today"
        />
        <el-option
          :label="$t('llmStatistics.thisWeek')"
          value="thisWeek"
        />
        <el-option
          :label="$t('llmStatistics.thisMonth')"
          value="thisMonth"
        />
        <el-option
          :label="$t('llmStatistics.thisYear')"
          value="thisYear"
        />
        <el-option
          :label="$t('llmStatistics.custom')"
          value="custom"
        />
      </el-select>
      <el-date-picker
        v-model="dateRange"
        type="datetimerange"
        :range-separator="$t('llmStatistics.to')"
        :start-placeholder="$t('llmStatistics.startDate')"
        :end-placeholder="$t('llmStatistics.endDate')"
        :format="'YYYY-MM-DD HH:mm:ss'"
        :value-format="'YYYY-MM-DD HH:mm:ss'"
        @change="handleDateRangeChange"
        :style="{
          '--el-date-picker-text-color': themeState.currentTheme.textColor,
        }"
      />
      <el-button @click="loadAllStatistics" :style="{ color: themeState.currentTheme.textColor }">
        {{ $t('llmStatistics.loadAll') }}
      </el-button>
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
        <div ref="requestCountChartRef" class="chart" style="width: 100%; height: 300px;"></div>
      </div>
      <div class="chart-container">
        <div class="chart-title">{{ $t('llmStatistics.tokenUsageChart') }}</div>
        <div ref="tokenUsageChartRef" class="chart" style="width: 100%; height: 300px;"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { themeState } from '../utils/themes';
import { getStatistics, exportStatistics, clearStatistics } from '../utils/llm-statistics-service.js';
import * as echarts from 'echarts';
import { ElMessageBox, ElMessage } from 'element-plus';
import { createRendererLogger } from '../utils/logger';

const { t } = useI18n();
const logger = createRendererLogger('LlmStatisticsContent');

const dateRange = ref<[string, string] | null>(null);
const quickSelect = ref<string>('custom');
const statistics = ref({
  requests: [],
  totalRequests: 0,
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  totalTokens: 0,
});

const requestCountChartRef = ref<HTMLElement | null>(null);
const tokenUsageChartRef = ref<HTMLElement | null>(null);
let requestCountChart: echarts.ECharts | null = null;
let tokenUsageChart: echarts.ECharts | null = null;

// 获取当前主题类型
const isDarkTheme = computed(() => themeState.currentTheme.type === 'dark');
const textColor = computed(() => themeState.currentTheme.textColor);
const backgroundColor = computed(() => themeState.currentTheme.background2nd || themeState.currentTheme.background);

// 格式化数字
function formatNumber(num: number): string {
  return new Intl.NumberFormat('zh-CN').format(num);
}

// 获取 ECharts 主题配置
function getEChartsThemeConfig() {
  const isDark = isDarkTheme.value;
  return {
    textStyle: {
      color: textColor.value,
    },
    backgroundColor: 'transparent',
    tooltip: {
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.9)',
      borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
      textStyle: {
        color: isDark ? '#fff' : '#333',
      },
    },
    legend: {
      textStyle: {
        color: textColor.value,
      },
    },
    grid: {
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    xAxis: {
      axisLine: {
        lineStyle: {
          color: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
        },
      },
      axisLabel: {
        color: textColor.value,
      },
      splitLine: {
        lineStyle: {
          color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
        },
      },
    },
    yAxis: {
      axisLine: {
        lineStyle: {
          color: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
        },
      },
      axisLabel: {
        color: textColor.value,
      },
      splitLine: {
        lineStyle: {
          color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
        },
      },
      nameTextStyle: {
        color: textColor.value,
      },
    },
  };
}

// 加载统计数据
async function loadStatistics() {
  try {
    let startDate: Date | undefined = undefined;
    let endDate: Date | undefined = undefined;

    if (dateRange.value && dateRange.value[0] && dateRange.value[1]) {
      startDate = new Date(dateRange.value[0]);
      endDate = new Date(dateRange.value[1]);
    }

    const data = await getStatistics(startDate, endDate);
    statistics.value = data as any;
    await nextTick();
    updateCharts();
  } catch (error) {
    logger.error('加载统计数据失败:', error);
    ElMessage.error(t('llmStatistics.loadFailed'));
  }
}

// 加载全部统计
function loadAllStatistics() {
  dateRange.value = null;
  quickSelect.value = 'custom';
  loadStatistics();
}

// 处理日期范围变化
function handleDateRangeChange() {
  quickSelect.value = 'custom';
  loadStatistics();
}

// 处理快速选择
function handleQuickSelect(value: string) {
  if (value === 'custom') {
    return; // 保持当前日期范围
  }

  const now = new Date();
  let startDate: Date;
  let endDate: Date = new Date(now);

  switch (value) {
    case 'today': {
      // 今天：从今天 00:00:00 到现在
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      break;
    }
    case 'thisWeek': {
      // 本周：从本周一 00:00:00 到现在
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 周一是 0
      startDate = new Date(now);
      startDate.setDate(now.getDate() - diff);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case 'thisMonth': {
      // 本月：从本月 1 号 00:00:00 到现在
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      break;
    }
    case 'thisYear': {
      // 本年：从今年 1 月 1 号 00:00:00 到现在
      startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      break;
    }
    default:
      return;
  }

  // 格式化为字符串
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  dateRange.value = [formatDate(startDate), formatDate(endDate)];
  loadStatistics();
}

// 更新图表
function updateCharts() {
  updateRequestCountChart();
  updateTokenUsageChart();
}

// 更新请求次数折线图
function updateRequestCountChart() {
  if (!requestCountChartRef.value) return;

  if (!requestCountChart) {
    requestCountChart = echarts.init(requestCountChartRef.value);
  }

  // 按日期聚合请求数
  const dateMap = new Map<string, number>();
  statistics.value.requests.forEach((req: any) => {
    const date = req.date || req.timestamp.split('T')[0];
    dateMap.set(date, (dateMap.get(date) || 0) + 1);
  });

  const dates = Array.from(dateMap.keys()).sort();
  const counts = dates.map(date => dateMap.get(date) || 0);

  const themeConfig = getEChartsThemeConfig();
  const isDark = isDarkTheme.value;

  const option = {
    ...themeConfig,
    tooltip: {
      ...themeConfig.tooltip,
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
      borderColor: themeConfig.grid.borderColor,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates,
      axisLabel: {
        rotate: 45,
        color: themeConfig.xAxis.axisLabel.color,
      },
      axisLine: themeConfig.xAxis.axisLine,
      splitLine: themeConfig.xAxis.splitLine,
    },
    yAxis: {
      type: 'value',
      name: t('llmStatistics.requestCount'),
      axisLabel: themeConfig.yAxis.axisLabel,
      axisLine: themeConfig.yAxis.axisLine,
      splitLine: themeConfig.yAxis.splitLine,
      nameTextStyle: themeConfig.yAxis.nameTextStyle,
    },
    series: [
      {
        name: t('llmStatistics.requestCount'),
        type: 'line',
        smooth: true,
        data: counts,
        itemStyle: {
          color: '#409EFF',
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
              { offset: 1, color: isDark ? 'rgba(64, 158, 255, 0.1)' : 'rgba(64, 158, 255, 0.1)' },
            ],
          },
        },
      },
    ],
  };

  requestCountChart.setOption(option);
}

// 更新 Token 用量柱状图
function updateTokenUsageChart() {
  if (!tokenUsageChartRef.value) return;

  if (!tokenUsageChart) {
    tokenUsageChart = echarts.init(tokenUsageChartRef.value);
  }

  // 按日期聚合 token 用量
  const dateMap = new Map<string, { prompt: number; completion: number; total: number }>();
  statistics.value.requests.forEach((req: any) => {
    const date = req.date || req.timestamp.split('T')[0];
    const existing = dateMap.get(date) || { prompt: 0, completion: 0, total: 0 };
    existing.prompt += req.prompt_tokens || 0;
    existing.completion += req.completion_tokens || 0;
    existing.total += req.total_tokens || 0;
    dateMap.set(date, existing);
  });

  const dates = Array.from(dateMap.keys()).sort();
  const promptTokens = dates.map(date => dateMap.get(date)?.prompt || 0);
  const completionTokens = dates.map(date => dateMap.get(date)?.completion || 0);
  const totalTokens = dates.map(date => dateMap.get(date)?.total || 0);

  const themeConfig = getEChartsThemeConfig();

  const option = {
    ...themeConfig,
    tooltip: {
      ...themeConfig.tooltip,
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
      },
    },
    legend: {
      ...themeConfig.legend,
      data: [
        t('llmStatistics.promptTokens'),
        t('llmStatistics.completionTokens'),
        t('llmStatistics.totalTokens'),
      ],
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
      borderColor: themeConfig.grid.borderColor,
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: {
        rotate: 45,
        color: themeConfig.xAxis.axisLabel.color,
      },
      axisLine: themeConfig.xAxis.axisLine,
      splitLine: themeConfig.xAxis.splitLine,
    },
    yAxis: {
      type: 'value',
      name: t('llmStatistics.tokenCount'),
      axisLabel: themeConfig.yAxis.axisLabel,
      axisLine: themeConfig.yAxis.axisLine,
      splitLine: themeConfig.yAxis.splitLine,
      nameTextStyle: themeConfig.yAxis.nameTextStyle,
    },
    series: [
      {
        name: t('llmStatistics.promptTokens'),
        type: 'bar',
        data: promptTokens,
        itemStyle: { color: '#67C23A' },
      },
      {
        name: t('llmStatistics.completionTokens'),
        type: 'bar',
        data: completionTokens,
        itemStyle: { color: '#E6A23C' },
      },
      {
        name: t('llmStatistics.totalTokens'),
        type: 'bar',
        data: totalTokens,
        itemStyle: { color: '#409EFF' },
      },
    ],
  };

  tokenUsageChart.setOption(option);
}

// 导出统计（暴露给父组件使用）
async function handleExport() {
  try {
    let startDate: Date | undefined = undefined;
    let endDate: Date | undefined = undefined;

    if (dateRange.value && dateRange.value[0] && dateRange.value[1]) {
      startDate = new Date(dateRange.value[0]);
      endDate = new Date(dateRange.value[1]);
    }

    const json = await exportStatistics(startDate, endDate);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = dateRange.value
      ? `${dateRange.value[0].split(' ')[0]}_${dateRange.value[1].split(' ')[0]}`
      : 'all';
    a.download = `llm-statistics-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ElMessage.success(t('llmStatistics.exportSuccess'));
  } catch (error) {
    logger.error('导出统计数据失败:', error);
    ElMessage.error(t('llmStatistics.exportFailed'));
  }
}

// 清空统计（暴露给父组件使用）
async function handleClear() {
  try {
    await ElMessageBox.confirm(
      t('llmStatistics.clearConfirm'),
      t('llmStatistics.clearConfirmTitle'),
      {
        confirmButtonText: t('llmStatistics.confirm'),
        cancelButtonText: t('llmStatistics.cancel'),
        type: 'warning',
      }
    );

    await ElMessageBox.confirm(
      t('llmStatistics.clearConfirmAgain'),
      t('llmStatistics.clearConfirmTitle'),
      {
        confirmButtonText: t('llmStatistics.confirm'),
        cancelButtonText: t('llmStatistics.cancel'),
        type: 'warning',
      }
    );

    await clearStatistics();
    await loadStatistics();
    ElMessage.success(t('llmStatistics.clearSuccess'));
  } catch (error) {
    if (error !== 'cancel') {
      logger.error('清空统计数据失败:', error);
      ElMessage.error(t('llmStatistics.clearFailed'));
    }
  }
}

// 暴露方法给父组件
defineExpose({
  handleExport,
  handleClear,
  loadStatistics,
});

// 监听主题变化，重新渲染图表
watch(
  () => themeState.currentTheme.type,
  () => {
    nextTick(() => {
      updateCharts();
    });
  }
);

// 窗口大小变化时调整图表
function handleResize() {
  if (requestCountChart) {
    requestCountChart.resize();
  }
  if (tokenUsageChart) {
    tokenUsageChart.resize();
  }
}

onMounted(() => {
  window.addEventListener('resize', handleResize);
  loadStatistics();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  if (requestCountChart) {
    requestCountChart.dispose();
    requestCountChart = null;
  }
  if (tokenUsageChart) {
    tokenUsageChart.dispose();
    tokenUsageChart = null;
  }
});
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
  background-color: v-bind('themeState.currentTheme.background2nd || themeState.currentTheme.background');
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
  background-color: v-bind('themeState.currentTheme.background2nd || themeState.currentTheme.background');
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

