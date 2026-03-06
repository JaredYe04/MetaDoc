/**
 * 图片处理步骤（可复用）
 * 封装 local2httpProtocol、processMarkdownImages，按 target 与 imageProcessing 决定调用链
 */

import { local2httpProtocol } from '../../utils/md-utils'
import { processMarkdownImages, type ImageProcessingMode } from '../image-processor'
import type { ExportFormat } from '../../../types'

/** 需要先转为 HTTP URL 的目标格式（与原先一致：html, docx, pdf） */
const TARGETS_NEED_HTTP_URL: ExportFormat[] = ['html', 'docx', 'pdf']

/** 支持 processMarkdownImages 的目标格式 */
const TARGETS_WITH_IMAGE_PROCESSING: ExportFormat[] = ['html', 'md', 'tex']

/**
 * 按目标格式将 Markdown 中的本地图片路径统一转为 HTTP URL（供后续步骤使用）
 * 仅对 html/docx/pdf 执行，其余格式直接返回原内容
 */
export async function ensureLocal2HttpForTarget(
  markdown: string,
  targetFormat: ExportFormat,
  docPath?: string
): Promise<string> {
  if (!TARGETS_NEED_HTTP_URL.includes(targetFormat)) {
    return markdown
  }
  return await local2httpProtocol(markdown, docPath)
}

/**
 * 按目标格式与图片处理模式处理 Markdown 中的图片
 * 仅当 targetFormat 为 html|md|tex 且 imageProcessing 有值时调用 processMarkdownImages
 */
export async function prepareImagesForTarget(
  markdown: string,
  targetFormat: ExportFormat,
  imageProcessing: ImageProcessingMode | undefined,
  docPath?: string
): Promise<string> {
  if (!TARGETS_WITH_IMAGE_PROCESSING.includes(targetFormat) || !imageProcessing) {
    return markdown
  }
  return await processMarkdownImages(markdown, imageProcessing, targetFormat as 'html' | 'md' | 'tex', docPath)
}
