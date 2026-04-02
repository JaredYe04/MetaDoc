import { BaseExportAdapter } from './base-adapter'
import type { DocxExportOptions, ExportOptionField } from './types'
import type { DocumentFormat, ExportFormat } from '../../../../types'
import { settings } from '../../utils/settings.js'
import {
  filterMetaStep,
  preRenderCharts,
  ensureLocal2HttpForTarget,
  collectOriginalImageUrls,
  collectRenderedImageUrls
} from '../export-steps'
import { embedImagesInline, ConvertMarkdownToHtmlVditor } from '../../utils/md-utils'

/**
 * Markdown -> DOCX 导出适配器
 */
export class MdToDocxAdapter extends BaseExportAdapter<'md', 'docx', DocxExportOptions> {
  sourceFormat: 'md' = 'md'
  targetFormat: 'docx' = 'docx'
  id = 'md-to-docx'
  name = 'Markdown to DOCX'
  nameKey = 'export.adapters.mdToDocx.name'
  description = 'Export Markdown document to DOCX format'
  descriptionKey = 'export.adapters.mdToDocx.description'

  getDefaultOptions(): DocxExportOptions {
    // 从编辑器字体设置获取默认值
    const editorChineseFont = settings.fontEditorChinese || 'OPPO Sans 4.0'
    const editorWesternFont = settings.fontEditorWestern || 'New York'
    // 组合字体：西文优先，中文后备
    const defaultFontFamily = `${editorWesternFont}, ${editorChineseFont}`

    return {
      enableStyleMapping: true,
      styleMapping: {
        normal: {
          fontFamily: defaultFontFamily,
          fontSize: 10.5, // pt
          lineHeight: 1.15
        },
        heading1: {
          fontFamily: defaultFontFamily,
          fontSize: 18, // pt
          lineHeight: 1.2
        },
        heading2: {
          fontFamily: defaultFontFamily,
          fontSize: 16, // pt
          lineHeight: 1.2
        },
        heading3: {
          fontFamily: defaultFontFamily,
          fontSize: 14, // pt
          lineHeight: 1.2
        },
        heading4: {
          fontFamily: defaultFontFamily,
          fontSize: 12, // pt
          lineHeight: 1.2
        }
      },
      generateCover: false,
      generateToc: false,
      processFormula: true,
      showPageNumbers: false,
      showHeader: false,
      autoNumberImages: true,
      imageLabelFontSize: 10.5, // pt
      imageLabelFontFamily: editorChineseFont // 默认使用编辑器中文字体
    }
  }

  getOptionFields(): ExportOptionField[] {
    return [
      // 第一个 tab：封面、目录等设置
      {
        key: 'generateCover',
        label: '生成封面',
        labelKey: 'export.options.generateCover.label',
        type: 'boolean',
        default: false,
        description: '在第一页显示文档标题、作者、摘要和关键词',
        descriptionKey: 'export.options.generateCover.description',
        tab: 'basic'
      },
      {
        key: 'generateToc',
        label: '生成目录',
        labelKey: 'export.options.generateToc.label',
        type: 'boolean',
        default: false,
        description: '在封面后（或文档开头）生成目录',
        descriptionKey: 'export.options.generateToc.description',
        tab: 'basic'
      },
      {
        key: 'processFormula',
        label: '处理公式',
        labelKey: 'export.options.processFormula.label',
        type: 'boolean',
        default: true,
        description: '是否自动处理 LaTeX 公式',
        descriptionKey: 'export.options.processFormula.description',
        tab: 'basic'
      },
      // 第二个 tab：字体、行距等设置
      {
        key: 'enableStyleMapping',
        label: '启用格式绑定',
        labelKey: 'export.options.enableStyleMapping.label',
        type: 'boolean',
        default: true,
        description: '是否将Markdown元素映射到Word样式（如标题1、标题2等）',
        descriptionKey: 'export.options.enableStyleMapping.description',
        tab: 'style'
      },
      {
        key: 'styleMapping.normal.fontFamily',
        label: '正文字体',
        labelKey: 'export.options.normalFontFamily.label',
        type: 'font',
        default: 'Microsoft YaHei',
        description: '正文使用的字体',
        descriptionKey: 'export.options.normalFontFamily.description',
        showWhen: (options) => options.enableStyleMapping === true,
        tab: 'style'
      },
      {
        key: 'styleMapping.normal.fontSize',
        label: '正文字号',
        labelKey: 'export.options.normalFontSize.label',
        type: 'fontSize',
        default: 10.5,
        description: '正文字体大小',
        descriptionKey: 'export.options.normalFontSize.description',
        showWhen: (options) => options.enableStyleMapping === true,
        tab: 'style'
      },
      {
        key: 'styleMapping.normal.lineHeight',
        label: '正文行距',
        labelKey: 'export.options.normalLineHeight.label',
        type: 'number',
        default: 1.15,
        min: 0.5,
        max: 3,
        step: 0.05,
        description: '正文行距倍数',
        descriptionKey: 'export.options.normalLineHeight.description',
        showWhen: (options) => options.enableStyleMapping === true,
        tab: 'style'
      },
      {
        key: 'styleMapping.heading1.fontFamily',
        label: '标题1字体',
        labelKey: 'export.options.heading1FontFamily.label',
        type: 'font',
        default: 'Microsoft YaHei',
        description: '一级标题使用的字体',
        descriptionKey: 'export.options.heading1FontFamily.description',
        showWhen: (options) => options.enableStyleMapping === true,
        tab: 'style'
      },
      {
        key: 'styleMapping.heading1.fontSize',
        label: '标题1字号',
        labelKey: 'export.options.heading1FontSize.label',
        type: 'fontSize',
        default: 18,
        description: '一级标题字体大小',
        descriptionKey: 'export.options.heading1FontSize.description',
        showWhen: (options) => options.enableStyleMapping === true,
        tab: 'style'
      },
      {
        key: 'styleMapping.heading1.lineHeight',
        label: '标题1行距',
        labelKey: 'export.options.heading1LineHeight.label',
        type: 'number',
        default: 1.2,
        min: 0.5,
        max: 3,
        step: 0.05,
        description: '一级标题行距倍数',
        descriptionKey: 'export.options.heading1LineHeight.description',
        showWhen: (options) => options.enableStyleMapping === true,
        tab: 'style'
      },
      {
        key: 'styleMapping.heading2.fontFamily',
        label: '标题2字体',
        labelKey: 'export.options.heading2FontFamily.label',
        type: 'font',
        default: 'Microsoft YaHei',
        description: '二级标题使用的字体',
        descriptionKey: 'export.options.heading2FontFamily.description',
        showWhen: (options) => options.enableStyleMapping === true,
        tab: 'style'
      },
      {
        key: 'styleMapping.heading2.fontSize',
        label: '标题2字号',
        labelKey: 'export.options.heading2FontSize.label',
        type: 'fontSize',
        default: 16,
        description: '二级标题字体大小',
        descriptionKey: 'export.options.heading2FontSize.description',
        showWhen: (options) => options.enableStyleMapping === true,
        tab: 'style'
      },
      {
        key: 'styleMapping.heading2.lineHeight',
        label: '标题2行距',
        labelKey: 'export.options.heading2LineHeight.label',
        type: 'number',
        default: 1.2,
        min: 0.5,
        max: 3,
        step: 0.05,
        description: '二级标题行距倍数',
        descriptionKey: 'export.options.heading2LineHeight.description',
        showWhen: (options) => options.enableStyleMapping === true,
        tab: 'style'
      },
      {
        key: 'styleMapping.heading3.fontFamily',
        label: '标题3字体',
        labelKey: 'export.options.heading3FontFamily.label',
        type: 'font',
        default: 'Microsoft YaHei',
        description: '三级标题使用的字体',
        descriptionKey: 'export.options.heading3FontFamily.description',
        showWhen: (options) => options.enableStyleMapping === true,
        tab: 'style'
      },
      {
        key: 'styleMapping.heading3.fontSize',
        label: '标题3字号',
        labelKey: 'export.options.heading3FontSize.label',
        type: 'fontSize',
        default: 14,
        description: '三级标题字体大小',
        descriptionKey: 'export.options.heading3FontSize.description',
        showWhen: (options) => options.enableStyleMapping === true,
        tab: 'style'
      },
      {
        key: 'styleMapping.heading3.lineHeight',
        label: '标题3行距',
        labelKey: 'export.options.heading3LineHeight.label',
        type: 'number',
        default: 1.2,
        min: 0.5,
        max: 3,
        step: 0.05,
        description: '三级标题行距倍数',
        descriptionKey: 'export.options.heading3LineHeight.description',
        showWhen: (options) => options.enableStyleMapping === true,
        tab: 'style'
      },
      {
        key: 'styleMapping.heading4.fontFamily',
        label: '标题4字体',
        labelKey: 'export.options.heading4FontFamily.label',
        type: 'font',
        default: 'Microsoft YaHei',
        description: '四级标题使用的字体',
        descriptionKey: 'export.options.heading4FontFamily.description',
        showWhen: (options) => options.enableStyleMapping === true,
        tab: 'style'
      },
      {
        key: 'styleMapping.heading4.fontSize',
        label: '标题4字号',
        labelKey: 'export.options.heading4FontSize.label',
        type: 'fontSize',
        default: 12,
        description: '四级标题字体大小',
        descriptionKey: 'export.options.heading4FontSize.description',
        showWhen: (options) => options.enableStyleMapping === true,
        tab: 'style'
      },
      {
        key: 'styleMapping.heading4.lineHeight',
        label: '标题4行距',
        labelKey: 'export.options.heading4LineHeight.label',
        type: 'number',
        default: 1.2,
        min: 0.5,
        max: 3,
        step: 0.05,
        description: '四级标题行距倍数',
        descriptionKey: 'export.options.heading4LineHeight.description',
        showWhen: (options) => options.enableStyleMapping === true,
        tab: 'style'
      },
      // 页眉页脚功能暂时隐藏（功能未完成）
      // {
      //   key: 'showPageNumbers',
      //   label: '显示页码',
      //   labelKey: 'export.options.showPageNumbers.label',
      //   type: 'boolean',
      //   default: false,
      //   description: '在页脚显示页码',
      //   descriptionKey: 'export.options.showPageNumbers.description',
      // },
      // {
      //   key: 'showHeader',
      //   label: '显示页眉',
      //   labelKey: 'export.options.showHeader.label',
      //   type: 'boolean',
      //   default: false,
      //   description: '在页眉显示文档标题和页码信息',
      //   descriptionKey: 'export.options.showHeader.description',
      // },
      {
        key: 'autoNumberImages',
        label: '自动给图片编号',
        labelKey: 'export.options.autoNumberImages.label',
        type: 'boolean',
        default: true,
        description: '为文档中的图片自动添加编号标签（如图 1、图 2）',
        descriptionKey: 'export.options.autoNumberImages.description',
        tab: 'basic'
      },
      {
        key: 'imageLabelFontSize',
        label: '图片标签字号',
        labelKey: 'export.options.imageLabelFontSize.label',
        type: 'fontSize',
        default: 10.5,
        description: '图片编号标签的字号大小（pt）',
        descriptionKey: 'export.options.imageLabelFontSize.description',
        showWhen: (options) => options.autoNumberImages === true,
        tab: 'basic'
      },
      {
        key: 'imageLabelFontFamily',
        label: '图片标签字体',
        labelKey: 'export.options.imageLabelFontFamily.label',
        type: 'font',
        default: 'SimHei',
        description: '图片编号标签的字体',
        descriptionKey: 'export.options.imageLabelFontFamily.description',
        showWhen: (options) => options.autoNumberImages === true,
        tab: 'basic'
      }
    ]
  }

  validateOptions(options: Partial<DocxExportOptions>): { valid: boolean; error?: string } {
    if (options.enableStyleMapping && options.styleMapping) {
      const sm = options.styleMapping
      // 验证字体大小
      const sizes = [
        sm.normal?.fontSize,
        sm.heading1?.fontSize,
        sm.heading2?.fontSize,
        sm.heading3?.fontSize,
        sm.heading4?.fontSize
      ]
      for (const size of sizes) {
        if (size !== undefined && (size < 6 || size > 72)) {
          return { valid: false, error: '字体大小必须在6-72磅之间' }
        }
      }
      // 验证行距
      const lineHeights = [
        sm.normal?.lineHeight,
        sm.heading1?.lineHeight,
        sm.heading2?.lineHeight,
        sm.heading3?.lineHeight,
        sm.heading4?.lineHeight
      ]
      for (const lh of lineHeights) {
        if (lh !== undefined && (lh < 0.5 || lh > 3)) {
          return { valid: false, error: '行距必须在0.5-3之间' }
        }
      }
    }
    return { valid: true }
  }

  async prepareExportData(
    data: { md: string; json: string; tex: string },
    options: DocxExportOptions,
    context?: any
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
    // 图表（echarts、mermaid、plantuml 等）始终预渲染为图片，与 generateCover/generateToc/processFormula 等选项无关
    markdown = await preRenderCharts(markdown, {
      format: 'bitmap',
      progressCallback
    })
    markdown = await ensureLocal2HttpForTarget(markdown, 'docx', docPath)
    const markdownWithBase64Images = await embedImagesInline(markdown)
    // DOCX 使用 md2html：结构稳定，公式与 .language-math 占位替换一致；勿用 preview+mathRender，易产生重复正文与复杂 DOM
    const html = await ConvertMarkdownToHtmlVditor(markdownWithBase64Images)

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
    options: DocxExportOptions,
    context?: any
  ): Promise<void> {
    throw new Error('executeExport should be called in main process')
  }
}
