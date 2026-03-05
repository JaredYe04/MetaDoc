/**
 * Comprehensive LaTeX → Markdown tests: fallback for unknown macros, boundaries.
 * Not all LaTeX has 1:1 MD; unknown → unknown node or plain text block.
 */

import { describe, it, expect } from 'vitest'
import { latexToMarkdown, latexToAST } from '../index'

describe('LaTeX → Markdown (comprehensive)', () => {
  describe('known block commands', () => {
    it('\\section*{Star} → # Star (same as section)', () => {
      const md = latexToMarkdown('\\section*{Star}')
      expect(md).toContain('Star')
      expect(md).toMatch(/^# /m)
    })
    it('\\subsubsection{Deep}', () => {
      const md = latexToMarkdown('\\subsubsection{Deep}')
      expect(md).toContain('Deep')
      expect(md).toMatch(/^### /m)
    })
    it('verbatim with empty line inside', () => {
      const latex = '\\begin{verbatim}\nL1\n\nL2\n\\end{verbatim}'
      const md = latexToMarkdown(latex)
      expect(md).toContain('```')
      expect(md).toContain('L1')
      expect(md).toContain('L2')
    })
    it('\\[ on same line as content and \\]', () => {
      const md = latexToMarkdown('\\[ E=mc^2 \\]')
      expect(md).toContain('E=mc^2')
      expect(md).toContain('$$')
    })
  })

  describe('known inline commands', () => {
    it('nested \\textbf{\\textit{b}}', () => {
      const md = latexToMarkdown('\\textbf{\\textit{b}}')
      expect(md).toContain('**')
      expect(md).toContain('*')
      expect(md).toContain('b')
    })
    it('empty \\textbf{}', () => {
      const md = latexToMarkdown('\\textbf{}')
      expect(md.length).toBeGreaterThanOrEqual(0)
    })
    it('\\emph → italic', () => {
      const md = latexToMarkdown('\\emph{e}')
      expect(md).toContain('e')
      expect(md).toMatch(/\*.*\*/)
    })
  })

  describe('fallback: unknown LaTeX commands (do not crash)', () => {
    it('\\cite{key} → unknown_inline or pass-through', () => {
      const ast = latexToAST('\\cite{smith2020}')
      expect(ast.type).toBe('document')
      expect(ast.children.length).toBeGreaterThanOrEqual(1)
      const md = latexToMarkdown('\\cite{smith2020}')
      expect(md.length).toBeGreaterThanOrEqual(0)
    })
    it('\\ref{fig:1}', () => {
      const ast = latexToAST('See \\ref{fig:1}')
      expect(ast.type).toBe('document')
      const md = latexToMarkdown('See \\ref{fig:1}')
      expect(md).toContain('See')
    })
    it('\\label{sec:intro}', () => {
      const ast = latexToAST('\\label{sec:intro}')
      expect(ast.type).toBe('document')
    })
    it('unknown command with optional arg \\command[opt]{arg}', () => {
      const ast = latexToAST('\\unknown[opt]{arg}')
      expect(ast.type).toBe('document')
    })
  })

  describe('fallback: unknown environments', () => {
    it('\\begin{figure}...\\end{figure} → unknown block', () => {
      const latex = '\\begin{figure}\n\\centering\n\\includegraphics{x}\n\\end{figure}'
      const ast = latexToAST(latex)
      expect(ast.type).toBe('document')
      expect(ast.children.length).toBeGreaterThanOrEqual(1)
      const md = latexToMarkdown(latex)
      expect(md.length).toBeGreaterThanOrEqual(0)
    })
    it('\\begin{table}...\\end{table}', () => {
      const latex = '\\begin{table}\n\\caption{t}\n\\end{table}'
      const ast = latexToAST(latex)
      expect(ast.type).toBe('document')
    })
  })

  describe('document body extraction', () => {
    it('preamble stripped', () => {
      const full = '\\documentclass{article}\n\\usepackage{x}\n\\begin{document}\nHi\n\\end{document}'
      expect(latexToMarkdown(full)).toContain('Hi')
    })
    it('no \\begin{document} uses full input', () => {
      expect(latexToMarkdown('\\section{A}')).toContain('A')
    })
  })

  describe('edge and boundary', () => {
    it('empty input', () => {
      expect(latexToMarkdown('')).toBe('')
    })
    it('only whitespace', () => {
      expect(latexToMarkdown('   \n  ')).toBe('')
    })
    it('line with only \\item outside list', () => {
      const md = latexToMarkdown('\\item orphan')
      expect(md.length).toBeGreaterThanOrEqual(0)
    })
    it('escaped \\# in text', () => {
      const md = latexToMarkdown('\\# hash')
      expect(md).toContain('#')
    })
    it('unknown inline rendered as raw in MD', () => {
      const md = latexToMarkdown('Before \\cite{key} after')
      expect(md).toContain('Before')
      expect(md).toContain('after')
      expect(md).toContain('cite') // fallback preserves command in output
    })
  })
})
