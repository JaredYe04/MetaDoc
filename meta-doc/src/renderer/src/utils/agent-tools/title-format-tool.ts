/**
 * 标题格式化Tool
 * 用于格式化文档标题：调整标题层级、添加/移除标题编号等
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
import type { DocumentOutlineNode } from '@/types'
import { adjustTitleLevel, removeAllTitlePrefixes } from '../document/outline'
import { adjustTitleIndex } from '../md-utils'
import { convertNumberToChinese } from '../regex-utils'
import { getOutlineAdapter } from '../outline-adapters'
import { getActiveDocumentInfoViaBroadcast } from './document-broadcast-helper'
import { getWindowType } from '../event-bus'
import TitleFormatDisplay from './components/TitleFormatDisplay.vue'

const logger = createRendererLogger('TitleFormatTool')
const workspace = useWorkspace()

/**
 * 标题格式化回调函数
 */
const titleFormatCallback: ToolCallback = async (
  params: Record<string, unknown>,
  signal: AbortSignal,
  onUpdate: (data: ToolCallbackData, progress?: ToolProgress) => void
): Promise<ToolCallbackResult> => {
  try {
    // 检查取消信号
    if (signal.aborted) {
      return {
        status: 'cancelled',
        error: '操作已取消'
      }
    }

    // 获取文档（支持跨窗口）
    const windowType = getWindowType()
    let doc: any = null
    let targetTabId: string | null = null

    if (windowType === 'setting') {
      // 在设置窗口中，通过广播获取文档信息
      const docInfo = await getActiveDocumentInfoViaBroadcast()
      if (!docInfo) {
        return {
          status: 'failed',
          error: '未找到活动文档，请先打开一个文档'
        }
      }
      doc = {
        markdown: docInfo.markdown,
        tex: docInfo.tex,
        format: docInfo.format,
        outline: docInfo.outline,
        path: docInfo.path
      }
      targetTabId = docInfo.tabId
    } else {
      // 在主窗口中，直接使用workspace
      targetTabId = workspace.activeTabId.value
      if (!targetTabId) {
        return {
          status: 'failed',
          error: '未找到活动文档，请先打开一个文档'
        }
      }
      doc = workspace.ensureDocument(targetTabId)
      if (!doc) {
        return {
          status: 'failed',
          error: '无法获取文档数据'
        }
      }
    }

    // 报告进度
    onUpdate(
      {
        content: { stage: 'loading', message: '正在加载文档大纲...' },
        format: 'json'
      },
      {
        percentage: 10,
        message: '正在加载文档大纲...'
      }
    )

    // 获取大纲树
    let outlineTree: DocumentOutlineNode = JSON.parse(
      JSON.stringify(doc.outline || { path: 'dummy', children: [] })
    )

    if (!outlineTree || outlineTree.path !== 'dummy') {
      return {
        status: 'failed',
        error: '文档大纲格式不正确'
      }
    }

    // 解析参数（支持缺省和完整参数）
    const operation = (params.operation as string) || 'format' // 默认操作：format
    const isRemovePrefixesOnly = operation === 'removePrefixes'

    // 如果是单独移除前缀操作，不需要其他参数
    const adjustMarkdown = isRemovePrefixesOnly
      ? false
      : params.adjustMarkdown !== undefined
        ? Boolean(params.adjustMarkdown)
        : true
    const firstMarkdownTitleLevel =
      params.firstMarkdownTitleLevel !== undefined ? Number(params.firstMarkdownTitleLevel) : 1
    const adjustTitle = isRemovePrefixesOnly
      ? false
      : params.adjustTitle !== undefined
        ? Boolean(params.adjustTitle)
        : true
    const cover = params.cover !== undefined ? Boolean(params.cover) : true
    const level1TitleChinese =
      params.level1TitleChinese !== undefined ? Boolean(params.level1TitleChinese) : true
    const removePrefixes =
      params.removePrefixes !== undefined ? Boolean(params.removePrefixes) : isRemovePrefixesOnly

    // 验证参数（仅在非单独移除前缀操作时验证）
    if (!isRemovePrefixesOnly && (firstMarkdownTitleLevel < 1 || firstMarkdownTitleLevel > 6)) {
      return {
        status: 'failed',
        error: 'firstMarkdownTitleLevel 必须在 1-6 之间'
      }
    }

    // 报告进度
    onUpdate(
      {
        content: {
          stage: 'processing',
          message: '正在格式化标题...',
          operation,
          adjustMarkdown,
          adjustTitle,
          removePrefixes
        },
        format: 'json'
      },
      {
        percentage: 30,
        message: '正在格式化标题...'
      }
    )

    // 执行格式化操作
    let modifiedTree = outlineTree
    const operations: string[] = []

    // 如果只是移除前缀操作，直接执行并返回
    if (isRemovePrefixesOnly) {
      modifiedTree = removeAllTitlePrefixes(modifiedTree)
      operations.push('移除所有标题前缀')
      logger.info('已移除所有标题前缀')
    } else {
      // 1. 移除所有标题前缀（如果指定）
      if (removePrefixes) {
        modifiedTree = removeAllTitlePrefixes(modifiedTree)
        operations.push('移除所有标题前缀')
        logger.info('已移除所有标题前缀')
      }

      // 2. 调整 Markdown 标题层级（如果指定）
      if (adjustMarkdown) {
        modifiedTree = adjustTitleLevel(modifiedTree, firstMarkdownTitleLevel)
        operations.push(`调整标题层级为 ${firstMarkdownTitleLevel}`)
        logger.info(`已调整标题层级为 ${firstMarkdownTitleLevel}`)
      }

      // 3. 调整标题编号（如果指定）
      if (adjustTitle) {
        modifiedTree = adjustTitleIndex(modifiedTree, cover, level1TitleChinese)
        operations.push(cover ? '添加标题编号（覆盖原有编号）' : '添加标题编号（保留原有编号）')
        if (level1TitleChinese) {
          operations[operations.length - 1] += '（第一级使用中文数字）'
        }
        logger.info('已调整标题编号')
      }
    }

    // 报告进度
    onUpdate(
      {
        content: {
          stage: 'saving',
          message: '正在保存文档...',
          operations
        },
        format: 'json'
      },
      {
        percentage: 70,
        message: '正在保存文档...'
      }
    )

    // 保存更新后的大纲
    if (windowType !== 'setting') {
      // 只在主窗口中更新（设置窗口通过广播获取的文档是只读的）
      workspace.lockUI?.()
      try {
        workspace.updateDocumentOutline(targetTabId!, modifiedTree)
        const currentView = doc.lastView ?? 'editor'
        if (currentView === 'outline') {
          workspace.updateDocumentLastView(targetTabId!, 'outline')
        }

        // 使用适配器同步正文文本，并抑制自动大纲同步以避免死循环
        await workspace.withAutoOutlineSyncSuppressed(async () => {
          const format = doc.format ?? 'md'
          const adapter = getOutlineAdapter(format as any)
          if (format === 'tex') {
            const nextTex = await adapter.toText(modifiedTree, doc.tex ?? '')
            workspace.updateDocumentTex(targetTabId!, nextTex)
          } else {
            const nextMd = await adapter.toText(modifiedTree, doc.markdown ?? '')
            workspace.updateDocumentMarkdown(targetTabId!, nextMd)
          }
        })
      } finally {
        workspace.unlockUI?.()
      }
    } else {
      // 在设置窗口中，无法直接更新文档，返回错误
      return {
        status: 'failed',
        error: '在设置窗口中无法修改文档，请在主窗口中打开文档后使用此工具'
      }
    }

    // 报告完成
    onUpdate(
      {
        content: {
          stage: 'completed',
          message: '标题格式化完成',
          operations,
          summary: `已执行 ${operations.length} 项操作：${operations.join('、')}`
        },
        format: 'json'
      },
      {
        percentage: 100,
        message: '完成'
      }
    )

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          message: '标题格式化完成',
          operations,
          summary: `已执行 ${operations.length} 项操作：${operations.join('、')}`
        },
        format: 'json'
      },
      result: {
        operations,
        outlineModified: true
      }
    }
  } catch (error) {
    logger.error('标题格式化失败:', error)
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

const TITLE_FORMAT_TOOL_NAME = 'Title Formatting'
const TITLE_FORMAT_TOOL_DESCRIPTION =
  'Format document titles: adjust title levels, add/remove title numbering, remove title prefixes, etc.'
const TITLE_FORMAT_INSTRUCTION = `# Title Formatting Tool

## Description
Format document titles with the following operations:
1. **Adjust title levels**: Adjust Markdown title levels (# count)
2. **Add title numbering**: Add numbering to titles (e.g., 1.1, 1.2.3, etc.)
3. **Remove title prefixes**: Remove all numbering and dots at the beginning of titles (for Markdown to LaTeX conversion)

## Usage Scenarios
- Adjust document title levels to meet specific format requirements
- Add numbering to document titles for easy reference and navigation
- Remove title prefixes to prepare for LaTeX auto-numbering
- Batch format document titles

## Input Parameters

### Full Parameter Format
\`\`\`json
{
  "operation": "format",  // Optional, operation type: "format" (format) or "removePrefixes" (remove prefixes only)
  "adjustMarkdown": true,  // Optional, whether to adjust Markdown title levels, default true
  "firstMarkdownTitleLevel": 1,  // Optional, first-level title level (1-6), default 1
  "adjustTitle": true,  // Optional, whether to adjust title numbering, default true
  "cover": true,  // Optional, whether to overwrite existing numbering, default true
  "level1TitleChinese": true,  // Optional, whether first-level titles use Chinese numerals (一、二、三...), default true
  "removePrefixes": false  // Optional, whether to remove all title prefixes, default false
}
\`\`\`

### Default Parameter Format
\`\`\`json
{}  // Use all default values: adjust levels and numbering
\`\`\`

### Remove Prefixes Only
\`\`\`json
{
  "removePrefixes": true
}
\`\`\`
or
\`\`\`json
{
  "operation": "removePrefixes"
}
\`\`\`

### Adjust Levels Only
\`\`\`json
{
  "adjustTitle": false,
  "firstMarkdownTitleLevel": 2
}
\`\`\`

### Adjust Numbering Only
\`\`\`json
{
  "adjustMarkdown": false,
  "cover": false,
  "level1TitleChinese": false
}
\`\`\`

## Parameter Description

- **operation** (string, optional): Operation type
  - \`"format"\`: Execute full formatting (default)
  - \`"removePrefixes"\`: Remove all title prefixes only
  
- **adjustMarkdown** (boolean, optional): Whether to adjust Markdown title levels, default \`true\`
  
- **firstMarkdownTitleLevel** (number, optional): First-level title level (1-6), default \`1\`
  - \`1\` means \`# Title\`
  - \`2\` means \`## Title\`
  - And so on
  
- **adjustTitle** (boolean, optional): Whether to adjust title numbering, default \`true\`
  
- **cover** (boolean, optional): Whether to overwrite existing numbering, default \`true\`
  - \`true\`: Remove existing numbering first, then add new numbering
  - \`false\`: Keep existing numbering, only add when there's no numbering
  
- **level1TitleChinese** (boolean, optional): Whether first-level titles use Chinese numerals, default \`true\`
  - \`true\`: First-level titles use Chinese numerals (一、二、三...)
  - \`false\`: First-level titles use Arabic numerals (1, 2, 3...)
  
- **removePrefixes** (boolean, optional): Whether to remove all title prefixes, default \`false\`
  - Suitable for Markdown to LaTeX conversion scenarios, as LaTeX will auto-number

## Output Format

\`\`\`json
{
  "operations": ["Operation 1", "Operation 2", ...],
  "outlineModified": true
}
\`\`\`

## Notes

1. A document must be opened before using this tool
2. Remove prefixes operation will remove all numbering and dots at the beginning of titles (including Chinese numeral numbering)
3. Adjust levels and numbering operations will modify the document's outline structure
4. All operations will be automatically saved to the document

## Differences from Other Tools

- **outline-optimize**: Used for generating and optimizing outline content, does not involve title formatting
- **edit**: Used for editing document content, does not involve batch title formatting
- **title-format**: Specifically for formatting title levels and numbering`

export const titleFormatToolConfig: AgentToolConfig = {
  id: 'title-format',
  name: TITLE_FORMAT_TOOL_NAME,
  description: TITLE_FORMAT_TOOL_DESCRIPTION,
  origin: 'internal',
  spec: {
    name: 'title-format',
    brief:
      'Format document titles: adjust title levels, add/remove title numbering, remove title prefixes. Supports Markdown and LaTeX formats.',
    fullSpec: `# Title Formatting Tool

## Description
Formats document titles with the following operations:
1. **Adjust title levels**: Adjust Markdown title levels (# count)
2. **Add title numbering**: Add numbering to titles (e.g., 1.1, 1.2.3, etc.)
3. **Remove title prefixes**: Remove all numbering and dots at the beginning of titles (for Markdown to LaTeX conversion)

## Usage Scenarios
- Adjust document title levels to meet specific format requirements
- Add numbering to document titles for easy reference and navigation
- Remove title prefixes to prepare for LaTeX auto-numbering
- Batch format document titles

## Input Format

### Full Parameter Format
\`\`\`json
{
  "operation": "format",  // Optional, operation type: "format" or "removePrefixes"
  "adjustMarkdown": true,  // Optional, whether to adjust Markdown title levels, default true
  "firstMarkdownTitleLevel": 1,  // Optional, first-level title level (1-6), default 1
  "adjustTitle": true,  // Optional, whether to adjust title numbering, default true
  "cover": true,  // Optional, whether to overwrite existing numbering, default true
  "level1TitleChinese": true,  // Optional, whether first-level titles use Chinese numerals, default true
  "removePrefixes": false  // Optional, whether to remove all title prefixes, default false
}
\`\`\`

### Default Parameter Format
\`\`\`json
{}  // Use all default values: adjust levels and numbering
\`\`\`

### Remove Prefixes Only
\`\`\`json
{
  "removePrefixes": true
}
\`\`\`

## Output Format
\`\`\`json
{
  "operations": ["operation1", "operation2", ...],
  "outlineModified": true
}
\`\`\`

## Important Notes
1. Need to open a document first to use this tool
2. Remove prefixes operation removes all numbering and dots at the beginning of titles
3. Adjust levels and numbering operations modify document outline structure
4. Supports both Markdown and LaTeX formats`
  },
  instruction: TITLE_FORMAT_INSTRUCTION,
  callback: titleFormatCallback,
  displayComponent: TitleFormatDisplay,
  tags: ['document', 'formatting', 'title', 'outline'],
  enabled: true,
  editable: false
}
