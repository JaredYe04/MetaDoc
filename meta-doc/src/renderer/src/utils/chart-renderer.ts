/**
 * 统一的图表渲染函数
 * 根据图表类型自动选择合适的渲染路径
 */
import {
  renderChartViaVditor,
  renderEChartsViaIpc,
  renderMermaidViaApi,
  CHART_TYPES
} from './chart-pre-renderer'
import { renderPlantUMLViaIpc } from './chart-pre-renderer'
import { getLocalVditorCDN, vditorCDN } from './vditor-cdn'
import { isElectronEnv } from './event-bus'
import { createRendererLogger } from './logger'

const logger = createRendererLogger('ChartRenderer')

export interface RenderChartOptions {
  chartType: string
  code: string
  format?: 'svg' | 'png' | 'pdf'
}

/**
 * 统一渲染图表
 * @param options 渲染选项
 * @returns 图片URL（data URL或blob URL）
 */
export async function renderChart(options: RenderChartOptions): Promise<string> {
  const { chartType, code, format = 'svg' } = options

  if (!code || !code.trim()) {
    throw new Error('图表代码不能为空')
  }

  const chartConfig = CHART_TYPES[chartType as keyof typeof CHART_TYPES]
  if (!chartConfig) {
    throw new Error(`不支持的图表类型: ${chartType}`)
  }

  const targetFormat = format === 'png' ? 'png' : 'svg'
  let imageUrl: string | null = null

  try {
    if (chartConfig.useIpc) {
      // 使用IPC渲染（ECharts, PlantUML等）
      if (chartType === 'echarts') {
        imageUrl = await renderEChartsViaIpc(code, targetFormat)
      } else if (chartType === 'plantuml') {
        const cleanCode = code.replace(/^\uFEFF/, '').trim()
        if (
          cleanCode.includes('<svg') ||
          cleanCode.includes('<text') ||
          cleanCode.includes('<?xml')
        ) {
          throw new Error('PlantUML 代码包含 XML 标签，代码提取可能有问题')
        }
        imageUrl = await renderPlantUMLViaIpc(cleanCode, targetFormat)
      } else {
        throw new Error(`不支持的 IPC 渲染类型: ${chartType}`)
      }
    } else if (chartConfig.useMermaidApi && chartType === 'mermaid') {
      // 使用 Mermaid 官方 API 渲染
      imageUrl = await renderMermaidViaApi(code, targetFormat)
    } else {
      // 使用 Vditor 渲染（其他图表类型）
      const cdn = isElectronEnv() ? getLocalVditorCDN() : vditorCDN
      imageUrl = await renderChartViaVditor(chartType, code, cdn, chartConfig, targetFormat)
    }

    if (!imageUrl) {
      throw new Error('图表渲染失败：未返回图片URL')
    }

    logger.debug(`${chartType} 图表渲染完成，格式: ${targetFormat}`)
    return imageUrl
  } catch (error) {
    logger.error(`${chartType} 图表渲染失败:`, error)
    throw error
  }
}
