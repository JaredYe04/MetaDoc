/**
 * 大纲树逻辑自动化功能测试：Markdown / LaTeX 提取、规格化、同步子节点等
 * 模拟 AI 输出（同级标题等）验证规格化与解析行为。
 * 仅依赖 document/outline 与 outline-normalize；mock regex-utils 避免拉取 settings/Vue 等。
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('./regex-utils', () => ({
  removeTitleIndex: (s: string) => s,
  extractOuterJsonString: () => null,
  convertNumberToChinese: () => ''
}))
import {
  normalizeMarkdownHeadingLevelsInContent,
  normalizeLatexHeadingLevelsInContent,
  hasLatexHeadings
} from './outline-normalize'
import {
  extractOutlineTreeFromMarkdown,
  generateMarkdownFromOutlineTree,
  adjustTitleLevel,
  removeTextFromOutline,
  generateLightMarkdownFromOutlineTree,
  extractOutlineTreeFromMarkdownLight,
  searchNode,
  searchParentNode,
  countNodes
} from '../document/outline'
import type { DocumentOutlineNode } from '../../../../types'

/** 复现 syncChildrenFromNodeText 的 Markdown 路径：规格化 + 解析 + 重编号 */
function syncChildrenFromNodeTextMarkdownOnly(node: DocumentOutlineNode): void {
  let text = node.text?.trim() ?? ''
  if (!text) {
    node.children = []
    return
  }
  const parentLevel = node.title_level ?? 0
  text = normalizeMarkdownHeadingLevelsInContent(text, parentLevel)
  node.text = text
  try {
    const extracted = extractOutlineTreeFromMarkdown(text, false)
    if (!extracted?.children?.length) {
      node.children = []
      return
    }
    const basePath = node.path || ''
    const reindex = (children: DocumentOutlineNode[], prefix: string): DocumentOutlineNode[] => {
      return children.map((child, i) => {
        const path = prefix ? `${prefix}.${i + 1}` : `${i + 1}`
        return {
          ...child,
          path,
          children: child.children?.length ? reindex(child.children, path) : []
        }
      })
    }
    node.children = reindex(extracted.children, basePath)
  } catch {
    node.children = []
  }
}

describe('Markdown 大纲', () => {
  describe('extractOutlineTreeFromMarkdown', () => {
    it('从纯标题 MD 提取树结构', () => {
      const md = `# 一
## 1.1
## 1.2
### 1.2.1
`
      const root = extractOutlineTreeFromMarkdown(md, true)
      expect(root.path).toBe('dummy')
      expect(root.children).toHaveLength(1)
      const one = root.children![0]
      expect(one.title).toBe('一')
      expect(one.title_level).toBe(1)
      expect(one.path).toBe('1')
      expect(one.children).toHaveLength(2)
      expect(one.children![0].title).toBe('1.1')
      expect(one.children![0].title_level).toBe(2)
      expect(one.children![1].title).toBe('1.2')
      expect(one.children![1].children).toHaveLength(1)
      expect(one.children![1].children![0].title).toBe('1.2.1')
      expect(one.children![1].children![0].title_level).toBe(3)
    })

    it('保留节点 text（bypassText=false）', () => {
      const md = `# A
content under A
## B
content under B
`
      const root = extractOutlineTreeFromMarkdown(md, false)
      expect(root.children![0].text).toMatch(/content under A/)
      expect(root.children![0].children![0].text).toMatch(/content under B/)
    })
  })

  describe('generateMarkdownFromOutlineTree', () => {
    it('从大纲树生成 MD 可往返', () => {
      const md = `# 一
## 1.1
## 1.2
### 1.2.1
`
      const root = extractOutlineTreeFromMarkdown(md, true)
      const generated = generateMarkdownFromOutlineTree(root)
      expect(generated).toContain('# 一')
      expect(generated).toContain('## 1.1')
      expect(generated).toContain('### 1.2.1')
    })
  })

  describe('normalizeMarkdownHeadingLevelsInContent（AI 同级标题模拟）', () => {
    it('将内容内最高层级下移到母节点下一级', () => {
      const parentLevel = 3
      const content = `### p1
#### p1.1
#### p1.2
### p2
`
      const out = normalizeMarkdownHeadingLevelsInContent(content, parentLevel)
      expect(out).toContain('#### p1')
      expect(out).toContain('##### p1.1')
      expect(out).toContain('##### p1.2')
      expect(out).toContain('#### p2')
    })

    it('无标题时原样返回', () => {
      const content = 'plain paragraph\n\nno headings'
      expect(normalizeMarkdownHeadingLevelsInContent(content, 2)).toBe(content)
    })

    it('内容已比母级深则不变', () => {
      const content = '#### a\n##### b'
      const out = normalizeMarkdownHeadingLevelsInContent(content, 2)
      expect(out).toBe(content)
    })

    it('跳过代码块内的 #', () => {
      const content = `## real
\`\`\`
### in code
\`\`\`
`
      const out = normalizeMarkdownHeadingLevelsInContent(content, 2)
      expect(out).toContain('### real')
      expect(out).toContain('### in code')
    })
  })

  describe('syncChildrenFromNodeText（Markdown 路径复现）', () => {
    it('从节点 text 解析子标题并规格化（模拟 AI 生成同级标题）', () => {
      const node = {
        path: '1',
        title: '游戏简介',
        title_level: 3,
        text: `### p1
#### p1.1
### p2
`,
        children: [] as DocumentOutlineNode[]
      }
      syncChildrenFromNodeTextMarkdownOnly(node)
      expect(node.text).toContain('#### p1')
      expect(node.text).toContain('##### p1.1')
      expect(node.text).toContain('#### p2')
      expect(node.children).toHaveLength(2)
      expect(node.children![0].title).toBe('p1')
      expect(node.children![0].children).toHaveLength(1)
      expect(node.children![0].children![0].title).toBe('p1.1')
      expect(node.children![1].title).toBe('p2')
    })

    it('空 text 清空 children', () => {
      const node = {
        path: '1',
        title: 'A',
        title_level: 1,
        text: '',
        children: [] as DocumentOutlineNode[]
      }
      syncChildrenFromNodeTextMarkdownOnly(node)
      expect(node.children).toHaveLength(0)
    })
  })

  describe('adjustTitleLevel', () => {
    it('整树标题层级从 firstLevel 起递增', () => {
      const md = `# a
## b
### c
`
      const root = extractOutlineTreeFromMarkdown(md, true)
      const adjusted = adjustTitleLevel(root, 2)
      expect(adjusted.children![0].title_level).toBe(2)
      expect(adjusted.children![0].children![0].title_level).toBe(3)
      expect(adjusted.children![0].children![0].children![0].title_level).toBe(4)
    })
  })

  describe('removeTextFromOutline', () => {
    it('所有 node.text 置空', () => {
      const md = `# a
x
## b
y
`
      const root = extractOutlineTreeFromMarkdown(md, false)
      const out = removeTextFromOutline(root)
      expect(out.children![0].text).toBe('')
      expect(out.children![0].children![0].text).toBe('')
    })
  })

  describe('generateLightMarkdownFromOutlineTree / extractOutlineTreeFromMarkdownLight', () => {
    it('仅标题结构往返', () => {
      const md = `# A
## B
### C
`
      const light = extractOutlineTreeFromMarkdownLight(md)
      expect(light).toContain('# A')
      expect(light).toContain('## B')
      expect(light).toContain('### C')
    })
  })
})

describe('LaTeX 大纲', () => {
  describe('normalizeLatexHeadingLevelsInContent（AI 同级标题模拟）', () => {
    it('将 \\section 下移为 \\subsection（母节点 level 2）', () => {
      const content = `\\section{p1}
\\section{p2}
`
      const out = normalizeLatexHeadingLevelsInContent(content, 1)
      expect(out).toContain('\\subsection')
      expect(out).toContain('p1')
      expect(out).toContain('p2')
    })

    it('母节点 level 3 时 \\section -> \\subsubsection', () => {
      const content = `\\section{a}
\\subsection{b}
`
      const out = normalizeLatexHeadingLevelsInContent(content, 2)
      expect(out).toContain('\\subsubsection')
      expect(out).toContain('a')
      expect(out).toContain('b')
    })

    it('支持 * 变体', () => {
      const content = `\\section*{nocolor}
`
      const out = normalizeLatexHeadingLevelsInContent(content, 1)
      expect(out).toContain('\\subsection*')
      expect(out).toContain('nocolor')
    })

    it('支持嵌套花括号标题', () => {
      const content = `\\section{Title with {nested} braces}
`
      const out = normalizeLatexHeadingLevelsInContent(content, 1)
      expect(out).toContain('Title with {nested} braces')
      expect(out).toContain('\\subsection')
    })

    it('无 LaTeX 标题时原样返回', () => {
      const content = 'plain text \\textbf{only}'
      expect(normalizeLatexHeadingLevelsInContent(content, 2)).toBe(content)
    })
  })

  describe('hasLatexHeadings', () => {
    it('检测 \\section{ 等', () => {
      expect(hasLatexHeadings('\\section{a}')).toBe(true)
      expect(hasLatexHeadings('\\subsection{x}')).toBe(true)
      expect(hasLatexHeadings('# markdown only')).toBe(false)
    })
  })
})

describe('document/outline 工具', () => {
  it('searchNode 按 path 查找', () => {
    const md = `# a
## b
### c
`
    const root = extractOutlineTreeFromMarkdown(md, true)
    const n = searchNode('1.1.1', root)
    expect(n).not.toBeNull()
    expect(n!.title).toBe('c')
  })

  it('searchParentNode 返回父节点', () => {
    const md = `# a
## b
`
    const root = extractOutlineTreeFromMarkdown(md, true)
    const parent = searchParentNode('1.1', root)
    expect(parent).not.toBeNull()
    expect(parent!.path).toBe('1')
  })

  it('countNodes 统计节点数', () => {
    const md = `# a
## b
## c
`
    const root = extractOutlineTreeFromMarkdown(md, true)
    expect(countNodes(root)).toBe(4)
  })
})

describe('AI 输出模拟场景', () => {
  it('MD：三级节点下 AI 生成多个 ### 子段，规格化后为 #### 且成为子节点', () => {
    const node = {
      path: '2.1',
      title: '游戏简介',
      title_level: 3,
      text: `### 玩法介绍
一些内容
### 画面表现
更多内容
### 音效
`,
      children: [] as DocumentOutlineNode[]
    }
    syncChildrenFromNodeTextMarkdownOnly(node)
    expect(node.children).toHaveLength(3)
    expect(node.children!.map((c) => c.title)).toEqual(['玩法介绍', '画面表现', '音效'])
    expect(node.text).toContain('#### 玩法介绍')
    expect(node.text).toContain('#### 画面表现')
    expect(node.text).toContain('#### 音效')
  })

  it('LaTeX：二级节点下 AI 生成 \\section，规格化后为 \\subsection', () => {
    const content = `\\section{Method A}
text
\\section{Method B}
`
    const out = normalizeLatexHeadingLevelsInContent(content, 1)
    expect(out).toContain('\\subsection')
    expect(out).toContain('Method A')
    expect(out).toContain('Method B')
  })
})
