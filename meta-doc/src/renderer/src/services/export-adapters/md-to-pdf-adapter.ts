import { BaseExportAdapter } from './base-adapter'
import type { PdfExportOptions, ExportOptionField } from './types'
import type { DocumentFormat, ExportFormat } from '../../../../types'
import { settings } from '../../utils/settings.js'
import {
  filterMetaStep,
  preRenderCharts,
  prepareMathForTarget,
  ensureLocal2HttpForTarget,
  collectOriginalImageUrls,
  collectRenderedImageUrls
} from '../export-steps'
import { ConvertHtmlForPdf } from '../../utils/md-utils'

/**
 * Markdown -> PDF 导出适配器
 */
export class MdToPdfAdapter extends BaseExportAdapter<'md', 'pdf', PdfExportOptions> {
  sourceFormat: 'md' = 'md'
  targetFormat: 'pdf' = 'pdf'
  id = 'md-to-pdf'
  name = 'Markdown to PDF'
  nameKey = 'export.adapters.mdToPdf.name'
  description = 'Export Markdown document to PDF format'
  descriptionKey = 'export.adapters.mdToPdf.description'

  getDefaultOptions(): PdfExportOptions {
    // 从编辑器字体设置获取默认值
    const editorChineseFont = settings.fontEditorChinese || 'OPPO Sans 4.0'
    const editorWesternFont = settings.fontEditorWestern || 'New York'

    return {
      margins: {
        top: 0.5,
        bottom: 0.5,
        left: 0.5,
        right: 0.5
      },
      pageSize: 'A4',
      printBackground: true,
      pdfThemeMode: 'light',
      // 字体设置
      chineseFont: editorChineseFont,
      westernFont: editorWesternFont
    }
  }

  getOptionFields(): ExportOptionField[] {
    return [
      // 基本设置 tab
      {
        key: 'pageSize',
        label: '纸张大小',
        labelKey: 'export.options.pageSize.label',
        type: 'select',
        default: 'A4',
        description: '选择PDF的纸张大小',
        descriptionKey: 'export.options.pageSize.description',
        tab: 'basic',
        options: [
          { label: 'A4', value: 'A4', labelKey: 'export.options.pageSize.a4' },
          { label: 'A3', value: 'A3', labelKey: 'export.options.pageSize.a3' },
          { label: 'A5', value: 'A5', labelKey: 'export.options.pageSize.a5' },
          { label: 'B5', value: 'B5', labelKey: 'export.options.pageSize.b5' },
          { label: 'Letter', value: 'Letter', labelKey: 'export.options.pageSize.letter' },
          { label: 'Legal', value: 'Legal', labelKey: 'export.options.pageSize.legal' }
        ]
      },
      {
        key: 'margins',
        label: '页边距',
        labelKey: 'export.options.margins.label',
        type: 'object',
        default: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
        description: 'PDF页边距设置',
        descriptionKey: 'export.options.margins.description',
        tab: 'basic',
        fields: [
          {
            key: 'margins.top',
            label: '上边距（英寸）',
            labelKey: 'export.options.marginTop.label',
            type: 'number',
            default: 0.5,
            min: 0,
            max: 5,
            step: 0.1,
            description: 'PDF上边距，单位：英寸',
            descriptionKey: 'export.options.marginTop.description'
          },
          {
            key: 'margins.bottom',
            label: '下边距（英寸）',
            labelKey: 'export.options.marginBottom.label',
            type: 'number',
            default: 0.5,
            min: 0,
            max: 5,
            step: 0.1,
            description: 'PDF下边距，单位：英寸',
            descriptionKey: 'export.options.marginBottom.description'
          },
          {
            key: 'margins.left',
            label: '左边距（英寸）',
            labelKey: 'export.options.marginLeft.label',
            type: 'number',
            default: 0.5,
            min: 0,
            max: 5,
            step: 0.1,
            description: 'PDF左边距，单位：英寸',
            descriptionKey: 'export.options.marginLeft.description'
          },
          {
            key: 'margins.right',
            label: '右边距（英寸）',
            labelKey: 'export.options.marginRight.label',
            type: 'number',
            default: 0.5,
            min: 0,
            max: 5,
            step: 0.1,
            description: 'PDF右边距，单位：英寸',
            descriptionKey: 'export.options.marginRight.description'
          }
        ]
      },
      {
        key: 'printBackground',
        label: '打印背景',
        labelKey: 'export.options.printBackground.label',
        type: 'boolean',
        default: true,
        description: '是否在PDF中包含背景颜色和图片',
        descriptionKey: 'export.options.printBackground.description',
        tab: 'basic'
      },
      {
        key: 'pdfThemeMode',
        label: 'PDF 外观',
        labelKey: 'export.options.pdfThemeMode.label',
        type: 'select',
        default: 'light',
        descriptionKey: 'export.options.pdfThemeMode.description',
        tab: 'basic',
        options: [
          {
            label: '浅色',
            value: 'light',
            labelKey: 'export.options.pdfThemeMode.light'
          },
          {
            label: '深色',
            value: 'dark',
            labelKey: 'export.options.pdfThemeMode.dark'
          },
          {
            label: '跟随主题',
            value: 'follow',
            labelKey: 'export.options.pdfThemeMode.follow'
          }
        ]
      },
      // 字体设置（放在单独的 tab）
      {
        key: 'chineseFont',
        label: '中文字体',
        labelKey: 'export.options.chineseFont.label',
        type: 'font',
        default: settings.fontEditorChinese || 'OPPO Sans 4.0',
        description: 'PDF中文字体',
        descriptionKey: 'export.options.chineseFont.description',
        previewText: '你好世界',
        tab: 'style'
      },
      {
        key: 'westernFont',
        label: '西文字体',
        labelKey: 'export.options.westernFont.label',
        type: 'font',
        default: settings.fontEditorWestern || 'New York',
        description: 'PDF西文字体',
        descriptionKey: 'export.options.westernFont.description',
        previewText: 'AaBbCc',
        tab: 'style'
      }
    ]
  }

  validateOptions(options: Partial<PdfExportOptions>): { valid: boolean; error?: string } {
    if (options.margins) {
      const margins = options.margins
      if (margins.top < 0 || margins.bottom < 0 || margins.left < 0 || margins.right < 0) {
        return { valid: false, error: '边距不能为负数' }
      }
      if (margins.top > 5 || margins.bottom > 5 || margins.left > 5 || margins.right > 5) {
        return { valid: false, error: '边距不能超过5英寸' }
      }
    }
    return { valid: true }
  }

  async prepareExportData(
    data: { md: string; json: string; tex: string },
    options: PdfExportOptions,
    context?: { doc?: { path?: string }; handle?: { mark: (p: number, msg?: any) => void } }
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
      progressCallback
    })
    markdown = await prepareMathForTarget(markdown, 'pdf')
    markdown = await ensureLocal2HttpForTarget(markdown, 'pdf', docPath)

    const html = await ConvertHtmlForPdf(markdown, options)
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
    options: PdfExportOptions,
    context?: any
  ): Promise<void> {
    // 这个方法的实际实现在main进程中
    // 这里只是接口定义，实际调用会通过IPC传递到main进程
    throw new Error('executeExport should be called in main process')
  }
}
