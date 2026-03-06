/**
 * MetaDoc AST → LaTeX renderer.
 * Mapping per spec: section, subsection, textbf, verbatim, itemize/enumerate, etc.
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

const SECTION_CMD: Record<1 | 2 | 3, string> = {
  1: 'section',
  2: 'subsection',
  3: 'subsubsection'
}

/** Escape LaTeX special characters in plain text */
export function escapeLatex(str: string): string {
  if (!str) return ''
  let result = String(str)
  result = result.replace(/\\/g, '\\\\')
  result = result.replace(/([{}])/g, '\\$1')
  result = result.replace(/#/g, '\\#')
  result = result.replace(/\$/g, '\\$')
  result = result.replace(/&/g, '\\&')
  result = result.replace(/%/g, '\\%')
  result = result.replace(/_/g, '\\_')
  result = result.replace(/~/g, '\\textasciitilde{}')
  result = result.replace(/\^/g, '\\^{}')
  return result
}

/** Escape for content inside \\texttt{...}: backslash → \\textbackslash for roundtrip */
function escapeLatexForTexttt(str: string): string {
  if (!str) return ''
  let result = String(str)
  result = result.replace(/\\/g, '\\textbackslash')
  result = result.replace(/([{}])/g, '\\$1')
  result = result.replace(/#/g, '\\#')
  result = result.replace(/\$/g, '\\$')
  result = result.replace(/&/g, '\\&')
  result = result.replace(/%/g, '\\%')
  result = result.replace(/_/g, '\\_')
  result = result.replace(/~/g, '\\textasciitilde{}')
  result = result.replace(/\^/g, '\\^{}')
  return result
}

export function renderLatex(ast: AST): string {
  return ast.children.map((b) => renderBlock(b)).filter(Boolean).join('\n\n')
}

function renderBlock(node: BlockNode): string {
  if (isHeadingNode(node)) {
    const cmd = SECTION_CMD[node.level] ?? 'section'
    return `\\${cmd}{${renderInlineSequenceLatex(node.children)}}`
  }
  if (isParagraphNode(node)) {
    return renderInlineSequenceLatex(node.children)
  }
  if (isListNode(node)) {
    const env = node.ordered ? 'enumerate' : 'itemize'
    const items = node.items
      .map((item) => {
        const first = item.children[0]
        const text =
          first && first.type === 'paragraph'
            ? renderInlineSequenceLatex((first as { children: InlineNode[] }).children)
            : ''
        return `\\item ${text}`
      })
      .join('\n')
    return `\\begin{${env}}\n${items}\n\\end{${env}}`
  }
  if (isCodeBlockNode(node)) {
    return `\\begin{verbatim}\n${node.content}\n\\end{verbatim}`
  }
  if (isMathBlockNode(node)) {
    return `\\[\n${node.content}\n\\]`
  }
  if (isBlockquoteNode(node)) {
    const inner = node.children.map((b) => renderBlock(b)).join('\n\n')
    return `\\begin{quote}\n${inner}\n\\end{quote}`
  }
  if (isThematicBreakNode(node)) {
    return '\\hrulefill'
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

function renderInlineSequenceLatex(nodes: InlineNode[]): string {
  return nodes.map(renderInlineLatex).join('')
}

function renderInlineLatex(node: InlineNode): string {
  if (isTextNode(node)) return escapeLatex(node.value)
  if (isStrongNode(node)) return `\\textbf{${renderInlineSequenceLatex(node.children)}}`
  if (isEmphasisNode(node)) return `\\textit{${renderInlineSequenceLatex(node.children)}}`
  if (isInlineCodeNode(node)) return `\\texttt{${escapeLatexForTexttt(node.value)}}`
  if (isLinkNode(node)) return `\\href{${escapeLatex(node.url)}}{${renderInlineSequenceLatex(node.children)}}`
  if (isImageNode(node)) return `\\includegraphics{${escapeLatex(node.url)}}`
  if (isMathInlineNode(node)) return `$${node.content}$`
  if (isStrikethroughNode(node)) return `\\sout{${renderInlineSequenceLatex(node.children)}}`
  if (node.type === 'unknown_inline') return node.raw
  return ''
}
