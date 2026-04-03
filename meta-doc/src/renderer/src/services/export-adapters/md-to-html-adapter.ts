import { BaseExportAdapter } from './base-adapter'
import type { HtmlExportOptions, ExportOptionField } from './types'
import {
  filterMetaStep,
  preRenderCharts,
  prepareMathForTarget,
  ensureLocal2HttpForTarget,
  prepareImagesForTarget,
  collectOriginalImageUrls,
  collectRenderedImageUrls
} from '../export-steps'
import { ConvertMarkdownToHtmlManually } from '../../utils/md-utils'
import { processHtmlImages } from '../image-processor'

/**
 * Markdown -> HTML 导出适配器
 */
export class MdToHtmlAdapter extends BaseExportAdapter<'md', 'html', HtmlExportOptions> {
  sourceFormat: 'md' = 'md'
  targetFormat: 'html' = 'html'
  id = 'md-to-html'
  name = 'Markdown to HTML'
  nameKey = 'export.adapters.mdToHtml.name'

  getDefaultOptions(): HtmlExportOptions {
    return {
      inlineStyles: true,
      imageProcessing: 'original' // 默认保留原始链接
    }
  }

  getOptionFields(): ExportOptionField[] {
    return [
      {
        key: 'inlineStyles',
        label: '内联CSS',
        labelKey: 'export.options.inlineStyles.label',
        type: 'boolean',
        default: true,
        description: '是否将CSS样式内联到HTML中',
        descriptionKey: 'export.options.inlineStyles.description'
      },
      {
        key: 'imageProcessing',
        label: '图片处理方式',
        labelKey: 'export.options.imageProcessing.label',
        type: 'select',
        default: 'original',
        description: '选择图片的处理方式：保留原始链接、Base64嵌入或保存到文件夹',
        descriptionKey: 'export.options.imageProcessing.description',
        options: [
          {
            label: '保留原始链接',
            value: 'original',
            labelKey: 'export.options.imageProcessing.original'
          },
          {
            label: 'Base64嵌入',
            value: 'base64',
            labelKey: 'export.options.imageProcessing.base64'
          },
          {
            label: '保存到文件夹',
            value: 'folder',
            labelKey: 'export.options.imageProcessing.folder'
          }
        ]
      }
    ]
  }

  async prepareExportData(
    data: { md: string; json: string; tex: string },
    options: HtmlExportOptions,
    context?: {
      doc?: { path?: string }
      handle?: { mark: (p: number, msg?: any) => void; signal?: AbortSignal; requestId?: string }
    }
  ): Promise<{
    md: string
    json: string
    tex: string
    html?: string
    imageUrls?: string[]
  }> {
    const handle = context?.handle
    const docPath = context?.doc?.path
    const progressCallback = handle
      ? (p: any) => {
          const percent = Math.min(80, p?.percentage ?? 0)
          handle.mark(percent, {
            message: p?.message ?? 'agent.reference.progress.preRenderingCharts',
            subMessage: p?.subMessage ?? 'agent.reference.progress.preparingExport',
            params: p?.params,
            status: p?.status
          })
        }
      : undefined

    let markdown = filterMetaStep(data.md)
    markdown = await preRenderCharts(markdown, {
      format: 'svg',
      progressCallback,
      signal: handle?.signal,
      requestId: handle?.requestId
    })
    markdown = await prepareMathForTarget(markdown, 'html')
    markdown = await ensureLocal2HttpForTarget(markdown, 'html', docPath)
    markdown = await prepareImagesForTarget(markdown, 'html', options.imageProcessing, docPath)

    const convertToBase64 = options.imageProcessing === 'base64'
    let html = await ConvertMarkdownToHtmlManually(markdown, convertToBase64)
    if (options.imageProcessing === 'base64') {
      html = await processHtmlImages(html, 'base64')
    }

    const originalImageUrls = collectOriginalImageUrls(data.md)
    const imageUrls = collectRenderedImageUrls(markdown, originalImageUrls)

    return {
      md: markdown,
      json: data.json,
      tex: data.tex,
      html,
      imageUrls
    }
  }

  async executeExport(
    preparedData: {
      md: string
      json: string
      tex: string
      html?: string
      imageUrls?: string[]
    },
    targetPath: string,
    options: HtmlExportOptions,
    context?: any
  ): Promise<void> {
    throw new Error('executeExport should be called in main process')
  }
}
