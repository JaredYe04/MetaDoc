/**
 * 大纲AI生成工具函数
 * 提供统一的大纲节点生成、内容生成等功能，使用对话模式（chat）以提高AI理解准确性
 */

import { ref, type Ref } from 'vue'
import type { DocumentOutlineNode } from '../../../types'
import { createAiTask, ai_types } from './ai_tasks'
import { expandTreeNodePrompt, generateContentPrompt, generateParentNodeContentPrompt } from './prompts'
import { TREE_NODE_SCHEMA } from '../constants/document'
import { removeTextFromOutline } from './document/outline'
import { extractOuterJsonString } from './regex-utils'
import { createRendererLogger } from './logger'
import type { AIDialogMessage } from '../../../types'

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
  const extractBracedContent = (str: string, startPos: number): { content: string; endPos: number } | null => {
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
    'part', 'chapter', 'section', 'subsection', 'subsubsection',
    'paragraph', 'subparagraph', 'title'
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
    /^生成的内容[：:]\s*/i,
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
      if (/^(请|现在|输出|根据|我将|好的|明白了)/i.test(trimmedLine) && 
          /(格式|输出|示例|不要|添加)/i.test(trimmedLine)) {
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
 * 生成节点的子节点（使用对话模式）
 * @param rawContentRef 可选的原始内容ref，用于实时显示流式输出内容
 */
export async function generateChildNodes(
  node: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  signal?: AbortSignal,
  docFormat: 'md' | 'tex' = 'md',
  rawContentRef?: Ref<string>
): Promise<DocumentOutlineNode[]> {
  const basePrompt = expandTreeNodePrompt(
    JSON.stringify(removeTextFromOutline(outlineTree)),
    JSON.stringify(node),
    JSON.stringify(TREE_NODE_SCHEMA),
    userPrompt
  )

  // 根据文档格式调整提示词（子节点的title也需要使用正确的格式）
  const formatInstruction = docFormat === 'tex' 
    ? '**重要：文档格式是LaTeX，生成的节点标题应该使用LaTeX格式（例如：\\section{标题}），不要使用Markdown的#、##等标记。**'
    : '**重要：文档格式是Markdown，生成的节点标题应该使用Markdown格式（例如：# 标题、## 标题），不要使用LaTeX的\\section{}等命令。**'
  
  const prompt = formatInstruction + '\n\n' + basePrompt

  // 构建消息数组，将 prompt 转换为对话格式
  const messages: AIDialogMessage[] = []
  messages.push({
    role: 'user',
    content: prompt,
  })

  const rawStringRef = rawContentRef || ref('')
  const { handle, done } = createAiTask(
    node.title,
    messages,
    rawStringRef,
    ai_types.chat,
    'outline-children-' + node.title,
    { stream: true }
  )

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

  const json = extractOuterJsonString(rawContent)
  if (!json) {
    getLogger().warn('未能提取JSON，无法生成子节点')
    throw new Error('未能从AI响应中提取有效的JSON格式数据')
  }

  try {
    const newChildren = JSON.parse(json) as DocumentOutlineNode[]
    if (!Array.isArray(newChildren) || newChildren.length === 0) {
      throw new Error('解析出的子节点列表为空或格式不正确')
    }

    // 清理所有子节点标题中的Markdown/LaTeX标记
    for (const child of newChildren) {
      cleanNodeTitleMarkers(child)
    }

    return newChildren
  } catch (parseErr) {
    const errorMsg = parseErr instanceof Error ? parseErr.message : String(parseErr)
    getLogger().error('JSON解析失败', parseErr)
    throw new Error(`解析子节点JSON失败: ${errorMsg}`)
  }
}

/**
 * 生成节点内容（使用对话模式）
 * @param rawContentRef 可选的原始内容ref，用于实时显示流式输出内容
 */
export async function generateNodeContent(
  node: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  signal?: AbortSignal,
  docFormat: 'md' | 'tex' = 'md',
  rawContentRef?: Ref<string>
): Promise<string> {
  const hasChildren = node.children && node.children.length > 0

  // 根据文档格式调整提示词
  const formatInstruction = docFormat === 'tex' 
    ? '**重要：文档格式是LaTeX，请使用LaTeX语法生成内容（使用\\section{}, \\subsection{}等命令，不要使用Markdown的#、##等标记）。**'
    : '**重要：文档格式是Markdown，请使用Markdown语法生成内容（使用#、##等标题标记）。**'
  
  const basePrompt = hasChildren
    ? generateParentNodeContentPrompt(
        JSON.stringify(removeTextFromOutline(outlineTree)),
        JSON.stringify(node),
        userPrompt
      )
    : generateContentPrompt(
        JSON.stringify(removeTextFromOutline(outlineTree)),
        JSON.stringify(node),
        userPrompt
      )
  
  // 在提示词开头添加格式说明
  const prompt = formatInstruction + '\n\n' + basePrompt

  // 构建消息数组，将 prompt 转换为对话格式
  const messages: AIDialogMessage[] = []
  messages.push({
    role: 'user',
    content: prompt,
  })

  const rawStringRef = rawContentRef || ref('')
  const { handle, done } = createAiTask(
    node.title,
    messages,
    rawStringRef,
    ai_types.chat,
    'outline-content-' + node.title,
    { stream: true }
  )

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

