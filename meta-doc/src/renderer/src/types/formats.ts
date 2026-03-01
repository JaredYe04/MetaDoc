export interface DocumentTemplate {
  id: string
  label: string
  labelKey?: string
  description?: string
  descriptionKey?: string
  image?: string
  content: string
  /** i18n key for template content */
  contentKey?: string
  /** 是否为用户自己添加的模板（新建文档时可显示删除按钮） */
  isUserTemplate?: boolean
  /** 用户模板唯一 id，用于删除 */
  userTemplateId?: string
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
