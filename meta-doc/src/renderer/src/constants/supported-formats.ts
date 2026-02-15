import type { DocumentTemplate, SupportedFormat } from '../types/formats'
import { getTemplatesByFormat } from './templates'

export const SUPPORTED_FORMATS: SupportedFormat[] = [
  {
    id: 'md',
    label: 'Markdown',
    labelKey: 'newDocument.formats.markdown.label',
    description: 'Markdown 文档',
    descriptionKey: 'newDocument.formats.markdown.description',
    extension: '.md',
    defaultTemplateId: 'blank',
    templates: getTemplatesByFormat('md')
  },
  {
    id: 'tex',
    label: 'LaTeX',
    labelKey: 'newDocument.formats.latex.label',
    description: 'LaTeX 文档',
    descriptionKey: 'newDocument.formats.latex.description',
    extension: '.tex',
    defaultTemplateId: 'article',
    templates: getTemplatesByFormat('tex')
  }
]

export const getSupportedFormats = (): SupportedFormat[] => SUPPORTED_FORMATS

export const findFormatById = (id: string): SupportedFormat | undefined =>
  SUPPORTED_FORMATS.find((format) => format.id === id)

export const findFormatTemplate = (
  formatId: string,
  templateId?: string
): DocumentTemplate | undefined => {
  const format = findFormatById(formatId)
  if (!format) return undefined
  if (!templateId) {
    return (
      format.templates.find((tpl) => tpl.id === format.defaultTemplateId) ?? format.templates[0]
    )
  }
  return format.templates.find((tpl) => tpl.id === templateId)
}
