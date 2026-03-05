/**
 * LaTeX → Markdown conversion tests using debug/complicated-tex-test.tex.
 * Ensures: abstract, comments stripped, keywords, itemize with \item[n)], longtable,
 * figure with caption, equation, inline \( \) and $ $ are converted correctly.
 */

import { describe, it, expect } from 'vitest'
import { latexToMarkdown, latexToAST } from '../index'
import * as fs from 'fs'
import * as path from 'path'

const COMPLICATED_TEX_PATH = path.resolve(__dirname, '../../../../../debug/complicated-tex-test.tex')

function loadComplicatedTex(): string | null {
  try {
    return fs.readFileSync(COMPLICATED_TEX_PATH, 'utf-8')
  } catch {
    return null
  }
}

describe('Complicated LaTeX → Markdown (complicated-tex-test.tex)', () => {
  const latex = loadComplicatedTex()
  const skip = !latex

  it('loads complicated-tex-test.tex', () => {
    expect(latex).not.toBeNull()
    if (latex) expect(latex).toContain('\\begin{document}')
  })

  it('converts without throwing', () => {
    if (skip || !latex) return
    expect(() => latexToMarkdown(latex)).not.toThrow()
  })

  it('strips comments: no % comment lines in output', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).not.toContain('美赛模板')
    expect(md).not.toContain('此处填写摘要')
    expect(md).not.toContain('关键字Keywords')
  })

  it('abstract → blockquote or visible content', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).toContain('Olympic Games')
    expect(md).toContain('bottom-up approach')
    expect(md).toContain('LightGBM')
  })

  it('keywords line preserved as text', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).toMatch(/Keywords/i)
    expect(md).toMatch(/KMeans\+\+|LightGBM|Spearman|BEAST|CUSUM/)
  })

  it('itemize with \\item[1)] produces list content', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).toContain('Develop a model')
    expect(md).toContain('medal table for the 2028')
    expect(md).toMatch(/^[-*]\s/m) || expect(md).toMatch(/\n[-*]\s/m)
  })

  it('section headings present', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).toContain('# Introduction')
    expect(md).toContain('Problem Background')
    expect(md).toContain('Task 1')
    expect(md).toContain('Task 2')
  })

  it('equation → $$ block', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).toContain('$$')
    expect(md).toMatch(/\$[^$]*\\mathcal\{L\}[^$]*\$/m) || expect(md).toContain('mathcal')
  })

  it('inline \\( \\) or $ $ math present', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).toMatch(/\$\s*[^$]+\s*\$/) // inline math
  })

  it('figure with caption → image with alt or caption text', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).toMatch(/!\[.*\]\(.*\.(png|jpg|pdf)\)/) || expect(md).toContain('img/')
  })

  it('longtable or table content present', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    const hasTable = /\|[^|]+\|/.test(md) && md.includes('|')
    expect(hasTable || md.includes('Country') && md.includes('United States')).toBe(true)
  })

  it('no raw \\begin{abstract} or \\end{abstract} in output', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).not.toContain('\\begin{abstract}')
    expect(md).not.toContain('\\end{abstract}')
  })

  it('AST has expected block types', () => {
    if (skip || !latex) return
    const ast = latexToAST(latex)
    expect(ast.type).toBe('document')
    expect(ast.children.length).toBeGreaterThan(5)
    const hasHeading = ast.children.some((b) => b.type === 'heading')
    const hasParagraph = ast.children.some((b) => b.type === 'paragraph')
    expect(hasHeading).toBe(true)
    expect(hasParagraph).toBe(true)
  })

  it('abstract rendered as blockquote (>)', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).toMatch(/>\s/)
  })

  it('at least one table block from longtable/longtblr', () => {
    if (skip || !latex) return
    const ast = latexToAST(latex)
    const tables = ast.children.filter((b) => b.type === 'table')
    expect(tables.length).toBeGreaterThanOrEqual(1)
    const withRows = tables.some(
      (t) => t.type === 'table' && (t.rows?.length > 0 || t.headerRow?.length > 0)
    )
    expect(withRows).toBe(true)
  })

  it('\\ref{} replaced with placeholder, not raw', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).not.toContain('\\ref{tb:notation}')
    expect(md).toContain('[ref]')
  })

  it('bold without broken spacing (no ** word **)', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).not.toMatch(/\*\*\s+Assumption\s+\d+\s+\*\*/)
    expect(md).toMatch(/\*\*Assumption\s+\d+\*\*/)
  })

  it('table output has no \\endfirsthead', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).not.toContain('\\endfirsthead')
  })

  it('References section from thebibliography', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).toMatch(/##\s+References/i)
  })

  it('inline math \\( \\) rendered as $ $', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).toMatch(/\$[^$]*[Xx][^$]*\$/);
  })

  it('letter/env content converted (not raw code block)', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).not.toContain('\\begin{letter}')
    expect(md).toMatch(/\*\*OpenAI|\*\*Query|\*\*Purpose/i)
  })

  it('bibliography items start with [1], [2] and have ref anchor', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).toMatch(/\[\d+\]\s/)
    expect(md).toMatch(/id="ref-\d+"/)
  })

  it('\\cite{} becomes link to #ref-', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).toMatch(/\]\(#ref-\d+\)/)
  })

  it('table header: tabular cells converted (no raw l@{} or \\pes.)', () => {
    if (skip || !latex) return
    const md = latexToMarkdown(latex)
    expect(md).not.toMatch(/l@\{\}/)
    expect(md).not.toContain('\\pes.')
    expect(md).not.toContain('\\end{tabular}')
  })
})
