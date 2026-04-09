/**
 * 图表预渲染步骤（可复用）
 * 封装 preRenderAllCharts，统一接口：format 'svg' | 'bitmap'，可选 progressCallback
 */

import { preRenderAllCharts } from '../../utils/chart-pre-renderer'
import { createRendererLogger } from '../../utils/common/logger'

const logger = createRendererLogger('ExportSteps.ChartPreRender')

export type ChartOutputFormat = 'svg' | 'bitmap'

export interface PreRenderChartsOptions {
  format: ChartOutputFormat
  progressCallback?: (progress: {
    message?: string
    subMessage?: string
    percentage?: number
    params?: Record<string, unknown>
    status?: string
  }) => void
  /** 与导出进度句柄一致，用于顺序预渲染、中断及主进程 IPC 取消 */
  signal?: AbortSignal
  requestId?: string
}

function isExportAbortErr(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const err = e as Error
  if (err.name === 'AbortError') return true
  const msg = typeof err.message === 'string' ? err.message : ''
  return msg.includes('已取消') || msg.includes('操作已取消')
}

/**
 * 预渲染 Markdown 中所有图表代码块为图片，写回 Markdown
 * @param md 原始 Markdown
 * @param options format: docx 用 bitmap，其余用 svg；progressCallback 用于进度
 * @returns 处理后的 Markdown（图表已替换为图片链接）
 */
export async function preRenderCharts(
  md: string,
  options: PreRenderChartsOptions
): Promise<string> {
  const { format, progressCallback, signal, requestId } = options
  const exportControl = signal ? { signal, requestId } : undefined
  try {
    logger.debug('preRenderCharts start', { format })
    const result = await preRenderAllCharts(
      md,
      '',
      format,
      progressCallback as any,
      exportControl as any
    )
    logger.debug('preRenderCharts end')
    return result
  } catch (error) {
    if (isExportAbortErr(error)) {
      logger.debug('图表预渲染已取消')
      throw error
    }
    logger.warn('图表预渲染失败，继续使用原始 Markdown:', error)
    if (progressCallback) {
      progressCallback({
        message: '图表预渲染失败',
        subMessage: error instanceof Error ? error.message : String(error),
        status: 'warning'
      })
    }
    return md
  }
}
