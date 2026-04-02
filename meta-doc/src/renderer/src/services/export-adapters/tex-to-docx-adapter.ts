import { MdToDocxAdapter } from './md-to-docx-adapter'
import type { DocxExportOptions } from './types'
import type { DocumentFormat, ExportFormat } from '../../../../types'
import { convertLatexToMarkdown } from '../../utils/latex-utils'

/**
 * LaTeX -> DOCX：先 TEX→MD，再走与 Markdown→DOCX 相同的预处理与选项（选项存储复用 md→docx）。
 */
export class TexToDocxAdapter extends MdToDocxAdapter {
  override sourceFormat: 'tex' = 'tex'
  override targetFormat: 'docx' = 'docx'
  override id = 'tex-to-docx'
  override name = 'LaTeX to DOCX'
  override nameKey = 'export.adapters.texToDocx.name'

  getOptionsStorageFormats(): { source: DocumentFormat; target: ExportFormat } {
    return { source: 'md', target: 'docx' }
  }

  override async prepareExportData(
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
    const mdFromTex = convertLatexToMarkdown(data.tex ?? '')
    return super.prepareExportData({ ...data, md: mdFromTex }, options, context)
  }
}
