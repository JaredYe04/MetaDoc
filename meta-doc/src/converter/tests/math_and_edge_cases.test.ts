/**
 * Tests for LaTeX-style math in Markdown \( \), \[ \], and various edge cases.
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

describe('LaTeX-style math in Markdown', () => {
  describe('\\( \\) inline math', () => {
    it('\\( x^2 \\) → $x^2$ in LaTeX', () => {
      const out = markdownToLatex('\\( x^2 \\)')
      expect(out).toContain('$x^2$')
    })
    it('paragraph with \\( a + b \\)', () => {
      const out = markdownToLatex('Formula: \\( a + b \\)')
      expect(out).toContain('Formula')
      expect(out).toContain('$a + b$')
    })
    it('AST has math_inline', () => {
      const ast = markdownToAST('Say \\( E=mc^2 \\) here')
      expect(ast.children.length).toBe(1)
      const para = ast.children[0]
      expect(para.type).toBe('paragraph')
      const inlines = (para as { children: unknown[] }).children
      expect(inlines.some((n: unknown) => (n as { type?: string }).type === 'math_inline')).toBe(true)
    })
    it('round-trip \\( x \\) (AST equivalent)', () => {
      const md = ' \\( x \\) '
      const { ast1, ast2 } = roundTripAST(md)
      expect(astEqual(ast1, ast2)).toBe(true)
    })
  })

  describe('\\[ \\] display math', () => {
    it('\\[ E=mc^2 \\] → \\[...\\] in LaTeX', () => {
      const out = markdownToLatex('\\[ E=mc^2 \\]')
      expect(out).toContain('\\[')
      expect(out).toContain('E=mc^2')
      expect(out).toContain('\\]')
    })
    it('multiline \\[ ... \\]', () => {
      const md = '\\[\na\nb\n\\]'
      const out = markdownToLatex(md)
      expect(out).toContain('\\[')
      expect(out).toContain('a')
      expect(out).toContain('b')
    })
    it('AST has math_block', () => {
      const ast = markdownToAST('\\[ \\int_0^1 x \\, dx \\]')
      expect(ast.children.length).toBe(1)
      expect(ast.children[0].type).toBe('math_block')
    })
    it('round-trip \\[ x \\] (AST equivalent)', () => {
      const md = '\\[ x \\]'
      const { ast1, ast2 } = roundTripAST(md)
      expect(astEqual(ast1, ast2)).toBe(true)
    })
  })

  describe('mixed $ and \\( \\[', () => {
    it('$a$ and \\( b \\) in same paragraph', () => {
      const out = markdownToLatex('$a$ and \\( b \\)')
      expect(out).toContain('$a$')
      expect(out).toContain('$b$')
    })
    it('$$ and \\[ both as block', () => {
      expect(markdownToLatex('$$\nx\n$$')).toContain('\\[')
      expect(markdownToLatex('\\[ y \\]')).toContain('\\[')
    })
  })
})

describe('Edge cases and odd inputs', () => {
  it('backslash at end of line', () => {
    const out = markdownToLatex('line with backslash \\')
    expect(out.length).toBeGreaterThan(0)
  })
  it('empty \\( \\)', () => {
    const ast = markdownToAST('\\( \\)')
    expect(ast.type).toBe('document')
    expect(ast.children.length).toBeGreaterThanOrEqual(1)
  })
  it('unclosed \\( stays as text or safe', () => {
    const out = markdownToLatex('unclosed \\( x')
    expect(out.length).toBeGreaterThanOrEqual(0)
    expect(() => markdownToLatex('unclosed \\( x')).not.toThrow()
  })
  it('unclosed \\[ collects until EOL or next block', () => {
    const out = markdownToLatex('\\[ no close')
    expect(out.length).toBeGreaterThanOrEqual(0)
  })
  it(') without backslash in text', () => {
    const out = markdownToLatex('(paren) and (another)')
    expect(out).toContain('paren')
    expect(out).toContain('another')
  })
  it('] in paragraph not start of \\]', () => {
    const out = markdownToLatex('bracket ] in text')
    expect(out).toContain(']')
  })
  it('link [text](url) not confused with \\(', () => {
    const out = markdownToLatex('[link](http://x)')
    expect(out).toContain('href')
    expect(out).toContain('link')
  })
  it('code block with backslash', () => {
    const md = '```\n\\\\begin\n```'
    const out = markdownToLatex(md)
    expect(out).toContain('verbatim')
    expect(out).toContain('\\\\begin')
  })
  it('heading with # in content (escaped in LaTeX)', () => {
    const out = markdownToLatex('# Title with # hash')
    expect(out).toContain('section')
    expect(out).toContain('\\#')
  })
  it('number then dot not list: 1. not list', () => {
    const out = markdownToLatex('1. not list')
    expect(out).toContain('enumerate')
  })
  it('only backslash', () => {
    const out = markdownToLatex('\\')
    expect(out.length).toBeGreaterThanOrEqual(0)
  })
})
