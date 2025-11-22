/**
 * 段落优化工具适配器接口
 */
export interface SectionOptimizerAdapter {
  /**
   * 获取当前光标位置对应的章节信息
   * @param cursorPosition 光标位置（行号、列号等）
   * @returns 章节信息，包括标题、路径、内容范围等
   */
  getSectionAtCursor(cursorPosition: any): Promise<SectionInfo | null>

  /**
   * 获取章节内容
   * @param sectionInfo 章节信息
   * @returns 章节的文本内容
   */
  getSectionContent(sectionInfo: SectionInfo): string

  /**
   * 获取章节所在的大纲树
   * @returns 大纲树结构
   */
  getOutlineTree(): any

  /**
   * 获取全文内容
   * @returns 全文文本
   */
  getFullText(): string

  /**
   * 应用优化后的内容
   * @param sectionInfo 章节信息
   * @param newContent 新内容
   * @param append 是否追加
   */
  applyContent(sectionInfo: SectionInfo, newContent: string, append: boolean): Promise<void>

  /**
   * 渲染内容（用于预览）
   * @param content 要渲染的内容
   * @returns 渲染后的HTML元素或组件
   */
  renderContent(content: string): any
}

/**
 * 章节信息
 */
export interface SectionInfo {
  /** 章节标题 */
  title: string
  /** 章节路径（用于在大纲树中定位） */
  path: string
  /** 章节内容范围（起始位置和结束位置） */
  range?: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  }
  /** 章节内容 */
  content: string
  /** 标题行号（用于LaTeX，保留标题行） */
  titleLine?: number
}

