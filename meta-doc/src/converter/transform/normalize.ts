/**
 * AST normalization for round-trip comparison.
 * - Merges adjacent text nodes in inline sequences
 * - Trims whitespace in text nodes
 * - Normalizes empty paragraphs/lists for consistent comparison
 */

import type { AST, BlockNode, InlineNode } from '../ast/nodes'
import {
  isParagraphNode,
  isHeadingNode,
  isListNode,
  isListItemNode,
  isBlockquoteNode,
  isCodeBlockNode,
  isMathBlockNode
} from '../ast/nodes'

export function normalizeAST(ast: AST): AST {
  return {
    type: 'document',
    children: ast.children.map(normalizeBlock).filter((b): b is BlockNode => b != null)
  }
}

function normalizeBlock(node: BlockNode): BlockNode | null {
  if (node.type === 'document') {
    return node
  }
  if (node.type === 'heading') {
    return {
      type: 'heading',
      level: node.level,
      children: normalizeInlineSequence(node.children)
    }
  }
  if (node.type === 'paragraph') {
    const normalized = normalizeInlineSequence(node.children)
    if (normalized.length === 0) return null
    return { type: 'paragraph', children: normalized }
  }
  if (node.type === 'list') {
    const items = node.items
      .map((item) => ({
        type: 'list_item' as const,
        children: item.children.map(normalizeBlock).filter((b): b is BlockNode => b != null)
      }))
      .filter((item) => item.children.length > 0)
    if (items.length === 0) return null
    return { type: 'list', ordered: node.ordered, items }
  }
  if (node.type === 'list_item') {
    const children = node.children.map(normalizeBlock).filter((b): b is BlockNode => b != null)
    if (children.length === 0) return null
    return { type: 'list_item', children }
  }
  if (node.type === 'code_block') {
    return {
      type: 'code_block',
      content: node.content.trimEnd(),
      lang: node.lang?.trim() || undefined
    }
  }
  if (node.type === 'math_block') {
    return { type: 'math_block', content: node.content.trim() }
  }
  if (node.type === 'blockquote') {
    const children = node.children.map(normalizeBlock).filter((b): b is BlockNode => b != null)
    if (children.length === 0) return null
    return { type: 'blockquote', children }
  }
  if (node.type === 'thematic_break' || node.type === 'unknown') {
    return node
  }
  if (node.type === 'table') {
    return {
      type: 'table',
      headerRow: node.headerRow.map((c) => c.trim()),
      rows: node.rows.map((row) => row.map((c) => c.trim()))
    }
  }
  return node
}

function normalizeInlineSequence(nodes: InlineNode[]): InlineNode[] {
  const merged: InlineNode[] = []
  let textAcc = ''

  const flushText = () => {
    const trimmed = textAcc.trim()
    if (trimmed.length > 0) {
      merged.push({ type: 'text', value: trimmed })
    }
    textAcc = ''
  }

  for (const n of nodes) {
    if (n.type === 'text') {
      textAcc += n.value
      continue
    }
    flushText()
    if (n.type === 'strong' || n.type === 'emphasis' || n.type === 'link' || n.type === 'strikethrough') {
      merged.push({
        ...n,
        children: normalizeInlineSequence(n.children)
      } as InlineNode)
    } else if (n.type === 'image') {
      // LaTeX \includegraphics{url} has no alt; normalize to url-only for round-trip comparison
      merged.push({ type: 'image', url: n.url })
    } else {
      merged.push(n)
    }
  }
  flushText()
  return merged
}
