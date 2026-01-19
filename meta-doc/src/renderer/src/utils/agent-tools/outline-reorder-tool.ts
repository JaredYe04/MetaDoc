/**
 * 大纲优化工具（节点顺序调整）
 * 根据AI返回的JSON重新排列节点的子节点顺序
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
import type { DocumentOutlineNode } from '@/types'
import { searchNode, searchParentNode } from '../outline-helpers'
import { getActiveDocumentInfoViaBroadcast } from './document-broadcast-helper'
import { getWindowType } from '../event-bus'
import { getOutlineAdapter } from '../outline-adapters'
import { extractOuterJsonString } from '../regex-utils'

const logger = createRendererLogger('OutlineReorderTool')
const workspace = useWorkspace()

/**
 * 重新生成路径（广度优先遍历）
 */
function regeneratePaths(node: DocumentOutlineNode): void {
  for (let i = 0; i < node.children.length; i++) {
    node.children[i].path = `${i + 1}`
  }
  
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
 * 根据JSON重新排列子节点顺序
 * @param parent 父节点
 * @param newOrderJson JSON字符串，包含重新排序的节点信息
 */
function reorderChildrenByJson(
  parent: DocumentOutlineNode,
  newOrderJson: string
): void {
  if (!parent.children || parent.children.length === 0) {
    return
  }

  // 解析JSON
  let newOrder: Array<{ path: string; title?: string }>
  try {
    const json = extractOuterJsonString(newOrderJson) || newOrderJson
    newOrder = JSON.parse(json)
    if (!Array.isArray(newOrder)) {
      throw new Error('JSON必须是一个数组')
    }
  } catch (error) {
    throw new Error(`JSON解析失败: ${error instanceof Error ? error.message : String(error)}`)
  }

  // 创建路径映射（原始子节点）
  const pathMap = new Map<string, DocumentOutlineNode>()
  for (const child of parent.children) {
    pathMap.set(child.path, child)
  }

  // 根据新顺序重新排列
  const reorderedChildren: DocumentOutlineNode[] = []
  const usedPaths = new Set<string>()

  for (const item of newOrder) {
    if (!item.path) {
      logger.warn('跳过没有path字段的项:', item)
      continue
    }

    // 通过path或title匹配节点
    let matchedNode: DocumentOutlineNode | undefined = pathMap.get(item.path)
    
    // 如果通过path找不到，尝试通过title匹配
    if (!matchedNode && item.title) {
      for (const child of parent.children) {
        if (child.title === item.title && !usedPaths.has(child.path)) {
          matchedNode = child
          break
        }
      }
    }

    if (matchedNode && !usedPaths.has(matchedNode.path)) {
      reorderedChildren.push(matchedNode)
      usedPaths.add(matchedNode.path)
    } else {
      logger.warn(`无法找到节点: path=${item.path}, title=${item.title}`)
    }
  }

  // 添加未在JSON中出现的节点（按原顺序追加到末尾）
  for (const child of parent.children) {
    if (!usedPaths.has(child.path)) {
      reorderedChildren.push(child)
    }
  }

  // 更新父节点的children
  parent.children = reorderedChildren

  // 重新生成路径
  regeneratePaths(parent)
}

/**
 * 大纲优化工具回调函数
 */
const outlineReorderToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const nodePath = params.nodePath as string | undefined
  const newOrderJson = params.newOrderJson as string | undefined
  const tabId = params.tabId as string | undefined

  if (!nodePath) {
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.outlineReorder.error.missingNodePath', '缺少必需参数: nodePath')
    }
  }

  if (!newOrderJson) {
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.outlineReorder.error.missingNewOrderJson', '缺少必需参数: newOrderJson')
    }
  }

  try {
    onUpdate({
      content: {
        stage: 'loading',
        nodePath
      },
      format: 'json'
    }, {
      percentage: 10,
      message: i18n.global.t('agent.tool.outlineReorder.progress.loading', '正在加载文档...')
    })

    // 获取文档（支持跨窗口）
    const windowType = getWindowType()
    let doc: any = null
    let targetTabId: string | null = null

    if (windowType === 'setting') {
      const docInfo = await getActiveDocumentInfoViaBroadcast()
      if (!docInfo) {
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.outlineReorder.error.noActiveTab', '没有活动的文档标签页')
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
          error: i18n.global.t('agent.tool.outlineReorder.error.noActiveTab', '没有活动的文档标签页')
        }
      }
      doc = workspace.ensureDocument(targetTabId)
      if (!doc) {
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.outlineReorder.error.documentNotFound', '文档不存在')
        }
      }
    }

    // 确保文档格式已设置
    if (!doc.format) {
      doc.format = 'md'
      logger.warn('文档格式未设置，默认使用Markdown格式')
    }

    // 获取大纲树
    let outlineTree = doc.outline
    if (!outlineTree) {
      return {
        status: 'failed',
        error: i18n.global.t('agent.tool.outlineReorder.error.emptyOutline', '文档大纲为空')
      }
    }

    // 查找目标节点
    let targetNode: DocumentOutlineNode | null = null
    if (nodePath === 'dummy' || nodePath === 'all') {
      targetNode = outlineTree
    } else {
      targetNode = searchNode(nodePath, outlineTree)
      if (!targetNode) {
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.outlineReorder.error.nodeNotFound', `找不到路径为 ${nodePath} 的节点`)
        }
      }
    }

    if (!targetNode) {
      return {
        status: 'failed',
        error: i18n.global.t('agent.tool.outlineReorder.error.noTargetNode', '没有可操作的节点')
      }
    }

    // 检查节点是否有子节点
    if (!targetNode.children || targetNode.children.length === 0) {
      return {
        status: 'failed',
        error: i18n.global.t('agent.tool.outlineReorder.error.noChildren', '目标节点没有子节点')
      }
    }

    // 深拷贝大纲树
    const workingOutline = JSON.parse(JSON.stringify(outlineTree)) as DocumentOutlineNode
    const workingNode = searchNode(targetNode.path, workingOutline) || workingOutline

    // 锁定UI
    workspace.lockUI?.()

    try {
      // 记录原始顺序
      const originalOrder = workingNode.children.map(child => ({
        path: child.path,
        title: child.title
      }))

      onUpdate({
        content: {
          stage: 'reordering',
          nodePath: workingNode.path,
          nodeTitle: workingNode.title,
          originalOrder
        },
        format: 'json'
      }, {
        percentage: 30,
        message: i18n.global.t('agent.tool.outlineReorder.progress.reordering', `正在重新排列节点 "${workingNode.title}" 的子节点...`)
      })

      // 重新排列子节点
      reorderChildrenByJson(workingNode, newOrderJson)

      // 记录新顺序
      const newOrder = workingNode.children.map(child => ({
        path: child.path,
        title: child.title
      }))

      // 递归重新生成所有子节点的路径
      const reindexAllChildren = (node: DocumentOutlineNode) => {
        if (node.children && node.children.length > 0) {
          regeneratePaths(node)
          for (const child of node.children) {
            reindexAllChildren(child)
          }
        }
      }
      reindexAllChildren(workingOutline)

      onUpdate({
        content: {
          stage: 'syncing',
          nodePath: workingNode.path,
          nodeTitle: workingNode.title,
          originalOrder,
          newOrder
        },
        format: 'json'
      }, {
        percentage: 80,
        message: i18n.global.t('agent.tool.outlineReorder.progress.syncing', '正在同步文档内容...')
      })

      // 同步大纲到文档
      const doc2 = workspace.ensureDocument(targetTabId)
      if (doc2) {
        workspace.updateDocumentOutline(targetTabId, workingOutline)
        workspace.updateDocumentLastView(targetTabId, 'outline')

        const adapter = getOutlineAdapter(doc.format)
        if (doc.format === 'tex') {
          const nextTex = await adapter.toText(workingOutline, doc2.tex || '')
          workspace.updateDocumentTex(targetTabId, nextTex)
        } else {
          const nextMd = await adapter.toText(workingOutline, doc2.markdown || '')
          workspace.updateDocumentMarkdown(targetTabId, nextMd)
        }
      }

      onUpdate({
        content: {
          stage: 'completed',
          nodePath: workingNode.path,
          nodeTitle: workingNode.title,
          originalOrder,
          newOrder
        },
        format: 'json'
      }, {
        percentage: 100,
        message: i18n.global.t('agent.tool.outlineReorder.progress.completed', '大纲优化完成')
      })

      return {
        status: 'succeeded',
        data: {
          content: {
            stage: 'completed',
            nodePath: workingNode.path,
            nodeTitle: workingNode.title,
            originalOrder,
            newOrder
          },
          format: 'json'
        },
        result: {
          nodePath: targetNode.path,
          nodeTitle: targetNode.title,
          originalOrder,
          newOrder,
          childrenCount: newOrder.length
        }
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

const outlineReorderToolLocales: ToolLocales = {
  zh_cn: {
    name: '大纲优化',
    description: '调整大纲节点的子节点顺序。根据AI返回的JSON重新排列子节点，保持每个节点的内容不变'
  },
  en_us: {
    name: 'Outline Reorder',
    description: 'Reorder child nodes of outline nodes. Rearrange children based on AI-returned JSON, keeping each node\'s content unchanged'
  },
  de_DE: {
    name: 'Gliederungsreihung',
    description: 'Unterknoten von Gliederungsknoten neu anordnen. Basierend auf AI-returnierten JSON neu ordnen, Inhalt jedes Knotens unverändert'
  },
  fr_FR: {
    name: 'Réorganisation d\'arborescence',
    description: 'Réorganiser les nœuds enfants des nœuds d\'arborescence. Réorganiser les enfants basé sur JSON retourné par l\'IA, gardant le contenu de chaque nœud inchangé'
  },
  ja_JP: {
    name: 'アウトライン再配置',
    description: 'アウトラインノードの子ノードの順序を調整。AIが返すJSONに基づいて子ノードを再配置し、各ノードのコンテンツを保持'
  },
  ko_KR: {
    name: '개요 재정렬',
    description: '개요 노드의 자식 노드 순서 조정. AI가 반환한 JSON에 따라 자식 노드를 재정렬하고 각 노드의 내용을 유지'
  }
}

export const outlineReorderToolConfig: AgentToolConfig = {
  id: 'outline-reorder',
  name: outlineReorderToolLocales,
  description: outlineReorderToolLocales,
  origin: 'internal',
  spec: {
    name: 'outline-reorder',
    brief: 'Reorder child nodes of outline nodes based on JSON. Keeps node content unchanged, only changes order.',
    fullSpec: `# Outline Reorder Tool

## Description
Reorders child nodes of a specified outline node based on AI-returned JSON. Each node's content remains unchanged, only the order is adjusted.

## Input Format
\`\`\`json
{
  "nodePath": "string",        // Required: Target node path (e.g., "1", "1.1", "dummy" for root)
  "newOrderJson": "string",    // Required: JSON array containing reordered node information
  "tabId": "string"            // Optional: Document tab ID
}
\`\`\`

## JSON Format
The \`newOrderJson\` should be a JSON array with objects containing:
- \`path\`: Original node path (used for matching)
- \`title\`: Node title (optional, used as fallback for matching)

Example:
\`\`\`json
[
  {"path": "1.2", "title": "Chapter 2"},
  {"path": "1.1", "title": "Chapter 1"},
  {"path": "1.3", "title": "Chapter 3"}
]
\`\`\`

## Notes
1. Nodes are matched by path first, then by title if path doesn't match
2. Nodes not in JSON will be appended to the end (in original order)
3. After reordering, all paths are regenerated automatically`
  },
  instruction: `
# 大纲优化工具（节点顺序调整）

## 功能描述
根据AI返回的JSON重新排列指定节点的子节点顺序。每个节点的内容保持不变，只调整顺序。

## 使用场景
- 需要调整章节顺序
- 需要重新组织文档结构
- 需要根据逻辑关系重新排列子节点

## 输入格式
\`\`\`json
{
  "nodePath": "string",        // ⚠️ 必需：目标节点的路径（如"1", "1.1", "dummy"表示根节点）
  "newOrderJson": "string",    // ⚠️ 必需：包含重新排序的节点信息的JSON数组（字符串格式）
  "tabId": "string"            // 可选：文档标签页ID，默认使用当前活动标签页
}
\`\`\`

## JSON格式说明

\`newOrderJson\`应该是一个JSON数组（字符串格式），每个元素包含：
- \`path\`: 原始节点路径（用于匹配）
- \`title\`: 节点标题（可选，作为匹配的备用方案）

**示例**：
\`\`\`json
[
  {"path": "1.2", "title": "章节2"},
  {"path": "1.1", "title": "章节1"},
  {"path": "1.3", "title": "章节3"}
]
\`\`\`

## 匹配逻辑
1. **优先通过path匹配**：根据节点路径匹配
2. **备用通过title匹配**：如果path匹配失败，尝试通过title匹配
3. **未匹配的节点**：不在JSON中的节点会按原顺序追加到末尾

## 输出格式
\`\`\`json
{
  "nodePath": "string",
  "nodeTitle": "string",
  "originalOrder": [{"path": "1.1", "title": "..."}, ...],
  "newOrder": [{"path": "1.2", "title": "..."}, ...],
  "childrenCount": 3
}
\`\`\`

## 注意事项
1. **节点内容保持不变**：只调整顺序，不修改内容
2. **路径自动重新生成**：重新排序后，所有节点的路径会自动重新生成
3. **支持嵌套结构**：子节点的所有后代节点的路径也会重新生成
4. **JSON格式必须正确**：必须是有效的JSON数组格式

## 与其他工具的区别
- **outline-optimize（扩写工具）**：用于快速生成内容，不涉及顺序调整
- **node-agent（节点智能体）**：用于智能生成内容，不涉及顺序调整
- **outline-reorder（大纲优化工具）**：专门用于调整节点顺序，不修改内容
`,
  callback: outlineReorderToolCallback,
  tags: ['outline', 'optimization', 'reorder'],
  enabled: true,
  editable: false,
  locales: outlineReorderToolLocales
}

