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

const logger = createRendererLogger('EditTool')
const workspace = useWorkspace()

/**
 * 编辑操作
 */
export interface EditOperation {
  type: 'insert' | 'replace' | 'delete'
  range: {
    start: { line: number; column: number }  // 1-based
    end: { line: number; column: number }   // 1-based
  }
  content?: string  // 对于insert和replace操作
}

/**
 * 编辑结果
 */
export interface EditResult {
  appliedEdits: number
  failedEdits: number
  operations: EditOperation[]
  newContent: string
  originalContent?: string  // 原始内容（用于显示对比）
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
 * 应用编辑操作到文本
 */
function applyEditToText(text: string, edit: EditOperation): string {
  const lines = text.split(/\r?\n/)
  
  // 验证行号范围
  if (edit.range.start.line < 1 || edit.range.start.line > lines.length + 1) {
    throw new Error(`起始行号 ${edit.range.start.line} 超出范围 [1, ${lines.length + 1}]`)
  }
  if (edit.range.end.line < 1 || edit.range.end.line > lines.length + 1) {
    throw new Error(`结束行号 ${edit.range.end.line} 超出范围 [1, ${lines.length + 1}]`)
  }
  
  // 获取起始和结束位置的偏移量
  const startOffset = positionToOffset(text, edit.range.start.line, edit.range.start.column)
  const endOffset = positionToOffset(text, edit.range.end.line, edit.range.end.column)
  
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
  const operations = params.operations as EditOperation[] | undefined
  const operation = params.operation as EditOperation | undefined
  const tabId = params.tabId as string | undefined

  // 支持单个操作或多个操作
  const edits: EditOperation[] = operations || (operation ? [operation] : [])

  if (!edits || edits.length === 0) {
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.edit.error.missingOperations', '缺少必需参数: operations 或 operation')
    }
  }

  // 验证编辑操作
  for (const edit of edits) {
    if (!edit.type || !['insert', 'replace', 'delete'].includes(edit.type)) {
      return {
        status: 'failed',
        error: i18n.global.t('agent.tool.edit.error.invalidType', `无效的编辑类型: ${edit.type}`)
      }
    }
    if (!edit.range || !edit.range.start || !edit.range.end) {
      return {
        status: 'failed',
        error: i18n.global.t('agent.tool.edit.error.missingRange', '缺少编辑范围')
      }
    }
    if ((edit.type === 'insert' || edit.type === 'replace') && edit.content === undefined) {
      return {
        status: 'failed',
        error: i18n.global.t('agent.tool.edit.error.missingContent', `${edit.type}操作需要content参数`)
      }
    }
  }

  try {
    onUpdate({
      content: {
        stage: 'loading',
        editCount: edits.length
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
        error: i18n.global.t('agent.tool.edit.error.noActiveTab', '没有活动的文档标签页')
      }
    }

    const doc = workspace.ensureDocument(targetTabId)
    if (!doc) {
      return {
        status: 'failed',
        error: i18n.global.t('agent.tool.edit.error.documentNotFound', '文档不存在')
      }
    }

    // 获取当前文档内容
    const currentContent = doc.format === 'md' ? doc.markdown : doc.tex

    onUpdate({
      content: {
        stage: 'applying',
        editCount: edits.length,
        currentEdit: 0
      },
      format: 'json',
      componentName: 'EditDisplay'
    }, {
      percentage: 30,
      message: i18n.global.t('agent.tool.edit.progress.applying', '正在应用编辑...')
    })

    // 应用编辑（需要跟踪成功和失败的数量）
    let appliedCount = 0
    let failedCount = 0
    let newContent = currentContent
    
    // 从后往前排序，避免位置偏移
    const sortedEdits = [...edits].sort((a, b) => {
      const aStart = positionToOffset(currentContent, a.range.start.line, a.range.start.column)
      const bStart = positionToOffset(currentContent, b.range.start.line, b.range.start.column)
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

    if (doc.format === 'md') {
      workspace.updateDocumentMarkdown(targetTabId, newContent)
    } else {
      workspace.updateDocumentTex(targetTabId, newContent)
    }

    const result: EditResult = {
      appliedEdits: appliedCount,
      failedEdits: failedCount,
      operations: edits,
      newContent,
      originalContent: currentContent  // 保存原始内容用于显示对比
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
    description: '直接对文章进行编辑，支持多处编辑操作（插入、替换、删除）'
  },
  en_us: {
    name: 'Document Edit',
    description: 'Directly edit the document, support multiple edit operations (insert, replace, delete)'
  },
  de_DE: {
    name: 'Dokument bearbeiten',
    description: 'Dokument direkt bearbeiten, unterstützt mehrere Bearbeitungsvorgänge (Einfügen, Ersetzen, Löschen)'
  },
  fr_FR: {
    name: 'Édition de document',
    description: 'Modifier directement le document, prendre en charge plusieurs opérations d\'édition (insérer, remplacer, supprimer)'
  },
  ja_JP: {
    name: 'ドキュメント編集',
    description: 'ドキュメントを直接編集し、複数の編集操作（挿入、置換、削除）をサポート'
  },
  ko_KR: {
    name: '문서 편집',
    description: '문서를 직접 편집하고 여러 편집 작업(삽입, 교체, 삭제) 지원'
  }
}

export const editToolConfig: AgentToolConfig = {
  id: 'edit',
  name: editToolLocales,
  description: editToolLocales,
  origin: 'internal',
  instruction: `
# 文档编辑工具

## 功能描述
直接对当前活动文档进行编辑，支持多处编辑操作。编辑操作包括插入、替换和删除。

## 使用场景
- 批量修改文档内容
- 在多个位置插入文本
- 替换文档中的特定内容
- 删除文档中的特定内容
- AI辅助的文档编辑

## 输入格式
\`\`\`json
{
  "operations": [
    {
      "type": "insert|replace|delete",
      "range": {
        "start": { "line": 10, "column": 5 },
        "end": { "line": 10, "column": 5 }
      },
      "content": "string"  // insert和replace操作需要
    }
  ],
  "tabId": "string"  // 可选，文档标签页ID，默认使用当前活动标签页
}
\`\`\`

或者使用单个操作：
\`\`\`json
{
  "operation": {
    "type": "replace",
    "range": {
      "start": { "line": 10, "column": 1 },
      "end": { "line": 10, "column": 20 }
    },
    "content": "新内容"
  }
}
\`\`\`

## 编辑类型说明

### insert
在指定位置插入文本。range的start和end应该相同，表示插入位置。

### replace
替换指定范围内的文本。range表示要替换的范围，content是新内容。

### delete
删除指定范围内的文本。range表示要删除的范围。

## 输出格式
\`\`\`json
{
  "appliedEdits": 3,
  "failedEdits": 0,
  "operations": [...],
  "newContent": "string"
}
\`\`\`

## 注意事项
- 行号和列号都是1-based（从1开始）
- 编辑操作会从后往前应用，避免位置偏移
- 支持Markdown和LaTeX格式
- 编辑会直接更新文档内容
- 建议在编辑前保存文档
- 如果某个编辑操作失败，其他操作仍会继续执行
`,
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
                  }
                },
                end: {
                  type: 'object',
                  properties: {
                    line: { type: 'number' },
                    column: { type: 'number' }
                  }
                }
              }
            },
            content: {
              type: 'string'
            }
          },
          required: ['type', 'range']
        },
        description: '编辑操作列表'
      },
      operation: {
        type: 'object',
        description: '单个编辑操作（与operations二选一）'
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
      },
      newContent: {
        type: 'string',
        description: '编辑后的文档内容'
      }
    }
  }
}

