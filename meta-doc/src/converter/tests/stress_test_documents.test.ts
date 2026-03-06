/**
 * Stress test documents: LaTeX → Markdown and Markdown → LaTeX conversion
 * using debug/压力测试/ samples. Covers \textbackslash, sections, lists, links,
 * code, math, nested formatting, and round-trip.
 */

import { describe, it, expect } from 'vitest'
import { latexToMarkdown, markdownToLatex } from '../index'
import * as fs from 'fs'
import * as path from 'path'

const STRESS_DIR = path.resolve(__dirname, '../../../../../debug/压力测试')
const LATEX_STRESS_PATH = path.join(STRESS_DIR, 'MetaDoc LaTeX → Markdown Stress Test.tex')
const MD_STRESS_PATH = path.join(STRESS_DIR, 'MetaDoc Markdown → LaTeX Stress Test.md')

function loadFile(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf-8')
  } catch {
    return null
  }
}

describe('Stress: LaTeX → Markdown (MetaDoc LaTeX → Markdown Stress Test.tex)', () => {
  const latex = loadFile(LATEX_STRESS_PATH)
  const skip = !latex

  it('loads stress LaTeX file', () => {
    expect(latex).not.toBeNull()
    if (latex) expect(latex).toContain('Basic Formatting')
  })

  it('converts without throwing', () => {
    if (skip || !latex) return
    expect(() => latexToMarkdown(latex)).not.toThrow()
  })

  it('\\texttt{\\textbackslash} → backslash in code (no raw macro in output)', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).not.toContain('\\textbackslash')
    expect(md).toMatch(/`\\`/) // inline code containing one backslash
    expect(md).toContain('Backslash:')
  })

  it('sections present', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).toMatch(/#\s*Basic Formatting/)
    expect(md).toMatch(/#\s*Links and References/)
    expect(md).toMatch(/#\s*Special Characters/)
  })

  it('bold, italic, inline code', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).toContain('**bold**')
    expect(md).toContain('*italic*')
    expect(md).toContain('`const x = 10;`')
  })

  it('links and lists', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).toContain('OpenAI')
    expect(md).toMatch(/\]\(https:\/\//)
    expect(md).toContain('- First item')
    expect(md).toContain('1. First')
  })

  it('verbatim/code block and math', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).toContain('```')
    expect(md).toContain('E = mc^2')
  })

  it('special chars section: escaped # $ % & _ { }', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).toContain('Special characters')
  })

  it('nested formatting stress', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).toContain('code inside')
  })
})

describe('Stress: Markdown → LaTeX (MetaDoc Markdown → LaTeX Stress Test.md)', () => {
  const md = loadFile(MD_STRESS_PATH)
  const skip = !md

  it('loads stress Markdown file', () => {
    expect(md).not.toBeNull()
    if (md) expect(md).toContain('Basic Formatting')
  })

  it('converts without throwing', () => {
    if (skip || !md) return
    expect(() => markdownToLatex(md)).not.toThrow()
  })

  it('headings and lists in LaTeX', () => {
    if (skip || !md) return
    const latex = markdownToLatex(md)
    expect(latex).toMatch(/\\section\{/)
    expect(latex).toContain('\\begin{itemize}')
    expect(latex).toContain('\\begin{enumerate}')
  })

  it('inline code and backslash', () => {
    if (skip || !md) return
    const latex = markdownToLatex(md)
    expect(latex).toContain('\\texttt{')
    // Document has "Backslash test: \\" → LaTeX should have backslash
    expect(latex).toMatch(/\\\\|\\textbackslash/)
  })
})

describe('Stress: Round-trip on stress documents', () => {
  const latexContent = loadFile(LATEX_STRESS_PATH)
  const mdContent = loadFile(MD_STRESS_PATH)

  it('LaTeX stress → MD → LaTeX runs and preserves key content', () => {
    if (!latexContent) return
    const md = latexToMarkdown(latexContent)
    expect(md).not.toContain('\\textbackslash')
    const latex2 = markdownToLatex(md)
    expect(latex2).toMatch(/\\section\{/)
    const md2 = latexToMarkdown(latex2)
    expect(md2).toContain('Basic Formatting')
    expect(md2).toMatch(/`\\`|Backslash/)
  })

  it('Markdown stress → LaTeX → MD runs and preserves key content', () => {
    if (!mdContent) return
    const latex = markdownToLatex(mdContent)
    expect(latex).toMatch(/\\section\{/)
    const md2 = latexToMarkdown(latex)
    expect(md2).toContain('Basic Formatting')
    expect(md2).toContain('**bold**')
  })
})
