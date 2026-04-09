/**
 * Unified diff 解析（无 UI/store 依赖，便于单测与复用）
 */

export interface HunkDisplayLine {
  type: 'context' | 'remove' | 'add'
  text: string
}

export interface UnifiedDiffHunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  oldLines: string[]
  newLines: string[]
  contextLines: string[]
  /** 解析时保留的原始行顺序 */
  _displayLines: HunkDisplayLine[]
}

/**
 * 返回 hunk 内各行按原始 diff 顺序排列的 display lines。
 */
export function normalizeHunkDisplayLines(hunk: UnifiedDiffHunk): HunkDisplayLine[] {
  return hunk._displayLines
}

/**
 * 将 diff 的 newLines 转为实际要插入的字符串。
 * 单独一行的 "+" 表示插入空行，parse 后为 [""]，join('\n') 得 ""，需显式转为 "\n"。
 */
export function newLinesToContent(newLines: string[]): string {
  return newLines.length === 1 && newLines[0] === '' ? '\n' : newLines.join('\n')
}

/**
 * 解析 Unified diff 格式字符串
 */
export function parseUnifiedDiff(diff: string): UnifiedDiffHunk[] {
  if (!diff || !diff.trim()) {
    throw new Error('Diff 字符串不能为空')
  }

  const rawLines = diff.split(/\r?\n/)
  // 去除尾部空行（由 diff 字符串末尾换行产生，不属于 hunk 内容）
  while (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
    rawLines.pop()
  }
  const lines = rawLines
  const hunks: UnifiedDiffHunk[] = []
  let currentHunk: UnifiedDiffHunk | null = null
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    const hunkHeaderMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/)
    if (hunkHeaderMatch) {
      if (currentHunk) {
        hunks.push(currentHunk)
      }

      const oldStart = parseInt(hunkHeaderMatch[1], 10)
      const oldCount = hunkHeaderMatch[2] ? parseInt(hunkHeaderMatch[2], 10) : oldStart === 0 ? 0 : 1
      const newStart = parseInt(hunkHeaderMatch[3], 10)
      const newCount = hunkHeaderMatch[4] ? parseInt(hunkHeaderMatch[4], 10) : 1

      currentHunk = {
        oldStart,
        oldCount,
        newStart,
        newCount,
        oldLines: [],
        newLines: [],
        contextLines: [],
        _displayLines: []
      }
      i++
      continue
    }

    if (!currentHunk) {
      i++
      continue
    }

    if (line.startsWith('-') && currentHunk.oldCount > 0) {
      const text = line.substring(1)
      currentHunk.oldLines.push(text)
      currentHunk._displayLines.push({ type: 'remove', text })
    } else if (line.startsWith('+')) {
      const text = line.substring(1)
      currentHunk.newLines.push(text)
      currentHunk._displayLines.push({ type: 'add', text })
    } else if (line.startsWith('\\')) {
      // \ No newline at end of file
    } else if (line.length >= 1 && line[0] === ' ') {
      const text = line.length > 1 ? line.slice(1) : ''
      currentHunk.contextLines.push(text)
      currentHunk._displayLines.push({ type: 'context', text })
    } else {
      if (currentHunk.oldCount === 0) {
        currentHunk.newLines.push(line)
        currentHunk._displayLines.push({ type: 'add', text: line })
      } else {
        currentHunk.contextLines.push(line)
        currentHunk._displayLines.push({ type: 'context', text: line })
      }
    }

    i++
  }

  if (currentHunk) {
    hunks.push(currentHunk)
  }

  if (hunks.length === 0) {
    throw new Error('未找到有效的 diff hunk')
  }

  return hunks
}
