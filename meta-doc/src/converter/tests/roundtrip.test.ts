/**
 * Round-trip tests: Markdown → LaTeX → Markdown, compare ASTs (not raw string).
 * Uses normalizeAST for comparison.
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

describe('Round-trip (MD → LaTeX → MD, AST equivalence)', () => {
  it('heading round-trip', () => {
    const md = '# Hello'
    const { ast1, ast2 } = roundTripAST(md)
    expect(astEqual(ast1, ast2)).toBe(true)
  })

  it('heading with bold round-trip', () => {
    const md = '# Hello **world**'
    const { ast1, ast2 } = roundTripAST(md)
    expect(astEqual(ast1, ast2)).toBe(true)
  })

  it('paragraph only round-trip', () => {
    const md = 'Hello world'
    const { ast1, ast2 } = roundTripAST(md)
    expect(astEqual(ast1, ast2)).toBe(true)
  })

  it('bold round-trip', () => {
    const md = '**bold**'
    const { ast1, ast2 } = roundTripAST(md)
    expect(astEqual(ast1, ast2)).toBe(true)
  })

  it('italic round-trip', () => {
    const md = '*italic*'
    const { ast1, ast2 } = roundTripAST(md)
    expect(astEqual(ast1, ast2)).toBe(true)
  })

  it('inline code round-trip', () => {
    const md = '`code`'
    const { ast1, ast2 } = roundTripAST(md)
    expect(astEqual(ast1, ast2)).toBe(true)
  })

  it('link round-trip', () => {
    const md = '[text](https://example.com)'
    const { ast1, ast2 } = roundTripAST(md)
    expect(astEqual(ast1, ast2)).toBe(true)
  })

  it('image round-trip', () => {
    const md = '![alt](img.png)'
    const { ast1, ast2 } = roundTripAST(md)
    expect(astEqual(ast1, ast2)).toBe(true)
  })

  it('code block round-trip', () => {
    const md = '```\ncode\n```'
    const { ast1, ast2 } = roundTripAST(md)
    expect(astEqual(ast1, ast2)).toBe(true)
  })

  it('math block round-trip', () => {
    const md = '$$\nE=mc^2\n$$'
    const { ast1, ast2 } = roundTripAST(md)
    expect(astEqual(ast1, ast2)).toBe(true)
  })

  it('inline math round-trip', () => {
    const md = 'Say $x^2$ here'
    const { ast1, ast2 } = roundTripAST(md)
    expect(astEqual(ast1, ast2)).toBe(true)
  })

  it('unordered list round-trip', () => {
    const md = '- a\n- b'
    const { ast1, ast2 } = roundTripAST(md)
    expect(astEqual(ast1, ast2)).toBe(true)
  })

  it('ordered list round-trip', () => {
    const md = '1. first\n2. second'
    const { ast1, ast2 } = roundTripAST(md)
    expect(astEqual(ast1, ast2)).toBe(true)
  })

  it('thematic break round-trip', () => {
    const md = '---'
    const { ast1, ast2 } = roundTripAST(md)
    expect(astEqual(ast1, ast2)).toBe(true)
  })

  it('LaTeX → Markdown → LaTeX preserves AST', () => {
    const latex = '\\section{Hi}\n\n\\textbf{bold}'
    const ast1 = normalizeAST(latexToAST(latex))
    const md = latexToMarkdown(latex)
    const latex2 = markdownToLatex(md)
    const ast2 = normalizeAST(latexToAST(latex2))
    expect(astEqual(ast1, ast2)).toBe(true)
  })

  it('mixed document round-trip', () => {
    const md = '# Title\n\nPara with **bold** and `code`.\n\n- item1\n- item2'
    const { ast1, ast2 } = roundTripAST(md)
    expect(astEqual(ast1, ast2)).toBe(true)
  })
})
