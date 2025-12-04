/**
 * 标题格式化Tool
 * 用于格式化文档标题：调整标题层级、添加/移除标题编号等
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
import type { DocumentOutlineNode } from '@/types'
import { adjustTitleLevel } from '../document/outline'
import { adjustTitleIndex } from '../md-utils'
import { removeTitleIndex, convertNumberToChinese } from '../regex-utils'
import { getOutlineAdapter } from '../outline-adapters'
import { getActiveDocumentInfoViaBroadcast } from './document-broadcast-helper'
import { getWindowType } from '../event-bus'
import TitleFormatDisplay from './components/TitleFormatDisplay.vue'

const logger = createRendererLogger('TitleFormatTool')
const workspace = useWorkspace()

/**
 * 移除大纲树中所有节点的标题前缀
 */
function removeAllTitlePrefixes(outlineTree: DocumentOutlineNode): DocumentOutlineNode {
  const node = JSON.parse(JSON.stringify(outlineTree)) as DocumentOutlineNode
  
  function dfs(n: DocumentOutlineNode): void {
    if (n.title) {
      n.title = removeTitleIndex(n.title)
    }
    
    for (const child of n.children) {
      dfs(child)
    }
  }
  
  if (node.path === 'dummy') {
    for (const child of node.children) {
      dfs(child)
    }
  } else {
    dfs(node)
  }
  
  return node
}

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
    onUpdate({
      content: { stage: 'loading', message: '正在加载文档大纲...' },
      format: 'json'
    }, {
      percentage: 10,
      message: '正在加载文档大纲...'
    })

    // 获取大纲树
    let outlineTree: DocumentOutlineNode = JSON.parse(JSON.stringify(doc.outline || { path: 'dummy', children: [] }))
    
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
    const adjustMarkdown = isRemovePrefixesOnly ? false : (params.adjustMarkdown !== undefined ? Boolean(params.adjustMarkdown) : true)
    const firstMarkdownTitleLevel = params.firstMarkdownTitleLevel !== undefined 
      ? Number(params.firstMarkdownTitleLevel) 
      : 1
    const adjustTitle = isRemovePrefixesOnly ? false : (params.adjustTitle !== undefined ? Boolean(params.adjustTitle) : true)
    const cover = params.cover !== undefined ? Boolean(params.cover) : true
    const level1TitleChinese = params.level1TitleChinese !== undefined 
      ? Boolean(params.level1TitleChinese) 
      : true
    const removePrefixes = params.removePrefixes !== undefined 
      ? Boolean(params.removePrefixes) 
      : isRemovePrefixesOnly

    // 验证参数（仅在非单独移除前缀操作时验证）
    if (!isRemovePrefixesOnly && (firstMarkdownTitleLevel < 1 || firstMarkdownTitleLevel > 6)) {
      return {
        status: 'failed',
        error: 'firstMarkdownTitleLevel 必须在 1-6 之间'
      }
    }

    // 报告进度
    onUpdate({
      content: { 
        stage: 'processing', 
        message: '正在格式化标题...',
        operation,
        adjustMarkdown,
        adjustTitle,
        removePrefixes
      },
      format: 'json'
    }, {
      percentage: 30,
      message: '正在格式化标题...'
    })

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
    onUpdate({
      content: { 
        stage: 'saving', 
        message: '正在保存文档...',
        operations
      },
      format: 'json'
    }, {
      percentage: 70,
      message: '正在保存文档...'
    })

    // 保存更新后的大纲
    if (windowType !== 'setting') {
      // 只在主窗口中更新（设置窗口通过广播获取的文档是只读的）
      workspace.lockUI?.()
      try {
        workspace.updateDocumentOutline(targetTabId!, modifiedTree)
        workspace.updateDocumentLastView(targetTabId!, 'outline')
        
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
    onUpdate({
      content: { 
        stage: 'completed', 
        message: '标题格式化完成',
        operations,
        summary: `已执行 ${operations.length} 项操作：${operations.join('、')}`
      },
      format: 'json'
    }, {
      percentage: 100,
      message: '完成'
    })

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

/**
 * 标题格式化Tool配置
 */
export const titleFormatToolConfig: AgentToolConfig = {
  name: {
    'zh_cn': { name: '标题格式化' },
    'en_us': { name: 'Title Formatting' },
    'ja_jp': { name: 'タイトルフォーマット' },
    'ko_kr': { name: '제목 포맷팅' },
    'fr_fr': { name: 'Formatage de titre' },
    'de_de': { name: 'Titelformatierung' }
  },
  description: {
    'zh_cn': { description: '格式化文档标题：调整标题层级、添加/移除标题编号、移除标题前缀等' },
    'en_us': { description: 'Format document titles: adjust title levels, add/remove title numbering, remove title prefixes, etc.' },
    'ja_jp': { description: 'ドキュメントタイトルをフォーマット：タイトルレベル調整、タイトル番号の追加/削除、タイトルプレフィックスの削除など' },
    'ko_kr': { description: '문서 제목 포맷팅: 제목 레벨 조정, 제목 번호 추가/제거, 제목 접두사 제거 등' },
    'fr_fr': { description: 'Formater les titres de document : ajuster les niveaux de titre, ajouter/supprimer la numérotation des titres, supprimer les préfixes de titre, etc.' },
    'de_de': { description: 'Dokumenttitel formatieren: Titel-Ebenen anpassen, Titelnummerierung hinzufügen/entfernen, Titelpräfixe entfernen usw.' }
  },
  id: 'title-format',
  origin: 'internal',
  instruction: `# 标题格式化工具

## 功能描述
格式化文档标题，支持以下操作：
1. **调整标题层级**：调整 Markdown 标题的层级（# 的数量）
2. **添加标题编号**：为标题添加编号（如 1.1、1.2.3 等）
3. **移除标题前缀**：移除所有标题开头的编号和点号（适用于 Markdown 转 LaTeX 的场景）

## 使用场景
- 调整文档标题层级，使其符合特定格式要求
- 为文档标题添加编号，便于引用和导航
- 移除标题前缀，为 LaTeX 自动编号做准备
- 批量格式化文档标题

## 输入参数

### 完整参数格式
\`\`\`json
{
  "operation": "format",  // 可选，操作类型："format"（格式化）或 "removePrefixes"（仅移除前缀）
  "adjustMarkdown": true,  // 可选，是否调整 Markdown 标题层级，默认 true
  "firstMarkdownTitleLevel": 1,  // 可选，第一级标题的层级（1-6），默认 1
  "adjustTitle": true,  // 可选，是否调整标题编号，默认 true
  "cover": true,  // 可选，是否覆盖原有编号，默认 true
  "level1TitleChinese": true,  // 可选，第一级标题是否使用中文数字（一、二、三...），默认 true
  "removePrefixes": false  // 可选，是否移除所有标题前缀，默认 false
}
\`\`\`

### 缺省参数格式
\`\`\`json
{}  // 使用所有默认值：调整层级和编号
\`\`\`

### 仅移除前缀
\`\`\`json
{
  "removePrefixes": true
}
\`\`\`
或
\`\`\`json
{
  "operation": "removePrefixes"
}
\`\`\`

### 仅调整层级
\`\`\`json
{
  "adjustTitle": false,
  "firstMarkdownTitleLevel": 2
}
\`\`\`

### 仅调整编号
\`\`\`json
{
  "adjustMarkdown": false,
  "cover": false,
  "level1TitleChinese": false
}
\`\`\`

## 参数说明

- **operation** (string, 可选): 操作类型
  - \`"format"\`: 执行完整格式化（默认）
  - \`"removePrefixes"\`: 仅移除所有标题前缀
  
- **adjustMarkdown** (boolean, 可选): 是否调整 Markdown 标题层级，默认 \`true\`
  
- **firstMarkdownTitleLevel** (number, 可选): 第一级标题的层级（1-6），默认 \`1\`
  - \`1\` 表示 \`# 标题\`
  - \`2\` 表示 \`## 标题\`
  - 以此类推
  
- **adjustTitle** (boolean, 可选): 是否调整标题编号，默认 \`true\`
  
- **cover** (boolean, 可选): 是否覆盖原有编号，默认 \`true\`
  - \`true\`: 先移除原有编号，再添加新编号
  - \`false\`: 保留原有编号，仅在无编号时添加
  
- **level1TitleChinese** (boolean, 可选): 第一级标题是否使用中文数字，默认 \`true\`
  - \`true\`: 第一级标题使用中文数字（一、二、三...）
  - \`false\`: 第一级标题使用阿拉伯数字（1、2、3...）
  
- **removePrefixes** (boolean, 可选): 是否移除所有标题前缀，默认 \`false\`
  - 适用于 Markdown 转 LaTeX 的场景，因为 LaTeX 会自动编号

## 输出格式

\`\`\`json
{
  "operations": ["操作1", "操作2", ...],
  "outlineModified": true
}
\`\`\`

## 注意事项

1. 需要先打开一个文档才能使用此工具
2. 移除前缀操作会移除所有标题开头的编号和点号（包括中文数字编号）
3. 调整层级和编号操作会修改文档的大纲结构
4. 所有操作都会自动保存到文档中

## 与其他Tool的区别

- **outline-optimize**: 用于生成和优化大纲内容，不涉及标题格式化
- **edit**: 用于编辑文档内容，不涉及批量格式化标题
- **title-format**: 专门用于格式化标题层级和编号`,
  callback: titleFormatCallback,
  displayComponent: TitleFormatDisplay,
  tags: ['document', 'formatting', 'title', 'outline'],
  enabled: true,
  editable: false,
  locales: {
    'zh_cn': {
      name: '标题格式化',
      description: '格式化文档标题：调整标题层级、添加/移除标题编号、移除标题前缀等'
    },
    'en_us': {
      name: 'Title Formatting',
      description: 'Format document titles: adjust title levels, add/remove title numbering, remove title prefixes, etc.'
    },
    'ja_jp': {
      name: 'タイトルフォーマット',
      description: 'ドキュメントタイトルをフォーマット：タイトルレベル調整、タイトル番号の追加/削除、タイトルプレフィックスの削除など'
    },
    'ko_kr': {
      name: '제목 포맷팅',
      description: '문서 제목 포맷팅: 제목 레벨 조정, 제목 번호 추가/제거, 제목 접두사 제거 등'
    },
    'fr_fr': {
      name: 'Formatage de titre',
      description: 'Formater les titres de document : ajuster les niveaux de titre, ajouter/supprimer la numérotation des titres, supprimer les préfixes de titre, etc.'
    },
    'de_de': {
      name: 'Titelformatierung',
      description: 'Dokumenttitel formatieren: Titel-Ebenen anpassen, Titelnummerierung hinzufügen/entfernen, Titelpräfixe entfernen usw.'
    }
  } as ToolLocales
}

