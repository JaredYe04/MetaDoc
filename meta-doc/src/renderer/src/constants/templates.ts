import type { DocumentTemplate } from '../types/formats'
import { i18n } from '../i18n'

/**
 * 获取模板内容（从 i18n 动态获取当前语言版本）
 */
function getTemplateContent(contentKey: string): string {
  if (!contentKey) return ''
  const content = i18n.global.t(contentKey)
  // 如果翻译不存在，会返回 key 本身，此时返回空字符串
  return content === contentKey ? '' : content
}

/**
 * Markdown 模板定义（content 通过 contentKey 从 i18n 动态获取）
 */
export const markdownTemplates: Record<string, DocumentTemplate> = {
  blank: {
    id: 'blank',
    label: '空白文档',
    labelKey: 'newDocument.templates.markdown.blank.label',
    description: '创建一个空白的 Markdown 文档',
    descriptionKey: 'newDocument.templates.markdown.blank.description',
    content: ''
  },
  article: {
    id: 'article',
    label: '文章模板',
    labelKey: 'newDocument.templates.markdown.article.label',
    description: '包含基本结构的文章模板',
    descriptionKey: 'newDocument.templates.markdown.article.description',
    contentKey: 'newDocument.templates.markdown.article.content',
    get content() {
      return getTemplateContent(this.contentKey || '')
    }
  }
}

/**
 * LaTeX 模板定义（content 通过 contentKey 从 i18n 动态获取）
 */
export const latexTemplates: Record<string, DocumentTemplate> = {
  article: {
    id: 'article',
    label: '标准文章',
    labelKey: 'newDocument.templates.latex.article.label',
    description: '包含基础结构的 LaTeX 文章模板',
    descriptionKey: 'newDocument.templates.latex.article.description',
    contentKey: 'newDocument.templates.latex.article.content',
    get content() {
      return getTemplateContent(this.contentKey || '')
    }
  },
  report: {
    id: 'report',
    label: '报告模板',
    labelKey: 'newDocument.templates.latex.report.label',
    description: '适用于学术报告的模板',
    descriptionKey: 'newDocument.templates.latex.report.description',
    contentKey: 'newDocument.templates.latex.report.content',
    get content() {
      return getTemplateContent(this.contentKey || '')
    }
  },
  gb7714_zh: {
    id: 'gb7714_zh',
    label: '中文国标学术论文',
    labelKey: 'newDocument.templates.latex.gb7714_zh.label',
    description: '符合 GB/T 7714-2015 标准的中文学术论文模板',
    descriptionKey: 'newDocument.templates.latex.gb7714_zh.description',
    contentKey: 'newDocument.templates.latex.gb7714_zh.content',
    get content() {
      return getTemplateContent(this.contentKey || '')
    }
  },
  ieee_en: {
    id: 'ieee_en',
    label: '英文标准学术论文',
    labelKey: 'newDocument.templates.latex.ieee_en.label',
    description: '符合 IEEE 标准的英文学术论文模板',
    descriptionKey: 'newDocument.templates.latex.ieee_en.description',
    contentKey: 'newDocument.templates.latex.ieee_en.content',
    get content() {
      return getTemplateContent(this.contentKey || '')
    }
  },
  gb7714_zh_twocolumn: {
    id: 'gb7714_zh_twocolumn',
    label: '中文国标学术论文（双栏）',
    labelKey: 'newDocument.templates.latex.gb7714_zh_twocolumn.label',
    description: '符合 GB/T 7714-2015 标准的中文学术论文模板（双栏排版）',
    descriptionKey: 'newDocument.templates.latex.gb7714_zh_twocolumn.description',
    contentKey: 'newDocument.templates.latex.gb7714_zh_twocolumn.content',
    get content() {
      return getTemplateContent(this.contentKey || '')
    }
  },
  ieee_en_twocolumn: {
    id: 'ieee_en_twocolumn',
    label: '英文标准学术论文（双栏）',
    labelKey: 'newDocument.templates.latex.ieee_en_twocolumn.label',
    description: '符合 IEEE 标准的英文学术论文模板（双栏排版）',
    descriptionKey: 'newDocument.templates.latex.ieee_en_twocolumn.description',
    contentKey: 'newDocument.templates.latex.ieee_en_twocolumn.content',
    get content() {
      return getTemplateContent(this.contentKey || '')
    }
  }
}

/**
 * 获取指定格式的所有模板
 */
export function getTemplatesByFormat(formatId: string): DocumentTemplate[] {
  switch (formatId) {
    case 'md':
      return Object.values(markdownTemplates)
    case 'tex':
      return Object.values(latexTemplates)
    default:
      return []
  }
}

/**
 * 根据格式和模板ID获取模板
 */
export function getTemplate(formatId: string, templateId: string): DocumentTemplate | undefined {
  switch (formatId) {
    case 'md':
      return markdownTemplates[templateId]
    case 'tex':
      return latexTemplates[templateId]
    default:
      return undefined
  }
}
