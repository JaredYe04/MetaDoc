/**
 * 图表生成Tool
 * 根据提示词生成各种类型的图表（Mermaid、ECharts、PlantUML、flowchart、graphviz等）
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress
} from '../../types/agent-tool'
import type { AIDialogMessage } from '@/types'
import {
  renderChartViaVditor,
  renderEChartsViaIpc,
  renderPlantUMLViaIpc,
  renderMermaidViaApi,
  CHART_TYPES
} from '../chart-pre-renderer'
import { getLocalVditorCDN, vditorCDN } from '../vditor-cdn'
import { isElectronEnv } from '../event-bus'
import { createAiTask } from '../ai_tasks'
import { cancelAiTask } from '../ai_tasks'
import { ref, type Ref } from 'vue'
import ChartGenerationDisplay from './components/ChartGenerationDisplay.vue'
import { createRendererLogger } from '../logger'
import { getPromptByKey } from '../prompts'
import { getRuntimeServerBaseUrlSync } from '../../config/runtime-server'
import { extractOuterJsonString } from '../regex-utils'
import { retryLLMCall } from './tool-utils'
import messageBridge from '../../bridge/message-bridge'

const logger = createRendererLogger('ChartGenerationTool')

/** 获取工作区根目录列表（与 edit-tool 一致，用于解析相对路径） */
function getWorkspaceRoots(): string[] {
  try {
    const saved = localStorage.getItem('workspaceFolders')
    if (!saved) return []
    const arr = JSON.parse(saved)
    return Array.isArray(arr)
      ? arr.filter((p: unknown) => typeof p === 'string' && (p as string).length > 0)
      : []
  } catch {
    return []
  }
}

/** 将可能为工作区相对路径的路径解析为绝对路径；已是绝对路径则原样返回 */
function resolveSavePath(pathInput: string): string {
  const normalized = pathInput.replace(/\\/g, '/').trim()
  if (!normalized) return normalized
  if (normalized.startsWith('/') || /^[A-Za-z]:[/\\]/.test(normalized)) {
    return normalized
  }
  const roots = getWorkspaceRoots()
  const root = roots[0]
  if (!root) return normalized
  const base = root.replace(/\\/g, '/').replace(/\/$/, '')
  return `${base}/${normalized}`
}

/** 根据 format 得到文件扩展名 */
function getExtensionForFormat(format: 'svg' | 'png' | 'pdf'): string {
  return format === 'pdf' ? 'pdf' : format
}

/** 确保路径有扩展名；若无则按 format 补全 */
function ensureExtension(filePath: string, format: 'svg' | 'png' | 'pdf'): string {
  const ext = getExtensionForFormat(format)
  if (filePath.endsWith(`.${ext}`)) return filePath
  if (/\.(svg|png|pdf)$/i.test(filePath)) return filePath
  return `${filePath.replace(/[/\\]+$/, '')}.${ext}`
}

// 图表类型映射
const CHART_TYPE_MAP: Record<string, string> = {
  mermaid: 'mermaid',
  echarts: 'echarts',
  plantuml: 'plantuml',
  flowchart: 'flowchart',
  graphviz: 'graphviz'
}

/**
 * 提取 Mermaid 代码块内容
 * 从可能包含其他文本的字符串中提取纯 Mermaid 代码
 * 移除中文说明文字和其他无关内容
 */
function extractMermaidCode(text: string): string {
  if (!text || !text.trim()) {
    return text
  }

  // 首先尝试提取 ```mermaid 代码块
  const mermaidBlockRegex = /```mermaid\s*\n([\s\S]*?)```/i
  const blockMatch = text.match(mermaidBlockRegex)
  if (blockMatch && blockMatch[1]) {
    return blockMatch[1].trim()
  }

  // 如果没有代码块标记，查找 Mermaid 图表类型关键字
  // 支持的 Mermaid 图表类型
  const mermaidTypes = [
    'graph',
    'flowchart',
    'sequenceDiagram',
    'classDiagram',
    'stateDiagram',
    'erDiagram',
    'gantt',
    'pie',
    'gitgraph',
    'journey',
    'mindmap',
    'timeline',
    'zenuml',
    'sankey',
    'block',
    'packet',
    'kanban',
    'architecture',
    'radar',
    'treemap',
    'quadrantChart',
    'requirement',
    'c4Context',
    'c4Container',
    'c4Component',
    'userJourney'
  ]

  // 查找第一个匹配的图表类型
  let bestMatch: { type: string; index: number } | null = null
  for (const type of mermaidTypes) {
    // 匹配图表类型关键字（不区分大小写）
    const typeRegex = new RegExp(`\\b${type}\\b`, 'i')
    const match = text.match(typeRegex)
    if (match && match.index !== undefined) {
      if (!bestMatch || match.index < bestMatch.index) {
        bestMatch = { type, index: match.index }
      }
    }
  }

  if (bestMatch) {
    const startIndex = bestMatch.index
    // 从匹配位置开始提取
    let extracted = text.substring(startIndex)

    // 提取代码部分：从图表类型开始，到遇到明显的非代码内容为止
    const lines = extracted.split('\n')
    const codeLines: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmedLine = line.trim()

      // 如果遇到空行，继续（可能是代码中的空行）
      if (!trimmedLine) {
        if (codeLines.length > 0) {
          codeLines.push(line)
        }
        continue
      }

      // 检查是否是明显的说明文字（包含大量中文字符且不是注释）
      const chineseCharCount = (line.match(/[\u4e00-\u9fa5]/g) || []).length
      const totalCharCount = line.length
      const chineseRatio = totalCharCount > 0 ? chineseCharCount / totalCharCount : 0

      // 如果是注释行（以 %% 开头），保留
      if (trimmedLine.startsWith('%%')) {
        codeLines.push(line)
        continue
      }

      // 如果一行中中文字符占比超过 50%，且不包含代码结构特征，可能是说明文字
      const hasCodeStructure = /[|[\]{}()<>:-]/.test(line)
      if (chineseRatio > 0.5 && !hasCodeStructure) {
        // 如果已经有代码内容，停止提取
        if (codeLines.length > 0) {
          break
        }
        // 如果还没有代码内容，跳过这一行
        continue
      }

      // 检查是否包含 Mermaid 语法特征
      const hasMermaidSyntax =
        hasCodeStructure ||
        trimmedLine.match(
          /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitgraph|journey|mindmap|timeline|zenuml|sankey|block|packet|kanban|architecture|radar|treemap)/i
        )

      if (hasMermaidSyntax || codeLines.length > 0) {
        codeLines.push(line)
      }
    }

    if (codeLines.length > 0) {
      return codeLines.join('\n').trim()
    }
  }

  // 如果都找不到，尝试移除明显的中文说明，保留可能的代码部分
  // 策略：查找第一个 Mermaid 图表类型关键字，移除之前的所有内容
  let cleaned = text

  // 查找第一个图表类型关键字的位置
  let firstTypeIndex = -1
  for (const type of mermaidTypes) {
    const typeRegex = new RegExp(`\\b${type}\\b`, 'i')
    const match = cleaned.match(typeRegex)
    if (match && match.index !== undefined) {
      if (firstTypeIndex === -1 || match.index < firstTypeIndex) {
        firstTypeIndex = match.index
      }
    }
  }

  // 如果找到了图表类型，移除之前的所有内容
  if (firstTypeIndex > 0) {
    cleaned = cleaned.substring(firstTypeIndex)
  } else {
    // 如果没有找到，尝试移除开头的中文段落（通常以句号、问号、感叹号结尾）
    cleaned = cleaned.replace(/^[\s\S]*?[。！？]\s*/g, '')
  }

  // 移除结尾的中文段落（如果存在）
  // 查找最后一个可能的代码结束位置（通常是空行后跟中文）
  const lines = cleaned.split('\n')
  const codeLines: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmedLine = line.trim()

    // 如果遇到空行，检查后续是否有大量中文
    if (!trimmedLine) {
      // 检查后续几行是否主要是中文
      let hasChineseAfter = false
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const nextLine = lines[j]
        const chineseCount = (nextLine.match(/[\u4e00-\u9fa5]/g) || []).length
        const totalCount = nextLine.length
        if (totalCount > 0 && chineseCount / totalCount > 0.7) {
          hasChineseAfter = true
          break
        }
      }
      if (hasChineseAfter && codeLines.length > 0) {
        // 如果后续主要是中文，停止提取
        break
      }
      codeLines.push(line)
      continue
    }

    // 检查是否是中文说明（中文字符占比高且不包含代码特征）
    const chineseCount = (line.match(/[\u4e00-\u9fa5]/g) || []).length
    const totalCount = line.length
    const chineseRatio = totalCount > 0 ? chineseCount / totalCount : 0

    if (chineseRatio > 0.7 && !line.match(/[|{}()[\]<>:-]/) && codeLines.length > 0) {
      // 如果主要是中文且不包含代码特征，且已有代码内容，停止提取
      break
    }

    codeLines.push(line)
  }

  if (codeLines.length > 0) {
    cleaned = codeLines.join('\n').trim()
  }

  // 如果清理后还有内容，返回清理后的内容
  if (cleaned.trim().length > 0) {
    return cleaned.trim()
  }

  // 最后返回原始文本
  return text.trim()
}

/**
 * 提取 PlantUML 代码块内容
 * 从可能包含其他文本的字符串中提取纯 PlantUML 代码
 * 移除中文说明文字和其他无关内容
 */
function extractPlantUMLCode(text: string): string {
  if (!text || !text.trim()) {
    return text
  }

  // 首先尝试提取 ```plantuml 代码块
  const plantumlBlockRegex = /```plantuml\s*\n([\s\S]*?)```/i
  const blockMatch = text.match(plantumlBlockRegex)
  if (blockMatch && blockMatch[1]) {
    return blockMatch[1].trim()
  }

  // 查找 @startuml 或 @start 标记
  const startPattern = /@start(uml)?/i
  const startMatch = text.match(startPattern)

  if (startMatch && startMatch.index !== undefined) {
    const startIndex = startMatch.index
    // 从 @start 开始提取
    let extracted = text.substring(startIndex)

    // 查找 @enduml 或 @end 标记
    const endPattern = /@end(uml)?/i
    const endMatch = extracted.match(endPattern)

    if (endMatch && endMatch.index !== undefined) {
      // 提取从 @start 到 @end 之间的内容（包含 @end）
      const endIndex = endMatch.index + endMatch[0].length
      extracted = extracted.substring(0, endIndex)
      return extracted.trim()
    } else {
      // 如果没有找到 @end，提取到文本末尾
      return extracted.trim()
    }
  }

  // 如果都找不到，尝试移除明显的中文说明
  // 查找第一个可能的 PlantUML 关键字
  const plantumlKeywords = [
    '@startuml',
    '@start',
    'class ',
    'interface ',
    'package ',
    'namespace ',
    'actor ',
    'usecase ',
    'component ',
    'state ',
    'note '
  ]

  let firstKeywordIndex = -1
  for (const keyword of plantumlKeywords) {
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
    const match = text.match(regex)
    if (match && match.index !== undefined) {
      if (firstKeywordIndex === -1 || match.index < firstKeywordIndex) {
        firstKeywordIndex = match.index
      }
    }
  }

  if (firstKeywordIndex > 0) {
    // 移除之前的所有内容
    let cleaned = text.substring(firstKeywordIndex)

    // 查找 @enduml 或 @end
    const endPattern = /@end(uml)?/i
    const endMatch = cleaned.match(endPattern)
    if (endMatch && endMatch.index !== undefined) {
      const endIndex = endMatch.index + endMatch[0].length
      cleaned = cleaned.substring(0, endIndex)
    }

    return cleaned.trim()
  }

  // 最后尝试移除开头的中文段落
  let cleaned = text.replace(/^[\s\S]*?[。！？]\s*/g, '')
  cleaned = cleaned.replace(/[\s\S]*?[。！？]\s*$/g, '')

  return cleaned.trim()
}

/**
 * 提取通用图表代码（flowchart, graphviz 等）
 * 从可能包含其他文本的字符串中提取纯代码
 * 移除中文说明文字和其他无关内容
 */
function extractGenericChartCode(text: string, chartType: string): string {
  if (!text || !text.trim()) {
    return text
  }

  // 首先尝试提取代码块
  const codeBlockRegex = new RegExp(`\`\`\`${chartType}\\s*\\n([\\s\\S]*?)\`\`\``, 'i')
  const blockMatch = text.match(codeBlockRegex)
  if (blockMatch && blockMatch[1]) {
    return blockMatch[1].trim()
  }

  // 根据图表类型查找特征关键字
  let keywords: string[] = []

  if (chartType === 'flowchart') {
    // Flowchart 通常以 st=>start, op=>operation, cond=>condition 等开头
    keywords = ['st=>', 'op=>', 'cond=>', 'e=>', 'start', 'operation', 'condition', 'end']
  } else if (chartType === 'graphviz') {
    // Graphviz (dot) 通常以 digraph, graph 开头
    keywords = ['digraph', 'graph', 'node', 'edge', 'subgraph']
  }

  // 查找第一个匹配的关键字
  let firstKeywordIndex = -1
  for (const keyword of keywords) {
    // 对于包含特殊字符的关键字，需要转义
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escapedKeyword, 'i')
    const match = text.match(regex)
    if (match && match.index !== undefined) {
      if (firstKeywordIndex === -1 || match.index < firstKeywordIndex) {
        firstKeywordIndex = match.index
      }
    }
  }

  if (firstKeywordIndex > 0) {
    // 移除之前的所有内容
    let cleaned = text.substring(firstKeywordIndex)

    // 对于 flowchart 和 graphviz，提取到遇到大量中文说明为止
    if (chartType === 'flowchart' || chartType === 'graphviz') {
      const lines = cleaned.split('\n')
      const codeLines: string[] = []

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmedLine = line.trim()

        // 如果遇到空行，继续（可能是代码中的空行）
        if (!trimmedLine) {
          if (codeLines.length > 0) {
            codeLines.push(line)
          }
          continue
        }

        // 检查是否是明显的说明文字（包含大量中文字符且不包含代码特征）
        const chineseCharCount = (line.match(/[\u4e00-\u9fa5]/g) || []).length
        const totalCharCount = line.length
        const chineseRatio = totalCharCount > 0 ? chineseCharCount / totalCharCount : 0

        // 检查是否包含代码特征（箭头、等号、括号等）
        const hasCodeStructure =
          /[=>{}()[\]]/.test(line) ||
          trimmedLine.match(/^(st|op|cond|e|start|end|digraph|graph|node|edge|subgraph)/i)

        if (chineseRatio > 0.5 && !hasCodeStructure) {
          // 如果已经有代码内容，停止提取
          if (codeLines.length > 0) {
            break
          }
          // 如果还没有代码内容，跳过这一行
          continue
        }

        codeLines.push(line)
      }

      if (codeLines.length > 0) {
        return codeLines.join('\n').trim()
      }
    }

    return cleaned.trim()
  }

  // 如果都找不到，尝试移除开头的中文段落
  let cleaned = text.replace(/^[\s\S]*?[。！？]\s*/g, '')
  cleaned = cleaned.replace(/[\s\S]*?[。！？]\s*$/g, '')

  return cleaned.trim()
}

/**
 * 清理ECharts代码，处理各种格式问题
 * 提取纯 JSON 代码，去除中文说明文字和其他无关内容
 */
function cleanEChartsCode(code: string): string {
  let cleaned = code.trim()

  // 移除markdown代码块标记
  cleaned = cleaned
    .replace(/```[\w]*\n?/g, '')
    .replace(/```$/g, '')
    .trim()

  // 移除可能的变量声明
  cleaned = cleaned.replace(/^(const|let|var)\s+\w+\s*=\s*/, '')

  // 移除末尾的分号
  cleaned = cleaned.replace(/;?\s*$/, '')

  // 移除单行注释（// ...），保留空行以维持JSON结构
  cleaned = cleaned
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')

  // 移除多行注释（/* ... */）
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '')

  // 替换中文标点为英文标点（JSON要求英文标点）
  cleaned = cleaned
    .replace(/，/g, ',') // 中文逗号 -> 英文逗号
    .replace(/：/g, ':') // 中文冒号 -> 英文冒号
    .replace(/；/g, ';') // 中文分号 -> 英文分号
    .replace(/"/g, '"') // 中文引号 -> 英文引号
    .replace(/"/g, '"') // 中文引号 -> 英文引号
    .replace(/'/g, "'") // 中文单引号 -> 英文单引号
    .replace(/'/g, "'") // 中文单引号 -> 英文单引号

  // 使用 extractOuterJsonString 提取最外层的 JSON 对象/数组
  // 这样可以去除 JSON 之前和之后的中文说明文字
  const extractedJson = extractOuterJsonString(cleaned)
  if (extractedJson) {
    cleaned = extractedJson
  } else {
    // 如果提取失败，尝试查找第一个 { 或 [，移除之前的所有内容
    const jsonStartIndex = cleaned.search(/[{[]/)
    if (jsonStartIndex > 0) {
      cleaned = cleaned.substring(jsonStartIndex)
      // 查找最后一个 } 或 ]，移除之后的所有内容
      let depth = 0
      let jsonEndIndex = -1
      const openChar = cleaned[0]
      const closeChar = openChar === '{' ? '}' : ']'

      for (let i = 0; i < cleaned.length; i++) {
        if (cleaned[i] === openChar) {
          depth++
        } else if (cleaned[i] === closeChar) {
          depth--
          if (depth === 0) {
            jsonEndIndex = i + 1
            break
          }
        }
      }

      if (jsonEndIndex > 0) {
        cleaned = cleaned.substring(0, jsonEndIndex)
      }
    }
  }

  // 移除多余的空白字符（但保留换行，因为JSON可能需要格式化）
  // 只压缩连续的空白字符为单个空格，但保留换行
  cleaned = cleaned.replace(/[ \t]+/g, ' ').trim()

  return cleaned
}

/**
 * 验证图表代码语法（用于所有图表类型）
 */
async function validateChartSyntax(
  chartCode: string,
  chartType: string
): Promise<{ valid: boolean; error?: string }> {
  const normalizedType = chartType.toLowerCase()

  try {
    const trimmedCode = chartCode.trim()
    if (!trimmedCode) {
      return { valid: false, error: '图表代码为空' }
    }

    if (normalizedType === 'mermaid') {
      // Mermaid语法验证：使用官方 API
      try {
        // 动态导入 mermaid（避免在非 Mermaid 场景下加载）
        const mermaid = (await import('mermaid')).default

        // 初始化 Mermaid
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose'
        })

        // 使用 mermaid.parse 验证语法
        const parseResult = await mermaid.parse(trimmedCode, { suppressErrors: false })
        if (!parseResult || !parseResult.diagramType) {
          return { valid: false, error: 'Mermaid 语法验证失败：无法识别图表类型' }
        }

        return { valid: true }
      } catch (parseError) {
        const errorMsg = parseError instanceof Error ? parseError.message : String(parseError)
        return { valid: false, error: `Mermaid 语法错误: ${errorMsg}` }
      }
    } else if (normalizedType === 'echarts') {
      // ECharts语法验证：尝试解析JSON
      try {
        const cleaned = cleanEChartsCode(trimmedCode)
        // 先提取JSON字符串（处理LLM返回的文本中包含其他文字的情况）
        let jsonString = extractOuterJsonString(cleaned) || cleaned
        // 先尝试JSON解析
        try {
          JSON.parse(jsonString)
          return { valid: true }
        } catch {
          // 如果JSON解析失败，尝试Function解析（可能包含函数）
          try {
            new Function('return ' + jsonString)()
            return { valid: true }
          } catch (funcError) {
            return {
              valid: false,
              error: `ECharts配置格式错误: ${funcError instanceof Error ? funcError.message : String(funcError)}`
            }
          }
        }
      } catch (error) {
        return { valid: false, error: error instanceof Error ? error.message : String(error) }
      }
    } else if (normalizedType === 'plantuml') {
      // PlantUML基本验证
      if (
        !trimmedCode.toLowerCase().includes('@start') &&
        !trimmedCode.toLowerCase().includes('@enduml')
      ) {
        return { valid: false, error: 'PlantUML代码缺少@start或@enduml标记' }
      }
      return { valid: true }
    } else if (normalizedType === 'flowchart' || normalizedType === 'graphviz') {
      // Flowchart和Graphviz基本验证
      if (trimmedCode.length < 10) {
        return { valid: false, error: '代码过短，可能不完整' }
      }
      return { valid: true }
    }

    // 其他类型暂不验证
    return { valid: true }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 调用LLM生成图表代码
 * 使用createAiTask创建AI任务，与其他地方保持一致
 * 支持错误重试机制
 */
async function generateChartCodeWithLLM(
  prompt: string,
  chartType: string,
  target: Ref<string>,
  signal?: AbortSignal,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void,
  retryCount: number = 0,
  maxRetries: number = 3,
  lastError?: string
): Promise<string> {
  const normalizedType = chartType.toLowerCase()
  const isECharts = normalizedType === 'echarts'
  const isMermaid = normalizedType === 'mermaid'
  const isPlantUML = normalizedType === 'plantuml'
  const rulesKey = isECharts
    ? 'tools.chartGeneration.rules.echarts'
    : isMermaid
      ? 'tools.chartGeneration.rules.mermaid'
      : isPlantUML
        ? 'tools.chartGeneration.rules.plantuml'
        : 'tools.chartGeneration.rules.default'
  const chartTypeRules = getPromptByKey(rulesKey)
  const retryBlock =
    retryCount > 0 && lastError
      ? getPromptByKey('tools.chartGeneration.retry', { lastError, chartType })
      : ''
  const systemPrompt = getPromptByKey('tools.chartGeneration.systemPrompt', {
    chartType,
    chartTypeRules,
    retryBlock,
    prompt
  })

  // 使用createAiTask创建AI任务，设置stream: true使用流式模式
  const originKey = `chart-generation-${Date.now()}-${Math.random().toString(36).slice(2)}`
  // 温度配置将在llm-api.js中从全局配置读取
  const messages: AIDialogMessage[] = [
    {
      role: 'user',
      content: systemPrompt
    }
  ]
  const { handle, done } = createAiTask('生成图表代码', messages, target, 'chat', originKey, {
    stream: true
  })

  // 立即通过 onUpdate 传递流式输出信息（在 await done 之前）
  if (onUpdate) {
    onUpdate(
      {
        content: {
          stage: 'generating-code-streaming',
          codeTargetRef: target,
          codeDonePromise: done
        },
        format: 'json'
      },
      {
        percentage: 30,
        message: '正在生成图表代码（流式输出）...'
      }
    )
  }

  // 如果提供了signal，监听取消事件
  if (signal) {
    signal.addEventListener('abort', () => {
      cancelAiTask(handle, false)
    })
  }

  try {
    // 等待任务完成
    await done

    // 检查结果是否为空
    if (!target.value || target.value.trim() === '') {
      throw new Error('LLM返回结果为空，请检查LLM API是否已启用并正确配置')
    }

    let code = target.value.trim()

    // 对于 Mermaid，使用专门的提取函数去除中文说明文字
    if (isMermaid) {
      code = extractMermaidCode(code)
    } else {
      // 清理代码（移除可能的markdown代码块标记）
      code = code
        .replace(/```[\w]*\n?/g, '')
        .replace(/```$/g, '')
        .trim()

      // 对于ECharts，进行额外的清理
      if (isECharts) {
        code = cleanEChartsCode(code)
      }
    }

    // 验证语法（所有图表类型都验证，支持重试）
    if (retryCount < maxRetries) {
      const validation = await validateChartSyntax(code, chartType)
      if (!validation.valid) {
        logger.warn(
          `图表代码语法验证失败 (尝试 ${retryCount + 1}/${maxRetries}):`,
          validation.error
        )
        // 递归重试，传递错误信息
        return await generateChartCodeWithLLM(
          prompt,
          chartType,
          target,
          signal,
          onUpdate,
          retryCount + 1,
          maxRetries,
          validation.error
        )
      }
    }

    return code
  } catch (error) {
    // 如果LLM调用失败，抛出更详细的错误信息
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('LLM生成图表代码失败:', error)

    // 检查是否是配置问题
    if (errorMessage.includes('未启用') || errorMessage.includes('NOT_ENABLED')) {
      throw new Error('LLM API未启用，请在设置中启用LLM功能')
    }
    if (errorMessage.includes('未配置') || errorMessage.includes('INVALID_CONFIG')) {
      throw new Error('LLM配置不正确，请检查设置中的API配置')
    }
    if (
      errorMessage.includes('网络') ||
      errorMessage.includes('network') ||
      errorMessage.includes('fetch')
    ) {
      throw new Error(`网络连接失败，请检查网络连接和API URL配置。错误详情: ${errorMessage}`)
    }

    throw new Error(`LLM调用失败: ${errorMessage}`)
  }
}

/**
 * 将URL转换为本地文件路径
 * 参考md-utils.js中的image2local函数
 */
async function getLocalPathFromUrl(url: string): Promise<string> {
  // URL格式: 运行时服务器 /images/filename
  // 需要获取实际的本地路径
  try {
    const { getImagePath } = await import('../settings')
    const localImagePath = await getImagePath()

    const imagesPrefix = getRuntimeServerBaseUrlSync() + '/images/'
    let imageName = ''
    if (url.startsWith(imagesPrefix)) {
      imageName = url.slice(imagesPrefix.length)
    } else {
      // 其他格式，尝试提取文件名
      imageName = url.split(/[/\\]/).pop() || url
    }

    // 拼接本地路径
    const localPath = `${localImagePath}/${imageName}`
    return localPath
  } catch (error) {
    logger.warn('获取本地路径失败，返回URL:', error)
    return url
  }
}

/**
 * 将SVG转换为PDF（用于LaTeX导出）
 * 使用统一的 SVG 转 PDF 工具函数
 */
async function convertSvgToPdf(svgUrl: string, outputPath: string): Promise<string> {
  const { convertSvgToPdf: convertSvgToPdfUtil } = await import('../svg-to-pdf-utils.js')
  // 使用统一的工具函数，返回 HTTP URL
  return await convertSvgToPdfUtil(svgUrl, { returnUrl: true })
}

/**
 * 图表生成Tool回调函数
 */
const chartGenerationCallback: ToolCallback = async (params, signal, onUpdate) => {
  const prompt = params.prompt as string
  const chartCode = params.code as string
  const chartType = (params.chartType as string) || 'mermaid'
  const format = (params.format as 'svg' | 'png' | 'pdf') || 'svg'
  const chartName = (params.chartName as string) || `chart_${Date.now()}`
  const savePath = params.savePath as string | undefined

  // 如果提供了 code 参数，则 prompt 不是必需的；否则 prompt 是必需的
  if (!chartCode && (!prompt || typeof prompt !== 'string')) {
    return {
      status: 'failed',
      error: '缺少必需参数: 必须提供 prompt 或 code 参数之一'
    }
  }

  // 验证图表类型
  const normalizedChartType = chartType.toLowerCase()
  if (!CHART_TYPE_MAP[normalizedChartType]) {
    return {
      status: 'failed',
      error: `不支持的图表类型: ${chartType}。支持的类型: ${Object.keys(CHART_TYPE_MAP).join(', ')}`
    }
  }

  try {
    // 步骤1: 生成图表代码
    onUpdate(
      {
        content: {
          stage: 'generating',
          prompt,
          chartType: normalizedChartType,
          format
        },
        format: 'json'
      },
      {
        percentage: 10,
        message: '正在生成图表代码...'
      }
    )

    // 如果提供了代码，直接使用；否则调用LLM生成
    let finalChartCode = chartCode
    if (!finalChartCode) {
      try {
        const codeTarget = ref('')
        // 使用retryLLMCall包装，处理返回空的情况
        finalChartCode = await retryLLMCall(
          () => generateChartCodeWithLLM(prompt, normalizedChartType, codeTarget, signal, onUpdate),
          {
            maxRetries: 3,
            retryDelay: 3000,
            onRetry: (attempt, error) => {
              logger.warn(`[chart-generation] LLM返回空，正在重试 (${attempt}/3)...`, error)
            }
          }
        )
      } catch (error) {
        // LLM调用失败，返回更友好的错误信息
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('LLM生成图表代码失败:', error)

        // 检查是否是网络错误
        if (
          errorMessage.includes('网络') ||
          errorMessage.includes('network') ||
          errorMessage.includes('fetch')
        ) {
          return {
            status: 'failed',
            error: `LLM调用失败: 请检查LLM API配置是否正确，以及网络连接是否正常。错误详情: ${errorMessage}`
          }
        }

        return {
          status: 'failed',
          error: `LLM生成图表代码失败: ${errorMessage}`
        }
      }
    }

    if (!finalChartCode) {
      return {
        status: 'failed',
        error: '无法生成图表代码'
      }
    }

    // 提取并清理代码，确保返回的 chartCode 是可直接渲染的代码
    // 对于 Mermaid，使用专门的提取函数去除中文说明文字
    if (normalizedChartType === 'mermaid') {
      finalChartCode = extractMermaidCode(finalChartCode)
    } else if (normalizedChartType === 'plantuml') {
      // 对于 PlantUML，使用专门的提取函数去除中文说明文字
      finalChartCode = extractPlantUMLCode(finalChartCode)
    } else if (normalizedChartType === 'echarts') {
      // 对于 ECharts，清理代码
      finalChartCode = cleanEChartsCode(finalChartCode)
    } else if (normalizedChartType === 'flowchart' || normalizedChartType === 'graphviz') {
      // 对于其他图表类型，使用通用提取函数去除中文说明文字
      finalChartCode = extractGenericChartCode(finalChartCode, normalizedChartType)
    } else {
      // 其他未知类型，移除 markdown 代码块标记和中文说明
      finalChartCode = finalChartCode
        .replace(/```[\w]*\n?/g, '')
        .replace(/```$/g, '')
        .trim()

      // 尝试移除开头的中文段落
      finalChartCode = finalChartCode.replace(/^[\s\S]*?[。！？]\s*/g, '')
      // 尝试移除结尾的中文段落
      finalChartCode = finalChartCode.replace(/[\s\S]*?[。！？]\s*$/g, '')
      finalChartCode = finalChartCode.trim()
    }

    onUpdate(
      {
        content: {
          stage: 'rendering',
          chartCode: finalChartCode,
          chartType: normalizedChartType,
          format
        },
        format: 'json'
      },
      {
        percentage: 40,
        message: '正在渲染图表...'
      }
    )

    // 步骤2: 渲染图表
    let imageUrl: string
    const cdn = isElectronEnv() ? getLocalVditorCDN() : vditorCDN
    const targetFormat = format === 'pdf' ? 'svg' : format // PDF先渲染为SVG

    if (normalizedChartType === 'echarts') {
      // ECharts使用IPC渲染
      // 处理包含函数的JSON（LLM可能生成包含function的代码）
      let optionJson: any
      let parseError: Error | null = null

      // 先清理代码
      let cleanedCode = cleanEChartsCode(finalChartCode)

      // 先提取JSON字符串（处理LLM返回的文本中包含其他文字的情况）
      let jsonString = extractOuterJsonString(cleanedCode) || cleanedCode

      try {
        // 先尝试标准JSON解析
        optionJson = JSON.parse(jsonString)
      } catch (jsonError) {
        parseError = jsonError instanceof Error ? jsonError : new Error(String(jsonError))
        // 如果JSON解析失败，尝试使用Function解析（可能包含函数）
        try {
          // 进一步清理：移除可能的变量声明
          let funcCode = jsonString.replace(/^(const|let|var)\s+\w+\s*=\s*/, '')
          funcCode = funcCode.replace(/;?\s*$/, '')

          // 使用Function构造器安全地解析（避免直接eval）
          optionJson = new Function('return ' + funcCode)()
        } catch (evalError) {
          // 如果都失败了，检查是否需要重试
          const evalErrorMsg = evalError instanceof Error ? evalError.message : String(evalError)
          logger.error('ECharts代码解析失败:', {
            jsonError: parseError.message,
            evalError: evalErrorMsg,
            code: cleanedCode.substring(0, 200)
          })

          // 如果还没有重试过，尝试重新生成
          if (!params._retryAttempted) {
            logger.info('ECharts解析失败，尝试重新生成代码...')
            const codeTarget = ref('')
            const retryCode = await generateChartCodeWithLLM(
              prompt,
              normalizedChartType,
              codeTarget,
              signal,
              onUpdate,
              0,
              3,
              `ECharts配置解析失败。JSON错误: ${parseError.message}，Eval错误: ${evalErrorMsg}`
            )
            // 标记已重试，避免无限循环
            params._retryAttempted = true
            // 递归调用，使用新生成的代码
            return await chartGenerationCallback({ ...params, code: retryCode }, signal, onUpdate)
          }

          throw new Error(
            `ECharts配置解析失败。JSON错误: ${parseError.message}，Eval错误: ${evalErrorMsg}`
          )
        }
      }

      // 确保optionJson是对象
      if (typeof optionJson !== 'object' || optionJson === null) {
        throw new Error('ECharts配置必须是有效的对象，当前类型: ' + typeof optionJson)
      }

      // 将对象转换为字符串，保留函数
      const serializeWithFunctions = (obj: any): string => {
        return JSON.stringify(obj, (key, value) => {
          if (typeof value === 'function') {
            return value.toString()
          }
          return value
        })
      }

      let optionJsonString = serializeWithFunctions(optionJson)

      // ECharts渲染重试机制（最多3次）
      let echartsRetryCount = 0
      const maxEchartsRetries = 3
      let echartsImageUrl: string | undefined = undefined

      while (echartsRetryCount <= maxEchartsRetries) {
        try {
          echartsImageUrl = await renderEChartsViaIpc(optionJsonString, targetFormat)
          // 渲染成功，跳出循环
          break
        } catch (renderError) {
          const renderErrorMsg =
            renderError instanceof Error ? renderError.message : String(renderError)
          logger.warn(
            `ECharts渲染失败 (尝试 ${echartsRetryCount + 1}/${maxEchartsRetries + 1}):`,
            renderErrorMsg
          )

          if (echartsRetryCount < maxEchartsRetries) {
            // 尝试重新生成代码
            logger.info(
              `ECharts渲染失败，尝试重新生成代码 (${echartsRetryCount + 1}/${maxEchartsRetries})...`
            )
            try {
              const codeTarget = ref('')
              const retryCode = await generateChartCodeWithLLM(
                prompt || '修复ECharts配置错误',
                normalizedChartType,
                codeTarget,
                signal,
                onUpdate,
                0,
                3,
                `ECharts渲染失败: ${renderErrorMsg}`
              )

              // 重新解析代码
              let retryCleanedCode = cleanEChartsCode(retryCode)
              let retryJsonString = extractOuterJsonString(retryCleanedCode) || retryCleanedCode

              try {
                optionJson = JSON.parse(retryJsonString)
              } catch {
                try {
                  let funcCode = retryJsonString.replace(/^(const|let|var)\s+\w+\s*=\s*/, '')
                  funcCode = funcCode.replace(/;?\s*$/, '')
                  optionJson = new Function('return ' + funcCode)()
                } catch {
                  throw new Error('重试生成的代码仍然无法解析')
                }
              }

              if (typeof optionJson !== 'object' || optionJson === null) {
                throw new Error('重试生成的代码不是有效的对象')
              }

              optionJsonString = serializeWithFunctions(optionJson)
              echartsRetryCount++
              // 继续循环，尝试使用新生成的代码渲染
              continue
            } catch (retryError) {
              logger.error('ECharts重试生成代码失败:', retryError)
              // 如果重试生成失败，继续下一次重试
              echartsRetryCount++
              continue
            }
          } else {
            // 已达到最大重试次数，抛出错误
            throw renderError
          }
        }
      }

      if (!echartsImageUrl) {
        throw new Error(`ECharts渲染失败：已尝试 ${echartsRetryCount} 次重试，但仍无法渲染`)
      }

      imageUrl = echartsImageUrl
    } else if (normalizedChartType === 'plantuml') {
      // PlantUML使用IPC渲染
      try {
        imageUrl = (await renderPlantUMLViaIpc(finalChartCode, targetFormat)) as string
      } catch (renderError) {
        // 如果渲染失败，尝试重新生成（含 GraphViz/PlantUML 崩溃类错误）
        const renderErrorMsg =
          renderError instanceof Error ? renderError.message : String(renderError)
        const shouldRetry =
          renderErrorMsg.includes('syntax') ||
          renderErrorMsg.includes('语法') ||
          renderErrorMsg.includes('error') ||
          renderErrorMsg.includes('GraphViz') ||
          renderErrorMsg.includes('IllegalStateException') ||
          renderErrorMsg.includes('crashed') ||
          renderErrorMsg.includes('未返回有效的 SVG')
        if (!params._retryAttempted && shouldRetry) {
          logger.info('PlantUML渲染失败，尝试重新生成代码...')
          const codeTarget = ref('')
          const retryCode = await generateChartCodeWithLLM(
            prompt,
            normalizedChartType,
            codeTarget,
            signal,
            onUpdate,
            0,
            3,
            `PlantUML渲染失败: ${renderErrorMsg}`
          )
          params._retryAttempted = true
          return await chartGenerationCallback({ ...params, code: retryCode }, signal, onUpdate)
        }
        throw renderError
      }
    } else if (normalizedChartType === 'mermaid') {
      // Mermaid 使用官方 API 渲染，支持自动修复
      let mermaidFixAttempts = 0
      const maxMermaidFixes = 10
      let currentCode = finalChartCode
      let mermaidImageUrl: string | undefined = undefined

      while (mermaidFixAttempts <= maxMermaidFixes) {
        try {
          // 先提取纯 Mermaid 代码（去除中文说明）
          currentCode = extractMermaidCode(currentCode)

          // 尝试渲染
          mermaidImageUrl = await renderMermaidViaApi(currentCode, targetFormat)
          // 渲染成功，跳出循环
          break
        } catch (renderError) {
          const renderErrorMsg =
            renderError instanceof Error ? renderError.message : String(renderError)
          logger.warn(
            `Mermaid 渲染失败 (尝试 ${mermaidFixAttempts + 1}/${maxMermaidFixes + 1}):`,
            renderErrorMsg
          )

          // 检查是否是语法错误，如果是则尝试修复
          const isSyntaxError =
            renderErrorMsg.includes('syntax') ||
            renderErrorMsg.includes('语法') ||
            renderErrorMsg.includes('error') ||
            renderErrorMsg.includes('parse') ||
            renderErrorMsg.includes('No diagram type detected')

          if (isSyntaxError && mermaidFixAttempts < maxMermaidFixes) {
            // 尝试使用 AI 修复代码
            logger.info(
              `Mermaid 语法错误，尝试使用 AI 修复 (${mermaidFixAttempts + 1}/${maxMermaidFixes})...`
            )

            try {
              const codeTarget = ref('')
              const fixPrompt = `之前的 Mermaid 代码有语法错误，请修复它。

错误信息：${renderErrorMsg}

原始代码：
\`\`\`mermaid
${currentCode}
\`\`\`

请修复语法错误，只返回修复后的 Mermaid 代码，不要包含任何说明文字或 markdown 代码块标记。`

              const fixedCode = await generateChartCodeWithLLM(
                fixPrompt,
                normalizedChartType,
                codeTarget,
                signal,
                onUpdate,
                0,
                3,
                renderErrorMsg
              )

              if (fixedCode && fixedCode.trim() !== currentCode.trim()) {
                currentCode = fixedCode
                mermaidFixAttempts++
                // 继续循环，尝试使用修复后的代码渲染
                continue
              } else {
                logger.warn('AI 修复返回的代码与原始代码相同，停止修复')
                throw renderError
              }
            } catch (fixError) {
              logger.error('AI 修复失败:', fixError)
              // 如果修复失败，抛出原始错误
              throw renderError
            }
          } else {
            // 不是语法错误，或者已达到最大修复次数，抛出错误
            throw renderError
          }
        }
      }

      // 如果循环结束但 mermaidImageUrl 仍未设置，说明修复失败
      if (!mermaidImageUrl) {
        throw new Error(
          `Mermaid 渲染失败：已尝试 ${mermaidFixAttempts} 次修复，但仍无法修复语法错误`
        )
      }

      // 更新 finalChartCode 为最终提取后的代码（可能经过修复）
      finalChartCode = currentCode
      imageUrl = mermaidImageUrl
    } else {
      // 其他类型使用Vditor渲染
      const chartConfig = CHART_TYPES[normalizedChartType as keyof typeof CHART_TYPES]
      if (!chartConfig) {
        throw new Error(`不支持的图表类型: ${normalizedChartType}`)
      }
      try {
        imageUrl = await renderChartViaVditor(
          normalizedChartType,
          finalChartCode,
          cdn,
          chartConfig,
          targetFormat
        )
      } catch (renderError) {
        // 如果渲染失败（可能是语法错误），尝试重新生成
        const renderErrorMsg =
          renderError instanceof Error ? renderError.message : String(renderError)
        if (
          !params._retryAttempted &&
          (renderErrorMsg.includes('syntax') ||
            renderErrorMsg.includes('语法') ||
            renderErrorMsg.includes('error') ||
            renderErrorMsg.includes('parse'))
        ) {
          logger.info(`${normalizedChartType}渲染失败，尝试重新生成代码...`)
          const codeTarget = ref('')
          const retryCode = await generateChartCodeWithLLM(
            prompt,
            normalizedChartType,
            codeTarget,
            signal,
            onUpdate,
            0,
            3,
            `${normalizedChartType}渲染失败: ${renderErrorMsg}`
          )
          params._retryAttempted = true
          return await chartGenerationCallback({ ...params, code: retryCode }, signal, onUpdate)
        }
        throw renderError
      }
    }

    // 步骤3: 如果是PDF，需要转换
    let finalUrl = imageUrl
    let localPath = await getLocalPathFromUrl(imageUrl)
    // 保存原始 SVG URL，用于 PDF 格式时在 Display 中显示 SVG
    let originalSvgUrl: string | undefined = undefined

    if (format === 'pdf') {
      // 保存原始 SVG URL
      originalSvgUrl = imageUrl
      onUpdate(
        {
          content: {
            stage: 'converting',
            imageUrl,
            chartType: normalizedChartType
          },
          format: 'json'
        },
        {
          percentage: 80,
          message: '正在转换为PDF...'
        }
      )

      // PDF转换：使用统一工具函数
      const { convertSvgToPdf: convertSvgToPdfUtil } = await import('../svg-to-pdf-utils.js')
      // 返回本地路径（returnUrl: false），用于 localPath
      const pdfPath = await convertSvgToPdfUtil(imageUrl, { returnUrl: false })

      // 设置本地路径
      localPath = pdfPath
      // 将本地路径转换为 HTTP URL 用于显示和访问
      const pdfFileName = pdfPath.split(/[/\\]/).pop() || pdfPath
      finalUrl = `${getRuntimeServerBaseUrlSync()}/images/${pdfFileName}`
    }

    // 步骤4: 可选——将图片保存到指定路径（支持绝对路径或相对工作区根路径；路径含目录+文件名，如 images/fig1.svg）
    let savedPath: string | undefined
    if (savePath) {
      const targetPath = ensureExtension(resolveSavePath(savePath.trim()), format)
      try {
        const res = await fetch(finalUrl, { signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buf = await res.arrayBuffer()
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
        await messageBridge.invoke('write-file-content', {
          filePath: targetPath,
          content: base64,
          encoding: 'base64'
        })
        savedPath = targetPath
        logger.info('[chart-generation] 已保存到:', targetPath)
      } catch (saveErr) {
        const msg = saveErr instanceof Error ? saveErr.message : String(saveErr)
        logger.error('[chart-generation] 保存到文件失败:', saveErr)
        return {
          status: 'failed',
          error: `图表已生成但保存到文件失败: ${msg}`
        }
      }
    }

    // 步骤5: 返回结果
    const result = {
      chartName,
      chartType: normalizedChartType,
      url: finalUrl,
      localPath,
      chartCode: finalChartCode, // 包含提取后的可直接渲染的代码
      // 如果是 PDF 格式，保存原始 SVG URL 用于显示
      svgUrl: format === 'pdf' ? originalSvgUrl : undefined,
      ...(savedPath !== undefined && { savedPath })
    }

    onUpdate(
      {
        content: {
          stage: 'completed',
          ...result,
          chartCode: finalChartCode
        },
        format: 'json',
        componentName: 'ChartGenerationDisplay'
      },
      {
        percentage: 100,
        message: '图表生成完成'
      }
    )

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          ...result,
          chartCode: finalChartCode
        },
        format: 'json',
        componentName: 'ChartGenerationDisplay'
      },
      result
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('图表生成失败:', error)
    return {
      status: 'failed',
      error: `图表生成失败: ${errorMessage}`
    }
  }
}

const CHART_GENERATION_TOOL_NAME = 'Chart Generation'
const CHART_GENERATION_TOOL_DESCRIPTION =
  'Generate various types of charts (Mermaid, ECharts, PlantUML, flowchart, graphviz, etc.) based on prompts, supporting export to SVG, PNG, or PDF formats'

/**
 * 图表生成Tool配置
 */
export const chartGenerationToolConfig: AgentToolConfig = {
  id: 'chart-generation',
  name: CHART_GENERATION_TOOL_NAME,
  description: CHART_GENERATION_TOOL_DESCRIPTION,
  origin: 'internal',
  spec: {
    name: 'chart-generation',
    brief:
      'Generate various types of charts (Mermaid, ECharts, PlantUML, flowchart, graphviz) based on prompts.',
    fullSpec: `# Chart Generation Tool

## Description
Generate various types of charts based on prompts, including:
- Mermaid diagrams (flowchart, sequence, class, state, er, gantt, pie, gitgraph, journey, mindmap, timeline, etc.)
- ECharts charts (line, bar, pie, scatter, radar, heatmap, tree, treemap, sunburst, etc.)
- PlantUML diagrams
- Flowchart diagrams
- Graphviz diagrams

## Usage Scenarios
- Generate visualizations for data
- Create diagrams for documentation
- Generate flowcharts for processes
- Create mind maps
- Generate sequence diagrams

## Input Format
\`\`\`json
{
  "prompt": "string",   // Chart description (or use "code" to provide chart code directly)
  "chartType": "string", // mermaid|echarts|plantuml|flowchart|graphviz
  "format": "string",   // svg|png|pdf (Markdown: svg/png; LaTeX: pdf required)
  "savePath": "string"  // Optional, path (dir + filename) to save file, absolute or workspace-relative (e.g. images/fig1.svg)
}
\`\`\`

## Output Format
Returns chart code, URL, and optionally savedPath. For Markdown, prefer inserting code blocks (\`\`\`mermaid, \`\`\`echarts, \`\`\`plantuml) over image links. For LaTeX, must save as PDF and insert using \u005cbegin{figure}...\u005cend{figure} with \u005cincludegraphics.

## Important Notes
1. Use savePath when the chart is for document insertion (path = directory + filename, workspace-relative e.g. images/fig1.pdf).
2. Markdown: Prefer code-block insertion; LaTeX: format "pdf", save to project, then use figure environment.
3. For ECharts: valid JSON, English punctuation; Mermaid/PlantUML: correct syntax and markers. Tool validates and retries if needed.`
  },
  instruction: undefined,
  callback: chartGenerationCallback,
  displayComponent: ChartGenerationDisplay,
  tags: ['chart', 'visualization', 'generation', 'internal'],
  enabled: true,
  editable: false
}
