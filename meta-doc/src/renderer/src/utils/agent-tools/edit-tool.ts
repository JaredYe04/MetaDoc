/**
 * 编辑Tool
 * 直接对文章进行编辑，支持多处编辑
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress
} from '../../types/agent-tool'
import { useWorkspace } from '../../stores/workspace'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import type { TextRange } from '../../editor/text-editor-types'
import EditDisplay from './components/EditDisplay.vue'
import { createDetailedError } from './tool-utils'
import messageBridge from '../../bridge/message-bridge'
import { useAgentEditStagingStore } from '../../stores/agent-edit-staging-store'
import { newLinesToContent, parseUnifiedDiff, type UnifiedDiffHunk } from './edit-diff-parse'

export type { UnifiedDiffHunk } from './edit-diff-parse'
export { parseUnifiedDiff } from './edit-diff-parse'

const logger = createRendererLogger('EditTool')
const workspace = useWorkspace()

function getWorkspaceRoots(): string[] {
  try {
    const saved = localStorage.getItem('workspaceFolders')
    if (!saved) return []
    const arr = JSON.parse(saved)
    return Array.isArray(arr)
      ? arr.filter((p: unknown) => typeof p === 'string' && p.length > 0)
      : []
  } catch {
    return []
  }
}

function resolveFilePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').trim()
  if (normalized.startsWith('/') || /^[A-Za-z]:[/\\]/.test(normalized)) {
    return normalized
  }
  const roots = getWorkspaceRoots()
  const root = roots[0]
  if (!root) return normalized
  const base = root.replace(/\\/g, '/').replace(/\/$/, '')
  return `${base}/${normalized}`
}

/**
 * 稳定锚点（用于增量diff编辑）
 * 当行号失效时，使用锚点定位
 */
export interface StableAnchor {
  before?: string // 改动前的关键字（用于定位）
  after?: string // 改动后的关键字（用于验证）
  context?: string // 上下文文本（可选，用于更精确的定位）
}

/**
 * 编辑操作（基于位置的编辑，支持增量diff）
 */
export interface EditOperation {
  type: 'insert' | 'replace' | 'delete'
  range: {
    start: { line: number; column: number } // 1-based
    end: { line: number; column: number } // 1-based
  }
  content?: string // 对于insert和replace操作
  anchor?: StableAnchor // 稳定锚点（可选，用于fallback定位）
}

/**
 * 查找替换操作（基于文本内容的编辑）
 * 支持两种模式：
 * 1. 基于查找：使用oldText查找并替换（需要oldText和newText）
 * 2. 基于位置：使用range和content直接替换（需要range和content，oldText可选用于验证）
 */
export interface FindReplaceOperation {
  type: 'findReplace'
  oldText?: string // 要查找的文本（如果提供了range，则oldText可选，用于验证位置内容）
  newText?: string // 替换为的文本（与content二选一，如果提供了range则使用content）
  content?: string // 替换为的文本（与newText二选一，如果提供了range则优先使用content）
  range?: {
    start: { line: number; column: number } // 1-based
    end: { line: number; column: number } // 1-based
  } // 可选，如果提供了range，则直接使用范围替换，不需要oldText查找
  all?: boolean // 是否替换所有匹配项（默认false，只替换第一个，仅在基于查找模式下有效）
  caseSensitive?: boolean // 是否区分大小写（默认false，仅在基于查找模式下有效）
}

/**
 * 联合类型：所有支持的编辑操作
 */
export type AnyEditOperation = EditOperation | FindReplaceOperation

/**
 * 编辑结果
 */
export interface EditResult {
  appliedEdits: number
  failedEdits: number
  operations: EditOperation[]
  originalContent?: string // 编辑前的原始内容（用于显示对比）
  newContent?: string // 编辑后的新内容（用于显示对比）
  hunks?: UnifiedDiffHunk[] // Unified diff hunks（如果使用diff格式）
  filePath?: string // 编辑的文件路径（用于展示）
  /** AI 传入的原始 diff 字符串，用于 EditDisplay 直接显示，不依赖实际文件 */
  rawDiff?: string
}

/**
 * 将行号和列号转换为文本偏移量（CRLF 安全：\n 与 \r\n 均视为一行结束，与 split(/\r?\n/) 语义一致）
 */
function positionToOffset(text: string, line: number, column: number): number {
  let pos = 0
  let currentLine = 1
  while (currentLine < line && pos < text.length) {
    if (text[pos] === '\r' && pos + 1 < text.length && text[pos + 1] === '\n') {
      pos += 2
      currentLine++
    } else if (text[pos] === '\n') {
      pos++
      currentLine++
    } else {
      pos++
    }
  }
  const lineStart = pos
  while (
    pos < text.length &&
    text[pos] !== '\n' &&
    !(text[pos] === '\r' && text[pos + 1] === '\n')
  ) {
    pos++
  }
  const lineLen = pos - lineStart
  return lineStart + Math.min(column - 1, lineLen)
}

/**
 * 将文本偏移量转换为行号和列号（CRLF 安全）
 */
function offsetToPosition(text: string, offset: number): { line: number; column: number } {
  let line = 1
  let column = 1
  let pos = 0
  while (pos < offset) {
    if (pos >= text.length) break
    if (text[pos] === '\r' && pos + 1 < text.length && text[pos + 1] === '\n') {
      line++
      column = 1
      pos += 2
    } else if (text[pos] === '\n') {
      line++
      column = 1
      pos++
    } else {
      column++
      pos++
    }
  }
  return { line, column }
}

/**
 * 查找文本在文档中的所有匹配位置（使用字符串查找，不使用正则表达式）
 * @param text 文档内容
 * @param searchText 要查找的文本
 * @param caseSensitive 是否区分大小写
 * @returns 所有匹配位置的偏移量数组
 */
function findAllMatches(
  text: string,
  searchText: string,
  caseSensitive: boolean = false
): number[] {
  if (!searchText) {
    return []
  }

  const matches: number[] = []
  let searchIndex = 0
  const workingText = caseSensitive ? text : text.toLowerCase()
  const workingSearchText = caseSensitive ? searchText : searchText.toLowerCase()

  for (;;) {
    const index = workingText.indexOf(workingSearchText, searchIndex)
    if (index === -1) {
      break
    }
    matches.push(index)
    searchIndex = index + 1 // 继续查找下一个匹配项
  }

  return matches
}

/**
 * 将查找替换操作转换为基于位置的编辑操作
 * @param text 文档内容
 * @param findReplace 查找替换操作
 * @returns 转换后的编辑操作数组
 */
function convertFindReplaceToEditOperations(
  text: string,
  findReplace: FindReplaceOperation
): EditOperation[] {
  const { oldText, newText, content, all = false, caseSensitive = false } = findReplace
  const replaceText = newText ?? content ?? ''

  if (!oldText) {
    throw new Error('oldText不能为空')
  }

  const matches = findAllMatches(text, oldText, caseSensitive)

  if (matches.length === 0) {
    throw new Error(`未找到文本: ${oldText}`)
  }

  const operations: EditOperation[] = []

  // 如果all为false，只替换第一个
  const matchesToReplace = all ? matches : matches.slice(0, 1)

  for (const offset of matchesToReplace) {
    // 计算起始位置
    const startPos = offsetToPosition(text, offset)
    // 计算结束位置（oldText的长度）
    const endOffset = offset + oldText.length
    const endPos = offsetToPosition(text, endOffset)

    operations.push({
      type: 'replace',
      range: {
        start: startPos,
        end: endPos
      },
      content: replaceText
    })
  }

  return operations
}

/**
 * 使用锚点查找位置（fuzzy匹配）
 * 当行号失效时，使用锚点文本进行模糊匹配
 */
function findPositionByAnchor(
  text: string,
  anchor: StableAnchor,
  preferredLine?: number
): { start: { line: number; column: number }; end: { line: number; column: number } } | null {
  if (!anchor.before && !anchor.after && !anchor.context) {
    return null
  }

  // 优先使用before锚点
  if (anchor.before) {
    const beforeIndex = text.indexOf(anchor.before)
    if (beforeIndex !== -1) {
      const startPos = offsetToPosition(text, beforeIndex)
      const endPos = offsetToPosition(text, beforeIndex + anchor.before.length)

      // 如果提供了preferredLine，检查是否在合理范围内（±10行）
      if (preferredLine !== undefined) {
        const lineDiff = Math.abs(startPos.line - preferredLine)
        if (lineDiff > 10) {
          // 行号差异太大，可能不是正确的匹配，继续尝试其他方法
        } else {
          return { start: startPos, end: endPos }
        }
      } else {
        return { start: startPos, end: endPos }
      }
    }
  }

  // 如果before锚点失败，尝试使用context
  if (anchor.context) {
    const contextIndex = text.indexOf(anchor.context)
    if (contextIndex !== -1) {
      const startPos = offsetToPosition(text, contextIndex)
      const endPos = offsetToPosition(text, contextIndex + anchor.context.length)
      return { start: startPos, end: endPos }
    }
  }

  // 如果都失败，尝试fuzzy匹配（查找包含锚点文本的行）
  if (anchor.before) {
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(anchor.before)) {
        const lineStart = positionToOffset(text, i + 1, 1)
        const anchorIndex = lines[i].indexOf(anchor.before)
        const startPos = offsetToPosition(text, lineStart + anchorIndex)
        const endPos = offsetToPosition(text, lineStart + anchorIndex + anchor.before.length)
        return { start: startPos, end: endPos }
      }
    }
  }

  return null
}

/**
 * 应用编辑操作到文本（支持增量diff，带锚点fallback）
 */
function applyEditToText(text: string, edit: EditOperation): string {
  const lines = text.split(/\r?\n/)

  let startOffset: number
  let endOffset: number

  // 尝试1：使用行号定位（优先）
  try {
    // 验证行号范围
    if (edit.range.start.line < 1 || edit.range.start.line > lines.length + 1) {
      throw new Error(`起始行号 ${edit.range.start.line} 超出范围 [1, ${lines.length + 1}]`)
    }
    if (edit.range.end.line < 1 || edit.range.end.line > lines.length + 1) {
      throw new Error(`结束行号 ${edit.range.end.line} 超出范围 [1, ${lines.length + 1}]`)
    }

    startOffset = positionToOffset(text, edit.range.start.line, edit.range.start.column)
    endOffset = positionToOffset(text, edit.range.end.line, edit.range.end.column)

    // 验证位置内容（如果提供了anchor.before，验证是否匹配）
    if (edit.anchor?.before) {
      const actualText = text.slice(startOffset, endOffset)
      // 允许部分匹配（因为可能包含换行符等）
      if (
        !actualText.includes(edit.anchor.before) &&
        !edit.anchor.before.includes(actualText.trim())
      ) {
        logger.warn('行号定位的内容与锚点不匹配，尝试使用锚点定位', {
          expected: edit.anchor.before,
          actual: actualText.substring(0, 50)
        })
        throw new Error('位置内容不匹配，尝试锚点定位')
      }
    }
  } catch (error) {
    // 尝试2：使用锚点定位（fallback）
    if (edit.anchor) {
      const anchorPos = findPositionByAnchor(text, edit.anchor, edit.range.start.line)
      if (anchorPos) {
        logger.info('使用锚点定位成功', {
          originalLine: edit.range.start.line,
          anchorLine: anchorPos.start.line
        })
        startOffset = positionToOffset(text, anchorPos.start.line, anchorPos.start.column)
        endOffset = positionToOffset(text, anchorPos.end.line, anchorPos.end.column)
      } else {
        // 锚点定位也失败，抛出错误
        throw new Error(
          `无法定位编辑位置：行号失效且锚点匹配失败。行号: ${edit.range.start.line}, 锚点: ${edit.anchor.before?.substring(0, 20)}`
        )
      }
    } else {
      // 没有锚点，直接抛出原始错误
      throw error
    }
  }

  if (startOffset > endOffset) {
    throw new Error(`起始位置不能大于结束位置`)
  }

  // 与文件行尾一致：若文件中存在 \r\n，则把插入/替换内容中的 \n 统一为 \r\n
  const lineEnding = /\r\n/.test(text) ? '\r\n' : '\n'
  const normalizeContent = (s: string) =>
    s && lineEnding === '\r\n' ? s.replace(/\n/g, '\r\n') : s

  // 根据操作类型应用编辑
  if (edit.type === 'insert') {
    const before = text.slice(0, startOffset)
    const after = text.slice(startOffset)
    return before + normalizeContent(edit.content || '') + after
  } else if (edit.type === 'replace') {
    const before = text.slice(0, startOffset)
    const after = text.slice(endOffset)
    return before + normalizeContent(edit.content || '') + after
  } else if (edit.type === 'delete') {
    const before = text.slice(0, startOffset)
    const after = text.slice(endOffset)
    return before + after
  }

  throw new Error(`未知的编辑类型: ${edit.type}`)
}

/**
 * 使用上下文行查找位置
 * @param text 文档内容
 * @param contextLines 上下文行数组
 * @param preferredLine 首选行号（1-based）
 * @returns 匹配的位置范围，如果未找到返回 null
 */
function findPositionByContext(
  text: string,
  contextLines: string[],
  preferredLine?: number
): { start: { line: number; column: number }; end: { line: number; column: number } } | null {
  if (!contextLines || contextLines.length === 0) {
    return null
  }

  const textLines = text.split(/\r?\n/)
  const textLineCount = textLines.length

  // 如果行号明显超出文档范围（超过文档行数的2倍），忽略preferredLine的限制
  const shouldIgnorePreferredLine = preferredLine !== undefined && preferredLine > textLineCount * 2

  // 构建上下文模式（至少需要2行上下文才能匹配）
  if (contextLines.length < 2) {
    // 如果上下文太少，尝试使用单行匹配
    const contextText = contextLines[0]
    if (!contextText) return null

    const index = text.indexOf(contextText)
    if (index === -1) return null

    const startPos = offsetToPosition(text, index)
    const endPos = offsetToPosition(text, index + contextText.length)

    // 如果提供了 preferredLine，检查是否在合理范围内（如果行号明显超出范围则忽略此检查）
    if (!shouldIgnorePreferredLine && preferredLine !== undefined) {
      const lineDiff = Math.abs(startPos.line - preferredLine)
      const tolerance = Math.max(20, Math.floor(textLineCount * 0.5))
      if (lineDiff > tolerance) {
        return null // 差异太大，可能不是正确的匹配
      }
    }

    return { start: startPos, end: endPos }
  }

  // 使用多行上下文匹配
  // 构建上下文字符串（使用换行符连接）
  const contextText = contextLines.join('\n')

  // 查找所有匹配位置
  const matches: number[] = []
  let searchIndex = 0

  for (;;) {
    const index = text.indexOf(contextText, searchIndex)
    if (index === -1) {
      break
    }
    matches.push(index)
    searchIndex = index + 1
  }

  if (matches.length === 0) {
    // 如果精确匹配失败，尝试模糊匹配（逐行匹配）
    return findPositionByContextFuzzy(text, contextLines, preferredLine)
  }

  // 如果找到多个匹配，选择最接近 preferredLine 的位置（如果行号明显超出范围则使用第一个匹配）
  if (!shouldIgnorePreferredLine && preferredLine !== undefined && matches.length > 1) {
    let bestMatch = matches[0]
    let bestLineDiff = Infinity

    for (const matchIndex of matches) {
      const matchPos = offsetToPosition(text, matchIndex)
      const lineDiff = Math.abs(matchPos.line - preferredLine)
      if (lineDiff < bestLineDiff) {
        bestLineDiff = lineDiff
        bestMatch = matchIndex
      }
    }

    const startPos = offsetToPosition(text, bestMatch)
    const endPos = offsetToPosition(text, bestMatch + contextText.length)
    return { start: startPos, end: endPos }
  }

  // 使用第一个匹配
  const matchIndex = matches[0]
  const startPos = offsetToPosition(text, matchIndex)
  const endPos = offsetToPosition(text, matchIndex + contextText.length)
  return { start: startPos, end: endPos }
}

/**
 * 模糊匹配上下文（逐行匹配）
 */
function findPositionByContextFuzzy(
  text: string,
  contextLines: string[],
  preferredLine?: number
): { start: { line: number; column: number }; end: { line: number; column: number } } | null {
  const textLines = text.split(/\r?\n/)
  const textLineCount = textLines.length

  // 如果行号明显超出文档范围（超过文档行数的2倍），忽略preferredLine的限制
  const shouldIgnorePreferredLine = preferredLine !== undefined && preferredLine > textLineCount * 2

  // 尝试找到连续匹配的上下文行
  for (let i = 0; i < textLines.length - contextLines.length + 1; i++) {
    let matched = true
    for (let j = 0; j < contextLines.length; j++) {
      if (textLines[i + j] !== contextLines[j]) {
        matched = false
        break
      }
    }

    if (matched) {
      // 检查是否在 preferredLine 的合理范围内（如果行号明显超出范围则忽略此检查）
      if (!shouldIgnorePreferredLine && preferredLine !== undefined) {
        const lineDiff = Math.abs(i + 1 - preferredLine)
        // 放宽容差范围：如果文档较短，使用文档长度的50%作为容差；否则使用20行
        const tolerance = Math.max(20, Math.floor(textLineCount * 0.5))
        if (lineDiff > tolerance) {
          continue // 差异太大，跳过
        }
      }

      // 找到匹配位置
      const startLine = i + 1
      const startColumn = 1
      const endLine = i + contextLines.length
      const endColumn = textLines[endLine - 1]?.length + 1 || 1

      return {
        start: { line: startLine, column: startColumn },
        end: { line: endLine, column: endColumn }
      }
    }
  }

  return null
}

/**
 * 将 Unified diff hunk 转换为 EditOperation
 * @param hunk Unified diff hunk
 * @param text 文档内容（用于定位）
 * @returns EditOperation 或 null（如果无法定位）
 */
function convertHunkToEditOperation(hunk: UnifiedDiffHunk, text: string): EditOperation | null {
  const lines = text.split(/\r?\n/)

  // 确定操作类型
  let type: 'insert' | 'replace' | 'delete'
  if (hunk.oldLines.length === 0 && hunk.newLines.length > 0) {
    type = 'insert'
  } else if (hunk.oldLines.length > 0 && hunk.newLines.length === 0) {
    type = 'delete'
  } else {
    type = 'replace'
  }

  // 纯新增（新文件或空文件开头插入）：oldCount===0 且只有新增行，直接返回“在开头插入”的 EditOperation，避免行号/上下文匹配失败
  if (type === 'insert' && hunk.oldCount === 0 && hunk.newLines.length > 0) {
    const newText = hunk.newLines.join('\n')
    return {
      type: 'insert',
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
      content: newText
    }
  }

  // 尝试使用行号定位
  let startLine = hunk.oldStart
  let endLine = hunk.oldStart + hunk.oldCount - 1

  // 验证行号范围
  if (startLine < 1 || startLine > lines.length + 1) {
    // 行号超出范围，尝试使用上下文匹配
    let contextPos = findPositionByContext(text, hunk.contextLines, hunk.oldStart)

    // 如果上下文匹配失败，尝试使用oldLines来定位（如果oldLines存在）
    if (!contextPos && hunk.oldLines.length > 0) {
      const oldLinesPos = findPositionByContext(text, hunk.oldLines, hunk.oldStart)
      if (oldLinesPos) {
        // 使用oldLines的位置
        startLine = oldLinesPos.start.line
        endLine = oldLinesPos.end.line
        logger.info('使用 oldLines 定位 hunk（上下文匹配失败）', {
          originalLine: hunk.oldStart,
          matchedLine: startLine
        })
        // 继续后续处理
        contextPos = oldLinesPos
      }
    }

    if (!contextPos) {
      // 如果上下文行和oldLines都不存在，尝试使用部分匹配
      // 尝试匹配上下文行的部分内容
      if (hunk.contextLines.length > 0) {
        // 尝试匹配单个上下文行
        for (const contextLine of hunk.contextLines) {
          if (contextLine.trim()) {
            const singleLinePos = findPositionByContext(text, [contextLine], hunk.oldStart)
            if (singleLinePos) {
              contextPos = singleLinePos
              logger.info('使用单个上下文行定位 hunk', {
                originalLine: hunk.oldStart,
                matchedLine: contextPos.start.line,
                contextLine: contextLine.substring(0, 50)
              })
              break
            }
          }
        }
      }

      if (!contextPos) {
        logger.warn('无法定位 hunk 位置', {
          hunk: hunk,
          reason: '行号超出范围且上下文匹配失败',
          contextLines: hunk.contextLines,
          oldLines: hunk.oldLines
        })
        return null
      }
    }

    // 如果contextPos是通过oldLines找到的，已经设置了startLine和endLine，跳过后续处理
    const isOldLinesMatch =
      hunk.oldLines.length > 0 &&
      contextPos &&
      contextPos.start.line === startLine &&
      contextPos.end.line === endLine

    if (!isOldLinesMatch) {
      // 使用上下文匹配的位置
      // 如果上下文行在oldLines之前，编辑位置应该在上下文行之后
      // 如果上下文行在oldLines之后，编辑位置应该在上下文行之前
      if (hunk.oldLines.length > 0) {
        // 有oldLines，尝试在上下文行附近查找oldLines
        const contextEndLine = contextPos.end.line
        const searchStartLine = Math.max(1, contextEndLine)
        const searchEndLine = Math.min(lines.length, contextEndLine + hunk.oldLines.length + 10)

        let foundOldLines = false
        for (let i = searchStartLine - 1; i <= searchEndLine - hunk.oldLines.length; i++) {
          let allMatch = true
          for (let j = 0; j < hunk.oldLines.length; j++) {
            if (lines[i + j] !== hunk.oldLines[j]) {
              allMatch = false
              break
            }
          }
          if (allMatch) {
            startLine = i + 1
            endLine = startLine + hunk.oldLines.length - 1
            foundOldLines = true
            break
          }
        }

        // 如果没找到，尝试在上下文行之前查找
        if (!foundOldLines) {
          const searchStartLine2 = Math.max(1, contextPos.start.line - hunk.oldLines.length - 10)
          const searchEndLine2 = Math.min(lines.length, contextPos.start.line)

          for (let i = searchStartLine2 - 1; i <= searchEndLine2 - hunk.oldLines.length; i++) {
            let allMatch = true
            for (let j = 0; j < hunk.oldLines.length; j++) {
              if (lines[i + j] !== hunk.oldLines[j]) {
                allMatch = false
                break
              }
            }
            if (allMatch) {
              startLine = i + 1
              endLine = startLine + hunk.oldLines.length - 1
              foundOldLines = true
              break
            }
          }
        }

        // 如果还是没找到oldLines，使用上下文行的位置作为参考（假设oldLines在上下文行之后）
        if (!foundOldLines) {
          startLine = contextPos.end.line + 1
          endLine = startLine + hunk.oldLines.length - 1

          // 确保位置有效
          if (startLine > lines.length + 1) {
            startLine = lines.length + 1
            endLine = startLine + hunk.oldLines.length - 1
          }
        }
      } else {
        // 纯插入操作，位置在上下文行之后
        startLine = contextPos.end.line + 1
        endLine = startLine

        // 确保位置有效
        if (startLine > lines.length + 1) {
          startLine = lines.length + 1
          endLine = startLine
        }
      }

      logger.info('使用上下文匹配定位 hunk', {
        originalLine: hunk.oldStart,
        matchedLine: startLine,
        contextMatchedLine: contextPos.start.line
      })
    }
  } else {
    // 验证行号位置的内容是否匹配
    if (hunk.oldLines.length > 0) {
      const actualLines = lines.slice(startLine - 1, endLine)
      const expectedLines = hunk.oldLines

      // 检查是否匹配（允许部分匹配，因为可能有上下文行）
      let matched = false
      for (let i = 0; i <= actualLines.length - expectedLines.length; i++) {
        let allMatch = true
        for (let j = 0; j < expectedLines.length; j++) {
          if (actualLines[i + j] !== expectedLines[j]) {
            allMatch = false
            break
          }
        }
        if (allMatch) {
          matched = true
          startLine = startLine + i
          endLine = startLine + expectedLines.length - 1
          break
        }
      }

      if (!matched && hunk.contextLines.length > 0) {
        // 内容不匹配，尝试使用上下文匹配
        const contextPos = findPositionByContext(text, hunk.contextLines, hunk.oldStart)
        if (contextPos) {
          // 找到上下文位置后，尝试在上下文行附近查找oldLines
          // 首先尝试在上下文行之后查找
          const contextEndLine = contextPos.end.line
          const searchStartLine = Math.max(1, contextEndLine)
          const searchEndLine = Math.min(lines.length, contextEndLine + hunk.oldLines.length + 5)

          let foundOldLines = false
          for (let i = searchStartLine - 1; i <= searchEndLine - hunk.oldLines.length; i++) {
            let allMatch = true
            for (let j = 0; j < hunk.oldLines.length; j++) {
              if (lines[i + j] !== hunk.oldLines[j]) {
                allMatch = false
                break
              }
            }
            if (allMatch) {
              startLine = i + 1
              endLine = startLine + hunk.oldLines.length - 1
              foundOldLines = true
              break
            }
          }

          // 如果没找到，尝试在上下文行之前查找
          if (!foundOldLines) {
            const searchStartLine2 = Math.max(1, contextPos.start.line - hunk.oldLines.length - 5)
            const searchEndLine2 = Math.min(lines.length, contextPos.start.line)

            for (let i = searchStartLine2 - 1; i <= searchEndLine2 - hunk.oldLines.length; i++) {
              let allMatch = true
              for (let j = 0; j < hunk.oldLines.length; j++) {
                if (lines[i + j] !== hunk.oldLines[j]) {
                  allMatch = false
                  break
                }
              }
              if (allMatch) {
                startLine = i + 1
                endLine = startLine + hunk.oldLines.length - 1
                foundOldLines = true
                break
              }
            }
          }

          // 如果还是没找到，使用上下文行的位置作为参考（假设oldLines在上下文行之后）
          if (!foundOldLines) {
            startLine = contextPos.end.line + 1
            endLine = startLine + hunk.oldLines.length - 1
          }

          logger.info('使用上下文匹配定位 hunk（内容不匹配）', {
            originalLine: hunk.oldStart,
            matchedLine: startLine,
            foundOldLines
          })
        } else {
          // 内容不匹配且无上下文：按行号回退（常见于乱码/编码不一致时 agent 看到的“旧内容”与文档实际不一致）
          const fallbackStart = Math.max(1, Math.min(hunk.oldStart, lines.length))
          const fallbackEnd = Math.min(
            Math.max(fallbackStart, hunk.oldStart + hunk.oldCount - 1),
            lines.length
          )
          if (fallbackEnd >= fallbackStart && hunk.newLines.length > 0) {
            startLine = fallbackStart
            endLine = fallbackEnd
            logger.info('按行号回退应用 diff（内容不匹配，可能为编码/乱码）', {
              oldStart: hunk.oldStart,
              oldCount: hunk.oldCount,
              appliedRange: { startLine, endLine }
            })
          } else {
            logger.warn('行号位置内容不匹配且上下文匹配失败，行号回退不可用', {
              hunk: hunk,
              actualLines: actualLines.slice(0, 3)
            })
            return null
          }
        }
      }
      if (!matched && hunk.oldLines.length > 0 && hunk.contextLines.length === 0) {
        // 无上下文行（如 diff 只改首行）：内容不匹配时仍按行号回退，避免乱码/编码不一致导致整段替换失败
        const fallbackStart = Math.max(1, Math.min(hunk.oldStart, lines.length))
        const fallbackEnd = Math.min(
          Math.max(fallbackStart, hunk.oldStart + hunk.oldCount - 1),
          lines.length
        )
        if (fallbackEnd >= fallbackStart) {
          startLine = fallbackStart
          endLine = fallbackEnd
          logger.info('按行号回退应用 diff（无上下文，内容不匹配，可能为乱码/编码）', {
            oldStart: hunk.oldStart,
            oldCount: hunk.oldCount,
            appliedRange: { startLine, endLine }
          })
        } else {
          logger.warn('行号位置内容不匹配且无上下文，行号回退不可用', {
            hunk: hunk,
            actualLines: actualLines.slice(0, 3)
          })
          return null
        }
      }
    }
  }

  // 构建 EditOperation
  // 对于插入操作，endLine 应该等于 startLine
  if (type === 'insert') {
    endLine = startLine
  }

  const operation: EditOperation = {
    type,
    range: {
      start: { line: startLine, column: 1 },
      end: { line: endLine, column: lines[endLine - 1]?.length + 1 || 1 }
    },
    content: newLinesToContent(hunk.newLines),
    anchor:
      hunk.contextLines.length > 0
        ? {
            context: hunk.contextLines.join('\n')
          }
        : undefined
  }

  return operation
}

/**
 * 应用多个编辑操作（从后往前应用，避免位置偏移）
 * 注意：此函数已被内联到回调函数中，保留仅用于向后兼容
 * @deprecated 请直接在回调函数中处理编辑操作
 */
function applyEditsToText(text: string, edits: EditOperation[]): string {
  // 从后往前排序，避免位置偏移
  const sortedEdits = [...edits].sort((a, b) => {
    const aStart = positionToOffset(text, a.range.start.line, a.range.start.column)
    const bStart = positionToOffset(text, b.range.start.line, b.range.start.column)
    return bStart - aStart // 降序
  })

  let result = text

  for (const edit of sortedEdits) {
    try {
      result = applyEditToText(result, edit)
    } catch (error) {
      logger.warn('应用编辑失败:', error, edit)
      throw error
    }
  }

  return result
}

/**
 * 编辑Tool回调函数
 */
const editToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const operations = params.operations as AnyEditOperation[] | undefined
  const operation = params.operation as AnyEditOperation | undefined
  const diff = params.diff as string | undefined
  const tabId = params.tabId as string | undefined
  const filePathParam = params.filePath as string | undefined

  // 优先处理 diff 格式（如果提供）
  if (diff !== undefined) {
    // 检查空 diff
    if (!diff || !diff.trim()) {
      return {
        status: 'failed',
        error: createDetailedError(
          'Diff 字符串不能为空',
          [
            '请提供有效的 Unified diff 格式字符串',
            '示例：{"diff": "@@ -5,2 +5,2 @@\\n-旧文本\\n+新文本"}'
          ],
          []
        )
      }
    }

    try {
      onUpdate(
        {
          content: {
            stage: 'loading',
            editCount: 0
          },
          format: 'json',
          componentName: 'EditDisplay'
        },
        {
          percentage: 10,
          message: i18n.global.t('agent.tool.edit.progress.loading', '正在解析 diff...')
        }
      )

      // 解析 Unified diff
      const hunks = parseUnifiedDiff(diff)

      // --- filePath 分支：按工作区文件路径编辑（支持新建文件）---
      if (filePathParam) {
        if (!messageBridge.getIpc()?.invoke) {
          return {
            status: 'failed',
            error: createDetailedError('filePath editing requires IPC (Electron environment only)', [], [])
          }
        }
        const absPath = resolveFilePath(filePathParam)
        onUpdate(
          {
            content: { stage: 'loading', filePath: absPath, editCount: 0 },
            format: 'json',
            componentName: 'EditDisplay'
          },
          {
            percentage: 10,
            message: i18n.global.t('agent.tool.edit.progress.loading', '正在解析 diff...')
          }
        )
        let currentContent: string | null = null
        try {
          currentContent = (await messageBridge.invoke('read-file-content', absPath)) as
            | string
            | null
        } catch (e) {
          logger.warn('read-file-content failed', e)
        }
        const isPureAdd = hunks.every((h) => h.oldCount === 0 && h.oldStart === 0)
        const isEmptyContent =
          currentContent === null ||
          currentContent === undefined ||
          String(currentContent).trim() === ''
        const isNewFile = isEmptyContent && isPureAdd
        if (isNewFile) {
          if (!isPureAdd) {
            return {
              status: 'failed',
              error: createDetailedError(
                '新建文件时 diff 必须为纯新增（old 侧为 0,0）',
                [
                  '示例：{"filePath": "path/to/new.md", "diff": "@@ -0,0 +1,3 @@\\n+line1\\n+line2\\n+line3"}'
                ],
                []
              )
            }
          }
          const linesToWrite = hunks.flatMap((h) =>
            h.newLines.length > 0
              ? h.newLines
              : h.oldCount === 0
                ? h.contextLines
                : []
          )
          const newContent = newLinesToContent(linesToWrite)
          if (!newContent) {
            return {
              status: 'failed',
              error: createDetailedError(
                '新建文件解析后内容为空',
                [
                  '请在 diff 正文中为每一行使用 + 前缀，例如：@@ -0,0 +1,2 @@\\n+第一行\\n+第二行',
                  '若已写正文但无 + 前缀，请升级客户端；仍失败请检查 hunk 头与行数是否一致'
                ],
                []
              )
            }
          }
          onUpdate(
            {
              content: { stage: 'updating', editCount: 1, appliedCount: 1, failedCount: 0 },
              format: 'json',
              componentName: 'EditDisplay'
            },
            {
              percentage: 80,
              message: i18n.global.t('agent.tool.edit.progress.updating', '正在更新文档...')
            }
          )
          await messageBridge.invoke('write-file-content', {
            filePath: absPath,
            content: newContent
          })
          const addedLines = hunks.reduce((s, h) => s + (h.newLines?.length ?? h.newCount ?? 0), 0)
          const removedLines = hunks.reduce(
            (s, h) => s + (h.oldLines?.length ?? h.oldCount ?? 0),
            0
          )
          try {
            const sid = params._sessionId as string | undefined
            const umid = params._userMessageId as string | undefined
            if (sid && umid) {
              useAgentEditStagingStore().pushEdit(sid, umid, {
                filePath: absPath,
                type: 'create',
                newContent,
                addedLines,
                removedLines
              })
            }
          } catch (_) {
            /* ignore */
          }
          const newFileResult: EditResult = {
            appliedEdits: 1,
            failedEdits: 0,
            operations: [],
            hunks,
            filePath: absPath,
            rawDiff: diff
          }
          return {
            status: 'succeeded',
            data: {
              content: { stage: 'completed', result: newFileResult },
              format: 'json',
              componentName: 'EditDisplay'
            },
            result: { appliedEdits: 1, failedEdits: 0, operations: [], hunks, rawDiff: diff }
          }
        }
        if (isEmptyContent && !isPureAdd) {
          return {
            status: 'failed',
            error: createDetailedError(
              '文件为空或不存在且 diff 不是纯新增',
              [
                '新建或空文件请使用纯新增 diff，例如：{"filePath": "path/to/new.md", "diff": "@@ -0,0 +1,3 @@\\n+line1\\n+line2\\n+line3"}'
              ],
              []
            )
          }
        }
        currentContent = (currentContent ?? '') as string
        const currentFormat =
          currentContent.trim().length === 0 ? 'md' : /\\.tex$/i.test(absPath) ? 'tex' : 'md'
        const edits: EditOperation[] = []
        for (const hunk of hunks) {
          const edit = convertHunkToEditOperation(hunk, currentContent)
          if (edit) edits.push(edit)
        }
        if (edits.length === 0) {
          return {
            status: 'failed',
            error: createDetailedError(
              '无法定位任何编辑位置',
              ['请检查 diff 中的行号或上下文是否与文件内容一致'],
              []
            )
          }
        }
        let newContent = currentContent
        const sortedEdits = [...edits].sort((a, b) => {
          const aStart = positionToOffset(newContent, a.range.start.line, a.range.start.column)
          const bStart = positionToOffset(newContent, b.range.start.line, b.range.start.column)
          return bStart - aStart
        })
        let appliedCount = 0
        let failedCount = 0
        for (const edit of sortedEdits) {
          try {
            newContent = applyEditToText(newContent, edit)
            appliedCount++
          } catch {
            failedCount++
          }
        }
        if (signal?.aborted) return { status: 'cancelled' }
        onUpdate(
          {
            content: { stage: 'updating', editCount: edits.length, appliedCount, failedCount },
            format: 'json',
            componentName: 'EditDisplay'
          },
          {
            percentage: 80,
            message: i18n.global.t('agent.tool.edit.progress.updating', '正在更新文档...')
          }
        )
        await messageBridge.invoke('write-file-content', { filePath: absPath, content: newContent })
        const addedLines = hunks.reduce((s, h) => s + (h.newLines?.length ?? h.newCount ?? 0), 0)
        const removedLines = hunks.reduce((s, h) => s + (h.oldLines?.length ?? h.oldCount ?? 0), 0)
        try {
          const sid = params._sessionId as string | undefined
          const umid = params._userMessageId as string | undefined
          if (sid && umid) {
            useAgentEditStagingStore().pushEdit(sid, umid, {
              filePath: absPath,
              type: 'edit',
              oldContent: currentContent,
              newContent,
              addedLines,
              removedLines
            })
          }
        } catch (_) {
          /* ignore */
        }
        const filePathResult: EditResult = {
          appliedEdits: appliedCount,
          failedEdits: failedCount,
          operations: edits,
          hunks,
          filePath: absPath,
          rawDiff: diff
        }
        return {
          status: 'succeeded',
          data: {
            content: { stage: 'completed', result: filePathResult },
            format: 'json',
            componentName: 'EditDisplay'
          },
          result: {
            appliedEdits: appliedCount,
            failedEdits: failedCount,
            operations: edits,
            hunks,
            rawDiff: diff
          }
        }
      }

      // --- tabId / 当前文档分支：必须能解析到“文档”tab，否则必须由调用方传 filePath/tabId ---
      const candidateTabId = tabId || workspace.activeTabId.value
      if (!candidateTabId) {
        return {
          status: 'failed',
          error: createDetailedError(
            '未指定要编辑的文档',
            [
              '必须传入 filePath 或 tabId，否则无法确定改哪个文件。',
              'filePath 示例：{"diff": "...", "filePath": "path/to/file.md"}',
              'tabId 示例：{"diff": "...", "tabId": "当前文档标签页ID"}'
            ],
            []
          )
        }
      }
      const tab = (workspace.tabs as any[]).find((t: any) => t.id === candidateTabId)
      const isDocumentTab = tab && (tab.kind === 'file' || tab.kind === 'new')
      if (!isDocumentTab) {
        return {
          status: 'failed',
          error: createDetailedError(
            '当前活动标签页不是文档，无法确定要编辑的文件',
            [
              '请先打开要编辑的文档标签页，或在调用时传入 filePath / tabId。',
              'filePath：{"diff": "...", "filePath": "相对或绝对路径"}',
              'tabId：{"diff": "...", "tabId": "文档标签页ID"}'
            ],
            []
          )
        }
      }
      const targetTabId = candidateTabId

      const doc = workspace.ensureDocument(targetTabId)
      if (!doc) {
        return {
          status: 'failed',
          error: createDetailedError(
            '文档不存在',
            [
              '请确认文档已正确打开',
              '检查tabId参数是否正确：{"diff": "...", "tabId": "正确的文档ID"}'
            ],
            []
          )
        }
      }

      // 获取当前文档内容
      let currentFormat = doc.format
      if (!currentFormat || (doc.markdown.trim().length === 0 && doc.tex.trim().length === 0)) {
        if (doc.markdown.trim().length > 0) {
          const latexPatterns = [
            /\\documentclass/i,
            /\\begin\{document\}/i,
            /\\section\{/i,
            /\\usepackage\{/i
          ]
          const isLatex = latexPatterns.some((pattern) => pattern.test(doc.markdown))
          currentFormat = isLatex ? 'tex' : 'md'
        } else if (doc.tex.trim().length > 0) {
          currentFormat = 'tex'
        } else {
          currentFormat = 'md'
        }
      }
      const docContent = currentFormat === 'md' ? doc.markdown : doc.tex

      onUpdate(
        {
          content: {
            stage: 'applying',
            editCount: hunks.length,
            currentEdit: 0
          },
          format: 'json',
          componentName: 'EditDisplay'
        },
        {
          percentage: 30,
          message: i18n.global.t('agent.tool.edit.progress.applying', '正在应用编辑...')
        }
      )

      // 将 hunks 转换为 EditOperation
      const edits: EditOperation[] = []
      for (const hunk of hunks) {
        const edit = convertHunkToEditOperation(hunk, docContent)
        if (edit) {
          edits.push(edit)
        } else {
          logger.warn('无法转换 hunk 为 EditOperation', hunk)
        }
      }

      if (edits.length === 0) {
        return {
          status: 'failed',
          error: createDetailedError(
            '无法定位任何编辑位置',
            ['请检查 diff 中的行号是否正确', '或者确保文档中包含足够的上下文行用于匹配'],
            []
          )
        }
      }

      // 应用编辑（从后往前排序，避免位置偏移）
      let appliedCount = 0
      let failedCount = 0
      let newContent = docContent

      const sortedEdits = [...edits].sort((a, b) => {
        const aStart = positionToOffset(newContent, a.range.start.line, a.range.start.column)
        const bStart = positionToOffset(newContent, b.range.start.line, b.range.start.column)
        return bStart - aStart // 降序
      })

      for (const edit of sortedEdits) {
        try {
          newContent = applyEditToText(newContent, edit)
          appliedCount++
        } catch (error) {
          logger.warn('应用编辑失败:', error, edit)
          failedCount++
        }
      }

      if (signal?.aborted) {
        return {
          status: 'cancelled'
        }
      }

      // 更新文档内容
      onUpdate(
        {
          content: {
            stage: 'updating',
            editCount: edits.length,
            appliedCount,
            failedCount
          },
          format: 'json',
          componentName: 'EditDisplay'
        },
        {
          percentage: 80,
          message: i18n.global.t('agent.tool.edit.progress.updating', '正在更新文档...')
        }
      )

      // 根据检测到的格式更新内容
      if (currentFormat === 'md') {
        workspace.updateDocumentMarkdown(targetTabId, newContent)
      } else {
        workspace.updateDocumentTex(targetTabId, newContent)
      }

      // 若当前编辑的是已打开的文件 tab，保存到磁盘，使文件内容实际变更
      try {
        await workspace.saveDocument(targetTabId)
      } catch (e) {
        logger.warn('编辑后保存到磁盘失败（可能为新建/未关联文件）', e)
      }

      // 构建结果（rawDiff 供 EditDisplay 直接显示，不依赖文件）
      const resultForDisplay: EditResult = {
        appliedEdits: appliedCount,
        failedEdits: failedCount,
        operations: edits,
        hunks: hunks,
        rawDiff: diff
      }

      const resultForAI: Omit<EditResult, 'originalContent' | 'newContent'> = {
        appliedEdits: appliedCount,
        failedEdits: failedCount,
        operations: edits,
        hunks: hunks,
        rawDiff: diff
      }

      onUpdate(
        {
          content: {
            stage: 'completed',
            result: resultForDisplay
          },
          format: 'json',
          componentName: 'EditDisplay'
        },
        {
          percentage: 100,
          message: i18n.global.t(
            'agent.tool.edit.progress.completed',
            `编辑完成，成功应用 ${appliedCount} 个编辑`
          )
        }
      )

      return {
        status: 'succeeded',
        data: {
          content: {
            stage: 'completed',
            result: resultForDisplay
          },
          format: 'json',
          componentName: 'EditDisplay'
        },
        result: resultForAI
      }
    } catch (error) {
      logger.error('处理 diff 失败:', error)

      // 提供更详细的错误信息
      if (error instanceof Error) {
        if (error.message === '未找到有效的 diff hunk') {
          return {
            status: 'failed',
            error: createDetailedError(
              '未找到有效的 diff hunk',
              [
                '请检查 diff 格式是否正确',
                '正确的格式示例：{"diff": "@@ -5,2 +5,2 @@\\n-旧文本\\n+新文本"}',
                '确保 diff 中包含至少一个 hunk 头部（以 @@ 开头）'
              ],
              []
            )
          }
        } else if (error.message === 'Diff 字符串不能为空') {
          return {
            status: 'failed',
            error: createDetailedError(
              'Diff 字符串不能为空',
              [
                '请提供有效的 Unified diff 格式字符串',
                '示例：{"diff": "@@ -5,2 +5,2 @@\\n-旧文本\\n+新文本"}'
              ],
              []
            )
          }
        }
      }

      return {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
  // 支持单个操作或多个操作（向后兼容）
  const rawEdits: AnyEditOperation[] = operations || (operation ? [operation] : [])

  if (!rawEdits || rawEdits.length === 0) {
    return {
      status: 'failed',
      error: createDetailedError(
        '缺少必需参数: 本工具只接受 diff 参数（git 风格）',
        [
          '示例：{"diff": "@@ -5,2 +5,2 @@\\n-旧文本\\n+新文本"}',
          '或带 filePath：{"filePath": "path/to/file.md", "diff": "@@ -1,3 +1,2 @@\\n-行1\\n+新行1"}'
        ],
        ['必须传入 diff 字符串：@@ -行号,行数 +行号,行数 @@ 后跟 - 删除行和 + 新增行']
      )
    }
  }

  // 验证编辑操作
  for (const edit of rawEdits) {
    // 检查edit是否为有效对象
    if (!edit || typeof edit !== 'object') {
      return {
        status: 'failed',
        error: createDetailedError(
          '编辑操作格式无效：必须是对象类型',
          [
            '{"operations": [{"type": "findReplace", "oldText": "前端", "newText": "前台", "all": true}]}',
            '{"operation": {"type": "findReplace", "oldText": "前端", "newText": "前台", "all": true}}'
          ],
          [
            '每个编辑操作必须是一个对象，包含type字段',
            '支持findReplace、insert、replace、delete等类型'
          ]
        )
      }
    }

    // 类型断言：此时edit已经确认是对象类型
    const editObj = edit as AnyEditOperation

    // 检查type字段是否存在且为字符串
    const editType = editObj.type
    if (!editType || typeof editType !== 'string') {
      const invalidType = editType ? String(editType).substring(0, 50) : 'undefined'
      return {
        status: 'failed',
        error: createDetailedError(
          `缺少或无效的编辑类型: ${invalidType}`,
          [
            '{"type": "findReplace", "oldText": "前端", "newText": "前台", "all": true}',
            '{"type": "replace", "range": {"start": {"line": 10, "column": 1}, "end": {"line": 10, "column": 20}}, "content": "新内容"}',
            '注意：type必须是字符串，不能是LaTeX命令或其他内容'
          ],
          [
            '支持findReplace、insert、replace、delete等类型',
            'type字段必须是字符串类型',
            '如果看到LaTeX命令（如\\section），说明参数格式错误，请检查JSON格式'
          ]
        )
      }
    }

    // 验证查找替换操作
    if (editObj.type === 'findReplace') {
      const findReplace = editObj as FindReplaceOperation
      const hasRange = findReplace.range && findReplace.range.start && findReplace.range.end
      const hasOldText = findReplace.oldText !== undefined && findReplace.oldText !== null
      const newTextValue = findReplace.newText ?? findReplace.content

      // 如果提供了range，需要content或newText
      if (hasRange) {
        if (newTextValue === undefined) {
          return {
            status: 'failed',
            error: createDetailedError(
              'findReplace操作：提供了range但缺少content或newText参数',
              [
                '{"type": "findReplace", "range": {"start": {"line": 10, "column": 1}, "end": {"line": 10, "column": 20}}, "content": "新内容"}',
                '{"type": "findReplace", "range": {"start": {"line": 10, "column": 1}, "end": {"line": 10, "column": 20}}, "newText": "新内容"}'
              ],
              [
                '使用range时，可以直接替换指定位置的内容，oldText可选用于验证',
                'content和newText功能相同，可以任选其一'
              ]
            )
          }
        }
      } else {
        // 没有range，必须要有oldText来查找
        if (!hasOldText) {
          return {
            status: 'failed',
            error: createDetailedError(
              'findReplace操作：缺少oldText参数（未提供range时必须提供oldText）',
              [
                '{"type": "findReplace", "oldText": "前端", "newText": "前台"}',
                '{"type": "findReplace", "oldText": "前端", "newText": "前台", "all": true}  // 替换所有匹配项'
              ],
              [
                '使用oldText可以查找并替换文本，无需知道精确位置',
                '设置"all": true可以替换文档中所有匹配的文本',
                '可以一次调用中包含多个findReplace操作'
              ]
            )
          }
        }
        if (newTextValue === undefined) {
          return {
            status: 'failed',
            error: createDetailedError(
              'findReplace操作：缺少newText或content参数',
              [
                '{"type": "findReplace", "oldText": "前端", "newText": "前台"}',
                '{"type": "findReplace", "oldText": "前端", "content": "前台"}  // content和newText功能相同'
              ],
              [
                'newText和content功能相同，可以任选其一',
                '可以设置为空字符串""来删除匹配的文本',
                '设置"all": true可以全局替换'
              ]
            )
          }
        }
      }
    }
    // 验证基于位置的操作
    else if (['insert', 'replace', 'delete'].includes(editObj.type)) {
      const posEdit = editObj as EditOperation
      if (!posEdit.range || !posEdit.range.start || !posEdit.range.end) {
        return {
          status: 'failed',
          error: createDetailedError(
            '缺少编辑范围（range参数）',
            [
              `{"type": "${posEdit.type}", "range": {"start": {"line": 10, "column": 1}, "end": {"line": 10, "column": 20}}, "content": "内容"}`,
              '或者使用findReplace：{"type": "findReplace", "oldText": "旧文本", "newText": "新文本", "all": true}  // 更简单，无需知道位置'
            ],
            ['推荐使用findReplace，无需知道精确的行号列号', 'findReplace支持全局替换和批量操作']
          )
        }
      }
      if (
        (posEdit.type === 'insert' || posEdit.type === 'replace') &&
        posEdit.content === undefined
      ) {
        return {
          status: 'failed',
          error: createDetailedError(
            `${posEdit.type}操作需要content参数`,
            [
              `{"type": "${posEdit.type}", "range": {"start": {"line": 10, "column": 1}, "end": {"line": 10, "column": 20}}, "content": "要插入或替换的内容"}`,
              `或者使用findReplace：{"type": "findReplace", "oldText": "旧文本", "newText": "新文本"}  // 更简单`
            ],
            ['推荐使用findReplace进行替换操作，更灵活方便', 'findReplace支持全局替换（all: true）']
          )
        }
      }
    } else {
      return {
        status: 'failed',
        error: createDetailedError(
          `无效的编辑类型: ${editObj.type}`,
          [
            '支持的类型：findReplace, insert, replace, delete',
            '推荐使用findReplace：{"type": "findReplace", "oldText": "旧文本", "newText": "新文本", "all": true}'
          ],
          [
            'findReplace是最灵活的编辑方式，支持全局替换和批量操作',
            '可以在一次调用中包含多个findReplace操作'
          ]
        )
      }
    }
  }

  try {
    onUpdate(
      {
        content: {
          stage: 'loading',
          editCount: rawEdits.length
        },
        format: 'json',
        componentName: 'EditDisplay'
      },
      {
        percentage: 10,
        message: i18n.global.t('agent.tool.edit.progress.loading', '正在加载文档...')
      }
    )

    // 获取文档
    const targetTabId = tabId || workspace.activeTabId.value
    if (!targetTabId) {
      return {
        status: 'failed',
        error: createDetailedError(
          '没有活动的文档标签页',
          [
            '请先打开一个文档，然后再执行编辑操作',
            '或者指定tabId参数：{"operations": [...], "tabId": "文档ID"}'
          ],
          []
        )
      }
    }

    const doc = workspace.ensureDocument(targetTabId)
    if (!doc) {
      return {
        status: 'failed',
        error: createDetailedError(
          '文档不存在',
          [
            '请确认文档已正确打开',
            '检查tabId参数是否正确：{"operations": [...], "tabId": "正确的文档ID"}'
          ],
          []
        )
      }
    }

    // 获取当前文档内容
    // 如果文档格式未确定（新建文档），尝试从现有内容检测格式
    let currentFormat = doc.format
    if (!currentFormat || (doc.markdown.trim().length === 0 && doc.tex.trim().length === 0)) {
      // 新建文档或内容为空，尝试从markdown或tex中检测
      if (doc.markdown.trim().length > 0) {
        // 检测markdown内容是否为LaTeX
        const latexPatterns = [
          /\\documentclass/i,
          /\\begin\{document\}/i,
          /\\section\{/i,
          /\\usepackage\{/i
        ]
        const isLatex = latexPatterns.some((pattern) => pattern.test(doc.markdown))
        currentFormat = isLatex ? 'tex' : 'md'
      } else if (doc.tex.trim().length > 0) {
        currentFormat = 'tex'
      } else {
        // 内容为空，默认使用md
        currentFormat = 'md'
      }
    }
    const currentContent = currentFormat === 'md' ? doc.markdown : doc.tex

    onUpdate(
      {
        content: {
          stage: 'applying',
          editCount: rawEdits.length,
          currentEdit: 0
        },
        format: 'json',
        componentName: 'EditDisplay'
      },
      {
        percentage: 30,
        message: i18n.global.t('agent.tool.edit.progress.applying', '正在应用编辑...')
      }
    )

    // 将查找替换操作转换为基于位置的编辑操作
    let edits: EditOperation[] = []
    let findReplaceFailedCount = 0

    for (const rawEdit of rawEdits) {
      if (rawEdit.type === 'findReplace') {
        const findReplace = rawEdit as FindReplaceOperation
        const hasRange = findReplace.range && findReplace.range.start && findReplace.range.end
        const newTextValue = findReplace.newText ?? findReplace.content

        // 如果提供了range，直接使用位置编辑
        if (hasRange && newTextValue !== undefined) {
          edits.push({
            type: 'replace',
            range: findReplace.range!,
            content: newTextValue
          })
        }
        // 否则使用oldText查找替换
        else if (findReplace.oldText && newTextValue !== undefined) {
          try {
            // 将查找替换转换为位置编辑（基于原始内容）
            const convertedEdits = convertFindReplaceToEditOperations(currentContent, findReplace)
            if (convertedEdits.length === 0) {
              // 没有找到匹配项
              findReplaceFailedCount++
              logger.warn('查找替换未找到匹配项:', findReplace)
            } else {
              edits.push(...convertedEdits)
            }
          } catch (error) {
            // 转换失败（例如未找到文本）
            findReplaceFailedCount++
            logger.warn('转换查找替换操作失败:', error, findReplace)
          }
        }
      } else {
        // 基于位置的操作直接使用
        edits.push(rawEdit as EditOperation)
      }
    }

    // 应用编辑（需要跟踪成功和失败的数量）
    let appliedCount = 0
    let failedCount = findReplaceFailedCount // 先计入查找替换失败的次数
    let newContent = currentContent

    // 从后往前排序，避免位置偏移
    const sortedEdits = [...edits].sort((a, b) => {
      const aStart = positionToOffset(newContent, a.range.start.line, a.range.start.column)
      const bStart = positionToOffset(newContent, b.range.start.line, b.range.start.column)
      return bStart - aStart // 降序
    })

    for (const edit of sortedEdits) {
      try {
        newContent = applyEditToText(newContent, edit)
        appliedCount++
      } catch (error) {
        logger.warn('应用编辑失败:', error, edit)
        failedCount++
      }
    }

    if (signal?.aborted) {
      return {
        status: 'cancelled'
      }
    }

    // 更新文档内容
    onUpdate(
      {
        content: {
          stage: 'updating',
          editCount: edits.length,
          appliedCount,
          failedCount
        },
        format: 'json',
        componentName: 'EditDisplay'
      },
      {
        percentage: 80,
        message: i18n.global.t('agent.tool.edit.progress.updating', '正在更新文档...')
      }
    )

    // 根据检测到的格式更新内容（updateDocumentMarkdown/updateDocumentTex会自动检测格式并同步大纲树）
    if (currentFormat === 'md') {
      workspace.updateDocumentMarkdown(targetTabId, newContent)
    } else {
      workspace.updateDocumentTex(targetTabId, newContent)
    }

    // 若当前编辑的是已打开的文件 tab，保存到磁盘
    try {
      await workspace.saveDocument(targetTabId)
    } catch (e) {
      logger.warn('编辑后保存到磁盘失败（可能为新建/未关联文件）', e)
    }

    const resultForDisplay: EditResult = {
      appliedEdits: appliedCount,
      failedEdits: failedCount,
      operations: edits
    }

    const resultForAI: Omit<EditResult, 'originalContent' | 'newContent'> = {
      appliedEdits: appliedCount,
      failedEdits: failedCount,
      operations: edits
    }

    onUpdate(
      {
        content: {
          stage: 'completed',
          result: resultForDisplay
        },
        format: 'json',
        componentName: 'EditDisplay'
      },
      {
        percentage: 100,
        message: i18n.global.t(
          'agent.tool.edit.progress.completed',
          `编辑完成，成功应用 ${appliedCount} 个编辑`
        )
      }
    )

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          result: resultForDisplay
        },
        format: 'json',
        componentName: 'EditDisplay'
      },
      result: resultForAI
    }
  } catch (error) {
    logger.error('编辑失败:', error)
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

const EDIT_TOOL_NAME = 'Document Edit'
const EDIT_TOOL_DESCRIPTION =
  'Git unified diff only: `diff` string with @@ hunk headers; `-` delete, `+` insert; optional leading-space context lines; for new/empty files use @@ -0,0 +1,N @@ and prefer every body line prefixed with +'

export const editToolConfig: AgentToolConfig = {
  id: 'edit',
  name: EDIT_TOOL_NAME,
  description: EDIT_TOOL_DESCRIPTION,
  origin: 'internal',
  instruction:
    'Edit with git unified diff only (`diff`). Target: `filePath` (workspace relative/abs) or `tabId`, else active document tab. Each line after the @@ header must follow diff rules: lines to remove start with `-`, lines to add start with `+`, unchanged context lines start with a single space (standard git) so they match the file exactly. For **new or empty files** use `@@ -0,0 +1,N @@` and **prefix every inserted line with `+`** (recommended). Keep real newlines inside the string (JSON `\\n`), not the two characters backslash-n. Do not use `operations`.',
  spec: {
    name: 'edit',
    brief:
      'Workspace file edits via unified diff in `diff` only. Set `filePath`+`diff` to create files (`@@ -0,0 +1,N @@`, each new line with `+`). For patches, include `-`/`+` and optional space-prefixed context lines so line boundaries stay correct. Never use terminal to write file text.',
    fullSpec: `
# Document Edit Tool (git unified diff only)

**Specify target file**: Pass \`filePath\` (workspace-relative or absolute) or \`tabId\` (document tab ID). If both omitted, uses current active document tab (fails if active tab is not a document).

**Only usage**: \`diff\` parameter must be **git-style Unified diff**. \`operations\` is not supported.

**Line rules (critical for correct newlines and no “stuck together” lines)**:
- After each \`@@ -oldStart,oldCount +newStart,newCount @@\` header, every body line must have a **prefix**:
  - \`-\` = line removed from the old file
  - \`+\` = line added in the new file
  - **Single leading space** = unchanged **context** line (must match the file line exactly, without that space)
- **New or empty file**: use \`@@ -0,0 +1,N @@\` then **each line of the new file must start with \`+\`**. This is the most reliable form and avoids empty writes.
- The implementation may tolerate omitted \`+\` on “old side zero lines” hunks, but **always emit \`+\`** for portability.
- In JSON/tool arguments, the \`diff\` value must contain **real newline characters** (escape as \`\\n\` in JSON), not the literal letters \\\\n inside one long line.

**Create new file**: \`{"filePath":"rel/or/abs.md","diff":"@@ -0,0 +1,3 @@\\n+line1\\n+line2\\n+line3"}\`

## Unified Diff format
- **Hunk header**: \`@@ -oldStart,oldCount +newStart,newCount @@\`
- **Delete / insert**: as above
- **Context**: optional; use a **single space** as the first character, then the exact file text

## Examples
- Replace: \`{"diff": "@@ -5,2 +5,2 @@\\n unchanged line above\\n-old1\\n-old2\\n+new1\\n+new2"}\` (note space before \`unchanged\`)
- Insert: \`{"diff": "@@ -5,0 +5,2 @@\\n+line1\\n+line2"}\`
- Delete: \`{"diff": "@@ -5,2 +5,0 @@\\n-line1\\n-line2"}\`

## Notes
- Prefer \`filePath\` when editing workspace files so the tool does not depend on the active tab.
- Do not use the terminal tool to create or edit text file bodies (encoding and newlines).
`
  },
  callback: editToolCallback,
  get displayComponent() {
    return EditDisplay
  },
  tags: ['edit', 'document', 'text'],
  enabled: true,
  editable: false,
  inputSchema: {
    type: 'object',
    properties: {
      // 首选参数：用 git diff 字符串，避免繁琐的 operations
      diff: {
        type: 'string',
        description:
          '【唯一接受】git unified diff 字符串。hunk 头：@@ -oldStart,oldCount +newStart,newCount @@；正文每行须有前缀：- 删除、+ 新增、行首单空格+原文为上下文（须与文件行完全一致）。新建/空文件用 @@ -0,0 +1,N @@ 且建议每行以 + 开头；参数里用真实换行（JSON 写 \\n）。示例：{"diff": "@@ -5,2 +5,2 @@\\n 上文\\n-旧\\n+新"}。勿用 operations。'
      },
      filePath: {
        type: 'string',
        description:
          '工作区相对路径或绝对路径（可选）。编辑/新建磁盘文件时务必传 filePath，避免仅依赖当前标签页；与 diff 联用。新建：filePath + @@ -0,0 +1,N @@ + 各行 + 前缀。'
      },
      tabId: {
        type: 'string',
        description: '文档标签页ID（可选，默认使用当前活动标签页）'
      },
      operations: {
        type: 'array',
        items: {
          type: 'object',
          oneOf: [
            {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['findReplace'] },
                oldText: { type: 'string', description: '要查找的文本' },
                newText: { type: 'string', description: '替换为的文本' },
                all: { type: 'boolean', description: '是否替换所有匹配项（默认false）' },
                caseSensitive: { type: 'boolean', description: '是否区分大小写（默认false）' }
              },
              required: ['type', 'oldText', 'newText']
            },
            {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['insert', 'replace', 'delete'] },
                range: {
                  type: 'object',
                  properties: {
                    start: {
                      type: 'object',
                      properties: { line: { type: 'number' }, column: { type: 'number' } },
                      required: ['line', 'column']
                    },
                    end: {
                      type: 'object',
                      properties: { line: { type: 'number' }, column: { type: 'number' } },
                      required: ['line', 'column']
                    }
                  },
                  required: ['start', 'end']
                },
                content: { type: 'string' }
              },
              required: ['type', 'range']
            }
          ]
        },
        description: '（兼容旧版，提示词中不体现）编辑操作列表。仅文档化：请使用 diff 参数。'
      },
      operation: {
        type: 'object',
        description: '（兼容旧版，提示词中不体现）单个编辑操作。仅文档化：请使用 diff 参数。'
      }
    }
  },
  outputSchema: {
    type: 'object',
    properties: {
      appliedEdits: {
        type: 'number',
        description: '成功应用的编辑数量'
      },
      failedEdits: {
        type: 'number',
        description: '失败的编辑数量'
      },
      operations: {
        type: 'array',
        description: '编辑操作列表'
      }
    }
  }
}
