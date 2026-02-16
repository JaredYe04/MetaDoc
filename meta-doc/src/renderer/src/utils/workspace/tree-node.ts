/**
 * 树节点模型（用于 UI 展示）
 * 基于 FSNode，但包含 UI 相关状态
 */

import type { FSNode, URI } from './fs-models'

/**
 * 树节点（用于 UI）
 */
export interface TreeNode extends FSNode {
  // UI 状态
  expanded?: boolean
  isWorkspaceRoot?: boolean
  // 保留 path 字段以兼容旧代码（实际使用 uri）
  path?: string
}

/**
 * 树节点工具函数
 */
export class TreeNodeUtils {
  /**
   * 将 FSNode 转换为 TreeNode
   */
  static fromFSNode(node: FSNode, isWorkspaceRoot = false): TreeNode {
    return {
      ...node,
      expanded: false,
      isWorkspaceRoot,
      path: node.uri // 兼容旧代码
    }
  }

  /**
   * 查找节点（递归）
   */
  static findNodeByURI(node: TreeNode, targetURI: URI): TreeNode | null {
    if (node.uri === targetURI) {
      return node
    }

    if (node.children) {
      for (const child of node.children) {
        const found = this.findNodeByURI(child as TreeNode, targetURI)
        if (found) {
          return found
        }
      }
    }

    return null
  }

  /**
   * 获取所有节点（扁平化，只包含已展开的）
   */
  static getAllNodes(node: TreeNode, expandedURIs: Set<URI>): TreeNode[] {
    const result: TreeNode[] = [node]

    if (node.children && expandedURIs.has(node.uri)) {
      for (const child of node.children) {
        result.push(...this.getAllNodes(child as TreeNode, expandedURIs))
      }
    }

    return result
  }
}
