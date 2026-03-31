import { applySingleEdit } from './apply'
import { normalizeNewlines } from './normalize'
import { postProcess } from './postprocess'
import type { ApplyEditLogEntry, ApplyEditsSuccess, EditOperation } from './types'
import { EditEngineError } from './types'

/**
 * 仅顺序应用编辑（每条在上一结果上定位），不做后处理。用于 staging 按 hunk 折叠重放。
 */
export function applyEditSequenceRaw(file: string, edits: EditOperation[]): string {
  let current = normalizeNewlines(file)
  for (const edit of edits) {
    validateEdit(edit)
    current = applySingleEdit(current, edit).next
  }
  return current
}

export type {
  EditOperation,
  EditPlan,
  EditTarget,
  EditType,
  ApplyEditsSuccess,
  ApplyEditLogEntry,
  LocatedSpan,
  MatchStrategy
} from './types'
export { EditEngineError } from './types'
export { locateTarget } from './locate'
export { applySingleEdit, applyEditAtSpan } from './apply'
export { normalizeNewlines, collapseWhitespace } from './normalize'
export { postProcess } from './postprocess'

export interface ApplyEditsOptions {
  /** 调试用：匹配与片段日志 */
  onLog?: (msg: string, data?: Record<string, unknown>) => void
}

function validateEdit(edit: EditOperation): void {
  if (!edit.id || typeof edit.id !== 'string') {
    throw new EditEngineError('每条编辑必须包含字符串 id', 'INVALID_EDIT')
  }
  if (!['replace', 'insert', 'delete'].includes(edit.type)) {
    throw new EditEngineError(`非法 type: ${edit.type}`, 'INVALID_EDIT')
  }
  if (edit.target == null || typeof edit.target.anchor !== 'string') {
    throw new EditEngineError('target.anchor 必须为字符串', 'INVALID_EDIT')
  }
  const anchor = edit.target.anchor
  const cb = edit.target.context_before ?? ''
  const ca = edit.target.context_after ?? ''
  const hasCtx = cb.length > 0 || ca.length > 0

  if (anchor === '' && !hasCtx && edit.type !== 'insert') {
    throw new EditEngineError(
      '空 anchor 且无 context 时仅允许在空文件上使用 insert',
      'INVALID_EDIT'
    )
  }
  if (anchor === '' && hasCtx) {
    if (edit.type === 'replace' || edit.type === 'delete') {
      if (edit.match_scope !== 'full') {
        throw new EditEngineError(
          '空 anchor 的 replace/delete 必须使用 match_scope:"full"，以替换/删除整段 before+after 精确匹配',
          'INVALID_EDIT'
        )
      }
    }
  }
  if (edit.type === 'replace' || edit.type === 'insert') {
    if (edit.content === undefined) {
      throw new EditEngineError(`${edit.type} 必须提供 content（可为空字符串）`, 'INVALID_EDIT')
    }
  }
  if (edit.match_scope === 'full' && edit.type === 'insert') {
    throw new EditEngineError('match_scope 仅用于 replace / delete', 'INVALID_EDIT')
  }
  if (edit.insert_newline_policy != null && edit.type !== 'insert') {
    throw new EditEngineError('insert_newline_policy 仅用于 insert', 'INVALID_EDIT')
  }
}

/**
 * 流水线：规范化 → 逐条定位并应用（顺序执行，后一条在前一条结果上定位）→ 后处理
 * 任一步失败抛出 EditEngineError，不修改调用方传入的原始字符串（内部拷贝）
 */
export function applyEdits(
  file: string,
  edits: EditOperation[],
  options?: ApplyEditsOptions
): ApplyEditsSuccess {
  const log = options?.onLog
  let current = normalizeNewlines(file)
  const logs: ApplyEditLogEntry[] = []

  for (const edit of edits) {
    validateEdit(edit)
    log?.('apply: before', { editId: edit.id, type: edit.type, len: current.length })
    try {
      const { next, log: entry } = applySingleEdit(current, edit)
      current = next
      logs.push(entry)
      log?.('apply: after', {
        editId: edit.id,
        strategy: entry.strategy,
        oldSnippet: entry.oldSnippet.slice(0, 200),
        newSnippet: entry.newSnippet.slice(0, 200)
      })
    } catch (e) {
      if (e instanceof EditEngineError) throw e
      throw new EditEngineError(e instanceof Error ? e.message : String(e), 'APPLY_FAILED')
    }
  }

  current = postProcess(current)
  return { text: current, logs }
}
