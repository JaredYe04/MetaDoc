/**
 * Round-trip test using debug/export-test.md as blueprint:
 * MD → LaTeX → MD, then assert key content is preserved and document structure is intact.
 */

import { describe, it, expect } from 'vitest'
import { markdownToLatex, latexToMarkdown, markdownToAST, normalizeAST } from '../index'
import * as fs from 'fs'
import * as path from 'path'

const EXPORT_TEST_PATH = path.resolve(__dirname, '../../../../../debug/export-test.md')

function loadExportTest(): string | null {
  try {
    return fs.readFileSync(EXPORT_TEST_PATH, 'utf-8')
  } catch {
    return null
  }
}

describe('Export-test roundtrip (MD → LaTeX → MD)', () => {
  const md = loadExportTest()
  const skip = !md

  it('loads export-test.md', () => {
    expect(md).not.toBeNull()
    if (md) expect(md).toContain('导出验收测试文档')
  })

  it('MD → LaTeX does not throw', () => {
    if (skip || !md) return
    expect(() => markdownToLatex(md)).not.toThrow()
  })

  it('MD → LaTeX → MD roundtrip preserves key structure', () => {
    if (skip || !md) return
    const latex = markdownToLatex(md)
    const md2 = latexToMarkdown(latex)

    expect(md2).toContain('导出验收测试文档')
    expect(md2).toContain('# ')
    expect(md2).toContain('## 1. 图片')
    expect(md2).toContain('### 3.4 表格')
    expect(md2).toContain('| 列1 | 列2 | 列3 |')
    expect(md2).toMatch(/\| [-–—]+\s*\|/) // separator row
    expect(md2).toContain('~~删除线~~')
    expect(md2).toContain('**加粗**')
    expect(md2).toContain('*斜体*')
    expect(md2).toContain('### 3.5 代码块')
    expect(md2).toContain('```')
    expect(md2).toContain('---')
  })

  it('roundtrip table is a single block (no blank lines between rows)', () => {
    if (skip || !md) return
    const latex = markdownToLatex(md)
    const md2 = latexToMarkdown(latex)
    const tableSection = md2.slice(md2.indexOf('### 3.4 表格'), md2.indexOf('### 3.5') + 10)
    expect(tableSection).toContain('| 列1 | 列2 | 列3 |')
    expect(tableSection).not.toMatch(/\|\s*列1\s*\|\s*\n\s*\n\s*\|/)
  })

  it('roundtrip AST has table and strikethrough nodes', () => {
    if (skip || !md) return
    const latex = markdownToLatex(md)
    const md2 = latexToMarkdown(latex)
    const ast = normalizeAST(markdownToAST(md2))
    const hasTable = ast.children.some((b) => b.type === 'table')
    const hasStrikethrough = ast.children.some((b) => {
      if (b.type !== 'paragraph') return false
      return (b as { children: { type: string }[] }).children.some(
        (n) => n.type === 'strikethrough'
      )
    })
    expect(hasTable).toBe(true)
    expect(hasStrikethrough).toBe(true)
  })
})
