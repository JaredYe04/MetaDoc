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

const outlineTreeToolLocales: ToolLocales = {
  zh_cn: {
    name: '大纲树',
    description: '获取当前文档的大纲树结构，可选择是否包含文本内容'
  },
  en_us: {
    name: 'Outline Tree',
    description:
      'Get the outline tree structure of the current document, with option to include text content'
  },
  de_DE: {
    name: 'Gliederungsbaum',
    description:
      'Abrufen der Gliederungsstruktur des aktuellen Dokuments mit Option zum Einbeziehen von Textinhalten'
  },
  fr_FR: {
    name: 'Arborescence',
    description:
      "Obtenir la structure de l'arborescence du document actuel, avec option d'inclure le contenu texte"
  },
  ja_JP: {
    name: 'アウトライン tree',
    description:
      '現在のドキュメントのアウトライン構造を取得し、テキストコンテンツを含めるオプション'
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
  spec: {
    name: 'outline-tree',
    brief:
      'Get the outline tree structure of the current document. Returns hierarchical structure with titles, paths, and optional text content.',
    fullSpec: `# Outline Tree Tool

## Description
Gets the outline tree structure of the current active document. The outline tree is a hierarchical representation of the document, containing titles, paths, and optional text content.

## Usage Recommendations

**Before calling this tool, check reference materials first:**
- If there is a reference with ID "当前文档内容" in reference materials, it means the current document content has been automatically injected, you can directly view that reference to understand the document content
- If there is no "当前文档内容" in reference materials, or you need structured outline tree data, you can call this tool

## When to Use This Tool

**Suitable scenarios:**
1. **Need structured outline tree data**: When other tools (like outline-optimize) need outline tree structure data
2. **Need precise node path information**: When you need to get the path field (like "1.1", "1.2.1") of specific sections for other tool calls
3. **Need outline tree format data**: When you need to process document structure in outline tree format
4. **No current document content in references**: If reference materials don't have "当前文档内容" reference, you can use this tool to get document information

**Optional scenarios:**
- View document content: If reference materials have "当前文档内容", you can view directly; if not, you can call this tool
- Understand document structure: If reference materials have "当前文档内容", you can analyze directly; if not, you can call this tool
- Locate insertion position: Recommended to use \`grep\` tool to search keywords for positioning; if you need outline tree format data, you can also use this tool

## Usage Scenarios
- Get structured outline tree data for other tools to process
- Need precise node path information (path field)
- Need outline tree format data for specific operations
- Get document information when reference materials don't have current document content

## Methods for Locating Insertion Position

When using \`edit\` tool to insert content, you can use the following methods:
1. **Check reference materials**: If reference materials have "当前文档内容", you can directly view to understand document structure
2. **Use \`grep\` tool**: Search keywords, determine insertion point based on match position and context (recommended, lightweight and efficient)
3. **Use this tool**: If you need outline tree format data, you can call this tool, set \`includeText: true\` to include text content

**Note**: This tool is mainly for getting structured outline tree data. If reference materials already have "当前文档内容", you can usually use reference materials directly; if not, or you need outline tree format data, you can use this tool.

## Input Format
\`\`\`json
{
  "includeText": true,  // Optional, whether to include text content, default true
  "tabId": "string"     // Optional, specify document tab ID, default uses current active tab
}
\`\`\`

## Output Format
\`\`\`json
{
  "outlineTree": {
    "title": "string",
    "title_level": 1,
    "path": "1",
    "text": "string",  // Empty string if includeText is false
    "children": []
  },
  "includeText": true,
  "format": "md|tex",
  "tabId": "string",
  "path": "string"
}
\`\`\`

## Important Notes
- **Locate before insertion**: Before using \`edit\` tool to insert content, you can use this tool to get document outline, analyze structure, determine correct position (can also use grep or other methods)
- **includeText parameter**: When you need to view specific content, it's recommended to set \`includeText: true\` to view specific content, making it easier to calculate accurate line number positions
- Outline tree supports Markdown and LaTeX formats
- LaTeX documents are first converted to Markdown before extracting outline
- If includeText is false, the returned outline tree only contains structure information, not text content
- The path field of outline tree represents the node's position in the tree (like "1", "1.1", "1.2.1", etc.)
- The text field of outline tree contains all text content under that node, can be used to analyze document content distribution and calculate line numbers`
  },
  instruction: `
# 大纲树工具

## 功能描述
获取当前活动文档的大纲树结构。大纲树是文档的层次化结构表示，包含标题、路径和可选的文本内容。

## 使用建议

**在调用此工具之前，建议先检查引用素材**：
- 如果引用素材中存在ID为"当前文档内容"的引用，说明当前文档内容已经自动注入，你可以直接查看该引用了解文档内容
- 如果引用素材中没有"当前文档内容"，或者你需要获取结构化的大纲树数据，则可以调用此工具

## 何时使用此工具

**适合使用此工具的场景**：
1. **需要获取结构化的大纲树数据**：当其他工具（如outline-optimize）需要大纲树结构数据时
2. **需要精确的节点路径信息**：当需要获取特定章节的path字段（如"1.1", "1.2.1"）用于其他工具调用时
3. **需要大纲树格式的数据**：当需要以大纲树格式处理文档结构时
4. **引用素材中没有当前文档内容时**：如果引用素材中没有"当前文档内容"引用，可以使用此工具获取文档信息

**可选使用此工具的场景**：
- 查看文档内容：如果引用素材中有"当前文档内容"，可以直接查看；如果没有，可以调用此工具
- 了解文档结构：如果引用素材中有"当前文档内容"，可以直接分析；如果没有，可以调用此工具
- 定位插入位置：推荐使用 \`grep\` 工具搜索关键词定位；如果需要大纲树格式的数据，也可以使用此工具

## 使用场景

- 获取结构化的大纲树数据用于其他工具处理
- 需要精确的节点路径信息（path字段）
- 需要大纲树格式的数据进行特定操作
- 当引用素材中没有当前文档内容时，获取文档信息

## 定位插入位置的方法

在使用 \`edit\` 工具插入内容时，可以使用以下方法：
1. **检查引用素材**：如果引用素材中有"当前文档内容"，可以直接查看了解文档结构
2. **使用 \`grep\` 工具**：搜索关键词，根据匹配位置和上下文确定插入点（推荐，轻量级、高效）
3. **使用此工具**：如果需要大纲树格式的数据，可以调用此工具，设置 \`includeText: true\` 以包含文本内容

**注意**：此工具主要用于获取结构化的大纲树数据。如果引用素材中已有"当前文档内容"，通常可以直接使用引用素材；如果没有，或需要大纲树格式的数据，则可以使用此工具。

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
