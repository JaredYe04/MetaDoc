import { MdToHtmlAdapter } from './md-to-html-adapter'
import type { HtmlExportOptions } from './types'
import type { DocumentFormat, ExportFormat } from '../../../../types'
import { convertLatexToMarkdown } from '../../utils/latex-utils'

/**
 * LaTeX -> HTML：先 TEX→MD，再走与 Markdown→HTML 相同的预处理与选项（选项存储复用 md→html）。
 */
export class TexToHtmlAdapter extends MdToHtmlAdapter {
  override sourceFormat: 'tex' = 'tex'
  override targetFormat: 'html' = 'html'
  override id = 'tex-to-html'
  override name = 'LaTeX to HTML'
  override nameKey = 'export.adapters.texToHtml.name'

  getOptionsStorageFormats(): { source: DocumentFormat; target: ExportFormat } {
    return { source: 'md', target: 'html' }
  }

  override async prepareExportData(
    data: { md: string; json: string; tex: string },
    options: HtmlExportOptions,
    context?: { doc?: { path?: string }; handle?: { mark: (p: number, msg?: any) => void } }
  ): Promise<{
    md: string
    json: string
    tex: string
    html?: string
    imageUrls?: string[]
  }> {
    const mdFromTex = convertLatexToMarkdown(data.tex ?? '')
    return super.prepareExportData({ ...data, md: mdFromTex }, options, context)
  }
}
