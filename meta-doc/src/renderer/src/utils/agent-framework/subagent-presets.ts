/**
 * Subagent 预设：工具集与 Agent 配置
 * 1. 工作区读取 Subagent：workspace + grep
 * 2. 文档编写 Subagent：edit + outline-tree + workspace + grep
 * 3. 知识库/联网查询 Subagent：rag + web-crawler
 */

import type { LocalizedText } from '../../types/agent-tool'
import { toolCollectionManager } from './tool-collection-manager'
import { agentConfigManager } from './agent-config-manager'

export const SUBAGENT_COLLECTION_IDS = {
  workspaceReader: 'subagent-workspace-reader-tools',
  docWriter: 'subagent-doc-writer-tools',
  search: 'subagent-search-tools',
  chart: 'subagent-chart-tools'
} as const

export const SUBAGENT_CONFIG_IDS = {
  workspaceReader: 'subagent-workspace-reader',
  docWriter: 'subagent-doc-writer',
  search: 'subagent-search',
  chart: 'subagent-chart'
} as const

function loc(name: string, desc: string): LocalizedText {
  return {
    zh_cn: { name, description: desc },
    en_us: { name, description: desc }
  }
}

/**
 * 初始化 Subagent 预设工具集与配置
 * 在 initializeAgentTools() 之后调用，确保所有工具已注册
 */
export function initializeSubagentPresets(): void {
  // 1. 工作区读取：仅 workspace、grep
  toolCollectionManager.getOrCreateCollection(
    SUBAGENT_COLLECTION_IDS.workspaceReader,
    loc('Subagent 工作区读取工具集', 'Subagent workspace reader tool set'),
    loc('仅包含工作区文件读取与 grep 搜索，用于从工作区获取信息并返回', 'Workspace read and grep only'),
    ['workspace', 'grep']
  )

  // 2. 文档编写：edit、outline-tree、workspace、grep
  toolCollectionManager.getOrCreateCollection(
    SUBAGENT_COLLECTION_IDS.docWriter,
    loc('Subagent 文档编写工具集', 'Subagent doc writer tool set'),
    loc('文档编辑、大纲、工作区读取与搜索', 'Edit, outline, workspace, grep'),
    ['edit', 'outline-tree', 'workspace', 'grep']
  )

  // 3. 搜索 Subagent：工作区读取、grep、RAG、联网；多轮组合完成检索任务
  toolCollectionManager.getOrCreateCollection(
    SUBAGENT_COLLECTION_IDS.search,
    loc('Subagent 检索工具集', 'Subagent search tool set'),
    loc('工作区读文件与 grep、知识库 RAG、联网爬取，可多轮组合完成复杂检索', 'Workspace read + grep, RAG, web crawl; multi-turn combined search'),
    ['workspace', 'grep', 'rag', 'web-crawler']
  )

  // 4. 绘图/图表：workspace、grep、chart-generation
  toolCollectionManager.getOrCreateCollection(
    SUBAGENT_COLLECTION_IDS.chart,
    loc('Subagent 绘图工具集', 'Subagent chart/drawing tool set'),
    loc('工作区读取、grep 与图表生成，用于根据上下文生成并保存图表', 'Workspace, grep and chart generation for creating and saving charts'),
    ['workspace', 'grep', 'chart-generation']
  )

  agentConfigManager.getOrCreateConfig(
    SUBAGENT_CONFIG_IDS.workspaceReader,
    loc('Subagent：工作区读取', 'Subagent: Workspace Reader'),
    loc('从工作区读取若干文件或执行 grep，返回所需信息', 'Read workspace files or grep and return requested info'),
    [SUBAGENT_COLLECTION_IDS.workspaceReader],
    { systemPromptKey: 'agent.subagent.workspaceReader.systemPrompt', injectTimestamp: true }
  )

  agentConfigManager.getOrCreateConfig(
    SUBAGENT_CONFIG_IDS.docWriter,
    loc('Subagent：文档编写', 'Subagent: Doc Writer'),
    loc('根据系统提示与主 Agent 的指示进行文档编辑与撰写', 'Edit and write document per system prompt and main agent instructions'),
    [SUBAGENT_COLLECTION_IDS.docWriter],
    { systemPromptKey: 'agent.subagent.docWriter.systemPrompt', injectTimestamp: true }
  )

  agentConfigManager.getOrCreateConfig(
    SUBAGENT_CONFIG_IDS.search,
    loc('Subagent：检索（工作区+联网+RAG）', 'Subagent: Search (workspace + web + RAG)'),
    loc('多轮检索：读工作区文件、grep、RAG、联网爬取，可组合使用，完成如「论文进度」「撰写某主题文档所需资料」等任务', 'Multi-turn search: read workspace, grep, RAG, web; combine as needed for e.g. paper progress or gathering materials to write a doc'),
    [SUBAGENT_COLLECTION_IDS.search],
    { systemPromptKey: 'agent.subagent.search.systemPrompt', injectTimestamp: true }
  )

  agentConfigManager.getOrCreateConfig(
    SUBAGENT_CONFIG_IDS.chart,
    loc('Subagent：绘图/图表', 'Subagent: Chart/Drawing'),
    loc('根据主 Agent 的提示生成图表，可使用工作区与 grep 获取上下文，将图表保存到指定路径并返回路径', 'Generate charts per main agent instructions; use workspace and grep for context; save charts to path and return path'),
    [SUBAGENT_COLLECTION_IDS.chart],
    { systemPromptKey: 'agent.subagent.chart.systemPrompt', injectTimestamp: true }
  )
}
