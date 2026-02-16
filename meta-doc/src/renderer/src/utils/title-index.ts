/**
 * 标题索引工具
 * 用于建立标题DOM元素与文本行号的映射，优化查找替换性能
 */

export interface TitleIndexEntry {
  path: string // 标题路径
  line: number // 标题在文本中的行号（1-based）
  element: HTMLElement // 标题的DOM元素
  title: string // 标题文本
  level: number // 标题级别（1-6）
}

/**
 * 标题索引
 * 用于快速定位标题对应的DOM和行号
 */
export class TitleIndex {
  private entries: TitleIndexEntry[] = []
  private pathToEntry: Map<string, TitleIndexEntry> = new Map()
  private lineToEntry: Map<number, TitleIndexEntry> = new Map()

  /**
   * 从markdown文本和DOM元素建立索引
   */
  static buildFromMarkdown(
    markdown: string,
    titleElements: HTMLElement[],
    outlineTree: any
  ): TitleIndex {
    const index = new TitleIndex()
    const lines = markdown.split(/\r?\n/)

    // 建立大纲节点队列（按顺序）
    const treeNodeQueue: any[] = []
    const dfsOutlineTree = (node: any) => {
      if (node.path !== 'dummy') {
        treeNodeQueue.push(node)
      }
      if (node.children) {
        node.children.forEach(dfsOutlineTree)
      }
    }
    dfsOutlineTree(outlineTree)

    // 为每个标题元素找到对应的行号
    titleElements.forEach((element, i) => {
      const node = treeNodeQueue[i]
      if (!node?.path) return

      // 从DOM元素获取标题文本
      const titleText = element.textContent?.trim() || ''

      // 在markdown文本中查找对应的标题行
      let titleLine = -1
      let titleLevel = 0

      // 通过标题文本在markdown中查找（更准确）
      // 先尝试精确匹配，再尝试模糊匹配
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex]
        const match = line.match(/^(#{1,6})\s+(.+)$/)
        if (match) {
          const hashes = match[1]
          const title = match[2].trim()
          // 精确匹配优先
          if (title === titleText) {
            titleLine = lineIndex + 1 // 1-based
            titleLevel = hashes.length
            break
          }
        }
      }

      // 如果精确匹配失败，尝试模糊匹配
      if (titleLine === -1) {
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
          const line = lines[lineIndex]
          const match = line.match(/^(#{1,6})\s+(.+)$/)
          if (match) {
            const hashes = match[1]
            const title = match[2].trim()
            // 模糊匹配：包含关系
            if (title.includes(titleText) || titleText.includes(title)) {
              titleLine = lineIndex + 1 // 1-based
              titleLevel = hashes.length
              break
            }
          }
        }
      }

      // 如果找到了行号，添加到索引
      if (titleLine > 0) {
        const entry: TitleIndexEntry = {
          path: node.path,
          line: titleLine,
          element,
          title: titleText,
          level: titleLevel || node.title_level || 1
        }
        index.addEntry(entry)
      }
    })

    return index
  }

  /**
   * 添加索引条目
   */
  addEntry(entry: TitleIndexEntry): void {
    this.entries.push(entry)
    this.pathToEntry.set(entry.path, entry)
    this.lineToEntry.set(entry.line, entry)
  }

  /**
   * 根据行号查找最近的标题
   */
  findNearestTitle(line: number): TitleIndexEntry | null {
    if (this.entries.length === 0) return null

    // 找到所有行号小于等于目标行号的标题
    const beforeEntries = this.entries.filter((e) => e.line <= line)
    if (beforeEntries.length === 0) {
      // 如果没有找到，返回第一个标题
      return this.entries[0]
    }

    // 返回最近的标题（行号最大的）
    return beforeEntries.reduce((nearest, current) =>
      current.line > nearest.line ? current : nearest
    )
  }

  /**
   * 根据路径查找标题
   */
  findByPath(path: string): TitleIndexEntry | null {
    return this.pathToEntry.get(path) || null
  }

  /**
   * 根据行号查找标题
   */
  findByLine(line: number): TitleIndexEntry | null {
    return this.lineToEntry.get(line) || null
  }

  /**
   * 获取所有索引条目
   */
  getAllEntries(): TitleIndexEntry[] {
    return [...this.entries]
  }

  /**
   * 清空索引
   */
  clear(): void {
    this.entries = []
    this.pathToEntry.clear()
    this.lineToEntry.clear()
  }
}
