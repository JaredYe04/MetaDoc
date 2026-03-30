/**
 * Git unified diff 纯逻辑应用（无 Electron/Vue），供 Vitest、MCP 调试与回归与 edit-tool 行为对齐。
 *
 * 行号语义与 Git 一致：@@ -oldStart,oldCount 中 oldStart 为本 hunk 在**应用本补丁前**的旧文件里，
 * 第一行「旧侧」内容（空格上下文或 - 删除行）的 1-based 行号；oldCount = 该 hunk 在旧文件中覆盖的行数。
 * 正文里「旧侧」行数必须等于 oldCount，否则多为模型写错 @@ 数字，会先报清晰校验错误而非误导性的 mismatch。
 */
import {
  parseUnifiedDiff,
  newLinesToContent,
  normalizeHunkDisplayLines,
  type UnifiedDiffHunk
} from './edit-diff-parse'

function getOldSideLines(hunk: UnifiedDiffHunk): string[] {
  const out: string[] = []
  for (const dl of normalizeHunkDisplayLines(hunk)) {
    if (dl.type === 'context' || dl.type === 'remove') out.push(dl.text)
  }
  return out
}

function getNewSideLines(hunk: UnifiedDiffHunk): string[] {
  const out: string[] = []
  for (const dl of normalizeHunkDisplayLines(hunk)) {
    if (dl.type === 'context' || dl.type === 'add') out.push(dl.text)
  }
  return out
}

function stripUtf8Bom(s: string): string {
  return s.length > 0 && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

/** 按换行分段；与 Git/Node 常见行为一致（末尾 \\n 会产生最后的空字符串段，即多一行「空行」） */
export function splitLinesForDiffApply(content: string): string[] {
  return content.split(/\r?\n/)
}

/**
 * 校验 hunk 头中的 oldCount/newCount 与正文旧侧/新侧行数一致（模型常见错误）。
 */
export function assertHunkHeaderMatchesBody(hunk: UnifiedDiffHunk): void {
  const oldSide = getOldSideLines(hunk)
  const newSide = getNewSideLines(hunk)
  const head = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`

  if (hunk.oldCount === 0) {
    if (oldSide.length !== 0) {
      throw new Error(
        `${head}：标为纯插入(oldCount=0)，但正文仍解析出 ${oldSide.length} 行旧侧内容。请检查是否误用「-」或未使用 @@ -0,0 +1,N @@。`
      )
    }
  } else if (oldSide.length !== hunk.oldCount) {
    throw new Error(
      `${head}：正文「旧侧」共 ${oldSide.length} 行（单空格上下文 + 删除行），与头中 oldCount=${hunk.oldCount} 不一致。请修改 @@ 行使 oldCount 等于旧侧行数；oldStart 必须等于本 hunk 第一行旧侧内容在文件中的 1-based 行号。`
    )
  }

  if (newSide.length !== hunk.newCount) {
    throw new Error(
      `${head}：正文「新侧」共 ${newSide.length} 行，与头中 newCount=${hunk.newCount} 不一致。请修改 @@ 行使 newCount 与 + 行及空格上下文行总数一致。`
    )
  }
}

function formatNeighborLines(lines: string[], line1Based: number, radius = 2): string {
  const idx = line1Based - 1
  const lo = Math.max(0, idx - radius)
  const hi = Math.min(lines.length, idx + radius + 1)
  const out: string[] = ['邻近文件行（1-based，> 为 @@ 指明的起始行；空行显示为「(空行)」）：']
  for (let j = lo; j < hi; j++) {
    const n = j + 1
    const mark = n === line1Based ? '>' : ' '
    const raw = lines[j]
    const disp = raw === '' ? '(空行)' : raw
    out.push(`${mark} ${String(n).padStart(4)} | ${disp}`)
  }
  out.push(
    '提示：若 IDE 行号与上文不一致，请确认文件末尾换行（末尾 \\n 会令分段多一行空段），以及 @@ 的 oldStart 是否指向本 hunk 第一行旧侧内容。'
  )
  return out.join('\n')
}

export function gitNewFileContentFromHunks(hunks: UnifiedDiffHunk[]): string {
  const linesToWrite = hunks.flatMap((h) =>
    h.newLines.length > 0 ? h.newLines : h.oldCount === 0 ? h.contextLines : []
  )
  return newLinesToContent(linesToWrite)
}

/** 首行非空为 @@ -n 时视为 git unified（与 edit-tool 路由一致） */
export function looksLikeGitUnifiedDiff(diff: string): boolean {
  for (const line of diff.split(/\r?\n/)) {
    const t = line.trim()
    if (t === '') continue
    return /^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/.test(t)
  }
  return false
}

/**
 * 将 git unified diff 应用到全文（自底向上应用多 hunk，单测/MCP 用）。
 */
export function applyGitUnifiedDiffToContent(content: string, diff: string): string {
  const normalized = diff.trim()
  if (!looksLikeGitUnifiedDiff(normalized)) {
    throw new Error('Not a git unified diff')
  }
  const hadBom = content.length > 0 && content.charCodeAt(0) === 0xfeff
  const contentNoBom = stripUtf8Bom(content)
  const hunks = parseUnifiedDiff(normalized)

  for (const h of hunks) {
    assertHunkHeaderMatchesBody(h)
  }

  const empty = contentNoBom.trim() === ''
  const allPureNew = hunks.every((h) => h.oldCount === 0 && h.oldStart === 0)
  if (empty && allPureNew) {
    let out = gitNewFileContentFromHunks(hunks)
    if (hadBom) out = '\uFEFF' + out
    return out
  }

  let lines = splitLinesForDiffApply(contentNoBom)
  const sorted = [...hunks].sort((a, b) => {
    if (b.oldStart !== a.oldStart) return b.oldStart - a.oldStart
    return b.newStart - a.newStart
  })

  for (const h of sorted) {
    const newSide = getNewSideLines(h)
    const oldSide = getOldSideLines(h)

    if (h.oldCount === 0) {
      let idx = h.oldStart <= 0 ? 0 : h.oldStart - 1
      idx = Math.min(Math.max(0, idx), lines.length)
      lines = [...lines.slice(0, idx), ...newSide, ...lines.slice(idx)]
      continue
    }

    const start = h.oldStart - 1
    if (start < 0 || start > lines.length) {
      throw new Error(
        `hunk oldStart ${h.oldStart} 超出文件行范围（当前共 ${lines.length} 段，含末尾空行段）。\n${formatNeighborLines(lines, Math.min(Math.max(1, h.oldStart), Math.max(1, lines.length)))}`
      )
    }
    if (oldSide.length === 0) {
      throw new Error('oldCount>0 but no old-side lines in hunk')
    }
    const got = lines.slice(start, start + oldSide.length)
    if (got.length !== oldSide.length) {
      throw new Error(
        `在旧文件行 ${h.oldStart} 起需要 ${oldSide.length} 行，实际只剩 ${got.length} 行（文件当前共 ${lines.length} 段）。\n${formatNeighborLines(lines, h.oldStart)}`
      )
    }
    for (let i = 0; i < oldSide.length; i++) {
      if (got[i] !== oldSide[i]) {
        const fileLine = h.oldStart + i
        throw new Error(
          `旧文件第 ${fileLine} 行与 diff 不一致（hunk 内相对行 +${i}）。\n期望：${JSON.stringify(oldSide[i])}\n实际：${JSON.stringify(got[i])}\n${formatNeighborLines(lines, fileLine)}`
        )
      }
    }
    lines = [...lines.slice(0, start), ...newSide, ...lines.slice(start + oldSide.length)]
  }

  let result = lines.join('\n')
  if (hadBom) result = '\uFEFF' + result
  return result
}
