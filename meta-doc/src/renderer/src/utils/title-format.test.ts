/**
 * 标题格式化单元测试（Vitest）
 * 对应原 unit-tests-register 中的 registerTitleFormatTests
 */
import { describe, it, expect } from 'vitest'
import { cleanTitleMarkers } from './title-format'

describe('标题格式化 cleanTitleMarkers', () => {
  it('Markdown 一级标题清除 (# Title)', () => {
    expect(cleanTitleMarkers('# Title')).toBe('Title')
  })

  it('Markdown 二级标题清除 (## Title)', () => {
    expect(cleanTitleMarkers('## Title')).toBe('Title')
  })

  it('Markdown 三级标题清除 (### Title)', () => {
    expect(cleanTitleMarkers('### Title')).toBe('Title')
  })

  it('LaTeX section 命令清除 (\\section{Title})', () => {
    expect(cleanTitleMarkers('\\section{Title}')).toBe('Title')
  })

  it('LaTeX subsection 命令清除 (\\subsection{Title})', () => {
    expect(cleanTitleMarkers('\\subsection{Title}')).toBe('Title')
  })

  it('LaTeX section* 命令清除 (\\section*{Title})', () => {
    expect(cleanTitleMarkers('\\section*{Title}')).toBe('Title')
  })

  it('LaTeX 嵌套大括号处理', () => {
    expect(cleanTitleMarkers('\\section{Title {with} nested}')).toBe('Title {with} nested')
  })

  it('LaTeX 转义字符处理', () => {
    expect(cleanTitleMarkers('\\section{Title \\{with\\} escaped}')).toBe(
      'Title \\{with\\} escaped'
    )
  })

  it('不误匹配其他命令 - \\textbf{}', () => {
    const title = '\\textbf{Bold Text}'
    expect(cleanTitleMarkers(title)).toBe(title)
  })

  it('不误匹配其他命令 - \\textit{}', () => {
    const title = '\\textit{Italic Text}'
    expect(cleanTitleMarkers(title)).toBe(title)
  })

  it('不误匹配代码中的 # 符号', () => {
    const title = 'Code #include <stdio.h>'
    expect(cleanTitleMarkers(title)).toBe(title)
  })

  it('空字符串处理', () => {
    expect(cleanTitleMarkers('')).toBe('')
  })

  it('普通文本（无标记）', () => {
    const title = 'Plain Title Text'
    expect(cleanTitleMarkers(title)).toBe(title)
  })

  it('LaTeX chapter 命令清除 (\\chapter{Title})', () => {
    expect(cleanTitleMarkers('\\chapter{Title}')).toBe('Title')
  })

  it('LaTeX paragraph 命令清除 (\\paragraph{Title})', () => {
    expect(cleanTitleMarkers('\\paragraph{Title}')).toBe('Title')
  })

  it('LaTeX title 命令清除 (\\title{Title})', () => {
    expect(cleanTitleMarkers('\\title{Title}')).toBe('Title')
  })

  it('混合标记处理 (先 Markdown 后 LaTeX)', () => {
    expect(cleanTitleMarkers('# \\section{Title}')).toBe('Title')
  })

  it('复杂嵌套大括号处理', () => {
    expect(cleanTitleMarkers('\\section{Title {with {deep} nesting}}')).toBe(
      'Title {with {deep} nesting}'
    )
  })

  it('带前后空格的标题处理', () => {
    expect(cleanTitleMarkers('  # Title  ')).toBe('Title')
  })

  it('标题中间包含 # 符号', () => {
    const title = 'Title #123 in middle'
    expect(cleanTitleMarkers(title)).toBe(title)
  })
})
