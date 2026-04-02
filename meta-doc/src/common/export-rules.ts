/**
 * 导出规则配置
 * 定义各源格式支持的导出格式及其显示信息
 */

import type { DocumentFormat, ExportFormat } from '../types'

export type ExportSupportLevel = 'ready' | 'planned'

export interface ExportTargetDescriptor {
  format: ExportFormat
  labelKey?: string
  label?: string
  status: ExportSupportLevel
}

const markdownTargets: ExportTargetDescriptor[] = [
  { format: 'md', labelKey: 'leftMenu.exportMarkdown', status: 'ready' },
  { format: 'html', labelKey: 'leftMenu.exportHtml', status: 'ready' },
  { format: 'docx', labelKey: 'leftMenu.exportDocx', status: 'ready' },
  { format: 'pdf', labelKey: 'leftMenu.exportPdf', status: 'ready' },
  { format: 'tex', labelKey: 'leftMenu.exportLatex', status: 'ready' }
]

const latexTargets: ExportTargetDescriptor[] = [
  { format: 'tex', labelKey: 'leftMenu.exportLatex', status: 'ready' },
  { format: 'pdf', labelKey: 'leftMenu.exportPdf', status: 'ready' },
  { format: 'md', labelKey: 'leftMenu.exportMarkdown', status: 'ready' },
  { format: 'html', labelKey: 'leftMenu.exportHtml', status: 'ready' },
  { format: 'docx', labelKey: 'leftMenu.exportDocx', status: 'ready' }
]

const jsonTargets: ExportTargetDescriptor[] = [
  { format: 'json', label: 'JSON', status: 'ready' },
  { format: 'md', labelKey: 'leftMenu.exportMarkdown', status: 'planned' }
]

/** 纯文本 / 代码等：先规范为 Markdown 再导出 */
const plainTextTargets: ExportTargetDescriptor[] = [
  { format: 'md', labelKey: 'leftMenu.exportMarkdown', status: 'ready' },
  { format: 'html', labelKey: 'leftMenu.exportHtml', status: 'ready' },
  { format: 'docx', labelKey: 'leftMenu.exportDocx', status: 'ready' },
  { format: 'pdf', labelKey: 'leftMenu.exportPdf', status: 'ready' }
]

export const EXPORT_RULES: Record<DocumentFormat, ExportTargetDescriptor[]> = {
  md: markdownTargets,
  tex: latexTargets,
  json: jsonTargets,
  txt: plainTextTargets
}

export const getExportTargets = (sourceFormat: DocumentFormat): ExportTargetDescriptor[] => {
  return EXPORT_RULES[sourceFormat] ?? []
}
