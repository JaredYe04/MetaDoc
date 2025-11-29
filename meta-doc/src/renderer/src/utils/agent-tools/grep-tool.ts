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
}

/**
 * Grep结果
 */
export interface GrepResult {
  matches: GrepMatch[]
  totalMatches: number
  searchPattern: string
  isRegex: boolean
  scope: string[]       // 搜索范围：['document', 'metadata']
  originalContent?: string  // 原始文档内容（用于Display组件显示）
  language?: string         // 文档语言类型（'markdown' | 'latex' | 'plaintext'）
}

/**
 * 在文本中搜索
 */
function searchInText(
  text: string,
  pattern: string,
  isRegex: boolean,
  contextLines: number = 3
): GrepMatch[] {
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
  contextLines: number = 3
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
  const contextLines = (params.contextLines as number) || 3
  const scope = (params.scope as string[]) || ['document', 'metadata']
  const tabId = params.tabId as string | undefined

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
      const docMatches = searchInText(documentText, pattern, isRegex, contextLines)
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

      const metadataMatches = searchInMetadata(doc.meta, pattern, isRegex, contextLines)
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
- 在metadata中查找信息
- **定位插入位置**：搜索关键词，根据匹配位置和上下文确定插入点
- **验证内容**：检查某个内容是否已存在
- **快速了解文档结构**：通过搜索关键术语了解文档内容分布

## 输入格式
\`\`\`json
{
  "pattern": "string",           // 必需，搜索模式（文本或正则表达式）
  "isRegex": false,              // 可选，是否为正则表达式，默认false
  "contextLines": 3,             // 可选，上下文行数，默认3
  "scope": ["document", "metadata"],  // 可选，搜索范围，默认两者都搜索
  "tabId": "string"              // 可选，指定文档标签页ID，默认使用当前活动标签页
}
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
      "context": "完整上下文"
    }
  ],
  "totalMatches": 5,
  "searchPattern": "pattern",
  "isRegex": false,
  "scope": ["document", "metadata"]
}
\`\`\`

## 注意事项
- **鼓励频繁使用**：这是一个轻量级工具，可以随时调用，无需担心性能问题
- 支持纯文本搜索和正则表达式搜索
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
        description: '是否为正则表达式',
        default: false
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

