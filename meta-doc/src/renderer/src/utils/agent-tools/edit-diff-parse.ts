/**
 * Unified diff 解析（无 UI/store 依赖，便于单测与复用）
 */

export interface UnifiedDiffHunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  oldLines: string[]
  newLines: string[]
  contextLines: string[]
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

  const lines = diff.split(/\r?\n/)
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
      const oldCount = hunkHeaderMatch[2] ? parseInt(hunkHeaderMatch[2], 10) : 1
      const newStart = parseInt(hunkHeaderMatch[3], 10)
      const newCount = hunkHeaderMatch[4] ? parseInt(hunkHeaderMatch[4], 10) : 1

      currentHunk = {
        oldStart,
        oldCount,
        newStart,
        newCount,
        oldLines: [],
        newLines: [],
        contextLines: []
      }
      i++
      continue
    }

    if (!currentHunk) {
      i++
      continue
    }

    if (line.startsWith('-')) {
      currentHunk.oldLines.push(line.substring(1))
    } else if (line.startsWith('+')) {
      currentHunk.newLines.push(line.substring(1))
    } else if (line.startsWith('\\')) {
      // \ No newline at end of file
    } else if (line.length >= 1 && line[0] === ' ') {
      currentHunk.contextLines.push(line.length > 1 ? line.slice(1) : '')
    } else {
      if (currentHunk.oldCount === 0) {
        currentHunk.newLines.push(line)
      } else {
        currentHunk.contextLines.push(line)
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
