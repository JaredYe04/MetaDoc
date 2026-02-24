import type { DocumentOutlineNode } from '../../../types'
import { extractOutlineTreeFromMarkdown } from './document/outline'
import { convertLatexToMarkdown } from './latex-utils'
import {
  normalizeMarkdownHeadingLevelsInContent as normalizeMd,
  normalizeLatexHeadingLevelsInContent as normalizeLatex,
  hasLatexHeadings
} from './outline-normalize'

export { normalizeMarkdownHeadingLevelsInContent, normalizeLatexHeadingLevelsInContent } from './outline-normalize'

/**
 * 从节点的 text 中解析子标题，更新 node.children。
 * 用于 AI 生成内容或用户编辑后，将内容中的标题同步为大纲子节点。
 * 会先将内容中的标题层级规格化（最高层级比母节点低一级），再解析，避免同级标题破坏母树。
 *
 * 与 Markdown / LaTeX 一致：
 * - 若内容含 LaTeX 标题（\\section、\\subsection、\\subsubsection）：先做 LaTeX 层级规格化，
 *   再转为 Markdown 后解析，并将 node.text 存为 MD，以便后续生成与全文档一致。
 * - 否则按 Markdown（# ## ###）规格化并解析。
 */
export function syncChildrenFromNodeText(node: DocumentOutlineNode): void {
  let text = node.text?.trim() ?? ''
  if (!text) {
    node.children = []
    return
  }
  const parentLevel = node.title_level ?? 0
  if (hasLatexHeadings(text)) {
    text = normalizeLatex(text, parentLevel)
    try {
      text = convertLatexToMarkdown(text)
    } catch {
      node.children = []
      return
    }
  } else {
    text = normalizeMd(text, parentLevel)
  }
  node.text = text
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
