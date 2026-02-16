/**
 * AIGC 检测 - 段落预处理（规则/算法划分，不依赖 AI）
 * 默认策略：目标 5–15 段，先按字符数粗略均分，再把每个分隔点偏移到最近的「行尾」。
 * 可选策略：format 为 md/tex 时按标题/section 划分（段数不保证 5–15）。
 */

/** 单段落最少字符数（plain 合并过短段时用） */
export const MIN_PARAGRAPH_CHARS = 60

/** 默认目标段数范围 */
export const DEFAULT_MIN_SEGMENTS = 5
export const DEFAULT_MAX_SEGMENTS = 15

/** 粗略均分时每段目标字符数（用于计算段数） */
const TARGET_CHARS_PER_SEGMENT = 400

/** 句末标点（中英文），用于粗糙的“句子”计数 */
const SENTENCE_END_RE = /[。！？.!?]+/

export type ContentFormat = 'md' | 'tex' | 'plain'

export interface PreprocessOptions {
  format?: ContentFormat
  minChars?: number
  /** 与 maxSegments 同时指定时，使用「粗略均分 + 行尾对齐」策略，目标段数落在此区间 */
  minSegments?: number
  maxSegments?: number
}

/**
 * 粗略均分 + 行尾对齐：目标段数在 [minSegments, maxSegments]，先按字符数均分，
 * 再把每个分隔点偏移到最近的「某行结尾」（即下一个 \n 之后），保证不截断行。
 */
function splitByRoughlyEqualWithLineBoundaries(
  text: string,
  minSegments: number = DEFAULT_MIN_SEGMENTS,
  maxSegments: number = DEFAULT_MAX_SEGMENTS
): string[] {
  const trimmed = (text || '').trim()
  if (!trimmed) return []
  const len = trimmed.length
  if (len === 0) return []

  // 可分割位置 = 每行开头（0 以及每个 \n 的下一个字符）
  const boundaries: number[] = [0]
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '\n') boundaries.push(i + 1)
  }
  boundaries.push(trimmed.length)

  if (boundaries.length <= 2) return [trimmed] // 没有换行或只有一行，整段返回

  // 目标段数 N：按长度估算，限制在 [minSegments, maxSegments]
  let n = Math.round(len / TARGET_CHARS_PER_SEGMENT)
  n = Math.max(minSegments, Math.min(maxSegments, n))
  n = Math.min(n, boundaries.length - 1) // 段数不能超过“行数”

  if (n <= 1) return [trimmed]

  // 粗略分隔位置（字符下标）
  const roughPositions: number[] = []
  for (let k = 1; k < n; k++) {
    roughPositions.push(Math.floor((k * len) / n))
  }

  // 每个粗略位置对齐到最近的「行尾」：在上一分界之后的 boundaries 里找离 rough 最近的
  const chosen: number[] = [0]
  for (const rough of roughPositions) {
    const last = chosen[chosen.length - 1]
    let best: number | null = null
    let bestDist = Infinity
    for (let j = 0; j < boundaries.length; j++) {
      const b = boundaries[j]
      if (b <= last) continue
      if (b >= trimmed.length) break
      const d = Math.abs(b - rough)
      if (d < bestDist) {
        bestDist = d
        best = b
      }
    }
    if (best != null && best > last) chosen.push(best)
  }
  chosen.push(trimmed.length)

  const segments: string[] = []
  for (let i = 0; i < chosen.length - 1; i++) {
    const s = trimmed.slice(chosen[i], chosen[i + 1]).trim()
    if (s) segments.push(s)
  }
  return segments.length ? segments : [trimmed]
}

/** ATX 标题：行首 1–6 个 # 后接空格再内容 */
const ATX_HEADING_RE = /^#{1,6}\s+.+$/
/** Setext 下划线：仅 === 或 --- 行 */
const SETEXT_UNDERLINE_RE = /^(\s*=+|\s*-+)\s*$/

function isAtxHeading(line: string): boolean {
  return ATX_HEADING_RE.test(line.trim())
}

function isSetextUnderline(line: string): boolean {
  return SETEXT_UNDERLINE_RE.test(line)
}

/**
 * Markdown 分段：每段 = 一个标题（含 Setext 时的下一行下划线）+ 后续内容直到下一个标题
 * 不单独把标题算作一段。
 */
function splitMarkdownByHeadings(text: string): string[] {
  const trimmed = (text || '').trim()
  if (!trimmed) return []
  const lines = trimmed.split(/\n/)
  const segments: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const lineTrim = line.trim()

    // 当前行是 ATX 标题 -> 这一段从该行开始，直到下一标题（不含）
    if (isAtxHeading(lineTrim)) {
      const start = i
      i += 1
      while (i < lines.length && !isAtxHeading(lines[i].trim())) {
        // Setext：若上一行非空且当前行是 === / ---，算作标题的一部分，再往后才是正文
        const prev = lines[i - 1].trim()
        if (prev && isSetextUnderline(lines[i])) {
          i += 1
          break
        }
        i += 1
      }
      const block = lines.slice(start, i).join('\n').trim()
      if (block) segments.push(block)
      continue
    }

    // Setext：上一行非空，当前行为 === / ---，则上一行是标题，这一段到下一个标题为止
    if (i > 0 && lines[i - 1].trim() && isSetextUnderline(line)) {
      const start = i - 1
      i += 1
      while (i < lines.length && !isAtxHeading(lines[i].trim())) {
        const prev = lines[i - 1].trim()
        if (prev && isSetextUnderline(lines[i])) {
          i += 1
          break
        }
        i += 1
      }
      const block = lines.slice(start, i).join('\n').trim()
      if (block) segments.push(block)
      continue
    }

    // 无标题的头部内容：直到第一个 ATX 或 Setext 标题；若遇到 Setext 不单独成段，交给下一分支处理
    const start = i
    let brokeOnSetext = false
    while (i < lines.length && !isAtxHeading(lines[i].trim())) {
      const cur = lines[i]
      if (i > 0 && lines[i - 1].trim() && isSetextUnderline(cur)) {
        brokeOnSetext = true
        break
      }
      i += 1
    }
    if (!brokeOnSetext) {
      const block = lines.slice(start, i).join('\n').trim()
      if (block) segments.push(block)
    }
  }

  return segments
}

/** LaTeX \section{...} 或 \subsection{...}（含 * 变体），用于分段 */
const LATEX_SECTION_RE = /^\s*\\(?:subsection|section)\*?\s*(?:\{[^}]*\}|\[[^\]]*\]\s*\{[^}]*\})/i

/**
 * LaTeX 分段：以 \subsection 为主单位，无 subsection 时以 \section 为单位；
 * 每段从 \subsection 或 \section 起到下一个同级或更高级命令前（不含）。
 */
function splitLatexBySections(text: string): string[] {
  const trimmed = (text || '').trim()
  if (!trimmed) return []
  const segments: string[] = []
  // 按行找所有 \section 和 \subsection 的起始位置（行号）
  const lines = trimmed.split(/\n/)
  const sectionStarts: number[] = []
  for (let idx = 0; idx < lines.length; idx++) {
    if (LATEX_SECTION_RE.test(lines[idx])) {
      sectionStarts.push(idx)
    }
  }
  if (sectionStarts.length === 0) {
    return trimmed ? [trimmed] : []
  }
  for (let k = 0; k < sectionStarts.length; k++) {
    const start = sectionStarts[k]
    const end = k + 1 < sectionStarts.length ? sectionStarts[k + 1] : lines.length
    const block = lines.slice(start, end).join('\n').trim()
    if (block) segments.push(block)
  }
  return segments
}

/**
 * 按双换行拆分，过滤空块（plain 格式用）
 */
function splitByDoubleNewline(text: string): string[] {
  const trimmed = (text || '').trim()
  if (!trimmed) return []
  return trimmed
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * 判断段落是否过短（字符数或“句子”数过少）
 */
function isTooShort(paragraph: string, minChars: number = MIN_PARAGRAPH_CHARS): boolean {
  if (!paragraph || paragraph.length >= minChars) return false
  const sentences = paragraph.split(SENTENCE_END_RE).filter((s) => s.trim().length > 0)
  return sentences.length < 2
}

/**
 * 对 plain 块做合并过短段
 */
function mergeShortPlainBlocks(blocks: string[], minChars: number): string[] {
  if (blocks.length === 0) return []
  if (blocks.length === 1) return blocks[0] ? [blocks[0]] : []

  const result: string[] = []
  let i = 0

  while (i < blocks.length) {
    let current = blocks[i]
    let j = i + 1

    while (isTooShort(current, minChars) && j < blocks.length) {
      current = current + '\n\n' + blocks[j]
      j++
    }

    if (isTooShort(current, minChars) && result.length > 0) {
      result[result.length - 1] = result[result.length - 1] + '\n\n' + current
    } else {
      result.push(current)
    }
    i = j
  }

  return result
}

/**
 * 预处理：划分段落。
 * 当同时传入 minSegments、maxSegments 时，采用「粗略均分 + 行尾对齐」，目标 5–15 段；
 * 否则按 format 用 md/tex/plain 的语义划分（段数不保证 5–15）。
 */
export function preprocessParagraphs(
  rawText: string,
  optionsOrMinChars?: PreprocessOptions | number
): string[] {
  const opts: PreprocessOptions =
    typeof optionsOrMinChars === 'object' && optionsOrMinChars != null
      ? optionsOrMinChars
      : { minChars: optionsOrMinChars as number | undefined }
  const minSeg = opts.minSegments ?? DEFAULT_MIN_SEGMENTS
  const maxSeg = opts.maxSegments ?? DEFAULT_MAX_SEGMENTS
  const useEqualSplit = opts.minSegments != null && opts.maxSegments != null

  if (useEqualSplit) {
    return splitByRoughlyEqualWithLineBoundaries(rawText, minSeg, maxSeg)
  }

  const format = opts.format ?? 'plain'
  const minChars = opts.minChars ?? MIN_PARAGRAPH_CHARS
  if (format === 'md') return splitMarkdownByHeadings(rawText)
  if (format === 'tex') return splitLatexBySections(rawText)
  const blocks = splitByDoubleNewline(rawText)
  return mergeShortPlainBlocks(blocks, minChars)
}
