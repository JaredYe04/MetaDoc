/**
 * 大纲优化Tool
 * 基于Outline.vue的AI工具，生成/优化大纲并同步文章内容
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
  generateChildrenChildren as generateChildrenChildrenUtil,
  generateChildrenContent as generateChildrenContentUtil,
  cleanTitleMarkers,
  cleanNodeTitleMarkers,
  cleanRawContent as cleanRawContentUtil
} from '../outline-ai-utils'
import OutlineOptimizeDisplay from './components/OutlineOptimizeDisplay.vue'
import { getActiveDocumentInfoViaBroadcast } from './document-broadcast-helper'
import { getWindowType } from '../event-bus'
import messageBridge from '../../bridge/message-bridge'

const logger = createRendererLogger('OutlineOptimizeTool')
const workspace = useWorkspace()

/** 工作区根目录列表（用于解析相对路径） */
function getWorkspaceRoots(): string[] {
  try {
    const saved = localStorage.getItem('workspaceFolders')
    if (!saved) return []
    const arr = JSON.parse(saved)
    return Array.isArray(arr)
      ? arr.filter((p: unknown) => typeof p === 'string' && p.length > 0)
      : []
  } catch {
    return []
  }
}

/** 将工作区相对路径或绝对路径解析为绝对路径 */
function resolveFilePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').trim()
  if (normalized.startsWith('/') || /^[A-Za-z]:[/\\]/.test(normalized)) {
    return normalized
  }
  const roots = getWorkspaceRoots()
  const root = roots[0]
  if (!root) return normalized
  const base = root.replace(/\\/g, '/').replace(/\/$/, '')
  return `${base}/${normalized}`
}

/** 规范化路径用于比较 */
function normalizePathForCompare(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '')
}

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
 * 生成节点的子节点（使用公共工具函数，已包含fallback逻辑）
 */
async function generateChildNodes(
  node: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  docFormat: 'md' | 'tex' = 'md',
  signal?: AbortSignal,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void
): Promise<DocumentOutlineNode[]> {
  // 直接使用公共工具函数，已包含fallback逻辑
  return await generateChildNodesUtil(
    node,
    outlineTree,
    userPrompt,
    signal,
    docFormat,
    undefined, // rawContentRef
    onUpdate,
    true // enableFallback
  )
}

/**
 * 生成节点内容（使用工具函数）
 */
async function generateNodeContent(
  node: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  docFormat: 'md' | 'tex' = 'md',
  signal?: AbortSignal,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void
): Promise<string> {
  // 直接使用工具函数（已支持 docFormat 参数和对话模式）
  return await generateNodeContentUtil(
    node,
    outlineTree,
    userPrompt,
    signal,
    docFormat,
    undefined,
    onUpdate
  )
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

  // 更新大纲（不强制切换视图：仅在当前已是 outline 视图时更新 lastView，避免 Agent 执行工具时莫名切到大纲树）
  workspace.updateDocumentOutline(tabId, outline)
  const currentView = doc.lastView ?? 'editor'
  if (currentView === 'outline') {
    workspace.updateDocumentLastView(tabId, 'outline')
  }

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
  const operation = params.operation as
    | 'generateChildren'
    | 'generateContent'
    | 'generateChildrenChildren'
    | 'generateChildrenContent'
    | 'moveNode'
    | 'deleteNodes'
    | 'clearOutline'
  const nodePath = params.nodePath as string | undefined
  const nodePaths = params.nodePaths as string[] | undefined // 批量操作的节点路径数组
  const targetPath = params.targetPath as string | undefined // 移动操作的目标路径
  const moveMode = params.moveMode as 'before' | 'after' | 'inside' | undefined // 移动模式
  const userPrompt = (params.userPrompt as string) || ''
  const tabId = params.tabId as string | undefined
  const filePathParam = params.filePath as string | undefined

  if (!operation) {
    return {
      status: 'failed',
      error: i18n.global.t(
        'agent.tool.outlineOptimize.error.missingOperation',
        '缺少必需参数: operation'
      )
    }
  }

  const validOperations = [
    'generateChildren',
    'generateContent',
    'generateChildrenChildren',
    'generateChildrenContent',
    'moveNode',
    'deleteNodes',
    'clearOutline'
  ]
  if (!validOperations.includes(operation)) {
    return {
      status: 'failed',
      error: i18n.global.t(
        'agent.tool.outlineOptimize.error.invalidOperation',
        `无效的操作: ${operation}`
      )
    }
  }

  try {
    onUpdate(
      {
        content: {
          stage: 'loading',
          operation
        },
        format: 'json'
      },
      {
        percentage: 10,
        message: i18n.global.t('agent.tool.outlineOptimize.progress.loading', '正在加载文档...')
      }
    )

    // 获取文档：支持 filePath（工作区路径）或 tabId（标签页），仅 .md / .tex 支持大纲
    const windowType = getWindowType()
    let doc: any = null
    let targetTabId: string | null = null
    /** 当通过 filePath 从磁盘加载且未在标签页打开时，操作完成后写回该路径 */
    let targetFilePath: string | null = null

    if (filePathParam && messageBridge.getIpc()?.invoke) {
      const absPath = resolveFilePath(filePathParam)
      const isTex = /\.tex$/i.test(absPath)
      const isMd = /\.(md|markdown)$/i.test(absPath)
      if (!isTex && !isMd) {
        return {
          status: 'failed',
          error: i18n.global.t(
            'agent.tool.outlineOptimize.error.unsupportedFormat',
            '大纲仅支持 Markdown (.md) 和 LaTeX (.tex) 文件，当前文件格式不支持。'
          )
        }
      }
      const format = isTex ? 'tex' : 'md'
      const normalizedAbs = normalizePathForCompare(absPath)
      // 优先查找已打开的标签页（同路径）
      const tabs = workspace.tabs
      const existingTab = tabs.find(
        (t) => t.kind === 'file' && t.path && normalizePathForCompare(t.path) === normalizedAbs
      )
      if (existingTab) {
        targetTabId = existingTab.id
        doc = workspace.ensureDocument(existingTab.id)
        if (!doc) {
          return {
            status: 'failed',
            error: i18n.global.t('agent.tool.outlineOptimize.error.documentNotFound', '文档不存在')
          }
        }
      } else {
        let content: string | null = null
        try {
          content = (await messageBridge.invoke('read-file-content', absPath)) as string | null
        } catch (e) {
          logger.warn('read-file-content failed', e)
        }
        if (content == null) {
          return {
            status: 'failed',
            error: i18n.global.t(
              'agent.tool.outlineOptimize.error.fileNotFound',
              `文件不存在或无法读取: ${filePathParam}`
            )
          }
        }
        const adapter = getOutlineAdapter(format)
        const outlineTree = adapter.fromText(content)
        doc = {
          markdown: format === 'md' ? content : '',
          tex: format === 'tex' ? content : '',
          format,
          outline: outlineTree,
          path: absPath
        }
        targetTabId = null
        targetFilePath = absPath
      }
    } else if (windowType === 'setting') {
      const docInfo = await getActiveDocumentInfoViaBroadcast()
      if (!docInfo) {
        return {
          status: 'failed',
          error: i18n.global.t(
            'agent.tool.outlineOptimize.error.noActiveTab',
            '没有活动的文档标签页'
          )
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
      targetTabId = tabId || workspace.activeTabId.value
      if (!targetTabId) {
        return {
          status: 'failed',
          error: i18n.global.t(
            'agent.tool.outlineOptimize.error.noActiveTab',
            '没有活动的文档标签页'
          )
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

    if (!doc.format) {
      doc.format = 'md'
      logger.warn('文档格式未设置，默认使用Markdown格式')
    }
    if (doc.format !== 'md' && doc.format !== 'tex') {
      return {
        status: 'failed',
        error: i18n.global.t(
          'agent.tool.outlineOptimize.error.unsupportedFormat',
          '大纲仅支持 Markdown (.md) 和 LaTeX (.tex) 文档，当前格式不支持。'
        )
      }
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
    const needsTargetNode = [
      'generateChildren',
      'generateContent',
      'generateChildrenChildren',
      'generateChildrenContent',
      'moveNode'
    ].includes(operation)

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
            error: i18n.global.t(
              'agent.tool.outlineOptimize.error.nodeNotFound',
              `找不到路径为 ${nodePath} 的节点。提示：可使用 "dummy" 指定根节点，或通过引用素材/workspace 工具查看文档结构获取节点路径`
            )
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
            error: i18n.global.t(
              'agent.tool.outlineOptimize.error.noTargetNode',
              '没有可操作的节点。提示：请先使用generateChildren为根节点生成子节点，或使用nodePath: "dummy"为根节点生成子节点'
            )
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
        onUpdate(
          {
            content: {
              stage: 'generating',
              operation,
              nodePath: workingNode.path,
              nodeTitle: workingNode.title
            },
            format: 'json'
          },
          {
            percentage: 30,
            message: i18n.global.t(
              'agent.tool.outlineOptimize.progress.generatingChildren',
              `正在为节点 "${workingNode.title}" 生成子节点...`
            )
          }
        )

        const newChildren = await generateChildNodes(
          workingNode,
          workingOutline,
          userPrompt,
          doc.format,
          signal,
          onUpdate
        )
        if (!workingNode.children) {
          workingNode.children = []
        }
        workingNode.children.push(...newChildren)
        regeneratePaths(workingOutline)

        // 记录生成的子节点信息
        generatedChildrenInfo = newChildren.map((child) => ({
          path: child.path,
          title: child.title
        }))
      } else if (operation === 'generateContent') {
        // 为指定节点生成内容
        if (!workingNode) {
          throw new Error('无法找到目标节点')
        }
        onUpdate(
          {
            content: {
              stage: 'generating',
              operation,
              nodePath: workingNode.path,
              nodeTitle: workingNode.title
            },
            format: 'json'
          },
          {
            percentage: 30,
            message: i18n.global.t(
              'agent.tool.outlineOptimize.progress.generatingContent',
              `正在为节点 "${workingNode.title}" 生成内容...`
            )
          }
        )

        const content = await generateNodeContent(
          workingNode,
          workingOutline,
          userPrompt,
          doc.format,
          signal,
          onUpdate
        )
        workingNode.text = content

        // 记录生成的内容信息
        generatedContentInfo = {
          content: content,
          contentLength: content.length,
          contentPreview: content.length > 100 ? content.substring(0, 100) + '...' : content
        }
      } else if (operation === 'generateChildrenChildren') {
        // 为指定节点的所有子节点生成子节点
        if (!workingNode) {
          throw new Error('无法找到目标节点')
        }
        onUpdate(
          {
            content: {
              stage: 'generating',
              operation,
              nodePath: workingNode.path,
              nodeTitle: workingNode.title
            },
            format: 'json'
          },
          {
            percentage: 20,
            message: i18n.global.t(
              'agent.tool.outlineOptimize.progress.generatingChildrenChildren',
              `正在为节点 "${workingNode.title}" 的所有子节点生成子节点...`
            )
          }
        )

        // 使用公共工具函数
        await generateChildrenChildrenUtil(
          workingNode,
          workingOutline,
          userPrompt,
          doc.format,
          signal,
          undefined, // onNodeProgress
          onUpdate
        )
        regeneratePaths(workingOutline)
      } else if (operation === 'generateChildrenContent') {
        // 为指定节点的所有子节点生成内容
        if (!workingNode) {
          throw new Error('无法找到目标节点')
        }
        onUpdate(
          {
            content: {
              stage: 'generating',
              operation,
              nodePath: workingNode.path,
              nodeTitle: workingNode.title
            },
            format: 'json'
          },
          {
            percentage: 20,
            message: i18n.global.t(
              'agent.tool.outlineOptimize.progress.generatingChildrenContent',
              `正在为节点 "${workingNode.title}" 的所有子节点生成内容...`
            )
          }
        )

        // 使用公共工具函数
        await generateChildrenContentUtil(
          workingNode,
          workingOutline,
          userPrompt,
          doc.format,
          signal,
          undefined, // onNodeProgress
          onUpdate
        )
      } else if (operation === 'clearOutline') {
        // 清空大纲树：保留根节点，清空所有子节点
        onUpdate(
          {
            content: {
              stage: 'clearing',
              operation
            },
            format: 'json'
          },
          {
            percentage: 30,
            message: i18n.global.t(
              'agent.tool.outlineOptimize.progress.clearing',
              '正在清空大纲树...'
            )
          }
        )

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
      onUpdate(
        {
          content: {
            stage: 'syncing',
            operation
          },
          format: 'json'
        },
        {
          percentage: 90,
          message: i18n.global.t(
            'agent.tool.outlineOptimize.progress.syncing',
            '正在同步文档内容...'
          )
        }
      )

      if (targetTabId) {
        await syncOutlineToDocument(targetTabId, workingOutline, doc.format, doc.markdown, doc.tex)
      } else if (targetFilePath && messageBridge.getIpc()?.invoke) {
        const adapter = getOutlineAdapter(doc.format)
        const currentContent = doc.format === 'tex' ? doc.tex : doc.markdown
        const newContent = await adapter.toText(workingOutline, currentContent)
        await messageBridge.invoke('write-file-content', {
          filePath: targetFilePath,
          content: newContent
        })
      }

      onUpdate(
        {
          content: {
            stage: 'completed'
          },
          format: 'json'
        },
        {
          percentage: 100,
          message: i18n.global.t('agent.tool.outlineOptimize.progress.completed', '大纲优化完成')
        }
      )

      // 构建返回结果，包含生成的具体内容
      let resultData: any = {
        operation,
        success: true
      }

      // 对于需要targetNode的操作，添加节点信息
      if (
        targetNode &&
        [
          'generateChildren',
          'generateContent',
          'generateChildrenChildren',
          'generateChildrenContent'
        ].includes(operation)
      ) {
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
              contentPreview:
                node.text.length > 100 ? node.text.substring(0, 100) + '...' : node.text
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

const OUTLINE_OPTIMIZE_TOOL_NAME = 'Outline Optimization'
const OUTLINE_OPTIMIZE_TOOL_DESCRIPTION =
  'Use AI to generate/optimize document outline (only .md/.tex). Specify doc by filePath or tabId. Use only when operating on a single large document.'

export const outlineOptimizeToolConfig: AgentToolConfig = {
  id: 'outline-optimize',
  name: OUTLINE_OPTIMIZE_TOOL_NAME,
  description: OUTLINE_OPTIMIZE_TOOL_DESCRIPTION,
  origin: 'internal',
  spec: {
    name: 'outline-optimize',
    brief:
      'Generate/optimize document outline (only .md/.tex). Use only for a single large document. Specify target by filePath or tabId.',
    fullSpec: `# Outline Optimization Tool

## Scope Limitation ⚠️
**Use this tool only when operating on a single large document**: one specific document with substantial length (e.g. long articles, theses). Do not use for multi-document workflows or short snippets.

## Description
Uses AI to generate and optimize document outline. **Only Markdown (.md) and LaTeX (.tex) support outline; other formats are not supported.** You can specify the target document by \`filePath\` (workspace-relative or absolute) or \`tabId\` (default: current active tab). After generation, syncs to the document (or writes to file when opened by path). **Concurrent processing for efficient batch generation**.

**⭐ Smart Parsing**: This tool supports multiple AI response formats:
- ✅ JSON format (recommended): [{"title": "Section 1", "children": []}, ...]
- ✅ Natural language text: Lists, titles, numbering, etc., tool automatically extracts sections
- ✅ Mixed format: JSON with explanatory text, tool automatically cleans and extracts

## ⭐ Core Advantage: Concurrent Processing, Efficient Batch Generation

This tool uses **concurrent AI processing mechanism**, can generate content for multiple nodes simultaneously, **tens of times more efficient than manual generation**.

**Suitable scenarios** (single large document only):
- ✅ **Large-scale content generation**: One document with many sections/paragraphs, use this tool for concurrent processing
- ✅ **Batch operations**: One-click generate content for all subsections, etc.
- ✅ **Structured generation**: Generate content according to outline structure for one document

## Usage Scenarios
- **Large-scale content generation**: When generating many sections/paragraphs (recommended to use this tool, concurrent processing)
- Generate child sections for a node
- Generate content for a node
- Batch generate child nodes for all child nodes
- Batch generate content for all child nodes
- Optimize document structure

## Input Format
\`\`\`json
{
  "operation": "generateChildren|generateContent|generateChildrenChildren|generateChildrenContent|moveNode|deleteNodes|clearOutline",
  "nodePath": "string",      // ⚠️ Target node path (e.g., "1", "1.1", "dummy" for root)
  "nodePaths": ["string"],  // Optional, for deleteNodes batch
  "targetPath": "string",   // Optional, for moveNode
  "moveMode": "string",     // Optional, before/after/inside (for moveNode)
  "userPrompt": "string",   // Optional, guide AI generation
  "filePath": "string",     // Optional, workspace-relative or absolute path to .md/.tex file (if not open in tab, reads/writes from disk)
  "tabId": "string"         // Optional, document tab ID; default current active tab. Use filePath or tabId to specify target.
}
\`\`\`

## Important Notes
1. **Only .md and .tex**: Outline is supported only for Markdown (.md) and LaTeX (.tex); other formats are not supported.
2. **Single large document only**: Use this tool only when operating on one document with substantial content.
3. **Target by filePath or tabId**: Provide \`filePath\` to work on a file (opens from disk if not in a tab; writes back after); or \`tabId\`/current tab.
4. Use "dummy" as nodePath for root. Batch operations use concurrent processing.`
  },
  callback: outlineOptimizeToolCallback,
  displayComponent: OutlineOptimizeDisplay,
  tags: ['outline', 'ai', 'generation', 'document'],
  enabled: true,
  editable: false,
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: [
          'generateChildren',
          'generateContent',
          'generateChildrenChildren',
          'generateChildrenContent',
          'moveNode',
          'deleteNodes',
          'clearOutline'
        ],
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
      filePath: {
        type: 'string',
        description: '工作区相对或绝对路径，指定要操作的 .md/.tex 文件（未打开则从磁盘读写）'
      },
      tabId: {
        type: 'string',
        description: '文档标签页ID（可选，默认当前活动标签页）；与 filePath 二选一指定目标'
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
