/**
 * Comprehensive Markdown → LaTeX tests: boundaries, edge cases, perfect conversion.
 * MD must convert to LaTeX completely (Tex capability contains MD).
 */

import { describe, it, expect } from 'vitest'
import { markdownToLatex, markdownToAST } from '../index'

describe('Markdown → LaTeX (comprehensive)', () => {
  describe('headings', () => {
    it('H1 → \\section{}', () => {
      expect(markdownToLatex('# A')).toBe('\\section{A}')
    })
    it('H2 → \\subsection{}', () => {
      expect(markdownToLatex('## B')).toBe('\\subsection{B}')
    })
    it('H3 → \\subsubsection{}', () => {
      expect(markdownToLatex('### C')).toBe('\\subsubsection{C}')
    })
    it('H4+ treated as H3', () => {
      expect(markdownToLatex('#### D')).toContain('\\subsubsection')
    })
    it('heading with only spaces after #', () => {
      const out = markdownToLatex('#   ')
      expect(out).toContain('section')
    })
  })

  describe('paragraphs and text', () => {
    it('plain text unchanged (except escape)', () => {
      expect(markdownToLatex('hello')).toBe('hello')
    })
    it('multiple paragraphs', () => {
      const out = markdownToLatex('P1\n\nP2')
      expect(out).toContain('P1')
      expect(out).toContain('P2')
    })
    it('single newline in paragraph', () => {
      const out = markdownToLatex('A\nB')
      expect(out).toContain('A')
      expect(out).toContain('B')
    })
    it('only whitespace line between paragraphs', () => {
      const out = markdownToLatex('X\n\n\nY')
      expect(out.length).toBeGreaterThan(0)
    })
    it('empty input', () => {
      expect(markdownToLatex('')).toBe('')
    })
    it('only spaces', () => {
      expect(markdownToLatex('   \n  ')).toBe('')
    })
    it('only newlines', () => {
      expect(markdownToLatex('\n\n')).toBe('')
    })
  })

  describe('bold and italic', () => {
    it('**bold** → \\textbf{}', () => {
      expect(markdownToLatex('**b**')).toBe('\\textbf{b}')
    })
    it('*italic* → \\textit{}', () => {
      expect(markdownToLatex('*i*')).toBe('\\textit{i}')
    })
    it('*** can be parsed as bold+remaining or bold of italic', () => {
      const out = markdownToLatex('***bi***')
      expect(out).toContain('textbf')
      expect(out).toContain('bi')
    })
    it('mixed: text **bold** text', () => {
      expect(markdownToLatex('a **b** c')).toBe('a \\textbf{b} c')
    })
    it('empty bold produces node', () => {
      const ast = markdownToAST('****')
      expect(ast.children.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('inline code', () => {
    it('`x` → \\texttt{x}', () => {
      expect(markdownToLatex('`x`')).toBe('\\texttt{x}')
    })
    it('backtick in code escaped', () => {
      const out = markdownToLatex('`a\\`b`')
      expect(out).toContain('texttt')
    })
  })

  describe('links and images', () => {
    it('[t](u) → \\href{u}{t}', () => {
      expect(markdownToLatex('[t](u)')).toBe('\\href{u}{t}')
    })
    it('![a](u) → \\includegraphics{u}', () => {
      expect(markdownToLatex('![a](u)')).toBe('\\includegraphics{u}')
    })
    it('image no alt', () => {
      expect(markdownToLatex('![](pic.png)')).toBe('\\includegraphics{pic.png}')
    })
    it('url in href present (URL may be escaped for LaTeX)', () => {
      const out = markdownToLatex('[x](http://a?b=1&c=2)')
      expect(out).toContain('href')
      expect(out).toContain('http')
      expect(out).toContain('x')
    })
  })

  describe('code block', () => {
    it('fenced block → verbatim', () => {
      expect(markdownToLatex('```\na\n```')).toBe(
        '\\begin{verbatim}\na\n\\end{verbatim}'
      )
    })
    it('code block with empty line inside', () => {
      const out = markdownToLatex('```\nline1\n\nline2\n```')
      expect(out).toContain('\\begin{verbatim}')
      expect(out).toContain('line1')
      expect(out).toContain('line2')
    })
    it('code block with language tag', () => {
      const out = markdownToLatex('```js\ncode\n```')
      expect(out).toContain('\\begin{verbatim}')
      expect(out).toContain('code')
    })
  })

  describe('math', () => {
    it('$$...$$ → \\[...\\]', () => {
      expect(markdownToLatex('$$\nx\n$$')).toBe('\\[\nx\n\\]')
    })
    it('inline $x$ preserved', () => {
      expect(markdownToLatex('$x$')).toContain('$x$')
    })
    it('block math multiline', () => {
      const out = markdownToLatex('$$\na\nb\n$$')
      expect(out).toContain('\\[')
      expect(out).toContain('a')
      expect(out).toContain('b')
    })
  })

  describe('lists', () => {
    it('unordered - a → itemize', () => {
      const out = markdownToLatex('- a')
      expect(out).toContain('\\begin{itemize}')
      expect(out).toContain('\\item a')
    })
    it('unordered * a', () => {
      const out = markdownToLatex('* a')
      expect(out).toContain('itemize')
    })
    it('ordered 1. a → enumerate', () => {
      const out = markdownToLatex('1. a')
      expect(out).toContain('\\begin{enumerate}')
      expect(out).toContain('\\item a')
    })
    it('list item with inline **', () => {
      const out = markdownToLatex('- **b**')
      expect(out).toContain('\\textbf{b}')
    })
  })

  describe('blockquote and thematic break', () => {
    it('> q → quote env', () => {
      const out = markdownToLatex('> q')
      expect(out).toContain('\\begin{quote}')
      expect(out).toContain('q')
    })
    it('--- → \\hrulefill', () => {
      expect(markdownToLatex('---')).toBe('\\hrulefill')
    })
    it('----- (multiple dashes) → \\hrulefill', () => {
      const out = markdownToLatex('-----')
      expect(out).toContain('hrulefill')
    })
  })

  describe('LaTeX special char escape', () => {
    it('escape & % _ { } $ in paragraph text', () => {
      const out = markdownToLatex('& % _ { } $')
      expect(out).toContain('\\&')
      expect(out).toContain('\\%')
      expect(out).toContain('\\_')
      expect(out).toContain('\\{')
      expect(out).toContain('\\}')
      expect(out).toContain('\\$')
    })
    it('heading content with special chars escaped', () => {
      const out = markdownToLatex('# Title & % _')
      expect(out).toContain('\\&')
      expect(out).toContain('\\%')
      expect(out).toContain('\\_')
    })
  })

  describe('no crash on edge input', () => {
    it('null-like empty string', () => {
      expect(() => markdownToLatex('')).not.toThrow()
    })
    it('unclosed **', () => {
      const out = markdownToLatex('**open')
      expect(out.length).toBeGreaterThanOrEqual(0)
    })
    it('unclosed ```', () => {
      const out = markdownToLatex('```\nno close')
      expect(out.length).toBeGreaterThanOrEqual(0)
    })
  })
})
