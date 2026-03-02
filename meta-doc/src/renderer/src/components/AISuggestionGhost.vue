<template>
  <!-- ghostText渲染组件，对用户完全透明 -->
  <div v-if="false"></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { themeState } from '../utils/themes'
import { aiCompletionService } from '../utils/ai-completion-service'
import eventBus, { getWindowType } from '../utils/event-bus'
import { createRendererLogger } from '../utils/logger'
import * as monaco from 'monaco-editor'
import '../assets/ai-suggestion.css'

const { t } = useI18n()

const logger = createRendererLogger('AISuggestionGhost', {
  windowTypeProvider: () => getWindowType()
})

const props = defineProps<{
  editorId?: string | null
  format: 'md' | 'tex' | 'txt'
  targetEl?: HTMLElement | null
  rootNodeClass?: string
}>()

const emits = defineEmits<{
  accepted: [text: string]
  cancelled: []
}>()

// Ghost text状态
let ghostDecoration: string[] = []
let ghostRange: monaco.Range | null = null
let ghostStartPosition: monaco.Position | null = null
let suggestionEl: HTMLElement | null = null
let tooltipEl: HTMLElement | null = null

// 保存handler引用以便卸载时使用
let textUpdateHandler: ((event: unknown) => void) | null = null

/**
 * 获取Monaco编辑器实例
 */
function getEditor(): monaco.editor.IStandaloneCodeEditor | null {
  const editors = monaco.editor.getEditors() || []

  // 如果提供了editorId，优先使用它
  if (props.editorId) {
    const found = editors.find(
      (e) => e.getId?.() === props.editorId
    ) as monaco.editor.IStandaloneCodeEditor | null
    if (found) {
      return found
    }
  }

  // 如果没有editorId或找不到，尝试获取当前聚焦的编辑器
  for (const editor of editors) {
    if (editor.hasTextFocus && editor.hasTextFocus()) {
      return editor as monaco.editor.IStandaloneCodeEditor
    }
  }

  // 如果找不到聚焦的编辑器，返回第一个（向后兼容）
  if (editors.length > 0) {
    return editors[0] as monaco.editor.IStandaloneCodeEditor
  }

  return null
}

/**
 * 更新Monaco的Ghost Text
 * 参考AISuggestion.vue的实现：先插入文本，然后用装饰显示样式
 */
function updateMonacoGhostText(text: string) {
  // 获取editor实例
  const currentEditor = getEditor()
  if (!currentEditor) {
    return
  }

  const currentPosition = currentEditor.getPosition()
  if (!currentPosition) {
    return
  }

  // 如果起始位置不存在，则初始化
  if (!ghostStartPosition) {
    ghostStartPosition = currentPosition
  }

  const startLine = ghostStartPosition.lineNumber
  const startColumn = ghostStartPosition.column
  const lines = text.split('\n')

  // 计算结束位置（正确处理多行，包括空行）
  const endLine = startLine + lines.length - 1
  let endColumn: number

  if (lines.length === 1) {
    // 单行：结束列 = 起始列 + 文本长度
    endColumn = startColumn + lines[0].length
  } else {
    // 多行：结束列 = 最后一行的长度 + 1（+1 是因为列号从1开始）
    // 如果最后一行是空的（比如文本以 \n 结尾），endColumn 应该是 1
    const lastLineLength = lines[lines.length - 1].length
    endColumn = lastLineLength > 0 ? lastLineLength + 1 : 1
  }

  // 确保范围有效
  const model = currentEditor.getModel()
  if (model) {
    const maxLine = model.getLineCount()
    const endLineInModel = Math.min(endLine, maxLine)
    if (endLineInModel < endLine) {
      // 如果计算出的结束行超出了模型范围，使用模型的最大行
      const maxLineLength = model.getLineContent(maxLine).length
      endColumn = Math.min(endColumn, maxLineLength + 1)
    } else if (endLineInModel === endLine) {
      // 确保结束列不超过该行的长度
      const actualLineLength = model.getLineContent(endLine).length
      endColumn = Math.min(endColumn, actualLineLength + 1)
    }
  }

  const newRange = new monaco.Range(startLine, startColumn, endLine, endColumn)

  logger.debug('Ghost Text范围（多行支持）', {
    startLine,
    startColumn,
    endLine,
    endColumn,
    linesCount: lines.length,
    textLength: text.length,
    hasNewlines: text.includes('\n'),
    lastLineLength: lines[lines.length - 1].length,
    hasExistingRange: !!ghostRange
  })

  // 保存光标原始位置
  const originalPosition = ghostStartPosition

  try {
    // 通知LaTeXEditor开始更新ghost text（通过事件总线）
    eventBus.emit('ai-ghost-text-updating', true)

    const model = currentEditor.getModel()
    if (!model) {
      eventBus.emit('ai-ghost-text-updating', false)
      return
    }

    let editRange: monaco.Range
    const isFirstInsert = !ghostRange

    if (ghostRange) {
      // 更新：使用之前插入的文本范围来替换
      editRange = ghostRange
    } else {
      // 第一次插入：使用光标位置作为插入点（单点范围，start = end）
      editRange = new monaco.Range(startLine, startColumn, startLine, startColumn)
    }

    // 只在第一次插入时创建撤销停止点，后续更新不创建（避免撤销堆栈混乱）
    if (isFirstInsert) {
      currentEditor.pushUndoStop()
    }

    // 使用model.applyEdits，与AISuggestion.vue保持一致
    model.applyEdits([
      {
        range: editRange,
        text: text,
        forceMoveMarkers: true
      }
    ])

    // 重要：立即计算ghostRange，不等待setTimeout
    // 这样Tab命令触发时ghostRange已经存在
    const lines = text.split('\n')
    const actualStartLine = startLine
    const actualStartColumn = startColumn
    const actualEndLine = actualStartLine + lines.length - 1
    let actualEndColumn: number

    if (lines.length === 1) {
      // 单行：结束列 = 起始列 + 文本长度
      actualEndColumn = actualStartColumn + lines[0].length
    } else {
      // 多行：结束列 = 最后一行的长度 + 1
      const lastLineLength = lines[lines.length - 1].length
      actualEndColumn = lastLineLength > 0 ? lastLineLength + 1 : 1
    }

    // 验证范围（确保在model范围内）
    const validatedStart = model.validatePosition(
      new monaco.Position(actualStartLine, actualStartColumn)
    )
    let validatedEnd = model.validatePosition(new monaco.Position(actualEndLine, actualEndColumn))

    // 如果结束行超出了model范围，使用model的最后一行
    if (validatedEnd.lineNumber > model.getLineCount()) {
      const lastLine = model.getLineCount()
      const lastLineLength = model.getLineContent(lastLine).length
      validatedEnd = new monaco.Position(lastLine, Math.min(actualEndColumn, lastLineLength + 1))
    }

    // 立即设置ghostRange，不等待setTimeout
    ghostRange = new monaco.Range(
      validatedStart.lineNumber,
      validatedStart.column,
      validatedEnd.lineNumber,
      validatedEnd.column
    )

    logger.debug('Ghost Range已立即设置', {
      range: ghostRange.toString(),
      textLength: text.length,
      stackTrace: new Error().stack?.split('\n').slice(1, 4).join('\n')
    })

    // 应用装饰到插入的文本范围
    const className =
      themeState.currentTheme.type === 'dark' ? 'ai-suggestion-insert-dark' : 'ai-suggestion-insert'

    try {
      ghostDecoration = currentEditor.deltaDecorations(ghostDecoration || [], [
        {
          range: ghostRange,
          options: {
            inlineClassName: className,
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
          }
        }
      ])
    } catch (error) {
      logger.error('应用装饰时出错', error)
    }

    // 通知LaTeXEditor完成更新ghost text
    setTimeout(() => {
      eventBus.emit('ai-ghost-text-updating', false)
    }, 0)

    // 装饰将在executeEdits完成后在setTimeout中应用（见上面）

    // 显示提示信息
    showTooltip(originalPosition)

    // 强制锁定光标在原始位置（确保用户输入不受影响）
    currentEditor.setPosition(originalPosition)
    currentEditor.revealPositionInCenterIfOutsideViewport(originalPosition)
  } catch (error) {
    logger.error('更新Monaco Ghost Text失败', error)
  }
}

/**
 * 显示提示信息
 */
function showTooltip(position: monaco.Position) {
  hideTooltip()

  const currentEditor = getEditor()
  if (!currentEditor) return

  const domNode = currentEditor.getDomNode()
  if (!domNode) return

  tooltipEl = document.createElement('div')
  tooltipEl.className = 'ai-suggestion-tooltip'
  tooltipEl.textContent = t('aiSuggestion.tooltip', '按 Tab 接受，按 ESC 取消')
  tooltipEl.style.position = 'fixed'
  tooltipEl.style.padding = '4px 8px'
  tooltipEl.style.background =
    themeState.currentTheme.type === 'dark' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.7)'
  tooltipEl.style.color = themeState.currentTheme.textColor
  tooltipEl.style.borderRadius = '4px'
  tooltipEl.style.fontSize = '12px'
  tooltipEl.style.pointerEvents = 'none'
  tooltipEl.style.whiteSpace = 'nowrap'
  tooltipEl.style.zIndex = '10000'

  // 获取光标位置（使用getScrolledVisiblePosition）
  try {
    const coords = currentEditor.getScrolledVisiblePosition(position)
    if (coords) {
      const editorCoords = domNode.getBoundingClientRect()
      tooltipEl.style.left = `${editorCoords.left + coords.left}px`
      tooltipEl.style.top = `${editorCoords.top + coords.top - 25}px`
    } else {
      // 如果getScrolledVisiblePosition返回null，使用备用方法（基于光标位置计算）
      const editorCoords = domNode.getBoundingClientRect()
      // 计算大致位置（Monaco的字符宽度约为8-10px）
      const lineHeight = currentEditor.getOption(monaco.editor.EditorOption.lineHeight)
      const fontSize = currentEditor.getOption(monaco.editor.EditorOption.fontSize)
      const charWidth = fontSize * 0.6 // 估算字符宽度
      const x = (position.column - 1) * charWidth
      const y = (position.lineNumber - 1) * lineHeight
      tooltipEl.style.left = `${editorCoords.left + x + 20}px`
      tooltipEl.style.top = `${editorCoords.top + y - 25}px`
    }
  } catch (error) {
    logger.warn('获取光标位置失败，使用备用方法', error)
    // 如果API不可用，使用备用方法
    const editorCoords = domNode.getBoundingClientRect()
    tooltipEl.style.left = `${editorCoords.left + 20}px`
    tooltipEl.style.top = `${editorCoords.top + 20}px`
  }

  document.body.appendChild(tooltipEl)
}

/**
 * 隐藏提示信息
 */
function hideTooltip() {
  if (tooltipEl) {
    tooltipEl.remove()
    tooltipEl = null
  }
}

/**
 * 取消Monaco的Ghost Text
 * 需要删除已插入的文本，然后清理装饰
 */
function cancelMonacoGhostText() {
  if (!ghostRange) return

  // 获取editor实例
  const currentEditor = getEditor()
  if (!currentEditor) return

  // 通知LaTeXEditor开始更新ghost text（防止触发新的补全）
  eventBus.emit('ai-ghost-text-updating', true)

  try {
    // 删除已插入的ghost text（使用model.applyEdits，与AISuggestion.vue保持一致）
    const model = currentEditor.getModel()
    if (model) {
      model.applyEdits([
        {
          range: ghostRange,
          text: '',
          forceMoveMarkers: true
        }
      ])
    }

    // 清理装饰
    if (ghostDecoration && ghostDecoration.length > 0) {
      currentEditor.deltaDecorations(ghostDecoration, [])
    }
    ghostDecoration = []
    ghostRange = null
    ghostStartPosition = null

    // 通知LaTeXEditor完成更新ghost text
    setTimeout(() => {
      eventBus.emit('ai-ghost-text-updating', false)
    }, 0)
  } catch (error) {
    // 忽略取消错误
    // 即使出错也要清理状态
    ghostDecoration = []
    ghostRange = null
    ghostStartPosition = null
    eventBus.emit('ai-ghost-text-updating', false)
  }

  // 隐藏提示
  hideTooltip()
}

/**
 * 接受Monaco的Ghost Text
 * 参考AISuggestion.vue的实现：文本已经在model中，只需要清理装饰即可
 */
function acceptMonacoGhostText(text: string) {
  if (!ghostRange) return

  // 获取editor实例
  const currentEditor = getEditor()
  if (!currentEditor) return

  // 保存ghostRange的结束位置，用于移动光标
  const endPosition = new monaco.Position(ghostRange.endLineNumber, ghostRange.endColumn)

  // 通知LaTeXEditor开始更新ghost text（防止触发新的补全）
  eventBus.emit('ai-ghost-text-updating', true)

  try {
    // 重要：在接受补全时创建撤销停止点，确保撤销操作可以正确撤销整个补全
    // 这样用户撤销时会撤销整个补全内容，而不是部分内容
    currentEditor.pushUndoStop()

    // 清理ghost text装饰（文本已经在model中，移除装饰后自然显示）
    if (ghostDecoration && ghostDecoration.length > 0) {
      currentEditor.deltaDecorations(ghostDecoration, [])
    }
    ghostDecoration = []

    // 移动光标到补全内容的末尾
    currentEditor.setPosition(endPosition)
    currentEditor.revealPositionInCenterIfOutsideViewport(endPosition)

    // 清理状态
    ghostRange = null
    ghostStartPosition = null

    // 隐藏提示
    hideTooltip()

    // 延迟重置标志
    setTimeout(() => {
      eventBus.emit('ai-ghost-text-updating', false)
    }, 0)
  } catch (error) {
    // 即使出错也要清理状态
    ghostDecoration = []
    ghostRange = null
    ghostStartPosition = null
    hideTooltip()
    eventBus.emit('ai-ghost-text-updating', false)
  }
}

/**
 * 更新Vditor的Ghost Text（使用span元素）
 */
function updateVditorGhostText(text: string) {
  logger.debug('updateVditorGhostText 开始', {
    textLength: text.length,
    textPreview: text.slice(0, 50),
    hasTargetEl: !!props.targetEl,
    rootNodeClass: props.rootNodeClass
  })

  if (!props.targetEl || !props.rootNodeClass) {
    logger.warn('缺少targetEl或rootNodeClass', {
      hasTargetEl: !!props.targetEl,
      rootNodeClass: props.rootNodeClass
    })
    return
  }

  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) {
    logger.warn('无法获取选择范围')
    return
  }

  const range = sel.getRangeAt(0).cloneRange()

  // 检查是否在预览区域或大纲区域，如果是，需要找到编辑器区域
  let startContainer = range.startContainer
  const previewElement =
    startContainer.nodeType === Node.ELEMENT_NODE
      ? (startContainer as Element).closest('.vditor-preview')
      : startContainer.parentElement?.closest('.vditor-preview')

  const outlineElement =
    startContainer.nodeType === Node.ELEMENT_NODE
      ? (startContainer as Element).closest('.vditor-outline')
      : startContainer.parentElement?.closest('.vditor-outline')

  // 检查是否在编辑器内容区域
  // 对于分屏模式，需要检查 .vditor-sv.vditor-reset 或 .vditor-sv
  // 对于其他模式，检查 .vditor-reset, .vditor-ir, .vditor-wysiwyg
  let isInEditorContent = false
  if (startContainer.nodeType === Node.ELEMENT_NODE) {
    const closest = (startContainer as Element).closest(
      '.vditor-sv.vditor-reset, .vditor-sv, .vditor-reset, .vditor-ir, .vditor-wysiwyg'
    )
    isInEditorContent = !!closest
  } else {
    const closest = startContainer.parentElement?.closest(
      '.vditor-sv.vditor-reset, .vditor-sv, .vditor-reset, .vditor-ir, .vditor-wysiwyg'
    )
    isInEditorContent = !!closest
  }

  // 如果不在编辑器内容区域，或者在预览/大纲区域，需要切换到编辑器区域
  if (previewElement || outlineElement || !isInEditorContent) {
    // 如果在预览区域或大纲区域，需要找到编辑器区域
    const editorRoot = props.targetEl
    if (editorRoot) {
      // 查找编辑器内容区域（根据不同的模式）
      // 优先查找.vditor-reset（所有模式都有），然后根据模式查找特定区域
      let editorContent = editorRoot.querySelector('.vditor-reset')

      // 如果没找到，尝试查找特定模式的内容区域
      if (!editorContent) {
        editorContent = editorRoot.querySelector('.vditor-ir, .vditor-wysiwyg, .vditor-sv')
      }

      // 对于WYSIWYG模式，需要查找.vditor-wysiwyg .vditor-reset
      if (!editorContent) {
        const wysiwygContainer = editorRoot.querySelector('.vditor-wysiwyg')
        if (wysiwygContainer) {
          editorContent = wysiwygContainer.querySelector('.vditor-reset') || wysiwygContainer
        }
      }

      // 对于SV模式，需要查找.vditor-sv.vditor-reset（注意：这是两个类名，不是后代选择器）
      if (!editorContent) {
        // 先尝试查找同时包含两个类的元素
        const svElements = editorRoot.querySelectorAll('.vditor-sv')
        for (const el of Array.from(svElements)) {
          if (el.classList.contains('vditor-reset')) {
            editorContent = el
            break
          }
        }
        // 如果还是没找到，尝试查找.vditor-sv
        if (!editorContent) {
          editorContent = editorRoot.querySelector('.vditor-sv')
        }
      }

      if (editorContent) {
        // 尝试在编辑器内容区域创建range
        try {
          const newRange = document.createRange()

          // 对于分屏模式，需要找到当前光标在编辑器中的实际位置
          // 分屏模式的DOM结构：<pre class="vditor-sv vditor-reset"><div data-block="0"><span data-type="text">...</span></div></pre>
          let targetNode: Node | null = null
          let targetOffset = 0

          // 尝试从当前range找到在编辑器内容区域内的对应位置
          const currentContainer = range.startContainer
          const currentOffset = range.startOffset

          // 检查当前容器是否在编辑器内容区域内
          let currentInEditor = false
          if (currentContainer.nodeType === Node.ELEMENT_NODE) {
            currentInEditor =
              editorContent.contains(currentContainer) &&
              (currentContainer as Element).closest(
                '.vditor-sv.vditor-reset, .vditor-sv, .vditor-reset, .vditor-ir, .vditor-wysiwyg'
              ) === editorContent
          } else {
            currentInEditor =
              editorContent.contains(currentContainer) &&
              currentContainer.parentElement?.closest(
                '.vditor-sv.vditor-reset, .vditor-sv, .vditor-reset, .vditor-ir, .vditor-wysiwyg'
              ) === editorContent
          }

          if (currentInEditor) {
            // 如果当前容器在编辑器内容区域内，直接使用
            targetNode = currentContainer
            targetOffset = currentOffset
          } else {
            // 否则，找到编辑器内容区域内的最后一个文本节点
            // 对于分屏模式，优先查找 <span data-type="text"> 内的文本节点
            const walker = document.createTreeWalker(editorContent, NodeFilter.SHOW_TEXT, {
              acceptNode: (node) => {
                // 排除预览区域和大纲区域
                const parent = node.parentElement
                if (parent) {
                  if (parent.closest('.vditor-preview') || parent.closest('.vditor-outline')) {
                    return NodeFilter.FILTER_REJECT
                  }
                  // 对于分屏模式，优先选择在 <span data-type="text"> 内的文本节点
                  if (
                    parent.hasAttribute('data-type') &&
                    parent.getAttribute('data-type') === 'text'
                  ) {
                    return NodeFilter.FILTER_ACCEPT
                  }
                }
                return NodeFilter.FILTER_ACCEPT
              }
            })

            let lastTextNode: Node | null = null
            while (walker.nextNode()) {
              lastTextNode = walker.currentNode
            }

            if (lastTextNode && lastTextNode.nodeType === Node.TEXT_NODE) {
              targetNode = lastTextNode
              targetOffset = lastTextNode.textContent?.length || 0
            } else {
              // 如果没有文本节点，尝试找到最后一个 <span data-type="text"> 元素
              const textSpans = editorContent.querySelectorAll('span[data-type="text"]')
              if (textSpans.length > 0) {
                const lastSpan = textSpans[textSpans.length - 1]
                if (lastSpan.lastChild && lastSpan.lastChild.nodeType === Node.TEXT_NODE) {
                  targetNode = lastSpan.lastChild
                  targetOffset = lastSpan.lastChild.textContent?.length || 0
                } else {
                  // 如果没有文本节点，在最后一个span后插入
                  targetNode = lastSpan
                  targetOffset = lastSpan.childNodes.length
                }
              } else {
                // 如果都没有，使用编辑器内容的末尾
                targetNode = editorContent
                targetOffset = editorContent.childNodes.length
              }
            }
          }

          if (targetNode) {
            if (targetNode.nodeType === Node.TEXT_NODE) {
              newRange.setStart(targetNode, targetOffset)
              newRange.setEnd(targetNode, targetOffset)
            } else if (targetNode.nodeType === Node.ELEMENT_NODE) {
              if (targetOffset > 0 && targetOffset < targetNode.childNodes.length) {
                newRange.setStart(targetNode, targetOffset)
                newRange.setEnd(targetNode, targetOffset)
              } else {
                newRange.selectNodeContents(targetNode)
                newRange.collapse(false)
              }
            } else {
              newRange.setStart(targetNode, targetOffset)
              newRange.collapse(true)
            }

            range.setStart(newRange.startContainer, newRange.startOffset)
            range.setEnd(newRange.endContainer, newRange.endOffset)

            // 更新selection
            sel.removeAllRanges()
            sel.addRange(range)

            logger.debug('已切换到编辑器区域', {
              editorContent: editorContent.className,
              targetNode: targetNode.nodeName,
              targetOffset
            })
          }
        } catch (error) {
          logger.warn('切换到编辑器区域失败', error)
          return
        }
      } else {
        logger.warn('无法找到编辑器内容区域', {
          hasTargetEl: !!editorRoot,
          targetElId: editorRoot?.id
        })
        return
      }
    } else {
      logger.warn('targetEl不存在，无法切换到编辑器区域')
      return
    }
  }

  logger.debug('选择范围', {
    startContainer: range.startContainer.nodeName,
    startOffset: range.startOffset,
    endContainer: range.endContainer.nodeName,
    endOffset: range.endOffset,
    inPreview: !!previewElement
  })

  // 检查是否已经存在ghost text元素（避免重复创建）
  const existingGhostText = props.targetEl?.querySelector(
    '.ai-suggestion-insert, .ai-suggestion-insert-dark'
  )
  if (existingGhostText && existingGhostText !== suggestionEl) {
    // 如果存在旧的ghost text但不是当前的，先移除它
    existingGhostText.remove()
    suggestionEl = null
  }

  // 如果suggestionEl不存在，创建它
  if (!suggestionEl) {
    logger.debug('创建新的suggestionEl')
    suggestionEl = document.createElement('span')
    // 使用setElTheme函数设置样式（参考AISuggestion.vue）
    setElTheme(suggestionEl)

    // 添加点击事件来接受补全
    suggestionEl.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const text = aiCompletionService.getGeneratedText()
      if (text.trim()) {
        acceptVditorGhostText(text)
        aiCompletionService.acceptCompletion()
        emits('accepted', text)
      }
    })

    try {
      // 确保插入到编辑器区域，而不是预览区域或大纲区域
      const container =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as Element)
          : range.startContainer.parentElement

      // 检查是否在预览区域或大纲区域，或者是否在编辑器内容区域
      const isInPreview = container?.closest('.vditor-preview')
      const isInOutline = container?.closest('.vditor-outline')
      let isInEditorContent = false
      if (container) {
        const closest = container.closest(
          '.vditor-sv.vditor-reset, .vditor-sv, .vditor-reset, .vditor-ir, .vditor-wysiwyg'
        )
        isInEditorContent = !!closest
      }

      // 如果不在编辑器内容区域，或者在预览/大纲区域，需要找到编辑器区域并插入
      if (isInPreview || isInOutline || !isInEditorContent) {
        // 如果在预览区域或大纲区域，或者不在编辑器内容区域，找到编辑器区域并插入
        const editorRoot = props.targetEl
        if (editorRoot) {
          // 优先查找.vditor-reset（所有模式都有）
          let editorContent = editorRoot.querySelector('.vditor-reset')

          // 如果没找到，尝试查找特定模式的内容区域
          if (!editorContent) {
            editorContent = editorRoot.querySelector('.vditor-ir, .vditor-wysiwyg, .vditor-sv')
          }

          // 对于WYSIWYG模式，需要查找.vditor-wysiwyg .vditor-reset
          if (!editorContent) {
            const wysiwygContainer = editorRoot.querySelector('.vditor-wysiwyg')
            if (wysiwygContainer) {
              editorContent = wysiwygContainer.querySelector('.vditor-reset') || wysiwygContainer
            }
          }

          // 对于SV模式，需要查找同时包含.vditor-sv和.vditor-reset的元素
          if (!editorContent) {
            const svElements = editorRoot.querySelectorAll('.vditor-sv')
            for (const el of Array.from(svElements)) {
              if (el.classList.contains('vditor-reset')) {
                editorContent = el
                break
              }
            }
            if (!editorContent) {
              editorContent = editorRoot.querySelector('.vditor-sv')
            }
          }

          if (editorContent) {
            // 尝试在编辑器内容区域的当前光标位置插入，如果无法确定，则在末尾插入
            try {
              // 检查range是否在editorContent内
              if (editorContent.contains(range.startContainer)) {
                // 如果range在编辑器内容区域内，直接插入
                range.insertNode(suggestionEl)
              } else {
                // 否则，找到编辑器内容区域的最后一个文本节点或末尾插入
                // 对于分屏模式，优先查找 <span data-type="text"> 内的文本节点
                const walker = document.createTreeWalker(editorContent, NodeFilter.SHOW_TEXT, {
                  acceptNode: (node) => {
                    // 排除预览区域和大纲区域
                    const parent = node.parentElement
                    if (parent) {
                      if (parent.closest('.vditor-preview') || parent.closest('.vditor-outline')) {
                        return NodeFilter.FILTER_REJECT
                      }
                      // 对于分屏模式，优先选择在 <span data-type="text"> 内的文本节点
                      if (
                        parent.hasAttribute('data-type') &&
                        parent.getAttribute('data-type') === 'text'
                      ) {
                        return NodeFilter.FILTER_ACCEPT
                      }
                    }
                    return NodeFilter.FILTER_ACCEPT
                  }
                })

                let lastTextNode: Node | null = null
                while (walker.nextNode()) {
                  lastTextNode = walker.currentNode
                }

                if (lastTextNode && lastTextNode.nodeType === Node.TEXT_NODE) {
                  // 在最后一个文本节点后插入
                  const newRange = document.createRange()
                  newRange.setStartAfter(lastTextNode)
                  newRange.collapse(true)
                  newRange.insertNode(suggestionEl)
                } else {
                  // 如果没有文本节点，尝试找到最后一个 <span data-type="text"> 元素
                  const textSpans = editorContent.querySelectorAll('span[data-type="text"]')
                  if (textSpans.length > 0) {
                    const lastSpan = textSpans[textSpans.length - 1]
                    if (lastSpan.lastChild && lastSpan.lastChild.nodeType === Node.TEXT_NODE) {
                      const newRange = document.createRange()
                      newRange.setStartAfter(lastSpan.lastChild)
                      newRange.collapse(true)
                      newRange.insertNode(suggestionEl)
                    } else {
                      // 在最后一个span后插入
                      lastSpan.appendChild(suggestionEl)
                    }
                  } else {
                    // 在编辑器内容末尾插入
                    editorContent.appendChild(suggestionEl)
                  }
                }
              }
            } catch (error) {
              // 如果插入失败，在末尾插入
              logger.warn('在编辑器内容区域插入ghost text失败，尝试在末尾插入', error)
              editorContent.appendChild(suggestionEl)
            }
            // 创建新的range并设置光标
            const newRange = document.createRange()
            newRange.setStartAfter(suggestionEl)
            newRange.collapse(true)
            sel.removeAllRanges()
            sel.addRange(newRange)
            logger.debug('suggestionEl已插入到编辑器区域', {
              editorContent: editorContent.className
            })
          } else {
            logger.warn('无法找到编辑器内容区域')
            return
          }
        } else {
          logger.warn('targetEl不存在')
          return
        }
      } else {
        // 正常插入，但需要确保在编辑器内容区域内
        const finalContainer =
          range.startContainer.nodeType === Node.ELEMENT_NODE
            ? (range.startContainer as Element)
            : range.startContainer.parentElement
        const finalIsInPreview = finalContainer?.closest('.vditor-preview')
        const finalIsInOutline = finalContainer?.closest('.vditor-outline')

        if (finalIsInPreview || finalIsInOutline) {
          logger.warn('插入位置在预览或大纲区域，跳过')
          return
        }

        // 检查是否在编辑器内容区域内（.vditor-reset或特定模式的内容区域）
        let isInEditorContent = false
        if (finalContainer) {
          const closest = finalContainer.closest(
            '.vditor-sv.vditor-reset, .vditor-sv, .vditor-reset, .vditor-ir, .vditor-wysiwyg'
          )
          isInEditorContent = !!closest
        }

        if (!isInEditorContent) {
          // 如果不在编辑器内容区域，尝试找到正确的区域
          const editorRoot = props.targetEl
          if (editorRoot) {
            // 优先查找.vditor-reset（所有模式都有）
            let editorContent = editorRoot.querySelector('.vditor-reset')

            // 如果没找到，尝试查找特定模式的内容区域
            if (!editorContent) {
              editorContent = editorRoot.querySelector('.vditor-ir, .vditor-wysiwyg, .vditor-sv')
            }

            // 对于WYSIWYG模式，需要查找.vditor-wysiwyg .vditor-reset
            if (!editorContent) {
              const wysiwygContainer = editorRoot.querySelector('.vditor-wysiwyg')
              if (wysiwygContainer) {
                editorContent = wysiwygContainer.querySelector('.vditor-reset') || wysiwygContainer
              }
            }

            // 对于SV模式，需要查找同时包含.vditor-sv和.vditor-reset的元素
            if (!editorContent) {
              const svElements = editorRoot.querySelectorAll('.vditor-sv')
              for (const el of Array.from(svElements)) {
                if (el.classList.contains('vditor-reset')) {
                  editorContent = el
                  break
                }
              }
              if (!editorContent) {
                editorContent = editorRoot.querySelector('.vditor-sv')
              }
            }

            if (editorContent) {
              // 在编辑器内容末尾插入
              editorContent.appendChild(suggestionEl)
              // 创建新的range并设置光标
              const newRange = document.createRange()
              newRange.setStartAfter(suggestionEl)
              newRange.collapse(true)
              sel.removeAllRanges()
              sel.addRange(newRange)
              logger.debug('suggestionEl已插入到编辑器区域（正常插入路径）', {
                editorContent: editorContent.className
              })
            } else {
              logger.warn('无法找到编辑器内容区域（正常插入路径）')
              return
            }
          } else {
            logger.warn('targetEl不存在（正常插入路径）')
            return
          }
        } else {
          // 在编辑器内容区域内，正常插入
          range.insertNode(suggestionEl)
          logger.debug('suggestionEl已插入DOM')

          // 恢复选择
          sel.removeAllRanges()
          sel.addRange(range)
        }
      }
    } catch (error) {
      logger.error('插入suggestionEl失败', error)
      return
    }
  }

  // 更新文本
  suggestionEl.textContent = text

  // 显示提示信息（参考AISuggestion.vue的实现）
  showVditorTooltip()

  logger.info('Vditor Ghost Text已更新', {
    textLength: text.length,
    elementExists: !!suggestionEl.parentNode
  })
}

/**
 * 显示Vditor的提示信息
 */
function showVditorTooltip() {
  hideTooltip()

  if (!suggestionEl) return

  tooltipEl = document.createElement('div')
  tooltipEl.textContent = t('aiSuggestion.tooltip', '按 Tab 接受，按 ESC 取消')
  tooltipEl.style.position = 'absolute'
  tooltipEl.style.padding = '4px 8px'
  tooltipEl.style.background =
    themeState.currentTheme.type === 'dark' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.7)'
  tooltipEl.style.color = themeState.currentTheme.textColor
  tooltipEl.style.borderRadius = '4px'
  tooltipEl.style.fontSize = '12px'
  tooltipEl.style.pointerEvents = 'none'
  tooltipEl.style.whiteSpace = 'nowrap'
  tooltipEl.style.zIndex = '10000'

  // 定位到suggestionEl附近
  const rect = suggestionEl.getBoundingClientRect()
  tooltipEl.style.left = `${rect.left}px`
  tooltipEl.style.top = `${rect.top - 25}px`

  document.body.appendChild(tooltipEl)
}

/**
 * 取消Vditor的Ghost Text
 */
function cancelVditorGhostText() {
  if (suggestionEl) {
    suggestionEl.remove()
    suggestionEl = null
  }
  hideTooltip()
}

/**
 * 接受Vditor的Ghost Text
 */
function acceptVditorGhostText(text: string) {
  if (suggestionEl) {
    // 检查suggestionEl是否仍在DOM中
    if (!suggestionEl.parentNode) {
      logger.warn('suggestionEl已不在DOM中，无法接受补全')
      suggestionEl = null
      hideTooltip()
      return
    }

    // 在suggestionEl之前插入文本节点
    const textNode = document.createTextNode(text)
    try {
      suggestionEl.parentNode.insertBefore(textNode, suggestionEl)
    } catch (error) {
      logger.error('插入文本节点失败', error)
      hideTooltip()
      return
    }

    // 移动光标到新插入文本的末尾
    const sel = window.getSelection()
    if (sel && textNode.parentNode) {
      try {
        const range = document.createRange()
        // 确保textNode仍在DOM中
        if (textNode.parentNode) {
          range.setStartAfter(textNode)
          range.setEndAfter(textNode)
          sel.removeAllRanges()
          sel.addRange(range)
        } else {
          // 如果textNode已被移除，尝试在suggestionEl的位置设置光标
          if (suggestionEl.parentNode) {
            range.setStartBefore(suggestionEl)
            range.setEndBefore(suggestionEl)
            sel.removeAllRanges()
            sel.addRange(range)
          }
        }
      } catch (error) {
        logger.warn('设置光标位置失败', error)
        // 即使设置光标失败，也继续移除suggestionEl
      }
    }

    // 移除suggestionEl
    try {
      suggestionEl.remove()
    } catch (error) {
      logger.warn('移除suggestionEl失败', error)
    }
    suggestionEl = null
  }
  hideTooltip()
}

/**
 * 处理补全文本更新
 */
function handleTextUpdate(event: { request: any; text: string }) {
  if (!event || !event.text) {
    return
  }

  if (props.format === 'tex' || props.format === 'txt') {
    updateMonacoGhostText(event.text)
  } else if (props.format === 'md') {
    updateVditorGhostText(event.text)
  }
}

/**
 * 处理补全取消
 */
function handleCancelled() {
  if (props.format === 'tex' || props.format === 'txt') {
    // 不传递editor参数，让函数内部重新获取
    cancelMonacoGhostText()
  } else if (props.format === 'md') {
    cancelVditorGhostText()
  }
}

/**
 * 处理Tab键接受补全
 */
function handleTabKey(e: KeyboardEvent) {
  if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (props.format === 'tex' || props.format === 'txt') {
      // 对于tex和txt格式，使用Monaco命令系统，这里不需要处理
      // 但为了兼容，如果ghostRange存在，也从model读取
      if (ghostRange) {
        const currentEditor = getEditor()
        if (currentEditor) {
          const model = currentEditor.getModel()
          if (model) {
            const text = model.getValueInRange(ghostRange)
            if (text.trim()) {
              e.preventDefault()
              acceptMonacoGhostText(text)
              setTimeout(() => {
                try {
                  aiCompletionService.acceptCompletion()
                  emits('accepted', text)
                } catch (error) {
                  logger.error('触发acceptCompletion或accepted事件时出错', error)
                }
              }, 50)
            }
          }
        }
      }
    } else if (props.format === 'md') {
      // 对于md格式，使用aiCompletionService.getGeneratedText()
      // 参考AISuggestion.vue的handleVditorKeydown实现
      const text = aiCompletionService.getGeneratedText()
      if (text.trim()) {
        // 即使suggestionEl不存在，只要有生成的文本，也应该接受补全
        // 因为ghost text可能已经被插入到DOM中了
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        // acceptVditorGhostText已经在DOM中插入了文本，所以不需要再触发accepted事件
        // 否则会导致onAcceptSuggestion再次插入文本，造成重复
        acceptVditorGhostText(text)
        aiCompletionService.acceptCompletion()
        // 不触发accepted事件，因为文本已经在acceptVditorGhostText中插入了
        // emits('accepted', text)
        return false
      }
    }
  }
}

/**
 * 处理Escape键取消补全
 */
function handleEscapeKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    handleCancelled()
    aiCompletionService.rejectCompletion()
    emits('cancelled')
  }
}

onMounted(() => {
  // 监听补全文本更新
  textUpdateHandler = (event: unknown) => {
    const typedEvent = event as { request?: any; text?: string }
    handleTextUpdate(typedEvent as { request: any; text: string })
  }

  eventBus.on('ai-completion-text-updated', textUpdateHandler)
  eventBus.on('ai-completion-cancelled', handleCancelled)

  // 监听键盘事件
  if (props.format === 'md') {
    // 对于md格式，使用window.addEventListener（参考AISuggestion.vue）
    // 使用capture阶段确保在MarkdownEditor的handleTab之前处理
    window.addEventListener('keydown', handleTabKey, true)
    window.addEventListener('keydown', handleEscapeKey, true)
  } else if (props.format === 'tex' || props.format === 'txt') {
    // 注册键盘命令的函数（tex和txt都使用Monaco编辑器）
    const registerKeyboardCommands = (editor: monaco.editor.IStandaloneCodeEditor) => {
      editor.addCommand(monaco.KeyCode.Tab, () => {
        // 如果ghostRange存在，说明文本已经在model中了
        if (ghostRange) {
          const model = editor.getModel()
          if (model) {
            const text = model.getValueInRange(ghostRange)
            if (text.trim()) {
              acceptMonacoGhostText(text)
              aiCompletionService.acceptCompletion()
              emits('accepted', text)
            }
          }
        }
      })

      editor.addCommand(monaco.KeyCode.Escape, () => {
        handleCancelled()
        aiCompletionService.rejectCompletion()
        emits('cancelled')
      })
    }

    // 尝试立即获取编辑器
    const editor = getEditor()
    if (editor) {
      registerKeyboardCommands(editor)
    } else {
      // 如果编辑器还没准备好，等待monaco-ready事件
      const monacoReadyHandler = () => {
        const editor = getEditor()
        if (editor) {
          registerKeyboardCommands(editor)
          eventBus.off('monaco-ready', monacoReadyHandler)
        }
      }

      eventBus.on('monaco-ready', monacoReadyHandler)

      // 清理函数
      onBeforeUnmount(() => {
        eventBus.off('monaco-ready', monacoReadyHandler)
      })
    }
  }
})

onBeforeUnmount(() => {
  // 使用通配符移除所有监听器，因为mitt的类型系统限制
  eventBus.off('ai-completion-text-updated', textUpdateHandler as any)
  eventBus.off('ai-completion-cancelled', handleCancelled as any)

  if (props.format === 'md') {
    window.removeEventListener('keydown', handleTabKey, true)
    window.removeEventListener('keydown', handleEscapeKey, true)
  }

  // 清理ghost text
  handleCancelled()

  // 清理提示
  hideTooltip()
})

/**
 * 设置元素主题（参考AISuggestion.vue）
 * 使用绿色背景（ai-suggestion-insert）表示新增内容
 */
function setElTheme(element: HTMLElement) {
  // 根据 themeState 动态设置 class，使用绿色背景表示新增内容
  if (themeState?.currentTheme?.type === 'dark') {
    element.className = 'ai-suggestion-insert-dark'
  } else {
    element.className = 'ai-suggestion-insert'
  }

  element.contentEditable = 'false'
  // 允许pointer事件以便点击接受，但不允许文本选择
  element.style.pointerEvents = 'auto'
  element.style.userSelect = 'none'
  element.style.cursor = 'pointer'
  // 防止文本选择
  element.style.webkitUserSelect = 'none'
  element.style.mozUserSelect = 'none'
  element.style.msUserSelect = 'none'
}

// 监听主题变化
watch(
  () => themeState.currentTheme?.type,
  () => {
    if (suggestionEl) {
      setElTheme(suggestionEl)
    }
  },
  { immediate: true }
)
</script>

<style scoped></style>
