/**
 * Agent 调试人员视角：edit-tool / Git unified 全链路回归（无 Electron）。
 * 覆盖新建、文首/中/尾插入、替换、删除、换行与 Markdown 列表等。
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { parseUnifiedDiff, newLinesToContent } from './edit-diff-parse'
import { applyGitUnifiedDiffToContent, assertHunkHeaderMatchesBody } from './git-unified-apply'

describe('edit-tool regression (git unified apply)', () => {
  it('新建：长文 + Markdown 列表行不以删除展示（oldLines 为空）', () => {
    const diff = `@@ -0,0 +1,6 @@
+# Title

### Section
- **a**
- **b**
tail`
    const hunks = parseUnifiedDiff(diff)
    expect(hunks[0].oldLines).toEqual([])
    expect(hunks[0].newLines).toEqual(['# Title', '', '### Section', '- **a**', '- **b**', 'tail'])
    const file = applyGitUnifiedDiffToContent('', diff)
    expect(file).toContain('- **a**')
    expect(file.startsWith('# Title')).toBe(true)
  })

  it('省略 ,0 的 hunk 头：列表仍为新增', () => {
    const diff = `@@ -0 +1,2 @@
- x
- y`
    expect(parseUnifiedDiff(diff)[0].oldLines).toEqual([])
    expect(applyGitUnifiedDiffToContent('', diff)).toBe('- x\n- y')
  })

  it('文件末尾插入：@@ -4,0 +4,1', () => {
    const base = 'a\nb\nc\n'
    const diff = `@@ -4,0 +4,1 @@
+tail`
    expect(applyGitUnifiedDiffToContent(base, diff)).toBe('a\nb\nc\ntail\n')
  })

  it('文件中间替换一行', () => {
    const base = 'a\nOLD\nc\n'
    const diff = `@@ -2,1 +2,1 @@
-OLD
+NEW`
    expect(applyGitUnifiedDiffToContent(base, diff)).toBe('a\nNEW\nc\n')
  })

  it('文首插入：@@ -1,0 +1,1（在第一行前）', () => {
    const base = 'mid\n'
    const diff = `@@ -1,0 +1,1 @@
+HEAD
`
    expect(applyGitUnifiedDiffToContent(base, diff)).toBe('HEAD\nmid\n')
  })

  it('删除中间行', () => {
    const base = 'a\nb\nc\n'
    const diff = `@@ -2,1 +2,0 @@
-b`
    expect(applyGitUnifiedDiffToContent(base, diff)).toBe('a\nc\n')
  })

  it('标题后保留换行：替换时带完整换行片段', () => {
    const base = '# Chapter 1\n\nbody\n'
    const diff = `@@ -1,3 +1,3 @@
 # Chapter 1
 
-body
+new body`
    const out = applyGitUnifiedDiffToContent(base, diff)
    expect(out).toBe('# Chapter 1\n\nnew body\n')
    expect(out).not.toMatch(/# Chapter 1[^\n]new/)
  })

  it('newLinesToContent：单独 + 行得到换行', () => {
    expect(newLinesToContent([''])).toBe('\n')
  })

  it('回归：文首插入多行（带空格上下文），不贴到文件末尾', () => {
    const base = [
      '# Edit Tool 回归测试文件（干净版本）',
      '',
      '这是一个用于测试 edit-tool 功能的文件。',
      '',
      '初始内容：第一行测试文本。'
    ].join('\n')
    const diff = [
      '@@ -1,5 +1,8 @@',
      '+---',
      '+创建时间：2026-03-27',
      '+测试人员：Agent调试员',
      '+---',
      ' # Edit Tool 回归测试文件（干净版本）',
      ' ',
      ' 这是一个用于测试 edit-tool 功能的文件。',
      ' ',
      '-初始内容：第一行测试文本。'
    ].join('\n')
    const out = applyGitUnifiedDiffToContent(base, diff)
    expect(out.startsWith('---\n')).toBe(true)
    expect(out).toContain('# Edit Tool 回归测试文件（干净版本）')
    expect(out.endsWith('初始内容：第一行测试文本。')).toBe(false)
  })

  it('回归：文首插入一行，后续上下文无行首空格时仍保留换行', () => {
    const base = ['第1行：测试开始', '第2行：中间内容', '第3行：测试结束'].join('\n')
    const diff = [
      '@@ -1,3 +1,4 @@',
      '+=== 文件开头插入测试 ===',
      '第1行：测试开始',
      '第2行：中间内容',
      '第3行：测试结束'
    ].join('\n')
    const out = applyGitUnifiedDiffToContent(base, diff)
    expect(out.startsWith('=== 文件开头插入测试 ===\n')).toBe(true)
    expect(out).toContain('\n第1行：测试开始\n')
    expect(out).not.toMatch(/^=== .*===第1行/)
  })

  it('回归：两行之间插入（中间 + 行）', () => {
    const base = [
      '=== 文件开头插入测试 ===',
      '第1行：测试开始',
      '第2行：中间内容',
      '第3行：测试结束'
    ].join('\n')
    const diff = [
      '@@ -1,4 +1,5 @@',
      '=== 文件开头插入测试 ===',
      '第1行：测试开始',
      '+第1.5行：中间插入测试',
      '第2行：中间内容',
      '第3行：测试结束'
    ].join('\n')
    const out = applyGitUnifiedDiffToContent(base, diff)
    const idx = out.indexOf('第1.5行：中间插入测试')
    expect(idx).toBeGreaterThan(-1)
    expect(out.indexOf('第1行：测试开始')).toBeLessThan(idx)
    expect(out.indexOf('第2行：中间内容')).toBeGreaterThan(idx)
  })

  it('新建单 hunk 不应重复拼接两段不同正文', () => {
    const diff = [
      '@@ -0,0 +1,5 @@',
      '+# Edit Tool 回归测试文件',
      '+',
      '+这是一个用于测试 edit-tool 的文件。',
      '+',
      '+初始内容：这是第一行文本。'
    ].join('\n')
    const out = applyGitUnifiedDiffToContent('', diff)
    expect(out.split('初始内容').length - 1).toBe(1)
    expect(out).not.toContain('第一行测试文本')
  })

  it('@@ oldCount 与正文旧侧行数不一致时先报校验错误（避免误判为「行号计算错」）', () => {
    const base = 'a\nb\nc\n'
    const bad = ['@@ -1,2 +1,3 @@', ' a', '-b', '+b2', ' c'].join('\n')
    expect(() => applyGitUnifiedDiffToContent(base, bad)).toThrow(/oldCount/)
  })

  it('内容不匹配时错误信息包含邻近行号便于对照 IDE', () => {
    const base = ['x', 'y', '期望行', 'z'].join('\n')
    const diff = ['@@ -2,2 +2,2 @@', ' y', '-错行', '+新'].join('\n')
    expect(() => applyGitUnifiedDiffToContent(base, diff)).toThrow(/旧文件第 3 行[\s\S]*邻近文件行/)
  })

  it('UTF-8 BOM：匹配时忽略 BOM，写回仍保留 BOM', () => {
    const base = '\uFEFF# hi\n'
    const diff = ['@@ -1,1 +1,1 @@', '-# hi', '+# hello'].join('\n')
    const out = applyGitUnifiedDiffToContent(base, diff)
    expect(out.charCodeAt(0)).toBe(0xfeff)
    expect(out).toContain('# hello')
  })

  it('assertHunkHeaderMatchesBody 可被单测直接调用', () => {
    const h = parseUnifiedDiff('@@ -1,1 +1,1 @@\n-a\n+a\n')[0]
    expect(() => assertHunkHeaderMatchesBody(h)).not.toThrow()
  })
})
