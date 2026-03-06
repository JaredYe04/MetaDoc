import { BaseExportAdapter } from './base-adapter'
import type { BaseExportOptions, ExportOptionField } from './types'
import { convertLatexToMarkdown } from '../../utils/latex-utils'
import {
  local2httpProtocol,
  embedImagesInline,
  ConvertMarkdownToHtmlManually
} from '../../utils/md-utils'

/**
 * LaTeX -> HTML 导出适配器
 * 流程：TEX→MD → local2http → embedImagesInline → MD→HTML
 */
export class TexToHtmlAdapter extends BaseExportAdapter<'tex', 'html', BaseExportOptions> {
  sourceFormat: 'tex' = 'tex'
  targetFormat: 'html' = 'html'
  id = 'tex-to-html'
  name = 'LaTeX to HTML'
  nameKey = 'export.adapters.texToHtml.name'

  getDefaultOptions(): BaseExportOptions {
    return {}
  }

  getOptionFields(): ExportOptionField[] {
    return []
  }

  async prepareExportData(
    data: { md: string; json: string; tex: string },
    options: BaseExportOptions,
    context?: { doc?: { path?: string } }
  ): Promise<{
    md: string
    json: string
    tex: string
    html?: string
    imageUrls?: string[]
  }> {
    let markdown = convertLatexToMarkdown(data.tex)
    markdown = await local2httpProtocol(markdown, context?.doc?.path)
    markdown = await embedImagesInline(markdown)
    const html = await ConvertMarkdownToHtmlManually(markdown, false)
    return {
      md: markdown,
      json: data.json,
      tex: data.tex,
      html
    }
  }

  async executeExport(
    preparedData: { md: string; json: string; tex: string; html?: string; imageUrls?: string[] },
    targetPath: string,
    options: BaseExportOptions,
    context?: any
  ): Promise<void> {
    throw new Error('executeExport should be called in main process')
  }
}
