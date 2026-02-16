/**
 * 可视化适配器接口
 * 用于解耦可视化工具与具体文档格式（Markdown/LaTeX）
 */
import type { DocumentOutlineNode } from '../../../types'
import { extractOutlineTreeFromMarkdown } from './document/outline'
import { extractPlainTextFromLatex, extractOutlineTreeFromLatex } from './latex-utils'
import { createRendererLogger } from './logger'

/**
 * 可视化适配器接口
 */
export interface VisualizeAdapter {
  /**
   * 获取文档格式类型
   */
  getFormat(): 'markdown' | 'latex'

  /**
   * 从文档内容中提取纯文本（用于分词等处理）
   * @param content 原始文档内容
   * @param bypassCodeBlock 是否跳过代码块
   */
  extractPlainText(content: string, bypassCodeBlock?: boolean): string

  /**
   * 从文档内容中提取大纲树
   * @param content 原始文档内容
   */
  extractOutline(content: string): DocumentOutlineNode | null

  /**
   * 搜索词语在文档中的上下文
   * @param content 原始文档内容
   * @param word 要搜索的词语
   * @param maxContexts 最大返回的上下文数量
   * @param contextLength 每个上下文的长度（字符数）
   */
  searchWordContexts(
    content: string,
    word: string,
    maxContexts?: number,
    contextLength?: number
  ): string[]
}

/**
 * Markdown 可视化适配器
 */
export class MarkdownVisualizeAdapter implements VisualizeAdapter {
  getFormat(): 'markdown' | 'latex' {
    return 'markdown'
  }

  extractPlainText(content: string, bypassCodeBlock = false): string {
    if (!content) return ''

    // 移除图片链接
    let text = content.replace(/!?\[.*?\]\(.*?\)/g, '')

    // 如果跳过代码块，移除代码块内容
    if (bypassCodeBlock) {
      text = text.replace(/```[\s\S]*?```/g, '')
    }

    return text
  }

  extractOutline(content: string): DocumentOutlineNode | null {
    if (!content) return null

    // 使用现有的 Markdown 大纲提取函数
    try {
      return extractOutlineTreeFromMarkdown(content, false)
    } catch (error) {
      console.error('[MarkdownVisualizeAdapter] extractOutline failed:', error)
      return null
    }
  }

  searchWordContexts(
    content: string,
    word: string,
    maxContexts = 3,
    contextLength = 200
  ): string[] {
    const logger = createRendererLogger('MarkdownVisualizeAdapter')
    if (!content || !word) {
      logger.debug('[MarkdownVisualizeAdapter] searchWordContexts: 缺少参数', {
        content: !!content,
        word
      })
      return []
    }

    const contexts: string[] = []
    const halfLength = Math.floor(contextLength / 2)

    // 改进的正则表达式：匹配词语前后各halfLength个字符（包括空白字符）
    const escapedWord = this.escapeRegex(word)
    const regex = new RegExp(`.{0,${halfLength}}${escapedWord}.{0,${halfLength}}`, 'gi')

    logger.debug('[MarkdownVisualizeAdapter] 搜索模式:', {
      word,
      escapedWord,
      pattern: regex.source,
      contentLength: content.length
    })

    const matches = Array.from(content.matchAll(regex))
    logger.debug('[MarkdownVisualizeAdapter] 找到匹配:', matches.length)

    const seen = new Set<string>()

    for (const match of matches) {
      if (contexts.length >= maxContexts) break

      const context = match[0].trim()
      // 去重，避免返回相同的上下文
      const contextKey = context.toLowerCase()
      if (!seen.has(contextKey) && context.length > word.length) {
        seen.add(contextKey)
        contexts.push(context)
        logger.debug('[MarkdownVisualizeAdapter] 添加上下文:', context.substring(0, 50) + '...')
      }
    }

    logger.debug('[MarkdownVisualizeAdapter] 最终上下文数量:', contexts.length)
    return contexts
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}

/**
 * LaTeX 可视化适配器
 */
export class LatexVisualizeAdapter implements VisualizeAdapter {
  getFormat(): 'markdown' | 'latex' {
    return 'latex'
  }

  extractPlainText(content: string, bypassCodeBlock = false): string {
    if (!content) return ''

    // 使用现有的 LaTeX 纯文本提取函数
    try {
      let text = extractPlainTextFromLatex(content)

      // 如果跳过代码块，移除 verbatim 环境内容（已在 extractPlainTextFromLatex 中处理）
      // 这里可以进一步处理其他代码环境
      if (bypassCodeBlock) {
        // verbatim 环境已经在 extractPlainTextFromLatex 中被跳过
        // 可以添加其他代码环境的处理
      }

      return text
    } catch (error) {
      console.error('[LatexVisualizeAdapter] extractPlainText failed:', error)
      return ''
    }
  }

  extractOutline(content: string): DocumentOutlineNode | null {
    if (!content) return null

    // 使用 LaTeX 专用的大纲提取函数
    try {
      return extractOutlineTreeFromLatex(content, false)
    } catch (error) {
      console.error('[LatexVisualizeAdapter] extractOutline failed:', error)
      return null
    }
  }

  searchWordContexts(
    content: string,
    word: string,
    maxContexts = 3,
    contextLength = 200
  ): string[] {
    const logger = createRendererLogger('LatexVisualizeAdapter')
    if (!content || !word) {
      logger.debug('[LatexVisualizeAdapter] searchWordContexts: 缺少参数', {
        content: !!content,
        word
      })
      return []
    }

    // 先提取纯文本，然后在纯文本中搜索
    const plainText = this.extractPlainText(content, false)
    logger.debug('[LatexVisualizeAdapter] 提取的纯文本长度:', plainText.length)

    const contexts: string[] = []
    const halfLength = Math.floor(contextLength / 2)

    // 改进的正则表达式：匹配词语前后各halfLength个字符（包括空白字符）
    const escapedWord = this.escapeRegex(word)
    const regex = new RegExp(`.{0,${halfLength}}${escapedWord}.{0,${halfLength}}`, 'gi')

    logger.debug('[LatexVisualizeAdapter] 搜索模式:', {
      word,
      escapedWord,
      pattern: regex.source,
      plainTextLength: plainText.length
    })

    const matches = Array.from(plainText.matchAll(regex))
    logger.debug('[LatexVisualizeAdapter] 找到匹配:', matches.length)

    const seen = new Set<string>()

    for (const match of matches) {
      if (contexts.length >= maxContexts) break

      const context = match[0].trim()
      // 去重，避免返回相同的上下文
      const contextKey = context.toLowerCase()
      if (!seen.has(contextKey) && context.length > word.length) {
        seen.add(contextKey)
        contexts.push(context)
        logger.debug('[LatexVisualizeAdapter] 添加上下文:', context.substring(0, 50) + '...')
      }
    }

    logger.debug('[LatexVisualizeAdapter] 最终上下文数量:', contexts.length)
    return contexts
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}

/**
 * 根据文档格式创建对应的适配器
 */
export function createVisualizeAdapter(format: 'markdown' | 'latex'): VisualizeAdapter {
  switch (format) {
    case 'markdown':
      return new MarkdownVisualizeAdapter()
    case 'latex':
      return new LatexVisualizeAdapter()
    default:
      return new MarkdownVisualizeAdapter() // 默认使用 Markdown 适配器
  }
}
