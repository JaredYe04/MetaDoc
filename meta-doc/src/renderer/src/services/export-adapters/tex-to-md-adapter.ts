import { BaseExportAdapter } from './base-adapter'
import type { BaseExportOptions, ExportOptionField } from './types'
import { convertLatexToMarkdown } from '../../utils/latex-utils'

/**
 * LaTeX -> Markdown 导出适配器
 */
export class TexToMdAdapter extends BaseExportAdapter<'tex', 'md', BaseExportOptions> {
  sourceFormat: 'tex' = 'tex'
  targetFormat: 'md' = 'md'
  id = 'tex-to-md'
  name = 'LaTeX to Markdown'
  nameKey = 'export.adapters.texToMd.name'

  getDefaultOptions(): BaseExportOptions {
    return {}
  }

  getOptionFields(): ExportOptionField[] {
    return []
  }

  async prepareExportData(
    data: { md: string; json: string; tex: string },
    options: BaseExportOptions,
    _context?: any
  ): Promise<{
    md: string
    json: string
    tex: string
    html?: string
    imageUrls?: string[]
  }> {
    const markdown = convertLatexToMarkdown(data.tex)
    return {
      md: markdown,
      json: data.json,
      tex: data.tex
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
