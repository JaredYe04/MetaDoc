/**
 * 编辑器适配器实现
 * 为不同的编辑器（Markdown/Vditor, LaTeX/Monaco）提供统一的接口
 */

import { EditorAdapter, EditRequest } from './ai-completion-service'
import * as monaco from 'monaco-editor'
import eventBus, { getWindowType } from './event-bus'
import { createRendererLogger } from './logger'

/**
 * Monaco编辑器适配器（用于LaTeX）
 * 注意：不能保存editor实例，每次使用时都需要重新获取
 */
export class MonacoEditorAdapter implements EditorAdapter {
  private editorId: string | null = null
  private isActiveRef: () => boolean

  constructor(editorId: string, isActiveRef: () => boolean) {
    this.editorId = editorId
    this.isActiveRef = isActiveRef
  }

  /**
   * 获取编辑器实例（每次都重新获取，不保存）
   */
  private getEditor(): monaco.editor.IStandaloneCodeEditor | null {
    if (!this.editorId) return null

    const editors = monaco.editor.getEditors() || []
    const editor = editors.find(
      (e) => e.getId?.() === this.editorId
    ) as monaco.editor.IStandaloneCodeEditor | null

    return editor || null
  }

  getEditorId(): string | null {
    return this.editorId
  }

  getCursorPosition(): { line: number; column: number } | null {
    const editor = this.getEditor()
    if (!editor) return null

    const position = editor.getPosition()
    if (!position) return null

    return {
      line: position.lineNumber,
      column: position.column
    }
  }

  getContextAroundCursor(
    contextSize: number = 1000
  ): { preContext: string; postContext: string } | null {
    const editor = this.getEditor()
    if (!editor) return null

    const model = editor.getModel()
    if (!model) return null

    const position = editor.getPosition()
    if (!position) return null

    // 转换为offset
    const caretOffset = model.getOffsetAt(position)
    const fullLength = model.getOffsetAt(model.getFullModelRange().getEndPosition())

    const startOffset = Math.max(0, caretOffset - contextSize)
    const endOffset = Math.min(fullLength, caretOffset + contextSize)

    const fullText = model.getValue()
    const preContext = fullText.slice(startOffset, caretOffset)
    const postContext = fullText.slice(caretOffset, endOffset)

    // 记录上下文获取的详细信息，用于调试位置偏差
    const logger = createRendererLogger('MonacoEditorAdapter', {
      windowTypeProvider: () => getWindowType()
    })

    // 计算光标所在行的内容
    const lineContent = model.getLineContent(position.lineNumber)
    const lineStartOffset = model.getOffsetAt(new monaco.Position(position.lineNumber, 1))
    const columnInLine = position.column - 1

    logger.debug('Monaco获取上下文', {
      cursorPosition: {
        line: position.lineNumber,
        column: position.column,
        offset: caretOffset
      },
      lineInfo: {
        lineNumber: position.lineNumber,
        lineContent: lineContent,
        lineLength: lineContent.length,
        columnInLine: columnInLine,
        charAtCursor: lineContent[columnInLine] || '(行尾)',
        lineStartOffset: lineStartOffset
      },
      contextRange: {
        startOffset: startOffset,
        endOffset: endOffset,
        preContextLength: preContext.length,
        postContextLength: postContext.length
      },
      preContext: {
        length: preContext.length,
        last100Chars: preContext.slice(-100),
        endsWithNewline: preContext.endsWith('\n')
      },
      // postContext: {
      //   length: postContext.length,
      //   first100Chars: postContext.slice(0, 100),
      //   startsWithNewline: postContext.startsWith('\n')
      // },
      surroundingText: {
        beforeCursor: lineContent.slice(Math.max(0, columnInLine - 20), columnInLine),
        afterCursor: lineContent.slice(
          columnInLine,
          Math.min(lineContent.length, columnInLine + 20)
        ),
        fullLine: lineContent
      }
    })

    return { preContext, postContext }
  }

  getFullText(): string {
    const editor = this.getEditor()
    if (!editor) return ''

    const model = editor.getModel()
    return model?.getValue() || ''
  }

  isActive(): boolean {
    return this.isActiveRef()
  }

  /**
   * 检查光标是否在行尾或块尾
   */
  isCursorAtLineEnd(): boolean {
    const editor = this.getEditor()
    if (!editor) return false

    const model = editor.getModel()
    if (!model) return false

    const position = editor.getPosition()
    if (!position) return false

    // 检查是否有选择（如果有选择，不是行尾）
    const selection = editor.getSelection()
    if (selection && !selection.isEmpty()) {
      return false
    }

    // 获取当前行内容
    const lineContent = model.getLineContent(position.lineNumber)
    const lineLength = lineContent.length

    // 检查光标是否在行尾
    if (position.column > lineLength + 1) {
      return false
    }

    // 光标在行尾（考虑行尾可能有空格）
    return position.column >= lineLength
  }

  /**
   * 获取当前行的内容
   */
  getCurrentLineContent(): string | null {
    const editor = this.getEditor()
    if (!editor) return null

    const model = editor.getModel()
    if (!model) return null

    const position = editor.getPosition()
    if (!position) return null

    return model.getLineContent(position.lineNumber)
  }

  /**
   * 获取最后一个输入的字符
   */
  getLastChar(): string | null {
    const editor = this.getEditor()
    if (!editor) return null

    const model = editor.getModel()
    if (!model) return null

    const position = editor.getPosition()
    if (!position) return null

    const lineContent = model.getLineContent(position.lineNumber)
    const column = position.column - 1

    if (column <= 0 || column > lineContent.length) {
      return null
    }

    return lineContent[column - 1] || null
  }

  /**
   * 应用编辑请求（Monaco特有）
   * 注意：通过editor操作，不直接操作model
   */
  applyEdit(request: EditRequest, content: string) {
    const editor = this.getEditor()
    if (!editor) return

    const range = new monaco.Range(
      request.range.start.line,
      request.range.start.column,
      request.range.end.line,
      request.range.end.column
    )

    // 使用editor.executeEdits而不是model.applyEdits
    // 第三个参数应该是undefined，而不是空数组，避免Monaco内部错误
    editor.executeEdits(
      'ai-completion-apply',
      [
        {
          range,
          text: content
        }
      ],
      undefined
    )
  }
}

/**
 * Vditor编辑器适配器（用于Markdown）
 */
export class VditorEditorAdapter implements EditorAdapter {
  private vditorInstance: any | null = null
  private rootNodeClass: string
  private isActiveRef: () => boolean
  /** 与 AI 补全总线事件 `sourceEditorId` 对齐，多标签页下须唯一（例如 `vditor:<tabId>`） */
  private readonly completionSourceId: string

  constructor(
    vditorInstance: any,
    rootNodeClass: string,
    isActiveRef?: () => boolean,
    completionSourceId?: string
  ) {
    this.vditorInstance = vditorInstance
    this.rootNodeClass = rootNodeClass
    this.isActiveRef = isActiveRef || (() => false)
    this.completionSourceId = completionSourceId ?? 'vditor'
  }

  getEditorId(): string | null {
    return this.completionSourceId
  }

  getCursorPosition(): { line: number; column: number } | null {
    // Vditor使用DOM选择，需要从Selection获取位置
    // 参考AISuggestion.vue和MarkdownEditor.vue的实现
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null

    const range = sel.getRangeAt(0)
    if (!range) return null

    // 获取Vditor的编辑器内容区域
    // Vditor不同模式的实际编辑器位置：
    // - IR模式: vditorInstance.ir.element
    // - WYSIWYG模式: vditorInstance.wysiwyg.element
    const vditorInstance = this.vditorInstance?.vditor
    if (!vditorInstance) return null

    // 获取当前模式
    const currentMode = vditorInstance.currentMode || 'ir'

    // 根据模式获取编辑器元素
    let editorElement: HTMLElement | null = null
    if (currentMode === 'ir') {
      editorElement = vditorInstance.ir?.element || null
    } else if (currentMode === 'wysiwyg') {
      editorElement = vditorInstance.wysiwyg?.element || null
    }

    // 如果没找到，尝试通用方法
    if (!editorElement) {
      editorElement = vditorInstance.element || null
    }

    if (!editorElement) {
      const logger = createRendererLogger('VditorEditorAdapter', {
        windowTypeProvider: () => getWindowType()
      })
      logger.warn('无法找到Vditor编辑器元素', {
        hasVditorInstance: !!this.vditorInstance,
        hasVditor: !!vditorInstance,
        currentMode,
        hasIr: !!vditorInstance?.ir,
        hasWysiwyg: !!vditorInstance?.wysiwyg,
        hasSv: !!vditorInstance?.sv,
        hasElement: !!vditorInstance?.element
      })
      return null
    }

    // 获取完整的markdown文本
    const fullText = this.getFullText()
    if (!fullText) return null

    // 计算光标在文本中的位置
    // 使用Range API计算从根元素到光标位置的文本长度
    try {
      // 使用更可靠的方法：通过遍历所有文本节点并计算offset
      let offset = 0
      const walker = document.createTreeWalker(
        editorElement,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: () => NodeFilter.FILTER_ACCEPT
        }
      )

      // 辅助函数：获取元素中的第一个文本节点
      const getFirstTextNode = (element: Node): Node | null => {
        if (element.nodeType === Node.TEXT_NODE) {
          return element
        }
        if (element.nodeType === Node.ELEMENT_NODE) {
          for (let i = 0; i < element.childNodes.length; i++) {
            const child = element.childNodes[i]
            if (child.nodeType === Node.TEXT_NODE) {
              return child
            }
            const textNode = getFirstTextNode(child)
            if (textNode) return textNode
          }
        }
        return null
      }

      // 辅助函数：获取元素中的最后一个文本节点
      const getLastTextNode = (element: Node): Node | null => {
        if (element.nodeType === Node.TEXT_NODE) {
          return element
        }
        if (element.nodeType === Node.ELEMENT_NODE) {
          for (let i = element.childNodes.length - 1; i >= 0; i--) {
            const child = element.childNodes[i]
            if (child.nodeType === Node.TEXT_NODE) {
              return child
            }
            const textNode = getLastTextNode(child)
            if (textNode) return textNode
          }
        }
        return null
      }

      // 如果range.startContainer是元素节点，需要找到其中的文本节点
      // 如果range.startContainer是文本节点，直接使用
      let targetNode: Node | null = range.startContainer
      let targetOffset = range.startOffset

      if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
        // 如果光标在元素节点内，需要找到对应的文本节点
        const element = range.startContainer as Element
        const childNodes = element.childNodes

        // 如果offset指向某个子节点
        if (targetOffset < childNodes.length) {
          const childNode = childNodes[targetOffset]
          if (childNode.nodeType === Node.TEXT_NODE) {
            targetNode = childNode
            targetOffset = 0
          } else if (childNode.nodeType === Node.ELEMENT_NODE) {
            // 如果子节点是元素，尝试找到其中的第一个文本节点
            const firstTextNode = getFirstTextNode(childNode)
            if (firstTextNode) {
              targetNode = firstTextNode
              targetOffset = 0
            }
          }
        } else if (childNodes.length > 0) {
          // 如果offset超出子节点数量，使用最后一个文本节点
          const lastTextNode = getLastTextNode(element)
          if (lastTextNode) {
            targetNode = lastTextNode
            targetOffset = lastTextNode.textContent?.length || 0
          }
        } else {
          // 如果元素没有子节点，尝试找到元素内的第一个文本节点
          const firstTextNode = getFirstTextNode(element)
          if (firstTextNode) {
            targetNode = firstTextNode
            targetOffset = 0
          }
        }
      } else if (range.startContainer.nodeType === Node.TEXT_NODE) {
        // 如果已经是文本节点，直接使用
        targetNode = range.startContainer
        targetOffset = range.startOffset
      }

      let node: Node | null
      let found = false
      while ((node = walker.nextNode())) {
        if (node === targetNode) {
          // 到达目标节点，加上offset
          offset += targetOffset
          found = true
          break
        } else if (node.nodeType === Node.TEXT_NODE) {
          // 累加文本节点长度
          const text = node.textContent || ''
          offset += text.length
        }
      }

      // 如果没找到目标节点，尝试使用Range.toString()作为fallback
      if (!found) {
        try {
          const measureRange = document.createRange()
          measureRange.setStart(editorElement, 0)
          measureRange.setEnd(range.startContainer, range.startOffset)

          // 对于SV模式，Range.toString()可能无法正确处理换行符
          // 所以我们需要手动计算
          const textBeforeCursor = measureRange.toString()
          offset = textBeforeCursor.length
        } catch (e) {
          // 如果Range操作失败，使用之前计算的offset
        }
      }

      // 转换为行号和列号
      // 确保offset不超过文本长度
      const safeOffset = Math.min(offset, fullText.length)
      const textBeforeCursor = fullText.substring(0, safeOffset)
      const lines = textBeforeCursor.split('\n')
      return {
        line: lines.length,
        column: lines[lines.length - 1].length + 1
      }
    } catch (error) {
      const logger = createRendererLogger('VditorEditorAdapter', {
        windowTypeProvider: () => getWindowType()
      })
      logger.error('计算光标位置失败', error)
      return null
    }
  }

  getContextFromCursor(
    range: Range,
    contextSize: number = 1000
  ): { preContext: string; postContext: string } {
    let preContext = ''
    let postContext = ''

    if (!range) return { preContext, postContext }

    // 向前收集
    let preRange = range.cloneRange()
    preRange.collapse(true)
    let chars = 0
    let node = preRange.startContainer
    let offset = preRange.startOffset

    while (node && chars < contextSize) {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).classList?.contains(this.rootNodeClass)
      ) {
        break
      }
      if (node.nodeType === Node.TEXT_NODE) {
        const sliceLen = Math.min(offset, contextSize - chars)
        preContext = (node.textContent || '').slice(offset - sliceLen, offset) + preContext
        chars += sliceLen
        offset = 0
      }
      node = this.getPreviousTextNode(node) as Node
      if (node) offset = (node.textContent || '').length
    }

    // 向后收集
    let postRange = range.cloneRange()
    postRange.collapse(false)
    chars = 0
    node = postRange.startContainer
    offset = postRange.startOffset

    while (node && chars < contextSize) {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).classList?.contains(this.rootNodeClass)
      ) {
        break
      }
      if (node.nodeType === Node.TEXT_NODE) {
        const sliceLen = Math.min((node.textContent || '').length - offset, contextSize - chars)
        postContext += (node.textContent || '').slice(offset, offset + sliceLen)
        chars += sliceLen
        offset = 0
      }
      node = this.getNextTextNode(node) as Node
    }

    return { preContext, postContext }
  }

  getContextAroundCursor(
    contextSize: number = 1000
  ): { preContext: string; postContext: string } | null {
    // 对于所有模式，都使用DOM遍历方法获取上下文，这样更可靠
    // 参考AISuggestion.vue中的getContextFromCursor实现
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    return this.getContextFromCursor(range, contextSize)
  }

  getFullText(): string {
    if (!this.vditorInstance) return ''
    return this.vditorInstance.getValue() || ''
  }

  isActive(): boolean {
    return this.isActiveRef()
  }

  /**
   * 检查光标是否在行尾或块尾
   */
  isCursorAtLineEnd(): boolean {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return false

    const range = sel.getRangeAt(0)
    if (!range) return false

    // 检查是否有选择（如果有选择，不是行尾）
    if (!range.collapsed) {
      return false
    }

    // 获取当前文本节点
    const textNode = range.startContainer
    if (textNode.nodeType !== Node.TEXT_NODE) {
      return false
    }

    const text = textNode.textContent || ''
    const offset = range.startOffset

    // 检查是否在文本节点末尾
    if (offset < text.length) {
      return false
    }

    // 检查是否在行尾（检查下一个字符是否是换行符或不存在）
    const nextSibling = textNode.nextSibling
    if (nextSibling) {
      // 如果有下一个节点，检查是否是块级元素
      if (nextSibling.nodeType === Node.ELEMENT_NODE) {
        const element = nextSibling as Element
        const blockElements = [
          'P',
          'DIV',
          'H1',
          'H2',
          'H3',
          'H4',
          'H5',
          'H6',
          'UL',
          'OL',
          'LI',
          'BLOCKQUOTE',
          'PRE',
          'CODE'
        ]
        if (blockElements.includes(element.tagName)) {
          return true
        }
      }
    }

    // 检查文本节点末尾是否有换行符
    return text.endsWith('\n') || offset === text.length
  }

  /**
   * 获取当前行的内容
   */
  getCurrentLineContent(): string | null {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null

    const range = sel.getRangeAt(0)
    if (!range) return null

    // 向上查找包含当前行的元素
    let node: Node | null = range.startContainer
    while (node && node.nodeType !== Node.ELEMENT_NODE) {
      node = node.parentNode
    }

    if (!node) return null

    const element = node as Element
    return element.textContent || null
  }

  /**
   * 获取最后一个输入的字符
   */
  getLastChar(): string | null {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null

    const range = sel.getRangeAt(0)
    if (!range) return null

    const textNode = range.startContainer
    if (textNode.nodeType !== Node.TEXT_NODE) {
      return null
    }

    const text = textNode.textContent || ''
    const offset = range.startOffset

    if (offset <= 0) {
      return null
    }

    return text[offset - 1] || null
  }

  /**
   * 获取前一个文本节点
   */
  private getPreviousTextNode(node: Node | null): Node | null {
    if (!node) return null
    if (node.previousSibling) {
      let prev = node.previousSibling
      while (prev && prev.nodeType !== Node.TEXT_NODE) {
        if (prev.lastChild) prev = prev.lastChild
        else prev = prev.previousSibling as ChildNode
      }
      return prev
    }
    return node.parentNode
  }

  /**
   * 获取下一个文本节点
   */
  private getNextTextNode(node: Node | null): Node | null {
    if (!node) return null
    if (node.nextSibling) {
      let next = node.nextSibling
      while (next && next.nodeType !== Node.TEXT_NODE) {
        if (next.firstChild) next = next.firstChild
        else next = next.nextSibling as ChildNode
      }
      return next
    }
    return node.parentNode
  }

  /**
   * 应用编辑请求（Vditor特有）
   */
  applyEdit(request: EditRequest, content: string) {
    if (!this.vditorInstance) return

    // Vditor使用insertValue方法插入文本
    // 注意：这里简化实现，实际应该根据range定位插入位置
    this.vditorInstance.insertValue(content)
  }
}
