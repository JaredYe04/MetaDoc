/**
 * 拼写检查服务（主进程）
 * 使用 cspell-lib 进行拼写检查，因为 cspell-lib 需要 Node.js 环境
 */

import { createMainLogger } from '../logger'
import { loadCustomDictionary } from './spell-check-dictionary'
import { getBuiltinDictionary } from './builtin-dictionaries'

const logger = createMainLogger('SpellCheckService')

/**
 * 将 i18n 语言代码转换为 cspell 语言代码
 */
function i18nLocaleToCSpellLocale(i18nLocale: string): string {
  const localeMap: Record<string, string> = {
    'zh_CN': 'zh-CN',
    'zh_cn': 'zh-CN',
    'en_US': 'en-US',
    'en_us': 'en-US',
    'ja_JP': 'ja',
    'ja_jp': 'ja',
    'ko_KR': 'ko',
    'ko_kr': 'ko',
    'de_DE': 'de',
    'de_de': 'de',
    'fr_FR': 'fr',
    'fr_fr': 'fr'
  }
  
  const normalized = i18nLocale.replace('-', '_')
  return localeMap[normalized] || 'en-US'
}

/**
 * 获取多语言配置（强制使用英语进行拼写检查，确保英文单词能被正确检测）
 * 注意：为了确保英文拼写错误（如"teh"）能被正确检测，我们总是使用英语进行检查
 * 即使文本中包含其他语言，英文单词也应该被检查
 */
function getMultiLanguageConfig(userLocale: string = 'zh_CN'): string {
  // 强制使用英语进行检查，确保英文拼写错误能被正确检测
  // 即使文本中包含其他语言（如中文），英文单词也应该被检查
  return 'en-US'
  
  // 原逻辑（已禁用）：如果将来需要支持多语言检查，可以启用
  // try {
  //   const userLanguage = i18nLocaleToCSpellLocale(userLocale)
  //   
  //   // 如果用户语言是英语，只返回英语
  //   if (userLanguage === 'en-US' || userLanguage === 'en') {
  //     return 'en-US'
  //   }
  //   
  //   // 返回 English + 用户选择的语言
  //   return `en-US,${userLanguage}`
  // } catch (error) {
  //   logger.warn('[getMultiLanguageConfig] 获取语言配置失败，使用默认配置:', error)
  //   return 'en-US'
  // }
}

/**
 * 拼写检查参数
 */
export interface SpellCheckParams {
  text: string
  format: 'text' | 'markdown' | 'latex'
  locale?: string // 用户选择的语言代码（可选，默认从系统获取）
}

/**
 * 拼写检查结果
 */
export interface SpellCheckIssue {
  offset: number
  length: number
  text: string
  suggestions?: string[]
}

export interface SpellCheckResult {
  issues: SpellCheckIssue[]
}

/**
 * 检查单词是否应该被忽略（基于命名规则）
 * @param word 要检查的单词
 * @returns 如果应该忽略返回 true，否则返回 false
 */
function shouldIgnoreWord(word: string): boolean {
  if (!word || word.length === 0) {
    return false
  }
  
  // 规则1: ALL_CAPS (length >= 2) → bypass
  // 全部大写，长度 >= 2
  if (word.length >= 2 && /^[A-Z0-9_]+$/.test(word) && /[A-Z]/.test(word)) {
    return true
  }
  
  // 规则2: PascalCase 且长度 > 3 → 优先忽略
  // 首字母大写，且包含至少一个小写字母，整体符合驼峰命名
  if (word.length > 3 && /^[A-Z][a-z0-9]+([A-Z][a-z0-9]*)*$/.test(word)) {
    return true
  }
  
  // 规则3: CamelCase → 忽略
  // 首字母小写，但包含大写字母，整体符合驼峰命名
  if (/^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(word)) {
    return true
  }
  
  return false
}

/**
 * 从文本中提取单词（基于 offset 和 length）
 * 尝试提取完整的单词边界
 */
function extractWordAt(text: string, offset: number, length: number): string {
  if (offset < 0 || offset >= text.length) {
    return ''
  }
  
  // 单词边界字符（非字母数字的字符）
  const wordBoundary = /[^a-zA-Z0-9]/
  
  // 找到单词的开始位置
  let start = offset
  while (start > 0 && !wordBoundary.test(text[start - 1])) {
    start--
  }
  
  // 找到单词的结束位置
  let end = offset + length
  while (end < text.length && !wordBoundary.test(text[end])) {
    end++
  }
  
  return text.substring(start, end)
}

/**
 * 预处理文本，跳过不需要检查的内容
 * - Markdown: 跳过图片链接、代码框、公式
 * - LaTeX: 只检查标题和文本，跳过控制字符、连接、代码框等
 */
function preprocessText(text: string, format: 'text' | 'markdown' | 'latex'): string {
  if (format === 'markdown') {
    // 移除代码块（```...``` 或 ```language...```）
    text = text.replace(/```[\s\S]*?```/g, '')
    
    // 移除行内代码（`...`）
    text = text.replace(/`[^`]+`/g, '')
    
    // 移除图片链接（![alt](url) 或 ![alt](url "title")）
    text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    
    // 移除链接（但保留链接文本，因为链接文本可能需要检查）
    // 这里我们只移除 URL 部分，保留链接文本
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    
    // 移除 HTML 标签
    text = text.replace(/<[^>]+>/g, '')
    
    // 移除数学公式（$...$ 或 $$...$$）
    text = text.replace(/\$\$[\s\S]*?\$\$/g, '')
    text = text.replace(/\$[^$\n]+\$/g, '')
  } else if (format === 'latex') {
    // LaTeX: 只检查标题和文本内容，跳过控制字符、命令、环境等
    
    // 移除注释（% 开头的行）
    text = text.replace(/%.*$/gm, '')
    
    // 移除 LaTeX 命令（\command{...} 或 \command[...]{...}）
    // 但保留一些常见文本命令的内容，如 \textbf{text} 中的 text
    text = text.replace(/\\(?:textbf|textit|emph|textsc|textsl|texttt)\{([^}]+)\}/g, '$1')
    
    // 移除其他 LaTeX 命令（\command 或 \command{...}）
    text = text.replace(/\\[a-zA-Z@]+(\[[^\]]*\])?(\{[^}]*\})*/g, '')
    
    // 移除环境（\begin{env}...\end{env}）
    text = text.replace(/\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\}/g, '')
    
    // 移除代码环境（verbatim, lstlisting 等）
    text = text.replace(/\\begin\{(?:verbatim|lstlisting|minted|code)\}[\s\S]*?\\end\{(?:verbatim|lstlisting|minted|code)\}/g, '')
    
    // 移除数学公式（$...$ 或 $$...$$ 或 \[...\] 或 \(...\)）
    text = text.replace(/\$\$[\s\S]*?\$\$/g, '')
    text = text.replace(/\$[^$\n]+\$/g, '')
    text = text.replace(/\\\[[\s\S]*?\\\]/g, '')
    text = text.replace(/\\\([\s\S]*?\\\)/g, '')
    
    // 移除标签和引用（\label{...}, \ref{...}, \cite{...} 等）
    text = text.replace(/\\[a-zA-Z@]+\{[^}]+\}/g, '')
    
    // 移除特殊字符和连接符（保留普通文本）
    text = text.replace(/[{}%$&_^#~\\]/g, ' ')
  }
  
  return text
}

/**
 * 执行拼写检查
 */
export async function performSpellCheck(params: SpellCheckParams): Promise<SpellCheckResult> {
  const { text, format, locale } = params
  
  logger.info('[performSpellCheck] 开始拼写检查，文本长度:', text.length, '格式:', format)
  
  if (!text || text.trim().length === 0) {
    logger.warn('[performSpellCheck] 文本为空，返回空结果')
    return { issues: [] }
  }
  
  try {
    // 预处理文本，跳过不需要检查的内容
    const processedText = preprocessText(text, format)
    logger.debug('[performSpellCheck] 预处理后文本长度:', processedText.length)
    
    if (!processedText || processedText.trim().length === 0) {
      logger.info('[performSpellCheck] 预处理后文本为空，返回空结果')
      return { issues: [] }
    }
    
    // 加载内置词典和用户自定义词典
    const builtinWords = getBuiltinDictionary()
    const customWords = loadCustomDictionary()
    
    // 合并内置词典和用户自定义词典
    const allWords = new Set([...builtinWords, ...customWords])
    const allWordsArray = Array.from(allWords)
    logger.debug('[performSpellCheck] 加载词典完成，内置词典:', builtinWords.size, '个单词，用户自定义词典:', customWords.size, '个单词，总计:', allWordsArray.length, '个单词')
    
    // 动态导入 cspell-lib（ESM 模块，必须使用 ESM 动态导入）
    // 注意：cspell-lib 是纯 ESM 模块，不能使用 require()
    const cspellLib = await import('cspell-lib')
    const { spellCheckDocument } = cspellLib
    
    // 获取多语言配置
    const languageConfig = getMultiLanguageConfig(locale)
    logger.debug('[performSpellCheck] 使用语言配置:', languageConfig)
    
    // 确定文件扩展名
    const fileExtension = format === 'latex' ? '.tex' : format === 'markdown' ? '.md' : '.txt'
    
    // 调用 cspell-lib 进行拼写检查
    let result
    try {
      // 尝试使用多语言配置
      result = await spellCheckDocument(
        {
          uri: `file:///temp${fileExtension}`,
          text: processedText, // 使用预处理后的文本
          languageId: 'plaintext',
          locale: languageConfig
        },
        {
          generateSuggestions: true,
          noConfigSearch: true // 不搜索配置文件，避免环境变量问题
        },
        {
          words: allWordsArray, // 使用合并后的词典（内置词典 + 用户自定义词典）
          suggestionsTimeout: 2000
        }
      )
    } catch (configError) {
      // 如果多语言配置失败，回退到只使用英语
      const errorMessage = configError instanceof Error ? configError.message : String(configError)
      logger.warn('[performSpellCheck] 多语言配置失败，回退到英语:', errorMessage)
      
      try {
        result = await spellCheckDocument(
          {
            uri: `file:///temp${fileExtension}`,
            text: processedText,
            languageId: 'plaintext',
            locale: 'en' // 使用更简单的语言代码
          },
          {
            generateSuggestions: true,
            noConfigSearch: true
          },
          {
            words: allWordsArray,
            suggestionsTimeout: 2000
          }
        )
      } catch (fallbackError) {
        // 如果还是失败，尝试最简配置
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        logger.warn('[performSpellCheck] 英语配置也失败，尝试最简配置:', fallbackMessage)
        
        result = await spellCheckDocument(
          {
            uri: `file:///temp${fileExtension}`,
            text: processedText,
            languageId: 'plaintext'
            // 不指定 locale，让 cspell 使用默认值
          },
          {
            generateSuggestions: false, // 禁用建议生成，减少依赖
            noConfigSearch: true
          },
          {
            words: allWordsArray,
            suggestionsTimeout: 1000
          }
        )
      }
    }
    
    // 检查 result 是否有效
    if (!result) {
      logger.warn('[performSpellCheck] cspell 返回空结果')
      return { issues: [] }
    }
    
    // 转换结果格式，并将 offset 映射回原始文本
    // 注意：由于预处理会改变文本，我们需要将预处理文本中的 offset 映射回原始文本
    const issues: SpellCheckIssue[] = []
    if (result.issues && Array.isArray(result.issues) && result.issues.length > 0) {
      // 如果预处理后的文本与原始文本不同，需要建立映射关系
      // 这里我们使用一个简化的方法：如果预处理后文本长度变化不大，直接使用原始 offset
      // 如果变化很大，我们需要更复杂的映射逻辑
      const needsMapping = processedText !== text
      
      for (const issue of result.issues) {
        // 验证 issue 对象
        if (!issue || typeof issue !== 'object') {
          logger.warn('[performSpellCheck] 跳过无效的 issue 对象:', issue)
          continue
        }
        
        let originalOffset = issue.offset ?? 0
        let originalLength = issue.length ?? (issue.text?.length ?? 0)
        let errorText = issue.text || ''
        
        // 如果预处理改变了文本，尝试映射 offset
        // 使用错误文本在原始文本中查找对应位置
        if (needsMapping) {
          errorText = issue.text || processedText.substring(originalOffset, originalOffset + originalLength)
          if (errorText && errorText.trim().length > 0) {
            // 首先在预处理 offset 附近搜索（更可能找到正确位置）
            const searchRadius = Math.min(500, text.length)
            const searchStart = Math.max(0, originalOffset - searchRadius)
            const searchEnd = Math.min(text.length, originalOffset + searchRadius + errorText.length)
            const searchArea = text.substring(searchStart, searchEnd)
            let foundIndex = searchArea.indexOf(errorText)
            
            if (foundIndex !== -1) {
              originalOffset = searchStart + foundIndex
            } else {
              // 如果附近找不到，在整个文本中搜索（作为备选）
              foundIndex = text.indexOf(errorText)
              if (foundIndex !== -1) {
                originalOffset = foundIndex
              } else {
                // 如果完全找不到，记录警告但保留原始 offset
                logger.warn('[performSpellCheck] 无法在原始文本中找到错误文本:', errorText)
              }
            }
          }
        }
        
        // 如果还没有获取错误文本，从原始文本中提取
        if (!errorText) {
          errorText = text.substring(originalOffset, originalOffset + originalLength)
        }
        
        // 检查是否应该忽略（基于命名规则）
        if (errorText && shouldIgnoreWord(errorText)) {
          logger.debug(`[performSpellCheck] 忽略符合命名规则的单词: "${errorText}"`)
          continue
        }
        
        // 如果错误文本只是部分单词，尝试提取完整单词并再次检查
        const fullWord = extractWordAt(text, originalOffset, originalLength)
        if (fullWord && fullWord !== errorText && shouldIgnoreWord(fullWord)) {
          logger.debug(`[performSpellCheck] 忽略符合命名规则的完整单词: "${fullWord}"`)
          continue
        }
        
        issues.push({
          offset: originalOffset,
          length: originalLength,
          text: errorText,
          suggestions: issue.suggestions && Array.isArray(issue.suggestions) ? issue.suggestions : undefined
        })
      }
    }
    
    logger.info('[performSpellCheck] ✅ 拼写检查完成，发现', issues.length, '个问题')
    return { issues }
    
  } catch (error) {
    logger.error('[performSpellCheck] 拼写检查失败:', error)
    throw new Error(`拼写检查失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

