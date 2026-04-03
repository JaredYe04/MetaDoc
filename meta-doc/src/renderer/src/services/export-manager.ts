import type { DocumentFormat, ExportFormat } from '../../../types'
import type { ExportTargetDescriptor } from '../../../common/export-rules'
import { getExportTargets } from '../../../common/export-rules'
import { serializeDocument } from './document-serializer'
import type { WorkspaceDocument } from '../stores/workspace'
import { createRendererLogger } from '../utils/logger.js'
import { exportAdapterRegistry, type ExportOptions } from './export-adapters'
import { loadExportOptions, mergeExportOptions } from './export-adapters/storage'
import { isExportImagePath, loadImageFileAsMarkdownImage } from './export-path-utils'

export interface BaseExportPayload {
  sourceFormat: DocumentFormat
  targetFormat: ExportFormat
  suggestedName: string
  sourcePath?: string
  requestId?: string
  data: {
    md: string
    json: string
    tex: string
  }
  html?: string
  imageUrls?: string[] // 预渲染生成的图片 URL，用于清理
  exportOptions?: ExportOptions // 导出选项，传递给main进程
}

export class NotImplementedExportError extends Error {
  constructor(sourceFormat: DocumentFormat, targetFormat: ExportFormat) {
    super(`Export from ${sourceFormat} to ${targetFormat} is not implemented yet.`)
    this.name = 'NotImplementedExportError'
  }
}

export const getExportOptions = (format: DocumentFormat): ExportTargetDescriptor[] => {
  return getExportTargets(format)
}

export const prepareExportPayload = async (
  doc: WorkspaceDocument,
  targetFormat: ExportFormat,
  explicitName?: string,
  exportOptions?: ExportOptions,
  prepareOpts?: { requestId?: string }
): Promise<BaseExportPayload> => {
  const messageBridge = (await import('../bridge/message-bridge')).default
  const { createProgressHandle } = await import('../utils/progress-handle')

  const requestId =
    prepareOpts?.requestId?.trim() ||
    `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const handle = createProgressHandle({
    requestId,
    message: 'agent.reference.progress.preparingExport',
    initialPercentage: 0,
    onCancel: () => {
      try {
        messageBridge.invoke('cancel-export-task', requestId)
      } catch (err) {
        // ignore
      }
    }
  })

  const sourceFormat = (doc.format ?? 'md') as DocumentFormat
  const descriptor = getExportTargets(sourceFormat).find((item) => item.format === targetFormat)

  if (!descriptor) {
    throw new Error(`不支持 ${sourceFormat} 导出为 ${targetFormat}`)
  }

  const logger = createRendererLogger('ExportManager')

  // 获取适配器（所有支持的 source→target 均已注册适配器，无适配器即不支持）
  const adapter = exportAdapterRegistry.get(sourceFormat, targetFormat)
  if (!adapter) {
    throw new NotImplementedExportError(sourceFormat, targetFormat)
  }

  // 获取并合并导出选项（部分适配器复用其它源格式的存储键，如 LaTeX→DOCX 使用 md→docx）
  const defaultOptions = adapter.getDefaultOptions()
  const storageFormats = adapter.getOptionsStorageFormats?.() ?? {
    source: sourceFormat,
    target: targetFormat
  }
  const savedOptions = loadExportOptions(storageFormats.source, storageFormats.target)
  const mergedOptions = mergeExportOptions(defaultOptions, savedOptions)
  const finalOptions = exportOptions
    ? mergeExportOptions(mergedOptions, exportOptions)
    : mergedOptions

  const serialized = await serializeDocument(doc)
  let mdForPayload = serialized.md
  // .png 等在编辑器里常按 UTF-8 解码进 markdown，实为乱码；导出前强制按二进制读成 data URL 图片语法
  if (doc.path && isExportImagePath(doc.path)) {
    try {
      const mdImg = await loadImageFileAsMarkdownImage(doc.path, (p) =>
        messageBridge.invoke('read-file-for-upload', p)
      )
      if (mdImg != null) {
        mdForPayload = mdImg
      }
    } catch {
      /* 保持 serialized.md */
    }
  }

  const suggestedName =
    explicitName && explicitName.trim().length > 0 ? explicitName.trim() : inferDocumentName(doc)

  const base: BaseExportPayload = {
    sourceFormat,
    targetFormat,
    suggestedName,
    sourcePath: doc.path,
    requestId,
    data: {
      md: mdForPayload,
      json: serialized.json,
      tex: serialized.tex
    }
  }

  if (descriptor.status === 'planned') {
    throw new NotImplementedExportError(sourceFormat, targetFormat)
  }

  try {
    try {
      await messageBridge.invoke('export-arm-abort', requestId)
    } catch (armErr) {
      logger.warn('export-arm-abort 失败:', armErr)
    }

    const payloadData = await adapter.prepareExportData(base.data, finalOptions, {
      doc,
      handle
    })
    return {
      ...base,
      html: payloadData.html,
      data: {
        ...base.data,
        md: payloadData.md,
        json: payloadData.json,
        tex: payloadData.tex ?? base.data.tex
      },
      imageUrls: payloadData.imageUrls,
      exportOptions: finalOptions
    }
  } catch (error) {
    logger.error('准备导出数据失败:', error)
    try {
      await messageBridge.invoke('export-disarm-abort', requestId)
    } catch {
      /* ignore */
    }
    throw error
  }
}

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
