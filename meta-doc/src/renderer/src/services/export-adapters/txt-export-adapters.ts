import { MdToMdAdapter } from './md-to-md-adapter'
import { MdToHtmlAdapter } from './md-to-html-adapter'
import { MdToDocxAdapter } from './md-to-docx-adapter'
import { MdToPdfAdapter } from './md-to-pdf-adapter'
import type {
  DocxExportOptions,
  HtmlExportOptions,
  MarkdownExportOptions,
  PdfExportOptions
} from './types'
import { wrapPlainTextAsExportMarkdown } from '../plain-text-to-export-markdown'

function wrapData(
  data: { md: string; json: string; tex: string },
  context?: { doc?: { path?: string } }
) {
  const md = wrapPlainTextAsExportMarkdown(data.md, context?.doc?.path)
  return { ...data, md }
}

/** 纯文本 / 代码 → Markdown */
export class TxtToMdAdapter extends MdToMdAdapter {
  override sourceFormat: 'txt' = 'txt'
  override id = 'txt-to-md'
  override name = 'Plain text to Markdown'
  override nameKey = 'export.adapters.txtToMd.name'

  override async prepareExportData(
    data: { md: string; json: string; tex: string },
    options: MarkdownExportOptions,
    context?: { doc?: { path?: string } }
  ) {
    return super.prepareExportData(wrapData(data, context), options, context)
  }
}

export class TxtToHtmlAdapter extends MdToHtmlAdapter {
  override sourceFormat: 'txt' = 'txt'
  override id = 'txt-to-html'
  override name = 'Plain text to HTML'
  override nameKey = 'export.adapters.txtToHtml.name'

  override async prepareExportData(
    data: { md: string; json: string; tex: string },
    options: HtmlExportOptions,
    context?: { doc?: { path?: string }; handle?: { mark: (p: number, msg?: any) => void } }
  ) {
    return super.prepareExportData(wrapData(data, context), options, context)
  }
}

export class TxtToDocxAdapter extends MdToDocxAdapter {
  override sourceFormat: 'txt' = 'txt'
  override id = 'txt-to-docx'
  override name = 'Plain text to DOCX'
  override nameKey = 'export.adapters.txtToDocx.name'

  override async prepareExportData(
    data: { md: string; json: string; tex: string },
    options: DocxExportOptions,
    context?: any
  ) {
    return super.prepareExportData(wrapData(data, context), options, context)
  }
}

export class TxtToPdfAdapter extends MdToPdfAdapter {
  override sourceFormat: 'txt' = 'txt'
  override id = 'txt-to-pdf'
  override name = 'Plain text to PDF'
  override nameKey = 'export.adapters.txtToPdf.name'

  override async prepareExportData(
    data: { md: string; json: string; tex: string },
    options: PdfExportOptions,
    context?: any
  ) {
    return super.prepareExportData(wrapData(data, context), options, context)
  }
}
