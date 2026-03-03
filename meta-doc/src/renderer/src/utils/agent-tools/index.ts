/**
 * Agent Tools 初始化
 * 注册所有内部Tool
 */

import { agentToolManager } from '../agent-tool-manager'
import { ragToolConfig } from './rag-tool'
import { chartGenerationToolConfig } from './chart-generation-tool'
import { todolistToolConfig } from './todolist-tool'
import { calculationToolConfig } from './calculation-tool'
import { colorToolConfig } from './color-tool'
import { timestampToolConfig } from './timestamp-tool'
import { terminalToolConfig } from './terminal-tool'
import { webCrawlerToolConfig } from './web-crawler-tool'
import { dataAnalysisToolConfig } from './data-analysis-tool'
import { outlineTreeToolConfig } from './outline-tree-tool'
import { diffToolConfig } from './diff-tool'
import { grepToolConfig } from './grep-tool'
import { proofreadToolConfig } from './proofread-tool'
import { outlineOptimizeToolConfig } from './outline-optimize-tool'
import { editToolConfig } from './edit-tool'
import { metadataToolConfig } from './metadata-tool'
import { titleFormatToolConfig } from './title-format-tool'
import { toolSpecFetcherToolConfig } from './tool-spec-fetcher-tool'
import { workspaceToolConfig } from './workspace-tool'

/**
 * 初始化所有内部Tool
 */
export async function initializeAgentTools(): Promise<void> {
  // 注册RAG Tool
  agentToolManager.registerTool(ragToolConfig)

  // 注册图表生成Tool
  agentToolManager.registerTool(chartGenerationToolConfig)

  // 注册意图识别与任务划分Tool
  agentToolManager.registerTool(todolistToolConfig)

  // 注册数据计算Tool
  agentToolManager.registerTool(calculationToolConfig)

  // 注册颜色处理Tool
  agentToolManager.registerTool(colorToolConfig)

  // 注册时间戳Tool
  agentToolManager.registerTool(timestampToolConfig)

  // 注册终端执行Tool
  agentToolManager.registerTool(terminalToolConfig)

  // 注册网页访问Tool
  agentToolManager.registerTool(webCrawlerToolConfig)

  // 注册数据分析Tool
  agentToolManager.registerTool(dataAnalysisToolConfig)

  // 注册大纲树Tool
  agentToolManager.registerTool(outlineTreeToolConfig)

  // 注册文本比对Tool
  agentToolManager.registerTool(diffToolConfig)

  // 注册文本搜索Tool
  agentToolManager.registerTool(grepToolConfig)

  // 注册文本校对Tool
  agentToolManager.registerTool(proofreadToolConfig)

  // 注册大纲优化Tool
  agentToolManager.registerTool(outlineOptimizeToolConfig)

  // 注册文档编辑Tool
  agentToolManager.registerTool(editToolConfig)

  // 注册元信息管理Tool
  agentToolManager.registerTool(metadataToolConfig)

  // 注册标题格式化Tool
  agentToolManager.registerTool(titleFormatToolConfig)

  // 注册工具说明获取器Tool
  agentToolManager.registerTool(toolSpecFetcherToolConfig)

  // 注册工作区文件读取Tool
  agentToolManager.registerTool(workspaceToolConfig)

  // 初始化默认工具集（包含所有内置工具）
  initializeDefaultToolSet()

  // 初始化默认Agent配置
  initializeDefaultAgentConfig()
}

/**
 * 初始化默认工具集
 */
import { toolCollectionManager } from '../agent-framework'
export function initializeDefaultToolSet(): void {
  const allTools = agentToolManager.getAllTools()

  // 获取所有内置工具ID（排除 hidden 工具，不推荐 Agent 优先使用）
  const builtInToolIds = allTools
    .filter((tool) => !tool.config.hidden)
    .map((tool) => tool.config.id)

  // 初始化默认工具集
  toolCollectionManager.initializeDefaultToolSet(builtInToolIds)
}

/**
 * 初始化默认Agent配置
 */
import { agentConfigManager } from '../agent-framework'
export function initializeDefaultAgentConfig(): void {
  // 默认工具集ID
  const defaultToolCollectionId = 'default-tool-set'

  agentConfigManager.initializeDefaultAgentConfig(defaultToolCollectionId, [])
}

/**
 * 获取所有已注册的Tool
 */
export function getRegisteredTools() {
  return agentToolManager.getAllTools()
}
