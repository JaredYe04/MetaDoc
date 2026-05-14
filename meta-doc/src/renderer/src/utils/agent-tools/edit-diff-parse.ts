/**
 * Unified diff 解析（无 UI/store 依赖，便于单测与复用）
 */

export type HunkDisplayLineType = 'context' | 'remove' | 'add'

export interface HunkDisplayLine {
  type: HunkDisplayLineType
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
  /** 与正文顺序一致，供 git apply 校验与旧/新侧行抽取 */
  displayLines: HunkDisplayLine[]
}

/**
 * 将 diff 的 newLines 转为实际要插入的字符串。
 * 单独一行的 "+" 表示插入空行，parse 后为 [""]，join('\n') 得 ""，需显式转为 "\n"。
 */
export function newLinesToContent(newLines: string[]): string {
  return newLines.length === 1 && newLines[0] === '' ? '\n' : newLines.join('\n')
}

/** 按 hunk 正文顺序遍历「旧侧/新侧」语义行（上下文 / 删 / 增） */
export function normalizeHunkDisplayLines(hunk: UnifiedDiffHunk): HunkDisplayLine[] {
  if (hunk.displayLines.length > 0) {
    return hunk.displayLines
  }
  return [
    ...hunk.contextLines.map((text) => ({ type: 'context' as const, text })),
    ...hunk.oldLines.map((text) => ({ type: 'remove' as const, text })),
    ...hunk.newLines.map((text) => ({ type: 'add' as const, text }))
  ]
}

/**
 * 解析 Unified diff 格式字符串
 */
export function parseUnifiedDiff(diff: string): UnifiedDiffHunk[] {
  if (!diff || !diff.trim()) {
    throw new Error('Diff 字符串不能为空')
  }

  // 去掉末尾空白，避免 split 产生多余 "" 被误判为上下文行（如 @@ hunk 后仅 -a / +a）
  const lines = diff.trimEnd().split(/\r?\n/)
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
      // Git 常写 @@ -0,0 +1,N @@；省略 ,0 时 @@ -0 +1,N @@ 表示旧侧 0 行（纯插入），不能默认成 1
      const oldCount = hunkHeaderMatch[2]
        ? parseInt(hunkHeaderMatch[2], 10)
        : oldStart === 0
          ? 0
          : 1
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
        displayLines: []
      }
      i++
      continue
    }

    if (!currentHunk) {
      i++
      continue
    }

    if (line.startsWith('\\')) {
      // \ No newline at end of file
      i++
      continue
    }

    const pureInsert = currentHunk.oldCount === 0

    if (pureInsert) {
      // 纯插入：行首「-」常为 Markdown 列表等正文，不是 unified 的删除标记
      if (line.startsWith('+')) {
        const text = line.substring(1)
        currentHunk.newLines.push(text)
        currentHunk.displayLines.push({ type: 'add', text })
      } else if (line.startsWith('-')) {
        currentHunk.newLines.push(line)
        currentHunk.displayLines.push({ type: 'add', text: line })
      } else if (line.length >= 1 && line[0] === ' ') {
        const text = line.length > 1 ? line.slice(1) : ''
        currentHunk.newLines.push(text)
        currentHunk.displayLines.push({ type: 'add', text })
      } else {
        currentHunk.newLines.push(line)
        currentHunk.displayLines.push({ type: 'add', text: line })
      }
      i++
      continue
    }

    if (line.startsWith('-')) {
      const text = line.substring(1)
      currentHunk.oldLines.push(text)
      currentHunk.displayLines.push({ type: 'remove', text })
    } else if (line.startsWith('+')) {
      const text = line.substring(1)
      currentHunk.newLines.push(text)
      currentHunk.displayLines.push({ type: 'add', text })
    } else if (line.length >= 1 && line[0] === ' ') {
      const text = line.length > 1 ? line.slice(1) : ''
      currentHunk.contextLines.push(text)
      currentHunk.displayLines.push({ type: 'context', text })
    } else {
      currentHunk.contextLines.push(line)
      currentHunk.displayLines.push({ type: 'context', text: line })
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
