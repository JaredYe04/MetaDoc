/**
 * 文档模板索引类型定义（按语言隔离，类似用户手册）
 */

export interface TemplateIndexEntry {
  /** 模板唯一 id */
  id: string
  /** 模板文件路径（相对于当前语言+格式目录，如 md/blank.md） */
  file: string
  /** 显示名称的 i18n key */
  labelKey: string
  /** 描述信息的 i18n key */
  descriptionKey: string
  /** 缩略图路径（可选，相对于当前语言+格式目录，如 preview.png） */
  thumbnail?: string
}

export interface TemplateFormatIndex {
  /** 该格式的默认模板 id */
  defaultTemplateId: string
  /** 各语言下的模板列表，语言不互通 */
  locales: Record<string, TemplateIndexEntry[]>
}

export interface TemplateIndex {
  version: string
  /** 格式 id -> 该格式下各语言的模板配置 */
  formats: Record<string, TemplateFormatIndex>
}
