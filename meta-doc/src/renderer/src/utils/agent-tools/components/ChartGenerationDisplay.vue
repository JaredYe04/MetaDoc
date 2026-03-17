<template>
  <div class="chart-generation-display" :style="containerStyle">
    <div
      v-if="displayData.stage === 'generating'"
      class="generating-state"
      :style="statusMessageStyle"
    >
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ $t('agent.display.chartGeneration.generating') }}</span>
    </div>

    <div
      v-else-if="displayData.stage === 'rendering'"
      class="rendering-state"
      :style="statusMessageStyle"
    >
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ $t('agent.display.chartGeneration.rendering') }}</span>
      <div v-if="displayData.chartCode" class="code-preview">
        <Collapsible class="code-collapsible">
          <CollapsibleTrigger class="code-collapsible-trigger" hide-icon>
            {{ $t('agent.display.chartGeneration.viewCode') }}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre class="code-content" :style="codeContentStyle">{{ displayData.chartCode }}</pre>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>

    <div
      v-else-if="displayData.stage === 'converting'"
      class="converting-state"
      :style="statusMessageStyle"
    >
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ $t('agent.display.chartGeneration.converting') }}</span>
    </div>

    <div
      v-else-if="displayData.stage === 'completed'"
      class="completed-state"
      :style="completedStateStyle"
    >
      <div class="result-header" :style="headerStyle">
        <div class="header-info">
          <Badge type="success" size="small">{{ displayData.chartType }}</Badge>
          <span class="chart-name" :style="chartNameStyle">{{ displayData.chartName }}</span>
        </div>
        <div class="header-actions">
          <Button type="primary" size="sm" @click="downloadChart">
            <Download class="w-4 h-4 mr-1" />
            {{ $t('agent.display.chartGeneration.download') }}
          </Button>
        </div>
      </div>

      <!-- 图表预览 -->
      <div class="chart-preview" :style="chartPreviewStyle">
        <!-- 如果是 PDF 格式，显示对应的 SVG（因为 PDF 无法直接在浏览器中显示） -->
        <img
          v-if="displayData.svgUrl || displayData.url"
          :src="displayData.svgUrl || displayData.url"
          :alt="displayData.chartName"
          class="chart-image"
          @error="handleImageError"
        />
        <div v-else class="no-preview">
          <Empty :description="$t('agent.display.chartGeneration.noPreview')" :image-size="80" />
        </div>
        <!-- PDF 格式提示 -->
        <div v-if="displayData.svgUrl" class="pdf-format-hint">
          <Badge type="info" size="small">
            {{ $t('agent.display.chartGeneration.pdfFormatHint', 'PDF 格式，显示对应的 SVG 预览') }}
          </Badge>
        </div>
      </div>

      <!-- 代码预览 -->
      <div v-if="displayData.chartCode" class="code-section">
        <Collapsible class="code-collapsible">
          <CollapsibleTrigger class="code-collapsible-trigger" hide-icon>
            {{ $t('agent.display.chartGeneration.viewCode') }}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre class="code-content" :style="codeContentStyle">{{ displayData.chartCode }}</pre>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <!-- 结果信息 -->
      <div class="result-info">
        <Descriptions :column="1" size="small" border>
          <DescriptionsItem :label="$t('agent.display.chartGeneration.chartType')">
            {{ displayData.chartType }}
          </DescriptionsItem>
          <DescriptionsItem :label="$t('agent.display.chartGeneration.url')">
            <Link :href="displayData.url" target="_blank" type="primary">
              {{ displayData.url }}
            </Link>
          </DescriptionsItem>
          <DescriptionsItem :label="$t('agent.display.chartGeneration.localPath')">
            {{ displayData.localPath }}
          </DescriptionsItem>
        </Descriptions>
      </div>
    </div>

    <div v-else-if="displayData.stage === 'error'" class="error-state">
      <Alert variant="destructive">
        <XCircle class="h-4 w-4" />
        <AlertTitle>{{
          displayData.error || $t('agent.display.chartGeneration.generationFailed')
        }}</AlertTitle>
      </Alert>
    </div>

    <!-- 进度条 -->
    <div v-if="effectiveProgress && effectiveProgress.percentage > 0" style="margin-top: 12px">
      <Progress
        :percentage="effectiveProgress.percentage"
        :status="progressStatus"
        :stroke-width="6"
        :show-text="true"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Loading, Download } from '@element-plus/icons-vue'
import { toast } from '@renderer/utils/toast'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/progress'
import { Empty } from '@renderer/components/ui/empty'
import { Badge } from '@renderer/components/ui/badge'
import { Link } from '@renderer/components/ui/link'
import { Alert, AlertTitle, AlertDescription } from '../../../components/ui/alert'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { Descriptions, DescriptionsItem } from '@renderer/components/ui/descriptions'
import { XCircle } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { ToolDisplayComponentProps } from '../../../types/agent-tool'
import { useToolDisplayRealtime, parseToolData } from '../composables/useToolDisplayRealtime'
import { themeState } from '../../themes'
import { createRendererLogger } from '../../logger'
import messageBridge from '../../../bridge/message-bridge'

const { t } = useI18n()
const props = defineProps<ToolDisplayComponentProps & { mode?: string }>()
const isDemo = computed(() => props.mode === 'demo')
const logger = createRendererLogger('ChartGenerationDisplay')

// Demo data
const demoData = ref({
  stage: 'completed' as const,
  chartType: 'bar',
  chartName: 'demo-chart',
  url: 'https://example.com/demo-chart.png',
  localPath: '/tmp/demo-chart.png',
  chartCode: `// ECharts 配置
option = {
  title: { text: '月度销售数据' },
  xAxis: {
    type: 'category',
    data: ['一月', '二月', '三月', '四月', '五月']
  },
  yAxis: { type: 'value' },
  series: [{
    data: [120, 200, 150, 80, 70],
    type: 'bar'
  }]
};`
})

const loadDemoData = () => {
  // Demo data is set in the reactive ref above
  logger.debug('[ChartGenerationDisplay] Demo data loaded')
}

onMounted(() => {
  if (isDemo.value) {
    loadDemoData()
    return
  }
  // Real initialization continues below
})

logger.debug(
  `[ChartGenerationDisplay] 组件初始化，invocationId: ${props.invocationId}, status: ${props.status}, data:`,
  props.data
)
logger.debug(`[ChartGenerationDisplay] props 完整内容:`, props)

// 使用实时通信
const { realtimeData, realtimeStatus, realtimeProgress } = useToolDisplayRealtime(
  props.invocationId,
  props.data,
  props.status,
  props.progress
)

logger.debug(`[ChartGenerationDisplay] useToolDisplayRealtime 返回:`, {
  realtimeData: realtimeData.value,
  realtimeStatus: realtimeStatus.value,
  realtimeProgress: realtimeProgress.value
})

// 解析显示数据（优先使用实时数据）
const displayData = computed(() => {
  // Demo mode: return demo data
  if (isDemo.value) {
    return demoData.value
  }

  const data = realtimeData.value !== null ? realtimeData.value : props.data
  const parsed = parseToolData(data)

  if (typeof parsed === 'object' && parsed !== null) {
    return parsed as {
      stage: 'generating' | 'rendering' | 'converting' | 'completed' | 'error'
      prompt?: string
      chartType?: string
      format?: string
      chartCode?: string
      chartName?: string
      url?: string
      localPath?: string
      svgUrl?: string // PDF 格式时，用于显示对应的 SVG
      error?: string
    }
  }
  return { stage: 'generating' }
})

// 进度状态（优先使用实时状态）
const effectiveStatus = computed(() => {
  return realtimeStatus.value !== 'running' ? realtimeStatus.value : props.status
})

const effectiveProgress = computed(() => {
  return realtimeProgress.value || props.progress
})

const progressStatus = computed(() => {
  if (effectiveStatus.value === 'failed') return 'exception'
  if (effectiveStatus.value === 'succeeded') return 'success'
  return undefined
})

// 下载图表：弹出保存对话框，写入用户选择的路径
const downloadChart = async () => {
  if (isDemo.value) {
    toast.info(t('agent.display.chartGeneration.demoMode', '演示模式：下载功能已禁用'))
    return
  }

  // 优先使用 url（可能是 PDF），如果没有则使用 svgUrl
  const downloadUrl = displayData.value.url || displayData.value.svgUrl
  if (!downloadUrl) {
    toast.warning(t('agent.display.chartGeneration.noChart'))
    return
  }

  const fileExtension = getFileExtension(downloadUrl)
  const defaultName = `${displayData.value.chartName || 'chart'}.${fileExtension}`

  try {
    // 1. 弹出保存对话框
    const filters =
      fileExtension === 'svg'
        ? [
            { name: 'SVG Files', extensions: ['svg'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        : fileExtension === 'pdf'
          ? [
              { name: 'PDF Files', extensions: ['pdf'] },
              { name: 'All Files', extensions: ['*'] }
            ]
          : [
              { name: 'PNG Files', extensions: ['png'] },
              { name: 'All Files', extensions: ['*'] }
            ]

    const result = (await messageBridge.invoke('save-file-dialog', {
      defaultName,
      filters
    })) as { canceled?: boolean; filePath?: string } | null

    if (!result || result.canceled || !result.filePath) {
      return
    }

    const filePath = result.filePath

    // 2. 获取文件内容
    const response = await fetch(downloadUrl)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    // 3. 根据格式写入文件
    if (fileExtension === 'svg') {
      const content = await response.text()
      await messageBridge.invoke('write-file-content', {
        filePath,
        content,
        encoding: 'utf8'
      })
    } else {
      const blob = await response.blob()
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = String(reader.result || '')
          const commaIdx = dataUrl.indexOf(',')
          resolve(commaIdx >= 0 ? dataUrl.substring(commaIdx + 1) : '')
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      await messageBridge.invoke('write-file-content', {
        filePath,
        content: base64,
        encoding: 'base64'
      })
    }

    toast.success(t('agent.display.chartGeneration.downloadSuccess'))
  } catch (error) {
    toast.error(
      `${t('agent.display.chartGeneration.downloadFailed')}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// 主题样式
const containerStyle = computed(() => ({
  backgroundColor: 'transparent',
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
  borderBottomColor:
    themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
}))

const chartNameStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const chartPreviewStyle = computed(() => ({
  borderColor:
    themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
  backgroundColor: themeState.currentTheme.background2nd
}))

const codeContentStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor
}))

// 获取文件扩展名
const getFileExtension = (url: string): string => {
  const match = url.match(/\.(\w+)(\?|$)/)
  return match ? match[1] : 'png'
}

// 处理图片加载错误
const handleImageError = () => {
  const logger = createRendererLogger('ChartGenerationDisplay')
  logger.error('图表图片加载失败')
}
</script>

<style scoped>
.chart-generation-display {
  width: 100%;
}

.generating-state,
.rendering-state,
.converting-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
}

.completed-state {
  width: 100%;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chart-name {
  font-size: 16px;
  font-weight: 600;
}

.chart-preview {
  margin: 16px 0;
  padding: 12px;
  border: 1px solid;
  border-radius: 8px;
  text-align: center;
}

.chart-image {
  max-width: 100%;
  max-height: 500px;
  border-radius: 4px;
}

.no-preview {
  padding: 40px 0;
}

.pdf-format-hint {
  margin-top: 8px;
  text-align: center;
}

.code-section {
  margin: 12px 0;
}

.code-preview {
  margin-top: 12px;
}

.code-collapsible {
  border: 1px solid
    v-bind(
      'themeState.currentTheme.type === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)"'
    );
  border-radius: 4px;
  overflow: hidden;
}

.code-collapsible-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 16px;
  background-color: v-bind('themeState.currentTheme.background2nd');
  color: v-bind('themeState.currentTheme.textColor');
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  outline: none;
  transition: background-color 0.2s ease;
}

.code-collapsible-trigger:hover {
  background-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.02)"'
  );
}

.code-collapsible-trigger::after {
  content: '';
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 4px solid currentColor;
  transition: transform 0.2s ease;
}

.code-collapsible-trigger[data-state='open']::after {
  transform: rotate(180deg);
}

.code-content {
  margin: 0;
  padding: 12px;
  border-radius: 4px;
  font-family: var(--code-font-family, 'JetBrains Mono', monospace);
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.result-info {
  margin-top: 12px;
}

.error-state {
  padding: 12px;
}
</style>
