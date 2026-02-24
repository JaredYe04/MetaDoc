import type { DocumentOutlineNode } from '../../../types'
import { extractOutlineTreeFromMarkdown } from './document/outline'

/**
 * 从节点的 text（Markdown 片段）中解析子标题，更新 node.children。
 * 用于 AI 生成内容或用户编辑后，将内容中的 ### 等标题同步为大纲子节点。
 */
export function syncChildrenFromNodeText(node: DocumentOutlineNode): void {
  const text = node.text?.trim() ?? ''
  if (!text) {
    node.children = []
    return
  }
  try {
    const extracted = extractOutlineTreeFromMarkdown(text, false)
    if (!extracted?.children?.length) {
      node.children = []
      return
    }
    const basePath = node.path || ''
    const reindex = (children: DocumentOutlineNode[], prefix: string): DocumentOutlineNode[] => {
      return children.map((child, i) => {
        const path = prefix ? `${prefix}.${i + 1}` : `${i + 1}`
        const newNode: DocumentOutlineNode = {
          ...child,
          path,
          children: child.children?.length ? reindex(child.children, path) : []
        }
        return newNode
      })
    }
    node.children = reindex(extracted.children, basePath)
  } catch {
    node.children = []
  }
}

export function searchNode(path: string, node: DocumentOutlineNode): DocumentOutlineNode | null {
  if (!node) return null
  if (node.path === path) {
    return node
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = searchNode(path, child)
      if (found) return found
    }
  }
  return null
}

export function searchParentNode(
  path: string,
  node: DocumentOutlineNode
): DocumentOutlineNode | null {
  if (!node || !Array.isArray(node.children)) {
    return null
  }
  for (const child of node.children) {
    if (child.path === path) {
      return node
    }
    const result = searchParentNode(path, child)
    if (result) {
      return result
    }
  }
  return null
}

export function countNodes(node: DocumentOutlineNode): number {
  if (!node) {
    return 0
  }
  let count = 1
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      count += countNodes(child)
    }
  }
  return count
}
