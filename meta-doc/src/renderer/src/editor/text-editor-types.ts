export interface TextPosition {
  line: number
  column: number
}

export interface TextRange {
  start: TextPosition
  end: TextPosition
}

export interface SearchOptions {
  text: string
  matchCase?: boolean
  wholeWord?: boolean
  useRegex?: boolean
  preserveCase?: boolean
}

/**
 * 文本锚点接口
 * 用于在文本变化后仍能准确定位到原始匹配位置
 */
export interface TextAnchor {
  /**
   * 锚点 ID，由编辑器实现生成
   */
  id: string
  /**
   * 锚点类型，用于区分不同的编辑器实现
   */
  type: 'monaco-marker' | 'vditor-element' | 'text-content'
  /**
   * 锚点数据，由编辑器实现存储
   */
  data?: unknown
}

/**
 * 查找结果
 * 包含匹配的文本信息和锚点，支持动态定位和替换
 */
export interface FindResult {
  /**
   * 当前范围（可能已过时，仅作参考）
   */
  range: TextRange
  /**
   * 匹配的文本内容
   */
  matchText: string
  /**
   * 正则表达式捕获组（如果使用正则）
   */
  groups?: string[]
  /**
   * 文本锚点，用于在文本变化后仍能准确定位
   * 这是核心机制，不依赖绝对位置
   */
  anchor: TextAnchor
  /**
   * 获取当前实际的范围（基于锚点动态计算）
   */
  getCurrentRange?(): TextRange | null
  /**
   * 替换匹配的文本（基于锚点，不依赖绝对位置）
   */
  replace?(replacement: string): void
  /**
   * 获取匹配文本的上下文
   */
  getContext?(options?: ContextOptions): string
}

export interface EditorSearchState {
  options: SearchOptions
  matches: FindResult[]
  currentIndex: number
  isSearching?: boolean // 是否正在搜索中（用于显示加载状态）
}

export type SearchDirection = 'next' | 'previous'

export interface ReplaceOutcome {
  state: EditorSearchState
  replacedCount: number
}

export interface ConfigureSearchBehavior {
  revealFirst?: boolean
}

/**
 * 基于文本内容的查找选项
 */
export interface FindByContentOptions {
  matchCase?: boolean
  wholeWord?: boolean
  useRegex?: boolean
  maxResults?: number
}

/**
 * 待确认的编辑操作
 */
export interface PendingEdit {
  id: string
  type: 'insert' | 'delete' | 'replace'
  range?: TextRange // delete 和 replace 需要
  position?: TextPosition // insert 需要
  text: string // insert 和 replace 需要
  originalText?: string // replace 需要，用于显示原始内容
  description?: string // 可选的描述信息
}

/**
 * 文本上下文选项
 */
export interface ContextOptions {
  beforeLines?: number // 前面的行数
  afterLines?: number // 后面的行数
  beforeChars?: number // 前面的字符数
  afterChars?: number // 后面的字符数
}

/**
 * 文本编辑适配器接口
 * 提供统一的文本编辑、搜索、替换等功能
 * 支持 Agent 使用的各种文字处理工具
 */
export interface TextEditorAdapter {
  readonly kind: string

  // ========== 基础功能 ==========
  focus(): void
  getSelectionText(): string
  getSelectionRange(): TextRange | null
  insertText(text: string, opts?: { replaceSelection?: boolean }): void
  copy(): Promise<void>
  cut(): Promise<void>
  paste(): Promise<void>
  selectAll(): void
  goTo(position: TextPosition): void
  goToRanges(ranges: TextRange[]): void

  // ========== 文本获取 ==========
  /**
   * 获取完整文本内容
   */
  getFullText(): string

  /**
   * 获取指定范围的文本
   */
  getTextAt(range: TextRange): string

  /**
   * 获取指定行的文本
   */
  getLineText(line: number): string

  /**
   * 获取多行文本
   */
  getLines(startLine: number, endLine: number): string[]

  /**
   * 获取总行数
   */
  getLineCount(): number

  // ========== 精准定位和查找 ==========
  /**
   * 基于文本内容查找所有匹配位置（不依赖绝对位置）
   * 这是更可靠的查找方式，即使文本发生变化也能准确找到
   */
  findTextByContent(text: string, options?: FindByContentOptions): FindResult[]

  /**
   * 获取指定范围附近的上下文
   */
  getContext(range: TextRange, options?: ContextOptions): string

  /**
   * 根据文本内容定位到第一个匹配的位置
   */
  locateText(text: string, options?: FindByContentOptions): TextRange | null

  // ========== 编辑操作 ==========
  /**
   * 替换指定范围的文本
   */
  replaceRange(range: TextRange, text: string): void

  /**
   * 删除指定范围的文本
   */
  deleteRange(range: TextRange): void

  /**
   * 在指定位置插入文本
   */
  insertAt(position: TextPosition, text: string): void

  /**
   * 批量编辑操作（原子性，要么全部成功要么全部失败）
   */
  applyEdits(edits: Array<{ range: TextRange; text: string }>): void

  // ========== Pending 编辑操作（待确认） ==========
  /**
   * 创建待确认的编辑操作
   */
  createPendingEdit(edit: Omit<PendingEdit, 'id'>): string

  /**
   * 应用待确认的编辑
   */
  applyPendingEdit(id: string): void

  /**
   * 拒绝待确认的编辑
   */
  rejectPendingEdit(id: string): void

  /**
   * 获取所有待确认的编辑
   */
  getPendingEdits(): PendingEdit[]

  /**
   * 清除所有待确认的编辑
   */
  clearPendingEdits(): void

  // ========== 搜索和替换（保留原有接口以兼容） ==========
  configureSearch(options: SearchOptions, behavior?: ConfigureSearchBehavior): EditorSearchState
  getSearchState(): EditorSearchState
  find(direction: SearchDirection): EditorSearchState
  replaceCurrent(replacement: string): EditorSearchState
  replaceNext(replacement: string): EditorSearchState
  replaceAll(replacement: string): ReplaceOutcome
  clearSearch(): void
}
