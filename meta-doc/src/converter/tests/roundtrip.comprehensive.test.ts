/**
 * Comprehensive round-trip tests: MD → LaTeX → MD, AST equivalence.
 * LaTeX-only content (unknown) may not round-trip to identical string but must not crash.
 */

import { describe, it, expect } from 'vitest'
import {
  markdownToLatex,
  latexToMarkdown,
  markdownToAST,
  latexToAST,
  normalizeAST
} from '../index'

function roundTripAST(md: string) {
  const latex = markdownToLatex(md)
  const md2 = latexToMarkdown(latex)
  const ast1 = normalizeAST(markdownToAST(md))
  const ast2 = normalizeAST(markdownToAST(md2))
  return { ast1, ast2, latex, md2 }
}

function astEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return a === b
  const A = a as Record<string, unknown>
  const B = b as Record<string, unknown>
  const keysA = Object.keys(A).sort()
  const keysB = Object.keys(B).sort()
  if (keysA.length !== keysB.length) return false
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(B, k)) return false
    if (k === 'children' || k === 'items') {
      const arrA = A[k] as unknown[]
      const arrB = B[k] as unknown[]
      if (arrA.length !== arrB.length) return false
      for (let i = 0; i < arrA.length; i++) {
        if (!astEqual(arrA[i], arrB[i])) return false
      }
    } else if (!astEqual(A[k], B[k])) {
      return false
    }
  }
  return true
}

describe('Round-trip comprehensive', () => {
  const cases: Array<{ name: string; md: string }> = [
    { name: 'H1', md: '# H1' },
    { name: 'H2', md: '## H2' },
    { name: 'H3', md: '### H3' },
    { name: 'paragraph', md: 'Hello world' },
    { name: 'bold', md: '**b**' },
    { name: 'italic', md: '*i*' },
    { name: 'inline code', md: '`c`' },
    { name: 'link', md: '[t](u)' },
    { name: 'image', md: '![a](u)' },
    { name: 'code block', md: '```\nc\n```' },
    { name: 'math block', md: '$$\nx\n$$' },
    { name: 'inline math', md: 'a $x$ b' },
    { name: 'unordered list', md: '- a\n- b' },
    { name: 'ordered list', md: '1. a\n2. b' },
    { name: 'thematic break', md: '---' },
    { name: 'blockquote', md: '> q' },
    { name: 'mixed', md: '# T\n\nP with **b** and `c`.\n\n- i1\n- i2' },
    { name: 'two paragraphs', md: 'A\n\nB' },
    { name: 'heading + bold', md: '# Hello **w**' },
    { name: 'list item bold', md: '- **x**' },
  ]

  for (const { name, md } of cases) {
    it(`${name}`, () => {
      const { ast1, ast2 } = roundTripAST(md)
      expect(astEqual(ast1, ast2), `Round-trip AST mismatch for: ${md}`).toBe(true)
    })
  }

  describe('LaTeX → MD → LaTeX (known subset)', () => {
    it('section + textbf', () => {
      const latex = '\\section{Hi}\n\n\\textbf{bold}'
      const ast1 = normalizeAST(latexToAST(latex))
      const md = latexToMarkdown(latex)
      const latex2 = markdownToLatex(md)
      const ast2 = normalizeAST(latexToAST(latex2))
      expect(astEqual(ast1, ast2)).toBe(true)
    })
  })

  describe('no crash on LaTeX-only content', () => {
    it('cite in paragraph', () => {
      const latex = 'See \\cite{x}.'
      const md = latexToMarkdown(latex)
      const latex2 = markdownToLatex(md)
      expect(latexToAST(latex2).type).toBe('document')
    })
    it('figure environment', () => {
      const latex = '\\begin{figure}\n\\includegraphics{x}\n\\end{figure}'
      const md = latexToMarkdown(latex)
      expect(md.length).toBeGreaterThanOrEqual(0)
      expect(() => markdownToLatex(md)).not.toThrow()
    })
  })
})
