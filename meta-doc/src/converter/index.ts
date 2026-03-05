/**
 * MetaDoc Markdown ⇄ LaTeX conversion library.
 * Uses AST as intermediate representation; round-trip safe for supported subset.
 */

import { parseMarkdown } from './markdown/markdownParser'
import { renderMarkdown } from './markdown/markdownRenderer'
import { parseLatex } from './latex/latexParser'
import { renderLatex } from './latex/latexRenderer'
import { normalizeAST } from './transform/normalize'
import type { AST } from './ast/nodes'

export type { AST } from './ast/nodes'
export type { BlockNode, InlineNode } from './ast/nodes'

/** Markdown string → LaTeX body string (no document wrapper) */
export function markdownToLatex(markdown: string): string {
  const ast = parseMarkdown(markdown)
  return renderLatex(ast)
}

/** LaTeX body string → Markdown string */
export function latexToMarkdown(latex: string): string {
  const ast = parseLatex(latex)
  return renderMarkdown(ast)
}

/** Markdown string → MetaDoc AST */
export function markdownToAST(markdown: string): AST {
  return parseMarkdown(markdown)
}

/** LaTeX string → MetaDoc AST */
export function latexToAST(latex: string): AST {
  return parseLatex(latex)
}

/** Normalize AST for round-trip comparison (merge adjacent text, trim, etc.) */
export { normalizeAST }
