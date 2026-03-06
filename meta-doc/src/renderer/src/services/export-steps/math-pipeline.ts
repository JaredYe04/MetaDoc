/**
 * 公式预处理步骤（可复用）
 * 仅对需要公式转图的目标格式（如 html）将数学公式转为图片
 */

import { renderMarkdownMathToImages } from '../../utils/math-renderer'
import { createRendererLogger } from '../../utils/logger'
import type { ExportFormat } from '../../../types'

const logger = createRendererLogger('ExportSteps.MathPipeline')

/** 需要将公式转为图片的目标格式（与原先一致：仅 html） */
const MATH_TO_IMAGE_FORMATS: ExportFormat[] = ['html']

/**
 * 按目标格式决定是否将数学公式转为图片，并执行转换
 * @param markdown 原始 Markdown
 * @param targetFormat 目标格式
 * @param outputFormat 图片输出格式，默认 'svg'
 * @returns 处理后的 Markdown
 */
export async function prepareMathForTarget(
  markdown: string,
  targetFormat: ExportFormat,
  outputFormat: 'svg' | 'png' = 'svg'
): Promise<string> {
  if (!MATH_TO_IMAGE_FORMATS.includes(targetFormat)) {
    return markdown
  }
  try {
    return await renderMarkdownMathToImages(markdown, outputFormat)
  } catch (e) {
    logger.error('数学公式转图片失败，保留原文:', e)
    return markdown
  }
}
