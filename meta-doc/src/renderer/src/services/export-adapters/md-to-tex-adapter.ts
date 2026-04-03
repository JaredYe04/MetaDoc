import { BaseExportAdapter } from './base-adapter'
import type { LatexExportOptions, ExportOptionField } from './types'
import type { WorkspaceDocument } from '../../stores/workspace'
import {
  filterMetaStep,
  preRenderCharts,
  prepareImagesForTarget,
  collectOriginalImageUrls,
  collectRenderedImageUrls,
  convertMarkdownToLatexWithOptions
} from '../export-steps'

/**
 * Markdown -> LaTeX 导出适配器
 */
export class MdToTexAdapter extends BaseExportAdapter<'md', 'tex', LatexExportOptions> {
  sourceFormat: 'md' = 'md'
  targetFormat: 'tex' = 'tex'
  id = 'md-to-tex'
  name = 'Markdown to LaTeX'
  nameKey = 'export.adapters.mdToTex.name'

  getDefaultOptions(): LatexExportOptions {
    return {
      documentClass: 'article',
      includePackages: true,
      imageProcessing: 'original', // 默认保留原始链接
      generateCover: false,
      generateToc: false,
      showPageNumbers: true, // LaTeX 默认显示页码
      showHeader: true, // LaTeX 默认显示页眉
      removeTitlePrefixes: true // 默认自动去除标题前缀
    }
  }

  getOptionFields(): ExportOptionField[] {
    return [
      {
        key: 'documentClass',
        label: '文档类',
        labelKey: 'export.options.documentClass.label',
        type: 'select',
        default: 'article',
        description: 'LaTeX文档类',
        descriptionKey: 'export.options.documentClass.description',
        options: [
          { label: 'article', value: 'article' },
          { label: 'book', value: 'book' },
          { label: 'report', value: 'report' }
        ]
      },
      {
        key: 'includePackages',
        label: '包含常用包',
        labelKey: 'export.options.includePackages.label',
        type: 'boolean',
        default: true,
        description: '是否自动包含常用的LaTeX包',
        descriptionKey: 'export.options.includePackages.description'
      },
      {
        key: 'imageProcessing',
        label: '图片处理方式',
        labelKey: 'export.options.imageProcessing.label',
        type: 'select',
        default: 'original',
        description: '选择图片的处理方式：保留原始链接或保存到文件夹',
        descriptionKey: 'export.options.imageProcessing.description',
        options: [
          {
            label: '保留原始链接',
            value: 'original',
            labelKey: 'export.options.imageProcessing.original'
          },
          {
            label: '保存到文件夹',
            value: 'folder',
            labelKey: 'export.options.imageProcessing.folder'
          }
        ]
      },
      {
        key: 'generateCover',
        label: '生成封面',
        labelKey: 'export.options.generateCover.label',
        type: 'boolean',
        default: false,
        description: '在第一页显示文档标题、作者、摘要和关键词',
        descriptionKey: 'export.options.generateCover.description'
      },
      {
        key: 'generateToc',
        label: '生成目录',
        labelKey: 'export.options.generateToc.label',
        type: 'boolean',
        default: false,
        description: '在封面后（或文档开头）生成目录',
        descriptionKey: 'export.options.generateToc.description'
      },
      {
        key: 'showPageNumbers',
        label: '显示页码',
        labelKey: 'export.options.showPageNumbers.label',
        type: 'boolean',
        default: true,
        description: '在页脚显示页码',
        descriptionKey: 'export.options.showPageNumbers.description'
      },
      {
        key: 'showHeader',
        label: '显示页眉',
        labelKey: 'export.options.showHeader.label',
        type: 'boolean',
        default: true,
        description: '在页眉显示文档标题和页码信息',
        descriptionKey: 'export.options.showHeader.description'
      },
      {
        key: 'removeTitlePrefixes',
        label: '自动去除标题前缀',
        labelKey: 'export.options.removeTitlePrefixes.label',
        type: 'boolean',
        default: true,
        description:
          'LaTeX会自动为每个章节添加编号，如果标题中已有编号前缀会导致重复。启用此选项将自动去除所有标题开头的编号和点号（如"1.1"、"一、"等）',
        descriptionKey: 'export.options.removeTitlePrefixes.description'
      }
    ]
  }

  async prepareExportData(
    data: { md: string; json: string; tex: string },
    options: LatexExportOptions,
    context?: {
      doc?: WorkspaceDocument
      handle?: {
        mark: (p: number, msg?: any) => void
        signal?: AbortSignal
        requestId?: string
      }
    }
  ): Promise<{
    md: string
    json: string
    tex: string
    html?: string
    imageUrls?: string[]
  }> {
    const doc = context?.doc
    const handle = context?.handle
    const docPath = doc?.path
    const willRegenerateFromOutline = options.removeTitlePrefixes !== false && !!doc?.outline

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

    const chartAbortOpts = { signal: handle?.signal, requestId: handle?.requestId }

    let markdown = filterMetaStep(data.md)
    if (!willRegenerateFromOutline) {
      markdown = await preRenderCharts(markdown, {
        format: 'svg',
        progressCallback,
        ...chartAbortOpts
      })
    }
    markdown = await prepareImagesForTarget(markdown, 'tex', options.imageProcessing, docPath)

    if (!doc) {
      throw new Error('MdToTexAdapter.prepareExportData requires context.doc')
    }
    const tex = await convertMarkdownToLatexWithOptions(
      markdown,
      doc,
      data.json,
      options,
      chartAbortOpts
    )

    const originalImageUrls = collectOriginalImageUrls(data.md)
    const imageUrls = collectRenderedImageUrls(markdown, originalImageUrls)

    return {
      md: markdown,
      json: data.json,
      tex,
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
    options: LatexExportOptions,
    context?: any
  ): Promise<void> {
    throw new Error('executeExport should be called in main process')
  }
}
