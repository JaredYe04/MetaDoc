/**
 * LaTeX → MetaDoc AST parser.
 * Parses document body (between \begin{document} and \end{document} if present).
 * Supports: \section, \subsection, \subsubsection, \textbf, \textit, \texttt,
 * \begin{itemize}, \begin{enumerate}, \begin{verbatim}, \href{}{}, \includegraphics{},
 * \[ ... \], and treats unknown commands as unknown nodes (no crash).
 */

import type {
  AST,
  BlockNode,
  InlineNode,
  HeadingNode,
  ParagraphNode,
  ListNode,
  ListItemNode,
  CodeBlockNode,
  MathBlockNode,
  BlockquoteNode,
  ThematicBreakNode,
  TableNode,
  UnknownBlockNode
} from '../ast/nodes'
import { createDocument } from '../ast/nodes'

const BEGIN_DOC = '\\begin{document}'
const END_DOC = '\\end{document}'

/** Strip LaTeX line comments (% to EOL). Leaves lines intact but removes comment portion; full-comment lines become empty. */
function stripLineComments(body: string): string {
  return body
    .split('\n')
    .map((line) => {
      let i = 0
      while (i < line.length) {
        const idx = line.indexOf('%', i)
        if (idx === -1) break
        if (idx > 0 && line[idx - 1] === '\\') {
          i = idx + 1
          continue
        }
        return line.slice(0, idx).trimEnd()
      }
      return line
    })
    .join('\n')
}

/** Strip LaTeX control blocks that have no Markdown equivalent (titlepage, tableofcontents, newpage, label, etc.) */
function stripControlBlocks(body: string): string {
  let s = body
  // \begin{titlepage}...\end{titlepage}
  s = s.replace(/\\begin\{titlepage\}[\s\S]*?\\end\{titlepage\}/g, '')
  // \tableofcontents
  s = s.replace(/\\tableofcontents\b/g, '')
  // \newpage
  s = s.replace(/\\newpage\b/g, '')
  // \maketitle
  s = s.replace(/\\maketitle\b/g, '')
  // \label{...} (standalone or at end of line)
  s = s.replace(/\\label\{[^{}]*\}/g, '')
  // \clearpage, \cleardoublepage
  s = s.replace(/\\(clearpage|cleardoublepage)\b/g, '')
  // \vspace{...}, \vfill, \centering (standalone)
  s = s.replace(/\\vspace\{[^{}]*\}/g, '')
  s = s.replace(/\\vfill\b/g, '')
  return s
}

/** Extract body between \begin{document} and \end{document}; otherwise use full input; then strip control blocks */
export function sanitizeLatexBody(latex: string): string {
  if (!latex || typeof latex !== 'string') return ''
  const normalized = latex.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const startIdx = normalized.indexOf(BEGIN_DOC)
  const endIdx = normalized.lastIndexOf(END_DOC)
  let body: string
  if (startIdx !== -1) {
    const bodyStart = startIdx + BEGIN_DOC.length
    const bodyEnd = endIdx !== -1 ? endIdx : undefined
    body = normalized.slice(bodyStart, bodyEnd).trim()
  } else {
    body = normalized.trim()
  }
  const stripped = stripControlBlocks(body)
  const noComments = stripLineComments(stripped)
  return noComments.replace(/\n{3,}/g, '\n\n').trim()
}

export function parseLatex(latex: string): AST {
  const body = sanitizeLatexBody(latex)
  const blocks = parseBlocks(body)
  return createDocument(blocks)
}

/** Extract single balanced { ... } content starting at open brace index */
function extractBraced(s: string, start: number): { content: string; end: number } | null {
  if (s[start] !== '{') return null
  let depth = 1
  let i = start + 1
  while (i < s.length) {
    if (s[i] === '\\' && i + 1 < s.length) {
      i += 2
      continue
    }
    if (s[i] === '{') depth++
    else if (s[i] === '}') {
      depth--
      if (depth === 0) {
        return { content: s.slice(start + 1, i), end: i + 1 }
      }
    }
    i++
  }
  return null
}

/** Check if a trimmed line looks like a markdown table row (| ... |) */
function isTableRow(trimmed: string): boolean {
  return trimmed.startsWith('|') && trimmed.includes('|', 1)
}

function splitTableRowLatex(line: string): string[] {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return t.split('|').map((c) => c.trim())
}

function isTableSeparatorLatex(trimmed: string): boolean {
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false
  const cells = splitTableRowLatex(trimmed)
  if (cells.length === 0) return false
  return cells.every((c) => /^[-:\s]+$/.test(c) && c.includes('-'))
}

/** Parse consecutive markdown-style table lines into one TableNode */
function parseTableBlock(lines: string[], start: number): { node: TableNode; nextIndex: number } | null {
  if (!isTableRow(lines[start].trim())) return null
  const rowLines: string[] = []
  let i = start
  while (i < lines.length && isTableRow(lines[i].trim())) {
    rowLines.push(lines[i].trim())
    i++
  }
  if (rowLines.length === 0) return null
  const headerRow = splitTableRowLatex(rowLines[0])
  if (headerRow.length === 0) return null
  let rowStart = 1
  if (rowLines.length > 1 && isTableSeparatorLatex(rowLines[1])) rowStart = 2
  const rows: string[][] = []
  for (let r = rowStart; r < rowLines.length; r++) {
    rows.push(splitTableRowLatex(rowLines[r]))
  }
  return {
    node: { type: 'table', headerRow, rows },
    nextIndex: start + rowLines.length
  }
}

/** Parse line-based block structure */
function parseBlocks(source: string): BlockNode[] {
  const blocks: BlockNode[] = []
  const lines = source.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed === '') {
      i++
      continue
    }

    // Markdown-style pipe table (consecutive lines | ... |)
    const tableResult = parseTableBlock(lines, i)
    if (tableResult) {
      blocks.push(tableResult.node)
      i = tableResult.nextIndex
      continue
    }

    // \section{...}, \subsection{...}, \subsubsection{...}
    const headingMatch = trimmed.match(/^\\(section|subsection|subsubsection)\*?(\s*)\{/)
    if (headingMatch) {
      const braced = extractBraced(trimmed, trimmed.indexOf('{'))
      if (braced) {
        const level: 1 | 2 | 3 =
          headingMatch[1] === 'section' ? 1 : headingMatch[1] === 'subsection' ? 2 : 3
        const children = parseInlineLatex(braced.content)
        blocks.push({ type: 'heading', level, children })
      } else {
        blocks.push({ type: 'unknown', raw: line })
      }
      i++
      continue
    }

    // \begin{verbatim} ... \end{verbatim}
    if (trimmed.startsWith('\\begin{verbatim}')) {
      const contentLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('\\end{verbatim}')) {
        contentLines.push(lines[i])
        i++
      }
      blocks.push({ type: 'code_block', content: contentLines.join('\n') })
      if (i < lines.length) i++
      continue
    }
    if (trimmed.startsWith('\\end{verbatim}')) {
      i++
      continue
    }

    // \[ ... \] math block (single line or multi)
    if (trimmed.startsWith('\\[')) {
      const rest = trimmed.slice(2).trim()
      if (rest.endsWith('\\]')) {
        blocks.push({ type: 'math_block', content: rest.slice(0, -2).trim() })
      } else {
        const mathLines: string[] = [rest]
        i++
        while (i < lines.length && !lines[i].trim().endsWith('\\]')) {
          mathLines.push(lines[i])
          i++
        }
        if (i < lines.length) {
          mathLines.push(lines[i].trim().slice(0, -2))
        }
        blocks.push({ type: 'math_block', content: mathLines.join('\n').trim() })
      }
      i++
      continue
    }

    // \begin{itemize} ... \end{itemize}
    if (trimmed.startsWith('\\begin{itemize}')) {
      const listResult = parseListEnv(lines, i, false)
      blocks.push(listResult.node)
      i = listResult.nextIndex
      continue
    }

    // \begin{enumerate} ... \end{enumerate}
    if (trimmed.startsWith('\\begin{enumerate}')) {
      const listResult = parseListEnv(lines, i, true)
      blocks.push(listResult.node)
      i = listResult.nextIndex
      continue
    }

    // \begin{quote} ... \end{quote}
    if (trimmed.startsWith('\\begin{quote}')) {
      const quoteResult = parseQuoteEnv(lines, i)
      blocks.push(quoteResult.node)
      i = quoteResult.nextIndex
      continue
    }

    // \begin{abstract} ... \end{abstract} → blockquote (summary)
    if (trimmed.startsWith('\\begin{abstract}')) {
      const abstractResult = parseAbstractEnv(lines, i)
      blocks.push(abstractResult.node)
      i = abstractResult.nextIndex
      continue
    }

    // \begin{equation} ... \end{equation} or \begin{equation*} ... \end{equation*}
    if (trimmed.match(/^\\begin\{equation\*?\}/)) {
      const eqResult = parseEquationEnv(lines, i)
      if (eqResult) {
        blocks.push(eqResult.node)
        i = eqResult.nextIndex
        continue
      }
    }

    // \begin{figure}...\end{figure} or \begin{figure*}: extract caption + includegraphics
    if (trimmed.match(/^\\begin\{figure\*?\}/)) {
      const figResult = parseFigureEnv(lines, i)
      if (figResult) {
        blocks.push(...figResult.blocks)
        i = figResult.nextIndex
        continue
      }
    }

    // \begin{center}...\end{center} with \includegraphics → markdown image(s)
    if (trimmed.startsWith('\\begin{center}')) {
      const centerResult = parseCenterEnv(lines, i)
      if (centerResult.blocks.length > 0) {
        blocks.push(...centerResult.blocks)
      }
      i = centerResult.nextIndex
      continue
    }

    // \begin{longtable}...\end{longtable} or \begin{longtblr}...\end{longtblr}
    if (trimmed.startsWith('\\begin{longtable') || trimmed.startsWith('\\begin{longtblr')) {
      const tblResult = parseLongTableEnv(lines, i)
      if (tblResult) {
        blocks.push(tblResult.node)
        i = tblResult.nextIndex
        continue
      }
    }

    // \begin{thebibliography}...\end{thebibliography} → ## References + list of bib items
    if (trimmed.startsWith('\\begin{thebibliography}')) {
      const bibResult = parseTheBibliographyEnv(lines, i)
      blocks.push(...bibResult.blocks)
      i = bibResult.nextIndex
      continue
    }

    // \begin{subappendices}...\end{subappendices} → parse inner as body
    if (trimmed.startsWith('\\begin{subappendices}')) {
      const innerResult = parseGenericEnv(lines, i, 'subappendices')
      blocks.push(...parseBlocks(innerResult.inner))
      i = innerResult.nextIndex
      continue
    }

    // \begin{letter}... and similar: parse inner so \textbf, \item, \subitem convert
    if (trimmed.match(/^\\begin\{(letter|minipage|frame)\}/)) {
      const envName = trimmed.match(/^\\begin\{([^}]+)\}/)![1]
      const innerResult = parseGenericEnv(lines, i, envName)
      blocks.push(...parseBlocks(innerResult.inner))
      i = innerResult.nextIndex
      continue
    }

    // Unknown \begin{xxx} ... \end{xxx}: fallback as raw block (e.g. figure, table, tikz)
    const beginUnknownMatch = trimmed.match(/^\\begin\{([a-zA-Z*]+)\}/)
    if (beginUnknownMatch) {
      const envName = beginUnknownMatch[1]
      const endTag = `\\end{${envName}}`
      const rawLines: string[] = [line]
      let j = i + 1
      while (j < lines.length) {
        rawLines.push(lines[j])
        if (lines[j].trim().startsWith(endTag)) break
        j++
      }
      blocks.push({ type: 'unknown', raw: rawLines.join('\n') })
      i = j + 1
      continue
    }

    // \hrulefill
    if (trimmed === '\\hrulefill') {
      blocks.push({ type: 'thematic_break' })
      i++
      continue
    }

    // \includegraphics[...]{path} or \includegraphics{path}
    const incMatch = trimmed.match(/\\includegraphics(?:\[[^\]]*\])?\{([^{}]+)\}/)
    if (incMatch) {
      blocks.push({ type: 'paragraph', children: [{ type: 'image', url: incMatch[1] }] })
      i++
      continue
    }

    // Standalone \href{url}{text} line
    const hrefMatch = trimmed.match(/\\href\{([^{}]+)\}\{/)
    if (hrefMatch) {
      const url = hrefMatch[1]
      const openBrace = trimmed.indexOf('}{') + 1
      const braced = extractBraced(trimmed, trimmed.indexOf('{', openBrace - 1))
      if (braced) {
        const children = parseInlineLatex(braced.content)
        blocks.push({ type: 'paragraph', children: [{ type: 'link', url, children }] })
      } else {
        blocks.push({ type: 'unknown', raw: line })
      }
      i++
      continue
    }

    // Paragraph line (may contain inline commands)
    const inlines = parseInlineLatex(trimmed)
    if (inlines.length > 0) {
      blocks.push({ type: 'paragraph', children: inlines })
    }
    i++
  }

  return blocks
}

function parseListEnv(
  lines: string[],
  start: number,
  ordered: boolean
): { node: ListNode; nextIndex: number } {
  const envName = ordered ? 'enumerate' : 'itemize'
  const items: ListItemNode[] = []
  let i = start + 1

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed.startsWith(`\\end{${envName}}`)) {
      return { node: { type: 'list', ordered, items }, nextIndex: i + 1 }
    }

    // Nested \begin{itemize} or \begin{enumerate}
    if (trimmed.startsWith('\\begin{itemize}')) {
      if (items.length > 0) {
        const listResult = parseListEnv(lines, i, false)
        const last = items[items.length - 1]
        last.children.push(listResult.node)
        i = listResult.nextIndex
      } else {
        i++
      }
      continue
    }
    if (trimmed.startsWith('\\begin{enumerate}')) {
      if (items.length > 0) {
        const listResult = parseListEnv(lines, i, true)
        const last = items[items.length - 1]
        last.children.push(listResult.node)
        i = listResult.nextIndex
      } else {
        i++
      }
      continue
    }

    // \subitem (nested item, e.g. in letter env): add as nested list under last item
    if (trimmed.startsWith('\\subitem')) {
      const subContent = trimmed.slice(8).trim()
      const subChildren = parseInlineLatex(subContent)
      const subPara: ParagraphNode = { type: 'paragraph', children: subChildren }
      const subListItem: ListItemNode = { type: 'list_item', children: [subPara] }
      if (items.length > 0) {
        const last = items[items.length - 1]
        const lastBlock = last.children[last.children.length - 1]
        if (lastBlock.type === 'list') {
          (lastBlock as ListNode).items.push(subListItem)
        } else {
          last.children.push({ type: 'list', ordered: false, items: [subListItem] })
        }
      } else {
        items.push({ type: 'list_item', children: [subPara] })
      }
      i++
      continue
    }

    // \item or \item[optional label]
    const itemMatch = trimmed.match(/^\\item\s*(?:\[([^\]]*)\])?\s*(.*)$/s)
    if (itemMatch) {
      const optionalLabel = itemMatch[1]?.trim()
      const itemContent = itemMatch[2]?.trim() ?? ''
      const children = parseInlineLatex(itemContent)
      const para: ParagraphNode = { type: 'paragraph', children }
      const listItem: ListItemNode = { type: 'list_item', children: [para] }
      if (optionalLabel && optionalLabel.length > 0) {
        para.children = [{ type: 'text', value: optionalLabel + ' ' }, ...para.children]
      }
      items.push(listItem)
      i++
      continue
    }

    if (trimmed === '') {
      i++
      continue
    }

    // \setlength etc. - skip
    if (trimmed.startsWith('\\setlength') || trimmed.startsWith('\\vspace')) {
      i++
      continue
    }

    // Continuation of previous item
    if (items.length > 0) {
      const last = items[items.length - 1]
      const lastBlock = last.children[last.children.length - 1]
      if (lastBlock.type === 'paragraph') {
        const extra = parseInlineLatex(trimmed)
        ;(lastBlock as ParagraphNode).children.push({ type: 'text', value: ' ' }, ...extra)
      }
    }
    i++
  }

  return { node: { type: 'list', ordered, items }, nextIndex: i }
}

function parseQuoteEnv(lines: string[], start: number): { node: BlockquoteNode; nextIndex: number } {
  const innerLines: string[] = []
  let i = start + 1

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed.startsWith('\\end{quote}')) {
      const inner = innerLines.join('\n')
      const innerBlocks = parseBlocks(inner)
      return { node: { type: 'blockquote', children: innerBlocks }, nextIndex: i + 1 }
    }
    innerLines.push(line)
    i++
  }

  const inner = innerLines.join('\n')
  const innerBlocks = parseBlocks(inner)
  return { node: { type: 'blockquote', children: innerBlocks }, nextIndex: i }
}

function parseAbstractEnv(lines: string[], start: number): { node: BlockquoteNode; nextIndex: number } {
  const innerLines: string[] = []
  let i = start + 1
  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (trimmed.startsWith('\\end{abstract}')) {
      const inner = innerLines.join('\n')
      const innerBlocks = parseBlocks(inner)
      return { node: { type: 'blockquote', children: innerBlocks }, nextIndex: i + 1 }
    }
    innerLines.push(lines[i])
    i++
  }
  const inner = innerLines.join('\n')
  return { node: { type: 'blockquote', children: parseBlocks(inner) }, nextIndex: i }
}

/** Extract inner content of \begin{envName}...\end{envName}. */
function parseGenericEnv(lines: string[], start: number, envName: string): { inner: string; nextIndex: number } {
  const endTag = `\\end{${envName}}`
  const innerLines: string[] = []
  let i = start + 1
  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (trimmed.startsWith(endTag)) {
      return { inner: innerLines.join('\n'), nextIndex: i + 1 }
    }
    innerLines.push(lines[i])
    i++
  }
  return { inner: innerLines.join('\n'), nextIndex: i }
}

/** Parse thebibliography: emit ## References and for each \bibitem{key} a paragraph with anchor and [key] prefix. */
function parseTheBibliographyEnv(lines: string[], start: number): { blocks: BlockNode[]; nextIndex: number } {
  const endTag = '\\end{thebibliography}'
  const blocks: BlockNode[] = []
  blocks.push({ type: 'heading', level: 2, children: [{ type: 'text', value: 'References' }] })
  let i = start + 1
  let currentKey: string | null = null
  let currentItem: string[] = []
  const flushItem = (key: string, rest: string) => {
    const text = rest.trim()
    if (!text) return
    const anchorHtml = `<span id="ref-${key}"></span>`
    const prefix = `[${key}] `
    const children: InlineNode[] = [
      { type: 'unknown_inline', raw: anchorHtml },
      { type: 'text', value: prefix },
      ...parseInlineLatex(text)
    ]
    blocks.push({ type: 'paragraph', children })
  }
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed.startsWith(endTag)) {
      if (currentKey !== null && currentItem.length > 0) {
        flushItem(currentKey, currentItem.join(' '))
      }
      i++
      break
    }
    const bibMatch = trimmed.match(/^\\bibitem\{([^}]*)\}\s*(.*)$/s)
    if (bibMatch) {
      if (currentKey !== null && currentItem.length > 0) {
        flushItem(currentKey, currentItem.join(' '))
      }
      currentKey = bibMatch[1].trim()
      currentItem = [bibMatch[2].trim()]
    } else if (currentKey !== null && trimmed !== '') {
      currentItem.push(trimmed)
    }
    i++
  }
  if (currentKey !== null && currentItem.length > 0) {
    flushItem(currentKey, currentItem.join(' '))
  }
  return { blocks, nextIndex: i }
}

function parseEquationEnv(lines: string[], start: number): { node: MathBlockNode; nextIndex: number } | null {
  const contentLines: string[] = []
  let i = start + 1
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed.startsWith('\\end{equation}') || trimmed.startsWith('\\end{equation*}')) {
      const content = contentLines.join('\n').trim()
      return content ? { node: { type: 'math_block', content }, nextIndex: i + 1 } : null
    }
    contentLines.push(line)
    i++
  }
  return null
}

/** Extract caption text from \caption{...} */
function extractCaption(trimmed: string): string | null {
  const match = trimmed.match(/\\caption\s*\{/)
  if (!match) return null
  const open = trimmed.indexOf('{', trimmed.indexOf('\\caption'))
  const braced = extractBraced(trimmed, open)
  if (!braced) return null
  return stripLatexForPlainText(braced.content)
}

/** Extract path from \includegraphics[...]{path} */
function extractIncludegraphicsPath(trimmed: string): string | null {
  const m = trimmed.match(/\\includegraphics(?:\[[^\]]*\])?\{([^{}]+)\}/)
  return m ? m[1] : null
}

/** Replace one \multicolumn{num}{cols}{content} with content (cols can have nested braces like m{4cm}). */
function replaceOneMulticolumn(s: string): string {
  const idx = s.indexOf('\\multicolumn')
  if (idx === -1) return s
  let pos = idx + '\\multicolumn'.length
  const rest = s.slice(pos).trimStart()
  if (!rest.startsWith('{')) return s
  pos = s.length - rest.length
  const b1 = extractBraced(s, pos)
  if (!b1) return s
  const b2 = extractBraced(s, b1.end)
  if (!b2) return s
  const b3 = extractBraced(s, b2.end)
  if (!b3) return s
  const inner = b3.content.replace(/\\centering\s*/g, '').trim()
  return s.slice(0, idx) + inner + s.slice(b3.end)
}

/** Rough strip of LaTeX commands to plain text (for caption/cell text). Unwraps \{...}; handles \multicolumn with nested braces. */
function stripLatexForPlainText(s: string): string {
  let t = s.replace(/\\label\{[^{}]*\}/g, '')
  while (/\\multicolumn\s*\{/.test(t)) {
    const next = replaceOneMulticolumn(t)
    if (next === t) break
    t = next
  }
  for (let round = 0; round < 10 && /\\[a-zA-Z]+\s*\{/.test(t); round++) {
    const prev = t
    t = t.replace(/\\textbf\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$1')
    t = t.replace(/\\textit\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$1')
    t = t.replace(/\\centering\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$1')
    if (t === prev) break
  }
  return t.replace(/\s+/g, ' ').trim()
}

function parseFigureEnv(
  lines: string[],
  start: number
): { blocks: BlockNode[]; nextIndex: number } {
  let caption: string | null = null
  let imageUrl: string | null = null
  let i = start + 1
  const endTag = lines[start].trim().includes('figure*}') ? '\\end{figure*}' : '\\end{figure}'
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed.startsWith(endTag)) {
      i++
      break
    }
    const cap = extractCaption(trimmed)
    if (cap) caption = cap
    const path = extractIncludegraphicsPath(trimmed)
    if (path) imageUrl = path
    i++
  }
  const blocks: BlockNode[] = []
  if (imageUrl) {
    blocks.push({
      type: 'paragraph',
      children: [{ type: 'image', url: imageUrl, alt: caption ?? undefined }]
    })
  }
  return { blocks, nextIndex: i }
}

/** \begin{center}...\end{center}: extract all \includegraphics{path} and emit image paragraphs (no caption). */
function parseCenterEnv(lines: string[], start: number): { blocks: BlockNode[]; nextIndex: number } {
  const innerResult = parseGenericEnv(lines, start, 'center')
  const inner = innerResult.inner
  const blocks: BlockNode[] = []
  const incRe = /\\includegraphics(?:\[[^\]]*\])?\{([^{}]+)\}/g
  let m: RegExpExecArray | null
  while ((m = incRe.exec(inner)) !== null) {
    const url = m[1].trim()
    blocks.push({
      type: 'paragraph',
      children: [{ type: 'image', url, alt: undefined }]
    })
  }
  return { blocks, nextIndex: innerResult.nextIndex }
}

/** Parse longtable/longtblr: collect rows (lines with &), skip \hline \toprule etc., build TableNode */
function parseLongTableEnv(
  lines: string[],
  start: number
): { node: TableNode; nextIndex: number } | null {
  const line = lines[start].trim()
  const isLongtblr = line.startsWith('\\begin{longtblr}')
  const endTag = isLongtblr ? '\\end{longtblr}' : '\\end{longtable}'
  const rawLines: string[] = []
  let i = start + 1
  while (i < lines.length) {
    const l = lines[i]
    const t = l.trim()
    if (t.startsWith(endTag)) {
      i++
      break
    }
    rawLines.push(l)
    i++
  }
  const skipOnlyPatterns = /^\s*\\(hline|toprule|midrule|bottomrule|endfirsthead|endhead|endfoot|endlastfoot)\s*$/
  let headerRow: string[] | null = null
  const rows: string[][] = []
  for (const raw of rawLines) {
    const trimmed = raw.trim()
    if (skipOnlyPatterns.test(trimmed)) continue
    if (/^\\caption\s*\{/.test(trimmed) && !trimmed.includes('&')) continue
    if (trimmed.includes('\\endfirsthead') && !trimmed.includes('&')) continue
    if (!trimmed.includes('&')) continue
    const row = parseTableRowLatex(trimmed)
    if (row.length === 0) continue
    if (headerRow === null && rows.length === 0) headerRow = row
    else rows.push(row)
  }
  if (headerRow === null) headerRow = []
  return {
    node: { type: 'table', headerRow, rows },
    nextIndex: i
  }
}

/** Strip \endfirsthead, \endhead etc. from a table row line so they don't appear in cell text */
function stripTableRowControl(line: string): string {
  return line
    .replace(/\\endfirsthead\s*/g, '')
    .replace(/\\endhead\s*/g, '')
    .replace(/\\endfoot\s*/g, '')
    .replace(/\\endlastfoot\s*/g, '')
    .trim()
}

/** Extract inner content of \begin{tabular}[pos]{cols}...\end{tabular} (cols may have nested {} e.g. @{}l@{}). */
function extractOneTabular(s: string): string | null {
  const idx = s.indexOf('\\begin{tabular}')
  if (idx === -1) return null
  let pos = idx + '\\begin{tabular}'.length
  const rest = s.slice(pos)
  const optBracket = rest.match(/^\s*\[[^\]]*\]/)?.[0] ?? ''
  pos += optBracket.length
  const braceStart = s.indexOf('{', pos)
  if (braceStart === -1) return null
  const colSpec = extractBraced(s, braceStart)
  if (!colSpec) return null
  const endTag = '\\end{tabular}'
  const endIdx = s.indexOf(endTag, colSpec.end)
  if (endIdx === -1) return null
  const inner = s.slice(colSpec.end, endIdx).trim()
  return inner
}

/** Replace one \begin{tabular}...\end{tabular} with its inner content (processed). */
function replaceOneTabular(s: string): string {
  const inner = extractOneTabular(s)
  if (inner === null) return s
  const idx = s.indexOf('\\begin{tabular}')
  const endTag = '\\end{tabular}'
  const endIdx = s.indexOf(endTag, idx)
  if (endIdx === -1) return s
  const repl = cellContentToMarkdown(inner) || ' '
  return s.slice(0, idx) + repl + s.slice(endIdx + endTag.length)
}

/** Normalize LaTeX table cell: \\ → space, \_ → _, subscript-like G\_pes → G_pes or $G_{pes}$. */
function normalizeTableCellLatex(t: string): string {
  let s = t
  s = s.replace(/\\\\/g, ' ')
  s = s.replace(/\\_/g, '_')
  s = s.replace(/\\~/g, ' ')
  return s
}

/** Convert LaTeX cell content to markdown: preserve \( ... \) and $ ... $ as math, strip other commands. */
function cellContentToMarkdown(cell: string): string {
  let t = cell.replace(/\\hline/g, '')
  t = stripTableRowControl(t)
  // Preserve inline math: \( ... \) → $ ... $
  t = t.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => '$' + math.trim() + '$')
  // Preserve $ ... $ (single $) - already markdown math
  t = t.replace(/\$([^$]+)\$/g, (_, math) => '$' + math.trim() + '$')
  // Extract \begin{tabular}...\end{tabular} (column spec can have nested {}) and replace with inner content
  while (/\\begin\{tabular\}/.test(t)) {
    const next = replaceOneTabular(t)
    if (next === t) break
    t = next
  }
  // \multicolumn with nested braces: \multicolumn{1}{m{4cm}}{\centering Symbol}
  while (/\\multicolumn\s*\{/.test(t)) {
    const next = replaceOneMulticolumn(t)
    if (next === t) break
    t = next
  }
  t = stripLatexForPlainText(t)
  // Unwrap single top-level { ... } (e.g. longtblr cells like {Whether the country...})
  const trimmed = t.trim()
  if (trimmed.startsWith('{')) {
    const b = extractBraced(trimmed, 0)
    if (b && b.end === trimmed.length) t = b.content
  }
  t = normalizeTableCellLatex(t)
  return t.replace(/\s+/g, ' ').trim()
}

/** Parse one LaTeX table row: split by &, clean cell content; preserve math as $...$ */
function parseTableRowLatex(line: string): string[] {
  const parts: string[] = []
  let rest = stripTableRowControl(line.replace(/\\\\\s*$/, '').trim())
  const andSplits = splitByUnescaped(rest, '&')
  for (const seg of andSplits) {
    const cell = cellContentToMarkdown(seg.trim())
    parts.push(cell)
  }
  return parts
}

function splitByUnescaped(str: string, char: string): string[] {
  const out: string[] = []
  let start = 0
  for (let i = 0; i < str.length; i++) {
    if (str[i] === char && (i === 0 || str[i - 1] !== '\\')) {
      out.push(str.slice(start, i))
      start = i + 1
    }
  }
  out.push(str.slice(start))
  return out
}

/**
 * Parse a single line of LaTeX into inline nodes.
 * Handles \textbf{}, \textit{}, \texttt{}, \href{url}{text}, \includegraphics{}, $...$
 */
function parseInlineLatex(line: string): InlineNode[] {
  const out: InlineNode[] = []
  let i = 0

  while (i < line.length) {
    // \textbackslash → single backslash character (for \ in output)
    if (line.slice(i).startsWith('\\textbackslash')) {
      out.push({ type: 'text', value: '\\' })
      i += '\\textbackslash'.length
      continue
    }

    // \verb<delim>...<delim> → verbatim text (e.g. \verb|\| → backslash)
    if (line.slice(i).startsWith('\\verb')) {
      const verbStart = i + 5
      if (verbStart < line.length) {
        const delim = line[verbStart]
        const endIdx = line.indexOf(delim, verbStart + 1)
        if (endIdx !== -1) {
          const verbContent = line.slice(verbStart + 1, endIdx)
          out.push({ type: 'text', value: verbContent })
          i = endIdx + 1
          continue
        }
      }
    }

    // Inline math \( ... \)
    if (line.slice(i).startsWith('\\(')) {
      const end = line.indexOf('\\)', i + 2)
      if (end !== -1) {
        out.push({ type: 'math_inline', content: line.slice(i + 2, end).trim() })
        i = end + 2
        continue
      }
    }

    // Inline math $ ... $
    if (line[i] === '$' && i + 1 < line.length && line[i + 1] !== '$') {
      const end = line.indexOf('$', i + 1)
      if (end !== -1) {
        out.push({ type: 'math_inline', content: line.slice(i + 1, end).trim() })
        i = end + 1
        continue
      }
    }

    // \textbf{...} — trim content so "** word **" becomes "**word**"
    if (line.slice(i).startsWith('\\textbf{')) {
      const open = line.indexOf('{', i)
      const content = extractBraced(line, open)
      if (content) {
        const trimmed = content.content.trim()
        out.push({ type: 'strong', children: parseInlineLatex(trimmed) })
        i = content.end
        continue
      }
    }

    // \textit{...} or \emph{...} — trim content for correct *word* spacing
    if (line.slice(i).startsWith('\\textit{') || line.slice(i).startsWith('\\emph{')) {
      const open = line.indexOf('{', i)
      const content = extractBraced(line, open)
      if (content) {
        const trimmed = content.content.trim()
        out.push({ type: 'emphasis', children: parseInlineLatex(trimmed) })
        i = content.end
        continue
      }
    }

    // \texttt{...} — parse inner so \textbackslash etc. resolve; then collapse to literal string
    if (line.slice(i).startsWith('\\texttt{')) {
      const open = line.indexOf('{', i)
      const content = extractBraced(line, open)
      if (content) {
        const innerNodes = parseInlineLatex(content.content)
        const literal = innerNodes
          .map((n) => (n.type === 'text' ? n.value : n.type === 'unknown_inline' ? n.raw : ''))
          .join('')
        out.push({ type: 'inline_code', value: literal })
        i = content.end
        continue
      }
    }

    // \sout{...} (strikethrough, ulem package)
    if (line.slice(i).startsWith('\\sout{')) {
      const open = line.indexOf('{', i)
      const content = extractBraced(line, open)
      if (content) {
        out.push({ type: 'strikethrough', children: parseInlineLatex(content.content) })
        i = content.end
        continue
      }
    }

    // \textasciitilde{}\textasciitilde{}...\textasciitilde{}\textasciitilde{} (old escaped ~~) → strikethrough
    if (line.slice(i).startsWith('\\textasciitilde{}\\textasciitilde{}')) {
      const prefix = '\\textasciitilde{}\\textasciitilde{}'
      let pos = i + prefix.length
      const innerStart = pos
      const closePattern = '\\textasciitilde{}\\textasciitilde{}'
      const closeIdx = line.indexOf(closePattern, pos)
      if (closeIdx !== -1) {
        const inner = line.slice(innerStart, closeIdx)
        out.push({ type: 'strikethrough', children: parseInlineLatex(inner) })
        i = closeIdx + closePattern.length
        continue
      }
    }

    // \href{url}{text}
    const hrefRe = /\\href\{([^{}]+)\}\{/
    const hrefMatch = line.slice(i).match(hrefRe)
    if (hrefMatch && line.slice(i).startsWith('\\href{')) {
      const url = hrefMatch[1]
      const openBrace = i + hrefMatch[0].length - 1
      const content = extractBraced(line, openBrace)
      if (content) {
        out.push({ type: 'link', url, children: parseInlineLatex(content.content) })
        i = content.end
        continue
      }
    }

    // \includegraphics[...]{path}
    const incRe = /\\includegraphics(?:\[[^\]]*\])?\{([^{}]+)\}/
    const incMatch = line.slice(i).match(incRe)
    if (incMatch) {
      out.push({ type: 'image', url: incMatch[1] })
      i += incMatch[0].length
      continue
    }

    // Skip known control commands (no visible output)
    if (/^\\(noindent|centering|raggedright|raggedleft|smallskip|bigskip|newline)\b/.test(line.slice(i))) {
      const skip = line.slice(i).match(/^\\[a-zA-Z]+\*?(\[[^\]]*\])?/)?.[0]?.length ?? 0
      if (skip > 0) {
        i += skip
        continue
      }
    }

    // Escaped char \# \% etc.
    if (line[i] === '\\' && i + 1 < line.length) {
      const next = line[i + 1]
      if (/[#%&_{}$]/.test(next)) {
        out.push({ type: 'text', value: next })
        i += 2
        continue
      }
    }

    // \ref{...} → placeholder (no cross-ref resolution)
    if (line.slice(i).startsWith('\\ref{')) {
      const open = line.indexOf('{', i)
      const braced = extractBraced(line, open)
      if (braced) {
        out.push({ type: 'text', value: '[ref]' })
        i = braced.end
        continue
      }
    }

    // \cite{...} → link to #ref-{key} with text [key] (for bibliography jump)
    if (line.slice(i).startsWith('\\cite{')) {
      const open = line.indexOf('{', i)
      const braced = extractBraced(line, open)
      if (braced) {
        const key = braced.content.split(',')[0].trim()
        out.push({ type: 'link', url: '#ref-' + key, children: [{ type: 'text', value: '[' + key + ']' }] })
        i = braced.end
        continue
      }
    }

    // Unknown LaTeX command: fallback as raw (e.g. custom macros)
    if (line[i] === '\\' && i + 1 < line.length) {
      const nameMatch = line.slice(i).match(/^\\([a-zA-Z@]+)\*?(\[[^\]]*\])?/)
      if (nameMatch) {
        let len = nameMatch[0].length
        const restIdx = i + len
        if (restIdx < line.length && line[restIdx] === '{') {
          const braced = extractBraced(line, restIdx)
          if (braced) {
            len = braced.end - i
          }
        }
        out.push({ type: 'unknown_inline', raw: line.slice(i, i + len) })
        i += len
        continue
      }
    }

    // Plain text: stop at next \command, \(, or \)
    const rest = line.slice(i)
    const nextLetter = rest.search(/\\[a-zA-Z@]+/)
    const nextOpenMath = rest.indexOf('\\(')
    const nextCloseMath = rest.indexOf('\\)')
    let end = line.length
    if (nextLetter !== -1) end = Math.min(end, i + nextLetter)
    if (nextOpenMath !== -1) end = Math.min(end, i + nextOpenMath)
    if (nextCloseMath !== -1) end = Math.min(end, i + nextCloseMath)
    if (end > i) {
      const raw = line.slice(i, end)
      const unescaped = raw.replace(/\\([#%&_{}$])/g, '$1')
      if (unescaped.length > 0) {
        out.push({ type: 'text', value: unescaped })
      }
      i = end
    } else {
      i++
    }
  }

  return out
}
