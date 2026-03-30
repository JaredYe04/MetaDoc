/**
 * Edit Engine V2 — 规划层输出的编辑意图（不含行号）
 */

export type EditType = 'replace' | 'insert' | 'delete'

export interface EditTarget {
  anchor: string
  context_before?: string
  context_after?: string
}

/** LLM / 工具入参中的单条编辑 */
export interface EditOperation {
  id: string
  type: EditType
  target: EditTarget
  content?: string
  /**
   * insert：在定位到的锚段之前或之后插入（默认 after）。
   * 在文件首行之前插入可用 insert_at:"before" 且 anchor 为第一行标题等。
   */
  insert_at?: 'before' | 'after'
  /**
   * replace / delete：默认只作用于 anchor 段；full 表示作用于整段
   * context_before + anchor + context_after 的**字面拼接**唯一匹配（会删掉整段，不仅是 anchor）。
   * 若只需删除/替换 anchor 文本、仅用 context 帮助定位，请用默认 anchor（不要 full）。
   */
  match_scope?: 'anchor' | 'full'
  /**
   * insert：insert_at 为 after（默认）时，是否自动补换行，避免插在行尾与下一片段粘连。
   * auto（默认）：在锚后若不在新行行首则补前导 \\n；若插入点后有同行文本则补尾随 \\n。
   * none：完全按 content 原样插入（高级用法）。
   */
  insert_newline_policy?: 'auto' | 'none'
}

export interface EditPlan {
  edits: EditOperation[]
}

export type MatchStrategy = 'exact' | 'fuzzy'

export interface LocatedSpan {
  /** anchor 在 file 中的 [start, end)（空 anchor 时为零宽点：before 与 after 的接缝） */
  anchorStart: number
  anchorEnd: number
  /** 整段 context_before + anchor + context_after 的匹配 [start, end)（无上下文时与锚段相同） */
  fullStart: number
  fullEnd: number
  strategy: MatchStrategy
}

export interface ApplyEditLogEntry {
  editId: string
  strategy: MatchStrategy
  anchorStart: number
  anchorEnd: number
  oldSnippet: string
  newSnippet: string
}

export interface ApplyEditsSuccess {
  text: string
  logs: ApplyEditLogEntry[]
}

export class EditEngineError extends Error {
  constructor(
    message: string,
    public readonly code: 'TARGET_NOT_FOUND' | 'AMBIGUOUS_MATCH' | 'INVALID_EDIT' | 'APPLY_FAILED'
  ) {
    super(message)
    this.name = 'EditEngineError'
  }
}
