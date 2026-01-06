/**
 * 编辑Tool
 * 直接对文章进行编辑，支持多处编辑
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress,
  ToolLocales
} from '../../types/agent-tool'
import { useWorkspace } from '../../stores/workspace'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import type { TextRange } from '../../editor/text-editor-types'
import EditDisplay from './components/EditDisplay.vue'
import { createDetailedError } from './tool-utils'

const logger = createRendererLogger('EditTool')
const workspace = useWorkspace()

/**
 * 稳定锚点（用于增量diff编辑）
 * 当行号失效时，使用锚点定位
 */
export interface StableAnchor {
  before?: string  // 改动前的关键字（用于定位）
  after?: string   // 改动后的关键字（用于验证）
  context?: string // 上下文文本（可选，用于更精确的定位）
}

/**
 * 编辑操作（基于位置的编辑，支持增量diff）
 */
export interface EditOperation {
  type: 'insert' | 'replace' | 'delete'
  range: {
    start: { line: number; column: number }  // 1-based
    end: { line: number; column: number }   // 1-based
  }
  content?: string  // 对于insert和replace操作
  anchor?: StableAnchor  // 稳定锚点（可选，用于fallback定位）
}

/**
 * 查找替换操作（基于文本内容的编辑）
 * 支持两种模式：
 * 1. 基于查找：使用oldText查找并替换（需要oldText和newText）
 * 2. 基于位置：使用range和content直接替换（需要range和content，oldText可选用于验证）
 */
export interface FindReplaceOperation {
  type: 'findReplace'
  oldText?: string  // 要查找的文本（如果提供了range，则oldText可选，用于验证位置内容）
  newText?: string  // 替换为的文本（与content二选一，如果提供了range则使用content）
  content?: string  // 替换为的文本（与newText二选一，如果提供了range则优先使用content）
  range?: {
    start: { line: number; column: number }  // 1-based
    end: { line: number; column: number }   // 1-based
  }  // 可选，如果提供了range，则直接使用范围替换，不需要oldText查找
  all?: boolean  // 是否替换所有匹配项（默认false，只替换第一个，仅在基于查找模式下有效）
  caseSensitive?: boolean  // 是否区分大小写（默认false，仅在基于查找模式下有效）
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
}

/**
 * 将行号和列号转换为文本偏移量
 */
function positionToOffset(text: string, line: number, column: number): number {
  const lines = text.split(/\r?\n/)
  let offset = 0
  
  // 累加前面所有行的长度（包括换行符）
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    offset += lines[i].length + 1  // +1 for newline
  }
  
  // 加上当前行的列偏移（column是1-based，需要减1）
  offset += Math.min(column - 1, lines[line - 1]?.length || 0)
  
  return offset
}

/**
 * 将文本偏移量转换为行号和列号
 */
function offsetToPosition(text: string, offset: number): { line: number; column: number } {
  const lines = text.split(/\r?\n/)
  let currentOffset = 0
  
  for (let i = 0; i < lines.length; i++) {
    const lineLength = lines[i].length
    const lineEndOffset = currentOffset + lineLength
    
    if (offset <= lineEndOffset) {
      return {
        line: i + 1,
        column: offset - currentOffset + 1
      }
    }
    
    currentOffset = lineEndOffset + 1  // +1 for newline
  }
  
  // 如果offset超出文本长度，返回最后一行
  return {
    line: lines.length,
    column: lines[lines.length - 1]?.length + 1 || 1
  }
}

/**
 * 查找文本在文档中的所有匹配位置（使用字符串查找，不使用正则表达式）
 * @param text 文档内容
 * @param searchText 要查找的文本
 * @param caseSensitive 是否区分大小写
 * @returns 所有匹配位置的偏移量数组
 */
function findAllMatches(text: string, searchText: string, caseSensitive: boolean = false): number[] {
  if (!searchText) {
    return []
  }
  
  const matches: number[] = []
  let searchIndex = 0
  const workingText = caseSensitive ? text : text.toLowerCase()
  const workingSearchText = caseSensitive ? searchText : searchText.toLowerCase()
  
  while (true) {
    const index = workingText.indexOf(workingSearchText, searchIndex)
    if (index === -1) {
      break
    }
    matches.push(index)
    searchIndex = index + 1  // 继续查找下一个匹配项
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
      if (!actualText.includes(edit.anchor.before) && !edit.anchor.before.includes(actualText.trim())) {
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
        throw new Error(`无法定位编辑位置：行号失效且锚点匹配失败。行号: ${edit.range.start.line}, 锚点: ${edit.anchor.before?.substring(0, 20)}`)
      }
    } else {
      // 没有锚点，直接抛出原始错误
      throw error
    }
  }
  
  if (startOffset > endOffset) {
    throw new Error(`起始位置不能大于结束位置`)
  }
  
  // 根据操作类型应用编辑
  if (edit.type === 'insert') {
    // 插入：在start位置插入内容
    const before = text.slice(0, startOffset)
    const after = text.slice(startOffset)
    return before + (edit.content || '') + after
  } else if (edit.type === 'replace') {
    // 替换：替换range范围内的内容
    const before = text.slice(0, startOffset)
    const middle = edit.content || ''
    const after = text.slice(endOffset)
    return before + middle + after
  } else if (edit.type === 'delete') {
    // 删除：删除range范围内的内容
    const before = text.slice(0, startOffset)
    const after = text.slice(endOffset)
    return before + after
  }
  
  throw new Error(`未知的编辑类型: ${edit.type}`)
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
    return bStart - aStart  // 降序
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
  const tabId = params.tabId as string | undefined

  // 支持单个操作或多个操作
  const rawEdits: AnyEditOperation[] = operations || (operation ? [operation] : [])

  if (!rawEdits || rawEdits.length === 0) {
    return {
      status: 'failed',
      error: createDetailedError(
        '缺少必需参数: operations 或 operation',
        [
          '{"operations": [{"type": "findReplace", "oldText": "前端", "newText": "前台", "all": true}]}',
          '{"operation": {"type": "findReplace", "oldText": "前端", "newText": "前台", "all": true}}'
        ],
        ['可以一次调用中包含多个替换操作', '使用"all": true可以全局替换所有匹配项', '推荐使用findReplace，无需知道精确位置']
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
          ['每个编辑操作必须是一个对象，包含type字段', '支持findReplace、insert、replace、delete等类型']
        )
      }
    }
    
    // 检查type字段是否存在且为字符串
    if (!edit.type || typeof edit.type !== 'string') {
      const invalidType = edit.type ? String(edit.type).substring(0, 50) : 'undefined'
      return {
        status: 'failed',
        error: createDetailedError(
          `缺少或无效的编辑类型: ${invalidType}`,
          [
            '{"type": "findReplace", "oldText": "前端", "newText": "前台", "all": true}',
            '{"type": "replace", "range": {"start": {"line": 10, "column": 1}, "end": {"line": 10, "column": 20}}, "content": "新内容"}',
            '注意：type必须是字符串，不能是LaTeX命令或其他内容'
          ],
          ['支持findReplace、insert、replace、delete等类型', 'type字段必须是字符串类型', '如果看到LaTeX命令（如\\section），说明参数格式错误，请检查JSON格式']
        )
      }
    }
    
    // 验证查找替换操作
    if (edit.type === 'findReplace') {
      const findReplace = edit as FindReplaceOperation
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
              ['使用range时，可以直接替换指定位置的内容，oldText可选用于验证', 'content和newText功能相同，可以任选其一']
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
              ['使用oldText可以查找并替换文本，无需知道精确位置', '设置"all": true可以替换文档中所有匹配的文本', '可以一次调用中包含多个findReplace操作']
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
              ['newText和content功能相同，可以任选其一', '可以设置为空字符串""来删除匹配的文本', '设置"all": true可以全局替换']
            )
          }
        }
      }
    }
    // 验证基于位置的操作
    else if (['insert', 'replace', 'delete'].includes(edit.type)) {
      const posEdit = edit as EditOperation
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
      if ((posEdit.type === 'insert' || posEdit.type === 'replace') && posEdit.content === undefined) {
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
          `无效的编辑类型: ${edit.type}`,
          [
            '支持的类型：findReplace, insert, replace, delete',
            '推荐使用findReplace：{"type": "findReplace", "oldText": "旧文本", "newText": "新文本", "all": true}'
          ],
          ['findReplace是最灵活的编辑方式，支持全局替换和批量操作', '可以在一次调用中包含多个findReplace操作']
        )
      }
    }
  }

  try {
    onUpdate({
      content: {
        stage: 'loading',
        editCount: rawEdits.length
      },
      format: 'json',
      componentName: 'EditDisplay'
    }, {
      percentage: 10,
      message: i18n.global.t('agent.tool.edit.progress.loading', '正在加载文档...')
    })

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
        const isLatex = latexPatterns.some(pattern => pattern.test(doc.markdown))
        currentFormat = isLatex ? 'tex' : 'md'
      } else if (doc.tex.trim().length > 0) {
        currentFormat = 'tex'
      } else {
        // 内容为空，默认使用md
        currentFormat = 'md'
      }
    }
    const currentContent = currentFormat === 'md' ? doc.markdown : doc.tex

    onUpdate({
      content: {
        stage: 'applying',
        editCount: rawEdits.length,
        currentEdit: 0
      },
      format: 'json',
      componentName: 'EditDisplay'
    }, {
      percentage: 30,
      message: i18n.global.t('agent.tool.edit.progress.applying', '正在应用编辑...')
    })

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
    let failedCount = findReplaceFailedCount  // 先计入查找替换失败的次数
    let newContent = currentContent
    
    // 从后往前排序，避免位置偏移
    const sortedEdits = [...edits].sort((a, b) => {
      const aStart = positionToOffset(newContent, a.range.start.line, a.range.start.column)
      const bStart = positionToOffset(newContent, b.range.start.line, b.range.start.column)
      return bStart - aStart  // 降序
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
    onUpdate({
      content: {
        stage: 'updating',
        editCount: edits.length,
        appliedCount,
        failedCount
      },
      format: 'json',
      componentName: 'EditDisplay'
    }, {
      percentage: 80,
      message: i18n.global.t('agent.tool.edit.progress.updating', '正在更新文档...')
    })

    // 根据检测到的格式更新内容（updateDocumentMarkdown/updateDocumentTex会自动检测格式并同步大纲树）
    if (currentFormat === 'md') {
      workspace.updateDocumentMarkdown(targetTabId, newContent)
    } else {
      workspace.updateDocumentTex(targetTabId, newContent)
    }

    const result: EditResult = {
      appliedEdits: appliedCount,
      failedEdits: failedCount,
      operations: edits  // 注意：这里保存的是转换后的EditOperation，不是原始的AnyEditOperation
    }

    onUpdate({
      content: {
        stage: 'completed',
        result
      },
      format: 'json',
      componentName: 'EditDisplay'
    }, {
      percentage: 100,
      message: i18n.global.t('agent.tool.edit.progress.completed', `编辑完成，成功应用 ${appliedCount} 个编辑`)
    })

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          result
        },
        format: 'json',
        componentName: 'EditDisplay'
      },
      result
    }
  } catch (error) {
    logger.error('编辑失败:', error)
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

const editToolLocales: ToolLocales = {
  zh_cn: {
    name: '文档编辑',
    description: '直接对文章进行编辑，支持查找替换（全局/单个）和基于位置的编辑，支持一次调用执行多个替换操作'
  },
  en_us: {
    name: 'Document Edit',
    description: 'Directly edit the document, support find-replace (global/single) and position-based editing, support multiple replace operations in one call'
  },
  de_DE: {
    name: 'Dokument bearbeiten',
    description: 'Dokument direkt bearbeiten, unterstützt Suchen-Ersetzen (global/einzeln) und positionsbasierte Bearbeitung, unterstützt mehrere Ersetzungsvorgänge in einem Aufruf'
  },
  fr_FR: {
    name: 'Édition de document',
    description: 'Modifier directement le document, prendre en charge la recherche-remplacement (globale/unique) et l\'édition basée sur la position, prendre en charge plusieurs opérations de remplacement en un seul appel'
  },
  ja_JP: {
    name: 'ドキュメント編集',
    description: 'ドキュメントを直接編集し、検索置換（グローバル/単一）と位置ベースの編集をサポートし、1回の呼び出しで複数の置換操作をサポート'
  },
  ko_KR: {
    name: '문서 편집',
    description: '문서를 직접 편집하고 찾기-바꾸기(전역/단일) 및 위치 기반 편집을 지원하며, 한 번의 호출로 여러 바꾸기 작업 지원'
  }
}

export const editToolConfig: AgentToolConfig = {
  id: 'edit',
  name: editToolLocales,
  description: editToolLocales,
  origin: 'internal',
  spec: {
    name: 'edit',
    brief: 'Edit the current document with incremental diff editing. Supports insert, replace, delete operations based on position or text search.',
    fullSpec: `
# 文档编辑工具

## 功能描述
直接对当前活动文档进行编辑，支持多处编辑操作。采用**增量diff编辑框架**（类似Cursor/Claude），确保编辑稳定、高效、可控。

### 核心特性：增量diff编辑 ⭐
- **只生成变化部分**：不重写整篇文档，只生成需要修改的部分（diff）
- **稳定锚点定位**：使用行号+锚点双重定位，即使文档被修改也能准确定位
- **智能fallback机制**：行号匹配 → 锚点匹配 → fuzzy匹配，确保编辑成功
- **分块编辑**：支持将大范围编辑拆分为多个小范围编辑，提高稳定性

支持三种编辑方式：
1. **基于位置的插入**：只需指定行号和列号位置即可插入文本（**高效，推荐AI使用，无需查找文本，节省token**）
2. **基于位置的替换/删除**：需要指定精确的行号和列号位置（适合已知位置的编辑）
3. **查找替换编辑**：基于文本内容查找并替换（适合需要替换特定文本的场景）

## 使用场景
- **批量插入文本**：在多个位置插入内容（高效，无需查找文本，只需要行号和列号）
- 批量修改文档内容
- 全局替换文档中的特定文本（所有匹配项）
- 一次调用执行多个不同的查找替换操作
- 在多个位置插入文本
- 替换文档中的特定内容（查找替换）
- 删除文档中的特定内容
- AI辅助的文档编辑

## 输入格式

### 方式1：单个查找替换操作
替换文档中的第一个匹配项：
\`\`\`json
{
  "operations": [
    {
      "type": "findReplace",
      "oldText": "前端",
      "newText": "前台"
    }
  ]
}
\`\`\`

### 方式2：全局查找替换（替换所有匹配项）⭐ 推荐
使用 \`"all": true\` 可以替换文档中**所有**匹配的文本：
\`\`\`json
{
  "operations": [
    {
      "type": "findReplace",
      "oldText": "前端",
      "newText": "前台",
      "all": true  // 关键：设置为true会替换文档中所有匹配项
    }
  ]
}
\`\`\`

### 方式2a：使用range直接替换（不需要oldText查找）⭐ 新功能
如果已知精确位置，可以直接使用range替换，无需查找：
\`\`\`json
{
  "operations": [
    {
      "type": "findReplace",
      "range": {
        "start": {"line": 10, "column": 1},
        "end": {"line": 10, "column": 20}
      },
      "content": "新内容"  // 直接替换指定位置，不需要oldText
    }
  ]
}
\`\`\`

### 方式3：一次调用中执行多个查找替换操作 ⭐ 推荐
可以在一次工具调用中，在 \`operations\` 数组中包含多个查找替换操作，工具会按顺序执行所有操作：
\`\`\`json
{
  "operations": [
    {
      "type": "findReplace",
      "oldText": "前端",
      "newText": "前台",
      "all": true  // 全局替换所有"前端"为"前台"
    },
    {
      "type": "findReplace",
      "oldText": "后端",
      "newText": "后台",
      "all": true  // 全局替换所有"后端"为"后台"
    },
    {
      "type": "findReplace",
      "oldText": "旧术语",
      "newText": "新术语",
      "all": true  // 全局替换所有"旧术语"为"新术语"
    }
  ]
}
\`\`\`

**重要说明**：
- 一次调用可以包含**任意多个**查找替换操作
- 每个操作可以独立设置 \`all\` 参数（是否全局替换）
- 所有操作会在一次工具调用中执行，提高效率
- 如果某个操作找不到匹配文本，该操作会失败但不影响其他操作

### 方式4：混合查找替换和基于位置的编辑
\`\`\`json
{
  "operations": [
    {
      "type": "findReplace",
      "oldText": "旧文本",
      "newText": "新文本",
      "all": true
    },
    {
      "type": "replace",
      "range": {
        "start": { "line": 10, "column": 1 },
        "end": { "line": 10, "column": 20 }
      },
      "content": "其他内容"
    }
  ]
}
\`\`\`

### 方式5：基于位置的批量插入 ⭐ 推荐AI使用（高效，节省token）
只需要指定行号和列号位置即可插入，**无需查找文本，高效且节省token**。支持批量插入多个位置：

\`\`\`json
{
  "operations": [
    {
      "type": "insert",
      "range": {
        "start": { "line": 10, "column": 5 },
        "end": { "line": 10, "column": 5 }  // start和end相同，表示插入位置
      },
      "content": "要插入的文本"
    },
    {
      "type": "insert",
      "range": {
        "start": { "line": 15, "column": 1 },
        "end": { "line": 15, "column": 1 }
      },
      "content": "另一个位置的插入内容"
    },
    {
      "type": "insert",
      "range": {
        "start": { "line": 20, "column": 10 },
        "end": { "line": 20, "column": 10 }
      },
      "content": "第三个位置的插入内容"
    }
  ]
}
\`\`\`

**重要说明**：
- 批量插入会**自动从后往前排序并执行**，避免位置偏移
- 只需指定精确的行号和列号位置，无需查找文本
- **比findReplace更高效**：不需要输入oldText，节省token，避免字符匹配错误
- 特别适合AI在已知位置插入内容（例如：在第10行第5列插入标题，在第15行第1列插入段落）

### 方式6：基于位置的替换和删除
\`\`\`json
{
  "operations": [
    {
      "type": "replace",
      "range": {
        "start": { "line": 10, "column": 1 },
        "end": { "line": 10, "column": 20 }
      },
      "content": "新内容"
    },
    {
      "type": "delete",
      "range": {
        "start": { "line": 15, "column": 1 },
        "end": { "line": 15, "column": 50 }
      }
    }
  ],
  "tabId": "string"  // 可选，文档标签页ID，默认使用当前活动标签页
}
\`\`\`

或者使用单个操作（不推荐，使用operations数组更灵活）：
\`\`\`json
{
  "operation": {
    "type": "findReplace",
    "oldText": "前端",
    "newText": "前台",
    "all": true
  }
}
\`\`\`

## 编辑类型说明

### findReplace（查找替换）⭐ 强烈推荐AI使用

基于文本内容查找并替换，**不需要知道精确的行号列号位置**，非常适合AI使用。

**支持两种模式**：

1. **基于查找模式**（推荐）：使用oldText查找并替换
   - \`oldText\`: 要查找的文本（必需）
   - \`newText\` 或 \`content\`: 替换为的文本（必需，可以为空字符串表示删除，两者功能相同）
   - \`all\`: 是否替换所有匹配项（可选）
     - \`false\` 或省略：只替换**第一个**匹配项（默认）
     - \`true\`：替换文档中**所有**匹配项（全局替换）⭐
   - \`caseSensitive\`: 是否区分大小写（可选，默认false，不区分大小写）

2. **基于位置模式**：如果提供了range，可以直接替换指定位置，不需要oldText查找
   - \`range\`: 要替换的文本范围（必需）
   - \`content\` 或 \`newText\`: 替换为的文本（必需，两者功能相同）
   - \`oldText\`: 可选，如果提供则用于验证range位置的内容是否正确

**参数说明**：
- \`oldText\`: 要查找的文本（基于查找模式下必需，基于位置模式下可选用于验证）
- \`newText\` 或 \`content\`: 替换为的文本（两者功能相同，任选其一）
- \`range\`: 文本范围（可选，如果提供则直接使用位置替换，无需查找）
- \`all\`: 是否替换所有匹配项（仅在基于查找模式下有效）
- \`caseSensitive\`: 是否区分大小写（仅在基于查找模式下有效）

**示例1**：全局替换所有"前端"为"前台"（基于查找模式）
\`\`\`json
{
  "operations": [{
    "type": "findReplace",
    "oldText": "前端",
    "newText": "前台",
    "all": true  // 替换所有匹配项
  }]
}
\`\`\`

**示例2**：使用content参数（与newText功能相同）
\`\`\`json
{
  "operations": [{
    "type": "findReplace",
    "oldText": "前端",
    "content": "前台",  // content和newText功能相同
    "all": true
  }]
}
\`\`\`

**示例3**：基于位置直接替换（提供range，不需要oldText查找）
\`\`\`json
{
  "operations": [{
    "type": "findReplace",
    "range": {
      "start": {"line": 10, "column": 1},
      "end": {"line": 10, "column": 20}
    },
    "content": "新内容"  // 直接替换指定位置
  }]
}
\`\`\`

**示例4**：基于位置替换并验证（提供range和oldText，验证位置内容是否正确）
\`\`\`json
{
  "operations": [{
    "type": "findReplace",
    "range": {
      "start": {"line": 10, "column": 1},
      "end": {"line": 10, "column": 20}
    },
    "oldText": "旧内容",  // 可选，用于验证
    "content": "新内容"
  }]
}
\`\`\`

**示例5**：一次调用执行多个全局替换
\`\`\`json
{
  "operations": [
    {
      "type": "findReplace",
      "oldText": "术语A",
      "newText": "术语B",
      "all": true
    },
    {
      "type": "findReplace",
      "oldText": "术语C",
      "newText": "术语D",
      "all": true
    }
  ]
}
\`\`\`

**示例6**：区分大小写的替换
\`\`\`json
{
  "operations": [{
    "type": "findReplace",
    "oldText": "JavaScript",
    "newText": "TypeScript",
    "all": true,
    "caseSensitive": true  // 区分大小写
  }]
}
\`\`\`

**示例7**：删除所有匹配的文本（用空字符串替换）
\`\`\`json
{
  "operations": [{
    "type": "findReplace",
    "oldText": "待删除的文本",
    "newText": "",  // 空字符串表示删除
    "all": true
  }]
}
\`\`\`

### insert（插入）⭐ 推荐AI使用（高效，节省token）

在指定位置插入文本，**只需要行号和列号位置，无需查找文本**。这是最高效的插入方式，特别适合AI使用。

**⚠️ 重要：插入前必须先定位位置**
在插入内容之前，**必须**先使用 \`outline-tree\` 工具获取文档大纲结构，了解文档内容分布，确定合适的插入位置。**绝对不能**总是从行1列1开始插入，这是错误的做法！

**正确的工作流程**：
1. 先调用 \`outline-tree\` 工具获取文档大纲结构（设置 \`includeText: true\` 可以看到具体内容）
2. 分析大纲结构，确定要插入的位置（例如：在"第一章"之后、在"总结"之前等）
3. 根据大纲结构和文档内容，计算准确的行号和列号位置
4. 使用 \`insert\` 操作在确定的位置插入内容

**定位位置的方法**：
- 通过大纲树的 \`text\` 字段可以看到每个章节的具体内容
- 根据文本内容，计算目标位置的行号（从1开始）
- 列号通常为1（行首）或在行尾（需要计算行尾位置）

**参数说明**：
- \`range\`: 插入位置，\`start\` 和 \`end\` 应该相同（都指向同一个位置）
  - \`start.line\`: 行号（从1开始，**必须大于1**，不要总是使用行1）
  - \`start.column\`: 列号（从1开始，通常为1表示行首）
  - \`end.line\`: 与start.line相同
  - \`end.column\`: 与start.column相同
- \`content\`: 要插入的文本内容

**优势**：
- **高效**：无需输入oldText，节省token
- **准确**：直接指定位置，避免字符匹配错误
- **支持批量**：可以一次调用插入多个位置，自动从后往前执行避免位置偏移

**⚠️ 常见错误**：
- ❌ 总是从行1列1插入（这是错误的！）
- ❌ 不先获取文档结构就插入（无法确定正确位置）
- ✅ 先获取大纲结构，分析文档，确定正确位置后再插入

**示例1**：单个插入
\`\`\`json
{
  "operations": [{
    "type": "insert",
    "range": {
      "start": { "line": 10, "column": 5 },
      "end": { "line": 10, "column": 5 }
    },
    "content": "插入的内容"
  }]
}
\`\`\`

**示例2**：批量插入（推荐）⭐
\`\`\`json
{
  "operations": [
    {
      "type": "insert",
      "range": { "start": { "line": 10, "column": 1 }, "end": { "line": 10, "column": 1 } },
      "content": "第一个插入位置的内容"
    },
    {
      "type": "insert",
      "range": { "start": { "line": 20, "column": 1 }, "end": { "line": 20, "column": 1 } },
      "content": "第二个插入位置的内容"
    },
    {
      "type": "insert",
      "range": { "start": { "line": 30, "column": 1 }, "end": { "line": 30, "column": 1 } },
      "content": "第三个插入位置的内容"
    }
  ]
}
\`\`\`

**注意**：批量插入时，工具会自动按位置从后往前排序执行，确保位置偏移不会影响后续插入。

**示例3**：完整工作流程 - 先定位再插入 ⭐⭐⭐ **必须遵循**
\`\`\`json
// 步骤1：先获取文档大纲结构
{
  "tool": "outline-tree",
  "params": {
    "includeText": true  // 包含文本内容，可以看到具体行号
  }
}

// 步骤2：分析大纲结构，确定插入位置
// 例如：大纲显示"第一章"在文档开头，包含10行文本
// 如果要插入到"第一章"之后，需要计算：
// - 找到"第一章"标题的行号（例如第3行）
// - 计算"第一章"内容结束的位置（例如第13行）
// - 在第13行之后插入新内容（第14行，列1）

// 步骤3：执行插入
{
  "operations": [{
    "type": "insert",
    "range": {
      "start": { "line": 14, "column": 1 },  // 基于大纲分析得到的正确位置
      "end": { "line": 14, "column": 1 }
    },
    "content": "第二章\n\n这是第二章的内容..."
  }]
}
\`\`\`

**如何从大纲树计算行号**：
1. 大纲树的每个节点都有 \`text\` 字段，包含该节点下的所有文本内容（包括标题行）
2. 通过分析 \`text\` 字段，可以确定每个章节的起始行号和结束行号
3. 文档的总行数 = 所有文本内容的行数总和
4. 计算目标位置：找到要插入的章节，计算该章节的结束位置，在结束位置后插入
5. **关键**：不要猜测行号，必须基于实际的大纲树结构计算

### replace（替换）
替换指定范围内的文本。range表示要替换的范围，content是新内容。

### delete（删除）
删除指定范围内的文本。range表示要删除的范围。

## 输出格式
\`\`\`json
{
  "appliedEdits": 3,  // 成功应用的编辑数量
  "failedEdits": 0,   // 失败的编辑数量
  "operations": [...] // 实际执行的编辑操作列表
}
\`\`\`

## 增量diff编辑最佳实践 ⭐⭐⭐

### 核心原则（类似Cursor/Claude）
1. **只生成变化部分**：永远不要生成整篇文档，只生成需要修改的部分（diff）
2. **使用稳定锚点**：在编辑操作中提供 \`anchor\` 字段，包含 \`before\` 关键字，用于fallback定位
3. **分块编辑**：将大范围编辑拆分为多个小范围编辑，每次只编辑一个逻辑块（如一个函数、一个段落）
4. **智能定位**：工具会自动尝试：行号定位 → 锚点定位 → fuzzy匹配，确保编辑成功

### 稳定锚点（Stable Anchor）的使用 ⭐
当编辑操作可能因为文档被修改而失效时，提供 \`anchor\` 字段可以大大提高成功率：

\`\`\`json
{
  "operations": [{
    "type": "replace",
    "range": {
      "start": { "line": 10, "column": 1 },
      "end": { "line": 10, "column": 20 }
    },
    "content": "新内容",
    "anchor": {
      "before": "旧内容的关键字",  // 用于定位（必需）
      "after": "新内容的关键字",   // 用于验证（可选）
      "context": "周围的上下文"    // 额外的上下文（可选）
    }
  }]
}
\`\`\`

**锚点的工作原理**：
1. **优先使用行号**：如果行号有效且内容匹配，直接使用行号定位
2. **fallback到锚点**：如果行号失效（文档被修改），使用 \`before\` 锚点查找位置
3. **fuzzy匹配**：如果精确锚点匹配失败，使用fuzzy匹配查找包含锚点文本的行

**何时使用锚点**：
- 编辑可能跨越多个工具调用（文档可能在两次调用之间被修改）
- 编辑大范围内容（多行、多段落）
- 需要确保编辑稳定性的场景

## 最佳实践建议 ⭐

### 对于AI（推荐方式）
1. **⚠️ 插入前必须先定位**：在插入内容之前，**必须**先使用 \`outline-tree\` 或 \`grep\` 工具获取文档结构，分析文档内容，确定正确的插入位置。**绝对不能**总是从行1列1插入！
2. **优先使用基于位置的insert**：如果已知插入位置（通过大纲树分析得到），使用insert操作最高效，**无需查找文本，节省token，避免字符匹配错误**
3. **使用稳定锚点**：对于重要编辑，提供 \`anchor.before\` 字段，提高编辑成功率
4. **使用批量插入**：如果需要插入多个位置，在一次调用中包含多个insert操作，工具会自动从后往前执行，避免位置偏移
5. **使用全局替换**：需要替换文本时，设置 \`"all": true\` 可以一次性替换所有匹配项
6. **批量操作**：在一次调用中的 \`operations\` 数组中包含多个操作，可以高效执行多个编辑
7. **组合使用**：可以混合使用insert、replace、delete和findReplace操作
8. **分块编辑**：对于大范围编辑，拆分为多个小范围编辑，每次只编辑一个逻辑块

### 插入操作的标准流程 ⭐⭐⭐
**必须遵循以下流程，否则插入位置会错误**：

1. **获取文档结构**：先调用 \`outline-tree\` 工具，设置 \`includeText: true\`
   \`\`\`json
   {"tool": "outline-tree", "params": {"includeText": true}}
   \`\`\`

2. **分析大纲树**：仔细分析返回的大纲树结构
   - 查看每个节点的 \`title\` 和 \`title_level\`
   - 查看每个节点的 \`text\` 内容（包含该章节的所有文本）
   - 理解文档的层次结构和内容分布

3. **计算插入位置**：
   - 确定要插入的目标位置（例如：在"第一章"之后、在"总结"之前等）
   - 根据大纲树的 \`text\` 字段，计算目标位置的行号
   - **行号计算**：分析文档全文，找到目标章节的位置，计算其结束行号

4. **执行插入操作**：使用计算得到的准确行号和列号进行插入
   \`\`\`json
   {
     "operations": [{
       "type": "insert",
       "range": {"start": {"line": 15, "column": 1}, "end": {"line": 15, "column": 1}},
       "content": "插入的内容"
     }]
   }
   \`\`\`

### 示例1：批量插入多个位置（推荐，高效）⭐
\`\`\`json
{
  "operations": [
    { "type": "insert", "range": { "start": { "line": 5, "column": 1 }, "end": { "line": 5, "column": 1 } }, "content": "## 第一章\n" },
    { "type": "insert", "range": { "start": { "line": 10, "column": 1 }, "end": { "line": 10, "column": 1 } }, "content": "## 第二章\n" },
    { "type": "insert", "range": { "start": { "line": 15, "column": 1 }, "end": { "line": 15, "column": 1 } }, "content": "## 第三章\n" }
  ]
}
\`\`\`

### 示例2：一次性批量替换多个术语
\`\`\`json
{
  "operations": [
    { "type": "findReplace", "oldText": "前端", "newText": "前台", "all": true },
    { "type": "findReplace", "oldText": "后端", "newText": "后台", "all": true },
    { "type": "findReplace", "oldText": "数据库", "newText": "数据存储", "all": true }
  ]
}
\`\`\`

### 示例3：混合操作（插入+替换）
\`\`\`json
{
  "operations": [
    { "type": "insert", "range": { "start": { "line": 1, "column": 1 }, "end": { "line": 1, "column": 1 } }, "content": "# 标题\n" },
    { "type": "findReplace", "oldText": "旧文本", "newText": "新文本", "all": true }
  ]
}
\`\`\`

## 注意事项
- **⚠️ 插入前必须先定位**：插入内容前，**必须**先使用 \`outline-tree\` 工具获取文档大纲，分析结构，确定正确位置。**绝对不要**总是从行1列1插入，这是严重错误！
- **定位方法**：使用 \`outline-tree\` 工具获取大纲结构（\`includeText: true\`），分析文档内容，计算准确的行号位置
- **优先使用基于位置的insert**：如果已知插入位置（通过大纲分析得到），使用insert操作最高效，无需查找文本，节省token，避免字符匹配错误
- **批量插入自动排序**：批量插入时，工具会自动按位置从后往前排序执行，确保位置偏移不会影响后续插入
- **全局替换**：使用 \`"all": true\` 可以替换文档中所有匹配的文本
- **批量操作**：一次调用可以在 \`operations\` 数组中包含多个操作（insert、replace、delete、findReplace），工具会从后往前执行避免位置偏移
- **行号和列号都是1-based**（从1开始），**行号必须大于1**，不要总是使用行1
- **编辑操作会从后往前应用**，避免位置偏移（insert、replace、delete都会自动排序）
- 支持Markdown和LaTeX格式
- 编辑会直接更新文档内容
- 建议在编辑前保存文档
- 如果某个编辑操作失败（例如找不到匹配文本、位置超出范围），其他操作仍会继续执行
- 查找替换如果找不到匹配文本，该操作会失败但不影响其他操作
- \`tabId\` 参数可选，默认使用当前活动的文档标签页
`
  },
  callback: editToolCallback,
  displayComponent: EditDisplay,
  tags: ['edit', 'document', 'text'],
  enabled: true,
  editable: false,
  locales: editToolLocales,
  inputSchema: {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        items: {
          type: 'object',
          oneOf: [
            {
              // 查找替换操作
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['findReplace']
                },
                oldText: {
                  type: 'string',
                  description: '要查找的文本'
                },
                newText: {
                  type: 'string',
                  description: '替换为的文本'
                },
                all: {
                  type: 'boolean',
                  description: '是否替换所有匹配项（默认false，只替换第一个）'
                },
                caseSensitive: {
                  type: 'boolean',
                  description: '是否区分大小写（默认false）'
                }
              },
              required: ['type', 'oldText', 'newText']
            },
            {
              // 基于位置的操作
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['insert', 'replace', 'delete']
                },
                range: {
                  type: 'object',
                  properties: {
                    start: {
                      type: 'object',
                      properties: {
                        line: { type: 'number' },
                        column: { type: 'number' }
                      },
                      required: ['line', 'column']
                    },
                    end: {
                      type: 'object',
                      properties: {
                        line: { type: 'number' },
                        column: { type: 'number' }
                      },
                      required: ['line', 'column']
                    }
                  },
                  required: ['start', 'end']
                },
                content: {
                  type: 'string'
                }
              },
              required: ['type', 'range']
            }
          ]
        },
        description: '编辑操作列表，支持查找替换（findReplace）和基于位置的编辑（insert/replace/delete）'
      },
      operation: {
        type: 'object',
        description: '单个编辑操作（与operations二选一），支持查找替换和基于位置的编辑'
      },
      tabId: {
        type: 'string',
        description: '文档标签页ID（可选，默认使用当前活动标签页）'
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
