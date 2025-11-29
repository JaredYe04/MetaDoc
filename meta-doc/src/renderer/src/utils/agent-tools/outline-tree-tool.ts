/**
 * 大纲树Tool
 * 获取当前文档的大纲树结构，支持选择是否包含文本内容
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
import { extractOutlineTreeFromMarkdown } from '../document/outline'
import { convertLatexToMarkdown } from '../latex-utils'
import type { DocumentOutlineNode } from '@/types'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import { removeTextFromOutline } from '../document/outline'
import OutlineTreeDisplay from './components/OutlineTreeDisplay.vue'
import { getActiveDocumentInfoViaBroadcast } from './document-broadcast-helper'
import { getWindowType } from '../event-bus'

const logger = createRendererLogger('OutlineTreeTool')
const workspace = useWorkspace()

/**
 * 大纲树Tool回调函数
 */
const outlineTreeToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const includeText = params.includeText !== false // 默认true，包含文本内容
  const tabId = params.tabId as string | undefined // 可选，指定tabId，默认使用当前活动tab

  try {
    onUpdate({
      content: {
        stage: 'retrieving',
        includeText
      },
      format: 'json'
    }, {
      percentage: 10,
      message: i18n.global.t('agent.tool.outlineTree.progress.loading', '正在加载文档...')
    })

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
      // 在主窗口中，直接使用workspace
      targetTabId = tabId || workspace.activeTabId.value
      if (!targetTabId) {
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.outlineTree.error.noActiveTab', '没有活动的文档标签页')
        }
      }
      doc = workspace.ensureDocument(targetTabId)
      if (!doc) {
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.outlineTree.error.documentNotFound', '文档不存在')
        }
      }
    }

    onUpdate({
      content: {
        stage: 'retrieving',
        format: doc.format,
        includeText
      },
      format: 'json'
    }, {
      percentage: 50,
      message: i18n.global.t('agent.tool.outlineTree.progress.extracting', '正在提取大纲树...')
    })

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
        error: i18n.global.t('agent.tool.outlineTree.error.unsupportedFormat', `不支持的文档格式: ${doc.format}`)
      }
    }

    // 如果不需要文本内容，移除文本
    if (!includeText) {
      outlineTree = removeTextFromOutline(outlineTree)
    }

    onUpdate({
      content: {
        stage: 'completed',
        outlineTree,
        includeText,
        format: doc.format,
        tabId: targetTabId,
        path: doc.path
      },
      format: 'json'
    }, {
      percentage: 100,
      message: i18n.global.t('agent.tool.outlineTree.progress.completed', '大纲树提取完成')
    })

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

const outlineTreeToolLocales: ToolLocales = {
  zh_cn: {
    name: '大纲树',
    description: '获取当前文档的大纲树结构，可选择是否包含文本内容'
  },
  en_us: {
    name: 'Outline Tree',
    description: 'Get the outline tree structure of the current document, with option to include text content'
  },
  de_DE: {
    name: 'Gliederungsbaum',
    description: 'Abrufen der Gliederungsstruktur des aktuellen Dokuments mit Option zum Einbeziehen von Textinhalten'
  },
  fr_FR: {
    name: 'Arborescence',
    description: 'Obtenir la structure de l\'arborescence du document actuel, avec option d\'inclure le contenu texte'
  },
  ja_JP: {
    name: 'アウトライン tree',
    description: '現在のドキュメントのアウトライン構造を取得し、テキストコンテンツを含めるオプション'
  },
  ko_KR: {
    name: '개요 트리',
    description: '현재 문서의 개요 트리 구조를 가져오고 텍스트 내용 포함 옵션'
  }
}

export const outlineTreeToolConfig: AgentToolConfig = {
  id: 'outline-tree',
  name: outlineTreeToolLocales,
  description: outlineTreeToolLocales,
  origin: 'internal',
  instruction: `
# 大纲树工具

## 功能描述
获取当前活动文档的大纲树结构。大纲树是文档的层次化结构表示，包含标题、路径和可选的文本内容。

## 使用场景
- **定位插入位置**（推荐）：在插入内容到文档之前，可以使用此工具获取文档大纲结构，分析文档内容，确定正确的插入位置
- 了解文档结构
- 分析文档层次
- 获取文档大纲用于其他工具处理
- 文档结构可视化

## 定位插入位置的方法（可选但推荐）

在使用 \`edit\` 工具插入内容时，如果不确定插入位置，可以：
1. 调用此工具，设置 \`includeText: true\` 以包含文本内容
2. 分析返回的大纲树，了解文档的层次结构和内容分布
3. 根据大纲树计算准确的插入位置（行号和列号）
4. 然后使用 \`edit\` 工具的 \`insert\` 操作在确定的位置插入内容

**注意**：也可以使用 \`grep\` 工具查找关键词来确定插入位置，或使用其他方法定位。此工具是可选辅助工具。

## 输入格式
\`\`\`json
{
  "includeText": true,  // 可选，是否包含文本内容，默认true
  "tabId": "string"     // 可选，指定文档标签页ID，默认使用当前活动标签页
}
\`\`\`

## 输出格式
\`\`\`json
{
  "outlineTree": {
    "title": "string",
    "title_level": 1,
    "path": "1",
    "text": "string",  // 如果includeText为false，则为空字符串
    "children": []
  },
  "includeText": true,
  "format": "md|tex",
  "tabId": "string",
  "path": "string"
}
\`\`\`

## 注意事项
- **插入前定位**：使用 \`edit\` 工具插入内容前，可以使用此工具获取文档大纲，分析结构，确定正确位置（也可使用grep等其他方法）
- **includeText参数**：需要查看具体内容时，建议设置 \`includeText: true\` 以查看具体内容，便于计算准确的行号位置
- 大纲树支持Markdown和LaTeX格式
- LaTeX文档会先转换为Markdown再提取大纲
- 如果includeText为false，返回的大纲树仅包含结构信息，不包含文本内容
- 大纲树的path字段表示节点在树中的位置（如"1", "1.1", "1.2.1"等）
- 大纲树的text字段包含该节点下的所有文本内容，可用于分析文档内容分布和计算行号
`,
  callback: outlineTreeToolCallback,
  displayComponent: OutlineTreeDisplay,
  tags: ['document', 'outline', 'structure'],
  enabled: true,
  editable: false,
  locales: outlineTreeToolLocales,
  inputSchema: {
    type: 'object',
    properties: {
      includeText: {
        type: 'boolean',
        description: '是否包含文本内容',
        default: true
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

