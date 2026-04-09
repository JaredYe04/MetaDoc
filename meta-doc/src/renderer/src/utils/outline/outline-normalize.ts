/**
 * 大纲段落内容标题层级规格化（纯逻辑，无 latex-utils 等重依赖）
 * 供 outline-helpers 使用，便于单测只依赖本模块与 document/outline。
 */

const LATEX_HEADING_CMD_LEVEL: Record<string, number> = {
  section: 1,
  subsection: 2,
  subsubsection: 3,
  paragraph: 4,
  subparagraph: 5
}
const LATEX_LEVEL_TO_CMD = ['section', 'subsection', 'subsubsection'] as const

function findMatchingBrace(str: string, startIdx: number): number {
  let depth = 0
  for (let i = startIdx; i < str.length; i++) {
    const c = str[i]
    if (c === '\\' && i + 1 < str.length && '{}\\'.includes(str[i + 1])) {
      i++
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

export function normalizeLatexHeadingLevelsInContent(
  text: string,
  parentTitleLevel: number
): string {
  const lines = text.split('\n')
  const headingLevels: number[] = []
  const re = /^\s*\\(section|subsection|subsubsection|paragraph|subparagraph)\*?(\s*)\{/
  for (const line of lines) {
    const m = line.match(re)
    if (m) {
      const level = LATEX_HEADING_CMD_LEVEL[m[1]]
      if (level != null) headingLevels.push(level)
    }
  }
  if (headingLevels.length === 0) return text
  const minLevel = Math.min(...headingLevels)
  const targetTopLevel = parentTitleLevel + 1
  const delta = targetTopLevel - minLevel
  if (delta <= 0) return text

  const out: string[] = []
  for (const line of lines) {
    const m = line.match(re)
    if (!m) {
      out.push(line)
      continue
    }
    const cmd = m[1]
    const afterBrace = m.index! + m[0].length - 1
    const closeIdx = findMatchingBrace(line, afterBrace)
    if (closeIdx === -1) {
      out.push(line)
      continue
    }
    const level = LATEX_HEADING_CMD_LEVEL[cmd]
    if (level == null) {
      out.push(line)
      continue
    }
    const newLevel = Math.min(3, Math.max(1, level + delta))
    const newCmd = LATEX_LEVEL_TO_CMD[newLevel - 1]
    const title = line.slice(afterBrace + 1, closeIdx)
    const star = m[0].includes('*') ? '*' : ''
    const before = line.slice(0, m.index)
    const after = line.slice(closeIdx + 1)
    out.push(`${before}\\${newCmd}${star} {${title}}${after}`)
  }
  return out.join('\n')
}

export function hasLatexHeadings(text: string): boolean {
  return /\\(section|subsection|subsubsection)\*?\{/.test(text)
}

export function normalizeMarkdownHeadingLevelsInContent(
  text: string,
  parentTitleLevel: number
): string {
  const lines = text.split('\n')
  let inCodeBlock = false
  const headingLevels: number[] = []

  for (const line of lines) {
    if (line.match(/^```/)) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue
    const m = line.match(/^(#+)\s+(.*)$/)
    if (m) headingLevels.push(m[1].length)
  }

  if (headingLevels.length === 0) return text
  const minLevel = Math.min(...headingLevels)
  const targetTopLevel = parentTitleLevel + 1
  const delta = targetTopLevel - minLevel
  if (delta <= 0) return text

  inCodeBlock = false
  const out: string[] = []
  for (const line of lines) {
    if (line.match(/^```/)) {
      inCodeBlock = !inCodeBlock
      out.push(line)
      continue
    }
    if (inCodeBlock) {
      out.push(line)
      continue
    }
    const m = line.match(/^(#+)\s+(.*)$/)
    if (m) {
      const level = m[1].length
      const title = m[2]
      const newLevel = Math.min(6, Math.max(1, level + delta))
      out.push('#'.repeat(newLevel) + ' ' + title)
    } else {
      out.push(line)
    }
  }
  return out.join('\n')
}
