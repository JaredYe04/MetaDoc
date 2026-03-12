/**
 * 大纲树Tool
 * 获取当前文档的大纲树结构，支持选择是否包含文本内容
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress
} from '../../types/agent-tool'
import { useWorkspace } from '../../stores/workspace'
import { extractOutlineTreeFromMarkdown } from '../document/outline'
import { convertLatexToMarkdown } from '../latex-utils'
import type { DocumentOutlineNode } from '@/types'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import { removeTextFromOutline } from '../document/outline'
import OutlineTreeDisplay from './components/OutlineTreeDisplay.vue'
import { getActiveDocumentInfoViaBroadcast } from './document-broadcast-helper'
import { getWindowType } from '../event-bus'
import messageBridge from '../../bridge/message-bridge'

const logger = createRendererLogger('OutlineTreeTool')
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
 * 大纲树Tool回调函数
 */
const outlineTreeToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const includeText = params.includeText !== false // 默认true，包含文本内容
  const tabId = params.tabId as string | undefined // 可选，指定tabId，默认使用当前活动tab
  const filePathParam = params.filePath as string | undefined // 可选，工作区相对或绝对路径，优先于 tabId

  try {
    onUpdate(
      {
        content: {
          stage: 'retrieving',
          includeText
        },
        format: 'json'
      },
      {
        percentage: 10,
        message: i18n.global.t('agent.tool.outlineTree.progress.loading', '正在加载文档...')
      }
    )

    let doc: any = null
    let targetTabId: string | null = null

    // 优先：按工作区文件路径读取（支持未打开的任意工作区文件）
    if (filePathParam && messageBridge.getIpc()?.invoke) {
      const absPath = resolveFilePath(filePathParam)
      let content: string | null = null
      try {
        content = (await messageBridge.invoke('read-file-content', absPath)) as string | null
      } catch (e) {
        logger.warn('read-file-content failed', e)
      }
      if (content == null) {
        return {
          status: 'failed',
          error: i18n.global.t(
            'agent.tool.outlineTree.error.fileNotFound',
            `文件不存在或无法读取: ${filePathParam}`
          )
        }
      }
      const isTex = /\.tex$/i.test(absPath)
      const isMd = /\.(md|markdown)$/i.test(absPath)
      if (!isTex && !isMd) {
        return {
          status: 'failed',
          error: i18n.global.t(
            'agent.tool.outlineTree.error.unsupportedFormatFile',
            '大纲仅支持 Markdown (.md) 和 LaTeX (.tex) 文件，当前文件格式不支持。'
          )
        }
      }
      const format = isTex ? 'tex' : 'md'
      doc = {
        markdown: format === 'md' ? content : '',
        tex: format === 'tex' ? content : '',
        format,
        path: absPath
      }
      targetTabId = null
    } else if (filePathParam) {
      return {
        status: 'failed',
        error: i18n.global.t(
          'agent.tool.outlineTree.error.needElectron',
          'filePath 方式需要 Electron 环境（工作区文件读取）'
        )
      }
    }

    if (!doc) {
      // 获取文档（支持跨窗口，按 tabId 或当前活动文档）
      const windowType = getWindowType()
      if (windowType === 'setting') {
        // 在设置窗口中，通过广播获取文档信息
        const docInfo = await getActiveDocumentInfoViaBroadcast()
        if (!docInfo) {
          return {
            status: 'failed',
            error: i18n.global.t('agent.tool.outlineTree.error.noActiveTab', '没有活动的文档标签页')
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
        // 在主窗口中：仅当显式传入 tabId 或当前活动标签页为文档标签页时使用，避免对系统/工具 Tab 调用文档上下文
        if (tabId) {
          targetTabId = tabId
        } else if (workspace.activeDocument.value) {
          targetTabId = workspace.activeTabId.value
        }
        if (!targetTabId) {
          return {
            status: 'failed',
            error: i18n.global.t(
              'agent.tool.outlineTree.error.noDocumentContext',
              '当前活动标签页不是文档（例如正在查看 Agent 等系统页）。请通过 tabId 参数指定要获取大纲的文档；系统上下文中会提供当前打开的文档列表及 id。'
            )
          }
        }
        try {
          doc = workspace.ensureDocument(targetTabId)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          return {
            status: 'failed',
            error: msg.includes('不应该有文档上下文')
              ? i18n.global.t(
                  'agent.tool.outlineTree.error.noDocumentContext',
                  '指定的 tabId 对应的是系统/工具标签页，无文档上下文。请使用系统上下文中列出的文档 tabId。'
                )
              : i18n.global.t('agent.tool.outlineTree.error.documentNotFound', '文档不存在')
          }
        }
        if (!doc) {
          return {
            status: 'failed',
            error: i18n.global.t('agent.tool.outlineTree.error.documentNotFound', '文档不存在')
          }
        }
      }
    }

    onUpdate(
      {
        content: {
          stage: 'retrieving',
          format: doc.format,
          includeText
        },
        format: 'json'
      },
      {
        percentage: 50,
        message: i18n.global.t('agent.tool.outlineTree.progress.extracting', '正在提取大纲树...')
      }
    )

    // 根据文档格式提取大纲树
    let outlineTree: DocumentOutlineNode

    if (doc.format === 'md') {
      // Markdown格式，直接提取
      outlineTree = extractOutlineTreeFromMarkdown(doc.markdown, !includeText)
    } else if (doc.format === 'tex') {
      // LaTeX格式，先转换为Markdown再提取
      const markdown = convertLatexToMarkdown(doc.tex)
      outlineTree = extractOutlineTreeFromMarkdown(markdown, !includeText)
    } else {
      return {
        status: 'failed',
        error: i18n.global.t(
          'agent.tool.outlineTree.error.unsupportedFormat',
          `不支持的文档格式: ${doc.format}`
        )
      }
    }

    // 如果不需要文本内容，移除文本
    if (!includeText) {
      outlineTree = removeTextFromOutline(outlineTree)
    }

    onUpdate(
      {
        content: {
          stage: 'completed',
          outlineTree,
          includeText,
          format: doc.format,
          tabId: targetTabId,
          path: doc.path
        },
        format: 'json'
      },
      {
        percentage: 100,
        message: i18n.global.t('agent.tool.outlineTree.progress.completed', '大纲树提取完成')
      }
    )

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          outlineTree,
          includeText,
          format: doc.format,
          tabId: targetTabId,
          path: doc.path
        },
        format: 'json'
      },
      result: {
        outlineTree,
        includeText,
        format: doc.format,
        tabId: targetTabId,
        path: doc.path
      }
    }
  } catch (error) {
    logger.error('提取大纲树失败:', error)
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

const OUTLINE_TREE_TOOL_NAME = 'Outline Tree'
const OUTLINE_TREE_TOOL_DESCRIPTION =
  'Get outline tree of a document (only .md and .tex; for other formats read the document content instead)'

// English instruction for agent (single source for spec.fullSpec and instruction)
const OUTLINE_TREE_INSTRUCTION_EN = `# Outline Tree Tool
## Description
Gets the outline tree structure of a document. **Only Markdown (.md) and LaTeX (.tex) files support outline; other file formats (e.g. .txt, .json, .html) are not supported.** You can pass \`filePath\` (workspace-relative or absolute) to get the outline of any workspace .md/.tex file without opening it, or use \`tabId\`/current tab for the active document. The outline tree is a hierarchical representation with titles, paths, and optional text content.

## Usage Recommendations
**Before calling this tool, check reference materials first:**
- If there is a reference with ID "current document content" in reference materials, the current document content has been automatically injected; you can view that reference to understand the document
- If there is no "current document content" in reference materials, or you need structured outline tree data, you can call this tool

## When to Use This Tool
**Suitable scenarios:**
1. **Need structured outline tree data**: When other tools (like outline-optimize) need outline tree structure data
2. **Need precise node path information**: When you need to get the path field (like "1.1", "1.2.1") of specific sections for other tool calls
3. **Need outline tree format data**: When you need to process document structure in outline tree format
4. **No current document content in references**: If reference materials don't have "current document content" reference, you can use this tool to get document information

**Optional scenarios:**
- View document content: If reference materials have "current document content", view directly; if not, call this tool
- Understand document structure: If reference materials have "current document content", analyze directly; if not, call this tool
- Locate insertion position: Recommended to use \`grep\` tool to search keywords for positioning; if you need outline tree format data, you can also use this tool

## Input Format
\`\`\`json
{
  "filePath": "string",
  "includeText": true,
  "tabId": "string"
}
\`\`\`

## Output Format
\`\`\`json
{
  "outlineTree": { "title": "string", "title_level": 1, "path": "1", "text": "string", "children": [] },
  "includeText": true,
  "format": "md|tex",
  "tabId": "string",
  "path": "string"
}
\`\`\`

## Important Notes
- **Only .md and .tex**: Outline is supported only for Markdown (.md) and LaTeX (.tex) files. For non-.md/.tex files, do not use this tool — read via \`workspace\` or reference materials instead.
- **includeText parameter**: Set \`includeText: true\` to include text content for line number calculation.
- LaTeX documents are first converted to Markdown before extracting outline.`

export const outlineTreeToolConfig: AgentToolConfig = {
  id: 'outline-tree',
  name: OUTLINE_TREE_TOOL_NAME,
  description: OUTLINE_TREE_TOOL_DESCRIPTION,
  origin: 'internal',
  hidden: true,
  spec: {
    name: 'outline-tree',
    brief:
      'Get outline tree of a document. Only .md and .tex support outline; for other formats read the document via workspace or reference materials. Supports filePath or tabId/current tab.',
    fullSpec: OUTLINE_TREE_INSTRUCTION_EN
  },
  instruction: OUTLINE_TREE_INSTRUCTION_EN,
  callback: outlineTreeToolCallback,
  displayComponent: OutlineTreeDisplay,
  tags: ['document', 'outline', 'structure'],
  enabled: true,
  editable: false,
  inputSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description:
          'Workspace-relative or absolute path (optional). When set, read file from disk and extract outline; otherwise use tabId/current document.'
      },
      includeText: {
        type: 'boolean',
        description: 'Whether to include text content in outline nodes',
        default: true
      },
      tabId: {
        type: 'string',
        description: 'Document tab ID (optional; default current active tab; ignored when filePath is set)'
      }
    }
  },
  outputSchema: {
    type: 'object',
    properties: {
      outlineTree: {
        type: 'object',
        description: '大纲树结构'
      },
      includeText: {
        type: 'boolean',
        description: '是否包含文本内容'
      },
      format: {
        type: 'string',
        enum: ['md', 'tex'],
        description: '文档格式'
      },
      tabId: {
        type: 'string',
        description: '文档标签页ID'
      },
      path: {
        type: 'string',
        description: '文档路径'
      }
    }
  }
}
