/**
 * @deprecated 已废弃的导出逻辑
 *
 * 此文件包含旧的导出准备逻辑，仅作为向后兼容的备用方案。
 * 当导出适配器未找到时，会回退到这些函数。
 *
 * 注意：这些函数可能包含已知的bug和未维护的代码，不建议在新代码中使用。
 */

import type { DocumentFormat, ExportFormat } from '../../../types'
import type { BaseExportPayload, NotImplementedExportError } from './export-manager'
import type { WorkspaceDocument } from '../stores/workspace'
import { serializeDocument } from './document-serializer'
import { convertLatexToMarkdown } from '../utils/latex-utils'
import {
  ConvertHtmlForPdf,
  ConvertMarkdownToHtmlManually,
  ConvertMarkdownToHtmlVditor,
  filterMetaDataFromMd,
  embedImagesInline,
  image2local,
  local2httpProtocol
} from '../utils/md-utils'
import { preRenderAllCharts } from '../utils/chart-pre-renderer'
import { createRendererLogger } from '../utils/logger'
import { renderMarkdownMathToImages } from '../utils/math-renderer.js'

/**
 * 推断文档名称
 */
const inferDocumentName = (doc: WorkspaceDocument): string => {
  const title = doc.meta?.title?.trim()
  if (title) {
    return title
  }

  if (doc.path) {
    const segments = doc.path.split(/[/\\]+/).filter(Boolean)
    if (segments.length > 0) {
      return segments[segments.length - 1]
    }
  }

  return 'Untitled'
}

/**
 * @deprecated 原有的导出准备逻辑（作为回退）
 * 当找不到适配器时使用
 */
export const prepareExportPayloadLegacy = async (
  doc: WorkspaceDocument,
  targetFormat: ExportFormat,
  explicitName: string | undefined,
  requestId: string,
  handle: any
): Promise<BaseExportPayload> => {
  const sourceFormat = (doc.format ?? 'md') as DocumentFormat
  const serialized = await serializeDocument(doc)
  const suggestedName =
    explicitName && explicitName.trim().length > 0 ? explicitName.trim() : inferDocumentName(doc)

  const base: BaseExportPayload = {
    sourceFormat,
    targetFormat,
    suggestedName,
    sourcePath: doc.path,
    requestId,
    data: {
      md: serialized.md,
      json: serialized.json,
      tex: serialized.tex
    }
  }

  switch (sourceFormat) {
    case 'md':
      return await prepareMarkdownExports(base, doc, targetFormat, handle)
    case 'tex':
      return await prepareLatexExports(base, doc, targetFormat, handle)
    case 'json':
      return await prepareJsonExports(base, targetFormat, handle)
    default:
      throw new Error(`未知的文档格式: ${String(sourceFormat)}`)
  }
}

/**
 * @deprecated 准备Markdown导出（旧版逻辑）
 */
const prepareMarkdownExports = async (
  base: BaseExportPayload,
  doc: WorkspaceDocument,
  targetFormat: ExportFormat,
  handle: any
): Promise<BaseExportPayload> => {
  let markdown = filterMetaDataFromMd(base.data.md)
  const logger = createRendererLogger('ExportManager')

  // 记录原始 markdown 中的图片，用于区分用户原本引用的图片和预渲染生成的图片
  const originalImageUrls = new Set<string>()
  if (['html', 'docx', 'pdf', 'tex'].includes(targetFormat)) {
    const { getRuntimeServerBaseUrlSync } = await import('../config/runtime-server')
    const imagesPrefix = getRuntimeServerBaseUrlSync() + '/images/'
    const originalImageRegex = /!\[.*?\]\((.*?)\)/g
    let match
    while ((match = originalImageRegex.exec(markdown)) !== null) {
      const imagePath = match[1]
      if (imagePath.startsWith(imagesPrefix)) {
        originalImageUrls.add(imagePath)
      }
      // 如果是本地路径，转换为 HTTP URL 格式后记录（用于后续比较）
      else if (!imagePath.startsWith('data:image/')) {
        const fileName = imagePath.split(/[/\\]/).pop() || imagePath
        originalImageUrls.add(`${imagesPrefix}${fileName}`)
      }
    }
  }

  // 对于所有需要生成 HTML 的格式，先预渲染所有图表
  if (['html', 'docx', 'pdf', 'tex'].includes(targetFormat)) {
    // 先预渲染图表（统一处理，不依赖 Vditor）
    // 图表会被转换为本地图片 URL，这样在导出时就不需要依赖 Vditor 的渲染
    // Word 导出使用位图，其他格式使用矢量图
    const chartFormat = targetFormat === 'docx' ? 'bitmap' : 'svg'
    try {
      logger.debug(`preRenderAllCharts start`)
      handle.mark(5, {
        message: 'agent.reference.progress.preRenderingCharts',
        subMessage: 'agent.reference.progress.preparingExport'
      })
      markdown = await preRenderAllCharts(markdown, '', chartFormat, (progress: any) => {
        const percent = Math.min(80, progress?.percentage ?? 0)
        handle.mark(percent, {
          message: progress?.message ?? 'agent.reference.progress.preRenderingCharts',
          subMessage: progress?.subMessage ?? 'agent.reference.progress.preparingExport',
          params: progress?.params,
          status: progress?.status as any
        })
      })
      logger.debug(`preRenderAllCharts end`)
      handle.mark(80, { message: 'agent.reference.progress.preRenderingCharts' })
    } catch (error) {
      logger.warn('图表预渲染失败，继续使用原始 Markdown:', error)
      handle.mark(5, {
        message: '图表预渲染失败',
        subMessage: error instanceof Error ? error.message : String(error),
        status: 'warning'
      })
    }
  }

  // 对于需要生成HTML的格式（html），将数学公式转换为图片
  if (['html', 'docx'].includes(targetFormat)) {
    try {
      const imageFormat = targetFormat === 'docx' ? 'png' : 'svg'
      logger.debug(`renderMarkdownMathToImages start, format: ${imageFormat}`)
      markdown = await renderMarkdownMathToImages(markdown, imageFormat)
      logger.debug(`renderMarkdownMathToImages end`)
    } catch (e) {
      logger.error('数学公式转图片失败，保留原文:', e)
    }
  }

  // 后处理图片路径
  if (targetFormat === 'tex') {
    markdown = await image2local(markdown)
  } else {
    markdown = await local2httpProtocol(markdown, doc.path)
  }
  if (targetFormat === 'docx') {
    markdown = await embedImagesInline(markdown)
  }

  let html = ''
  let tex = ''
  if (targetFormat === 'docx') {
    html = await ConvertMarkdownToHtmlVditor(markdown)
  } else if (targetFormat === 'pdf') {
    html = await ConvertHtmlForPdf(markdown)
  } else if (targetFormat === 'html') {
    html = await ConvertMarkdownToHtmlManually(markdown)
  } else if (targetFormat === 'md') {
    html = await ConvertMarkdownToHtmlManually(markdown)
  } else if (targetFormat === 'tex') {
    // Markdown 转 LaTeX，图表已经预渲染为图片 URL
    const { convertMarkdownToLatex } = await import('../utils/latex-utils')
    const title = doc.meta?.title || 'Generated Document'
    // 传递元信息（注意：legacy版本不使用exportOptions，直接从doc.meta获取）
    const latexOptions = {
      meta: {
        title: doc.meta?.title || title,
        author: doc.meta?.author || '',
        description: doc.meta?.description || '',
        keywords: Array.isArray(doc.meta?.keywords) ? doc.meta.keywords : []
      }
    }
    tex = await convertMarkdownToLatex(markdown, title, latexOptions)
  }

  // 收集预渲染生成的图片 URL（用于后续清理）
  // 只收集那些不在原始图片列表中的 URL，即预渲染生成的图片
  const imageUrls: string[] = []
  if (['html', 'docx', 'pdf', 'tex'].includes(targetFormat)) {
    try {
      const { getRuntimeServerBaseUrlSync } = await import('../config/runtime-server')
      const imagesPrefix = getRuntimeServerBaseUrlSync() + '/images/'
      const imagesPrefixEscaped = imagesPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // 使用 [^)\\] 避免 [^)] 在某些环境下被解析为“未闭合分组”；路径中不含 ) 与 \
      const imageRegex = new RegExp(
        '!\\\\[.*?\\\\]\\\\(' + imagesPrefixEscaped + '([^)\\]+)\\\\)',
        'g'
      )
      let match
      while ((match = imageRegex.exec(markdown)) !== null) {
        const imageUrl = imagesPrefix + (match[1] || '')
        // 只收集预渲染生成的图片（不在原始图片列表中的）
        if (!originalImageUrls.has(imageUrl)) {
          imageUrls.push(imageUrl)
          logger.debug(`收集预渲染生成的图片: ${imageUrl}`)
        } else {
          logger.debug(`跳过用户原本引用的图片: ${imageUrl}`)
        }
      }
    } catch (err) {
      logger.warn('收集预渲染图片 URL 时出错，继续导出，不影响结果:', err)
    }
  }

  return {
    ...base,
    requestId: base.requestId,
    html,
    data: {
      ...base.data,
      md: markdown,
      tex: tex || base.data.tex
    },
    // 保存图片 URL 用于清理
    imageUrls
  }
}

/**
 * @deprecated 准备LaTeX导出（旧版逻辑）
 */
const prepareLatexExports = async (
  base: BaseExportPayload,
  doc: WorkspaceDocument,
  targetFormat: ExportFormat,
  _handle: any
): Promise<BaseExportPayload> => {
  if (targetFormat === 'tex' || targetFormat === 'pdf') {
    return base
  }

  const markdownFromTex = convertLatexToMarkdown(doc.tex ?? base.data.tex ?? '')
  const updatedBase: BaseExportPayload = {
    ...base,
    data: {
      ...base.data,
      md: markdownFromTex
    }
  }

  if (targetFormat === 'md') {
    return updatedBase
  }

  let markdown = markdownFromTex
  if (['html', 'docx', 'pdf'].includes(targetFormat)) {
    markdown = await local2httpProtocol(markdown, doc.path)
  }

  if (['html', 'docx'].includes(targetFormat)) {
    markdown = await embedImagesInline(markdown)
  }

  let html = ''
  if (targetFormat === 'docx') {
    html = await ConvertMarkdownToHtmlVditor(markdown)
  } else if (targetFormat === 'html') {
    html = await ConvertMarkdownToHtmlManually(markdown)
  }

  return {
    ...updatedBase,
    html
  }
}

/**
 * @deprecated 准备JSON导出（旧版逻辑）
 */
const prepareJsonExports = async (
  base: BaseExportPayload,
  targetFormat: ExportFormat,
  _handle: any
): Promise<BaseExportPayload> => {
  if (targetFormat === 'json') {
    return base
  }

  throw new NotImplementedExportError(base.sourceFormat, targetFormat)
}
