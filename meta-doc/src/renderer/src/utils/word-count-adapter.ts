/**
 * 字数统计适配器接口
 * 用于不同文档格式（Markdown、LaTeX）的字数统计
 */

export interface WordCountStats {
  /** 页数 */
  pages: number
  /** 字数 */
  words: number
  /** 字符数（不计空格） */
  charactersNoSpaces: number
  /** 字符数（计空格） */
  charactersWithSpaces: number
  /** 段落数 */
  paragraphs: number
  /** 行数 */
  lines: number
  /** 非中文单词数 */
  nonChineseWords: number
  /** 中文字符和朝鲜语单词数 */
  chineseAndKoreanChars: number
}

export interface WordCountAdapter {
  /**
   * 统计文档字数信息
   * @param content 文档内容
   * @param includeTextBoxesFootnotesEndnotes 是否包括文本框、脚注和尾注
   * @returns 字数统计信息
   */
  count(content: string, includeTextBoxesFootnotesEndnotes?: boolean): WordCountStats
}

/**
 * Markdown 字数统计适配器
 */
export class MarkdownWordCountAdapter implements WordCountAdapter {
  count(content: string, includeTextBoxesFootnotesEndnotes = false): WordCountStats {
    if (!content) {
      return this.getEmptyStats()
    }

    // 移除 Markdown 语法标记（保留实际内容）
    let text = this.stripMarkdownSyntax(content)

    // 如果不包括文本框、脚注和尾注，移除相关内容
    if (!includeTextBoxesFootnotesEndnotes) {
      // 移除脚注引用和脚注内容
      text = text.replace(/\[\^[\w-]+\]/g, '') // 脚注引用 [^1]
      text = text.replace(/\[\^[\w-]+\]:\s*.+$/gm, '') // 脚注定义
    }

    // 计算基本统计
    const charactersWithSpaces = text.length
    const charactersNoSpaces = text.replace(/\s/g, '').length
    const lines = content.split('\n').length
    const paragraphs = this.countParagraphs(text)

    // 分离中文字符、非中文单词和朝鲜语字符
    const { chineseAndKoreanChars, nonChineseWords } = this.analyzeText(text)

    // 计算字数（中文字符 + 非中文单词）
    const words = chineseAndKoreanChars + nonChineseWords

    // 估算页数（假设每页约 500 字）
    const pages = Math.max(1, Math.ceil(words / 500))

    return {
      pages,
      words,
      charactersNoSpaces,
      charactersWithSpaces,
      paragraphs,
      lines,
      nonChineseWords,
      chineseAndKoreanChars
    }
  }

  /**
   * 移除 Markdown 语法标记
   */
  private stripMarkdownSyntax(content: string): string {
    let text = content

    // 移除代码块
    text = text.replace(/```[\s\S]*?```/g, '')
    text = text.replace(/`[^`]+`/g, '')

    // 移除链接但保留文本
    text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    text = text.replace(/\[([^\]]+)\]\[[^\]]+\]/g, '$1')

    // 移除图片
    text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '')

    // 移除标题标记
    text = text.replace(/^#{1,6}\s+/gm, '')

    // 移除粗体和斜体标记
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
    text = text.replace(/\*([^*]+)\*/g, '$1')
    text = text.replace(/__([^_]+)__/g, '$1')
    text = text.replace(/_([^_]+)_/g, '$1')

    // 移除删除线
    text = text.replace(/~~([^~]+)~~/g, '$1')

    // 移除引用标记
    text = text.replace(/^>\s+/gm, '')

    // 移除列表标记
    text = text.replace(/^[\s]*[-*+]\s+/gm, '')
    text = text.replace(/^[\s]*\d+\.\s+/gm, '')

    // 移除表格标记
    text = text.replace(/\|/g, ' ')

    // 移除水平线
    text = text.replace(/^---+$/gm, '')

    return text.trim()
  }

  /**
   * 统计段落数
   */
  private countParagraphs(text: string): number {
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0)
    return paragraphs.length || 0
  }

  /**
   * 分析文本，分离中文字符、朝鲜语字符和非中文单词
   */
  private analyzeText(text: string): {
    chineseAndKoreanChars: number
    nonChineseWords: number
  } {
    let chineseAndKoreanChars = 0
    let nonChineseWords = 0

    // 中文字符范围：\u4e00-\u9fff
    // 朝鲜语字符范围：\uac00-\ud7a3
    const chineseKoreanRegex = /[\u4e00-\u9fff\uac00-\ud7a3]/g
    const chineseKoreanMatches = text.match(chineseKoreanRegex)
    chineseAndKoreanChars = chineseKoreanMatches ? chineseKoreanMatches.length : 0

    // 移除中文字符和朝鲜语字符后，统计非中文单词
    const nonChineseText = text.replace(chineseKoreanRegex, ' ')
    const words = nonChineseText.split(/\s+/).filter((word) => word.trim().length > 0)
    nonChineseWords = words.length

    return { chineseAndKoreanChars, nonChineseWords }
  }

  private getEmptyStats(): WordCountStats {
    return {
      pages: 0,
      words: 0,
      charactersNoSpaces: 0,
      charactersWithSpaces: 0,
      paragraphs: 0,
      lines: 0,
      nonChineseWords: 0,
      chineseAndKoreanChars: 0
    }
  }
}

/**
 * LaTeX 字数统计适配器
 */
export class LatexWordCountAdapter implements WordCountAdapter {
  count(content: string, includeTextBoxesFootnotesEndnotes = false): WordCountStats {
    if (!content) {
      return this.getEmptyStats()
    }

    // 移除 LaTeX 命令和注释
    let text = this.stripLatexSyntax(content)

    // 如果不包括文本框、脚注和尾注，移除相关内容
    if (!includeTextBoxesFootnotesEndnotes) {
      // 移除脚注
      text = text.replace(/\\footnote\{[^}]*\}/g, '')
      text = text.replace(/\\footnotetext\{[^}]*\}/g, '')
      // 移除尾注（如果存在）
      text = text.replace(/\\endnote\{[^}]*\}/g, '')
    }

    // 计算基本统计
    const charactersWithSpaces = text.length
    const charactersNoSpaces = text.replace(/\s/g, '').length
    const lines = content.split('\n').length
    const paragraphs = this.countParagraphs(text)

    // 分离中文字符、非中文单词和朝鲜语字符
    const { chineseAndKoreanChars, nonChineseWords } = this.analyzeText(text)

    // 计算字数（中文字符 + 非中文单词）
    const words = chineseAndKoreanChars + nonChineseWords

    // 估算页数（假设每页约 500 字）
    const pages = Math.max(1, Math.ceil(words / 500))

    return {
      pages,
      words,
      charactersNoSpaces,
      charactersWithSpaces,
      paragraphs,
      lines,
      nonChineseWords,
      chineseAndKoreanChars
    }
  }

  /**
   * 移除 LaTeX 语法标记
   */
  private stripLatexSyntax(content: string): string {
    let text = content

    // 移除注释
    text = text.replace(/%.*$/gm, '')

    // 移除 LaTeX 命令（保留参数中的文本）
    // 处理 \command{text} 格式，保留 text 部分
    text = text.replace(/\\([a-zA-Z@]+)\*?(\[[^\]]*\])?(\{[^}]*\})?/g, (match, cmd, opt, arg) => {
      // 保留一些常见命令的参数内容
      if (['textbf', 'textit', 'emph', 'text', 'mbox'].includes(cmd) && arg) {
        return arg.slice(1, -1) // 移除大括号
      }
      return arg ? arg.slice(1, -1) : ''
    })

    // 移除数学公式
    text = text.replace(/\$[^$]+\$/g, '')
    text = text.replace(/\$\$[\s\S]*?\$\$/g, '')

    // 移除环境
    text = text.replace(/\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\}/g, '')

    // 移除特殊字符命令
    text = text.replace(/\\[a-zA-Z@]+/g, '')

    // 移除多余的大括号
    text = text.replace(/\{|\}/g, ' ')

    return text.trim()
  }

  /**
   * 统计段落数
   */
  private countParagraphs(text: string): number {
    // LaTeX 中段落通常由空行或 \par 分隔
    const paragraphs = text.split(/\n\s*\n|\\par\b/).filter((p) => p.trim().length > 0)
    return paragraphs.length || 0
  }

  /**
   * 分析文本，分离中文字符、朝鲜语字符和非中文单词
   */
  private analyzeText(text: string): {
    chineseAndKoreanChars: number
    nonChineseWords: number
  } {
    let chineseAndKoreanChars = 0
    let nonChineseWords = 0

    // 中文字符范围：\u4e00-\u9fff
    // 朝鲜语字符范围：\uac00-\ud7a3
    const chineseKoreanRegex = /[\u4e00-\u9fff\uac00-\ud7a3]/g
    const chineseKoreanMatches = text.match(chineseKoreanRegex)
    chineseAndKoreanChars = chineseKoreanMatches ? chineseKoreanMatches.length : 0

    // 移除中文字符和朝鲜语字符后，统计非中文单词
    const nonChineseText = text.replace(chineseKoreanRegex, ' ')
    const words = nonChineseText.split(/\s+/).filter((word) => word.trim().length > 0)
    nonChineseWords = words.length

    return { chineseAndKoreanChars, nonChineseWords }
  }

  private getEmptyStats(): WordCountStats {
    return {
      pages: 0,
      words: 0,
      charactersNoSpaces: 0,
      charactersWithSpaces: 0,
      paragraphs: 0,
      lines: 0,
      nonChineseWords: 0,
      chineseAndKoreanChars: 0
    }
  }
}

/**
 * 获取适配器实例
 */
export function getWordCountAdapter(format: 'md' | 'tex'): WordCountAdapter {
  if (format === 'tex') {
    return new LatexWordCountAdapter()
  }
  return new MarkdownWordCountAdapter()
}
