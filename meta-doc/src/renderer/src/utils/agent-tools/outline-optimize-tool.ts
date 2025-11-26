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
import { cancelAiTask, createAiTask } from '../ai_tasks'
import { getSetting } from '../settings'
import { ref } from 'vue'
import type { DocumentOutlineNode } from '@/types'
import { 
  searchNode, 
  removeTextFromOutline,
  generateMarkdownFromOutlineTree 
} from '../document/outline'
import { 
  expandTreeNodePrompt, 
  generateContentPrompt, 
  generateParentNodeContentPrompt 
} from '../prompts'
import { TREE_NODE_SCHEMA } from '../../constants/document'
import { extractOuterJsonString } from '../regex-utils'
import { getOutlineAdapter } from '../outline-adapters'
import { parseJsonWithClean, isJsonParseError } from './tool-utils'
import OutlineOptimizeDisplay from './components/OutlineOptimizeDisplay.vue'
import { getActiveDocumentInfoViaBroadcast } from './document-broadcast-helper'
import { getWindowType } from '../event-bus'

const logger = createRendererLogger('OutlineOptimizeTool')
const workspace = useWorkspace()

/**
 * 清理原始内容（移除可能的说明文字）
 */
function cleanRawContent(rawContent: string): string {
  return rawContent
    .replace(/^[^{]*\{/, '{')  // 移除JSON前的文字
    .replace(/\}[^}]*$/, '}')  // 移除JSON后的文字
    .trim()
}

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
 * 生成节点的子节点
 */
async function generateChildNodes(
  node: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  signal?: AbortSignal
): Promise<DocumentOutlineNode[]> {
  const prompt = expandTreeNodePrompt(
    JSON.stringify(removeTextFromOutline(outlineTree)),
    JSON.stringify(node),
    JSON.stringify(TREE_NODE_SCHEMA),
    userPrompt
  )

  const rawStringRef = ref('')
  const { handle, done } = createAiTask(
    `生成子节点: ${node.title}`,
    prompt,
    rawStringRef,
    'answer',
    `outline-children-${node.path}-${Date.now()}`,
    { stream: false}
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

  const rawContent = rawStringRef.value?.trim() || ''
  if (!rawContent) {
    throw new Error('AI返回内容为空')
  }

  // 提取JSON（尝试多种方式）
  let json = extractOuterJsonString(rawContent)
  
  // 如果第一次提取失败，尝试清理内容后再提取
  if (!json) {
    const cleaned = rawContent
      .replace(/```json\n?/gi, '')
      .replace(/```\n?/g, '')
      .trim()
    json = extractOuterJsonString(cleaned)
  }

  // 如果还是失败，尝试直接解析整个内容
  if (!json) {
    logger.warn('未能提取JSON，尝试直接解析整个内容')
    json = rawContent
  }

  // 解析JSON
  const parseResult = parseJsonWithClean<DocumentOutlineNode[]>(json)
  if (!parseResult.success) {
    // 如果解析失败，记录详细错误信息
    logger.error('解析子节点JSON失败:', parseResult.error)
    logger.error('原始内容:', rawContent.substring(0, 500))
    logger.error('提取的JSON:', json.substring(0, 500))
    throw new Error(`解析子节点JSON失败: ${parseResult.error}`)
  }

  const newChildren = parseResult.data
  if (!Array.isArray(newChildren) || newChildren.length === 0) {
    throw new Error('解析出的子节点列表为空或格式不正确')
  }

  // 为子节点生成路径
  for (const child of newChildren) {
    regeneratePaths(child)
  }

  return newChildren
}

/**
 * 生成节点内容
 */
async function generateNodeContent(
  node: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  signal?: AbortSignal
): Promise<string> {
  const hasChildren = node.children && node.children.length > 0
  const prompt = hasChildren
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

  const rawStringRef = ref('')
  const { handle, done } = createAiTask(
    `生成内容: ${node.title}`,
    prompt,
    rawStringRef,
    'answer',
    `outline-content-${node.path}-${Date.now()}`,
    { stream: false}
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

  const rawContent = rawStringRef.value?.trim() || ''
  if (!rawContent) {
    return ''
  }

  // 提取JSON
  const json = extractOuterJsonString(rawContent)
  if (json) {
    try {
      const parseResult = parseJsonWithClean<{ content: string }>(json)
      if (parseResult.success && parseResult.data?.content) {
        return parseResult.data.content
      }
    } catch (parseErr) {
      logger.warn('JSON解析失败，尝试使用原始内容', parseErr)
    }
  }

  // 如果提取失败，尝试清理原始内容
  const cleaned = cleanRawContent(rawContent)
  return cleaned || rawContent
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
  const operation = params.operation as 'generateChildren' | 'generateContent' | 'generateChildrenChildren' | 'generateChildrenContent'
  const nodePath = params.nodePath as string | undefined
  const userPrompt = (params.userPrompt as string) || ''
  const tabId = params.tabId as string | undefined

  if (!operation) {
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.outlineOptimize.error.missingOperation', '缺少必需参数: operation')
    }
  }

  const validOperations = ['generateChildren', 'generateContent', 'generateChildrenChildren', 'generateChildrenContent']
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

    // 获取大纲树
    let outlineTree = doc.outline
    if (!outlineTree || !outlineTree.children || outlineTree.children.length === 0) {
      return {
        status: 'failed',
        error: i18n.global.t('agent.tool.outlineOptimize.error.emptyOutline', '文档大纲为空')
      }
    }

    // 查找目标节点
    let targetNode: DocumentOutlineNode | null = null
    if (nodePath) {
      targetNode = searchNode(nodePath, outlineTree)
      if (!targetNode) {
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.outlineOptimize.error.nodeNotFound', `找不到路径为 ${nodePath} 的节点`)
        }
      }
    } else {
      // 如果没有指定节点路径，使用第一个非根节点
      if (outlineTree.children.length > 0) {
        targetNode = outlineTree.children[0]
      } else {
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.outlineOptimize.error.noTargetNode', '没有可操作的节点')
        }
      }
    }

    if (!targetNode) {
      return {
        status: 'failed',
        error: i18n.global.t('agent.tool.outlineOptimize.error.noTargetNode', '没有可操作的节点')
      }
    }

    // 锁定UI（防止并发操作）
    workspace.lockUI?.()

    try {
      // 深拷贝大纲树（避免直接修改原对象）
      const workingOutline = JSON.parse(JSON.stringify(outlineTree)) as DocumentOutlineNode
      const workingNode = searchNode(targetNode.path, workingOutline)
      if (!workingNode) {
        throw new Error('无法在工作副本中找到目标节点')
      }

      // 用于存储生成结果
      let generatedChildrenInfo: any[] = []
      let generatedContentInfo: any = null

      // 根据操作类型执行不同的生成任务
      if (operation === 'generateChildren') {
        // 为指定节点生成子节点
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

        const newChildren = await generateChildNodes(workingNode, workingOutline, userPrompt, signal)
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

        const content = await generateNodeContent(workingNode, workingOutline, userPrompt, signal)
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
            const newChildren = await generateChildNodes(curNode, workingOutline, userPrompt, signal)
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
              const content = await generateNodeContent(curNode, workingOutline, userPrompt, signal)
              curNode.text = content || ''
            } catch (error) {
              logger.error(`为节点 ${curNode.path} 生成内容失败:`, error)
              // 继续处理其他节点，不中断整个流程
            }
          }
        }

        await traverseAndGenerate(workingNode)
      }

      if (signal?.aborted) {
        return {
          status: 'cancelled'
        }
      }

      // 同步大纲到文档
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
        nodePath: targetNode.path,
        nodeTitle: targetNode.title,
        success: true
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
        collectChildren(workingNode)
        resultData.generatedChildren = allGenerated
        resultData.totalChildrenCount = allGenerated.length
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
        collectContent(workingNode)
        resultData.generatedContent = allContent
        resultData.totalContentCount = allContent.length
      }

      return {
        status: 'succeeded',
        data: {
          content: {
            stage: 'completed',
            operation,
            nodePath: targetNode.path,
            nodeTitle: targetNode.title,
            ...resultData
          },
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
使用AI生成和优化文档大纲，支持多种操作模式，生成后自动同步到文档内容。

## 使用场景
- 为某个节点生成子章节
- 为某个节点生成内容
- 批量生成所有子节点的子节点
- 批量生成所有子节点的内容
- 优化文档结构

## 输入格式
\`\`\`json
{
  "operation": "generateChildren|generateContent|generateChildrenChildren|generateChildrenContent",
  "nodePath": "string",      // 可选，目标节点的路径（如"1", "1.1"），默认使用第一个非根节点
  "userPrompt": "string",    // 可选，用户提示词，用于指导AI生成
  "tabId": "string"          // 可选，文档标签页ID，默认使用当前活动标签页
}
\`\`\`

## 操作类型说明

### generateChildren
为指定节点生成子节点（子章节）。AI会根据节点的标题和内容，自动生成若干个子章节节点。

### generateContent
为指定节点生成正文内容。AI会根据文档的整体结构和节点的标题，生成丰富翔实的内容。

### generateChildrenChildren
为指定节点的所有子节点生成子节点。递归遍历所有叶子节点，为每个叶子节点生成子节点。

### generateChildrenContent
为指定节点的所有子节点生成内容。递归遍历所有子节点，为每个节点生成正文内容。

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
        enum: ['generateChildren', 'generateContent', 'generateChildrenChildren', 'generateChildrenContent'],
        description: '操作类型'
      },
      nodePath: {
        type: 'string',
        description: '目标节点的路径（如"1", "1.1"），默认使用第一个非根节点'
      },
      userPrompt: {
        type: 'string',
        description: '用户提示词，用于指导AI生成'
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

