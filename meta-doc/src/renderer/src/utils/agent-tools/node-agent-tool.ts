/**
 * NodeAgent Tool (重构版)
 * 为每个大纲节点创建独立的Agent，支持后序遍历执行写作任务
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
import { searchNode } from '../outline-helpers'
import { getActiveDocumentInfoViaBroadcast } from './document-broadcast-helper'
import { getWindowType } from '../event-bus'
import { getOutlineAdapter } from '../outline-adapters'
import { NodeAgentContextManager, type GlobalContext } from './node-agent/context-manager'
import { NodeAgentExecutionEngine } from './node-agent/execution-engine'

const logger = createRendererLogger('NodeAgentTool')
const workspace = useWorkspace()

/**
 * NodeAgent Tool回调函数
 */
const nodeAgentToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const nodePath = params.nodePath as string | undefined
  const userPrompt = (params.userPrompt as string) || ''
  const tabId = params.tabId as string | undefined

  if (!nodePath) {
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.nodeAgent.error.missingNodePath', '缺少必需参数: nodePath')
    }
  }

  try {
    onUpdate({
      content: {
        stage: 'loading',
        nodePath
      },
      format: 'json'
    }, {
      percentage: 10,
      message: i18n.global.t('agent.tool.nodeAgent.progress.loading', '正在加载文档...')
    })

    // 获取文档（支持跨窗口）
    const windowType = getWindowType()
    let doc: any = null
    let targetTabId: string | null = null

    if (windowType === 'setting') {
      const docInfo = await getActiveDocumentInfoViaBroadcast()
      if (!docInfo) {
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.nodeAgent.error.noActiveTab', '没有活动的文档标签页')
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
      if (!tabId) {
        logger.warn('[node-agent-tool] 未传入 tabId 参数，使用当前活跃的 tabId，可能在执行过程中不稳定')
      }
      targetTabId = tabId || workspace.activeTabId.value
      if (!targetTabId) {
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.nodeAgent.error.noActiveTab', '没有活动的文档标签页')
        }
      }
      doc = workspace.ensureDocument(targetTabId)
      if (!doc) {
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.nodeAgent.error.documentNotFound', '文档不存在')
        }
      }
    }

    // 保存固定的 tabId
    const fixedTabId = targetTabId

    // 确保文档格式已设置
    if (!doc.format) {
      doc.format = 'md'
      logger.warn('文档格式未设置，默认使用Markdown格式')
    }

    // 获取大纲树
    let outlineTree = doc.outline
    if (!outlineTree) {
      return {
        status: 'failed',
        error: i18n.global.t('agent.tool.nodeAgent.error.emptyOutline', '文档大纲为空')
      }
    }

    // 查找目标节点
    let targetNode: DocumentOutlineNode | null = null
    if (nodePath === 'dummy' || nodePath === 'all') {
      targetNode = outlineTree
    } else {
      targetNode = searchNode(nodePath, outlineTree)
      if (!targetNode) {
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.nodeAgent.error.nodeNotFound', `找不到路径为 ${nodePath} 的节点`)
        }
      }
    }

    if (!targetNode) {
      return {
        status: 'failed',
        error: i18n.global.t('agent.tool.nodeAgent.error.noTargetNode', '没有可操作的节点')
      }
    }

    // 深拷贝大纲树（避免直接修改原对象）
    const workingOutline = JSON.parse(JSON.stringify(outlineTree)) as DocumentOutlineNode
    const workingNode = searchNode(targetNode.path, workingOutline) || workingOutline

    // 锁定UI
    workspace.lockUI?.()

    try {
      // 构建全局上下文
      const globalContext: GlobalContext = {
        systemPrompt: '', // 系统提示词由contextManager构建
        userPrompt: userPrompt || '',
        docFormat: doc.format || 'md',
        docPath: doc.path,
        timestamp: Date.now(),
        metadata: {
          tabId: fixedTabId
        }
      }

      // 创建上下文管理器
      const contextManager = new NodeAgentContextManager(globalContext)

      // 创建执行引擎
      const executionEngine = new NodeAgentExecutionEngine(contextManager, 3) // 并发数3

      onUpdate({
        content: {
          stage: 'traversing',
          startNodePath: workingNode.path,
          startNodeTitle: workingNode.title
        },
        format: 'json'
      }, {
        percentage: 20,
        message: i18n.global.t('agent.tool.nodeAgent.progress.starting', `开始处理节点: ${workingNode.title}`)
      })

      // 执行后序遍历
      const results = await executionEngine.executePostOrder(
        workingNode,
        workingOutline,
        {
          signal,
          onUpdate: (data) => {
            // 如果data包含session，也传递
            const updateData: any = { ...data }
            if (data.session) {
              updateData.session = data.session
            }
            
            onUpdate({
              content: updateData,
              format: 'json'
            }, {
              percentage: 50 + (data.executedNodePaths?.length || 0) * 0.4,
              message: data.stage === 'node-executing' 
                ? i18n.global.t('agent.tool.nodeAgent.progress.executingNode', `正在处理节点: ${data.nodeTitle || ''}`)
                : i18n.global.t('agent.tool.nodeAgent.progress.processing', '正在处理节点...')
            })
          }
        }
      )

      if (signal?.aborted) {
        return {
          status: 'cancelled'
        }
      }

      // 同步大纲到文档
      onUpdate({
        content: {
          stage: 'syncing',
          executedNodePaths: Array.from(executionEngine.getExecutionState().executedNodePaths)
        },
        format: 'json'
      }, {
        percentage: 90,
        message: i18n.global.t('agent.tool.nodeAgent.progress.syncing', '正在同步文档内容...')
      })

      // 使用固定的 tabId
      const doc2 = workspace.ensureDocument(fixedTabId)
      if (doc2) {
        workspace.updateDocumentOutline(fixedTabId, workingOutline)
        workspace.updateDocumentLastView(fixedTabId, 'outline')

        const adapter = getOutlineAdapter(doc.format)
        if (doc.format === 'tex') {
          const nextTex = await adapter.toText(workingOutline, doc2.tex || '')
          workspace.updateDocumentTex(fixedTabId, nextTex)
        } else {
          const nextMd = await adapter.toText(workingOutline, doc2.markdown || '')
          workspace.updateDocumentMarkdown(fixedTabId, nextMd)
        }
      }

      // 统计执行结果
      const executionState = executionEngine.getExecutionState()
      const succeededCount = results.filter(r => !r.error).length
      const failedCount = results.filter(r => r.error).length

      onUpdate({
        content: {
          stage: 'completed',
          executedNodePaths: executionState.executedNodePaths,
          totalNodesProcessed: executionState.executedNodePaths.length,
          succeededCount,
          failedCount
        },
        format: 'json'
      }, {
        percentage: 100,
        message: i18n.global.t('agent.tool.nodeAgent.progress.completed', 'NodeAgent执行完成')
      })

      return {
        status: 'succeeded',
        data: {
          content: {
            stage: 'completed',
            executedNodePaths: executionState.executedNodePaths,
            totalNodesProcessed: executionState.executedNodePaths.length,
            succeededCount,
            failedCount
          },
          format: 'json'
        },
        result: {
          nodePath: targetNode.path,
          nodeTitle: targetNode.title,
          totalNodesProcessed: executionState.executedNodePaths.length,
          executedNodePaths: executionState.executedNodePaths,
          succeededCount,
          failedCount
        }
      }
    } finally {
      workspace.unlockUI?.()
    }
  } catch (error) {
    logger.error('NodeAgent执行失败:', error)
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

const nodeAgentToolLocales: ToolLocales = {
  zh_cn: {
    name: '节点智能体',
    description: '为每个大纲节点创建独立的Agent，支持后序遍历执行写作任务。每个节点可以看到子节点的内容，智能决定是否需要生成内容'
  },
  en_us: {
    name: 'Node Agent',
    description: 'Create independent Agent for each outline node, supports post-order traversal for writing tasks. Each node can see children\'s content and intelligently decide whether to generate content'
  },
  de_DE: {
    name: 'Knoten-Agent',
    description: 'Erstellen Sie unabhängige Agents für jeden Gliederungsknoten, unterstützt Post-Order-Traversierung für Schreibaufgaben'
  },
  fr_FR: {
    name: 'Agent de nœud',
    description: 'Créer un Agent indépendant pour chaque nœud d\'arborescence, prend en charge la traversée post-ordre pour les tâches d\'écriture'
  },
  ja_JP: {
    name: 'ノードエージェント',
    description: '各アウトラインノードに対して独立したAgentを作成し、書き込みタスクの後順走査をサポート'
  },
  ko_KR: {
    name: '노드 에이전트',
    description: '각 개요 노드에 대해 독립적인 Agent를 생성하고, 쓰기 작업을 위한 후위 순회를 지원'
  }
}

export const nodeAgentToolConfig: AgentToolConfig = {
  id: 'node-agent',
  name: nodeAgentToolLocales,
  description: nodeAgentToolLocales,
  origin: 'internal',
  spec: {
    name: 'node-agent',
    brief: 'Create independent Agent for each outline node with post-order traversal. Each node can see children\'s content and decide whether to generate content.',
    fullSpec: `# NodeAgent Tool

## Description
Creates an independent Agent for each outline node, executing tasks in post-order traversal. Each node can see its children's completed content and intelligently decide whether to generate content or call tools.

## Core Features
- **Post-order traversal**: Process children first (concurrently), then parent
- **Context awareness**: Each node can see all children's content
- **Independent Agent**: Each node has its own Agent session
- **Tool support**: Each node can call tools like outline-optimize, RAG, chart-generation, etc.
- **Internal tools**: read-node-content and update-node-content for content management

## Input Format
\`\`\`json
{
  "nodePath": "string",    // Required: Target node path (e.g., "1", "1.1", "dummy" for root)
  "userPrompt": "string",  // Optional: User prompt for guidance
  "tabId": "string"        // Optional: Document tab ID
}
\`\`\`

## Execution Flow
1. Start from specified node (or root if "dummy")
2. Post-order traversal: Process all children concurrently (with concurrency pool)
3. Each node creates independent Agent session
4. Node Agent can see children's content and decide:
   - Generate content (using update-node-content tool)
   - Call tools (e.g., outline-optimize to expand, RAG to query knowledge base)
   - Leave empty (if children already cover the topic)
5. If leaf node creates children, recursively process new children
6. After all nodes processed, sync to document`
  },
  instruction: `
# 节点智能体（NodeAgent）工具

## 功能描述
为每个大纲节点创建一个独立的Agent（NodeAgent），支持后序遍历执行写作任务。每个节点都可以看到其所有子节点的内容，智能决定是否需要生成内容或调用工具。

## 核心特性

### 后序遍历执行
- **先处理子节点**：从叶子节点开始，向上遍历
- **并发执行**：子节点使用并发池执行（默认并发数3）
- **子节点内容可见**：每个节点处理时，其所有子节点已经处理完成，可以看到完整内容
- **智能决策**：根据子节点内容，决定父节点是否需要生成内容

### 独立Agent会话
- **每个节点一个Agent**：每个节点都有独立的Agent Session
- **工具调用支持**：每个NodeAgent可以调用所有可用工具：
  - **内部工具**：read-node-content（读取节点内容）、update-node-content（更新节点内容）
  - **扩写工具**：outline-optimize（创建子节点）
  - **知识库**：rag（查询知识库）
  - **图表生成**：chart-generation
  - 其他所有Agent工具

### 上下文管理
- **全局上下文**：系统提示词（时间戳、预设内容）、用户提示词、文档格式
- **节点级上下文**：当前节点的子节点内容、父节点信息

### 内容处理机制
- **不直接使用Agent输出**：Agent不能直接输出内容作为节点内容
- **使用内部工具**：Agent必须使用 read-node-content 和 update-node-content 工具来读取和修改内容
- **内容过滤**：自动过滤子节点标题，避免覆盖children

## 使用场景
- 需要为整个文档结构生成内容
- 需要确保父子节点内容不重复
- 需要根据子节点内容智能生成父节点内容
- 需要让每个节点自主决定是否需要生成内容
- 需要调用各种工具辅助写作（知识库、图表等）

## 输入格式
\`\`\`json
{
  "nodePath": "string",    // ⚠️ 必需：目标节点的路径（如"1", "1.1", "dummy"表示根节点）
  "userPrompt": "string",  // 可选：用户提示词，用于指导生成
  "tabId": "string"        // 可选：文档标签页ID，默认使用当前活动标签页
}
\`\`\`

## 执行流程
1. **从指定节点开始**（或根节点，如果nodePath为"dummy"）
2. **后序遍历**：先并发处理所有子节点，再处理父节点
3. **每个节点创建独立Agent**：
   - 创建独立的Agent Session
   - 传入全局上下文（系统提示词、用户提示词）
   - 传入节点级上下文（子节点内容）
   - 注册内部工具（read-node-content, update-node-content）
4. **节点Agent执行任务**：
   - 使用 read-node-content 读取当前内容
   - 查看子节点内容
   - 决定是否需要生成内容
   - 可以调用工具（如outline-optimize、rag、chart-generation等）
   - 使用 update-node-content 更新节点内容
5. **递归处理新子节点**：如果叶子节点创建了子节点，递归处理这些子节点
6. **同步到文档**：所有节点处理完成后，同步大纲到文档内容

## 输出格式
\`\`\`json
{
  "nodePath": "string",
  "nodeTitle": "string",
  "totalNodesProcessed": 5,
  "executedNodePaths": ["1.1", "1.2", "1", "2.1", "2"],
  "succeededCount": 5,
  "failedCount": 0
}
\`\`\`

## 注意事项
1. **后序遍历**：确保子节点先于父节点处理
2. **并发执行**：子节点并发执行，提高性能
3. **内容不重复**：父节点可以看到子节点内容，避免重复生成
4. **工具调用**：每个NodeAgent可以调用所有可用工具
5. **内部工具**：必须使用内部工具来读取和修改内容，不能直接输出
6. **执行时间**：由于并发执行，处理大量节点的时间会显著减少
7. **取消支持**：支持通过signal取消执行
`,
  callback: nodeAgentToolCallback,
  tags: ['outline', 'ai', 'agent', 'node'],
  enabled: true,
  editable: false,
  locales: nodeAgentToolLocales
}
