/**
 * Grep Tool
 * 在当前文档和metadata中搜索文本/正则，返回匹配内容和上下文
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress
} from '../../types/agent-tool'
import { useWorkspace } from '../../stores/workspace'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import type { ArticleMetaData } from '../../../../types'
import GrepDisplay from './components/GrepDisplay.vue'
import { getActiveDocumentInfoViaBroadcast } from './document-broadcast-helper'
import { getWindowType } from '../event-bus'
import { createDetailedError } from './tool-utils'
import { grepInWorkspaces, type WorkspaceGrepMatch } from '../workspace/workspace-grep'

const logger = createRendererLogger('GrepTool')
const workspace = useWorkspace()

/**
 * 匹配结果
 */
export interface GrepMatch {
  line: number // 行号（1-based）
  column: number // 列号（1-based）
  match: string // 匹配的文本
  filePath?: string // 所在文件路径（工作区级别搜索时提供）
  preContext: string // 前置上下文
  postContext: string // 后置上下文
  context: string // 完整上下文（包含匹配行）
  similarity?: number // 相似度分数（0-1，仅在模糊搜索模式下提供）
  groups?: string[] // 正则表达式捕获组（仅在正则表达式搜索模式下提供）
}

/**
 * Grep结果
 */
export interface GrepResult {
  matches: GrepMatch[]
  totalMatches: number
  searchPattern: string
  isRegex: boolean
  isFuzzy: boolean // 是否使用模糊搜索
  similarityThreshold?: number // 相似度阈值
  scope: string[] // 搜索范围：['workspace', 'document', 'metadata']
  originalContent?: string // 原始文档内容（用于Display组件显示）
  language?: string // 文档语言类型（'markdown' | 'latex' | 'plaintext'）
  replacedCount?: number // 替换的数量（如果执行了替换）
  replacementText?: string // 替换文本（如果执行了替换）
  replacedContent?: string // 替换后的文档内容（如果执行了替换）
}

/**
 * 计算编辑距离（Levenshtein距离）
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length
  const n = str2.length
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))

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
          dp[i - 1][j] + 1, // 删除
          dp[i][j - 1] + 1, // 插入
          dp[i - 1][j - 1] + 1 // 替换
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
  return 1 - distance / maxLen
}

/**
 * 计算字符集合重叠相似度（Jaccard相似度）
 */
function jaccardSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.split(''))
  const set2 = new Set(str2.split(''))

  const intersection = new Set([...set1].filter((x) => set2.has(x)))
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
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))

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
    containsBonus = (shorterLen / longerLen) * 0.3 // 最多0.3的加分
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
    prefixSim = (prefixMatch / minLen) * 0.2 // 最多0.2的权重
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
    for (
      let windowLen = minWindowLen;
      windowLen <= Math.min(maxWindowLen, line.length);
      windowLen++
    ) {
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
        context,
        // 如果使用正则表达式，保存捕获组信息
        groups: isRegex && match.length > 1 ? [...match] : undefined
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
        currentOffset += lineLength + 1 // +1 for newline
      }

      matches.push({
        line: lineNum,
        column: colNum,
        match: `[metadata.${field.name}] ${match[0]}`,
        preContext: field.value.substring(Math.max(0, match.index - 50), match.index),
        postContext: field.value.substring(
          match.index + match[0].length,
          Math.min(field.value.length, match.index + match[0].length + 50)
        ),
        context: field.value.substring(
          Math.max(0, match.index - 50),
          Math.min(field.value.length, match.index + match[0].length + 50)
        ),
        // 如果使用正则表达式，保存捕获组信息
        groups: isRegex && match.length > 1 ? [...match] : undefined
      })
    }
  }

  return matches
}

/**
 * 计算替换文本（支持正则表达式捕获组）
 */
function computeReplacementText(replacement: string, match: GrepMatch, isRegex: boolean): string {
  let result = replacement

  // 如果使用正则表达式且有捕获组，处理 $1, $2 等引用
  if (isRegex && match.groups && match.groups.length > 0) {
    // 处理 $1, $2, $3... 等捕获组引用
    // 同时也支持 $$ 表示字面量 $
    result = result.replace(/\$(\d+)|(\$\$)/g, (fullMatch, indexStr, literalDollar) => {
      // 如果是 $$，返回单个 $
      if (literalDollar) {
        return '$'
      }
      // 如果是 $1, $2 等，返回对应的捕获组
      const index = Number(indexStr)
      if (Number.isNaN(index) || index < 0 || index >= match.groups!.length) {
        return fullMatch // 如果索引无效，返回原始字符串
      }
      return match.groups![index] ?? ''
    })
  }

  return result
}

/**
 * 在文本中执行替换操作
 */
function performReplacements(
  text: string,
  matches: GrepMatch[],
  replacement: string,
  isRegex: boolean,
  replaceAll: boolean,
  replaceIndices?: number[]
): { newText: string; replacedCount: number } {
  if (matches.length === 0) {
    return { newText: text, replacedCount: 0 }
  }

  // 确定要替换的匹配项
  let indicesToReplace: number[]
  if (replaceAll) {
    // 全部替换
    indicesToReplace = matches.map((_, index) => index)
  } else if (replaceIndices && replaceIndices.length > 0) {
    // 部分替换（指定索引）
    indicesToReplace = replaceIndices.filter((index) => index >= 0 && index < matches.length)
  } else {
    // 默认只替换第一个
    indicesToReplace = [0]
  }

  if (indicesToReplace.length === 0) {
    return { newText: text, replacedCount: 0 }
  }

  // 按行号分组匹配项，从后往前替换（避免位置偏移）
  const lines = text.split(/\r?\n/)
  const matchesByLine = new Map<number, Array<{ matchIndex: number; match: GrepMatch }>>()

  for (const index of indicesToReplace) {
    const match = matches[index]
    if (!matchesByLine.has(match.line)) {
      matchesByLine.set(match.line, [])
    }
    matchesByLine.get(match.line)!.push({ matchIndex: index, match })
  }

  // 从后往前处理每一行（避免位置偏移）
  const sortedLines = Array.from(matchesByLine.keys()).sort((a, b) => b - a)
  let replacedCount = 0

  for (const lineNum of sortedLines) {
    const lineMatches = matchesByLine.get(lineNum)!
    // 在同一行内，从后往前替换
    lineMatches.sort((a, b) => b.match.column - a.match.column)

    const lineIndex = lineNum - 1 // 转换为0-based索引
    if (lineIndex < 0 || lineIndex >= lines.length) continue

    let line = lines[lineIndex]

    for (const { match } of lineMatches) {
      const colIndex = match.column - 1 // 转换为0-based索引
      const matchLength = match.match.length

      // 计算替换文本
      const replacementText = computeReplacementText(replacement, match, isRegex)

      // 执行替换
      if (colIndex >= 0 && colIndex + matchLength <= line.length) {
        line =
          line.substring(0, colIndex) + replacementText + line.substring(colIndex + matchLength)
        replacedCount++
      }
    }

    lines[lineIndex] = line
  }

  return {
    newText: lines.join('\n'),
    replacedCount
  }
}

/**
 * 从 params 中解析搜索模式，支持多种 key 和类型（适配不同 agent 调用格式）
 */
function resolvePattern(params: Record<string, unknown>): string {
  const raw =
    params.pattern ??
    params.searchPattern ??
    params.query ??
    params.q ??
    params.keyword ??
    params.keywords
  if (raw === undefined || raw === null) return ''
  const s = typeof raw === 'string' ? raw : String(raw).trim()
  return s.trim()
}

/**
 * 从 params 中解析 scope，支持数组或字符串（如 "workspace,document,metadata" 或 "workspace"）
 */
function resolveScope(params: Record<string, unknown>): string[] | undefined {
  const raw = params.scope ?? params.scopes ?? params.range
  if (raw === undefined || raw === null) return undefined
  if (Array.isArray(raw)) {
    return raw.filter((x) => typeof x === 'string' && x.length > 0)
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return undefined
    return trimmed
      .split(/[\s,;|]+/)
      .map((s) => {
        const lower = s.trim().toLowerCase()
        return lower === 'workspaces' ? 'workspace' : lower
      })
      .filter(Boolean)
  }
  return undefined
}

/**
 * 解析布尔参数（支持 true/false 或 "true"/"false" 字符串）
 */
function resolveBoolean(
  params: Record<string, unknown>,
  key: string,
  defaultValue: boolean
): boolean {
  const raw = params[key]
  if (raw === undefined || raw === null) return defaultValue
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'string') return raw.trim().toLowerCase() === 'true' || raw.trim() === '1'
  return defaultValue
}

/**
 * 解析数值参数
 */
function resolveNumber(
  params: Record<string, unknown>,
  key: string,
  defaultValue: number,
  min?: number,
  max?: number
): number {
  const raw = params[key]
  if (raw === undefined || raw === null) return defaultValue
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (Number.isNaN(n)) return defaultValue
  if (min !== undefined && n < min) return min
  if (max !== undefined && n > max) return max
  return n
}

/**
 * Grep Tool回调函数
 */
const grepToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const pattern = resolvePattern(params)
  const isRegex = resolveBoolean(params, 'isRegex', false)
  const isFuzzy = resolveBoolean(params, 'fuzzy', false)
  const similarityThreshold = resolveNumber(params, 'similarityThreshold', 0.6, 0, 1)
  const contextLines = resolveNumber(params, 'contextLines', 3, 0, 50)
  const rawScope = resolveScope(params)
  let scope: string[]
  if (rawScope && rawScope.length > 0) {
    scope = rawScope
  } else {
    try {
      const saved = localStorage.getItem('workspaceFolders')
      const roots = saved ? JSON.parse(saved) || [] : []
      const hasRoots =
        Array.isArray(roots) &&
        roots.some((p: unknown) => typeof p === 'string' && (p as string).length > 0)
      scope = hasRoots ? ['workspace', 'document', 'metadata'] : ['document', 'metadata']
    } catch {
      scope = ['document', 'metadata']
    }
  }
  const tabId = (params.tabId ?? params.tab_id) as string | undefined
  const verbose = resolveBoolean(params, 'verbose', false)

  // 替换相关参数
  const replaceText = (params.replaceText ?? params.replacement ?? params.replace) as
    | string
    | undefined
  const replaceAll = resolveBoolean(params, 'replaceAll', false)
  const rawReplaceIndices = params.replaceIndices ?? params.indices
  const replaceIndices: number[] | undefined = Array.isArray(rawReplaceIndices)
    ? rawReplaceIndices
        .map((i) => (typeof i === 'number' ? i : parseInt(String(i), 10)))
        .filter((i) => !Number.isNaN(i))
    : undefined

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

  if (!pattern || pattern.length === 0) {
    return {
      status: 'failed',
      error: createDetailedError(
        '缺少或无效的搜索模式（pattern）',
        [
          '{"pattern": "搜索文本"} 或 {"searchPattern": "关键词"} 或 {"query": "内容"}',
          '{"pattern": "\\d+", "isRegex": true}  // 正则表达式',
          '{"pattern": "关键词", "scope": ["document", "metadata"], "contextLines": 3}'
        ],
        [
          'pattern 也可用 searchPattern、query、q、keyword 作为参数名',
          'scope 可以是数组 ["workspace","document","metadata"] 或字符串 "workspace,document,metadata"',
          '支持普通文本、正则（isRegex: true）和模糊搜索（fuzzy: true）'
        ]
      )
    }
  }

  try {
    onUpdate(
      {
        content: {
          stage: 'searching',
          pattern,
          isRegex,
          scope
        },
        format: 'json',
        componentName: 'GrepDisplay'
      },
      {
        percentage: 10,
        message: i18n.global.t('agent.tool.grep.progress.searching', '正在搜索...')
      }
    )

    // 仅当 scope 包含 document 或 metadata 时才需要解析文档；仅 workspace 时不需要文档上下文
    const needDocument = scope.includes('document') || scope.includes('metadata')
    const windowType = getWindowType()
    let doc: any = null
    let targetTabId: string | null = null

    if (needDocument) {
      if (windowType === 'setting') {
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
              ['grep工具可以在文档内容和元数据中搜索文本', '支持正则表达式搜索，设置isRegex: true']
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
        // 主窗口：仅当显式传入 tabId 或当前活动标签页为文档标签页时使用，避免对系统/工具 Tab 调用文档上下文
        if (tabId) {
          targetTabId = tabId
        } else if (workspace.activeDocument.value) {
          targetTabId = workspace.activeTabId.value
        }
        if (!targetTabId) {
          return {
            status: 'failed',
            error: createDetailedError(
              '当前活动标签页不是文档（例如正在查看 Agent 等系统页）',
              [
                '请通过 tabId 参数指定要搜索的文档（系统上下文中会提供当前打开的文档列表）',
                '或仅使用 scope: ["workspace"] 仅搜索工作区文件'
              ],
              ['可通过 scope 指定搜索范围：["workspace"]、["document"]、["metadata"]']
            )
          }
        }
        try {
          doc = workspace.ensureDocument(targetTabId)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          return {
            status: 'failed',
            error: createDetailedError(
              msg.includes('不应该有文档上下文')
                ? '指定的 tabId 对应的是系统/工具标签页，无文档上下文。请使用系统上下文中列出的文档 tabId，或使用 scope: ["workspace"]。'
                : '文档不存在',
              [
                '检查 tabId 是否为已打开的文档标签页 id',
                '或使用 scope: ["workspace"] 仅搜索工作区'
              ],
              []
            )
          }
        }
        if (!doc) {
          return {
            status: 'failed',
            error: createDetailedError(
              '文档不存在',
              [
                '请确认文档已正确打开',
                '检查tabId参数是否正确：{"pattern": "搜索文本", "tabId": "正确的文档ID"}'
              ],
              ['可以通过tabId参数指定要搜索的文档', '如果未指定tabId，将使用当前活动的文档']
            )
          }
        }
      }
    }

    const allMatches: GrepMatch[] = []
    let originalContent: string | undefined = undefined
    let language: string = 'plaintext'
    let documentText: string | undefined = undefined

    // 在文档中搜索
    if (scope.includes('document')) {
      onUpdate(
        {
          content: {
            stage: 'searching',
            pattern,
            isRegex,
            scope,
            currentScope: 'document'
          },
          format: 'json',
          componentName: 'GrepDisplay'
        },
        {
          percentage: 40,
          message: i18n.global.t(
            'agent.tool.grep.progress.searchingDocument',
            '正在搜索文档内容...'
          )
        }
      )

      documentText = doc.format === 'md' ? doc.markdown : doc.tex
      originalContent = documentText
      language = doc.format === 'md' ? 'markdown' : doc.format === 'tex' ? 'latex' : 'plaintext'
      const docMatches = searchInText(
        documentText || '',
        pattern,
        isRegex,
        contextLines,
        isFuzzy,
        similarityThreshold
      )
      allMatches.push(
        ...docMatches.map((m) => ({
          ...m,
          filePath: doc.path || undefined
        }))
      )
    }

    // 在metadata中搜索
    if (scope.includes('metadata')) {
      onUpdate(
        {
          content: {
            stage: 'searching',
            pattern,
            isRegex,
            scope,
            currentScope: 'metadata'
          },
          format: 'json',
          componentName: 'GrepDisplay'
        },
        {
          percentage: 70,
          message: i18n.global.t('agent.tool.grep.progress.searchingMetadata', '正在搜索元数据...')
        }
      )

      const metadataMatches = searchInMetadata(
        doc.meta ?? {},
        pattern,
        isRegex,
        contextLines,
        isFuzzy,
        similarityThreshold
      )
      allMatches.push(
        ...metadataMatches.map((m) => ({
          ...m,
          filePath: doc.path || undefined
        }))
      )
    }

    // 在工作区中搜索（跨文件）
    const searchWorkspaceScope = scope.includes('workspace') || scope.includes('workspaces')

    if (searchWorkspaceScope) {
      onUpdate(
        {
          content: {
            stage: 'searching',
            pattern,
            isRegex,
            scope,
            currentScope: 'workspace'
          },
          format: 'json',
          componentName: 'GrepDisplay'
        },
        {
          percentage: 60,
          message: i18n.global.t(
            'agent.tool.grep.progress.searchingWorkspace',
            '正在搜索工作区文件...'
          )
        }
      )

      // 从本地存储中获取当前工作区根目录列表（与 WorkspaceExplorer 共享）
      const getWorkspaceRoots = (): string[] => {
        try {
          const saved = localStorage.getItem('workspaceFolders')
          if (!saved) return []
          const arr = JSON.parse(saved)
          if (!Array.isArray(arr)) return []
          return arr.filter((p) => typeof p === 'string' && p.length > 0)
        } catch {
          return []
        }
      }

      const roots = getWorkspaceRoots()

      let workspaceMatches: WorkspaceGrepMatch[] = []

      if (roots.length === 0) {
        // 没有显式工作区时，将当前已打开的文档视为“全局工作区”
        // 使用内存中的文档内容进行搜索，避免额外的文件读取
        for (const tab of workspace.tabs) {
          if (tab.kind !== 'file' || !tab.path) continue
          const docForTab = workspace.ensureDocument(tab.id)
          const text =
            docForTab.format === 'md' ? (docForTab.markdown as string) : (docForTab.tex as string)

          const textMatches = searchInText(
            text || '',
            pattern,
            isRegex,
            contextLines,
            isFuzzy,
            similarityThreshold
          )

          const limitedMatches =
            textMatches.length > 0
              ? textMatches.map<WorkspaceGrepMatch>((m) => ({
                  filePath: docForTab.path,
                  line: m.line,
                  column: m.column,
                  match: m.match,
                  preContext: m.preContext,
                  postContext: m.postContext,
                  context: m.context
                }))
              : []

          workspaceMatches.push(...limitedMatches)
        }
      } else {
        workspaceMatches = await grepInWorkspaces(roots, {
          pattern,
          isRegex,
          contextLines,
          maxMatchesPerFile: 50,
          maxFiles: 2000,
          signal
        })
      }

      allMatches.push(
        ...workspaceMatches.map<Readonly<GrepMatch>>((m) => ({
          line: m.line,
          column: m.column,
          match: m.match,
          preContext: m.preContext,
          postContext: m.postContext,
          context: m.context,
          filePath: m.filePath
        }))
      )
    }

    if (signal?.aborted) {
      return {
        status: 'cancelled'
      }
    }

    // 执行替换操作（如果提供了替换文本）
    let replacedCount = 0
    let newContent: string | undefined = undefined

    if (replaceText && documentText && scope.includes('document')) {
      // 只替换文档中的匹配项（不支持替换metadata）
      const documentMatches = allMatches.filter((m) => !m.match.startsWith('[metadata.'))

      if (documentMatches.length > 0) {
        onUpdate(
          {
            content: {
              stage: 'replacing',
              pattern,
              isRegex,
              scope,
              matchesCount: documentMatches.length
            },
            format: 'json',
            componentName: 'GrepDisplay'
          },
          {
            percentage: 85,
            message: i18n.global.t('agent.tool.grep.progress.replacing', '正在执行替换...')
          }
        )

        // 此时 documentText 已经确认不是 undefined
        const replacementResult = performReplacements(
          documentText as string,
          documentMatches,
          replaceText,
          isRegex,
          replaceAll,
          replaceIndices
        )

        newContent = replacementResult.newText
        replacedCount = replacementResult.replacedCount

        // 更新文档内容
        if (windowType === 'setting') {
          // 在设置窗口中，需要通过广播更新文档
          // 注意：设置窗口可能无法直接更新文档，这里只返回结果
          logger.warn('在设置窗口中无法直接更新文档，替换结果仅用于显示')
        } else {
          // 在主窗口中，直接更新文档
          if (targetTabId) {
            if (doc.format === 'md') {
              workspace.updateDocumentMarkdown(targetTabId, newContent)
            } else if (doc.format === 'tex') {
              workspace.updateDocumentTex(targetTabId, newContent)
            }
          }
        }
      }
    }

    // 根据verbose参数决定是否包含完整内容（用于Display组件）
    const resultForDisplay: GrepResult = {
      matches: allMatches,
      totalMatches: allMatches.length,
      searchPattern: pattern,
      isRegex,
      isFuzzy,
      similarityThreshold: isFuzzy ? similarityThreshold : undefined,
      scope,
      language,
      replacedCount: replacedCount > 0 ? replacedCount : undefined,
      replacementText: replaceText,
      // 只有在verbose模式下才包含完整内容（节省token）
      ...(verbose
        ? {
            originalContent,
            replacedContent: newContent
          }
        : {})
    }

    // 简化的搜索结果（不包含完整内容，用于发送给AI，节省token）
    const resultForAI: Omit<GrepResult, 'originalContent' | 'replacedContent'> = {
      matches: allMatches,
      totalMatches: allMatches.length,
      searchPattern: pattern,
      isRegex,
      isFuzzy,
      similarityThreshold: isFuzzy ? similarityThreshold : undefined,
      scope,
      language,
      replacedCount: replacedCount > 0 ? replacedCount : undefined,
      replacementText: replaceText
    }

    onUpdate(
      {
        content: {
          stage: 'completed',
          result: resultForDisplay // Display组件根据verbose参数决定是否包含完整内容
        },
        format: 'json',
        componentName: 'GrepDisplay'
      },
      {
        percentage: 100,
        message:
          replacedCount > 0
            ? i18n.global.t('agent.tool.grep.progress.completedWithReplace', {
                count: allMatches.length,
                replaced: replacedCount
              })
            : i18n.global.t('agent.tool.grep.progress.completed', { count: allMatches.length })
      }
    )

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          result: resultForDisplay // Display组件根据verbose参数决定是否包含完整内容
        },
        format: 'json',
        componentName: 'GrepDisplay'
      },
      result: resultForAI // AI使用简化版本（不包含originalContent和replacedContent，节省token）
    }
  } catch (error) {
    logger.error('Grep搜索失败:', error)
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

const GREP_TOOL_NAME = 'Text Search'
const GREP_TOOL_DESCRIPTION =
  'Search for text or regex patterns in current document and metadata, return matches with context'

export const grepToolConfig: AgentToolConfig = {
  id: 'grep',
  name: GREP_TOOL_NAME,
  description: GREP_TOOL_DESCRIPTION,
  origin: 'internal',
  spec: {
    name: 'grep',
    brief:
      'Search for text patterns in the current document using regular expressions or fuzzy search. Returns matches with line numbers and context. Supports search and replace.',
    fullSpec: `# Text Search Tool (Grep)

## Description
Search for text patterns in the current document, metadata, and/or **workspace** using text, regular expressions, or fuzzy search. Returns all matches with context (preceding and following text). Supports search and replace functionality. This is an **efficient, lightweight query tool** that can be called frequently to quickly locate and modify document content.

**Scope \`workspace\`**: When workspace roots exist, scope defaults to include \`workspace\` (whole workspace directory; excludes .git, node_modules, .metadoc). Use \`scope: ["workspace"]\` to search only workspace files.

**⚠️ This tool does NOT return full file content.** It only returns **matching lines and context** (snippets). If you need to **read entire file content or large portions** of a file, use the **\`workspace\` (workspace file reader) tool** with \`paths\` instead; do not use grep for that.

## ⭐ Recommended for Frequent Use

This tool is designed as a lightweight, efficient query tool, **recommended for frequent use** to:
- **Quickly locate content**: Find specific text positions in document
- **Understand context**: Not only find matches, but also see surrounding context
- **Assist editing decisions**: Search to understand document structure before inserting/replacing content
- **Verify content existence**: Check if a concept or term already exists in document

## Usage Scenarios
- Find specific content in document
- Search keywords
- Use regular expressions for complex searches
- **Fuzzy search**: Don't remember exact keywords, use similarity matching (like search engines)
- Find information in metadata
- **Locate insertion positions**: Search keywords, determine insertion point based on match position and context
- **Verify content**: Check if content already exists
- **Quickly understand document structure**: Understand document content distribution by searching key terms
- **Batch replace**: Use regular expressions and capture groups for batch replacement
- **Selective replace**: Replace only specified matches

## Search Modes

### 1. Exact Search (default)
Exact match search pattern, case-sensitive.

### 2. Regular Expression Search
Use regular expressions for pattern matching.

### 3. Fuzzy Search ⭐ Recommended (like search engines)
Use when you don't remember exact keywords, based on similarity matching, **very flexible**, suitable for Chinese text search.

**Fuzzy search features**:
- No need for exact match, similar text will also be found
- Supports error tolerance: can find related content even with minor character errors or differences
- Returns similarity scores, can be sorted by similarity
- Especially suitable for fuzzy matching of Chinese text

## Input Format
\`\`\`json
{
  "pattern": "string",           // Required, search pattern (text, regex, or fuzzy search keyword)
  "isRegex": false,              // Optional, whether it's a regex, default false (cannot be true with fuzzy)
  "fuzzy": false,                // Optional, whether to use fuzzy search, default false (cannot be true with isRegex)
  "similarityThreshold": 0.6,    // Optional, fuzzy search similarity threshold (0-1), default 0.6
  "contextLines": 3,             // Optional, context lines, default 3
  "scope": ["workspace", "document", "metadata"],  // Optional; with workspace roots default includes workspace (whole workspace directory)
  "tabId": "string",             // Optional, document tab ID
  "replaceText": "string",      // Optional, replacement text (if provided, will perform replace)
  "replaceAll": false,           // Optional, whether to replace all matches, default false
  "replaceIndices": [0, 2, 5]   // Optional, array of match indices to replace (0-based), mutually exclusive with replaceAll
}
\`\`\`

## Output Format
Returns array of matches with line numbers, positions, and context.`
  },
  instruction: undefined,
  callback: grepToolCallback,
  displayComponent: GrepDisplay,
  tags: ['search', 'text', 'regex'],
  enabled: true,
  editable: false,
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description:
          '搜索模式（必填）。也支持参数名 searchPattern、query、q、keyword 之一，任选其一即可'
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
          enum: ['workspace', 'document', 'metadata']
        },
        description:
          '搜索范围：workspace/document/metadata。可为数组或字符串（如 "workspace,document,metadata"）',
        default: ['workspace', 'document', 'metadata']
      },
      tabId: {
        type: 'string',
        description: '文档标签页ID（可选，默认使用当前活动标签页）'
      },
      replaceText: {
        type: 'string',
        description:
          '替换文本（可选，如果提供将执行替换操作）。支持正则表达式捕获组引用：$1, $2等表示捕获组，$$表示字面量$'
      },
      replaceAll: {
        type: 'boolean',
        description: '是否替换所有匹配项（默认false，只替换第一个）。与replaceIndices互斥',
        default: false
      },
      replaceIndices: {
        type: 'array',
        items: {
          type: 'number'
        },
        description:
          '要替换的匹配项索引数组（0-based，可选）。与replaceAll互斥，如果提供则只替换指定索引的匹配项'
      },
      verbose: {
        type: 'boolean',
        description:
          '是否返回完整内容（originalContent和replacedContent）用于Display组件显示对比。默认false，节省token。只有在需要查看完整文档内容时才设置为true。',
        default: false
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
      },
      replacedCount: {
        type: 'number',
        description: '替换的数量（如果执行了替换）'
      },
      replacementText: {
        type: 'string',
        description: '替换文本（如果执行了替换）'
      }
    }
  }
}
