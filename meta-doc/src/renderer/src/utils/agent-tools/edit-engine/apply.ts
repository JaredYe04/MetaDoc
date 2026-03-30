import { locateTarget } from './locate'
import { normalizeNewlines } from './normalize'
import type { ApplyEditLogEntry, EditOperation, LocatedSpan } from './types'
import { EditEngineError } from './types'

function effectRange(edit: EditOperation, span: LocatedSpan): { start: number; end: number } {
  const scope = edit.match_scope ?? 'anchor'
  if (edit.type === 'replace' || edit.type === 'delete') {
    if (scope === 'full') {
      return { start: span.fullStart, end: span.fullEnd }
    }
  }
  return { start: span.anchorStart, end: span.anchorEnd }
}

function insertPosition(edit: EditOperation, span: LocatedSpan): number {
  const at = edit.insert_at ?? 'after'
  if (at === 'before') {
    return span.anchorStart
  }
  return span.anchorEnd
}

/**
 * insert_at: after — 避免插在行尾与后续字符同一行粘连：
 * 1) 仅当锚段非空且锚后紧跟 \\n 时，插入点移到该换行之后（从下一行行首插）；
 *    空 anchor 的接缝（如两段 \\n 之间）不跳过，避免多吞一个换行。
 * 2) 若插入点仍不在行首（左侧不是 \\n），且 content 不以 \\n 开头，则前置 \\n；
 * 3) 若插入点右侧仍有非换行字符（同行后续内容），且 content 不以 \\n 结尾，则追加 \\n。
 */
function applyInsertAfterNewlinePolicy(
  text: string,
  pos: number,
  ins: string,
  anchorNonEmpty: boolean
): { pos: number; ins: string } {
  let p = pos
  let s = ins
  if (anchorNonEmpty && p < text.length && text[p] === '\n') {
    p += 1
  }
  if (s.length === 0) {
    return { pos: p, ins: s }
  }
  if (p > 0 && text[p - 1] !== '\n') {
    if (!s.startsWith('\n')) {
      s = `\n${s}`
    }
  }
  if (p < text.length && text[p] !== '\n') {
    if (!s.endsWith('\n')) {
      s = `${s}\n`
    }
  }
  return { pos: p, ins: s }
}

/** insert_at: before — 锚点不在行首时，避免与左侧同行粘连 */
function applyInsertBeforeNewlinePolicy(text: string, pos: number, ins: string): { pos: number; ins: string } {
  let s = ins
  if (s.length === 0) {
    return { pos, ins: s }
  }
  if (pos > 0 && text[pos - 1] !== '\n' && !s.startsWith('\n')) {
    s = `\n${s}`
  }
  return { pos, ins: s }
}

/**
 * 在已知定位下应用单条编辑（不再次 locate）
 */
export function applyEditAtSpan(
  file: string,
  edit: EditOperation,
  span: LocatedSpan
): { next: string; log: ApplyEditLogEntry } {
  const text = normalizeNewlines(file)
  const { strategy } = span

  if (edit.type === 'replace') {
    const { start, end } = effectRange(edit, span)
    const oldSnippet = text.slice(start, end)
    const ins = edit.content ?? ''
    const next = text.slice(0, start) + ins + text.slice(end)
    return {
      next,
      log: {
        editId: edit.id,
        strategy,
        anchorStart: start,
        anchorEnd: end,
        oldSnippet,
        newSnippet: ins
      }
    }
  }

  if (edit.type === 'delete') {
    const { start, end } = effectRange(edit, span)
    const oldSnippet = text.slice(start, end)
    const next = text.slice(0, start) + text.slice(end)
    return {
      next,
      log: {
        editId: edit.id,
        strategy,
        anchorStart: start,
        anchorEnd: end,
        oldSnippet,
        newSnippet: ''
      }
    }
  }

  if (edit.type === 'insert') {
    let pos = insertPosition(edit, span)
    let ins = edit.content ?? ''
    const policy = edit.insert_newline_policy ?? 'auto'
    if (policy === 'auto') {
      const at = edit.insert_at ?? 'after'
      if (at === 'after') {
        const anchorNonEmpty = span.anchorEnd > span.anchorStart
        const adj = applyInsertAfterNewlinePolicy(text, pos, ins, anchorNonEmpty)
        pos = adj.pos
        ins = adj.ins
      } else {
        const adj = applyInsertBeforeNewlinePolicy(text, pos, ins)
        ins = adj.ins
      }
    }
    const next = text.slice(0, pos) + ins + text.slice(pos)
    return {
      next,
      log: {
        editId: edit.id,
        strategy,
        anchorStart: pos,
        anchorEnd: pos,
        oldSnippet: '',
        newSnippet: ins
      }
    }
  }

  throw new EditEngineError(`未知编辑类型: ${edit.type}`, 'INVALID_EDIT')
}

export function applySingleEdit(
  file: string,
  edit: EditOperation
): { next: string; log: ApplyEditLogEntry } {
  const span = locateTarget(file, edit.target)
  return applyEditAtSpan(file, edit, span)
}
