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
  search: 'subagent-search-tools'
} as const

export const SUBAGENT_CONFIG_IDS = {
  workspaceReader: 'subagent-workspace-reader',
  docWriter: 'subagent-doc-writer',
  search: 'subagent-search'
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

  // 3. 知识库与联网：rag、web-crawler
  toolCollectionManager.getOrCreateCollection(
    SUBAGENT_COLLECTION_IDS.search,
    loc('Subagent 检索工具集', 'Subagent search tool set'),
    loc('知识库检索与联网查询', 'RAG and web search'),
    ['rag', 'web-crawler']
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
    loc('Subagent：知识库与联网查询', 'Subagent: Search'),
    loc('负责知识库检索与联网查询，返回主 Agent 要求查找的信息', 'RAG and web search, return requested info'),
    [SUBAGENT_COLLECTION_IDS.search],
    { systemPromptKey: 'agent.subagent.search.systemPrompt', injectTimestamp: true }
  )
}
