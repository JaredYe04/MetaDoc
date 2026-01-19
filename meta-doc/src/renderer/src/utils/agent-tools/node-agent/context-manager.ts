/**
 * NodeAgent 上下文管理器
 * 负责管理全局上下文和节点级上下文
 */

import type { DocumentOutlineNode } from '@/types'
import { createRendererLogger } from '../../logger'

const logger = createRendererLogger('NodeAgentContextManager')

/**
 * 全局上下文
 */
export interface GlobalContext {
  /** 系统提示词（时间戳、预设内容等） */
  systemPrompt: string
  /** 用户提示词 */
  userPrompt: string
  /** 文档格式 */
  docFormat: 'md' | 'tex'
  /** 文档路径 */
  docPath?: string
  /** 时间戳 */
  timestamp: number
  /** 其他元数据 */
  metadata?: Record<string, unknown>
}

/**
 * 节点上下文
 */
export interface NodeContext {
  /** 节点路径 */
  path: string
  /** 节点标题 */
  title: string
  /** 节点层级 */
  level: number
  /** 当前节点内容 */
  currentContent: string
  /** 子节点上下文列表 */
  childrenContext: Array<{
    path: string
    title: string
    content: string
    level: number
  }>
  /** 父节点信息 */
  parentInfo?: {
    path: string
    title: string
  }
  /** 是否为叶子节点 */
  isLeaf: boolean
}

/**
 * NodeAgent 上下文管理器
 */
export class NodeAgentContextManager {
  private globalContext: GlobalContext
  private nodeContexts: Map<string, NodeContext> = new Map()

  constructor(globalContext: GlobalContext) {
    this.globalContext = globalContext
  }

  /**
   * 获取全局上下文
   */
  getGlobalContext(): GlobalContext {
    return { ...this.globalContext }
  }

  /**
   * 更新全局上下文
   */
  updateGlobalContext(updates: Partial<GlobalContext>): void {
    this.globalContext = { ...this.globalContext, ...updates }
  }

  /**
   * 构建节点上下文
   */
  buildNodeContext(
    node: DocumentOutlineNode,
    outlineTree: DocumentOutlineNode,
    executedNodes: Map<string, { content?: string }>
  ): NodeContext {
    const childrenContext: NodeContext['childrenContext'] = []
    
    // 收集子节点上下文
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        const executed = executedNodes.get(child.path)
        childrenContext.push({
          path: child.path,
          title: child.title || '',
          content: executed?.content || child.text || '',
          level: child.title_level || 0
        })
      }
    }

    // 查找父节点
    const parentInfo = this.findParentNode(node.path, outlineTree)

    const nodeContext: NodeContext = {
      path: node.path,
      title: node.title || '',
      level: node.title_level || 0,
      currentContent: node.text || '',
      childrenContext,
      parentInfo: parentInfo ? {
        path: parentInfo.path,
        title: parentInfo.title || ''
      } : undefined,
      isLeaf: !node.children || node.children.length === 0
    }

    // 缓存节点上下文
    this.nodeContexts.set(node.path, nodeContext)
    return nodeContext
  }

  /**
   * 获取节点上下文
   */
  getNodeContext(nodePath: string): NodeContext | undefined {
    return this.nodeContexts.get(nodePath)
  }

  /**
   * 更新节点内容
   */
  updateNodeContent(nodePath: string, content: string): void {
    const context = this.nodeContexts.get(nodePath)
    if (context) {
      context.currentContent = content
    }
  }

  /**
   * 构建系统提示词
   */
  buildSystemPrompt(nodeContext: NodeContext): string {
    const { globalContext } = this
    const formatInstruction = globalContext.docFormat === 'tex'
      ? '**重要：文档格式是LaTeX，生成的内容应该使用LaTeX格式。**'
      : '**重要：文档格式是Markdown，生成的内容应该使用Markdown格式。**'

    const timestamp = new Date(globalContext.timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    let prompt = `# NodeAgent 系统提示词

${formatInstruction}

## 当前时间
${timestamp}

## 全局上下文
- **用户提示词**: ${globalContext.userPrompt || '无'}
- **文档格式**: ${globalContext.docFormat}
${globalContext.docPath ? `- **文档路径**: ${globalContext.docPath}` : ''}

## 当前节点信息
- **路径**: ${nodeContext.path}
- **标题**: ${nodeContext.title}
- **层级**: ${nodeContext.level}
- **类型**: ${nodeContext.isLeaf ? '叶子节点' : '父节点'}

${nodeContext.parentInfo ? `## 父节点信息
- **路径**: ${nodeContext.parentInfo.path}
- **标题**: ${nodeContext.parentInfo.title}
` : ''}

${nodeContext.childrenContext.length > 0 ? `## 子节点内容（已处理完成）
${nodeContext.childrenContext.map(child => 
  `### ${child.title} (${child.path})
${child.content ? child.content.substring(0, 500) + (child.content.length > 500 ? '...' : '') : '无内容'}`
).join('\n\n')}
` : nodeContext.isLeaf ? '' : `## 子节点
无子节点
`}

## 当前节点内容
${nodeContext.currentContent || '（空）'}

## 执行原则

### 后序遍历原则
1. **子节点已处理完成**：所有子节点都已经处理完成，你现在可以看到它们的内容
2. **根据子节点内容生成**：参考子节点的内容，决定当前节点应该如何写作
3. **避免重复**：如果子节点已经详细阐述了相关内容，父节点可以：
   - 直接留空（如果子节点已经完整覆盖）
   - 简要概括（如果需要总结和引导）
   - 补充连接性内容（如果需要过渡和衔接）

### 内容生成建议
${nodeContext.isLeaf ? `
**你是叶子节点**，需要根据标题和上下文生成内容：
1. 查看父节点和全局上下文
2. 根据标题生成相应的内容
3. 如果内容过少，可以使用扩写工具（outline-optimize）创建子节点
4. 如果创建了子节点，需要递归调用写作智能体处理这些子节点
` : `
**你是父节点**，需要根据子节点内容决定：
1. 查看所有子节点的内容
2. 判断是否需要生成内容：
   - 如果子节点内容已经很完整，可以考虑不生成或只生成简要概括
   - 如果需要连接和过渡，生成衔接性内容
   - 如果需要补充背景信息，生成背景性内容
`}

### 工具调用
你可以调用以下工具来辅助写作：
- **read-node-content**: 读取当前节点的内容
- **update-node-content**: 更新当前节点的内容
- **outline-optimize**: 扩写工具，为当前节点创建子节点
- **rag**: 知识库查询
- **chart-generation**: 图表生成
- 其他所有可用的Agent工具

### 输出格式
- **⚠️ 重要：不要直接输出内容作为节点内容**
- **⚠️ 重要：使用 read-node-content 和 update-node-content 工具来读取和修改节点内容**
- **⚠️ 重要：如果需要生成内容，使用 update-node-content 工具**
- **⚠️ 重要：子节点的标题和内容已经存在，你只需要生成父节点本身的文本内容**
- **⚠️ 重要：不要重复子节点的标题，不要生成类似 "# 子节点1"、"## 子节点2" 这样的标题行**

## 关键限制
- **你只能修改当前节点的文本内容（node.text），不能修改子节点（node.children）**
- **子节点的标题和内容由子节点自己管理，你不需要也不应该输出子节点的标题**
- **只生成父节点本身应该包含的文本内容（如概述、过渡、背景信息等）**

## 重要提示
- 你是一个独立的Agent，可以自主决定是否需要生成内容或调用工具
- 优先考虑子节点的内容完整性，避免重复和冗余
- 生成的内容应该符合文档格式要求
- 使用工具来读取和修改内容，而不是直接输出
`

    return prompt
  }

  /**
   * 构建用户提示词
   */
  buildUserPrompt(nodeContext: NodeContext): string {
    const { globalContext } = this
    let prompt = `请为节点"${nodeContext.title}" (${nodeContext.path}) 生成或优化内容。`

    if (globalContext.userPrompt) {
      prompt += `\n\n全局提示词：${globalContext.userPrompt}`
    }

    if (nodeContext.childrenContext.length > 0) {
      prompt += `\n\n子节点内容（已处理完成）：\n${nodeContext.childrenContext.map(child => 
        `### ${child.title}\n${child.content || '无内容'}`
      ).join('\n\n')}`
    }

    if (nodeContext.isLeaf) {
      prompt += `\n\n当前节点是叶子节点，请根据标题和上下文生成内容。如果内容过少，可以使用扩写工具创建子节点。`
    } else {
      prompt += `\n\n当前节点是父节点，请根据子节点内容决定是否需要生成内容，或调用工具来优化内容。`
    }

    prompt += `\n\n请使用 read-node-content 工具读取当前内容，然后使用 update-node-content 工具更新内容。`

    return prompt
  }

  /**
   * 查找父节点
   */
  private findParentNode(nodePath: string, outlineTree: DocumentOutlineNode): DocumentOutlineNode | null {
    if (nodePath === 'dummy' || !nodePath) {
      return null
    }

    const pathParts = nodePath.split('.')
    if (pathParts.length <= 1) {
      return outlineTree
    }

    // 移除最后一部分，得到父节点路径
    const parentPath = pathParts.slice(0, -1).join('.')
    
    // 递归查找
    const findNode = (node: DocumentOutlineNode, targetPath: string): DocumentOutlineNode | null => {
      if (node.path === targetPath) {
        return node
      }
      if (node.children) {
        for (const child of node.children) {
          const found = findNode(child, targetPath)
          if (found) return found
        }
      }
      return null
    }

    return findNode(outlineTree, parentPath) || outlineTree
  }

  /**
   * 清理上下文
   */
  clear(): void {
    this.nodeContexts.clear()
  }
}

