/**
 * Agent 编辑暂存：按「毛糙」行数统计 + / -（替换一行计 +1 -1，非净行数差）
 */
import { applySingleEdit } from './agent-tools/edit-engine'
import type { EditOperation } from './agent-tools/edit-engine/types'

type StagingHunkLike = { id: string; status: 'pending' | 'accepted' | 'rejected'; operation: EditOperation }
type StagingRecordLike = { oldContent?: string; hunkOperations?: StagingHunkLike[] }

function lineCountSnippet(s: string): number {
  if (!s) return 0
  return s.split('\n').length
}

/** 单条 operation 在 baseline 上的毛糙增删行数 */
export function grossLinesForOperation(baseline: string, op: EditOperation): { added: number; removed: number } {
  try {
    const { log } = applySingleEdit(baseline, op)
    return {
      removed: lineCountSnippet(log.oldSnippet),
      added: lineCountSnippet(log.newSnippet)
    }
  } catch {
    return { added: 0, removed: 0 }
  }
}

/**
 * 当前 record 下：仅统计未拒绝 hunk 的毛糙 +/−，且每条 op 的 baseline 为「此前未拒绝 op 依次应用后」的文本。
 */
export function computeRecordPendingGrossLines(record: StagingRecordLike): { added: number; removed: number } {
  const hunks = record.hunkOperations
  if (!hunks?.length) {
    return { added: 0, removed: 0 }
  }
  let cur = record.oldContent ?? ''
  let added = 0
  let removed = 0
  for (const h of hunks) {
    const g = grossLinesForOperation(cur, h.operation)
    if (h.status !== 'rejected') {
      added += g.added
      removed += g.removed
      try {
        cur = applySingleEdit(cur, h.operation).next
      } catch {
        break
      }
    }
  }
  return { added, removed }
}

export function lineNumberAtOffset(text: string, offset: number): number {
  const o = Math.max(0, Math.min(offset, text.length))
  return text.slice(0, o).split('\n').length
}

/** 用于在「旧文本」模型中行号定位：逐条应用未拒绝 op，对 pending hunk 记录其在当前中间文本中的 effect 行范围 */
export interface HunkOrigLineRange {
  hunkId: string
  origStartLine: number
  origEndLine: number
}

export function buildPendingHunkOrigLineRanges(record: StagingRecordLike): HunkOrigLineRange[] {
  const hunks = record.hunkOperations
  if (!hunks?.length) return []
  let cur = record.oldContent ?? ''
  const out: HunkOrigLineRange[] = []
  for (const h of hunks) {
    if (h.status === 'rejected') continue
    try {
      const { next, log } = applySingleEdit(cur, h.operation)
      const startLine = lineNumberAtOffset(cur, log.anchorStart)
      const endOff = log.anchorEnd > log.anchorStart ? log.anchorEnd - 1 : log.anchorStart
      const endLine = lineNumberAtOffset(cur, endOff)
      if (h.status === 'pending') {
        out.push({
          hunkId: h.id,
          origStartLine: startLine,
          origEndLine: Math.max(startLine, endLine)
        })
      }
      cur = next
    } catch {
      break
    }
  }
  return out
}

/**
 * 与审阅 diff 左侧模型一致（仅已接受 hunk 推进文本，pending 不推进）。
 * 用于在左侧编辑器中定位 pending 块行号，与 Monaco original 文档对齐。
 */
export function buildPendingHunkDiffLeftLineRanges(record: StagingRecordLike): HunkOrigLineRange[] {
  const hunks = record.hunkOperations
  if (!hunks?.length) return []
  let cur = record.oldContent ?? ''
  const out: HunkOrigLineRange[] = []
  for (const h of hunks) {
    if (h.status === 'rejected') continue
    if (h.status === 'pending') {
      try {
        const { log } = applySingleEdit(cur, h.operation)
        const startLine = lineNumberAtOffset(cur, log.anchorStart)
        const endOff = log.anchorEnd > log.anchorStart ? log.anchorEnd - 1 : log.anchorStart
        const endLine = lineNumberAtOffset(cur, endOff)
        out.push({
          hunkId: h.id,
          origStartLine: startLine,
          origEndLine: Math.max(startLine, endLine)
        })
      } catch {
        break
      }
      continue
    }
    if (h.status === 'accepted') {
      try {
        cur = applySingleEdit(cur, h.operation).next
      } catch {
        break
      }
    }
  }
  return out
}

/** 无 hunk 时：按行 LCS 统计毛糙增删（非净差） */
export function grossLineDiffLineArrays(oldLines: string[], newLines: string[]): { added: number; removed: number } {
  const n = oldLines.length
  const m = newLines.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
      }
    }
  }
  let added = 0
  let removed = 0
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      added++
      j--
    } else {
      removed++
      i--
    }
  }
  return { added, removed }
}

export function grossLineDiffWholeFile(oldText: string, newText: string): { added: number; removed: number } {
  const a = oldText === '' ? [] : oldText.split('\n')
  const b = newText === '' ? [] : newText.split('\n')
  return grossLineDiffLineArrays(a, b)
}
