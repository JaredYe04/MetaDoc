/**
 * 导出适配器注册中心
 * 统一注册所有导出适配器
 */

import { exportAdapterRegistry } from './types'
import { MdToPdfAdapter } from './md-to-pdf-adapter'
import { MdToDocxAdapter } from './md-to-docx-adapter'
import { MdToHtmlAdapter } from './md-to-html-adapter'
import { MdToMdAdapter } from './md-to-md-adapter'
import { MdToTexAdapter } from './md-to-tex-adapter'
import { TexToPdfAdapter } from './tex-to-pdf-adapter'
import { TexToTexAdapter } from './tex-to-tex-adapter'
import { TexToMdAdapter } from './tex-to-md-adapter'
import { TexToHtmlAdapter } from './tex-to-html-adapter'
import { TexToDocxAdapter } from './tex-to-docx-adapter'

// 注册所有适配器
export async function registerAllAdapters(): Promise<void> {
  // Markdown 导出适配器
  exportAdapterRegistry.register(new MdToPdfAdapter())
  exportAdapterRegistry.register(new MdToDocxAdapter())
  exportAdapterRegistry.register(new MdToHtmlAdapter())
  exportAdapterRegistry.register(new MdToMdAdapter())
  exportAdapterRegistry.register(new MdToTexAdapter())

  // LaTeX 导出适配器
  exportAdapterRegistry.register(new TexToPdfAdapter())
  exportAdapterRegistry.register(new TexToTexAdapter())
  exportAdapterRegistry.register(new TexToMdAdapter())
  exportAdapterRegistry.register(new TexToHtmlAdapter())
  exportAdapterRegistry.register(new TexToDocxAdapter())
}

// 导出注册表和适配器类型
export { exportAdapterRegistry } from './types'
export type {
  ExportAdapter,
  ExportOptions,
  ExportOptionField,
  PdfExportOptions,
  DocxExportOptions,
  HtmlExportOptions,
  MarkdownExportOptions,
  LatexExportOptions,
  BaseExportOptions
} from './types'

// 导出所有适配器类（用于类型推断）
export {
  MdToPdfAdapter,
  MdToDocxAdapter,
  MdToHtmlAdapter,
  MdToMdAdapter,
  MdToTexAdapter,
  TexToPdfAdapter,
  TexToTexAdapter,
  TexToMdAdapter,
  TexToHtmlAdapter,
  TexToDocxAdapter
}
