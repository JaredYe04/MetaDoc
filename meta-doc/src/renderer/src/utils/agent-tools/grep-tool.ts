/**
 * Grep Tool
 * 在当前文档和metadata中搜索文本/正则，返回匹配内容和上下文
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress,
  ToolLocales
} from '../../types/agent-tool'
import { useWorkspace } from '../../stores/workspace'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import type { ArticleMetaData } from '../../../../types'
import GrepDisplay from './components/GrepDisplay.vue'
import { getActiveDocumentInfoViaBroadcast } from './document-broadcast-helper'
import { getWindowType } from '../event-bus'
import { createDetailedError } from './tool-utils'

const logger = createRendererLogger('GrepTool')
const workspace = useWorkspace()

/**
 * 匹配结果
 */
export interface GrepMatch {
  line: number          // 行号（1-based）
  column: number        // 列号（1-based）
  match: string         // 匹配的文本
  preContext: string    // 前置上下文
  postContext: string   // 后置上下文
  context: string       // 完整上下文（包含匹配行）
  similarity?: number   // 相似度分数（0-1，仅在模糊搜索模式下提供）
}

/**
 * Grep结果
 */
export interface GrepResult {
  matches: GrepMatch[]
  totalMatches: number
  searchPattern: string
  isRegex: boolean
  isFuzzy: boolean      // 是否使用模糊搜索
  similarityThreshold?: number  // 相似度阈值
  scope: string[]       // 搜索范围：['document', 'metadata']
  originalContent?: string  // 原始文档内容（用于Display组件显示）
  language?: string         // 文档语言类型（'markdown' | 'latex' | 'plaintext'）
}

/**
 * 计算编辑距离（Levenshtein距离）
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length
  const n = str2.length
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) {
    dp[i][0] = i
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,      // 删除
          dp[i][j - 1] + 1,      // 插入
          dp[i - 1][j - 1] + 1   // 替换
        )
      }
    }
  }

  return dp[m][n]
}

/**
 * 计算基于编辑距离的相似度（0-1）
 */
function similarityByEditDistance(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length)
  if (maxLen === 0) return 1.0
  const distance = levenshteinDistance(str1, str2)
  return 1 - (distance / maxLen)
}

/**
 * 计算字符集合重叠相似度（Jaccard相似度）
 */
function jaccardSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.split(''))
  const set2 = new Set(str2.split(''))
  
  const intersection = new Set([...set1].filter(x => set2.has(x)))
  const union = new Set([...set1, ...set2])
  
  if (union.size === 0) return 1.0
  return intersection.size / union.size
}

/**
 * 计算最长公共子串长度
 */
function longestCommonSubstring(str1: string, str2: string): number {
  const m = str1.length
  const n = str2.length
  let maxLen = 0
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
        maxLen = Math.max(maxLen, dp[i][j])
      } else {
        dp[i][j] = 0
      }
    }
  }

  return maxLen
}

/**
 * 计算基于最长公共子串的相似度
 */
function similarityByLCS(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length)
  if (maxLen === 0) return 1.0
  const lcsLen = longestCommonSubstring(str1, str2)
  return lcsLen / maxLen
}

/**
 * 综合相似度计算（多种算法的加权组合）
 * 适用于中文文本的模糊匹配，类似搜索引擎的模糊搜索
 */
function calculateSimilarity(str1: string, str2: string): number {
  // 完全匹配
  if (str1 === str2) return 1.0
  
  // 忽略大小写的完全匹配
  if (str1.toLowerCase() === str2.toLowerCase()) return 0.99
  
  // 计算多种相似度指标
  const editSim = similarityByEditDistance(str1, str2)
  const jaccardSim = jaccardSimilarity(str1, str2)
  const lcsSim = similarityByLCS(str1, str2)
  
  // 检查是否包含关系（一个字符串包含另一个）
  const contains1 = str1.includes(str2)
  const contains2 = str2.includes(str1)
  let containsBonus = 0
  if (contains1 || contains2) {
    const shorterLen = Math.min(str1.length, str2.length)
    const longerLen = Math.max(str1.length, str2.length)
    containsBonus = (shorterLen / longerLen) * 0.3  // 最多0.3的加分
  }
  
  // 计算前缀相似度（对中文特别有用）
  let prefixSim = 0
  const minLen = Math.min(str1.length, str2.length)
  if (minLen > 0) {
    let prefixMatch = 0
    for (let i = 0; i < minLen; i++) {
      if (str1[i] === str2[i]) {
        prefixMatch++
      } else {
        break
      }
    }
    prefixSim = (prefixMatch / minLen) * 0.2  // 最多0.2的权重
  }
  
  // 加权组合：编辑距离(40%) + Jaccard(20%) + LCS(30%) + 包含关系(10%)
  const combinedSim = editSim * 0.4 + jaccardSim * 0.2 + lcsSim * 0.3 + containsBonus
  
  // 加上前缀相似度加分
  const finalSim = Math.min(1.0, combinedSim + prefixSim)
  
  return finalSim
}

/**
 * 在文本中查找模糊匹配
 * 使用滑动窗口查找最相似的子串
 */
function findFuzzyMatches(
  text: string,
  pattern: string,
  similarityThreshold: number = 0.6,
  contextLines: number = 3
): GrepMatch[] {
  const matches: GrepMatch[] = []
  const lines = text.split(/\r?\n/)
  const patternLen = pattern.length
  
  // 滑动窗口大小：从pattern长度的0.5倍到1.5倍
  const minWindowLen = Math.max(1, Math.floor(patternLen * 0.5))
  const maxWindowLen = Math.ceil(patternLen * 1.5)

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    
    // 如果行太短，跳过
    if (line.length < minWindowLen) continue
    
    // 使用滑动窗口查找最相似的子串
    let bestMatch: { start: number; length: number; similarity: number } | null = null
    
    // 尝试不同的窗口大小
    for (let windowLen = minWindowLen; windowLen <= Math.min(maxWindowLen, line.length); windowLen++) {
      // 滑动窗口（步长优化：对于长文本，可以跳步以提升性能）
      const stepSize = windowLen > 10 ? 2 : 1
      for (let start = 0; start <= line.length - windowLen; start += stepSize) {
        const window = line.substring(start, start + windowLen)
        const similarity = calculateSimilarity(pattern, window)
        
        // 如果相似度超过阈值，记录最佳匹配
        if (similarity >= similarityThreshold) {
          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = { start, length: windowLen, similarity }
          }
        }
      }
    }
    
    // 如果找到匹配，添加到结果
    if (bestMatch) {
      const startLine = Math.max(0, lineIndex - contextLines)
      const endLine = Math.min(lines.length - 1, lineIndex + contextLines)
      
      const preContext = lines.slice(startLine, lineIndex).join('\n')
      const postContext = lines.slice(lineIndex + 1, endLine + 1).join('\n')
      const context = lines.slice(startLine, endLine + 1).join('\n')
      
      matches.push({
        line: lineIndex + 1,
        column: bestMatch.start + 1,
        match: line.substring(bestMatch.start, bestMatch.start + bestMatch.length),
        preContext,
        postContext,
        context,
        similarity: bestMatch.similarity
      })
    }
  }

  // 按相似度降序排序
  matches.sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
  
  return matches
}

/**
 * 在文本中搜索
 */
function searchInText(
  text: string,
  pattern: string,
  isRegex: boolean,
  contextLines: number = 3,
  isFuzzy: boolean = false,
  similarityThreshold: number = 0.6
): GrepMatch[] {
  // 如果启用模糊搜索，使用模糊匹配算法
  if (isFuzzy) {
    return findFuzzyMatches(text, pattern, similarityThreshold, contextLines)
  }

  // 原有的精确搜索逻辑
  const matches: GrepMatch[] = []
  const lines = text.split(/\r?\n/)

  let regex: RegExp
  try {
    if (isRegex) {
      regex = new RegExp(pattern, 'g')
    } else {
      // 转义特殊字符
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      regex = new RegExp(escaped, 'g')
    }
  } catch (error) {
    throw new Error(`无效的正则表达式: ${error instanceof Error ? error.message : String(error)}`)
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    const lineMatches = Array.from(line.matchAll(regex))

    for (const match of lineMatches) {
      if (match.index === undefined) continue

      const startLine = Math.max(0, lineIndex - contextLines)
      const endLine = Math.min(lines.length - 1, lineIndex + contextLines)

      const preContext = lines.slice(startLine, lineIndex).join('\n')
      const postContext = lines.slice(lineIndex + 1, endLine + 1).join('\n')
      const context = lines.slice(startLine, endLine + 1).join('\n')

      matches.push({
        line: lineIndex + 1,
        column: match.index + 1,
        match: match[0],
        preContext,
        postContext,
        context
      })
    }
  }

  return matches
}

/**
 * 在metadata中搜索
 */
function searchInMetadata(
  metadata: ArticleMetaData,
  pattern: string,
  isRegex: boolean,
  contextLines: number = 3,
  isFuzzy: boolean = false,
  similarityThreshold: number = 0.6
): GrepMatch[] {
  const matches: GrepMatch[] = []
  
  // 直接在metadata对象的各个字段中搜索，而不是转换为JSON
  // 这样可以更准确地定位匹配位置
  const searchFields = [
    { name: 'title', value: metadata.title },
    { name: 'author', value: metadata.author },
    { name: 'description', value: metadata.description },
    { name: 'keywords', value: Array.isArray(metadata.keywords) ? metadata.keywords.join(' ') : '' }
  ]

  let regex: RegExp
  try {
    if (isRegex) {
      regex = new RegExp(pattern, 'g')
    } else {
      // 转义特殊字符
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      regex = new RegExp(escaped, 'g')
    }
  } catch (error) {
    throw new Error(`无效的正则表达式: ${error instanceof Error ? error.message : String(error)}`)
  }

  for (const field of searchFields) {
    if (!field.value || typeof field.value !== 'string') continue
    
    // 如果启用模糊搜索，使用模糊匹配
    if (isFuzzy) {
      const fuzzyMatches = findFuzzyMatches(field.value, pattern, similarityThreshold, contextLines)
      for (const match of fuzzyMatches) {
        matches.push({
          ...match,
          match: `[metadata.${field.name}] ${match.match}`
        })
      }
      continue
    }
    
    // 原有的精确搜索逻辑
    const fieldMatches = Array.from(field.value.matchAll(regex))
    for (const match of fieldMatches) {
      if (match.index === undefined) continue
      
      // 计算行号和列号（在字段文本中）
      const lines = field.value.split(/\r?\n/)
      let currentOffset = 0
      let lineNum = 1
      let colNum = 1
      
      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length
        if (match.index < currentOffset + lineLength) {
          lineNum = i + 1
          colNum = match.index - currentOffset + 1
          break
        }
        currentOffset += lineLength + 1  // +1 for newline
      }

      matches.push({
        line: lineNum,
        column: colNum,
        match: `[metadata.${field.name}] ${match[0]}`,
        preContext: field.value.substring(Math.max(0, match.index - 50), match.index),
        postContext: field.value.substring(match.index + match[0].length, Math.min(field.value.length, match.index + match[0].length + 50)),
        context: field.value.substring(Math.max(0, match.index - 50), Math.min(field.value.length, match.index + match[0].length + 50))
      })
    }
  }

  return matches
}

/**
 * Grep Tool回调函数
 */
const grepToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const pattern = params.pattern as string
  const isRegex = params.isRegex === true
  const isFuzzy = params.fuzzy === true  // 模糊搜索开关
  const similarityThreshold = (params.similarityThreshold as number) || 0.6  // 相似度阈值，默认0.6
  const contextLines = (params.contextLines as number) || 3
  const scope = (params.scope as string[]) || ['document', 'metadata']
  const tabId = params.tabId as string | undefined

  // 模糊搜索和正则搜索不能同时启用
  if (isFuzzy && isRegex) {
    return {
      status: 'failed',
      error: createDetailedError(
        '模糊搜索和正则表达式搜索不能同时启用',
        [
          '{"pattern": "搜索文本", "fuzzy": true}  // 使用模糊搜索',
          '{"pattern": "\\d+", "isRegex": true}  // 使用正则表达式搜索',
          '{"pattern": "关键词", "fuzzy": true, "similarityThreshold": 0.7}  // 模糊搜索，设置相似度阈值'
        ],
        [
          'fuzzy和isRegex参数不能同时为true',
          '模糊搜索适用于不记得确切关键词的场景，类似搜索引擎的模糊匹配',
          '可以设置similarityThreshold参数控制相似度阈值（0-1，默认0.6）'
        ]
      )
    }
  }

  if (!pattern || typeof pattern !== 'string') {
    return {
      status: 'failed',
      error: createDetailedError(
        '缺少必需参数: pattern（搜索模式）',
        [
          '{"pattern": "搜索文本", "isRegex": false}',
          '{"pattern": "\\d+", "isRegex": true}  // 正则表达式搜索',
          '{"pattern": "关键词", "scope": ["document", "metadata"], "contextLines": 3}'
        ],
        [
          '支持普通文本搜索和正则表达式搜索（设置isRegex: true）',
          '可以通过scope指定搜索范围：["document"]（文档）或["metadata"]（元数据）',
          '可以设置contextLines参数控制返回的上下文行数',
          '支持在文档和元数据中同时搜索'
        ]
      )
    }
  }

  try {
    onUpdate({
      content: {
        stage: 'searching',
        pattern,
        isRegex,
        scope
      },
      format: 'json',
      componentName: 'GrepDisplay'
    }, {
      percentage: 10,
      message: i18n.global.t('agent.tool.grep.progress.searching', '正在搜索...')
    })

    // 获取文档（支持跨窗口）
    const windowType = getWindowType()
    let doc: any = null
    let targetTabId: string | null = null

    if (windowType === 'setting') {
      // 在设置窗口中，通过广播获取文档信息
      const docInfo = await getActiveDocumentInfoViaBroadcast()
      if (!docInfo) {
        return {
          status: 'failed',
          error: createDetailedError(
            '没有活动的文档标签页',
            [
              '请先打开一个文档，然后再执行搜索操作',
              '或者指定tabId参数：{"pattern": "搜索文本", "tabId": "文档ID"}'
            ],
            [
              'grep工具可以在文档内容和元数据中搜索文本',
              '支持正则表达式搜索，设置isRegex: true'
            ]
          )
        }
      }
      doc = {
        markdown: docInfo.markdown,
        tex: docInfo.tex,
        format: docInfo.format,
        meta: docInfo.meta,
        path: docInfo.path
      }
      targetTabId = docInfo.tabId
    } else {
      // 在主窗口中，直接使用workspace
      targetTabId = tabId || workspace.activeTabId.value
      if (!targetTabId) {
        return {
          status: 'failed',
          error: createDetailedError(
            '没有活动的文档标签页',
            [
              '请先打开一个文档，然后再执行搜索操作',
              '或者指定tabId参数：{"pattern": "搜索文本", "tabId": "文档ID"}'
            ],
            [
              'grep工具可以在文档内容和元数据中搜索文本',
              '支持正则表达式搜索，设置isRegex: true'
            ]
          )
        }
      }
      doc = workspace.ensureDocument(targetTabId)
      if (!doc) {
        return {
          status: 'failed',
          error: createDetailedError(
            '文档不存在',
            [
              '请确认文档已正确打开',
              '检查tabId参数是否正确：{"pattern": "搜索文本", "tabId": "正确的文档ID"}'
            ],
            [
              '可以通过tabId参数指定要搜索的文档',
              '如果未指定tabId，将使用当前活动的文档'
            ]
          )
        }
      }
    }

    const allMatches: GrepMatch[] = []
    let originalContent: string | undefined = undefined
    let language: string = 'plaintext'

    // 在文档中搜索
    if (scope.includes('document')) {
      onUpdate({
        content: {
          stage: 'searching',
          pattern,
          isRegex,
          scope,
          currentScope: 'document'
        },
        format: 'json',
        componentName: 'GrepDisplay'
      }, {
        percentage: 40,
        message: i18n.global.t('agent.tool.grep.progress.searchingDocument', '正在搜索文档内容...')
      })

      const documentText = doc.format === 'md' ? doc.markdown : doc.tex
      originalContent = documentText
      language = doc.format === 'md' ? 'markdown' : (doc.format === 'tex' ? 'latex' : 'plaintext')
      const docMatches = searchInText(documentText, pattern, isRegex, contextLines, isFuzzy, similarityThreshold)
      allMatches.push(...docMatches)
    }

    // 在metadata中搜索
    if (scope.includes('metadata')) {
      onUpdate({
        content: {
          stage: 'searching',
          pattern,
          isRegex,
          scope,
          currentScope: 'metadata'
        },
        format: 'json',
        componentName: 'GrepDisplay'
      }, {
        percentage: 70,
        message: i18n.global.t('agent.tool.grep.progress.searchingMetadata', '正在搜索元数据...')
      })

      const metadataMatches = searchInMetadata(doc.meta, pattern, isRegex, contextLines, isFuzzy, similarityThreshold)
      allMatches.push(...metadataMatches)
    }

    if (signal?.aborted) {
      return {
        status: 'cancelled'
      }
    }

    const result: GrepResult = {
      matches: allMatches,
      totalMatches: allMatches.length,
      searchPattern: pattern,
      isRegex,
      isFuzzy,
      similarityThreshold: isFuzzy ? similarityThreshold : undefined,
      scope,
      originalContent,
      language
    }

    onUpdate({
      content: {
        stage: 'completed',
        result
      },
      format: 'json',
      componentName: 'GrepDisplay'
    }, {
      percentage: 100,
      message: i18n.global.t('agent.tool.grep.progress.completed', `搜索完成，找到 ${allMatches.length} 个匹配`)
    })

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          result
        },
        format: 'json',
        componentName: 'GrepDisplay'
      },
      result
    }
  } catch (error) {
    logger.error('Grep搜索失败:', error)
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

const grepToolLocales: ToolLocales = {
  zh_cn: {
    name: '文本搜索',
    description: '在当前文档和metadata中搜索文本或正则表达式，返回匹配内容和上下文'
  },
  en_us: {
    name: 'Text Search',
    description: 'Search for text or regex patterns in current document and metadata, return matches with context'
  },
  de_DE: {
    name: 'Textsuche',
    description: 'Suchen Sie nach Text- oder Regex-Mustern im aktuellen Dokument und in Metadaten, geben Sie Übereinstimmungen mit Kontext zurück'
  },
  fr_FR: {
    name: 'Recherche de texte',
    description: 'Rechercher des modèles de texte ou regex dans le document actuel et les métadonnées, retourner les correspondances avec contexte'
  },
  ja_JP: {
    name: 'テキスト検索',
    description: '現在のドキュメントとメタデータでテキストまたは正規表現パターンを検索し、コンテキスト付きの一致を返す'
  },
  ko_KR: {
    name: '텍스트 검색',
    description: '현재 문서 및 메타데이터에서 텍스트 또는 정규식 패턴 검색, 컨텍스트와 일치 항목 반환'
  }
}

export const grepToolConfig: AgentToolConfig = {
  id: 'grep',
  name: grepToolLocales,
  description: grepToolLocales,
  origin: 'internal',
  instruction: `
# 文本搜索工具

## 功能描述
在当前活动文档和metadata中搜索文本或正则表达式，返回所有匹配项及其上下文（前置和后置文本）。这是一个**高效、轻量级的查询工具**，可以频繁调用，帮助快速定位文档内容。

## ⭐ 推荐频繁使用

此工具设计为轻量级、高效的查询工具，**建议频繁调用**以：
- **快速定位内容**：查找特定文本在文档中的位置
- **了解上下文**：不仅找到匹配项，还能看到其周围的上下文
- **辅助编辑决策**：在插入、替换内容前，先搜索了解文档结构
- **验证内容存在性**：检查某个概念、术语是否已在文档中出现

**使用示例**：在插入内容前，可以先搜索相关内容的位置，根据匹配结果和上下文确定插入位置。

## 使用场景
- 查找文档中的特定内容
- 搜索关键词
- 使用正则表达式进行复杂搜索
- **模糊搜索**：不记得确切关键词，使用相似度匹配（类似搜索引擎）
- 在metadata中查找信息
- **定位插入位置**：搜索关键词，根据匹配位置和上下文确定插入点
- **验证内容**：检查某个内容是否已存在
- **快速了解文档结构**：通过搜索关键术语了解文档内容分布

## 搜索模式

### 1. 精确搜索（默认）
完全匹配搜索模式，区分大小写。

### 2. 正则表达式搜索
使用正则表达式进行模式匹配。

### 3. 模糊搜索 ⭐ 推荐（类似搜索引擎）
不记得确切关键词时使用，基于相似度匹配，**非常灵活**，适合中文文本搜索。

**模糊搜索的特点**：
- 不需要完全匹配，相似度高的文本也会被找到
- 支持容错：即使有少量字符错误或不同，也能找到相关内容
- 返回相似度分数，可以按相似度排序
- 特别适合中文文本的模糊匹配

**使用场景**：
- 不记得确切的术语或关键词
- 关键词可能有拼写错误或变化
- 想找到相似或相关的内容
- 类似搜索引擎的智能搜索

## 输入格式
\`\`\`json
{
  "pattern": "string",           // 必需，搜索模式（文本、正则表达式或模糊搜索关键词）
  "isRegex": false,              // 可选，是否为正则表达式，默认false（与fuzzy不能同时为true）
  "fuzzy": false,                // 可选，是否使用模糊搜索，默认false（与isRegex不能同时为true）
  "similarityThreshold": 0.6,    // 可选，模糊搜索相似度阈值（0-1），默认0.6，值越高要求越严格
  "contextLines": 3,             // 可选，上下文行数，默认3
  "scope": ["document", "metadata"],  // 可选，搜索范围，默认两者都搜索
  "tabId": "string"              // 可选，指定文档标签页ID，默认使用当前活动标签页
}
\`\`\`

## 使用示例

### 示例1：精确搜索
\`\`\`json
{
  "pattern": "人工智能",
  "scope": ["document"]
}
\`\`\`

### 示例2：模糊搜索 ⭐ 推荐（不记得确切关键词时）
\`\`\`json
{
  "pattern": "人工智",  // 不完整的关键词
  "fuzzy": true,        // 启用模糊搜索
  "similarityThreshold": 0.6  // 相似度阈值（可以调整，0.6-0.8比较合适）
}
\`\`\`

### 示例3：模糊搜索（高相似度要求）
\`\`\`json
{
  "pattern": "机器学习",
  "fuzzy": true,
  "similarityThreshold": 0.8  // 要求更高的相似度（更严格）
}
\`\`\`

### 示例4：定位插入位置（推荐流程）
\`\`\`json
// 步骤1：使用模糊搜索找到相关内容
{
  "pattern": "相关章节",
  "fuzzy": true,
  "similarityThreshold": 0.7
}
// 返回结果包含行号和列号，可以用这些位置信息配合edit工具插入内容
\`\`\`

## 输出格式
\`\`\`json
{
  "matches": [
    {
      "line": 10,
      "column": 5,
      "match": "匹配的文本",
      "preContext": "前置上下文",
      "postContext": "后置上下文",
      "context": "完整上下文",
      "similarity": 0.85  // 模糊搜索模式下提供，相似度分数（0-1）
    }
  ],
  "totalMatches": 5,
  "searchPattern": "pattern",
  "isRegex": false,
  "isFuzzy": false,  // 是否使用模糊搜索
  "similarityThreshold": 0.6,  // 模糊搜索阈值（如果使用模糊搜索）
  "scope": ["document", "metadata"]
}
\`\`\`

## 注意事项
- **鼓励频繁使用**：这是一个轻量级工具，可以随时调用，无需担心性能问题
- **模糊搜索推荐**：当不记得确切关键词时，使用 \`fuzzy: true\` 可以找到相似内容，非常灵活
- 支持纯文本搜索、正则表达式搜索和模糊搜索三种模式
- **模糊搜索和正则搜索不能同时启用**：\`fuzzy\` 和 \`isRegex\` 不能同时为 \`true\`
- 模糊搜索返回的结果按相似度降序排序，最相似的结果排在前面
- 模糊搜索的相似度阈值（\`similarityThreshold\`）：
  - 默认 0.6：较宽松，能找到更多相关结果
  - 0.7-0.8：中等严格，平衡结果数量和准确性
  - 0.9+：非常严格，只返回几乎完全匹配的结果
- 返回每个匹配的行号、列号和上下文，便于定位和了解周围内容
- 可以指定搜索范围：仅文档、仅metadata或两者
- 上下文行数可以自定义（默认3行），帮助理解匹配项在文档中的位置
- 正则表达式使用JavaScript RegExp语法
- **定位插入位置的好方法**：可以搜索关键词，根据匹配位置确定插入点，比总是从行1列1插入更准确
`,
  callback: grepToolCallback,
  displayComponent: GrepDisplay,
  tags: ['search', 'text', 'regex'],
  enabled: true,
  editable: false,
  locales: grepToolLocales,
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: '搜索模式（文本或正则表达式）'
      },
      isRegex: {
        type: 'boolean',
        description: '是否为正则表达式（与fuzzy不能同时为true）',
        default: false
      },
      fuzzy: {
        type: 'boolean',
        description: '是否使用模糊搜索（与isRegex不能同时为true），推荐在不知道确切关键词时使用',
        default: false
      },
      similarityThreshold: {
        type: 'number',
        description: '模糊搜索相似度阈值（0-1），默认0.6。值越高要求越严格，0.6-0.8比较合适',
        default: 0.6,
        minimum: 0,
        maximum: 1
      },
      contextLines: {
        type: 'number',
        description: '上下文行数',
        default: 3
      },
      scope: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['document', 'metadata']
        },
        description: '搜索范围',
        default: ['document', 'metadata']
      },
      tabId: {
        type: 'string',
        description: '文档标签页ID（可选，默认使用当前活动标签页）'
      }
    },
    required: ['pattern']
  },
  outputSchema: {
    type: 'object',
    properties: {
      matches: {
        type: 'array',
        description: '匹配结果列表'
      },
      totalMatches: {
        type: 'number',
        description: '总匹配数'
      },
      searchPattern: {
        type: 'string',
        description: '搜索模式'
      },
      isRegex: {
        type: 'boolean',
        description: '是否为正则表达式'
      },
      scope: {
        type: 'array',
        description: '搜索范围'
      }
    }
  }
}

