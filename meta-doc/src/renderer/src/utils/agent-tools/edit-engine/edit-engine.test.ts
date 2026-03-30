import { describe, expect, it } from 'vitest'
/**
 * @vitest-environment node
 */
import { applyEdits, EditEngineError } from './index'
import type { EditOperation } from './types'
import { locateTarget } from './locate'

describe('edit-engine', () => {
  it('Case1: 基础替换', () => {
    const file = `function foo() {\n  return 1;\n}\n`
    const edits: EditOperation[] = [
      {
        id: 'e1',
        type: 'replace',
        target: { anchor: 'return 1;', context_before: '  ', context_after: '\n' },
        content: 'return 42;'
      }
    ]
    const { text, logs } = applyEdits(file, edits)
    expect(text).toContain('return 42;')
    expect(text).not.toContain('return 1;')
    expect(logs).toHaveLength(1)
    expect(logs[0].strategy).toBe('exact')
  })

  it('插入：不在内容前自动加换行（由 content 自带换行）', () => {
    const file = '# Title\nContent'
    const edits: EditOperation[] = [
      {
        id: 'e1',
        type: 'insert',
        target: { anchor: '# Title\n' },
        content: 'Intro line.\n'
      }
    ]
    const { text } = applyEdits(file, edits)
    expect(text).toBe('# Title\nIntro line.\nContent')
  })

  it('insert_at:before 在第一行标题之前插入', () => {
    const file = '# First\nrest'
    const edits: EditOperation[] = [
      {
        id: 'e1',
        type: 'insert',
        target: { anchor: '# First' },
        insert_at: 'before',
        content: 'Preamble\n'
      }
    ]
    const { text } = applyEdits(file, edits)
    expect(text).toBe('Preamble\n# First\nrest')
  })

  it('空 anchor + 两侧 context：在接缝处插入', () => {
    const file = 'A\n\nB'
    const edits: EditOperation[] = [
      {
        id: 'e1',
        type: 'insert',
        target: { anchor: '', context_before: 'A\n', context_after: '\nB' },
        content: 'MID'
      }
    ]
    const { text } = applyEdits(file, edits)
    expect(text).toBe('A\nMID\nB')
  })

  it('空 anchor + context_after：文件开头插入', () => {
    const file = '# Line1\nmore'
    const edits: EditOperation[] = [
      {
        id: 'e1',
        type: 'insert',
        target: { anchor: '', context_after: '# Line1\n' },
        content: 'top\n'
      }
    ]
    const { text } = applyEdits(file, edits)
    expect(text).toBe('top\n# Line1\nmore')
  })

  it('match_scope:full 替换整段匹配（含 context）', () => {
    const file = '## H\nbody\n'
    const edits: EditOperation[] = [
      {
        id: 'e1',
        type: 'replace',
        target: {
          anchor: '## H',
          context_before: '',
          context_after: '\nbody\n'
        },
        match_scope: 'full',
        content: '## New\n'
      }
    ]
    const { text } = applyEdits(file, edits)
    expect(text).toBe('## New\n')
  })

  it('insert：锚后同行粘连时自动换行（无需 content 自带前导 \\n）', () => {
    const file = 'pre### 章节2### tail'
    const edits: EditOperation[] = [
      {
        id: 'e1',
        type: 'insert',
        target: { anchor: '### 章节2' },
        content: '### 新增章节\n\n'
      }
    ]
    const { text } = applyEdits(file, edits)
    expect(text).toContain('### 章节2\n### 新增章节')
    expect(text).not.toMatch(/### 章节2###/)
  })

  it('insert_newline_policy:none 保持字节级拼接', () => {
    const file = 'ab'
    const edits: EditOperation[] = [
      {
        id: 'e1',
        type: 'insert',
        target: { anchor: 'a' },
        content: 'X',
        insert_newline_policy: 'none'
      }
    ]
    const { text } = applyEdits(file, edits)
    expect(text).toBe('aXb')
  })

  it('Case3: 模糊匹配 anchor（空白差异）', () => {
    const file = 'const  x   =    1;'
    const edits: EditOperation[] = [
      {
        id: 'e1',
        type: 'replace',
        target: { anchor: 'const x = 1' },
        content: 'const x = 2'
      }
    ]
    const { text, logs } = applyEdits(file, edits)
    expect(text).toContain('const x = 2')
    expect(logs[0].strategy).toBe('fuzzy')
  })

  it('Case4: 多匹配必须报错', () => {
    const file = 'foo\nbar\nfoo\n'
    expect(() => locateTarget(file, { anchor: 'foo' })).toThrow(EditEngineError)
    try {
      locateTarget(file, { anchor: 'foo' })
    } catch (e) {
      expect(e).toBeInstanceOf(EditEngineError)
      expect((e as EditEngineError).code).toBe('AMBIGUOUS_MATCH')
    }
  })

  it('Case5: 后处理仅规范化与行尾 trim', () => {
    const file = '# Hello\nParagraph  \n'
    const { text } = applyEdits(file, [])
    expect(text).toBe('# Hello\nParagraph\n')
  })

  it('原子性：中途失败不返回部分应用结果', () => {
    const file = 'aaa\nbbb\n'
    const edits: EditOperation[] = [
      {
        id: 'ok',
        type: 'replace',
        target: { anchor: 'aaa' },
        content: 'AAA'
      },
      {
        id: 'bad',
        type: 'replace',
        target: { anchor: '不存在' },
        content: 'x'
      }
    ]
    expect(() => applyEdits(file, edits)).toThrow(EditEngineError)
  })

  it('空文件插入', () => {
    const edits: EditOperation[] = [
      { id: 'i1', type: 'insert', target: { anchor: '' }, content: 'first line' }
    ]
    const { text } = applyEdits('', edits)
    expect(text.trim()).toBe('first line')
  })
})
