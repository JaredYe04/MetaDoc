export interface DocumentTemplate {
  id: string
  label: string
  labelKey?: string
  description?: string
  descriptionKey?: string
  image?: string
  content: string
}

export interface SupportedFormat {
  id: string
  label: string
  labelKey?: string
  description?: string
  descriptionKey?: string
  extension: string
  defaultTemplateId: string
  templates: DocumentTemplate[]
}
