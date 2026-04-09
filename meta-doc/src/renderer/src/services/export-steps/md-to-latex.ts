/**
 * Markdown → LaTeX 转换步骤（带导出选项、大纲重生成、图表预渲染）
 * 供 MdToTexAdapter 使用，与原先 export-manager 中 convertMarkdownToLatexWithOptions 行为一致
 */

import type { ExportOptions } from '../export-adapters/types'
import type { WorkspaceDocument } from '../../stores/workspace'
import { getRuntimeServerBaseUrlSync } from '../../config/runtime-server'
import { createRendererLogger } from '../../utils/common/logger'
import { preRenderCharts } from './chart-pre-render'

const logger = createRendererLogger('ExportSteps.MdToLatex')

export async function convertMarkdownToLatexWithOptions(
  markdown: string,
  doc: WorkspaceDocument,
  jsonData: string,
  exportOptions: ExportOptions,
  chartAbort?: { signal?: AbortSignal; requestId?: string }
): Promise<string> {
  const { convertMarkdownToLatex } = await import('../../utils/latex-utils')
  const { removeAllTitlePrefixes, generateMarkdownFromOutlineTree } = await import(
    '../../utils/document/outline'
  )
  const title = doc.meta?.title || 'Generated Document'

  let meta: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(jsonData || '{}')
    meta = (parsed?.current_article_meta_data || {}) as Record<string, unknown>
  } catch {
    /* ignore */
  }

  const latexOptions = exportOptions as any
  const needsOutlineRegenerate = latexOptions?.removeTitlePrefixes !== false && !!doc.outline

  let processedMarkdown = markdown
  if (needsOutlineRegenerate) {
    const modifiedOutline = removeAllTitlePrefixes(doc.outline)
    processedMarkdown = generateMarkdownFromOutlineTree(modifiedOutline)
  }

  const hasChartCodeBlocks =
    /```(?:plantuml|mermaid|echarts|flowchart|graphviz|vega-lite|ditaa)/i.test(processedMarkdown)
  const shouldPreRenderCharts =
    needsOutlineRegenerate ||
    (hasChartCodeBlocks && !processedMarkdown.includes(getRuntimeServerBaseUrlSync() + '/images/'))

  if (shouldPreRenderCharts) {
    try {
      logger.debug('在 Markdown 确定后，执行图表预渲染')
      processedMarkdown = await preRenderCharts(processedMarkdown, {
        format: 'svg',
        signal: chartAbort?.signal,
        requestId: chartAbort?.requestId
      })
    } catch (error) {
      logger.warn('图表预渲染失败:', error)
    }
  }

  const finalLatexOptions = {
    ...exportOptions,
    meta: {
      title: meta.title || title,
      author: meta.author || '',
      description: meta.description || '',
      keywords: Array.isArray(meta.keywords) ? meta.keywords : []
    }
  }

  return await convertMarkdownToLatex(processedMarkdown, title, finalLatexOptions)
}
