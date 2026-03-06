/**
 * LaTeX → Markdown conversion tests.
 */

import { describe, it, expect } from 'vitest'
import { latexToMarkdown, latexToAST } from '../index'
import * as fs from 'fs'
import * as path from 'path'

const FIXTURES_DIR = path.join(__dirname, 'fixtures')

function loadFixture(name: string): { markdown: string; latex: string } {
  const p = path.join(FIXTURES_DIR, `${name}.json`)
  const raw = fs.readFileSync(p, 'utf-8')
  return JSON.parse(raw) as { markdown: string; latex: string }
}

describe('LaTeX → Markdown', () => {
  it('\\section{Hello} → # Hello', () => {
    const { markdown, latex } = loadFixture('heading')
    expect(latexToMarkdown(latex)).toBe(markdown)
  })

  it('\\subsection{World} → ## World', () => {
    const { markdown, latex } = loadFixture('subsection')
    expect(latexToMarkdown(latex)).toBe(markdown)
  })

  it('\\textbf{bold} → **bold**', () => {
    const { markdown, latex } = loadFixture('bold')
    expect(latexToMarkdown(latex)).toBe(markdown)
  })

  it('\\textit{italic} → *italic*', () => {
    const { markdown, latex } = loadFixture('italic')
    expect(latexToMarkdown(latex)).toBe(markdown)
  })

  it('\\texttt{code} → `code`', () => {
    const { markdown, latex } = loadFixture('inline_code')
    expect(latexToMarkdown(latex)).toBe(markdown)
  })

  it('\\texttt{\\textbackslash} → `\\` (backslash in code)', () => {
    expect(latexToMarkdown('\\texttt{\\textbackslash}')).toBe('`\\`')
  })

  it('\\textbackslash alone → \\ (plain backslash)', () => {
    expect(latexToMarkdown('\\textbackslash')).toBe('\\')
  })

  it('\\verb|\\| → \\ (verb backslash)', () => {
    expect(latexToMarkdown('\\verb|\\|')).toBe('\\')
  })

  it('\\href{url}{text} → [text](url)', () => {
    const { markdown, latex } = loadFixture('link')
    expect(latexToMarkdown(latex)).toBe(markdown)
  })

  it('\\includegraphics{url} → ![](url)', () => {
    const out = latexToMarkdown('\\includegraphics{img.png}')
    expect(out).toContain('](img.png)')
    expect(out).toMatch(/!\[.*\]\(img\.png\)/)
  })

  it('verbatim → code block', () => {
    const latex = '\\begin{verbatim}\ncode\n\\end{verbatim}'
    const md = latexToMarkdown(latex)
    expect(md).toContain('```')
    expect(md).toContain('code')
  })

  it('\\[ E=mc^2 \\] → math block', () => {
    const latex = '\\[\nE=mc^2\n\\]'
    const md = latexToMarkdown(latex)
    expect(md).toContain('$$')
    expect(md).toContain('E=mc^2')
  })

  it('itemize → unordered list', () => {
    const latex = '\\begin{itemize}\n\\item a\n\\item b\n\\end{itemize}'
    const md = latexToMarkdown(latex)
    expect(md).toContain('- a')
    expect(md).toContain('- b')
  })

  it('enumerate → ordered list', () => {
    const latex = '\\begin{enumerate}\n\\item x\n\\item y\n\\end{enumerate}'
    const md = latexToMarkdown(latex)
    expect(md).toContain('1. x')
    expect(md).toContain('2. y')
  })

  it('\\hrulefill → ---', () => {
    expect(latexToMarkdown('\\hrulefill')).toContain('---')
  })

  it('strips \\begin{document} body only', () => {
    const full = '\\documentclass{article}\n\\begin{document}\n\\section{Hi}\n\\end{document}'
    const ast = latexToAST(full)
    expect(ast.children.length).toBeGreaterThanOrEqual(1)
    expect(latexToMarkdown(full)).toContain('Hi')
  })

  it('does not crash on unknown command (returns AST with unknown or safe node)', () => {
    const ast = latexToAST('\\unknowncommand{xyz}')
    expect(ast.type).toBe('document')
    expect(ast.children).toBeDefined()
  })

  it('empty input → empty string', () => {
    expect(latexToMarkdown('')).toBe('')
  })
})
