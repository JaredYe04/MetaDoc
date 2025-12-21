/**
 * 大纲优化Tool
 * 基于Outline.vue的AI工具，生成/优化大纲并同步文章内容
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
import { cancelAiTask, createAiTask, ai_types } from '../ai_tasks'
import { getSetting } from '../settings'
import { ref } from 'vue'
import type { DocumentOutlineNode, AIDialogMessage } from '@/types'
import { 
  searchNode, 
  removeTextFromOutline,
  generateMarkdownFromOutlineTree 
} from '../document/outline'
import { searchParentNode } from '../outline-helpers'
import { 
  expandTreeNodePrompt, 
  generateContentPrompt, 
  generateParentNodeContentPrompt 
} from '../prompts'
import { TREE_NODE_SCHEMA } from '../../constants/document'
import { extractOuterJsonString } from '../regex-utils'
import { getOutlineAdapter } from '../outline-adapters'
import { parseJsonWithClean, isJsonParseError } from './tool-utils'
import { 
  generateChildNodes as generateChildNodesUtil,
  generateNodeContent as generateNodeContentUtil,
  cleanTitleMarkers,
  cleanNodeTitleMarkers,
  cleanRawContent as cleanRawContentUtil
} from '../outline-ai-utils'
import OutlineOptimizeDisplay from './components/OutlineOptimizeDisplay.vue'
import { getActiveDocumentInfoViaBroadcast } from './document-broadcast-helper'
import { getWindowType } from '../event-bus'

const logger = createRendererLogger('OutlineOptimizeTool')
const workspace = useWorkspace()

// 清理函数已迁移到 outline-ai-utils.ts，使用导入的版本

/**
 * 重新生成路径（广度优先遍历）
 */
function regeneratePaths(node: DocumentOutlineNode): void {
  // 为根节点的子节点分配编号
  for (let i = 0; i < node.children.length; i++) {
    node.children[i].path = `${i + 1}`
  }
  
  // 广度优先遍历，为所有子节点生成路径
  const queue = [...node.children]
  while (queue.length > 0) {
    const currentNode = queue.shift()!
    for (let i = 0; i < currentNode.children.length; i++) {
      currentNode.children[i].path = `${currentNode.path}.${i + 1}`
      queue.push(currentNode.children[i])
    }
  }
}

/**
 * 移除节点（从父节点中删除）
 */
function removeNode(parent: DocumentOutlineNode, node: DocumentOutlineNode): void {
  if (!parent.children) return
  const index = parent.children.indexOf(node)
  if (index !== -1) {
    parent.children.splice(index, 1)
  } else {
    // 递归查找
    parent.children.forEach((child) => removeNode(child, node))
  }
}

/**
 * 判断是否为后代节点
 */
function isDescendant(candidatePath: string, ancestorPath: string): boolean {
  if (!ancestorPath) return false
  return candidatePath === ancestorPath || candidatePath.startsWith(ancestorPath + '.')
}

/**
 * 从自然语言文本中提取章节列表
 * 支持多种格式：列表、标题、编号等
 */
function extractChaptersFromText(text: string, docFormat: 'md' | 'tex' = 'md'): DocumentOutlineNode[] | null {
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
    if (trimmedLine.match(/^(以下是|生成|包括|包含|建议|推荐|可以|应该|注意|提示|说明|例如|比如)/i)) {
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
      const chineseNumberMatch = trimmedLine.match(/^(第[一二三四五六七八九十\d百千万]+[章节部分])\s*(.+)$/)
      if (chineseNumberMatch) {
        title = chineseNumberMatch[2].trim() || chineseNumberMatch[1].trim()
      }
      // 3. 匹配编号列表：1. 标题、1) 标题、一、标题
      else {
        const numberedListMatch = trimmedLine.match(/^[\d一二三四五六七八九十]+[\.、：：）)]\s*(.+)$/)
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
    logger.info(`从自然语言文本中提取到 ${chapters.length} 个章节`)
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
  signal?: AbortSignal
): Promise<DocumentOutlineNode[]> {
  const formatInstruction = docFormat === 'tex' 
    ? '**重要：文档格式是LaTeX，生成的节点标题应该使用LaTeX格式（例如：\\section{标题}），不要使用Markdown的#、##等标记。**'
    : '**重要：文档格式是Markdown，生成的节点标题应该使用Markdown格式（例如：# 标题、## 标题），不要使用LaTeX的\\section{}等命令。**'

  // 计算当前节点的title_level，子节点的title_level应该是父节点+1
  const parentTitleLevel = node.title_level || 0
  const childTitleLevel = parentTitleLevel + 1

  const conversionPrompt = `${formatInstruction}

你是一个专业的文档结构生成助手。请根据以下信息，生成符合大纲schema规范的JSON数组格式的章节列表。

**大纲节点Schema规范**：
${JSON.stringify(TREE_NODE_SCHEMA, null, 2)}

**重要要求**：
1. 必须严格按照上述schema规范生成JSON，每个节点必须包含：path、title、text、title_level、children字段
2. path字段暂时留空（后续会自动生成），但必须包含该字段
3. title字段：章节标题，根据文档格式使用正确的格式（Markdown或LaTeX）
4. text字段：暂时留空字符串""
5. title_level字段：子节点的层级应该是 ${childTitleLevel}（父节点层级${parentTitleLevel} + 1）
6. children字段：空数组[]
7. **必须返回完整的JSON数组，不要中途停止，不要只返回部分内容**
8. **只返回JSON数组，不要包含任何其他说明文字、代码块标记或解释**

**当前节点信息**：
- 节点标题：${node.title || '根节点'}
- 节点路径：${node.path}
- 节点层级：${parentTitleLevel}

**用户提示词**：${userPrompt || '无'}

**AI返回的文本内容**（可能是自然语言描述、列表或其他格式）：
${text.substring(0, 2000)}${text.length > 2000 ? '...' : ''}

**请严格按照schema规范返回完整的JSON数组格式**，例如：
[
  {"path": "", "title": "章节1", "text": "", "title_level": ${childTitleLevel}, "children": []},
  {"path": "", "title": "章节2", "text": "", "title_level": ${childTitleLevel}, "children": []}
]

**关键要求**：
- **必须返回完整的JSON数组，从 [ 开始，到 ] 结束**
- **不要包含任何代码块标记（如\`\`\`json）**
- **不要包含任何说明文字**
- **确保JSON格式完全正确，可以被JSON.parse()解析**
- **如果文本内容中包含章节信息，请提取并转换为符合schema的节点**
- **如果文本内容只是说明文字（如"请确保JSON格式正确"），请根据用户提示词和当前节点信息，生成合理的章节列表**
- **必须生成至少3个章节节点，确保返回完整的JSON数组**
`

  // 构建消息数组，将 prompt 转换为对话格式
  const messages: AIDialogMessage[] = []
  messages.push({
    role: 'user',
    content: conversionPrompt,
  })

  const rawStringRef = ref('')
  const { handle, done } = createAiTask(
    `转换文本为章节列表: ${node.title}`,
    messages,
    rawStringRef,
    ai_types.chat,
    `outline-convert-${node.path}-${Date.now()}`,
    { 
      stream: true,
    }
  )

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
    logger.error('AI转换文本失败:', error)
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
    logger.warn(`AI返回内容过短（${convertedContent.length}字符），可能是提前停止: ${convertedContent.substring(0, 100)}`)
    throw new Error(`AI返回内容过短（${convertedContent.length}字符），可能未完成生成。返回内容：${convertedContent.substring(0, 200)}。请确保AI返回完整的JSON数组格式。`)
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
    logger.error(`无法提取JSON，原始内容前500字符: ${convertedContent.substring(0, 500)}`)
    throw new Error(`AI转换后仍无法提取JSON格式。请确保AI返回有效的JSON数组格式。返回内容前200字符：${convertedContent.substring(0, 200)}`)
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
        logger.warn(`节点 ${i} 不是有效对象，跳过`)
        continue
      }

      // 验证必需字段
      if (typeof node.title !== 'string' || !node.title.trim()) {
        logger.warn(`节点 ${i} 的title字段无效，跳过`)
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

    logger.info(`成功验证并转换 ${validatedNodes.length} 个符合schema规范的节点`)
    return validatedNodes
  } catch (parseError) {
    const errorMsg = parseError instanceof Error ? parseError.message : String(parseError)
    logger.error('解析AI转换结果失败:', errorMsg)
    throw new Error(`解析转换结果失败: ${errorMsg}`)
  }
}

/**
 * 生成节点的子节点（使用工具函数作为主要方式，保留自然语言转换作为fallback）
 */
async function generateChildNodes(
  node: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  docFormat: 'md' | 'tex' = 'md',
  signal?: AbortSignal
): Promise<DocumentOutlineNode[]> {
  // 先尝试使用工具函数生成（使用对话模式）
  try {
    return await generateChildNodesUtil(node, outlineTree, userPrompt, signal, docFormat)
  } catch (error) {
    // 如果基础生成失败，尝试自然语言转换（fallback）
    logger.warn('基础生成失败，尝试自然语言转换', error)
    // 继续使用下面的自然语言转换逻辑
  }

  // Fallback: 使用自然语言转换（保留原有复杂逻辑）

  // 如果基础生成失败，使用自然语言转换（保留原有逻辑作为fallback）
  const rawStringRef = ref('')
  
  // 构建提示词（使用工具函数中的逻辑，但保留转换能力）
  const basePrompt = expandTreeNodePrompt(
    JSON.stringify(removeTextFromOutline(outlineTree)),
    JSON.stringify(node),
    JSON.stringify(TREE_NODE_SCHEMA),
    userPrompt
  )
  
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

  const { handle, done } = createAiTask(
    `生成子节点: ${node.title}`,
    messages,
    rawStringRef,
    ai_types.chat,
    `outline-children-${node.path}-${Date.now()}`,
    { 
      stream: true,
    }
  )

  if (signal) {
    signal.addEventListener('abort', () => {
      cancelAiTask(handle, false, false)
    })
  }

  try {
    await done
  } catch (error) {
    // 如果任务被取消或出错，检查是否是因为取消
    if (signal?.aborted) {
      throw new Error('操作已取消')
    }
    // 重新抛出原始错误，让调用者知道任务失败
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('生成子节点失败:', error)
    throw new Error(`AI任务失败: ${errorMessage}`)
  }

  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

  const rawContent = rawStringRef.value?.trim() || ''
  if (!rawContent) {
    throw new Error('AI返回内容为空')
  }

  // 检查内容是否太短（可能是AI提前停止）
  if (rawContent.length < 50) {
    logger.warn(`AI返回内容过短（${rawContent.length}字符），可能是提前停止: ${rawContent.substring(0, 100)}`)
    throw new Error(`AI返回内容过短（${rawContent.length}字符），可能未完成生成。返回内容：${rawContent.substring(0, 200)}。请确保AI返回完整的JSON数组格式。`)
  }

  // 提取JSON（使用多种方式，更灵活）
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
    // 尝试直接解析（可能是纯JSON数组）
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
      .replace(/^[^\[\{]*[\[\{]/, (match) => {
        const bracket = match[match.length - 1]
        return bracket === '[' ? '[' : '{'
      })
      // 移除JSON后的说明文字
      .replace(/[\]\}][^\]\}]*$/, (match) => {
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

  // 如果JSON提取失败，使用LLM将自然语言转换为符合schema规范的JSON
  let newChildren: DocumentOutlineNode[] | null = null
  
  if (json) {
    // 尝试解析JSON
    try {
      newChildren = JSON.parse(json) as DocumentOutlineNode[]
      if (Array.isArray(newChildren) && newChildren.length > 0) {
        // 验证节点结构是否符合schema
        const isValid = newChildren.every(child => 
          child && 
          typeof child.title === 'string' && 
          Array.isArray(child.children)
        )
        if (isValid) {
          logger.info('成功解析JSON格式的子节点数据')
        } else {
          logger.warn('JSON格式不符合schema规范，尝试使用LLM重新生成')
          newChildren = null
        }
      } else {
        newChildren = null
      }
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : String(parseError)
      logger.warn('解析子节点JSON失败，尝试修复:', errorMsg)
      
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
          const isValid = newChildren.every(child => 
            child && 
            typeof child.title === 'string' && 
            Array.isArray(child.children)
          )
          if (isValid) {
            logger.info('修复JSON格式后成功解析')
          } else {
            logger.warn('修复后的JSON格式不符合schema规范，尝试使用LLM重新生成')
            newChildren = null
          }
        } else {
          newChildren = null
        }
      } catch (fixError) {
        logger.warn('修复JSON格式失败，将使用LLM将自然语言转换为符合schema规范的JSON')
        newChildren = null
      }
    }
  }

  // 如果JSON解析失败或提取失败，使用LLM将自然语言转换为符合schema规范的JSON
  if (!newChildren || !Array.isArray(newChildren) || newChildren.length === 0) {
    logger.info('检测到自然语言输入，使用LLM生成符合schema规范的JSON格式章节列表')
    try {
      newChildren = await convertTextToJsonChapters(rawContent, node, outlineTree, userPrompt, docFormat, signal)
      if (newChildren && newChildren.length > 0) {
        logger.info(`LLM转换成功，生成 ${newChildren.length} 个符合schema规范的章节`)
      } else {
        throw new Error('LLM转换后未生成有效章节')
      }
    } catch (convertError) {
      logger.error('LLM转换失败:', convertError)
      throw new Error(`无法从AI响应中提取有效的子节点数据。请确保AI返回有效的JSON格式或清晰的章节列表。错误：${convertError instanceof Error ? convertError.message : String(convertError)}`)
    }
  }

  // 如果所有方法都失败，抛出错误
  if (!newChildren || !Array.isArray(newChildren) || newChildren.length === 0) {
    logger.warn('所有解析方法都失败，原始内容前500字符:', rawContent.substring(0, 500))
    throw new Error('未能从AI响应中提取有效的子节点数据。请确保AI返回符合大纲schema规范的JSON格式。')
  }

  // 为子节点生成路径
  for (const child of newChildren) {
    regeneratePaths(child)
  }

  // 清理所有子节点标题中的Markdown/LaTeX标记（因为title_level已经决定了层级）
  for (const child of newChildren) {
    cleanNodeTitleMarkers(child)
  }

  return newChildren
}

/**
 * 生成节点内容（使用工具函数）
 */
async function generateNodeContent(
  node: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  docFormat: 'md' | 'tex' = 'md',
  signal?: AbortSignal
): Promise<string> {
  // 直接使用工具函数（已支持 docFormat 参数和对话模式）
  return await generateNodeContentUtil(node, outlineTree, userPrompt, signal, docFormat)
}

/**
 * 同步大纲到文档
 */
async function syncOutlineToDocument(
  tabId: string,
  outline: DocumentOutlineNode,
  docFormat?: 'md' | 'tex',
  docMarkdown?: string,
  docTex?: string
): Promise<void> {
  const windowType = getWindowType()
  
  // 在设置窗口中，无法直接更新文档，只能通过广播通知主窗口
  if (windowType === 'setting') {
    logger.warn('在设置窗口中无法直接同步文档，需要通过广播通知主窗口')
    // TODO: 可以通过广播通知主窗口更新文档
    return
  }

  const doc = workspace.ensureDocument(tabId)
  if (!doc) {
    throw new Error('文档不存在')
  }

  // 更新大纲
  workspace.updateDocumentOutline(tabId, outline)
  workspace.updateDocumentLastView(tabId, 'outline')

  // 使用适配器同步正文文本
  const format = docFormat || doc.format
  const adapter = getOutlineAdapter(format)
  
  if (format === 'tex') {
    const currentTex = docTex || doc.tex
    const nextTex = await adapter.toText(outline, currentTex)
    workspace.updateDocumentTex(tabId, nextTex)
  } else {
    const currentMd = docMarkdown || doc.markdown
    const nextMd = await adapter.toText(outline, currentMd)
    workspace.updateDocumentMarkdown(tabId, nextMd)
  }
}

/**
 * 大纲优化Tool回调函数
 */
const outlineOptimizeToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const operation = params.operation as 'generateChildren' | 'generateContent' | 'generateChildrenChildren' | 'generateChildrenContent' | 'moveNode' | 'deleteNodes' | 'clearOutline'
  const nodePath = params.nodePath as string | undefined
  const nodePaths = params.nodePaths as string[] | undefined  // 批量操作的节点路径数组
  const targetPath = params.targetPath as string | undefined  // 移动操作的目标路径
  const moveMode = params.moveMode as 'before' | 'after' | 'inside' | undefined  // 移动模式
  const userPrompt = (params.userPrompt as string) || ''
  const tabId = params.tabId as string | undefined

  if (!operation) {
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.outlineOptimize.error.missingOperation', '缺少必需参数: operation')
    }
  }

  const validOperations = ['generateChildren', 'generateContent', 'generateChildrenChildren', 'generateChildrenContent', 'moveNode', 'deleteNodes', 'clearOutline']
  if (!validOperations.includes(operation)) {
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.outlineOptimize.error.invalidOperation', `无效的操作: ${operation}`)
    }
  }

  try {
    onUpdate({
      content: {
        stage: 'loading',
        operation
      },
      format: 'json'
    }, {
      percentage: 10,
      message: i18n.global.t('agent.tool.outlineOptimize.progress.loading', '正在加载文档...')
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
          error: i18n.global.t('agent.tool.outlineOptimize.error.noActiveTab', '没有活动的文档标签页')
        }
      }
      doc = {
        markdown: docInfo.markdown,
        tex: docInfo.tex,
        format: docInfo.format,
        outline: docInfo.outline,
        path: docInfo.path
      }
      targetTabId = docInfo.tabId
    } else {
      // 在主窗口中，直接使用workspace
      targetTabId = tabId || workspace.activeTabId.value
      if (!targetTabId) {
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.outlineOptimize.error.noActiveTab', '没有活动的文档标签页')
        }
      }
      doc = workspace.ensureDocument(targetTabId)
      if (!doc) {
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.outlineOptimize.error.documentNotFound', '文档不存在')
        }
      }
    }

    // 确保文档格式已设置（如果未设置，默认为md）
    if (!doc.format) {
      doc.format = 'md'
      logger.warn('文档格式未设置，默认使用Markdown格式')
    }
    
    // 获取大纲树
    let outlineTree = doc.outline
    if (!outlineTree) {
      return {
        status: 'failed',
        error: i18n.global.t('agent.tool.outlineOptimize.error.emptyOutline', '文档大纲为空')
      }
    }

    // 对于clearOutline和generateChildren操作，允许只有dummy节点（空大纲）
    // 对于generateChildren，即使只有dummy节点，也可以为根节点生成子节点
    const allowEmptyOutline = ['clearOutline', 'generateChildren'].includes(operation)
    if (!allowEmptyOutline && (!outlineTree.children || outlineTree.children.length === 0)) {
      return {
        status: 'failed',
        error: i18n.global.t('agent.tool.outlineOptimize.error.emptyOutline', '文档大纲为空')
      }
    }

    // 查找目标节点（某些操作不需要targetNode）
    let targetNode: DocumentOutlineNode | null = null
    const needsTargetNode = ['generateChildren', 'generateContent', 'generateChildrenChildren', 'generateChildrenContent', 'moveNode'].includes(operation)
    
    if (needsTargetNode) {
      // 支持nodePath为"all"的情况（用于批量操作根节点的所有子节点）
      if (nodePath === 'all' || nodePath === 'dummy') {
        // 对于"all"或"dummy"，使用根节点
        targetNode = outlineTree
      } else if (nodePath) {
      targetNode = searchNode(nodePath, outlineTree)
      if (!targetNode) {
        return {
          status: 'failed',
            error: i18n.global.t('agent.tool.outlineOptimize.error.nodeNotFound', `找不到路径为 ${nodePath} 的节点。提示：可以使用"dummy"指定根节点，或使用outline-tree工具查看节点路径`)
        }
      }
    } else {
        // 如果没有指定节点路径，根据操作类型选择默认节点
        // generateChildren可以为根节点生成子节点，即使只有dummy节点
        if (operation === 'generateChildren') {
          targetNode = outlineTree
        } else if (outlineTree.children && outlineTree.children.length > 0) {
          // 其他操作使用第一个非根节点
        targetNode = outlineTree.children[0]
      } else {
          // 没有子节点且不是generateChildren操作，报错
        return {
          status: 'failed',
            error: i18n.global.t('agent.tool.outlineOptimize.error.noTargetNode', '没有可操作的节点。提示：请先使用generateChildren为根节点生成子节点，或使用nodePath: "dummy"为根节点生成子节点')
        }
      }
    }

    if (!targetNode) {
      return {
        status: 'failed',
        error: i18n.global.t('agent.tool.outlineOptimize.error.noTargetNode', '没有可操作的节点')
        }
      }
    }

    // 锁定UI（防止并发操作）
    workspace.lockUI?.()

    try {
      // 深拷贝大纲树（避免直接修改原对象）
      const workingOutline = JSON.parse(JSON.stringify(outlineTree)) as DocumentOutlineNode
      let workingNode: DocumentOutlineNode | null = null
      
      // 对于需要workingNode的操作，查找工作副本中的节点
      if (targetNode) {
        workingNode = searchNode(targetNode.path, workingOutline)
        if (!workingNode && needsTargetNode) {
        throw new Error('无法在工作副本中找到目标节点')
        }
      }
      
      // 对于需要workingNode的操作，确保workingNode不为null
      if (needsTargetNode) {
        if (!workingNode) {
          throw new Error('无法找到目标节点')
        }
      }

      // 用于存储生成结果
      let generatedChildrenInfo: any[] = []
      let generatedContentInfo: any = null

      // 根据操作类型执行不同的生成任务
      if (operation === 'generateChildren') {
        // 为指定节点生成子节点
        if (!workingNode) {
          throw new Error('无法找到目标节点')
        }
        onUpdate({
          content: {
            stage: 'generating',
            operation,
            nodePath: workingNode.path,
            nodeTitle: workingNode.title
          },
          format: 'json'
        }, {
          percentage: 30,
          message: i18n.global.t('agent.tool.outlineOptimize.progress.generatingChildren', `正在为节点 "${workingNode.title}" 生成子节点...`)
        })

        const newChildren = await generateChildNodes(workingNode, workingOutline, userPrompt, doc.format, signal)
        if (!workingNode.children) {
          workingNode.children = []
        }
        workingNode.children.push(...newChildren)
        regeneratePaths(workingOutline)
        
        // 记录生成的子节点信息
        generatedChildrenInfo = newChildren.map(child => ({
          path: child.path,
          title: child.title
        }))

      } else if (operation === 'generateContent') {
        // 为指定节点生成内容
        if (!workingNode) {
          throw new Error('无法找到目标节点')
        }
        onUpdate({
          content: {
            stage: 'generating',
            operation,
            nodePath: workingNode.path,
            nodeTitle: workingNode.title
          },
          format: 'json'
        }, {
          percentage: 30,
          message: i18n.global.t('agent.tool.outlineOptimize.progress.generatingContent', `正在为节点 "${workingNode.title}" 生成内容...`)
        })

        const content = await generateNodeContent(workingNode, workingOutline, userPrompt, doc.format, signal)
        workingNode.text = content
        
        // 记录生成的内容信息
        generatedContentInfo = {
          content: content,
          contentLength: content.length,
          contentPreview: content.length > 100 
            ? content.substring(0, 100) + '...' 
            : content
        }

      } else if (operation === 'generateChildrenChildren') {
        // 为指定节点的所有子节点生成子节点
        if (!workingNode) {
          throw new Error('无法找到目标节点')
        }
        onUpdate({
          content: {
            stage: 'generating',
            operation,
            nodePath: workingNode.path,
            nodeTitle: workingNode.title
          },
          format: 'json'
        }, {
          percentage: 20,
          message: i18n.global.t('agent.tool.outlineOptimize.progress.generatingChildrenChildren', `正在为节点 "${workingNode.title}" 的所有子节点生成子节点...`)
        })

        const taskPromises: Promise<void>[] = []

        const traverseAndGenerate = async (curNode: DocumentOutlineNode): Promise<void> => {
          if (!curNode) return

          // 如果当前节点有子节点，先递归处理子节点
          if (curNode.children && curNode.children.length > 0) {
            await Promise.all(curNode.children.map(child => traverseAndGenerate(child)))
            return
          }

          // 叶子节点，生成子节点
          try {
            const newChildren = await generateChildNodes(curNode, workingOutline, userPrompt, doc.format, signal)
            if (!curNode.children) {
              curNode.children = []
            }
            curNode.children.push(...newChildren)
          } catch (error) {
            logger.error(`为节点 ${curNode.path} 生成子节点失败:`, error)
            // 继续处理其他节点，不中断整个流程
          }
        }

        await traverseAndGenerate(workingNode)
        regeneratePaths(workingOutline)

      } else if (operation === 'generateChildrenContent') {
        // 为指定节点的所有子节点生成内容
        if (!workingNode) {
          throw new Error('无法找到目标节点')
        }
        onUpdate({
          content: {
            stage: 'generating',
            operation,
            nodePath: workingNode.path,
            nodeTitle: workingNode.title
          },
          format: 'json'
        }, {
          percentage: 20,
          message: i18n.global.t('agent.tool.outlineOptimize.progress.generatingChildrenContent', `正在为节点 "${workingNode.title}" 的所有子节点生成内容...`)
        })

        const taskPromises: Promise<void>[] = []

        const traverseAndGenerate = async (curNode: DocumentOutlineNode): Promise<void> => {
          if (!curNode) return

          // 如果当前节点有子节点，先递归处理子节点
          if (curNode.children && curNode.children.length > 0) {
            await Promise.all(curNode.children.map(child => traverseAndGenerate(child)))
          }

          // 生成当前节点的内容（只处理非根节点）
          if (curNode.path !== 'dummy') {
            try {
              const content = await generateNodeContent(curNode, workingOutline, userPrompt, doc.format, signal)
              curNode.text = content || ''
            } catch (error) {
              logger.error(`为节点 ${curNode.path} 生成内容失败:`, error)
              // 继续处理其他节点，不中断整个流程
            }
          }
        }

        await traverseAndGenerate(workingNode)
      } else if (operation === 'clearOutline') {
        // 清空大纲树：保留根节点，清空所有子节点
        onUpdate({
          content: {
            stage: 'clearing',
            operation
          },
          format: 'json'
        }, {
          percentage: 30,
          message: i18n.global.t('agent.tool.outlineOptimize.progress.clearing', '正在清空大纲树...')
        })
        
        // 清空所有子节点和文本
        workingOutline.children = []
        workingOutline.text = ''
      }

      if (signal?.aborted) {
        return {
          status: 'cancelled'
        }
      }

      // 同步大纲到文档（clearOutline操作也需要同步）
      onUpdate({
        content: {
          stage: 'syncing',
          operation
        },
        format: 'json'
      }, {
        percentage: 90,
        message: i18n.global.t('agent.tool.outlineOptimize.progress.syncing', '正在同步文档内容...')
      })

      await syncOutlineToDocument(targetTabId, workingOutline, doc.format, doc.markdown, doc.tex)

      onUpdate({
        content: {
          stage: 'completed',
        },
        format: 'json'
      }, {
        percentage: 100,
        message: i18n.global.t('agent.tool.outlineOptimize.progress.completed', '大纲优化完成')
      })

      // 构建返回结果，包含生成的具体内容
      let resultData: any = {
        operation,
        success: true
      }

      // 对于需要targetNode的操作，添加节点信息
      if (targetNode && ['generateChildren', 'generateContent', 'generateChildrenChildren', 'generateChildrenContent'].includes(operation)) {
        resultData.nodePath = targetNode.path
        resultData.nodeTitle = targetNode.title
      }

      if (operation === 'generateChildren') {
        resultData.generatedChildren = generatedChildrenInfo
        resultData.childrenCount = generatedChildrenInfo.length
      } else if (operation === 'generateContent') {
        if (generatedContentInfo) {
          resultData.generatedContent = generatedContentInfo.content
          resultData.contentLength = generatedContentInfo.contentLength
          resultData.contentPreview = generatedContentInfo.contentPreview
        }
      } else if (operation === 'generateChildrenChildren') {
        // 统计所有生成的子节点
        const allGenerated: any[] = []
        const collectChildren = (node: DocumentOutlineNode) => {
          if (node.children) {
            for (const child of node.children) {
              allGenerated.push({
                path: child.path,
                title: child.title
              })
              collectChildren(child)
            }
          }
        }
        if (workingNode) {
        collectChildren(workingNode)
        resultData.generatedChildren = allGenerated
        resultData.totalChildrenCount = allGenerated.length
        }
      } else if (operation === 'generateChildrenContent') {
        // 统计所有生成的内容
        const allContent: any[] = []
        const collectContent = (node: DocumentOutlineNode) => {
          if (node.text) {
            allContent.push({
              path: node.path,
              title: node.title,
              contentLength: node.text.length,
              contentPreview: node.text.length > 100 
                ? node.text.substring(0, 100) + '...'
                : node.text
            })
          }
          if (node.children) {
            for (const child of node.children) {
              collectContent(child)
            }
          }
        }
        if (workingNode) {
        collectContent(workingNode)
        }
        resultData.generatedContent = allContent
        resultData.totalContentCount = allContent.length
      } else if (operation === 'moveNode') {
        resultData.movedNodePath = nodePath
        resultData.targetPath = targetPath
        resultData.moveMode = moveMode
      } else if (operation === 'deleteNodes') {
        resultData.deletedNodePaths = nodePaths || (nodePath ? [nodePath] : [])
        resultData.deletedCount = resultData.deletedNodePaths.length
      } else if (operation === 'clearOutline') {
        resultData.cleared = true
      }

      const responseData: any = {
            stage: 'completed',
            operation,
            ...resultData
      }

      // 添加节点信息（如果存在）
      if (targetNode) {
        responseData.nodePath = targetNode.path
        responseData.nodeTitle = targetNode.title
      }

      return {
        status: 'succeeded',
        data: {
          content: responseData,
          format: 'json'
        },
        result: resultData
      }
    } finally {
      workspace.unlockUI?.()
    }
  } catch (error) {
    logger.error('大纲优化失败:', error)
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

const outlineOptimizeToolLocales: ToolLocales = {
  zh_cn: {
    name: '大纲优化',
    description: '使用AI生成/优化文档大纲，包括生成子节点、生成内容等功能，并自动同步到文档'
  },
  en_us: {
    name: 'Outline Optimization',
    description: 'Use AI to generate/optimize document outline, including generating child nodes and content, and automatically sync to document'
  },
  de_DE: {
    name: 'Gliederungsoptimierung',
    description: 'Verwenden Sie KI, um Dokumentengliederungen zu generieren/optimieren, einschließlich Generierung von Unterknoten und Inhalten, und automatisch mit dem Dokument synchronisieren'
  },
  fr_FR: {
    name: 'Optimisation de l\'arborescence',
    description: 'Utiliser l\'IA pour générer/optimiser l\'arborescence du document, y compris la génération de nœuds enfants et de contenu, et synchroniser automatiquement avec le document'
  },
  ja_JP: {
    name: 'アウトライン最適化',
    description: 'AIを使用してドキュメントアウトラインを生成/最適化し、子ノードとコンテンツの生成を含め、ドキュメントに自動同期'
  },
  ko_KR: {
    name: '개요 최적화',
    description: 'AI를 사용하여 문서 개요 생성/최적화, 하위 노드 및 콘텐츠 생성 포함, 문서에 자동 동기화'
  }
}

export const outlineOptimizeToolConfig: AgentToolConfig = {
  id: 'outline-optimize',
  name: outlineOptimizeToolLocales,
  description: outlineOptimizeToolLocales,
  origin: 'internal',
  instruction: `
# 大纲优化工具

## 功能描述
使用AI生成和优化文档大纲，支持多种操作模式，生成后自动同步到文档内容。**采用并发处理机制，可以高效批量生成大量内容**。

**⭐ 智能解析**：此工具支持多种AI响应格式，包括：
- ✅ JSON格式（推荐）：[{"title": "章节1", "children": []}, ...]
- ✅ 自然语言文本：列表、标题、编号等格式，工具会自动提取章节
- ✅ 混合格式：包含说明文字的JSON，工具会自动清理并提取

## ⭐ 核心优势：并发处理，高效批量生成

此工具采用**并发AI处理机制**，可以同时为多个节点生成内容，**比手动逐段生成效率高数十倍**。

**适用场景**：
- ✅ **大规模内容生成**：需要生成大量章节、段落时，使用此工具可以并发处理，快速完成
- ✅ **批量操作**：一键为所有子章节生成内容、一键为所有子章节添加子章节等
- ✅ **结构化生成**：需要按照大纲结构生成内容时，使用此工具可以保持结构一致性

**效率对比**：
- ❌ **手动生成**：逐段生成，需要多次LLM调用，效率低，耗时长
- ✅ **使用此工具**：并发处理，一次调用可以生成多个章节，效率高，节省时间

## 使用场景
- **大规模内容生成**：需要生成大量章节、段落时（推荐使用此工具，并发处理）
- 为某个节点生成子章节
- 为某个节点生成内容
- 批量生成所有子节点的子节点
- 批量生成所有子节点的内容
- 优化文档结构

## 输入格式
\`\`\`json
{
  "operation": "generateChildren|generateContent|generateChildrenChildren|generateChildrenContent|moveNode|deleteNodes|clearOutline",
  "nodePath": "string",      // ⚠️ 重要：目标节点的路径（如"1", "1.1", "dummy"表示根节点）。对于generateChildren和generateContent，如果不指定nodePath，只会作用在第一个节点上
  "nodePaths": ["string"],  // 可选，批量操作的节点路径数组（用于deleteNodes）
  "targetPath": "string",   // 可选，移动操作的目标路径（用于moveNode）
  "moveMode": "string",     // 可选，移动模式：before/after/inside（用于moveNode）
  "userPrompt": "string",   // 可选，用户提示词，用于指导AI生成
  "tabId": "string"         // 可选，文档标签页ID，默认使用当前活动标签页
}
\`\`\`

## ⚠️ 重要提示：nodePath参数的使用

### 必须指定nodePath的情况
- **generateChildren**：为指定节点生成子节点，**必须指定nodePath**，否则只会作用在第一个节点上
- **generateContent**：为指定节点生成内容，**必须指定nodePath**，否则只会作用在第一个节点上
- **moveNode**：移动节点，**必须指定nodePath**（要移动的节点）和targetPath（目标位置）

### 支持的特殊nodePath值
- **"dummy"**：表示根节点（路径为"dummy"的节点），可以用于为根节点生成子节点
- **"all"**：等同于"dummy"，表示根节点

### 批量操作的方式
1. **方式1：使用批量操作**（推荐，高效）
   - \`generateChildrenChildren\`：为指定节点的所有子节点生成子节点（并发处理）
   - \`generateChildrenContent\`：为指定节点的所有子节点生成内容（并发处理）
   - 使用根节点（nodePath: "dummy"）可以批量处理整个文档

2. **方式2：发起多个指令**
   - 为每个节点单独调用一次操作，指定不同的nodePath

### 如何获取节点路径
使用 \`outline-tree\` 工具可以查看文档的大纲结构，获取每个节点的path。

## 操作类型说明

### generateChildren ⭐ 推荐
为指定节点生成子节点（子章节）。AI会根据节点的标题和内容，自动生成若干个子章节节点。

**⚠️ 重要**：**必须指定nodePath**，否则只会作用在第一个节点上。即使只有dummy节点（空大纲），也可以为根节点生成子节点（使用nodePath: "dummy"）。

**使用示例**：
\`\`\`json
// 为指定节点生成子节点
{
  "operation": "generateChildren",
  "nodePath": "1",
  "userPrompt": "生成3-5个关于人工智能的子章节，包括基础理论、应用场景、发展趋势等"
}

// 为空大纲的根节点生成子节点（首次生成）
{
  "operation": "generateChildren",
  "nodePath": "dummy",
  "userPrompt": "生成5个主要章节，包括引言、理论基础、应用实践、发展趋势、总结"
}
\`\`\`

### generateContent
为指定节点生成正文内容。AI会根据文档的整体结构和节点的标题，生成丰富翔实的内容。

**⚠️ 重要**：**必须指定nodePath**，否则只会作用在第一个节点上。

**使用示例**：
\`\`\`json
{
  "operation": "generateContent",
  "nodePath": "1.1",
  "userPrompt": "生成详细的内容，要求专业、准确，包含具体案例"
}
\`\`\`

### generateChildrenChildren ⭐⭐⭐ 强烈推荐（批量生成）
为指定节点的所有子节点生成子节点。递归遍历所有叶子节点，为每个叶子节点生成子节点。**并发处理，高效批量生成**。

**使用场景**：需要为多个章节批量生成子章节时，使用此操作可以并发处理，快速完成。

**⚠️ 重要**：**必须指定nodePath**。使用根节点（nodePath: "dummy"）可以为整个文档的所有章节批量生成子章节。

**使用示例**：
\`\`\`json
// 为指定节点的所有子节点生成子节点
{
  "operation": "generateChildrenChildren",
  "nodePath": "1",
  "userPrompt": "为每个章节生成2-3个子章节，要求结构清晰、逻辑合理"
}

// 为整个文档的所有章节批量生成子章节（使用根节点）
{
  "operation": "generateChildrenChildren",
  "nodePath": "dummy",
  "userPrompt": "为文档中所有章节生成2-3个子章节"
}
\`\`\`

### generateChildrenContent ⭐⭐⭐ 强烈推荐（批量生成）
为指定节点的所有子节点生成内容。递归遍历所有子节点，为每个节点生成正文内容。**并发处理，高效批量生成**。

**使用场景**：需要为多个章节批量生成内容时，使用此操作可以并发处理，快速完成。

**⚠️ 重要**：**必须指定nodePath**。使用根节点（nodePath: "dummy"）可以为整个文档的所有章节批量生成内容。

**使用示例**：
\`\`\`json
// 为指定节点的所有子节点生成内容
{
  "operation": "generateChildrenContent",
  "nodePath": "1",
  "userPrompt": "为每个章节生成详细内容，要求专业、准确，包含具体案例和数据"
}

// 为整个文档的所有章节批量生成内容（使用根节点）
{
  "operation": "generateChildrenContent",
  "nodePath": "dummy",
  "userPrompt": "为文档中所有章节生成详细内容，要求专业、准确"
}
\`\`\`

### moveNode ⭐ 节点移动（调整顺序）
移动节点到指定位置，支持调整节点顺序。参照Outline.vue的拖拽逻辑实现。

**使用场景**：
- 调整章节顺序
- 将节点移动到其他位置
- 重新组织文档结构

**参数说明**：
- \`nodePath\`: 要移动的节点路径（必需）
- \`targetPath\`: 目标位置节点路径（必需）
- \`moveMode\`: 移动模式（必需）
  - \`"before"\`: 移动到目标节点之前（同级）
  - \`"after"\`: 移动到目标节点之后（同级）
  - \`"inside"\`: 移动到目标节点内部（作为子节点）

**使用示例**：
\`\`\`json
{
  "operation": "moveNode",
  "nodePath": "1.2",
  "targetPath": "1.1",
  "moveMode": "after"
}
\`\`\`

### deleteNodes ⭐ 删除节点（支持批量）
删除指定的节点，支持批量删除多个节点。

**使用场景**：
- 删除不需要的章节
- 批量清理大纲结构
- 移除错误生成的节点

**参数说明**：
- \`nodePath\`: 单个节点路径（可选，与nodePaths二选一）
- \`nodePaths\`: 节点路径数组（可选，用于批量删除）

**使用示例**：
\`\`\`json
// 单个删除
{
  "operation": "deleteNodes",
  "nodePath": "1.2"
}

// 批量删除
{
  "operation": "deleteNodes",
  "nodePaths": ["1.2", "1.3", "2.1"]
}
\`\`\`

### clearOutline ⭐ 清空大纲树
清空整个文档的大纲树，保留根节点（dummy节点）。**即使只有dummy节点，也可以执行此操作**。

**使用场景**：
- 重新开始构建文档结构
- 清空所有现有内容
- 准备生成全新的文章

**使用示例**：
\`\`\`json
{
  "operation": "clearOutline"
}
\`\`\`

**注意**：此操作会删除所有章节和内容，请谨慎使用。清空后可以使用generateChildren为根节点生成新的章节。

## ⭐ 最佳实践：大规模内容生成

### 推荐工作流程

**场景1：生成完整文章结构**
1. 先使用 \`generateChildren\` 为根节点生成主要章节
2. 使用 \`generateChildrenChildren\` 为所有章节批量生成子章节
3. 使用 \`generateChildrenContent\` 为所有章节批量生成内容

**场景2：为已有大纲补充内容**
1. 使用 \`outline-tree\` 工具查看文档大纲结构
2. 使用 \`generateChildrenContent\` 为指定节点的所有子节点批量生成内容

**场景3：扩展某个章节**
1. 使用 \`generateChildren\` 为该章节生成子章节
2. 使用 \`generateContent\` 为该章节生成内容
3. 使用 \`generateChildrenContent\` 为所有子章节批量生成内容

### 何时使用此工具 vs 手动编辑

**✅ 推荐使用此工具**：
- 需要生成大量章节（3个以上）
- 需要为多个章节生成内容
- 需要批量操作（批量生成子章节、批量生成内容）
- 需要保持结构一致性

**✅ 可以手动编辑**：
- 小规模编辑（1-2个段落）
- 精确控制单个位置的内容
- 需要频繁调整的临时内容

### userPrompt 参数的使用技巧

\`userPrompt\` 参数可以让你控制生成的内容风格和质量：

\`\`\`json
{
  "operation": "generateChildrenContent",
  "nodePath": "1",
  "userPrompt": "生成专业、准确的内容，要求：1. 包含具体案例和数据 2. 使用学术写作风格 3. 每个章节至少500字 4. 包含图表说明"
}
\`\`\`

## 输出格式
\`\`\`json
{
  "operation": "generateChildren",
  "nodePath": "1",
  "nodeTitle": "章节标题",
  "success": true
}
\`\`\`

## 注意事项
- 所有操作都会自动同步到文档内容
- 支持Markdown和LaTeX格式
- 生成的内容会替换原有内容（如果有）
- 操作完成后，文档会自动更新
- 建议在操作前保存文档
- **节点移动和删除操作**：操作完成后会自动重新生成路径编号
- **批量删除**：可以一次删除多个节点，提高效率
- **清空大纲**：会删除所有章节，请谨慎使用
`,
  callback: outlineOptimizeToolCallback,
  displayComponent: OutlineOptimizeDisplay,
  tags: ['outline', 'ai', 'generation', 'document'],
  enabled: true,
  editable: false,
  locales: outlineOptimizeToolLocales,
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['generateChildren', 'generateContent', 'generateChildrenChildren', 'generateChildrenContent', 'moveNode', 'deleteNodes', 'clearOutline'],
        description: '操作类型'
      },
      nodePath: {
        type: 'string',
        description: '目标节点的路径（如"1", "1.1"），默认使用第一个非根节点'
      },
      nodePaths: {
        type: 'array',
        items: { type: 'string' },
        description: '批量操作的节点路径数组（用于deleteNodes批量删除）'
      },
      targetPath: {
        type: 'string',
        description: '移动操作的目标路径（用于moveNode）'
      },
      moveMode: {
        type: 'string',
        enum: ['before', 'after', 'inside'],
        description: '移动模式：before（之前）/after（之后）/inside（内部，作为子节点）'
      },
      userPrompt: {
        type: 'string',
        description: '用户提示词，用于指导AI生成（用于生成操作）'
      },
      tabId: {
        type: 'string',
        description: '文档标签页ID（可选，默认使用当前活动标签页）'
      }
    },
    required: ['operation']
  },
  outputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        description: '执行的操作类型'
      },
      nodePath: {
        type: 'string',
        description: '操作的节点路径'
      },
      nodeTitle: {
        type: 'string',
        description: '操作的节点标题'
      },
      success: {
        type: 'boolean',
        description: '是否成功'
      }
    }
  }
}

