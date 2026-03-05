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
  UnknownBlockNode
} from '../ast/nodes'
import { createDocument } from '../ast/nodes'

const BEGIN_DOC = '\\begin{document}'
const END_DOC = '\\end{document}'

/** Extract body between \begin{document} and \end{document}; otherwise use full input */
export function sanitizeLatexBody(latex: string): string {
  if (!latex || typeof latex !== 'string') return ''
  const normalized = latex.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const startIdx = normalized.indexOf(BEGIN_DOC)
  const endIdx = normalized.lastIndexOf(END_DOC)
  if (startIdx !== -1) {
    const bodyStart = startIdx + BEGIN_DOC.length
    const bodyEnd = endIdx !== -1 ? endIdx : undefined
    return normalized.slice(bodyStart, bodyEnd).trim()
  }
  return normalized.trim()
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

    if (trimmed.startsWith('\\item')) {
      const itemContent = trimmed.slice(5).trim()
      const children = parseInlineLatex(itemContent)
      items.push({
        type: 'list_item',
        children: [{ type: 'paragraph', children }]
      })
      i++
      continue
    }

    if (trimmed === '') {
      i++
      continue
    }

    // Continuation of previous item
    if (items.length > 0) {
      const last = items[items.length - 1]
      const lastPara = last.children[last.children.length - 1]
      if (lastPara.type === 'paragraph') {
        const extra = parseInlineLatex(trimmed)
        ;(lastPara as ParagraphNode).children.push({ type: 'text', value: ' ' }, ...extra)
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

/**
 * Parse a single line of LaTeX into inline nodes.
 * Handles \textbf{}, \textit{}, \texttt{}, \href{url}{text}, \includegraphics{}, $...$
 */
function parseInlineLatex(line: string): InlineNode[] {
  const out: InlineNode[] = []
  let i = 0

  while (i < line.length) {
    // Inline math $ ... $
    if (line[i] === '$' && i + 1 < line.length && line[i + 1] !== '$') {
      const end = line.indexOf('$', i + 1)
      if (end !== -1) {
        out.push({ type: 'math_inline', content: line.slice(i + 1, end).trim() })
        i = end + 1
        continue
      }
    }

    // \textbf{...}
    if (line.slice(i).startsWith('\\textbf{')) {
      const open = line.indexOf('{', i)
      const content = extractBraced(line, open)
      if (content) {
        out.push({ type: 'strong', children: parseInlineLatex(content.content) })
        i = content.end
        continue
      }
    }

    // \textit{...} or \emph{...}
    if (line.slice(i).startsWith('\\textit{') || line.slice(i).startsWith('\\emph{')) {
      const open = line.indexOf('{', i)
      const content = extractBraced(line, open)
      if (content) {
        out.push({ type: 'emphasis', children: parseInlineLatex(content.content) })
        i = content.end
        continue
      }
    }

    // \texttt{...}
    if (line.slice(i).startsWith('\\texttt{')) {
      const open = line.indexOf('{', i)
      const content = extractBraced(line, open)
      if (content) {
        out.push({ type: 'inline_code', value: content.content })
        i = content.end
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

    // Unknown LaTeX command: fallback as raw (e.g. \cite{}, \ref{}, \label{}, custom macros)
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

    // Plain text
    const nextCmd = line.slice(i).search(/\\[a-zA-Z@]+/)
    const end = nextCmd === -1 ? line.length : i + nextCmd
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
