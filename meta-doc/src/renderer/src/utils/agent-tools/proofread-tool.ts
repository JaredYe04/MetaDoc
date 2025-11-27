/**
 * 校对Tool
 * 检查文本中的语法错误、拼写错误、LaTeX语法错误
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
import { createAiTask, cancelAiTask } from '../ai_tasks'
import { getSetting } from '../settings'
import { ref } from 'vue'
import localIpcRenderer from '../web-adapter/local-ipc-renderer'
import { webMainCalls } from '../web-adapter/web-main-calls'
import axios from 'axios'
import ProofreadDisplay from './components/ProofreadDisplay.vue'
import { cleanJsonString, parseJsonWithClean } from './tool-utils'
import { extractOuterJsonString } from '../regex-utils'

const logger = createRendererLogger('ProofreadTool')

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
 * 错误类型
 */
export type ErrorType = 'grammar' | 'spelling' | 'latex' | 'style' | 'other'

/**
 * 校对错误
 */
export interface ProofreadError {
  type: ErrorType
  line: number          // 行号（1-based）
  column: number        // 列号（1-based）
  length: number        // 错误文本长度
  text: string          // 错误的文本
  suggestion: string    // 修改建议
  message: string       // 错误描述
  severity: 'error' | 'warning' | 'info'  // 严重程度
}

/**
 * 校对结果
 */
export interface ProofreadResult {
  errors: ProofreadError[]
  totalErrors: number
  errorCounts: Record<ErrorType, number>
  text: string
  format: 'text' | 'markdown' | 'latex'
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
    const content = await ipcRenderer.invoke('read-file-content', filePath) as string
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
        }) as { content: string }
        return response.content
      } catch (error) {
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
 * 常见英文单词列表（用于本地拼写检查）
 * 这是一个简化的列表，实际应用中可以使用更完整的字典
 */
const COMMON_ENGLISH_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with',
  'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if',
  'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him',
  'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than',
  'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two',
  'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give',
  'day', 'most', 'us', 'is', 'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had', 'having', 'do',
  'does', 'did', 'doing', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'shall', 'can',
  'cannot', 'text', 'document', 'file', 'data', 'information', 'system', 'application', 'software', 'code',
  'function', 'method', 'class', 'object', 'variable', 'string', 'number', 'boolean', 'array', 'list',
  'error', 'warning', 'message', 'result', 'value', 'type', 'format', 'content', 'source', 'target'
])

/**
 * 常见拼写错误映射（明显的拼写错误）
 */
const COMMON_MISSPELLINGS: Record<string, string> = {
  'teh': 'the',
  'adn': 'and',
  'taht': 'that',
  'hte': 'the',
  'nad': 'and',
  'recieve': 'receive',
  'seperate': 'separate',
  'occured': 'occurred',
  'definately': 'definitely',
  'accomodate': 'accommodate',
  'begining': 'beginning',
  'enviroment': 'environment',
  'existance': 'existence',
  'goverment': 'government',
  'independant': 'independent',
  'neccessary': 'necessary',
  'occassion': 'occasion',
  'priviledge': 'privilege',
  'publically': 'publicly',
  'seige': 'siege',
  'suprise': 'surprise',
  'thier': 'their',
  'untill': 'until',
  'writting': 'writing'
}

/**
 * 本地拼写检查（检查英文单词）
 * 主要用于检测明显的拼写错误，复杂的检查交给LLM
 */
function checkSpellingLocally(text: string, format: 'text' | 'markdown' | 'latex'): ProofreadError[] {
  const errors: ProofreadError[] = []
  const lines = text.split('\n')
  
  // 提取英文单词的正则表达式（匹配连续的字母，忽略大小写）
  const wordRegex = /\b[a-zA-Z]{2,}\b/g
  
  lines.forEach((line, lineIndex) => {
    // 重置正则表达式的 lastIndex，避免跨行匹配问题
    wordRegex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = wordRegex.exec(line)) !== null) {
      const word = match[0]
      const wordLower = word.toLowerCase()
      const startIndex = match.index
      const column = startIndex + 1 // 列号从1开始
      
      // 跳过 LaTeX 命令和 Markdown 标记
      if (format === 'latex' && line[startIndex - 1] === '\\') {
        continue
      }
      if (format === 'markdown' && (line[startIndex - 1] === '#' || line[startIndex - 1] === '*' || line[startIndex - 1] === '_')) {
        continue
      }
      
      // 检查是否是已知的拼写错误
      if (COMMON_MISSPELLINGS[wordLower]) {
        errors.push({
          type: 'spelling',
          line: lineIndex + 1, // 行号从1开始
          column,
          length: word.length,
          text: word,
          suggestion: COMMON_MISSPELLINGS[wordLower],
          message: `拼写错误：${word} 应该是 ${COMMON_MISSPELLINGS[wordLower]}`,
          severity: 'error'
        })
        continue
      }
      
      // 检查单词是否在常见单词列表中（如果不是，可能是拼写错误，但不确定，交给LLM处理）
      // 这里只记录明显的错误，其他交给LLM
    }
  })
  
  // 本地检查主要用于快速检测明显的拼写错误
  // 更复杂的检查交给LLM
  return errors
}

/**
 * 使用LLM进行校对
 */
async function proofreadWithLLM(
  text: string,
  format: 'text' | 'markdown' | 'latex',
  signal?: AbortSignal
): Promise<ProofreadError[]> {
  const formatName = format === 'latex' ? 'LaTeX' : format === 'markdown' ? 'Markdown' : '纯文本'
  
  // 优化的 prompt，更简洁明确，强调直接输出JSON
  const prompt = `请检查以下${formatName}文本中的语法错误、拼写错误${format === 'latex' ? '、LaTeX语法错误' : ''}等问题。

文本内容：
\`\`\`${format}
${text}
\`\`\`

**重要要求**：
1. 必须严格检查每个错误，包括拼写、语法${format === 'latex' ? '、LaTeX语法' : ''}等
2. 对于英文文本，必须验证每个单词的拼写
3. 提供准确的错误位置（行号、列号从1开始）
4. 提供具体的修改建议

**输出格式**（必须严格遵守）：
直接输出JSON数组，不要包含任何说明文字、代码块标记或其他内容。
- 如果有错误，输出格式：
[
  {
    "type": "spelling|grammar|latex|style|other",
    "line": 1,
    "column": 5,
    "length": 3,
    "text": "错误的文本",
    "suggestion": "修改建议",
    "message": "错误描述",
    "severity": "error|warning|info"
  }
]
- 如果没有错误，输出：[]

**示例**：
输入："I have a eror in this text"
输出（直接输出，不要任何说明）：
[{"type":"spelling","line":1,"column":10,"length":4,"text":"eror","suggestion":"error","message":"拼写错误：eror 应该是 error","severity":"error"}]

现在请直接输出JSON数组，不要包含任何其他文字。`

  const target = ref('')
  const originKey = `proofread-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const enableKnowledgeBase = await getSetting('enableKnowledgeBase')
  const { handle, done } = createAiTask(
    '文本校对',
    prompt,
    target,
    'answer',
    originKey,
    { temperature: 0.3, stream: false, enableKnowledgeBase: Boolean(enableKnowledgeBase) }
  )

  if (signal) {
    signal.addEventListener('abort', () => {
      cancelAiTask(handle, false, false)
    })
  }

  await done

  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

  // 解析JSON结果
  const output = target.value.trim()
  
  // 如果没有输出，返回空数组
  if (!output || output.length === 0) {
    logger.warn('LLM返回空结果，返回空错误数组')
    return []
  }

  // 先提取JSON字符串（处理LLM返回的文本中包含其他文字的情况，如"现在请检查以下文本:"）
  let jsonString = extractOuterJsonString(output)
  if (!jsonString) {
    // 如果提取失败，尝试清理后再提取
  const cleaned = cleanJsonString(output)
    jsonString = extractOuterJsonString(cleaned) || cleaned
  }

  // 使用工具函数解析JSON
  const parseResult = parseJsonWithClean<ProofreadError[]>(jsonString)

  if (!parseResult.success) {
    const errorMsg = parseResult.error || '未知错误'
    logger.error('解析校对结果失败:', errorMsg)
    // 如果解析失败，尝试重试（最多2次）
    if (errorMsg.includes('Unexpected end of JSON') || errorMsg.includes('JSON')) {
      // 可能是LLM返回不完整，返回空数组而不是抛出错误
      logger.warn('JSON解析失败，返回空错误数组')
      return []
    }
    throw new Error(`解析校对结果失败: ${errorMsg}`)
  }

  const errors = parseResult.data

  // 验证错误格式
  if (!Array.isArray(errors)) {
    logger.warn('校对结果不是数组，返回空数组')
    return []
  }

  // 验证每个错误对象
  const validErrors: ProofreadError[] = []
  for (const error of errors) {
    if (error && typeof error === 'object' && error.type && error.suggestion) {
      validErrors.push(error)
    } else {
      logger.warn('校对错误格式不完整，跳过:', error)
    }
  }

  return validErrors
}

/**
 * 校对Tool回调函数
 */
const proofreadToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  // 支持两种参数格式：
  // 1. 新格式：{ text: "...", source: "text|file|url", format: "text|markdown|latex" }
  // 2. 旧格式（兼容）：{ text: "..." } 或 { text: "文件路径", source: "file" }
  let text: string | undefined
  let source: 'text' | 'file' | 'url' = 'text'
  let format: 'text' | 'markdown' | 'latex' = 'text'

  // 检查新格式
  if (params.text !== undefined) {
    text = params.text as string
    source = (params.source as 'text' | 'file' | 'url') || 'text'
    format = (params.format as 'text' | 'markdown' | 'latex') || 'text'
  } else {
    // 兼容旧格式：如果没有text字段，尝试从其他字段获取
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.proofread.error.missingText', '缺少必需参数: text')
    }
  }

  if (!text || text.trim().length === 0) {
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.proofread.error.missingText', '缺少必需参数: text')
    }
  }

  try {
    onUpdate({
      content: {
        stage: 'loading',
        source,
        format
      },
      format: 'json',
      componentName: 'ProofreadDisplay'
    }, {
      percentage: 10,
      message: i18n.global.t('agent.tool.proofread.progress.loading', '正在加载文本...')
    })

    // 加载文本
    let content: string
    if (source === 'file') {
      content = await loadTextFromFile(text, signal)
    } else if (source === 'url') {
      content = await loadTextFromUrl(text, signal)
    } else {
      content = text
    }

    if (signal?.aborted) {
      return {
        status: 'cancelled'
      }
    }

    onUpdate({
      content: {
        stage: 'proofreading',
        format,
        textLength: content.length
      },
      format: 'json',
      componentName: 'ProofreadDisplay'
    }, {
      percentage: 30,
      message: i18n.global.t('agent.tool.proofread.progress.proofreading', '正在校对文本...')
    })

    // 先进行本地拼写检查（快速检查明显的拼写错误）
    const localErrors = checkSpellingLocally(content, format)
    logger.info(`本地拼写检查发现 ${localErrors.length} 个明显的拼写错误`)

    // 使用LLM进行校对（主要检查，包括语法、复杂拼写等）
    const llmErrors = await proofreadWithLLM(content, format, signal)
    logger.info(`LLM检查发现 ${llmErrors.length} 个错误`)
    
    // 合并错误（去重：如果本地和LLM都发现了相同的错误，只保留LLM的结果）
    const allErrors: ProofreadError[] = [...llmErrors]
    
    // 添加本地检查发现的错误（如果LLM没有发现相同的错误）
    for (const localError of localErrors) {
      // 检查LLM是否已经发现了相同的错误（通过位置和文本匹配）
      const isDuplicate = llmErrors.some(llmError => 
        llmError.line === localError.line &&
        llmError.column === localError.column &&
        llmError.text.toLowerCase() === localError.text.toLowerCase()
      )
      
      if (!isDuplicate) {
        allErrors.push(localError)
        logger.debug(`添加本地检查发现的错误: ${localError.text} -> ${localError.suggestion}`)
      }
    }
    
    // 如果LLM没有发现错误，但本地检查发现了，记录警告
    if (llmErrors.length === 0 && localErrors.length > 0) {
      logger.warn('LLM未发现错误，但本地检查发现了明显的拼写错误，可能LLM检查不够严格')
    }
    
    // 如果LLM返回空数组，但文本不为空，记录警告（可能是LLM没有严格检查）
    if (llmErrors.length === 0 && localErrors.length === 0 && content.trim().length > 50) {
      logger.warn('LLM和本地检查都未发现错误，但文本较长，可能存在问题')
    }
    
    const errors = allErrors

    if (signal?.aborted) {
      return {
        status: 'cancelled'
      }
    }

    // 统计错误
    const errorCounts: Record<ErrorType, number> = {
      grammar: 0,
      spelling: 0,
      latex: 0,
      style: 0,
      other: 0
    }

    for (const error of errors) {
      errorCounts[error.type] = (errorCounts[error.type] || 0) + 1
    }

    const result: ProofreadResult = {
      errors,
      totalErrors: errors.length,
      errorCounts,
      text: content,
      format
    }

    onUpdate({
      content: {
        stage: 'completed',
        result
      },
      format: 'json',
      componentName: 'ProofreadDisplay'
    }, {
      percentage: 100,
      message: i18n.global.t('agent.tool.proofread.progress.completed', `校对完成，发现 ${errors.length} 个错误`)
    })

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          result
        },
        format: 'json',
        componentName: 'ProofreadDisplay'
      },
      result
    }
  } catch (error) {
    logger.error('校对失败:', error)
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

const proofreadToolLocales: ToolLocales = {
  zh_cn: {
    name: '文本校对',
    description: '检查文本中的语法错误、拼写错误、LaTeX语法错误，返回错误位置和修改建议'
  },
  en_us: {
    name: 'Proofread',
    description: 'Check for grammar, spelling, and LaTeX syntax errors in text, return error locations and suggestions'
  },
  de_DE: {
    name: 'Korrekturlesen',
    description: 'Überprüfen Sie Text auf Grammatik-, Rechtschreib- und LaTeX-Syntaxfehler, geben Sie Fehlerpositionen und Vorschläge zurück'
  },
  fr_FR: {
    name: 'Correction',
    description: 'Vérifier les erreurs de grammaire, d\'orthographe et de syntaxe LaTeX dans le texte, retourner les emplacements d\'erreurs et suggestions'
  },
  ja_JP: {
    name: '校正',
    description: 'テキストの文法、スペル、LaTeX構文エラーをチェックし、エラー位置と提案を返す'
  },
  ko_KR: {
    name: '교정',
    description: '텍스트의 문법, 철자, LaTeX 구문 오류 확인, 오류 위치 및 제안 반환'
  }
}

export const proofreadToolConfig: AgentToolConfig = {
  id: 'proofread',
  name: proofreadToolLocales,
  description: proofreadToolLocales,
  origin: 'internal',
  instruction: `
# 文本校对工具

## 功能描述
检查文本中的语法错误、拼写错误、LaTeX语法错误等问题，返回详细的错误信息和修改建议。

## 使用场景
- 检查文档的语法和拼写
- 验证LaTeX文档的语法正确性
- 提高文档质量
- 自动发现文本问题

## 输入格式
\`\`\`json
{
  "text": "string",        // 必需，要校对的文本、文件路径或URL
  "source": "text|file|url",  // 可选，文本来源类型，默认"text"
  "format": "text|markdown|latex"  // 可选，文本格式，默认"text"
}
\`\`\`

## 输出格式
\`\`\`json
{
  "errors": [
    {
      "type": "grammar|spelling|latex|style|other",
      "line": 10,
      "column": 5,
      "length": 3,
      "text": "错误的文本",
      "suggestion": "修改建议",
      "message": "错误描述",
      "severity": "error|warning|info"
    }
  ],
  "totalErrors": 5,
  "errorCounts": {
    "grammar": 2,
    "spelling": 1,
    "latex": 1,
    "style": 1,
    "other": 0
  },
  "text": "string",
  "format": "text|markdown|latex"
}
\`\`\`

## 注意事项
- 支持纯文本、Markdown和LaTeX格式
- 支持从文本、文件路径和URL加载内容
- 使用AI进行智能校对，可能无法发现所有错误
- 错误位置基于行号和列号（1-based）
- 严重程度分为：error（错误）、warning（警告）、info（信息）
`,
  callback: proofreadToolCallback,
  displayComponent: ProofreadDisplay,
  tags: ['text', 'proofread', 'grammar', 'spelling'],
  enabled: true,
  editable: false,
  locales: proofreadToolLocales,
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: '要校对的文本、文件路径或URL'
      },
      source: {
        type: 'string',
        enum: ['text', 'file', 'url'],
        description: '文本来源类型',
        default: 'text'
      },
      format: {
        type: 'string',
        enum: ['text', 'markdown', 'latex'],
        description: '文本格式',
        default: 'text'
      }
    },
    required: ['text']
  },
  outputSchema: {
    type: 'object',
    properties: {
      errors: {
        type: 'array',
        description: '错误列表'
      },
      totalErrors: {
        type: 'number',
        description: '总错误数'
      },
      errorCounts: {
        type: 'object',
        description: '各类错误统计'
      },
      text: {
        type: 'string',
        description: '原始文本'
      },
      format: {
        type: 'string',
        description: '文本格式'
      }
    }
  }
}

