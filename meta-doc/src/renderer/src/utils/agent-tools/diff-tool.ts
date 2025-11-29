/**
 * Diff Tool
 * 比对两段文本、URL或文件，返回差异结果
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress,
  ToolLocales
} from '../../types/agent-tool'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import localIpcRenderer from '../web-adapter/local-ipc-renderer'
import { webMainCalls } from '../web-adapter/web-main-calls'
import axios from 'axios'
import DiffDisplay from './components/DiffDisplay.vue'
import { createDetailedError } from './tool-utils'

const logger = createRendererLogger('DiffTool')

// 获取IPC渲染器
let ipcRenderer: typeof localIpcRenderer | null = null
if (typeof window !== 'undefined') {
  if ((window as any).electron?.ipcRenderer) {
    ipcRenderer = (window as any).electron.ipcRenderer
  } else {
    webMainCalls()
    ipcRenderer = localIpcRenderer
  }
}

/**
 * 差异类型
 */
export type DiffType = 'equal' | 'insert' | 'delete' | 'replace'

/**
 * 差异块
 */
export interface DiffChunk {
  type: DiffType
  oldStart: number  // 旧文本起始行号（1-based）
  oldEnd: number    // 旧文本结束行号（1-based）
  newStart: number  // 新文本起始行号（1-based）
  newEnd: number    // 新文本结束行号（1-based）
  oldLines: string[] // 旧文本行
  newLines: string[] // 新文本行
}

/**
 * Diff结果
 */
export interface DiffResult {
  chunks: DiffChunk[]
  summary: {
    totalChanges: number
    insertions: number
    deletions: number
    replacements: number
  }
  oldText: string
  newText: string
}

/**
 * 从文件路径读取内容
 */
async function loadTextFromFile(filePath: string, signal?: AbortSignal): Promise<string> {
  if (!ipcRenderer) {
    throw new Error('IPC渲染器不可用，无法读取文件')
  }

  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

  try {
    const content = await ipcRenderer.invoke('read-file-content', filePath)
    return content
  } catch (error) {
    logger.error('读取文件失败:', error)
    throw new Error(`读取文件失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 从URL获取内容
 */
async function loadTextFromUrl(url: string, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

  try {
    // 优先使用主进程代理（避免CORS）
    if (ipcRenderer) {
      try {
        const response = await ipcRenderer.invoke('execute-http-request', {
          url,
          method: 'GET',
          timeout: 30000,
          maxRedirects: 5
        })
        return response.content
      } catch (error) {
        // 如果主进程请求失败，尝试使用axios
        logger.warn('主进程HTTP请求失败，尝试使用axios:', error)
      }
    }

    // 使用axios作为后备
    const response = await axios.get(url, {
      timeout: 30000,
      signal,
      responseType: 'text',
      validateStatus: () => true
    })

    if (response.status >= 200 && response.status < 300) {
      return response.data
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ERR_CANCELED') {
        throw new Error('请求已取消')
      }
      throw new Error(`从URL获取数据失败: ${error.message}`)
    }
    logger.error('从URL获取数据失败:', error)
    throw error
  }
}

/**
 * 简单的行级diff算法（基于最长公共子序列）
 */
function computeDiff(oldText: string, newText: string): DiffResult {
  const oldLines = oldText.split(/\r?\n/)
  const newLines = newText.split(/\r?\n/)

  // 计算最长公共子序列（LCS）
  const m = oldLines.length
  const n = newLines.length
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // 回溯生成差异块
  const chunks: DiffChunk[] = []
  let i = m
  let j = n

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      // 相同行，继续回溯
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      // 插入
      const insertStart = j
      const insertLines: string[] = []
      while (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        if (i === 0 || oldLines[i - 1] !== newLines[j - 1]) {
          insertLines.unshift(newLines[j - 1])
          j--
        } else {
          break
        }
      }
      if (insertLines.length > 0) {
        chunks.unshift({
          type: 'insert',
          oldStart: i + 1,
          oldEnd: i,
          newStart: j + 1,
          newEnd: insertStart,
          oldLines: [],
          newLines: insertLines
        })
      }
    } else if (i > 0 && (j === 0 || dp[i - 1][j] >= dp[i][j - 1])) {
      // 删除
      const deleteStart = i
      const deleteLines: string[] = []
      while (i > 0 && (j === 0 || dp[i - 1][j] >= dp[i][j - 1])) {
        if (j === 0 || oldLines[i - 1] !== newLines[j - 1]) {
          deleteLines.unshift(oldLines[i - 1])
          i--
        } else {
          break
        }
      }
      if (deleteLines.length > 0) {
        chunks.unshift({
          type: 'delete',
          oldStart: i + 1,
          oldEnd: deleteStart,
          newStart: j + 1,
          newEnd: j,
          oldLines: deleteLines,
          newLines: []
        })
      }
    }
  }

  // 合并相邻的相同类型块，并识别替换
  const mergedChunks: DiffChunk[] = []
  for (const chunk of chunks) {
    if (mergedChunks.length === 0) {
      mergedChunks.push(chunk)
    } else {
      const last = mergedChunks[mergedChunks.length - 1]
      // 如果相邻的插入和删除可以合并为替换
      if (
        (last.type === 'delete' && chunk.type === 'insert') ||
        (last.type === 'insert' && chunk.type === 'delete')
      ) {
        if (last.oldEnd === chunk.oldStart && last.newEnd === chunk.newStart) {
          // 合并为替换
          mergedChunks[mergedChunks.length - 1] = {
            type: 'replace',
            oldStart: last.oldStart,
            oldEnd: chunk.oldEnd,
            newStart: last.newStart,
            newEnd: chunk.newEnd,
            oldLines: [...last.oldLines, ...chunk.oldLines],
            newLines: [...last.newLines, ...chunk.newLines]
          }
        } else {
          mergedChunks.push(chunk)
        }
      } else if (last.type === chunk.type && last.oldEnd === chunk.oldStart && last.newEnd === chunk.newStart) {
        // 合并相同类型的相邻块
        mergedChunks[mergedChunks.length - 1] = {
          ...last,
          oldEnd: chunk.oldEnd,
          newEnd: chunk.newEnd,
          oldLines: [...last.oldLines, ...chunk.oldLines],
          newLines: [...last.newLines, ...chunk.newLines]
        }
      } else {
        mergedChunks.push(chunk)
      }
    }
  }

  // 计算统计信息
  let insertions = 0
  let deletions = 0
  let replacements = 0

  for (const chunk of mergedChunks) {
    if (chunk.type === 'insert') {
      insertions += chunk.newLines.length
    } else if (chunk.type === 'delete') {
      deletions += chunk.oldLines.length
    } else if (chunk.type === 'replace') {
      replacements++
      insertions += chunk.newLines.length
      deletions += chunk.oldLines.length
    }
  }

  return {
    chunks: mergedChunks,
    summary: {
      totalChanges: mergedChunks.length,
      insertions,
      deletions,
      replacements
    },
    oldText,
    newText
  }
}

/**
 * Diff Tool回调函数
 */
const diffToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const text1 = params.text1 as string | undefined
  const text2 = params.text2 as string | undefined
  const source1 = (params.source1 as 'text' | 'file' | 'url') || 'text'
  const source2 = (params.source2 as 'text' | 'file' | 'url') || 'text'

  if (!text1 || !text2) {
    return {
      status: 'failed',
      error: createDetailedError(
        '缺少必需参数: text1 或 text2（要比较的两个文本/文件/URL）',
        [
          '{"text1": "第一段文本", "text2": "第二段文本"}',
          '{"text1": "/path/to/file1.md", "source1": "file", "text2": "/path/to/file2.md", "source2": "file"}',
          '{"text1": "https://example.com/doc1.md", "source1": "url", "text2": "https://example.com/doc2.md", "source2": "url"}'
        ],
        [
          '支持直接文本比较，也支持文件和URL比较',
          'source参数可选值："text"（文本，默认）、"file"（文件路径）、"url"（URL地址）',
          '可以混合使用：一个文本和一个文件，或一个URL和一个文本',
          '工具会自动检测文件类型并加载内容'
        ]
      )
    }
  }

  try {
    onUpdate({
      content: {
        stage: 'loading',
        source1,
        source2
      },
      format: 'json'
    }, {
      percentage: 10,
      message: i18n.global.t('agent.tool.diff.progress.loading', '正在加载文本...')
    })

    // 加载第一段文本
    let content1: string
    if (source1 === 'file') {
      content1 = await loadTextFromFile(text1, signal)
    } else if (source1 === 'url') {
      content1 = await loadTextFromUrl(text1, signal)
    } else {
      content1 = text1
    }

    onUpdate({
      content: {
        stage: 'loading',
        source1,
        source2,
        loaded1: true
      },
      format: 'json'
    }, {
      percentage: 40,
      message: i18n.global.t('agent.tool.diff.progress.loading2', '正在加载第二段文本...')
    })

    // 加载第二段文本
    let content2: string
    if (source2 === 'file') {
      content2 = await loadTextFromFile(text2, signal)
    } else if (source2 === 'url') {
      content2 = await loadTextFromUrl(text2, signal)
    } else {
      content2 = text2
    }

    if (signal?.aborted) {
      return {
        status: 'cancelled'
      }
    }

    onUpdate({
      content: {
        stage: 'computing',
        source1,
        source2
      },
      format: 'json'
    }, {
      percentage: 70,
      message: i18n.global.t('agent.tool.diff.progress.computing', '正在计算差异...')
    })

    // 计算差异
    const diffResult = computeDiff(content1, content2)

    onUpdate({
      content: {
        stage: 'completed',
        diffResult,
        source1,
        source2
      },
      format: 'json'
    }, {
      percentage: 100,
      message: i18n.global.t('agent.tool.diff.progress.completed', '差异计算完成')
    })

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          diffResult,
          source1,
          source2
        },
        format: 'json'
      },
      result: diffResult
    }
  } catch (error) {
    logger.error('Diff计算失败:', error)
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

const diffToolLocales: ToolLocales = {
  zh_cn: {
    name: '文本比对',
    description: '比对两段文本、URL或文件，返回详细的差异结果'
  },
  en_us: {
    name: 'Text Diff',
    description: 'Compare two texts, URLs or files and return detailed diff results'
  },
  de_DE: {
    name: 'Text-Vergleich',
    description: 'Vergleichen Sie zwei Texte, URLs oder Dateien und geben Sie detaillierte Diff-Ergebnisse zurück'
  },
  fr_FR: {
    name: 'Comparaison de texte',
    description: 'Comparer deux textes, URLs ou fichiers et retourner des résultats de diff détaillés'
  },
  ja_JP: {
    name: 'テキスト差分',
    description: '2つのテキスト、URL、またはファイルを比較し、詳細な差分結果を返す'
  },
  ko_KR: {
    name: '텍스트 비교',
    description: '두 텍스트, URL 또는 파일을 비교하고 상세한 diff 결과 반환'
  }
}

export const diffToolConfig: AgentToolConfig = {
  id: 'diff',
  name: diffToolLocales,
  description: diffToolLocales,
  origin: 'internal',
  instruction: `
# 文本比对工具

## 功能描述
比对两段文本、URL或本地文件，返回详细的差异结果。类似于Git diff和WinMerge的功能。

## 使用场景
- 比较文档的不同版本
- 检查代码变更
- 对比配置文件
- 分析文本差异

## 输入格式
\`\`\`json
{
  "text1": "string",        // 必需，第一段文本、文件路径或URL
  "text2": "string",        // 必需，第二段文本、文件路径或URL
  "source1": "text|file|url",  // 可选，text1的来源类型，默认"text"
  "source2": "text|file|url"  // 可选，text2的来源类型，默认"text"
}
\`\`\`

## 输出格式
\`\`\`json
{
  "chunks": [
    {
      "type": "equal|insert|delete|replace",
      "oldStart": 1,
      "oldEnd": 5,
      "newStart": 1,
      "newEnd": 6,
      "oldLines": ["line1", "line2"],
      "newLines": ["line1", "line2", "line3"]
    }
  ],
  "summary": {
    "totalChanges": 10,
    "insertions": 15,
    "deletions": 8,
    "replacements": 3
  },
  "oldText": "string",
  "newText": "string"
}
\`\`\`

## 注意事项
- 支持纯文本、文件路径和URL三种来源
- 文件路径必须是绝对路径或相对于项目根目录的路径
- URL会自动处理重定向和CORS问题
- 差异计算基于行级比较
- 差异类型包括：equal（相同）、insert（插入）、delete（删除）、replace（替换）
`,
  callback: diffToolCallback,
  displayComponent: DiffDisplay,
  tags: ['text', 'comparison', 'diff'],
  enabled: true,
  editable: false,
  locales: diffToolLocales,
  inputSchema: {
    type: 'object',
    properties: {
      text1: {
        type: 'string',
        description: '第一段文本、文件路径或URL'
      },
      text2: {
        type: 'string',
        description: '第二段文本、文件路径或URL'
      },
      source1: {
        type: 'string',
        enum: ['text', 'file', 'url'],
        description: 'text1的来源类型',
        default: 'text'
      },
      source2: {
        type: 'string',
        enum: ['text', 'file', 'url'],
        description: 'text2的来源类型',
        default: 'text'
      }
    },
    required: ['text1', 'text2']
  },
  outputSchema: {
    type: 'object',
    properties: {
      chunks: {
        type: 'array',
        description: '差异块列表'
      },
      summary: {
        type: 'object',
        description: '差异统计信息'
      },
      oldText: {
        type: 'string',
        description: '原始文本'
      },
      newText: {
        type: 'string',
        description: '新文本'
      }
    }
  }
}

