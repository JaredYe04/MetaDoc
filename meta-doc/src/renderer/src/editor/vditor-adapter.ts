import type Vditor from 'vditor'
import {
  ContextOptions,
  EditorSearchState,
  FindByContentOptions,
  FindResult,
  PendingEdit,
  ReplaceOutcome,
  SearchDirection,
  SearchOptions,
  TextAnchor,
  TextEditorAdapter,
  TextPosition,
  TextRange
} from './text-editor-types'
import {
  searchInText,
  searchInTextBatched,
  computeReplacementText,
  offsetToPosition,
  positionToOffset as textPositionToOffset,
  type TextSearchMatch
} from '../utils/text-search-utils'
import type { TitleIndex } from '../utils/title-index'
import { useWorkspace } from '../stores/workspace'

interface HighlightMatch {
  element: HTMLSpanElement
  range: TextRange
  text: string
  groups?: string[]
}

const HIGHLIGHT_CLASS = 'md-editor-search-match'
const ACTIVE_CLASS = 'md-editor-search-active'
const defaultState: EditorSearchState = {
  options: {
    text: '',
    matchCase: false,
    wholeWord: false,
    useRegex: false,
    preserveCase: false
  },
  matches: [],
  currentIndex: -1,
  isSearching: false
}

export interface VditorAdapterOptions {
  getInstance: () => Vditor | null | undefined
  syncMarkdown: (markdown: string) => void
  getTitleIndex?: () => TitleIndex | null // 获取标题索引的函数
}

export class VditorTextEditorAdapter implements TextEditorAdapter {
  public readonly kind = 'vditor'
  private readonly getInstance: () => Vditor | null | undefined
  private readonly syncMarkdown: (markdown: string) => void
  private readonly getTitleIndex?: () => TitleIndex | null
  private state: EditorSearchState = { ...defaultState }
  private highlights: HighlightMatch[] = []
  private isReplacing: boolean = false // 标记是否正在执行替换操作
  private pendingEdits: Map<string, PendingEdit> = new Map() // 待确认的编辑操作
  private currentSearchAbortController: AbortController | null = null // 当前搜索的取消控制器
  /** 每次发起/取消搜索递增，防止旧异步任务写坏新 state（导致 isSearching 卡住或结果错乱） */
  private searchGeneration = 0

  constructor(options: VditorAdapterOptions) {
    this.getInstance = options.getInstance
    this.syncMarkdown = options.syncMarkdown
    this.getTitleIndex = options.getTitleIndex
  }

  configureSearch(options: SearchOptions, behavior?: { revealFirst?: boolean }): EditorSearchState {
    const revealFirst = behavior?.revealFirst !== false

    this.searchGeneration++

    // 取消之前的搜索（如果存在）
    if (this.currentSearchAbortController) {
      this.currentSearchAbortController.abort()
      this.currentSearchAbortController = null
    }

    const generation = this.searchGeneration

    // 保存之前的索引，以便在重新搜索后恢复
    const previousIndex = this.state.currentIndex
    const previousMatchText = this.state.matches[previousIndex]?.matchText

    this.clearHighlights()
    const normalized: SearchOptions = {
      text: options.text ?? '',
      matchCase: !!options.matchCase,
      wholeWord: !!options.wholeWord,
      useRegex: !!options.useRegex,
      preserveCase: !!options.preserveCase
    }
    this.state = {
      options: normalized,
      matches: [],
      currentIndex: -1,
      isSearching: !!normalized.text // 如果有搜索文本，标记为正在搜索
    }

    if (!normalized.text) {
      return this.getSearchState()
    }

    // 创建新的取消控制器
    this.currentSearchAbortController = new AbortController()

    // 默认从文档开头搜索（查找全部匹配）
    // 如果需要从光标位置开始，应该在find方法中处理
    const startOffset = 0

    // 使用纯文本搜索，而不是 DOM 遍历（异步分批搜索）
    this.performTextBasedSearch(
      normalized,
      previousIndex,
      previousMatchText,
      revealFirst,
      startOffset,
      this.currentSearchAbortController.signal,
      generation
    )

    // 立即返回当前状态（此时 matches 还是空的，会在异步完成后更新）
    return this.getSearchState()
  }

  /**
   * 专注侧栏「文档内搜索」点击结果：同步内部 search state 后走 highlightSingleMatch（与 SearchReplaceMenu 一致）。
   * 独立侧栏搜索未经过 configureSearch，state.matches / options 可能与 DOM 高亮算法不一致，故需先快照再高亮。
   */
  applySidebarSearchHighlight(
    allMatches: FindResult[],
    matchIndex: number,
    query: { text: string; matchCase: boolean; wholeWord: boolean; useRegex: boolean }
  ): void {
    if (this.currentSearchAbortController) {
      this.currentSearchAbortController.abort()
      this.currentSearchAbortController = null
    }
    this.searchGeneration++
    const normalized: SearchOptions = {
      text: query.text,
      matchCase: query.matchCase,
      wholeWord: query.wholeWord,
      useRegex: query.useRegex,
      preserveCase: false
    }
    this.clearHighlights()
    this.state = {
      options: normalized,
      matches: [...allMatches],
      currentIndex: matchIndex,
      isSearching: false
    }
    if (matchIndex >= 0 && matchIndex < allMatches.length) {
      this.highlightSingleMatch(allMatches[matchIndex], matchIndex, true)
    }
  }

  private async performTextBasedSearch(
    normalized: SearchOptions,
    previousIndex: number,
    previousMatchText: string | undefined,
    revealFirst: boolean,
    startOffset: number,
    abortSignal: AbortSignal,
    generation: number
  ): Promise<void> {
    const isCurrent = () => generation === this.searchGeneration

    try {
      if (!isCurrent()) {
        return
      }

      const fullText = this.getFullText()
      if (!fullText) {
        if (isCurrent()) {
          this.state.matches = []
          this.state.currentIndex = -1
          this.state.isSearching = false
        }
        return
      }

      if (!isCurrent()) {
        return
      }

      // 与 configureSearch 一致：搜索中
      this.state.isSearching = true
      this.state.matches = []
      this.state.currentIndex = -1

      const allFindResults: FindResult[] = []
      let matchIndex = 0

      // 使用分批搜索，每批10个匹配
      const searchGenerator = searchInTextBatched(fullText, normalized.text, {
        matchCase: normalized.matchCase,
        wholeWord: normalized.wholeWord,
        useRegex: normalized.useRegex,
        startOffset,
        batchSize: 10
      })

      // 分批处理匹配项
      for await (const batch of searchGenerator) {
        if (!isCurrent()) {
          return
        }
        if (abortSignal.aborted) {
          return
        }

        // 将文本匹配转换为 FindResult
        const batchResults: FindResult[] = batch.map((textMatch) => {
          const range: TextRange = {
            start: { line: textMatch.line, column: textMatch.column },
            end: {
              line: textMatch.line,
              column: textMatch.column + textMatch.match.length
            }
          }

          const anchorId = `anchor-${Date.now()}-${matchIndex}-${Math.random().toString(36).substr(2, 9)}`
          const anchor: TextAnchor = {
            id: anchorId,
            type: 'text-content',
            data: {
              range,
              matchText: textMatch.match,
              startOffset: textMatch.startOffset,
              endOffset: textMatch.endOffset
            }
          }

          const findResult = {
            range,
            matchText: textMatch.match,
            groups: textMatch.groups,
            anchor,
            getCurrentRange: () => {
              const currentText = this.getFullText()
              if (!currentText) return null
              return range
            },
            replace: (replacement: string) => {
              this.replaceRange(range, replacement)
            },
            getContext: (options?: ContextOptions) => {
              return this.getContext(range, options)
            },
            startOffset: textMatch.startOffset,
            endOffset: textMatch.endOffset
          } as FindResult & { startOffset: number; endOffset: number }

          matchIndex++
          return findResult
        })

        // 追加当前批次的匹配到总列表
        allFindResults.push(...batchResults)

        if (!isCurrent()) {
          return
        }
        if (abortSignal.aborted) {
          return
        }

        // 更新状态，触发UI更新
        this.state.matches = [...allFindResults]
      }

      if (!isCurrent()) {
        return
      }
      if (abortSignal.aborted) {
        return
      }

      // 尝试恢复到之前的索引位置
      let targetIndex = -1
      if (previousIndex >= 0 && allFindResults.length > 0) {
        if (previousIndex < allFindResults.length) {
          targetIndex = previousIndex
        } else {
          const sameTextIndex = allFindResults.findIndex((m) => m.matchText === previousMatchText)
          if (sameTextIndex >= 0) {
            targetIndex = sameTextIndex
          } else if (allFindResults.length > 0) {
            targetIndex = Math.min(previousIndex, allFindResults.length - 1)
          }
        }
      } else if (revealFirst && allFindResults.length > 0) {
        targetIndex = 0
      }

      if (isCurrent()) {
        this.state.currentIndex = targetIndex

        // Vditor不需要高亮所有匹配，只在用户点击列表项时高亮
        if (revealFirst && targetIndex >= 0 && allFindResults.length > 0) {
          this.highlightSingleMatch(allFindResults[targetIndex], targetIndex, true)
        }
      }
    } catch (error) {
      if (abortSignal.aborted) {
        return
      }
      console.warn('performTextBasedSearch:error', error)
      if (isCurrent()) {
        this.state.matches = []
        this.state.currentIndex = -1
        this.highlights = []
      }
    } finally {
      if (isCurrent()) {
        this.state.isSearching = false
      }
    }
  }

  /**
   * 高亮单个匹配项（用于Vditor，只在用户点击列表项时调用）
   * 公开方法，供SearchReplaceMenu调用
   */
  highlightSingleMatch(findResult: FindResult, index: number, focus: boolean): void {
    const root = this.getEditableRoot()
    if (!root) return

    // 清除旧的高亮
    this.clearHighlights()

    // 使用原来的DOM遍历算法进行精确定位，时间复杂度O(n)
    this.highlightMatchWithDOMTraversal(root, findResult, index, focus)
  }

  /**
   * 使用DOM遍历算法高亮单个匹配（使用标题索引优化性能）
   * 优化：从最近的标题DOM元素开始遍历，正确处理标题内的匹配
   */
  private highlightMatchWithDOMTraversal(
    root: HTMLElement,
    findResult: FindResult,
    index: number,
    focus: boolean
  ): void {
    try {
      const matchText = findResult.matchText
      const regex = this.buildRegex(this.state.options)

      // 尝试使用标题索引优化
      let nearestTitleElement: HTMLElement | null = null
      let initialMatchCount = 0
      let startFromTitle = false // 是否从标题元素开始遍历

      try {
        // findTextByContent 的 range.start.line 已是 1-based，与 TitleIndex 一致
        const matchLine = findResult.range.start.line
        const matchColumn = findResult.range.start.column // 1-based

        // 获取标题索引
        const titleIndex = this.getTitleIndex?.()
        if (titleIndex) {
          // 找到最近的标题（行号小于等于match行号的最大标题）
          const nearestTitle = titleIndex.findNearestTitle(matchLine)

          if (nearestTitle && nearestTitle.element && nearestTitle.element.isConnected) {
            nearestTitleElement = nearestTitle.element
            const titleLine = nearestTitle.line // 1-based

            // 判断匹配是否在标题行内
            const isMatchInTitleLine = matchLine === titleLine

            if (isMatchInTitleLine) {
              // 匹配在标题行内，需要从标题元素开始遍历
              startFromTitle = true

              // 计算标题行之前的所有匹配数
              const matchesBeforeTitleLine = this.state.matches.filter((m) => {
                const matchLineNum = m.range.start.line
                return matchLineNum < titleLine
              }).length

              // 计算标题行内、该匹配之前的所有匹配数
              const matchesInTitleLineBeforeMatch = this.state.matches.filter((m) => {
                const matchLineNum = m.range.start.line
                const matchColNum = m.range.start.column // 1-based
                return matchLineNum === titleLine && matchColNum < matchColumn
              }).length

              initialMatchCount = matchesBeforeTitleLine + matchesInTitleLineBeforeMatch
            } else {
              // 匹配在标题行之后，计算标题行之前的所有匹配数
              initialMatchCount = this.state.matches.filter((m) => {
                const matchLineNum = m.range.start.line
                return matchLineNum < titleLine
              }).length

              // 还需要计算标题行内的所有匹配数
              const matchesInTitleLine = this.state.matches.filter((m) => {
                const matchLineNum = m.range.start.line
                return matchLineNum === titleLine
              }).length

              initialMatchCount += matchesInTitleLine
            }
          }
        }
      } catch (error) {
        // 如果标题索引优化失败，继续使用默认方式
        console.warn('标题索引优化失败，使用默认方式:', error)
      }

      // 使用闭包保存状态，判断是否已经经过标题元素
      let hasPassedTitle = !nearestTitleElement // 是否已经经过标题元素
      let isInTitleElement = false // 是否正在标题元素内

      // 使用TreeWalker遍历文本节点
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            // 检查元素节点，判断是否已经经过标题元素
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (nearestTitleElement && node === nearestTitleElement) {
                // 遇到标题元素本身，标记为已经过，并标记为在标题元素内
                hasPassedTitle = true
                isInTitleElement = true
              } else if (isInTitleElement && nearestTitleElement) {
                // 检查是否离开了标题元素
                if (!nearestTitleElement.contains(node)) {
                  isInTitleElement = false
                }
              }
              // 对于元素节点，继续遍历其子节点
              return NodeFilter.FILTER_ACCEPT
            }

            // 处理文本节点
            if (node.nodeType !== Node.TEXT_NODE) {
              return NodeFilter.FILTER_REJECT
            }

            if (!node || !node.textContent) return NodeFilter.FILTER_REJECT
            if (node.parentElement?.classList.contains(HIGHLIGHT_CLASS)) {
              return NodeFilter.FILTER_REJECT
            }
            if (this.shouldSkipNode(node.parentElement)) {
              return NodeFilter.FILTER_REJECT
            }

            // 如果使用了标题索引优化
            if (nearestTitleElement) {
              const isNodeInTitle = nearestTitleElement.contains(node)

              if (startFromTitle) {
                // 如果从标题开始，只处理标题内的节点
                if (!isNodeInTitle) {
                  // 如果节点不在标题内，且已经离开了标题元素，停止遍历
                  if (hasPassedTitle && !isInTitleElement) {
                    return NodeFilter.FILTER_REJECT
                  }
                  // 如果还没进入标题元素，跳过
                  if (!hasPassedTitle) {
                    return NodeFilter.FILTER_REJECT
                  }
                } else {
                  // 节点在标题内，接受
                  if (!hasPassedTitle) {
                    hasPassedTitle = true
                    isInTitleElement = true
                  }
                }
              } else {
                // 如果从标题之后开始，跳过标题元素之前的节点
                if (!hasPassedTitle) {
                  if (isNodeInTitle) {
                    // 进入标题元素，标记为已经过，但跳过标题内的节点
                    hasPassedTitle = true
                    isInTitleElement = true
                    return NodeFilter.FILTER_REJECT
                  } else {
                    // 在标题元素之前，跳过
                    return NodeFilter.FILTER_REJECT
                  }
                } else if (isInTitleElement && !isNodeInTitle) {
                  // 离开了标题元素
                  isInTitleElement = false
                }
              }
            }

            return NodeFilter.FILTER_ACCEPT
          }
        }
      )

      let currentNode: Node | null = walker.nextNode()
      let matchCount = initialMatchCount

      // 遍历所有文本节点，找到第index个匹配
      while (currentNode) {
        // 只处理文本节点
        if (currentNode.nodeType === Node.TEXT_NODE) {
          const textNode = currentNode as Text
          const textContent = textNode.textContent ?? ''
          regex.lastIndex = 0
          let match: RegExpExecArray | null

          while ((match = regex.exec(textContent)) !== null) {
            if (matchCount === index) {
              // 找到目标匹配，创建高亮
              const start = match.index
              const end = start + match[0].length

              try {
                const range = document.createRange()
                range.setStart(textNode, start)
                range.setEnd(textNode, end)
                const span = document.createElement('span')
                span.className = HIGHLIGHT_CLASS
                span.classList.add(ACTIVE_CLASS)
                span.dataset.index = String(index)
                span.appendChild(range.extractContents())
                range.insertNode(span)

                const highlight: HighlightMatch = {
                  element: span,
                  range: findResult.range,
                  text: matchText,
                  groups: findResult.groups
                }

                this.highlights = [highlight]

                if (focus) {
                  span.scrollIntoView({ block: 'center', behavior: 'smooth' })
                  const selection = window.getSelection()
                  selection?.removeAllRanges()
                  const selectRange = document.createRange()
                  selectRange.selectNodeContents(span)
                  selection?.addRange(selectRange)
                }

                return // 找到匹配后立即返回
              } catch (error) {
                console.warn('highlightMatchWithDOMTraversal:error', error)
                return
              }
            }
            matchCount++
            if (!regex.global) break
            if (match[0].length === 0) {
              regex.lastIndex += 1
            }
          }
        }

        currentNode = walker.nextNode()
      }

      // 如果使用标题索引优化但没找到匹配，回退到从头遍历
      if (nearestTitleElement && matchCount <= index) {
        console.warn('从标题开始遍历未找到匹配，回退到从头遍历')
        this.highlightMatchWithDOMTraversalFallback(root, findResult, index, focus)
      }
    } catch (error) {
      console.warn('highlightMatchWithDOMTraversal:error', error)
      // 出错时回退到从头遍历
      this.highlightMatchWithDOMTraversalFallback(root, findResult, index, focus)
    }
  }

  /**
   * 回退方案：从头开始遍历整个DOM（不使用标题索引优化）
   * 注意：这个方法现在不再使用，保留作为备用
   */
  private highlightMatchWithDOMTraversalFallback(
    root: HTMLElement,
    findResult: FindResult,
    index: number,
    focus: boolean
  ): void {
    try {
      const matchText = findResult.matchText
      const regex = this.buildRegex(this.state.options)

      // 使用TreeWalker从头开始遍历文本节点
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          if (!node || !node.textContent) return NodeFilter.FILTER_REJECT
          if (node.parentElement?.classList.contains(HIGHLIGHT_CLASS)) {
            return NodeFilter.FILTER_REJECT
          }
          if (this.shouldSkipNode(node.parentElement)) {
            return NodeFilter.FILTER_REJECT
          }
          return NodeFilter.FILTER_ACCEPT
        }
      })

      let currentNode = walker.nextNode() as Text | null
      let matchCount = 0

      // 遍历所有文本节点，找到第index个匹配
      while (currentNode) {
        const textContent = currentNode.textContent ?? ''
        regex.lastIndex = 0
        let match: RegExpExecArray | null

        while ((match = regex.exec(textContent)) !== null) {
          if (matchCount === index) {
            // 找到目标匹配，创建高亮
            const start = match.index
            const end = start + match[0].length

            try {
              const range = document.createRange()
              range.setStart(currentNode, start)
              range.setEnd(currentNode, end)
              const span = document.createElement('span')
              span.className = HIGHLIGHT_CLASS
              span.classList.add(ACTIVE_CLASS)
              span.dataset.index = String(index)
              span.appendChild(range.extractContents())
              range.insertNode(span)

              const highlight: HighlightMatch = {
                element: span,
                range: findResult.range,
                text: matchText,
                groups: findResult.groups
              }

              this.highlights = [highlight]

              if (focus) {
                span.scrollIntoView({ block: 'center', behavior: 'smooth' })
                const selection = window.getSelection()
                selection?.removeAllRanges()
                const selectRange = document.createRange()
                selectRange.selectNodeContents(span)
                selection?.addRange(selectRange)
              }

              return // 找到匹配后立即返回
            } catch (error) {
              console.warn('highlightMatchWithDOMTraversalFallback:error', error)
              return
            }
          }
          matchCount++
          if (!regex.global) break
          if (match[0].length === 0) {
            regex.lastIndex += 1
          }
        }

        currentNode = walker.nextNode() as Text | null
      }
    } catch (error) {
      console.warn('highlightMatchWithDOMTraversalFallback:error', error)
    }
  }

  private textRangeToDOMRange(
    root: HTMLElement,
    plainText: string,
    range: TextRange
  ): Range | null {
    const startOffset = textPositionToOffset(plainText, range.start.line, range.start.column)
    const endOffset = textPositionToOffset(plainText, range.end.line, range.end.column)

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let charIndex = 0
    let startNode: Text | null = null
    let startNodeOffset = 0
    let endNode: Text | null = null
    let endNodeOffset = 0
    let currentNode = walker.nextNode() as Text | null

    while (currentNode) {
      const nextIndex = charIndex + currentNode.length

      if (!startNode && startOffset >= charIndex && startOffset <= nextIndex) {
        startNode = currentNode
        startNodeOffset = startOffset - charIndex
      }

      if (!endNode && endOffset >= charIndex && endOffset <= nextIndex) {
        endNode = currentNode
        endNodeOffset = endOffset - charIndex
        break
      }

      charIndex = nextIndex
      currentNode = walker.nextNode() as Text | null
    }

    if (!startNode || !endNode) return null

    const domRange = document.createRange()
    domRange.setStart(startNode, startNodeOffset)
    domRange.setEnd(endNode, endNodeOffset)
    return domRange
  }

  private finishSearch(
    highlights: HighlightMatch[],
    previousIndex: number,
    previousMatchText: string | undefined,
    revealFirst: boolean
  ): void {
    this.highlights = highlights
    this.state.matches = highlights.map((item, index) => {
      // 创建锚点（使用 highlight 元素作为锚点）
      const anchorId = `anchor-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`
      const anchor: TextAnchor = {
        id: anchorId,
        type: 'vditor-element',
        data: { element: item.element, range: item.range }
      }

      return {
        range: item.range,
        matchText: item.text,
        groups: item.groups,
        anchor,
        getCurrentRange: () => {
          // 通过 highlight 元素获取当前范围
          if (!item.element.parentNode) return null
          return this.getRangeFromElement(item.element)
        },
        replace: (replacement: string) => {
          // 直接替换 highlight 元素的内容
          item.element.textContent = replacement
          this.syncAfterMutation()
        },
        getContext: (options?: ContextOptions) => {
          const currentRange = this.getRangeFromElement(item.element)
          return this.getContext(currentRange, options)
        }
      }
    })

    // 尝试恢复到之前的索引位置（只保留索引值，不恢复光标位置）
    let targetIndex = -1
    if (previousIndex >= 0 && highlights.length > 0) {
      // 如果之前的索引仍然有效，使用它
      if (previousIndex < highlights.length) {
        targetIndex = previousIndex
      } else {
        // 如果之前的索引超出范围，尝试找到最接近的匹配
        // 优先尝试找到相同文本的匹配
        const sameTextIndex = highlights.findIndex((h) => h.text === previousMatchText)
        if (sameTextIndex >= 0) {
          targetIndex = sameTextIndex
        } else if (highlights.length > 0) {
          // 如果找不到相同文本，使用最后一个匹配
          targetIndex = Math.min(previousIndex, highlights.length - 1)
        }
      }
    } else if (revealFirst && highlights.length > 0) {
      targetIndex = 0
    }

    this.state.currentIndex = targetIndex
    // 注意：不调用 setActiveHighlight 来聚焦，只保留索引值，让用户通过"下一个"/"上一个"按钮来导航
    // 这样不会影响用户的编辑体验
    if (revealFirst && targetIndex >= 0 && highlights.length > 0) {
      // 只有在首次搜索时才跳转到第一个匹配
      this.setActiveHighlight(this.state.currentIndex, {
        focus: true
      })
    } else {
      // 只更新高亮样式，不改变光标位置
      this.setActiveHighlight(this.state.currentIndex, {
        focus: false
      })
    }
  }

  getSearchState(): EditorSearchState {
    return {
      options: { ...this.state.options },
      matches: this.state.matches.map((match) => ({
        range: { ...match.range },
        matchText: match.matchText,
        groups: match.groups ? [...match.groups] : undefined,
        anchor: match.anchor,
        getCurrentRange: match.getCurrentRange,
        replace: match.replace,
        getContext: match.getContext
      })),
      currentIndex: this.state.currentIndex,
      isSearching: this.state.isSearching
    }
  }

  find(direction: SearchDirection): EditorSearchState {
    if (!this.state.matches.length) {
      return this.getSearchState()
    }
    const delta = direction === 'next' ? 1 : -1
    const baseIndex =
      this.state.currentIndex === -1 ? (direction === 'next' ? -1 : 0) : this.state.currentIndex
    const newIndex = (baseIndex + delta + this.state.matches.length) % this.state.matches.length
    this.state.currentIndex = newIndex

    // 对于vditor，只高亮当前匹配项（不高亮所有匹配）
    if (newIndex >= 0 && newIndex < this.state.matches.length) {
      this.highlightSingleMatch(this.state.matches[newIndex], newIndex, true)
    }

    return this.getSearchState()
  }

  replaceCurrent(replacement: string): EditorSearchState {
    if (this.state.currentIndex === -1 || !this.highlights.length) {
      return this.getSearchState()
    }
    // highlightSingleMatch 只保留一个 span，始终放在 highlights[0]；currentIndex 是全文中的第 N 个匹配
    const highlight =
      this.highlights.length === 1 ? this.highlights[0] : this.highlights[this.state.currentIndex]
    if (!highlight) {
      return this.getSearchState()
    }
    const value = this.computeReplacementText(highlight, replacement)
    this.isReplacing = true
    try {
      highlight.element.textContent = value
      this.syncAfterMutation()
      return this.configureSearch(this.state.options)
    } finally {
      this.isReplacing = false
    }
  }

  replaceNext(replacement: string): EditorSearchState {
    if (!this.highlights.length) {
      return this.getSearchState()
    }
    if (this.state.currentIndex === -1) {
      this.find('next')
    }
    if (this.state.currentIndex === -1) {
      return this.getSearchState()
    }
    const highlight =
      this.highlights.length === 1 ? this.highlights[0] : this.highlights[this.state.currentIndex]
    if (!highlight) {
      return this.getSearchState()
    }
    const value = this.computeReplacementText(highlight, replacement)
    this.isReplacing = true
    try {
      highlight.element.textContent = value
      this.syncAfterMutation()
      const nextState = this.configureSearch(this.state.options)
      if (nextState.matches.length) {
        this.find('next')
      }
      return this.getSearchState()
    } finally {
      this.isReplacing = false
    }
  }

  replaceAll(replacement: string): ReplaceOutcome {
    // 使用基于内容的查找，确保即使文本发生变化也能准确找到所有匹配
    const searchText = this.state.options.text
    if (!searchText) {
      return { state: this.getSearchState(), replacedCount: 0 }
    }

    // 获取当前完整文本
    const fullText = this.getFullText()
    if (!fullText) {
      return { state: this.getSearchState(), replacedCount: 0 }
    }

    // 构建搜索正则表达式
    let regex: RegExp
    try {
      if (this.state.options.useRegex) {
        regex = new RegExp(searchText, this.state.options.matchCase ? 'g' : 'gi')
      } else {
        const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const pattern = this.state.options.wholeWord ? `(?<!\\w)${escaped}(?!\\w)` : escaped
        regex = new RegExp(pattern, this.state.options.matchCase ? 'g' : 'gi')
      }
    } catch (error) {
      console.warn('replaceAll:regex-error', error)
      return { state: this.getSearchState(), replacedCount: 0 }
    }

    // 在文本字符串上进行替换（从后往前）
    const matches: Array<{ index: number; length: number; match: RegExpExecArray }> = []
    regex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(fullText)) !== null) {
      matches.push({
        index: match.index,
        length: match[0].length,
        match
      })
      if (!regex.global) break
      if (match[0].length === 0) {
        regex.lastIndex += 1
      }
    }

    if (!matches.length) {
      return { state: this.getSearchState(), replacedCount: 0 }
    }

    this.isReplacing = true
    try {
      // 从后往前构建新文本
      let newText = fullText
      for (let i = matches.length - 1; i >= 0; i--) {
        const { index, length, match: matchData } = matches[i]
        let replacementText = replacement

        // 处理正则表达式替换组
        if (this.state.options.useRegex && matchData && matchData.length > 0) {
          // 处理 $1, $2, $3... 等捕获组引用
          // 同时也支持 $$ 表示字面量 $
          replacementText = replacementText.replace(
            /\$(\d+)|(\$\$)/g,
            (fullMatch, indexStr, literalDollar) => {
              // 如果是 $$，返回单个 $
              if (literalDollar) {
                return '$'
              }
              // 如果是 $1, $2 等，返回对应的捕获组
              const index = Number(indexStr)
              if (Number.isNaN(index) || index < 0 || index >= matchData.length) {
                return fullMatch // 如果索引无效，返回原始字符串
              }
              return matchData[index] ?? ''
            }
          )
        }

        // 处理大小写保留
        if (this.state.options.preserveCase && matchData) {
          replacementText = this.adjustCase(matchData[0], replacementText)
        }

        // 替换文本（从后往前，所以前面的位置不会受到影响）
        newText = newText.slice(0, index) + replacementText + newText.slice(index + length)
      }

      // 如果文本没有变化，直接返回
      if (newText === fullText) {
        return { state: this.getSearchState(), replacedCount: 0 }
      }

      // 一次性替换整个文本内容
      const instance = this.getInstance()
      if (instance) {
        instance.setValue(newText)
        this.syncAfterMutation()
      }

      // 重新搜索以更新状态
      const state = this.configureSearch(this.state.options)
      return { state, replacedCount: matches.length }
    } finally {
      this.isReplacing = false
    }
  }

  clearSearch(): void {
    this.searchGeneration++
    // 取消正在进行的搜索
    if (this.currentSearchAbortController) {
      this.currentSearchAbortController.abort()
      this.currentSearchAbortController = null
    }
    this.clearHighlights()
    this.state = { ...defaultState }
  }

  dispose(): void {
    this.clearSearch()
  }

  focus(): void {
    this.getEditableRoot()?.focus()
  }

  getSelectionText(): string {
    return window.getSelection()?.toString() ?? ''
  }

  getSelectionRange(): TextRange | null {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null
    const range = selection.getRangeAt(0)
    const root = this.getEditableRoot()
    if (!root) return null
    const plain = this.getPlainText(root)
    const startOffset = this.getOffsetFromRange(root, range.startContainer, range.startOffset)
    const endOffset = this.getOffsetFromRange(root, range.endContainer, range.endOffset)
    const start = this.offsetToPosition(plain, startOffset)
    const end = this.offsetToPosition(plain, endOffset)
    return { start, end }
  }

  insertText(text: string, opts?: { replaceSelection?: boolean }): void {
    const instance = this.getInstance()
    if (!instance) return
    if (opts?.replaceSelection) {
      document.execCommand('insertText', false, text)
      this.syncAfterMutation()
    } else {
      instance.insertValue(text)
    }
  }

  async copy(): Promise<void> {
    const selection = this.getSelectionText()
    if (!selection) return
    await navigator.clipboard.writeText(selection)
  }

  async cut(): Promise<void> {
    const selection = this.getSelectionText()
    if (!selection) return
    await navigator.clipboard.writeText(selection)
    document.execCommand('delete')
    this.syncAfterMutation()
  }

  async paste(): Promise<void> {
    const text = await navigator.clipboard.readText()
    if (!text) return
    document.execCommand('insertText', false, text)
    this.syncAfterMutation()
  }

  selectAll(): void {
    const root = this.getEditableRoot()
    if (!root) return
    const selection = window.getSelection()
    if (!selection) return
    const range = document.createRange()
    range.selectNodeContents(root)
    selection.removeAllRanges()
    selection.addRange(range)
    root.focus()
  }

  private focusEditablePreventScroll(root: HTMLElement): void {
    try {
      root.focus({ preventScroll: true })
    } catch {
      root.focus()
    }
  }

  goTo(position: TextPosition): void {
    const root = this.getEditableRoot()
    if (!root) return
    const plain = this.getPlainText(root)
    const offset = this.positionToOffset(plain, position)
    this.setSelectionByOffset(root, offset, offset)
    this.focusEditablePreventScroll(root)
  }

  goToRanges(ranges: TextRange[]): void {
    if (!ranges.length) return
    const root = this.getEditableRoot()
    if (!root) return
    const plain = this.getPlainText(root)
    const first = ranges[0]
    const start = this.positionToOffset(plain, first.start)
    const end = this.positionToOffset(plain, first.end)
    this.setSelectionByOffset(root, start, end)
    this.focusEditablePreventScroll(root)
  }

  // ========== 文本获取 ==========
  getFullText(): string {
    const workspace = useWorkspace()
    const activeDocument = workspace.activeDocument.value
    if (!activeDocument) return ''
    return activeDocument.markdown || ''
  }

  getTextAt(range: TextRange): string {
    const root = this.getEditableRoot()
    if (!root) return ''
    const plain = this.getPlainText(root)
    const start = this.positionToOffset(plain, range.start)
    const end = this.positionToOffset(plain, range.end)
    return plain.slice(start, end)
  }

  getLineText(line: number): string {
    const fullText = this.getFullText()
    const lines = fullText.split('\n')
    const safeLine = Math.max(0, Math.min(lines.length - 1, line - 1))
    return lines[safeLine] ?? ''
  }

  getLines(startLine: number, endLine: number): string[] {
    const fullText = this.getFullText()
    const lines = fullText.split('\n')
    const safeStart = Math.max(0, Math.min(lines.length - 1, startLine - 1))
    const safeEnd = Math.max(safeStart, Math.min(lines.length - 1, endLine - 1))
    return lines.slice(safeStart, safeEnd + 1)
  }

  getLineCount(): number {
    const fullText = this.getFullText()
    return fullText.split('\n').length
  }

  // ========== 精准定位和查找 ==========
  findTextByContent(text: string, options?: FindByContentOptions): FindResult[] {
    const fullText = this.getFullText()
    if (!fullText || !text) return []

    const matchCase = options?.matchCase ?? false
    const wholeWord = options?.wholeWord ?? false
    const useRegex = options?.useRegex ?? false
    const maxResults = options?.maxResults ?? 5000

    let regex: RegExp
    try {
      if (useRegex) {
        regex = new RegExp(text, matchCase ? 'g' : 'gi')
      } else {
        const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const pattern = wholeWord ? `(?<!\\w)${escaped}(?!\\w)` : escaped
        regex = new RegExp(pattern, matchCase ? 'g' : 'gi')
      }
    } catch (error) {
      console.warn('findTextByContent:regex-error', error)
      return []
    }

    const results: FindResult[] = []
    const lines = fullText.split('\n')
    let currentOffset = 0

    for (let lineIndex = 0; lineIndex < lines.length && results.length < maxResults; lineIndex++) {
      const line = lines[lineIndex]
      regex.lastIndex = 0
      let match: RegExpExecArray | null

      while ((match = regex.exec(line)) !== null && results.length < maxResults) {
        if (!match) break // TypeScript 类型保护

        const matchText = match[0]
        const startOffset = currentOffset + match.index
        const endOffset = startOffset + matchText.length
        const startLine = lineIndex + 1
        const startColumn = match.index + 1
        const endColumn = match.index + matchText.length + 1

        const range: TextRange = {
          start: { line: startLine, column: startColumn },
          end: { line: startLine, column: endColumn }
        }

        // 创建锚点（基于文本内容）
        const anchorId = `anchor-${Date.now()}-${results.length}-${Math.random().toString(36).substr(2, 9)}`
        const anchor: TextAnchor = {
          id: anchorId,
          type: 'text-content',
          data: { range, matchText }
        }

        results.push({
          range,
          matchText,
          groups: useRegex ? [...match] : undefined,
          anchor,
          getCurrentRange: () => {
            // 直接返回当前范围（因为这是基于文本内容的查找，范围是准确的）
            return range
          },
          replace: (replacement: string) => {
            // 直接使用当前范围进行替换
            this.replaceRange(range, replacement)
          },
          getContext: (contextOptions?: ContextOptions) => {
            return this.getContext(range, contextOptions)
          }
        })
      }

      currentOffset += line.length + 1 // +1 for newline
    }

    return results
  }

  getContext(range: TextRange, options?: ContextOptions): string {
    const beforeLines = options?.beforeLines ?? 3
    const afterLines = options?.afterLines ?? 3
    const beforeChars = options?.beforeChars
    const afterChars = options?.afterChars

    const fullText = this.getFullText()
    const lines = fullText.split('\n')

    const startLine = Math.max(0, range.start.line - 1 - beforeLines)
    const endLine = Math.min(lines.length - 1, range.end.line - 1 + afterLines)

    let context = lines.slice(startLine, endLine + 1).join('\n')

    if (beforeChars !== undefined || afterChars !== undefined) {
      const rangeText = this.getTextAt(range)
      const plain = fullText.replace(/\r\n/g, '\n')
      const startOffset = this.positionToOffset(plain, range.start)
      const endOffset = this.positionToOffset(plain, range.end)
      const beforeText = beforeChars
        ? plain.slice(Math.max(0, startOffset - beforeChars), startOffset)
        : ''
      const afterText = afterChars
        ? plain.slice(endOffset, Math.min(plain.length, endOffset + afterChars))
        : ''
      context = beforeText + rangeText + afterText
    }

    return context.trim()
  }

  locateText(text: string, options?: FindByContentOptions): TextRange | null {
    const results = this.findTextByContent(text, { ...options, maxResults: 1 })
    return results.length > 0 ? results[0].range : null
  }

  // ========== 编辑操作 ==========
  replaceRange(range: TextRange, text: string): void {
    const root = this.getEditableRoot()
    if (!root) return
    const plain = this.getPlainText(root)
    const start = this.positionToOffset(plain, range.start)
    const end = this.positionToOffset(plain, range.end)
    this.setSelectionByOffset(root, start, end)
    document.execCommand('insertText', false, text)
    this.syncAfterMutation()
  }

  deleteRange(range: TextRange): void {
    this.replaceRange(range, '')
  }

  insertAt(position: TextPosition, text: string): void {
    const root = this.getEditableRoot()
    if (!root) return
    const plain = this.getPlainText(root)
    const offset = this.positionToOffset(plain, position)
    this.setSelectionByOffset(root, offset, offset)
    document.execCommand('insertText', false, text)
    this.syncAfterMutation()
  }

  applyEdits(edits: Array<{ range: TextRange; text: string }>): void {
    // 从后往前应用编辑，避免位置偏移
    const reversedEdits = [...edits].reverse()
    for (const edit of reversedEdits) {
      this.replaceRange(edit.range, edit.text)
    }
  }

  // ========== Pending 编辑操作 ==========
  createPendingEdit(edit: Omit<PendingEdit, 'id'>): string {
    const id = `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const pendingEdit: PendingEdit = {
      ...edit,
      id
    }
    this.pendingEdits.set(id, pendingEdit)
    return id
  }

  applyPendingEdit(id: string): void {
    const edit = this.pendingEdits.get(id)
    if (!edit) return

    try {
      switch (edit.type) {
        case 'insert':
          if (edit.position) {
            this.insertAt(edit.position, edit.text)
          }
          break
        case 'delete':
          if (edit.range) {
            this.deleteRange(edit.range)
          }
          break
        case 'replace':
          if (edit.range) {
            this.replaceRange(edit.range, edit.text)
          }
          break
      }
      this.pendingEdits.delete(id)
    } catch (error) {
      console.warn('applyPendingEdit:error', error)
    }
  }

  rejectPendingEdit(id: string): void {
    this.pendingEdits.delete(id)
  }

  getPendingEdits(): PendingEdit[] {
    return Array.from(this.pendingEdits.values())
  }

  clearPendingEdits(): void {
    this.pendingEdits.clear()
  }

  // ========== 辅助方法 ==========
  private getOffsetFromRange(root: HTMLElement, node: Node, offset: number): number {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let charIndex = 0
    let currentNode = walker.nextNode() as Text | null

    while (currentNode) {
      if (currentNode === node) {
        return charIndex + offset
      }
      charIndex += currentNode.length
      currentNode = walker.nextNode() as Text | null
    }

    return charIndex
  }

  /**
   * 将当前编辑区状态记入 Vditor 的 diff 撤销栈（与工具栏 undo/redo、全局 Ctrl+Z 使用同一套栈）。
   * 查找替换等绕过 irInput 的 DOM 修改不会触发 debounce 的 processAfterRender，需在此处补记。
   */
  private pushVditorUndoSnapshot(): void {
    const instance = this.getInstance() as {
      vditor?: { undo?: { addToUndoStack: (v: unknown) => void } }
    } | null
    const iv = instance?.vditor
    if (!iv?.undo?.addToUndoStack) return
    try {
      iv.undo.addToUndoStack(iv)
    } catch (error) {
      console.warn('pushVditorUndoSnapshot failed', error)
    }
  }

  private syncAfterMutation() {
    const instance = this.getInstance()
    if (!instance) return
    try {
      const markdown = instance.getValue() ?? ''
      this.syncMarkdown(markdown)
      this.pushVditorUndoSnapshot()
    } catch (error) {
      console.warn('syncAfterMutation:getValue failed', error)
    }
  }

  private clearHighlights() {
    this.highlights.forEach(({ element }) => {
      const parent = element.parentNode
      if (!parent) return
      const textNode = document.createTextNode(element.textContent ?? '')
      parent.replaceChild(textNode, element)
      parent.normalize()
    })
    this.highlights = []
  }

  private setActiveHighlight(index: number, opts?: { focus?: boolean }) {
    const shouldFocus = opts?.focus !== false
    this.highlights.forEach((highlight, idx) => {
      if (idx === index && index >= 0) {
        highlight.element.classList.add(ACTIVE_CLASS)
        if (shouldFocus) {
          const range = document.createRange()
          range.selectNodeContents(highlight.element)
          const selection = window.getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
          highlight.element.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      } else {
        highlight.element.classList.remove(ACTIVE_CLASS)
      }
    })
    if (index < 0 && shouldFocus) {
      window.getSelection()?.removeAllRanges()
    }
  }

  private computeReplacementText(highlight: HighlightMatch, replacement: string): string {
    let result = replacement
    if (this.state.options.useRegex && highlight.groups && highlight.groups.length > 0) {
      // 处理 $1, $2, $3... 等捕获组引用
      // 同时也支持 $$ 表示字面量 $
      result = result.replace(/\$(\d+)|(\$\$)/g, (fullMatch, indexStr, literalDollar) => {
        // 如果是 $$，返回单个 $
        if (literalDollar) {
          return '$'
        }
        // 如果是 $1, $2 等，返回对应的捕获组
        const index = Number(indexStr)
        if (Number.isNaN(index) || index < 0 || index >= highlight.groups!.length) {
          return fullMatch // 如果索引无效，返回原始字符串
        }
        return highlight.groups![index] ?? ''
      })
    }
    if (this.state.options.preserveCase) {
      result = this.adjustCase(highlight.text, result)
    }
    return result
  }

  private adjustCase(source: string, target: string): string {
    if (!source) return target
    if (source === source.toUpperCase()) {
      return target.toUpperCase()
    }
    if (source === source.toLowerCase()) {
      return target.toLowerCase()
    }
    if (
      source[0] === source[0].toUpperCase() &&
      source.slice(1) === source.slice(1).toLowerCase()
    ) {
      return target.charAt(0).toUpperCase() + target.slice(1)
    }
    return target
  }

  private shouldSkipNode(element: Element | null): boolean {
    if (!element) return false
    if (element.classList.contains('md-editor-search-ignore')) {
      return true
    }
    const forbiddenSelectors = [
      '.vditor-ir__math',
      '.vditor-ir__preview',
      '.vditor-wysiwyg__block',
      '.vditor-panel',
      '.vditor-copy'
    ]
    return forbiddenSelectors.some((selector) => element.closest(selector))
  }

  private buildRegex(options: SearchOptions): RegExp {
    if (options.useRegex) {
      const flags = options.matchCase ? 'g' : 'gi'
      return new RegExp(options.text, flags)
    }
    const escaped = options.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = options.wholeWord ? `(?<!\\w)${escaped}(?!\\w)` : escaped
    const flags = options.matchCase ? 'g' : 'gi'
    return new RegExp(pattern, flags)
  }

  private getEditableRoot(): HTMLElement | null {
    const instance = this.getInstance()
    const internal = (instance as any)?.vditor
    if (!internal) return null
    const mode = internal.currentMode ?? 'ir'
    const element = internal[mode]?.element as HTMLElement | undefined
    return element ?? null
  }

  private getRangeFromElement(element: HTMLElement): TextRange {
    const preSelection = document.createRange()
    const root = this.getEditableRoot()
    if (!root) {
      return {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 }
      }
    }
    preSelection.selectNodeContents(root)
    preSelection.setEndBefore(element)
    const startOffset = preSelection.toString().length
    const textContent = element.textContent ?? ''
    const endOffset = startOffset + textContent.length
    const plain = this.getPlainText(root)
    const start = this.offsetToPosition(plain, startOffset)
    const end = this.offsetToPosition(plain, endOffset)
    return { start, end }
  }

  private getPlainText(root: HTMLElement): string {
    return root.innerText.replace(/\r\n/g, '\n')
  }

  private positionToOffset(text: string, position: TextPosition): number {
    const lines = text.split('\n')
    const lineIndex = Math.max(0, Math.min(position.line - 1, lines.length - 1))
    let offset = 0
    for (let i = 0; i < lineIndex; i += 1) {
      offset += lines[i].length + 1
    }
    const column = Math.max(0, position.column - 1)
    return offset + Math.min(column, lines[lineIndex].length)
  }

  private offsetToPosition(text: string, offset: number): TextPosition {
    const lines = text.split('\n')
    let remaining = offset
    for (let i = 0; i < lines.length; i += 1) {
      const lineLength = lines[i].length + 1
      if (remaining < lineLength) {
        return { line: i + 1, column: remaining + 1 }
      }
      remaining -= lineLength
    }
    const lastLine = lines.length
    return { line: lastLine, column: lines[lastLine - 1].length + 1 }
  }

  private setSelectionByOffset(root: HTMLElement, start: number, end: number): void {
    const selection = window.getSelection()
    if (!selection) return
    const range = document.createRange()
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let charIndex = 0
    let foundStart = false
    let currentNode = walker.nextNode() as Text | null

    while (currentNode) {
      const nextIndex = charIndex + currentNode.length
      if (!foundStart && start >= charIndex && start <= nextIndex) {
        range.setStart(currentNode, start - charIndex)
        foundStart = true
      }
      if (foundStart && end >= charIndex && end <= nextIndex) {
        range.setEnd(currentNode, end - charIndex)
        break
      }
      charIndex = nextIndex
      currentNode = walker.nextNode() as Text | null
    }

    if (!foundStart) {
      range.selectNodeContents(root)
      range.collapse(false)
    }

    selection.removeAllRanges()
    selection.addRange(range)
  }
}

export function createVditorAdapter(options: VditorAdapterOptions): VditorTextEditorAdapter {
  return new VditorTextEditorAdapter(options)
}
