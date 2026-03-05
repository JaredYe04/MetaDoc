/**
 * MetaDoc AST → Markdown renderer.
 */

import type { AST, BlockNode, InlineNode } from '../ast/nodes'
import {
  isHeadingNode,
  isParagraphNode,
  isListNode,
  isListItemNode,
  isCodeBlockNode,
  isMathBlockNode,
  isBlockquoteNode,
  isThematicBreakNode,
  isTableNode,
  isUnknownBlockNode,
  isTextNode,
  isStrongNode,
  isEmphasisNode,
  isInlineCodeNode,
  isLinkNode,
  isImageNode,
  isMathInlineNode,
  isStrikethroughNode
} from '../ast/nodes'

export function renderMarkdown(ast: AST): string {
  return ast.children.map((b) => renderBlock(b)).filter(Boolean).join('\n\n')
}

function renderBlock(node: BlockNode): string {
  if (isHeadingNode(node)) {
    const prefix = '#'.repeat(node.level)
    return `${prefix} ${renderInlineSequence(node.children)}`
  }
  if (isParagraphNode(node)) {
    return renderInlineSequence(node.children)
  }
  if (isListNode(node)) {
    return node.items
      .map((item, idx) => {
        const bullet = node.ordered ? `${idx + 1}.` : '-'
        const first = item.children[0]
        const text =
          first && first.type === 'paragraph'
            ? renderInlineSequence((first as { children: InlineNode[] }).children)
            : ''
        return `${bullet} ${text}`
      })
      .join('\n')
  }
  if (isCodeBlockNode(node)) {
    const lang = node.lang ? ` ${node.lang}` : ''
    return `\`\`\`${lang}\n${node.content}\n\`\`\``
  }
  if (isMathBlockNode(node)) {
    return `$$\n${node.content}\n$$`
  }
  if (isBlockquoteNode(node)) {
    const inner = node.children.map((b) => renderBlock(b)).join('\n\n')
    return inner
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
  }
  if (isThematicBreakNode(node)) {
    return '---'
  }
  if (isTableNode(node)) {
    const header = '| ' + node.headerRow.join(' | ') + ' |'
    const sep = '| ' + node.headerRow.map(() => '---').join(' | ') + ' |'
    const body = node.rows.map((row) => '| ' + row.join(' | ') + ' |').join('\n')
    return [header, sep, body].filter(Boolean).join('\n')
  }
  if (isUnknownBlockNode(node)) {
    return node.raw
  }
  return ''
}

function renderInlineSequence(nodes: InlineNode[]): string {
  return nodes.map(renderInline).join('')
}

function renderInline(node: InlineNode): string {
  if (isTextNode(node)) return node.value
  if (isStrongNode(node)) return `**${renderInlineSequence(node.children)}**`
  if (isEmphasisNode(node)) return `*${renderInlineSequence(node.children)}*`
  if (isInlineCodeNode(node)) return `\`${node.value}\``
  if (isLinkNode(node)) return `[${renderInlineSequence(node.children)}](${node.url})`
  if (isImageNode(node)) return `![${node.alt || ''}](${node.url})`
  if (isMathInlineNode(node)) return `$${node.content}$`
  if (isStrikethroughNode(node)) return `~~${renderInlineSequence(node.children)}~~`
  if (node.type === 'unknown_inline') return node.raw
  return ''
}
