/**
 * Markdown → MetaDoc AST parser.
 * Supports MetaDoc subset: headings, paragraphs, lists, code block, math block,
 * bold, italic, inline code, link, image, inline math.
 * Does not use simple string replace; builds AST from structured parse.
 */

import type {
  AST,
  BlockNode,
  InlineNode,
  DocumentNode,
  HeadingNode,
  ParagraphNode,
  ListNode,
  ListItemNode,
  CodeBlockNode,
  MathBlockNode,
  BlockquoteNode,
  ThematicBreakNode,
  TableNode,
  UnknownBlockNode,
  TextNode,
  StrongNode,
  EmphasisNode,
  InlineCodeNode,
  LinkNode,
  ImageNode,
  MathInlineNode
} from '../ast/nodes'
import { createDocument } from '../ast/nodes'

const BLOCK_MATH_DOUBLE = '$$'
const INLINE_MATH_SINGLE = '$'
const FENCE = '```'
const THEMATIC_BREAK = '---'
const HEADING_PREFIX = /^(#{1,6})\s+/

export function parseMarkdown(input: string): AST {
  if (!input || typeof input !== 'string') {
    return createDocument([])
  }
  const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const blocks = parseBlocks(normalized)
  return createDocument(blocks)
}

/** Split source into block segments, then parse each into BlockNode */
function parseBlocks(source: string): BlockNode[] {
  const blocks: BlockNode[] = []
  let i = 0
  const len = source.length

  while (i < len) {
    const lineEnd = source.indexOf('\n', i)
    const line = lineEnd === -1 ? source.slice(i) : source.slice(i, lineEnd)
    const next = lineEnd === -1 ? len : lineEnd + 1

    const trimmed = line.trimStart()
    const indent = line.length - trimmed.length

    // Empty line: emit as paragraph boundary (we collect consecutive non-empty lines into paragraph)
    if (trimmed === '') {
      i = next
      continue
    }

    // Thematic break
    if (trimmed === THEMATIC_BREAK || /^-{3,}$/.test(trimmed)) {
      blocks.push({ type: 'thematic_break' })
      i = next
      continue
    }

    // Code fence
    if (trimmed.startsWith(FENCE)) {
      const lang = trimmed.slice(FENCE.length).trim().split(/\s/)[0] || undefined
      let content = ''
      i = next
      while (i < len) {
        const endLine = source.indexOf('\n', i)
        const raw = endLine === -1 ? source.slice(i) : source.slice(i, endLine)
        const n = endLine === -1 ? len : endLine + 1
        if (raw.trim() === FENCE) {
          blocks.push({ type: 'code_block', content: content.trimEnd(), lang: lang || undefined })
          i = n
          break
        }
        content += (content ? '\n' : '') + raw
        i = n
      }
      continue
    }

    // Math block $$ ... $$ or \[ ... \] (LaTeX display math)
    if (trimmed.startsWith(BLOCK_MATH_DOUBLE)) {
      let mathContent = trimmed.slice(BLOCK_MATH_DOUBLE.length)
      if (mathContent.endsWith(BLOCK_MATH_DOUBLE)) {
        mathContent = mathContent.slice(0, -BLOCK_MATH_DOUBLE.length)
        blocks.push({ type: 'math_block', content: mathContent.trim() })
        i = next
        continue
      }
      const acc: string[] = [mathContent]
      i = next
      while (i < len) {
        const endLine = source.indexOf('\n', i)
        const raw = endLine === -1 ? source.slice(i) : source.slice(i, endLine)
        const n = endLine === -1 ? len : endLine + 1
        if (raw.trim().endsWith(BLOCK_MATH_DOUBLE)) {
          const rest = raw.trim().slice(0, -BLOCK_MATH_DOUBLE.length)
          acc.push(rest)
          blocks.push({ type: 'math_block', content: acc.join('\n').trim() })
          i = n
          break
        }
        acc.push(raw)
        i = n
      }
      continue
    }

    // LaTeX display math \[ ... \] (block, can be multiline)
    if (trimmed.startsWith('\\[')) {
      const rest = trimmed.slice(2)
      const endIdx = rest.indexOf('\\]')
      if (endIdx !== -1) {
        blocks.push({ type: 'math_block', content: rest.slice(0, endIdx).trim() })
        i = next
        continue
      }
      const acc: string[] = [rest]
      i = next
      while (i < len) {
        const endLine = source.indexOf('\n', i)
        const raw = endLine === -1 ? source.slice(i) : source.slice(i, endLine)
        const n = endLine === -1 ? len : endLine + 1
        const t = raw.trim()
        if (t.endsWith('\\]')) {
          acc.push(t.slice(0, -2))
          blocks.push({ type: 'math_block', content: acc.join('\n').trim() })
          i = n
          break
        }
        acc.push(raw)
        i = n
      }
      continue
    }

    // Heading
    const headingMatch = trimmed.match(HEADING_PREFIX)
    if (headingMatch && indent === 0) {
      const level = Math.min(3, headingMatch[1].length) as 1 | 2 | 3
      const title = trimmed.slice(headingMatch[0].length)
      const children = parseInline(title)
      blocks.push({ type: 'heading', level, children })
      i = next
      continue
    }

    // Unordered list: * or -
    const ulMatch = /^(\s*)[*\-]\s+/.exec(line)
    if (ulMatch && (ulMatch[1].length === indent || indent === 0)) {
      const listResult = parseList(source, i, false)
      blocks.push(listResult.node)
      i = listResult.consumed
      continue
    }

    // Ordered list: 1. 2. etc.
    const olMatch = /^(\s*)\d+\.\s+/.exec(line)
    if (olMatch && (olMatch[1].length === indent || indent === 0)) {
      const listResult = parseList(source, i, true)
      blocks.push(listResult.node)
      i = listResult.consumed
      continue
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const bqResult = parseBlockquote(source, i)
      blocks.push(bqResult.node)
      i = bqResult.consumed
      continue
    }

    // GFM table: | col1 | col2 | ... (header, optional separator, data rows)
    if (indent === 0 && trimmed.startsWith('|') && trimmed.includes('|', 1)) {
      const tableResult = parseTable(source, i)
      if (tableResult) {
        blocks.push(tableResult.node)
        i = tableResult.consumed
        continue
      }
    }

    // Paragraph: collect consecutive lines until blank or block start
    const paraLines: string[] = [trimmed]
    i = next
    while (i < len) {
      const pe = source.indexOf('\n', i)
      const pline = pe === -1 ? source.slice(i) : source.slice(i, pe)
      const pnext = pe === -1 ? len : pe + 1
      const ptrim = pline.trimStart()
      const pindent = pline.length - ptrim.length
      if (ptrim === '') break
      if (ptrim.startsWith(FENCE) || ptrim.startsWith(BLOCK_MATH_DOUBLE) || ptrim.startsWith('\\[')) break
      if (HEADING_PREFIX.test(ptrim) && (pindent === 0 || pindent === indent)) break
      if (/^\s*[*\-]\s+/.test(pline) || /^\s*\d+\.\s+/.test(pline)) break
      if (ptrim.startsWith('>')) break
      if (ptrim.startsWith('|') && ptrim.includes('|', 1)) break
      paraLines.push(ptrim)
      i = pnext
    }
    const paraText = paraLines.join('\n')
    blocks.push({ type: 'paragraph', children: parseInline(paraText) })
  }

  return blocks
}

function parseList(source: string, start: number, ordered: boolean): { node: ListNode; consumed: number } {
  const items: ListItemNode[] = []
  let i = start
  const len = source.length
  const itemPattern = ordered ? /^\s*\d+\.\s+/ : /^\s*[*\-]\s+/

  while (i < len) {
    const lineEnd = source.indexOf('\n', i)
    const line = lineEnd === -1 ? source.slice(i) : source.slice(i, lineEnd)
    const next = lineEnd === -1 ? len : lineEnd + 1

    const trimmed = line.trimStart()
    if (trimmed === '') {
      i = next
      break
    }

    const match = line.match(itemPattern)
    if (!match) {
      // Continuation of previous item (same line content without bullet)
      if (items.length > 0) {
        const last = items[items.length - 1]
        const lastBlock = last.children[last.children.length - 1]
        if (lastBlock.type === 'paragraph') {
          const extra: InlineNode[] = [{ type: 'text', value: '\n' }, ...parseInline(trimmed)]
          ;(lastBlock as ParagraphNode).children.push(...extra)
        }
      }
      i = next
      continue
    }

    const itemContent = trimmed.slice(match[0].trimStart().length)
    const paraChildren = parseInline(itemContent)
    items.push({
      type: 'list_item',
      children: [{ type: 'paragraph', children: paraChildren }]
    })
    i = next
  }

  return {
    node: { type: 'list', ordered, items },
    consumed: i
  }
}

function parseBlockquote(source: string, start: number): { node: BlockquoteNode; consumed: number } {
  const lines: string[] = []
  let i = start
  const len = source.length

  while (i < len) {
    const lineEnd = source.indexOf('\n', i)
    const line = lineEnd === -1 ? source.slice(i) : source.slice(i, lineEnd)
    const next = lineEnd === -1 ? len : lineEnd + 1
    const t = line.trimStart()
    if (t === '') break
    if (!t.startsWith('>')) break
    const content = t.slice(1).replace(/^\s/, '')
    lines.push(content)
    i = next
  }

  const inner = lines.join('\n')
  const innerBlocks = parseBlocks(inner)
  return {
    node: { type: 'blockquote', children: innerBlocks },
    consumed: i
  }
}

/** Split a table row line into cell strings (strip leading/trailing pipes, split by |) */
function splitTableRow(line: string): string[] {
  const trimmed = line.trim()
  const withoutBorders = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  return withoutBorders.split('|').map((c) => c.trim())
}

/** Check if line is a table separator row: | --- | --- | or |:---|---:|---:| (each cell is dashes/colons) */
function isTableSeparator(line: string): boolean {
  const t = line.trim()
  if (!t.startsWith('|') || !t.endsWith('|')) return false
  const cells = splitTableRow(line)
  if (cells.length === 0) return false
  return cells.every((c) => /^[-:\s]+$/.test(c) && c.includes('-'))
}

/** Parse GFM table starting at current position. Returns null if not a valid table. */
function parseTable(source: string, start: number): { node: TableNode; consumed: number } | null {
  const lines: string[] = []
  let i = start
  const len = source.length
  while (i < len) {
    const lineEnd = source.indexOf('\n', i)
    const line = lineEnd === -1 ? source.slice(i) : source.slice(i, lineEnd)
    const next = lineEnd === -1 ? len : lineEnd + 1
    const trimmed = line.trim()
    if (trimmed === '') break
    if (!trimmed.startsWith('|') || !trimmed.includes('|', 1)) break
    lines.push(trimmed)
    i = next
  }
  if (lines.length === 0) return null
  const headerRow = splitTableRow(lines[0])
  if (headerRow.length === 0) return null
  let rowStart = 1
  if (lines.length > 1 && isTableSeparator(lines[1])) {
    rowStart = 2
  }
  const rows: string[][] = []
  for (let r = rowStart; r < lines.length; r++) {
    rows.push(splitTableRow(lines[r]))
  }
  return {
    node: { type: 'table', headerRow, rows },
    consumed: i
  }
}

/**
 * Parse inline content into a sequence of InlineNode.
 * Handles: **bold**, *italic*, `code`, [text](url), ![alt](url), $math$
 */
function parseInline(text: string): InlineNode[] {
  const out: InlineNode[] = []
  let i = 0
  const len = text.length

  while (i < len) {
    // LaTeX inline math \( ... \)
    if (text[i] === '\\' && text[i + 1] === '(') {
      const end = text.indexOf('\\)', i + 2)
      if (end !== -1) {
        out.push({ type: 'math_inline', content: text.slice(i + 2, end).trim() })
        i = end + 2
        continue
      }
    }

    // Inline math $ ... $ (non-greedy, no newline)
    const inlineMathStart = text.indexOf(INLINE_MATH_SINGLE, i)
    if (inlineMathStart !== -1) {
      const afterDollar = inlineMathStart + 1
      if (afterDollar < len && text[afterDollar] !== INLINE_MATH_SINGLE) {
        const end = text.indexOf(INLINE_MATH_SINGLE, afterDollar)
        if (end !== -1) {
          if (i < inlineMathStart) {
            out.push(...parseInlineNoMath(text.slice(i, inlineMathStart)))
          }
          out.push({ type: 'math_inline', content: text.slice(afterDollar, end).trim() })
          i = end + 1
          continue
        }
      }
    }

    // Image ![alt](url)
    const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/
    const imgMatch = text.slice(i).match(imgRe)
    if (imgMatch && text.slice(i).indexOf(imgMatch[0]) === 0) {
      out.push({ type: 'image', url: imgMatch[2], alt: imgMatch[1] || undefined })
      i += imgMatch[0].length
      continue
    }

    // Link [text](url)
    const linkRe = /\[([^\]]+)\]\(([^)]+)\)/
    const linkMatch = text.slice(i).match(linkRe)
    if (linkMatch && !text.slice(i).startsWith('![') && text.slice(i).indexOf(linkMatch[0]) === 0) {
      out.push({ type: 'link', url: linkMatch[2], children: parseInlineNoMath(linkMatch[1]) })
      i += linkMatch[0].length
      continue
    }

    // Inline code `...`
    const codeStart = text.indexOf('`', i)
    if (codeStart !== -1) {
      let end = codeStart + 1
      while (end < len && text[end] !== '`') end++
      if (end < len) {
        if (i < codeStart) {
          out.push(...parseInlineNoMath(text.slice(i, codeStart)))
        }
        out.push({ type: 'inline_code', value: text.slice(codeStart + 1, end) })
        i = end + 1
        continue
      }
    }

    // Bold **...**
    if (text.slice(i, i + 2) === '**') {
      const close = findClosingDelim(text, i + 2, '**')
      if (close !== -1) {
        const inner = text.slice(i + 2, close)
        out.push({ type: 'strong', children: parseInlineNoMath(inner) })
        i = close + 2
        continue
      }
    }

    // Italic *...* (single, not **)
    if (text[i] === '*' && text[i + 1] !== '*') {
      const close = text.indexOf('*', i + 1)
      if (close !== -1) {
        if (i < close) {
          const inner = text.slice(i + 1, close)
          out.push({ type: 'emphasis', children: parseInlineNoMath(inner) })
          i = close + 1
          continue
        }
      }
    }

    // Strikethrough ~~...~~
    if (text.slice(i, i + 2) === '~~') {
      const close = text.indexOf('~~', i + 2)
      if (close !== -1) {
        const inner = text.slice(i + 2, close)
        out.push({ type: 'strikethrough', children: parseInlineNoMath(inner) })
        i = close + 2
        continue
      }
    }

    // Default: consume until next special char
    const nextSpecial = findNextInlineSpecial(text, i)
    const end = nextSpecial === -1 ? len : nextSpecial
    if (end > i) {
      const raw = text.slice(i, end)
      if (raw.length > 0) {
        out.push({ type: 'text', value: raw })
      }
      i = end
    } else {
      out.push({ type: 'text', value: text[i] })
      i++
    }
  }

  return out
}

function findClosingDelim(s: string, start: number, delim: string): number {
  let i = start
  while (i <= s.length - delim.length) {
    if (s.slice(i, i + delim.length) === delim) return i
    if (s[i] === '\\') i++
    i++
  }
  return -1
}

function findNextInlineSpecial(s: string, start: number): number {
  const specials = ['*', '`', '[', '!', '$', '\\', '~']
  let i = start
  while (i < s.length) {
    if (specials.includes(s[i])) return i
    if (s[i] === '\\') i++
    i++
  }
  return -1
}

/** Parse inline without opening $ (used inside parseInline for non-math segments) */
function parseInlineNoMath(text: string): InlineNode[] {
  const out: InlineNode[] = []
  let i = 0
  const len = text.length

  while (i < len) {
    // LaTeX inline math \( ... \)
    if (text[i] === '\\' && text[i + 1] === '(') {
      const end = text.indexOf('\\)', i + 2)
      if (end !== -1) {
        out.push({ type: 'math_inline', content: text.slice(i + 2, end).trim() })
        i = end + 2
        continue
      }
    }

    // Image ![alt](url)
    const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/
    const imgMatch = text.slice(i).match(imgRe)
    if (imgMatch && text.slice(i).indexOf(imgMatch[0]) === 0) {
      out.push({ type: 'image', url: imgMatch[2], alt: imgMatch[1] || undefined })
      i += imgMatch[0].length
      continue
    }

    // Link [text](url)
    const linkRe = /\[([^\]]+)\]\(([^)]+)\)/
    const linkMatch = text.slice(i).match(linkRe)
    if (linkMatch && !text.slice(i).startsWith('![') && text.slice(i).indexOf(linkMatch[0]) === 0) {
      out.push({ type: 'link', url: linkMatch[2], children: parseInlineNoMath(linkMatch[1]) })
      i += linkMatch[0].length
      continue
    }

    // Inline code
    const codeStart = text.indexOf('`', i)
    if (codeStart === i) {
      let end = i + 1
      while (end < len && text[end] !== '`') end++
      if (end < len) {
        out.push({ type: 'inline_code', value: text.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }

    // Bold **
    if (text.slice(i, i + 2) === '**') {
      const close = findClosingDelim(text, i + 2, '**')
      if (close !== -1) {
        out.push({ type: 'strong', children: parseInlineNoMath(text.slice(i + 2, close)) })
        i = close + 2
        continue
      }
    }

    // Italic *
    if (text[i] === '*' && text[i + 1] !== '*') {
      const close = text.indexOf('*', i + 1)
      if (close !== -1) {
        out.push({ type: 'emphasis', children: parseInlineNoMath(text.slice(i + 1, close)) })
        i = close + 1
        continue
      }
    }

    // Strikethrough ~~...~~
    if (text.slice(i, i + 2) === '~~') {
      const close = text.indexOf('~~', i + 2)
      if (close !== -1) {
        out.push({ type: 'strikethrough', children: parseInlineNoMath(text.slice(i + 2, close)) })
        i = close + 2
        continue
      }
    }

    const nextSpecial = findNextInlineSpecial(text, i)
    const end = nextSpecial === -1 ? len : nextSpecial
    if (end > i) {
      out.push({ type: 'text', value: text.slice(i, end) })
      i = end
    } else {
      out.push({ type: 'text', value: text[i] })
      i++
    }
  }

  return out
}
