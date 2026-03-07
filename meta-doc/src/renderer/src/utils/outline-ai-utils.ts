/**
 * 大纲AI生成工具函数
 * 提供统一的大纲节点生成、内容生成等功能，使用对话模式（chat）以提高AI理解准确性
 */

import { ref, type Ref } from 'vue'
import type { DocumentOutlineNode } from '../../../types'
import { createAiTask, ai_types, cancelAiTask } from './ai_tasks'
import {
  expandTreeNodePrompt,
  generateContentPrompt,
  generateParentNodeContentPrompt,
  expandContentPrompt,
  abridgeContentPrompt,
  polishContentPrompt
} from './prompts'
import { TREE_NODE_SCHEMA } from '../constants/document'
import { getPromptByKey } from './prompts'
import { removeTextFromOutline } from './document/outline'
import { extractOuterJsonString } from './regex-utils'
import { createRendererLogger } from './logger'
import type { AIDialogMessage } from '../../../types'
import type { ToolCallbackData, ToolProgress } from '../types/agent-tool'

// 懒加载logger，避免初始化顺序问题
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('OutlineAIUtils')
  }
  return loggerInstance
}

/**
 * 清理标题中的Markdown和LaTeX标记
 */
export function cleanTitleMarkers(title: string): string {
  if (!title || typeof title !== 'string') {
    return title
  }

  let cleaned = title.trim()

  // 1. 移除Markdown标题标记（#、##、###等）
  cleaned = cleaned.replace(/^#+\s+/, '')

  // 2. 移除LaTeX标题命令标记
  const extractBracedContent = (
    str: string,
    startPos: number
  ): { content: string; endPos: number } | null => {
    if (str[startPos] !== '{') return null

    let depth = 0
    let i = startPos
    let content = ''

    while (i < str.length) {
      const char = str[i]

      if (char === '\\' && i + 1 < str.length) {
        const nextChar = str[i + 1]
        if (nextChar === '{' || nextChar === '}' || nextChar === '\\') {
          if (depth >= 1) {
            content += char + nextChar
          }
          i += 2
          continue
        }
      }

      if (char === '{') {
        depth++
        if (depth > 1) {
          content += char
        }
      } else if (char === '}') {
        depth--
        if (depth === 0) {
          return { content, endPos: i }
        } else {
          content += char
        }
      } else {
        if (depth >= 1) {
          content += char
        }
      }
      i++
    }

    return null
  }

  const latexTitleCommands = [
    'part',
    'chapter',
    'section',
    'subsection',
    'subsubsection',
    'paragraph',
    'subparagraph',
    'title'
  ]

  for (const cmd of latexTitleCommands) {
    const cmdPattern = new RegExp(`^\\\\${cmd}\\*?`, 'i')
    const match = cleaned.match(cmdPattern)

    if (match) {
      const afterCmd = cleaned.substring(match[0].length).trim()

      if (afterCmd.startsWith('{')) {
        const result = extractBracedContent(afterCmd, 0)
        if (result) {
          cleaned = result.content
          break
        }
      }
    }
  }

  return cleaned.trim()
}

/**
 * 递归清理节点及其所有子节点的标题标记
 */
export function cleanNodeTitleMarkers(node: DocumentOutlineNode): void {
  if (node.title) {
    node.title = cleanTitleMarkers(node.title)
  }

  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      cleanNodeTitleMarkers(child)
    }
  }
}

/**
 * 清理原始内容，去除可能的说明文字和格式标记
 */
export function cleanRawContent(raw: string): string {
  if (!raw) return ''

  let cleaned = raw.trim()

  // 去除代码块标记
  cleaned = cleaned.replace(/^```(?:json|markdown|text)?\s*\n?/i, '')
  cleaned = cleaned.replace(/\n?```\s*$/i, '')

  // 去除常见的说明文字段落
  const instructionPatterns = [
    /^请严格按照示例格式输出[，,，。.]?\s*不要添加任何其他内容[。.]?\s*[\n\r]+/i,
    /^现在[，,，]?\s*请直接输出\s*JSON\s*结果[，,，。.]?\s*不要添加任何其他内容[。.]?\s*[\n\r]+/i,
    /^请严格按照\s*JSON\s*格式输出[，,，。.]?\s*不要添加任何解释或多余文本[。.]?\s*[\n\r]+/i,
    /^请严格按照\s*JSON\s*格式输出[，,，。.]?\s*不要添加任何其他内容[。.]?\s*[\n\r]+/i,
    /^请严格按照\s*JSON\s*Schema\s*格式输出[，,，。.]?\s*不要添加任何解释或多余文本[。.]?\s*[\n\r]+/i,
    /^输出必须从第一行开始就是\s*JSON\s*对象[，,，。.]?\s*没有任何其他文字[。.]?\s*[\n\r]+/i,
    /^请严格按照示例格式输出[，,，。.]?\s*不要添加任何其他内容[。.]?\s*/i,
    /^现在[，,，]?\s*请直接输出\s*JSON\s*结果[，,，。.]?\s*不要添加任何其他内容[。.]?\s*/i,
    /^请严格按照\s*JSON\s*格式输出[，,，。.]?\s*不要添加任何解释或多余文本[。.]?\s*/i,
    /^请严格按照\s*JSON\s*格式输出[，,，。.]?\s*不要添加任何其他内容[。.]?\s*/i,
    /^请严格按照\s*JSON\s*Schema\s*格式输出[，,，。.]?\s*不要添加任何解释或多余文本[。.]?\s*/i,
    /^输出必须从第一行开始就是\s*JSON\s*对象[，,，。.]?\s*没有任何其他文字[。.]?\s*/i,
    /^根据您的要求[，,]\s*/i,
    /^我将为您[，,]\s*/i,
    /^好的[，,]\s*/i,
    /^明白了[，,]\s*/i,
    /^以下是[：:]\s*/i,
    /^内容如下[：:]\s*/i,
    /^生成的内容[：:]\s*/i
  ]

  for (const pattern of instructionPatterns) {
    cleaned = cleaned.replace(pattern, '')
  }

  cleaned = cleaned.replace(/^[\s\n\r]+/, '')

  if (!cleaned.trim()) {
    const lines = raw.split('\n')
    const contentLines: string[] = []
    let foundContent = false

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine) continue
      if (
        /^(请|现在|输出|根据|我将|好的|明白了)/i.test(trimmedLine) &&
        /(格式|输出|示例|不要|添加)/i.test(trimmedLine)
      ) {
        continue
      }
      if (trimmedLine.length > 10 || foundContent) {
        foundContent = true
        contentLines.push(line)
      }
    }

    if (contentLines.length > 0) {
      cleaned = contentLines.join('\n').trim()
    }
  }

  return cleaned.trim()
}

/**
 * 从自然语言文本中提取章节列表
 * 支持多种格式：列表、标题、编号等
 */
function extractChaptersFromText(
  text: string,
  docFormat: 'md' | 'tex' = 'md'
): DocumentOutlineNode[] | null {
  if (!text || !text.trim()) {
    return null
  }

  const chapters: DocumentOutlineNode[] = []
  const lines = text.split('\n')

  // 尝试多种格式匹配（按优先级排序）
  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue

    // 跳过明显的说明文字
    if (
      trimmedLine.match(/^(以下是|生成|包括|包含|建议|推荐|可以|应该|注意|提示|说明|例如|比如)/i)
    ) {
      continue
    }

    // 跳过JSON格式的内容（已经尝试过）
    if (trimmedLine.startsWith('{') || trimmedLine.startsWith('[')) {
      continue
    }

    // 跳过代码块标记
    if (trimmedLine.startsWith('```')) {
      continue
    }

    let title: string | null = null
    let titleLevel = 1

    // 按优先级尝试匹配各种格式
    // 1. 优先匹配Markdown标题格式：## 标题、### 标题
    const markdownTitleMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/)
    if (markdownTitleMatch) {
      titleLevel = markdownTitleMatch[1].length
      title = markdownTitleMatch[2].trim()
    }
    // 2. 匹配中文编号格式：第一章 标题、第一节 标题
    else {
      const chineseNumberMatch = trimmedLine.match(
        /^(第[一二三四五六七八九十\d百千万]+[章节部分])\s*(.+)$/
      )
      if (chineseNumberMatch) {
        title = chineseNumberMatch[2].trim() || chineseNumberMatch[1].trim()
      }
      // 3. 匹配编号列表：1. 标题、1) 标题、一、标题
      else {
        const numberedListMatch = trimmedLine.match(
          /^[\d一二三四五六七八九十]+[.、：：）)]\s*(.+)$/
        )
        if (numberedListMatch) {
          title = numberedListMatch[1].trim()
        }
        // 4. 匹配无序列表：- 标题、* 标题
        else {
          const listMatch = trimmedLine.match(/^[-*•]\s+(.+)$/)
          if (listMatch) {
            title = listMatch[1].trim()
          }
          // 5. 匹配LaTeX格式：\section{标题}、\subsection{标题}
          else {
            const latexMatch = trimmedLine.match(/^\\(section|subsection|subsubsection)\{([^}]+)\}/)
            if (latexMatch) {
              title = latexMatch[2].trim()
              titleLevel = latexMatch[1] === 'section' ? 1 : latexMatch[1] === 'subsection' ? 2 : 3
            }
            // 6. 最后尝试：直接是标题（排除明显的非标题内容）
            else {
              // 排除太短或太长的行
              if (trimmedLine.length >= 2 && trimmedLine.length <= 200) {
                // 排除包含太多标点符号的行（可能是说明文字）
                const punctuationCount = (trimmedLine.match(/[，。、；：！？]/g) || []).length
                if (punctuationCount <= 2) {
                  // 排除明显的说明文字模式
                  if (!trimmedLine.match(/^(因为|所以|但是|然而|另外|此外|总之|综上所述|因此)/)) {
                    title = trimmedLine
                  }
                }
              }
            }
          }
        }
      }
    }

    // 如果提取到标题，创建节点
    if (title && title.length >= 2 && title.length <= 200) {
      // 根据文档格式调整标题
      let finalTitle = title
      if (docFormat === 'tex') {
        // LaTeX格式：如果已经是Markdown格式，转换为LaTeX
        if (title.match(/^#+\s+/)) {
          finalTitle = title.replace(/^#+\s+/, '')
        }
      } else {
        // Markdown格式：如果已经是LaTeX格式，转换为Markdown
        if (title.match(/\\section\{/)) {
          finalTitle = title.replace(/\\section\{([^}]+)\}/, '# $1')
        } else if (title.match(/\\subsection\{/)) {
          finalTitle = title.replace(/\\subsection\{([^}]+)\}/, '## $1')
        }
      }

      chapters.push({
        title: cleanTitleMarkers(finalTitle), // 清理标题中的Markdown/LaTeX标记
        title_level: titleLevel,
        path: '', // 稍后会生成
        text: '',
        children: []
      })
    }
  }

  // 如果提取到章节，返回
  if (chapters.length > 0) {
    getLogger().info(`从自然语言文本中提取到 ${chapters.length} 个章节`)
    return chapters
  }

  return null
}

/**
 * 使用AI将自然语言文本转换为符合schema规范的JSON格式章节列表
 */
async function convertTextToJsonChapters(
  text: string,
  node: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  docFormat: 'md' | 'tex' = 'md',
  signal?: AbortSignal,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void
): Promise<DocumentOutlineNode[]> {
  const formatInstruction =
    docFormat === 'tex'
      ? '**重要：文档格式是LaTeX，生成的节点标题应该使用LaTeX格式（例如：\\section{标题}），不要使用Markdown的#、##等标记。**'
      : '**重要：文档格式是Markdown，生成的节点标题应该使用Markdown格式（例如：# 标题、## 标题），不要使用LaTeX的\\section{}等命令。**'

  // 计算当前节点的title_level，子节点的title_level应该是父节点+1
  const parentTitleLevel = node.title_level || 0
  const childTitleLevel = parentTitleLevel + 1

  const conversionPrompt = getPromptByKey('outlineConversionPrompt', {
    formatInstruction,
    schema: JSON.stringify(TREE_NODE_SCHEMA, null, 2),
    childTitleLevel: String(childTitleLevel),
    parentTitleLevel: String(parentTitleLevel),
    nodeTitle: node.title || '根节点',
    nodePath: node.path,
    userPrompt: userPrompt || '无',
    text: text.substring(0, 2000) + (text.length > 2000 ? '...' : '')
  })

  // 构建消息数组，将 prompt 转换为对话格式
  const messages: AIDialogMessage[] = []
  messages.push({
    role: 'user',
    content: conversionPrompt
  })

  const rawStringRef = ref('')
  const { handle, done } = createAiTask(
    `转换文本为章节列表: ${node.title}`,
    messages,
    rawStringRef,
    ai_types.chat,
    `outline-convert-${node.path}-${Date.now()}`,
    {
      stream: true
    }
  )

  // Immediately pass streaming output info via onUpdate
  if (onUpdate) {
    onUpdate(
      {
        content: {
          stage: 'converting-text-streaming',
          rawContentRef: rawStringRef,
          rawContentDonePromise: done
        },
        format: 'json'
      },
      {
        percentage: 50,
        message: '正在转换文本为章节列表（流式输出）...'
      }
    )
  }

  if (signal) {
    signal.addEventListener('abort', () => {
      cancelAiTask(handle, false, false)
    })
  }

  try {
    await done
  } catch (error) {
    if (signal?.aborted) {
      throw new Error('操作已取消')
    }
    const errorMessage = error instanceof Error ? error.message : String(error)
    getLogger().error('AI转换文本失败:', error)
    throw new Error(`AI转换失败: ${errorMessage}`)
  }

  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

  const convertedContent = rawStringRef.value?.trim() || ''
  if (!convertedContent) {
    throw new Error('AI转换返回内容为空')
  }

  // 检查内容是否太短（可能是AI提前停止）
  if (convertedContent.length < 50) {
    getLogger().warn(
      `AI返回内容过短（${convertedContent.length}字符），可能是提前停止: ${convertedContent.substring(0, 100)}`
    )
    throw new Error(
      `AI返回内容过短（${convertedContent.length}字符），可能未完成生成。返回内容：${convertedContent.substring(0, 200)}。请确保AI返回完整的JSON数组格式。`
    )
  }

  // 使用extractOuterJsonString提取JSON
  let json = extractOuterJsonString(convertedContent)
  if (!json) {
    const cleaned = convertedContent
      .replace(/```json\n?/gi, '')
      .replace(/```\n?/g, '')
      .trim()
    json = extractOuterJsonString(cleaned)
  }

  if (!json) {
    getLogger().error(`无法提取JSON，原始内容前500字符: ${convertedContent.substring(0, 500)}`)
    throw new Error(
      `AI转换后仍无法提取JSON格式。请确保AI返回有效的JSON数组格式。返回内容前200字符：${convertedContent.substring(0, 200)}`
    )
  }

  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) {
      throw new Error('解析结果不是有效的数组')
    }

    if (parsed.length === 0) {
      throw new Error('解析结果为空数组')
    }

    // 验证每个节点是否符合schema规范
    const validatedNodes: DocumentOutlineNode[] = []
    for (let i = 0; i < parsed.length; i++) {
      const node = parsed[i]
      if (!node || typeof node !== 'object') {
        getLogger().warn(`节点 ${i} 不是有效对象，跳过`)
        continue
      }

      // 验证必需字段
      if (typeof node.title !== 'string' || !node.title.trim()) {
        getLogger().warn(`节点 ${i} 的title字段无效，跳过`)
        continue
      }

      if (!Array.isArray(node.children)) {
        node.children = []
      }

      // 确保所有必需字段都存在
      const validatedNode: DocumentOutlineNode = {
        path: node.path || '', // path会在后续自动生成
        title: cleanTitleMarkers(node.title.trim()), // 清理标题中的Markdown/LaTeX标记
        text: node.text || '',
        title_level: typeof node.title_level === 'number' ? node.title_level : childTitleLevel,
        children: node.children || []
      }

      validatedNodes.push(validatedNode)
    }

    if (validatedNodes.length === 0) {
      throw new Error('没有有效的节点通过schema验证')
    }

    getLogger().info(`成功验证并转换 ${validatedNodes.length} 个符合schema规范的节点`)
    return validatedNodes
  } catch (parseError) {
    const errorMsg = parseError instanceof Error ? parseError.message : String(parseError)
    getLogger().error('解析AI转换结果失败:', errorMsg)
    throw new Error(`解析转换结果失败: ${errorMsg}`)
  }
}

/**
 * 生成节点的子节点（使用对话模式，支持fallback到自然语言转换）
 * @param rawContentRef 可选的原始内容ref，用于实时显示流式输出内容
 * @param onUpdate 可选的更新回调，用于传递流式输出信息
 * @param enableFallback 是否启用fallback逻辑（当JSON解析失败时，尝试自然语言转换），默认为true
 */
export async function generateChildNodes(
  node: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  signal?: AbortSignal,
  docFormat: 'md' | 'tex' = 'md',
  rawContentRef?: Ref<string>,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void,
  enableFallback: boolean = true,
  temperature?: number
): Promise<DocumentOutlineNode[]> {
  const basePrompt = expandTreeNodePrompt(
    JSON.stringify(removeTextFromOutline(outlineTree)),
    JSON.stringify(node),
    JSON.stringify(TREE_NODE_SCHEMA),
    userPrompt
  )

  // 根据文档格式调整提示词（子节点的title也需要使用正确的格式）
  const formatInstruction =
    docFormat === 'tex'
      ? '**重要：文档格式是LaTeX，生成的节点标题应该使用LaTeX格式（例如：\\section{标题}），不要使用Markdown的#、##等标记。**'
      : '**重要：文档格式是Markdown，生成的节点标题应该使用Markdown格式（例如：# 标题、## 标题），不要使用LaTeX的\\section{}等命令。**'

  const prompt = formatInstruction + '\n\n' + basePrompt

  // 构建消息数组，将 prompt 转换为对话格式
  const messages: AIDialogMessage[] = []
  messages.push({
    role: 'user',
    content: prompt
  })

  const rawStringRef = rawContentRef || ref('')
  const meta: any = { stream: true }
  if (temperature !== undefined) {
    meta.temperature = temperature
  }
  const { handle, done } = createAiTask(
    node.title,
    messages,
    rawStringRef,
    ai_types.chat,
    'outline-children-' + node.title,
    meta
  )

  // Immediately pass streaming output info via onUpdate
  if (onUpdate) {
    onUpdate(
      {
        content: {
          stage: 'generating-children-streaming',
          rawContentRef: rawStringRef,
          rawContentDonePromise: done
        },
        format: 'json'
      },
      {
        percentage: 30,
        message: '正在生成子节点（流式输出）...'
      }
    )
  }

  if (signal) {
    signal.addEventListener('abort', () => {
      // 任务取消由 ai_tasks 内部处理
    })
  }

  try {
    await done
  } catch (error) {
    if (signal?.aborted) {
      throw new Error('操作已取消')
    }
    const errorMessage = error instanceof Error ? error.message : String(error)
    getLogger().error('生成子节点失败:', error)
    throw new Error(`生成子节点失败: ${errorMessage}`)
  }

  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

  const rawContent = rawStringRef.value?.trim() || ''
  if (!rawContent) {
    throw new Error('AI返回内容为空')
  }

  // 尝试提取JSON
  let json = extractOuterJsonString(rawContent)

  // 如果第一次提取失败，尝试清理内容后再提取
  if (!json) {
    const cleaned = rawContent
      .replace(/```json\n?/gi, '')
      .replace(/```\n?/g, '')
      .trim()
    json = extractOuterJsonString(cleaned)
  }

  // 如果还是失败，尝试直接解析整个内容（可能是纯JSON）
  if (!json) {
    try {
      const directParse = JSON.parse(rawContent)
      if (Array.isArray(directParse)) {
        json = rawContent
      }
    } catch {
      // 不是纯JSON，继续尝试其他方法
    }
  }

  // 如果还是失败，尝试查找数组格式的JSON（可能是[...]格式）
  if (!json) {
    const arrayMatch = rawContent.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      try {
        // 验证是否是有效的JSON数组
        const testParse = JSON.parse(arrayMatch[0])
        if (Array.isArray(testParse)) {
          json = arrayMatch[0]
        }
      } catch {
        // 不是有效的JSON数组
      }
    }
  }

  // 如果还是失败，尝试修复常见的JSON格式问题
  if (!json) {
    // 尝试修复：移除可能的说明文字，只保留JSON部分
    let cleaned = rawContent
      // 移除JSON前的说明文字
      .replace(/^[^[{]*[[{]/, (match) => {
        const bracket = match[match.length - 1]
        return bracket === '[' ? '[' : '{'
      })
      // 移除JSON后的说明文字
      .replace(/[\]}][^\]}]*$/, (match) => {
        const bracket = match[0]
        return bracket === ']' ? ']' : '}'
      })
      .trim()

    // 尝试提取修复后的JSON
    json = extractOuterJsonString(cleaned)

    // 如果还是失败，尝试直接解析修复后的内容
    if (!json) {
      try {
        const testParse = JSON.parse(cleaned)
        if (Array.isArray(testParse)) {
          json = cleaned
        }
      } catch {
        // 修复失败
      }
    }
  }

  // 如果JSON提取成功，尝试解析
  let newChildren: DocumentOutlineNode[] | null = null

  if (json) {
    try {
      newChildren = JSON.parse(json) as DocumentOutlineNode[]
      if (Array.isArray(newChildren) && newChildren.length > 0) {
        // 验证节点结构是否符合schema
        const isValid = newChildren.every(
          (child) => child && typeof child.title === 'string' && Array.isArray(child.children)
        )
        if (isValid) {
          getLogger().info('成功解析JSON格式的子节点数据')
        } else {
          getLogger().warn('JSON格式不符合schema规范，尝试使用fallback')
          newChildren = null
        }
      } else {
        newChildren = null
      }
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : String(parseError)
      getLogger().warn('解析子节点JSON失败，尝试修复:', errorMsg)

      // 尝试修复JSON格式问题（补全缺失的括号）
      try {
        let fixedJson = json
        const openBraces = (fixedJson.match(/{/g) || []).length
        const closeBraces = (fixedJson.match(/}/g) || []).length
        if (openBraces > closeBraces) {
          fixedJson += '}'.repeat(openBraces - closeBraces)
        }
        const openBrackets = (fixedJson.match(/\[/g) || []).length
        const closeBrackets = (fixedJson.match(/\]/g) || []).length
        if (openBrackets > closeBrackets) {
          fixedJson += ']'.repeat(openBrackets - closeBrackets)
        }

        newChildren = JSON.parse(fixedJson) as DocumentOutlineNode[]
        if (Array.isArray(newChildren) && newChildren.length > 0) {
          // 验证节点结构是否符合schema
          const isValid = newChildren.every(
            (child) => child && typeof child.title === 'string' && Array.isArray(child.children)
          )
          if (isValid) {
            getLogger().info('修复JSON格式后成功解析')
          } else {
            getLogger().warn('修复后的JSON格式不符合schema规范，尝试使用fallback')
            newChildren = null
          }
        } else {
          newChildren = null
        }
      } catch (fixError) {
        getLogger().warn('修复JSON格式失败，将使用fallback')
        newChildren = null
      }
    }
  }

  // 如果JSON解析失败或提取失败，且启用了fallback，使用自然语言转换
  if ((!newChildren || !Array.isArray(newChildren) || newChildren.length === 0) && enableFallback) {
    getLogger().info('检测到自然语言输入，使用LLM生成符合schema规范的JSON格式章节列表')
    try {
      // 先尝试从文本中直接提取章节
      const extractedChapters = extractChaptersFromText(rawContent, docFormat)
      if (extractedChapters && extractedChapters.length > 0) {
        getLogger().info(`从文本中直接提取到 ${extractedChapters.length} 个章节`)
        return extractedChapters
      }

      // 如果直接提取失败，使用AI转换
      newChildren = await convertTextToJsonChapters(
        rawContent,
        node,
        outlineTree,
        userPrompt,
        docFormat,
        signal,
        onUpdate
      )
      if (newChildren && newChildren.length > 0) {
        getLogger().info(`LLM转换成功，生成 ${newChildren.length} 个符合schema规范的章节`)
      } else {
        throw new Error('LLM转换后未生成有效章节')
      }
    } catch (convertError) {
      getLogger().error('LLM转换失败:', convertError)
      throw new Error(
        `无法从AI响应中提取有效的子节点数据。请确保AI返回有效的JSON格式或清晰的章节列表。错误：${convertError instanceof Error ? convertError.message : String(convertError)}`
      )
    }
  }

  // 如果所有方法都失败，抛出错误
  if (!newChildren || !Array.isArray(newChildren) || newChildren.length === 0) {
    getLogger().warn('所有解析方法都失败，原始内容前500字符:', rawContent.substring(0, 500))
    throw new Error(
      '未能从AI响应中提取有效的子节点数据。请确保AI返回符合大纲schema规范的JSON格式。'
    )
  }

  // 清理所有子节点标题中的Markdown/LaTeX标记
  for (const child of newChildren) {
    cleanNodeTitleMarkers(child)
  }

  return newChildren
}

/**
 * 生成节点内容（使用对话模式）
 * @param rawContentRef 可选的原始内容ref，用于实时显示流式输出内容
 * @param onUpdate 可选的更新回调，用于传递流式输出信息
 */
export async function generateNodeContent(
  node: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  signal?: AbortSignal,
  docFormat: 'md' | 'tex' = 'md',
  rawContentRef?: Ref<string>,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void,
  temperature?: number,
  wordCount?: number
): Promise<string> {
  const hasChildren = node.children && node.children.length > 0

  // 构建增强的用户提示词（包含字数要求）
  let enhancedUserPrompt = userPrompt
  if (wordCount) {
    enhancedUserPrompt += `\n目标字数：约${wordCount}字`
  }

  // 根据文档格式调整提示词
  const formatInstruction =
    docFormat === 'tex'
      ? '**重要：文档格式是LaTeX，请使用LaTeX语法生成内容（使用\\section{}, \\subsection{}等命令，不要使用Markdown的#、##等标记）。**'
      : '**重要：文档格式是Markdown，请使用Markdown语法生成内容（使用#、##等标题标记）。**'

  const basePrompt = hasChildren
    ? generateParentNodeContentPrompt(
        JSON.stringify(removeTextFromOutline(outlineTree)),
        JSON.stringify(node),
        enhancedUserPrompt
      )
    : generateContentPrompt(
        JSON.stringify(removeTextFromOutline(outlineTree)),
        JSON.stringify(node),
        enhancedUserPrompt
      )

  // 在提示词开头添加格式说明
  const prompt = formatInstruction + '\n\n' + basePrompt

  // 构建消息数组，将 prompt 转换为对话格式
  const messages: AIDialogMessage[] = []
  messages.push({
    role: 'user',
    content: prompt
  })

  const rawStringRef = rawContentRef || ref('')
  const meta: any = { stream: true }
  if (temperature !== undefined) {
    meta.temperature = temperature
  }
  const { handle, done } = createAiTask(
    node.title,
    messages,
    rawStringRef,
    ai_types.chat,
    'outline-content-' + node.title,
    meta
  )

  // Immediately pass streaming output info via onUpdate
  if (onUpdate) {
    onUpdate(
      {
        content: {
          stage: 'generating-content-streaming',
          rawContentRef: rawStringRef,
          rawContentDonePromise: done
        },
        format: 'json'
      },
      {
        percentage: 30,
        message: '正在生成节点内容（流式输出）...'
      }
    )
  }

  if (signal) {
    signal.addEventListener('abort', () => {
      cancelAiTask(handle, false)
    })
  }

  try {
    await done
  } catch (error) {
    if (signal?.aborted) {
      throw new Error('操作已取消')
    }
    const errorMessage = error instanceof Error ? error.message : String(error)
    getLogger().error('生成节点内容失败:', error)
    throw new Error(`生成节点内容失败: ${errorMessage}`)
  }

  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

  const rawContent = rawStringRef.value?.trim() || ''
  if (!rawContent) {
    return ''
  }

  // 提取JSON（如果有）
  const json = extractOuterJsonString(rawContent)
  if (json) {
    try {
      const parsed = JSON.parse(json)
      if (parsed && typeof parsed === 'object' && parsed.content) {
        return String(parsed.content).trim()
      }
    } catch (parseErr) {
      getLogger().warn('JSON解析失败，使用原始内容', parseErr)
    }
  }

  // 清理原始内容
  const cleaned = cleanRawContent(rawContent)
  return cleaned || rawContent
}

/**
 * 批量生成子节点的子节点（递归遍历所有叶子节点，为每个叶子节点生成子节点）
 * @param rootNode 根节点
 * @param outlineTree 完整的大纲树
 * @param userPrompt 用户提示词
 * @param docFormat 文档格式
 * @param signal 取消信号
 * @param onNodeProgress 每个节点生成进度的回调，参数为 (node, rawContentRef)
 * @param onUpdate 可选的更新回调，用于传递流式输出信息
 * @returns Promise<void>
 */
export async function generateChildrenChildren(
  rootNode: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  docFormat: 'md' | 'tex' = 'md',
  signal?: AbortSignal,
  onNodeProgress?: (node: DocumentOutlineNode, rawContentRef: Ref<string>) => void,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void,
  temperature?: number
): Promise<void> {
  const taskPromises: Promise<void>[] = []

  const traverseAndGenerate = async (curNode: DocumentOutlineNode): Promise<void> => {
    if (!curNode) return

    // 如果当前节点有子节点，先递归处理子节点
    if (curNode.children && curNode.children.length > 0) {
      await Promise.all(curNode.children.map((child) => traverseAndGenerate(child)))
      return
    }

    // 叶子节点，生成子节点
    try {
      const nodeRawContentRef = ref('')
      if (onNodeProgress) {
        onNodeProgress(curNode, nodeRawContentRef)
      }

      const newChildren = await generateChildNodes(
        curNode,
        outlineTree,
        userPrompt,
        signal,
        docFormat,
        nodeRawContentRef,
        onUpdate,
        true, // 启用fallback
        temperature // 传递温度参数
      )

      if (!curNode.children) {
        curNode.children = []
      }
      curNode.children.push(...newChildren)
    } catch (error) {
      getLogger().error(`为节点 ${curNode.path} 生成子节点失败:`, error)
      // 继续处理其他节点，不中断整个流程
    }
  }

  await traverseAndGenerate(rootNode)
}

/**
 * 批量生成子节点的内容（递归遍历所有子节点，为每个节点生成内容）
 * @param rootNode 根节点
 * @param outlineTree 完整的大纲树
 * @param userPrompt 用户提示词
 * @param docFormat 文档格式
 * @param signal 取消信号
 * @param onNodeProgress 每个节点生成进度的回调，参数为 (node, rawContentRef)
 * @param onUpdate 可选的更新回调，用于传递流式输出信息
 * @returns Promise<void>
 */
export async function generateChildrenContent(
  rootNode: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  docFormat: 'md' | 'tex' = 'md',
  signal?: AbortSignal,
  onNodeProgress?: (node: DocumentOutlineNode, rawContentRef: Ref<string>) => void,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void,
  temperature?: number,
  wordCount?: number
): Promise<void> {
  const taskPromises: Promise<void>[] = []

  const traverseAndGenerate = async (curNode: DocumentOutlineNode): Promise<void> => {
    if (!curNode) return

    // 如果当前节点有子节点，先递归处理子节点
    if (curNode.children && curNode.children.length > 0) {
      await Promise.all(curNode.children.map((child) => traverseAndGenerate(child)))
    }

    // 生成当前节点的内容（只处理非根节点）
    if (curNode.path !== 'dummy') {
      try {
        const nodeRawContentRef = ref('')
        if (onNodeProgress) {
          onNodeProgress(curNode, nodeRawContentRef)
        }

        // 构建增强的用户提示词（包含字数要求）
        let enhancedUserPrompt = userPrompt
        if (wordCount) {
          enhancedUserPrompt += `\n目标字数：约${wordCount}字`
        }

        const content = await generateNodeContent(
          curNode,
          outlineTree,
          enhancedUserPrompt,
          signal,
          docFormat,
          nodeRawContentRef,
          onUpdate,
          temperature, // 传递温度参数
          wordCount // 传递字数参数
        )
        curNode.text = content || ''
      } catch (error) {
        getLogger().error(`为节点 ${curNode.path} 生成内容失败:`, error)
        // 继续处理其他节点，不中断整个流程
      }
    }
  }

  await traverseAndGenerate(rootNode)
}

/**
 * 扩写节点内容
 * @param node 要扩写的节点
 * @param outlineTree 完整的大纲树
 * @param userPrompt 用户提示词
 * @param signal 取消信号
 * @param docFormat 文档格式
 * @param rawContentRef 用于实时显示原始内容的ref
 * @param onUpdate 可选的更新回调
 * @param temperature AI温度参数
 * @param wordCount 目标字数（通过提示词控制）
 * @returns Promise<string> 扩写后的内容
 */
export async function expandContent(
  node: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  signal?: AbortSignal,
  docFormat: 'md' | 'tex' = 'md',
  rawContentRef?: Ref<string>,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void,
  temperature?: number,
  wordCount?: number
): Promise<string> {
  if (!node.text) {
    throw new Error('节点内容为空，无法扩写')
  }

  const formatInstruction =
    docFormat === 'tex'
      ? '**重要：文档格式是LaTeX，请使用LaTeX语法生成内容（使用\\section{}, \\subsection{}等命令，不要使用Markdown的#、##等标记）。**'
      : '**重要：文档格式是Markdown，请使用Markdown语法生成内容（使用#、##等标题标记）。**'

  const basePrompt = expandContentPrompt(
    JSON.stringify(removeTextFromOutline(outlineTree)),
    JSON.stringify(node),
    node.text,
    userPrompt,
    wordCount
  )

  const prompt = formatInstruction + '\n\n' + basePrompt

  const messages: AIDialogMessage[] = [
    {
      role: 'user',
      content: prompt
    }
  ]

  const rawStringRef = rawContentRef || ref('')
  const meta: any = { stream: true }
  if (temperature !== undefined) {
    meta.temperature = temperature
  }

  const { handle, done } = createAiTask(
    `扩写: ${node.title}`,
    messages,
    rawStringRef,
    ai_types.chat,
    `outline-expand-${node.path}-${Date.now()}`,
    meta
  )

  if (onUpdate) {
    onUpdate(
      {
        content: {
          stage: 'expanding-content-streaming',
          rawContentRef: rawStringRef,
          rawContentDonePromise: done
        },
        format: 'json'
      },
      {
        percentage: 30,
        message: '正在扩写内容（流式输出）...'
      }
    )
  }

  if (signal) {
    signal.addEventListener('abort', () => {
      // 任务取消由 ai_tasks 内部处理
    })
  }

  try {
    await done
  } catch (error) {
    if (signal?.aborted) {
      throw new Error('操作已取消')
    }
    const errorMessage = error instanceof Error ? error.message : String(error)
    getLogger().error('扩写内容失败:', error)
    throw new Error(`扩写内容失败: ${errorMessage}`)
  }

  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

  const rawContent = rawStringRef.value?.trim() || ''
  if (!rawContent) {
    return node.text // 如果生成失败，返回原内容
  }

  const json = extractOuterJsonString(rawContent)
  if (json) {
    try {
      const parsed = JSON.parse(json)
      if (parsed && typeof parsed === 'object' && parsed.content) {
        return String(parsed.content).trim()
      }
    } catch (parseErr) {
      getLogger().warn('JSON解析失败，使用原始内容', parseErr)
    }
  }

  const cleaned = cleanRawContent(rawContent)
  return cleaned || rawContent
}

/**
 * 略写节点内容
 * @param node 要略写的节点
 * @param outlineTree 完整的大纲树
 * @param userPrompt 用户提示词
 * @param signal 取消信号
 * @param docFormat 文档格式
 * @param rawContentRef 用于实时显示原始内容的ref
 * @param onUpdate 可选的更新回调
 * @param temperature AI温度参数
 * @param wordCount 目标字数（通过提示词控制）
 * @returns Promise<string> 略写后的内容
 */
export async function abridgeContent(
  node: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  signal?: AbortSignal,
  docFormat: 'md' | 'tex' = 'md',
  rawContentRef?: Ref<string>,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void,
  temperature?: number,
  wordCount?: number
): Promise<string> {
  if (!node.text) {
    throw new Error('节点内容为空，无法略写')
  }

  const formatInstruction =
    docFormat === 'tex'
      ? '**重要：文档格式是LaTeX，请使用LaTeX语法生成内容（使用\\section{}, \\subsection{}等命令，不要使用Markdown的#、##等标记）。**'
      : '**重要：文档格式是Markdown，请使用Markdown语法生成内容（使用#、##等标题标记）。**'

  const basePrompt = abridgeContentPrompt(
    JSON.stringify(removeTextFromOutline(outlineTree)),
    JSON.stringify(node),
    node.text,
    userPrompt,
    wordCount
  )

  const prompt = formatInstruction + '\n\n' + basePrompt

  const messages: AIDialogMessage[] = [
    {
      role: 'user',
      content: prompt
    }
  ]

  const rawStringRef = rawContentRef || ref('')
  const meta: any = { stream: true }
  if (temperature !== undefined) {
    meta.temperature = temperature
  }

  const { handle, done } = createAiTask(
    `略写: ${node.title}`,
    messages,
    rawStringRef,
    ai_types.chat,
    `outline-abridge-${node.path}-${Date.now()}`,
    meta
  )

  if (onUpdate) {
    onUpdate(
      {
        content: {
          stage: 'abridging-content-streaming',
          rawContentRef: rawStringRef,
          rawContentDonePromise: done
        },
        format: 'json'
      },
      {
        percentage: 30,
        message: '正在略写内容（流式输出）...'
      }
    )
  }

  if (signal) {
    signal.addEventListener('abort', () => {
      // 任务取消由 ai_tasks 内部处理
    })
  }

  try {
    await done
  } catch (error) {
    if (signal?.aborted) {
      throw new Error('操作已取消')
    }
    const errorMessage = error instanceof Error ? error.message : String(error)
    getLogger().error('略写内容失败:', error)
    throw new Error(`略写内容失败: ${errorMessage}`)
  }

  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

  const rawContent = rawStringRef.value?.trim() || ''
  if (!rawContent) {
    return node.text // 如果生成失败，返回原内容
  }

  const json = extractOuterJsonString(rawContent)
  if (json) {
    try {
      const parsed = JSON.parse(json)
      if (parsed && typeof parsed === 'object' && parsed.content) {
        return String(parsed.content).trim()
      }
    } catch (parseErr) {
      getLogger().warn('JSON解析失败，使用原始内容', parseErr)
    }
  }

  const cleaned = cleanRawContent(rawContent)
  return cleaned || rawContent
}

/**
 * 润色节点内容
 * @param node 要润色的节点
 * @param outlineTree 完整的大纲树
 * @param userPrompt 用户提示词
 * @param signal 取消信号
 * @param docFormat 文档格式
 * @param rawContentRef 用于实时显示原始内容的ref
 * @param onUpdate 可选的更新回调
 * @param temperature AI温度参数
 * @returns Promise<string> 润色后的内容
 */
export async function polishContent(
  node: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  signal?: AbortSignal,
  docFormat: 'md' | 'tex' = 'md',
  rawContentRef?: Ref<string>,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void,
  temperature?: number
): Promise<string> {
  if (!node.text) {
    throw new Error('节点内容为空，无法润色')
  }

  const formatInstruction =
    docFormat === 'tex'
      ? '**重要：文档格式是LaTeX，请使用LaTeX语法生成内容（使用\\section{}, \\subsection{}等命令，不要使用Markdown的#、##等标记）。**'
      : '**重要：文档格式是Markdown，请使用Markdown语法生成内容（使用#、##等标题标记）。**'

  const basePrompt = polishContentPrompt(
    JSON.stringify(removeTextFromOutline(outlineTree)),
    JSON.stringify(node),
    node.text,
    userPrompt
  )

  const prompt = formatInstruction + '\n\n' + basePrompt

  const messages: AIDialogMessage[] = [
    {
      role: 'user',
      content: prompt
    }
  ]

  const rawStringRef = rawContentRef || ref('')
  const meta: any = { stream: true }
  if (temperature !== undefined) {
    meta.temperature = temperature
  }

  const { handle, done } = createAiTask(
    `润色: ${node.title}`,
    messages,
    rawStringRef,
    ai_types.chat,
    `outline-polish-${node.path}-${Date.now()}`,
    meta
  )

  if (onUpdate) {
    onUpdate(
      {
        content: {
          stage: 'polishing-content-streaming',
          rawContentRef: rawStringRef,
          rawContentDonePromise: done
        },
        format: 'json'
      },
      {
        percentage: 30,
        message: '正在润色内容（流式输出）...'
      }
    )
  }

  if (signal) {
    signal.addEventListener('abort', () => {
      // 任务取消由 ai_tasks 内部处理
    })
  }

  try {
    await done
  } catch (error) {
    if (signal?.aborted) {
      throw new Error('操作已取消')
    }
    const errorMessage = error instanceof Error ? error.message : String(error)
    getLogger().error('润色内容失败:', error)
    throw new Error(`润色内容失败: ${errorMessage}`)
  }

  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

  const rawContent = rawStringRef.value?.trim() || ''
  if (!rawContent) {
    return node.text // 如果生成失败，返回原内容
  }

  const json = extractOuterJsonString(rawContent)
  if (json) {
    try {
      const parsed = JSON.parse(json)
      if (parsed && typeof parsed === 'object' && parsed.content) {
        return String(parsed.content).trim()
      }
    } catch (parseErr) {
      getLogger().warn('JSON解析失败，使用原始内容', parseErr)
    }
  }

  const cleaned = cleanRawContent(rawContent)
  return cleaned || rawContent
}
