/**
 * 文档模板注册表：从 templates 目录按语言加载模板索引与内容，支持缩略图
 */

import type { DocumentTemplate, SupportedFormat } from '../types/formats'
import type { TemplateIndex, TemplateIndexEntry } from './types'

let indexCache: TemplateIndex | null = null

// 预加载所有模板文件（.md / .tex），路径相对于 templates 目录
const templateMdModules = import.meta.glob<string>('./**/*.md', {
  eager: true,
  query: '?raw',
  import: 'default'
})
const templateTexModules = import.meta.glob<string>('./**/*.tex', {
  eager: true,
  query: '?raw',
  import: 'default'
})

function getTemplateContent(locale: string, formatId: string, file: string): string {
  const key = `./${locale}/${formatId}/${file}`
  const isTex = file.endsWith('.tex')
  const modules = isTex ? templateTexModules : templateMdModules
  const content = modules[key as keyof typeof modules]
  if (typeof content === 'string') return content
  if (content && typeof content === 'object' && 'default' in content)
    return (content as { default: string }).default
  return ''
}

// 缩略图（可选）：仅当模板索引中指定 thumbnail 时加载
const templateImageModules = import.meta.glob<string>('./**/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
})

function getThumbnailUrl(
  locale: string,
  formatId: string,
  thumbnailPath: string
): string | undefined {
  const key = `./${locale}/${formatId}/${thumbnailPath}`
  const mod = templateImageModules[key as keyof typeof templateImageModules]
  if (typeof mod === 'string') return mod
  if (
    mod &&
    typeof mod === 'object' &&
    'default' in mod &&
    typeof (mod as { default: string }).default === 'string'
  ) {
    return (mod as { default: string }).default
  }
  return undefined
}

export async function loadTemplateIndex(): Promise<TemplateIndex> {
  if (indexCache) return indexCache
  const mod = await import('./index.json')
  indexCache = (mod.default ?? mod) as TemplateIndex
  return indexCache
}

const FORMAT_META: Record<string, { labelKey: string; descriptionKey: string; extension: string }> =
  {
    md: {
      labelKey: 'newDocument.formats.markdown.label',
      descriptionKey: 'newDocument.formats.markdown.description',
      extension: '.md'
    },
    tex: {
      labelKey: 'newDocument.formats.latex.label',
      descriptionKey: 'newDocument.formats.latex.description',
      extension: '.tex'
    }
  }

export type TranslateFn = (key: string, fallback?: string) => string

/**
 * 按语言获取该语言下的所有格式与模板（模板内容从文件加载，支持缩略图）
 */
export async function getSupportedFormatsFromTemplates(
  locale: string,
  t: TranslateFn
): Promise<SupportedFormat[]> {
  const index = await loadTemplateIndex()
  const normalizedLocale = locale.replace('-', '_')
  const result: SupportedFormat[] = []

  for (const [formatId, formatMeta] of Object.entries(index.formats)) {
    const meta = FORMAT_META[formatId]
    if (!meta) continue

    const entries = formatMeta.locales[normalizedLocale] ?? formatMeta.locales['zh_CN'] ?? []
    const templates: DocumentTemplate[] = entries.map((entry: TemplateIndexEntry) => {
      const content = getTemplateContent(normalizedLocale, formatId, entry.file)
      const image = entry.thumbnail
        ? getThumbnailUrl(normalizedLocale, formatId, entry.thumbnail)
        : undefined
      return {
        id: entry.id,
        label: t(entry.labelKey),
        labelKey: entry.labelKey,
        description: t(entry.descriptionKey),
        descriptionKey: entry.descriptionKey,
        image,
        content
      }
    })

    result.push({
      id: formatId,
      label: t(meta.labelKey),
      labelKey: meta.labelKey,
      description: t(meta.descriptionKey),
      descriptionKey: meta.descriptionKey,
      extension: meta.extension,
      defaultTemplateId: formatMeta.defaultTemplateId,
      templates
    })
  }

  return result
}

/**
 * 根据格式和模板 id 获取单个模板内容（用于 workspace 初始化）
 */
export async function getTemplateContentById(
  locale: string,
  formatId: string,
  templateId: string
): Promise<string> {
  const index = await loadTemplateIndex()
  const format = index.formats[formatId]
  if (!format) return ''
  const normalizedLocale = locale.replace('-', '_')
  const entries = format.locales[normalizedLocale] ?? format.locales['zh_CN'] ?? []
  const entry = entries.find((e) => e.id === templateId)
  if (!entry) return ''
  return getTemplateContent(normalizedLocale, formatId, entry.file)
}

/**
 * 根据格式和模板 id 查找模板定义（从已加载的 SupportedFormat 列表中查找更高效，此方法用于兼容）
 */
export function findFormatTemplateFromList(
  formats: SupportedFormat[],
  formatId: string,
  templateId?: string
): DocumentTemplate | undefined {
  const format = formats.find((f) => f.id === formatId)
  if (!format) return undefined
  if (!templateId) {
    return format.templates.find((t) => t.id === format.defaultTemplateId) ?? format.templates[0]
  }
  return format.templates.find((t) => t.id === templateId)
}
