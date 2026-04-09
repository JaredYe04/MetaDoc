/**
 * 按与 extractOutlineTreeFromMarkdown 一致的规则（ATX 标题 + 代码块）划分章节行范围，用于将全文搜索结果挂到大纲标题下。
 */
export interface OutlineSectionLineRange {
  path: string
  title: string
  titleLine: number
  /** 章节起始行（含标题行） */
  startLine: number
  /** 章节结束行（含正文），闭区间 */
  endLine: number
  /**
   * LaTeX：该标题所在行中，章节命令标题参数起始 `{` 的 0-based 列（与编辑器行字符串一致）。
   * 用于点击大纲时在 Monaco 中选中 `{...}` 内文字。
   */
  latexTitleBraceOpen0?: number
}

/**
 * 从 Markdown 生成带行号的章节列表（含标题行自身所属章节）。
 */
export function buildOutlineSectionLineRanges(md: string): OutlineSectionLineRange[] {
  const lines = md.split('\n')
  const lineCount = lines.length || 1
  let inCodeBlock = false

  const root: {
    title: string
    title_level: number
    path: string
    titleLine: number
    children: Array<{
      title: string
      title_level: number
      path: string
      titleLine: number
      children: any[]
    }>
  } = {
    title: '',
    title_level: 0,
    path: 'dummy',
    titleLine: 0,
    children: []
  }

  const stack: (typeof root.children)[number][] | (typeof root)[] = [root]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNo = i + 1

    if (/^```/.test(line)) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    const hm = line.match(/^(#+)\s+(.*)/)
    if (hm) {
      const level = hm[1].length
      const title = hm[2]
      while (
        stack.length > 0 &&
        (stack[stack.length - 1] as { title_level: number }).title_level >= level
      ) {
        stack.pop()
      }
      const parent = stack[stack.length - 1] as typeof root
      const newNode = {
        title,
        title_level: level,
        path: '',
        titleLine: lineNo,
        children: [] as any[]
      }
      parent.children.push(newNode)
      stack.push(newNode)
    }
  }

  for (let i = 0; i < root.children.length; i++) {
    root.children[i].path = `${i + 1}`
  }
  const queue = [...root.children]
  while (queue.length > 0) {
    const node = queue.shift()!
    for (let i = 0; i < node.children.length; i++) {
      node.children[i].path = `${node.path}.${i + 1}`
      queue.push(node.children[i])
    }
  }

  type Flat = { path: string; title: string; level: number; titleLine: number }
  const flat: Flat[] = []

  const walk = (nodes: typeof root.children) => {
    for (const n of nodes) {
      flat.push({
        path: n.path,
        title: n.title,
        level: n.title_level,
        titleLine: n.titleLine
      })
      if (n.children?.length) walk(n.children as typeof root.children)
    }
  }
  walk(root.children)

  const ranges: OutlineSectionLineRange[] = []

  if (flat.length === 0) {
    ranges.push({
      path: '',
      title: '',
      titleLine: 1,
      startLine: 1,
      endLine: Math.max(1, lineCount)
    })
    return ranges
  }

  if (flat[0].titleLine > 1) {
    ranges.push({
      path: '',
      title: '',
      titleLine: 1,
      startLine: 1,
      endLine: flat[0].titleLine - 1
    })
  }

  for (let i = 0; i < flat.length; i++) {
    let endLine = lineCount
    for (let j = i + 1; j < flat.length; j++) {
      if (flat[j].level <= flat[i].level) {
        endLine = flat[j].titleLine - 1
        break
      }
    }
    ranges.push({
      path: flat[i].path,
      title: flat[i].title,
      titleLine: flat[i].titleLine,
      startLine: flat[i].titleLine,
      endLine
    })
  }

  return ranges
}

export function findSectionForLine(
  line: number,
  ranges: OutlineSectionLineRange[]
): OutlineSectionLineRange | null {
  for (const r of ranges) {
    if (line >= r.startLine && line <= r.endLine) return r
  }
  return ranges.length ? ranges[ranges.length - 1] : null
}

const LATEX_CMD_LEVEL: Record<string, number> = {
  part: 1,
  chapter: 2,
  section: 3,
  subsection: 4,
  subsubsection: 5,
  paragraph: 6,
  subparagraph: 7
}

const LATEX_SECTION_CMD_ALTERNATION =
  'part|chapter|section|subsection|subsubsection|paragraph|subparagraph'

/** 不解析结构节标题的环境（避免把代码里的 \\section 当成真标题） */
const LATEX_SKIP_OUTLINE_ENVS = new Set([
  'verbatim',
  'Verbatim',
  'lstlisting',
  'minted',
  'comment',
  'verbatimtab',
  'BVerbatim'
])

/**
 * 去掉 LaTeX 行尾注释（`%` 前为偶数个 `\` 时视为注释起点）。
 */
export function stripLatexLineComment(line: string): string {
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== '%') continue
    let backslashes = 0
    for (let j = i - 1; j >= 0 && line[j] === '\\'; j--) {
      backslashes++
    }
    if (backslashes % 2 === 0) {
      return line.slice(0, i)
    }
  }
  return line
}

export type ParsedLatexSectionHeading = {
  cmd: string
  title: string
  /** 在传入的 code 串中，标题参数 `{` 的 0-based 索引 */
  braceOpen0: number
}

/**
 * 从一行「已去注释」的代码中提取所有结构节命令（支持行内任意位置、可选 `[]`、标题内嵌套 `{}`）。
 */
export function parseLatexSectionHeadingsInCode(code: string): ParsedLatexSectionHeading[] {
  const out: ParsedLatexSectionHeading[] = []
  const re = new RegExp(`\\\\(${LATEX_SECTION_CMD_ALTERNATION})\\*?`, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(code)) !== null) {
    const cmd = m[1]
    let i = m.index + m[0].length
    while (i < code.length && /\s/.test(code[i])) {
      i++
    }
    if (code[i] === '[') {
      i++
      let depth = 1
      while (i < code.length && depth > 0) {
        const ch = code[i]
        if (ch === '[') {
          depth++
        } else if (ch === ']') {
          depth--
        }
        i++
      }
    }
    while (i < code.length && /\s/.test(code[i])) {
      i++
    }
    if (code[i] !== '{') {
      const restRaw = code.slice(i)
      const title = restRaw.trim()
      if (!title) continue
      const lead = restRaw.length - restRaw.trimStart().length
      const braceOpen0 = i + lead
      out.push({ cmd, title, braceOpen0 })
      continue
    }
    const braceOpen0 = i
    i++
    const titleStart = i
    let braceDepth = 1
    while (i < code.length && braceDepth > 0) {
      const ch = code[i]
      if (ch === '{') {
        braceDepth++
      } else if (ch === '}') {
        braceDepth--
      }
      i++
    }
    if (braceDepth !== 0) {
      continue
    }
    const title = code.slice(titleStart, i - 1).trim()
    out.push({ cmd, title, braceOpen0 })
  }
  return out
}

/**
 * 从 LaTeX 源码按 \\section、\\subsection、\\subsubsection 等划分章节行范围（行号与编辑器一致）。
 */
export function buildOutlineSectionLineRangesFromLatex(tex: string): OutlineSectionLineRange[] {
  const lines = tex.replace(/\r\n/g, '\n').split('\n')
  const lineCount = lines.length || 1
  let skipEnvDepth = 0

  type Node = {
    title: string
    title_level: number
    path: string
    titleLine: number
    latexTitleBraceOpen0: number
    children: Node[]
  }

  const root: Node = {
    title: '',
    title_level: 0,
    path: 'dummy',
    titleLine: 0,
    latexTitleBraceOpen0: 0,
    children: []
  }

  const stack: (Node | typeof root)[] = [root]

  const beginRe = /\\begin\{([^}]+)\}/g
  const endRe = /\\end\{([^}]+)\}/g

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNo = i + 1

    if (skipEnvDepth > 0) {
      beginRe.lastIndex = 0
      endRe.lastIndex = 0
      let bm: RegExpExecArray | null
      let em: RegExpExecArray | null
      const begins: string[] = []
      const ends: string[] = []
      while ((bm = beginRe.exec(line)) !== null) {
        begins.push(bm[1])
      }
      while ((em = endRe.exec(line)) !== null) {
        ends.push(em[1])
      }
      for (const env of begins) {
        if (LATEX_SKIP_OUTLINE_ENVS.has(env)) {
          skipEnvDepth++
        }
      }
      for (const env of ends) {
        if (LATEX_SKIP_OUTLINE_ENVS.has(env)) {
          skipEnvDepth = Math.max(0, skipEnvDepth - 1)
        }
      }
      continue
    }

    beginRe.lastIndex = 0
    let bmatch: RegExpExecArray | null
    while ((bmatch = beginRe.exec(line)) !== null) {
      const env = bmatch[1]
      if (LATEX_SKIP_OUTLINE_ENVS.has(env)) {
        skipEnvDepth++
      }
    }
    if (skipEnvDepth > 0) {
      endRe.lastIndex = 0
      let ematch: RegExpExecArray | null
      while ((ematch = endRe.exec(line)) !== null) {
        const env = ematch[1]
        if (LATEX_SKIP_OUTLINE_ENVS.has(env)) {
          skipEnvDepth = Math.max(0, skipEnvDepth - 1)
        }
      }
      continue
    }

    const effective = stripLatexLineComment(line)
    const headings = parseLatexSectionHeadingsInCode(effective)

    for (const h of headings) {
      const level = LATEX_CMD_LEVEL[h.cmd.toLowerCase()] ?? 3
      while (
        stack.length > 0 &&
        (stack[stack.length - 1] as { title_level: number }).title_level >= level
      ) {
        stack.pop()
      }
      const parent = stack[stack.length - 1] as typeof root
      const newNode: Node = {
        title: h.title,
        title_level: level,
        path: '',
        titleLine: lineNo,
        latexTitleBraceOpen0: h.braceOpen0,
        children: []
      }
      parent.children.push(newNode)
      stack.push(newNode)
    }
  }

  for (let i = 0; i < root.children.length; i++) {
    root.children[i].path = `${i + 1}`
  }
  const queue = [...root.children]
  while (queue.length > 0) {
    const node = queue.shift()!
    for (let i = 0; i < node.children.length; i++) {
      node.children[i].path = `${node.path}.${i + 1}`
      queue.push(node.children[i])
    }
  }

  type Flat = {
    path: string
    title: string
    level: number
    titleLine: number
    latexTitleBraceOpen0: number
  }
  const flat: Flat[] = []

  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      flat.push({
        path: n.path,
        title: n.title,
        level: n.title_level,
        titleLine: n.titleLine,
        latexTitleBraceOpen0: n.latexTitleBraceOpen0
      })
      if (n.children?.length) walk(n.children)
    }
  }
  walk(root.children)

  const ranges: OutlineSectionLineRange[] = []

  if (flat.length === 0) {
    ranges.push({
      path: '',
      title: '',
      titleLine: 1,
      startLine: 1,
      endLine: Math.max(1, lineCount)
    })
    return ranges
  }

  if (flat[0].titleLine > 1) {
    ranges.push({
      path: '',
      title: '',
      titleLine: 1,
      startLine: 1,
      endLine: flat[0].titleLine - 1
    })
  }

  for (let i = 0; i < flat.length; i++) {
    let endLine = lineCount
    for (let j = i + 1; j < flat.length; j++) {
      if (flat[j].level <= flat[i].level) {
        endLine = flat[j].titleLine - 1
        break
      }
    }
    ranges.push({
      path: flat[i].path,
      title: flat[i].title,
      titleLine: flat[i].titleLine,
      startLine: flat[i].titleLine,
      endLine,
      latexTitleBraceOpen0: flat[i].latexTitleBraceOpen0
    })
  }

  return ranges
}

/** 解析行内标题 `{...}` 的 1-based 列范围（end 列为 Monaco 独占），供 Monaco 选中 */
export function latexSectionTitleRangeInLine(
  lineText: string,
  lineNumber: number,
  titleBraceOpen0?: number | null
): { start: { line: number; column: number }; end: { line: number; column: number } } | null {
  const code = stripLatexLineComment(lineText)
  let open0 =
    titleBraceOpen0 != null && titleBraceOpen0 >= 0
      ? titleBraceOpen0
      : parseLatexSectionHeadingsInCode(code)[0]?.braceOpen0
  if (open0 === undefined || open0 >= lineText.length) return null
  if (lineText[open0] !== '{') return null
  let i = open0 + 1
  let depth = 1
  while (i < lineText.length && depth > 0) {
    const ch = lineText[i]
    if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
    }
    i++
  }
  if (depth !== 0) return null
  return {
    start: { line: lineNumber, column: open0 + 2 },
    end: { line: lineNumber, column: i + 1 }
  }
}
