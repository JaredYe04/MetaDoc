/**
 * NodeAgent 执行引擎
 * 负责后序遍历、并发执行、任务管理等
 */

import type { DocumentOutlineNode } from '@/types'
import type { AgentSession, AgentConfig } from '../../../types/agent-framework'
import { createRendererLogger } from '../../logger'
import { agentConfigManager } from '../../agent-framework/agent-config-manager'
import { agentEngineManager } from '../../agent-framework/agent-engine-manager'
import { AgentEngineExecutorFactory, type EngineExecuteOptions } from '../../agent-framework/agent-engine-executor'
import { AIContextManager } from '../../agent-framework/ai-context-manager'
import { generateOutlinePaths } from '../../document/outline'
import { NodeAgentContextManager, type GlobalContext, type NodeContext } from './context-manager'
import { createReadNodeContentTool, createUpdateNodeContentTool } from './internal-tools'
import { agentToolManager } from '../../agent-tool-manager'
import { searchNode } from '../../outline-helpers'

const logger = createRendererLogger('NodeAgentExecutionEngine')

/**
 * 执行选项
 */
export interface ExecutionOptions {
  /** 取消信号 */
  signal?: AbortSignal
  /** 更新回调 */
  onUpdate?: (data: {
    stage: string
    nodePath?: string
    nodeTitle?: string
    activeNodePaths?: string[]
    executedNodePaths?: string[]
    error?: string
    [key: string]: unknown
  }) => void
  /** 并发池大小（默认3） */
  concurrency?: number
}

/**
 * 执行结果
 */
export interface ExecutionResult {
  /** 执行的节点路径 */
  nodePath: string
  /** 更新的内容 */
  content?: string
  /** 是否创建了新子节点 */
  hasNewChildren?: boolean
  /** 新子节点路径 */
  newChildrenPaths?: string[]
  /** 错误信息 */
  error?: string
}

/**
 * NodeAgent 执行引擎
 */
export class NodeAgentExecutionEngine {
  private contextManager: NodeAgentContextManager
  private executedNodes: Map<string, { content?: string; children?: DocumentOutlineNode[] }> = new Map()
  private activeNodePaths: Set<string> = new Set()
  private concurrency: number
  private defaultEngineId = 'default-autogpt-engine'
  /** 节点路径到Agent Session的映射，用于查看执行详情 */
  private nodeSessions: Map<string, AgentSession> = new Map()

  constructor(contextManager: NodeAgentContextManager, concurrency: number = 3) {
    this.contextManager = contextManager
    this.concurrency = concurrency
  }

  /**
   * 执行后序遍历
   */
  async executePostOrder(
    node: DocumentOutlineNode,
    outlineTree: DocumentOutlineNode,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = []

    // 先递归处理所有子节点（并发执行）
    if (node.children && node.children.length > 0) {
      const childrenResults = await this.executeChildrenConcurrently(
        node.children,
        outlineTree,
        options
      )
      results.push(...childrenResults)
    }

    // 处理当前节点
    if (options.signal?.aborted) {
      return results
    }

    const nodeResult = await this.executeNode(node, outlineTree, options)
    results.push(nodeResult)

    // 如果创建了新子节点，递归处理
    if (nodeResult.hasNewChildren && nodeResult.newChildrenPaths) {
      const newChildren = nodeResult.newChildrenPaths
        .map(path => searchNode(path, outlineTree))
        .filter((n): n is DocumentOutlineNode => n !== null)

      if (newChildren.length > 0) {
        logger.info(`节点 ${node.path} 创建了 ${newChildren.length} 个新子节点，开始递归处理`)
        
        // 重新生成路径
        generateOutlinePaths(outlineTree)

        // 递归处理新子节点
        for (const newChild of newChildren) {
          if (options.signal?.aborted) break
          const childResults = await this.executePostOrder(newChild, outlineTree, options)
          results.push(...childResults)
        }
      }
    }

    return results
  }

  /**
   * 并发执行子节点
   */
  private async executeChildrenConcurrently(
    children: DocumentOutlineNode[],
    outlineTree: DocumentOutlineNode,
    options: ExecutionOptions
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = []
    const queue: DocumentOutlineNode[] = [...children]
    const executing: Promise<ExecutionResult[]>[] = []

    // 并发池执行
    while (queue.length > 0 || executing.length > 0) {
      // 填充并发池
      while (executing.length < this.concurrency && queue.length > 0) {
        if (options.signal?.aborted) {
          break
        }

        const child = queue.shift()!
        const promise = this.executePostOrder(child, outlineTree, options)
          .then(childResults => {
            // 移除执行中的promise
            const index = executing.indexOf(promise)
            if (index > -1) {
              executing.splice(index, 1)
            }
            return childResults
          })
          .catch(error => {
            // 移除执行中的promise
            const index = executing.indexOf(promise)
            if (index > -1) {
              executing.splice(index, 1)
            }
            logger.error(`子节点 ${child.path} 执行失败:`, error)
            return [{
              nodePath: child.path,
              error: error instanceof Error ? error.message : String(error)
            }] as ExecutionResult[]
          })

        executing.push(promise)
      }

      // 等待至少一个完成
      if (executing.length > 0) {
        const childResults = await Promise.race(executing)
        results.push(...childResults)
      }
    }

    return results
  }

  /**
   * 执行单个节点
   */
  private async executeNode(
    node: DocumentOutlineNode,
    outlineTree: DocumentOutlineNode,
    options: ExecutionOptions
  ): Promise<ExecutionResult> {
    const nodePath = node.path

    // 添加到活动节点
    this.activeNodePaths.add(nodePath)

      // 通知开始执行（此时session还未创建，稍后在执行过程中更新）
      options.onUpdate?.({
        stage: 'node-executing',
        nodePath,
        nodeTitle: node.title,
        activeNodePaths: Array.from(this.activeNodePaths),
        executedNodePaths: Array.from(this.executedNodes.keys())
      })

    try {
      // 构建节点上下文
      const nodeContext = this.contextManager.buildNodeContext(
        node,
        outlineTree,
        this.executedNodes
      )

      // 获取默认Agent配置
      const defaultAgentConfig = await agentConfigManager.getDefaultConfig()
      if (!defaultAgentConfig) {
        throw new Error('无法获取默认Agent配置')
      }

      // 创建Agent Session
      const nodeSessionId = `node-agent-${nodePath}-${Date.now()}`
      const nodeSession: AgentSession = {
        entityType: 'agent-session',
        id: nodeSessionId,
        title: `节点 ${node.title} 的写作任务`,
        agentConfigId: defaultAgentConfig.id,
        messages: [],
        messageQueue: [],
        referenceStore: [],
        publicContext: {},
        executionNodes: [],
        status: 'idle',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          nodePath,
          nodeTitle: node.title,
          nodeContext: nodeContext // 传递节点上下文
        }
      }
      
      // 保存Session，用于后续查看
      this.nodeSessions.set(nodePath, nodeSession)

      // 构建提示词
      const systemPrompt = this.contextManager.buildSystemPrompt(nodeContext)
      const userPrompt = this.contextManager.buildUserPrompt(nodeContext)

      // 添加系统消息
      AIContextManager.addSystemMessage(nodeSession, systemPrompt)
      AIContextManager.addUserMessage(nodeSession, userPrompt)

      // 注册内部工具（临时注册到agentToolManager）
      const internalTools = this.registerInternalTools(node, nodeContext)
      
      // 创建执行器
      const engine = agentEngineManager.getEngine(this.defaultEngineId)
      if (!engine) {
        throw new Error(`无法找到Agent引擎: ${this.defaultEngineId}`)
      }

      // ⚠️ 关键：保存children的引用和快照，防止被覆盖
      // 使用深拷贝保存快照，同时保存原始引用
      const originalChildrenRef = node.children
      const childrenSnapshot: DocumentOutlineNode[] = node.children 
        ? JSON.parse(JSON.stringify(node.children)) 
        : []
      
      // 记录执行前的状态
      const childrenPathsBefore = new Set<string>()
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
          if (child.path) {
            childrenPathsBefore.add(child.path)
          }
        })
      }

      const executorOptions: EngineExecuteOptions = {
        signal: options.signal,
        onProgress: (progress) => {
          // 在执行过程中也传递session，以便实时查看
          options.onUpdate?.({
            stage: 'node-executing',
            nodePath,
            nodeTitle: node.title,
            activeNodePaths: Array.from(this.activeNodePaths),
            nodeProgress: progress,
            session: nodeSession // 传递session以便实时查看
          })
        }
      }

      const executor = AgentEngineExecutorFactory.create(
        engine,
        nodeSession,
        defaultAgentConfig,
        executorOptions
      )

      // 执行Agent
      await executor.execute(userPrompt)

      // 从session中提取内容更新（通过工具调用结果）
      const updatedContent = this.extractContentFromSession(nodeSession, node)

      // 清理内部工具（取消注册）
      this.unregisterInternalTools(internalTools)

      // ⚠️ 关键：在执行后，确保children不被清空
      // 如果children被意外清空，从快照恢复
      if (!node.children || node.children.length === 0) {
        if (childrenSnapshot.length > 0) {
          logger.warn(`节点 ${nodePath} 执行后children被清空，正在从快照恢复...`)
          node.children = JSON.parse(JSON.stringify(childrenSnapshot))
        }
      } else {
        // 合并快照和当前children（保留执行过程中新增的子节点）
        // 当前children可能包含执行过程中通过扩写工具添加的新子节点
        // 快照包含执行前就存在的子节点
        // 我们需要合并两者，确保不丢失任何子节点
        const existingPaths = new Set(
          (node.children || []).map(c => c.path).filter(Boolean)
        )
        const snapshotPaths = new Set(
          childrenSnapshot.map(c => c.path).filter(Boolean)
        )
        
        // 如果快照中有但当前没有的子节点，需要恢复
        for (const snapshotChild of childrenSnapshot) {
          if (snapshotChild.path && !existingPaths.has(snapshotChild.path)) {
            logger.warn(`节点 ${nodePath} 的子节点 ${snapshotChild.path} 丢失，正在恢复...`)
            if (!node.children) {
              node.children = []
            }
            node.children.push(JSON.parse(JSON.stringify(snapshotChild)))
          }
        }
      }

      // 检测新子节点（执行过程中通过扩写工具添加的）
      const newChildrenPaths: string[] = []
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          if (child.path && !childrenPathsBefore.has(child.path)) {
            newChildrenPaths.push(child.path)
          }
        }
      }

      // 保存执行结果
      // ⚠️ 关键：确保children被正确保存
      const finalChildren = node.children || childrenSnapshot
      if (updatedContent !== undefined) {
        this.executedNodes.set(nodePath, {
          content: updatedContent,
          children: finalChildren  // 保存最终的children（包含所有子节点）
        })
        // 只更新text，children已经在上面处理过了
        node.text = updatedContent
        this.contextManager.updateNodeContent(nodePath, updatedContent)
      } else {
        // 即使没有更新，也保存当前内容和children
        this.executedNodes.set(nodePath, {
          content: node.text,
          children: finalChildren  // 保存最终的children
        })
      }
      
      // ⚠️ 最终保障：再次检查children，确保没有被清空
      if (!node.children || node.children.length === 0) {
        if (finalChildren.length > 0) {
          logger.error(`节点 ${nodePath} 的children在最终保存时被清空，强制恢复！`)
          node.children = JSON.parse(JSON.stringify(finalChildren))
        }
      }

      // 通知完成（包含Session信息）
      options.onUpdate?.({
        stage: 'node-completed',
        nodePath,
        nodeTitle: node.title,
        activeNodePaths: Array.from(this.activeNodePaths),
        executedNodePaths: Array.from(this.executedNodes.keys()),
        hasNewChildren: newChildrenPaths.length > 0,
        session: nodeSession // 传递Session信息
      })

      return {
        nodePath,
        content: updatedContent,
        hasNewChildren: newChildrenPaths.length > 0,
        newChildrenPaths: newChildrenPaths.length > 0 ? newChildrenPaths : undefined
      }

    } catch (error) {
      logger.error(`节点 ${nodePath} 执行失败:`, error)
      const errorMessage = error instanceof Error ? error.message : String(error)

      options.onUpdate?.({
        stage: 'node-failed',
        nodePath,
        nodeTitle: node.title,
        error: errorMessage,
        activeNodePaths: Array.from(this.activeNodePaths)
      })

      return {
        nodePath,
        error: errorMessage
      }
    } finally {
      this.activeNodePaths.delete(nodePath)
    }
  }

  /**
   * 注册内部工具
   */
  private registerInternalTools(
    node: DocumentOutlineNode,
    nodeContext: NodeContext
  ): string[] {
    const registeredToolIds: string[] = []

    // 创建读取工具
    const readTool = createReadNodeContentTool((session) => {
      const metadata = session.metadata as any
      if (metadata?.nodePath === node.path) {
        return {
          nodePath: node.path,
          nodeContent: node.text || ''
        }
      }
      return null
    })

    // 创建更新工具
    const updateTool = createUpdateNodeContentTool(async (session, content) => {
      const metadata = session.metadata as any
      if (metadata?.nodePath === node.path) {
        // ⚠️ 关键：只更新text，绝对不触碰children
        // 保存当前children的引用（可能在执行过程中被扩写工具添加了新子节点）
        // 使用深拷贝保存，防止引用丢失
        const currentChildren = node.children ? JSON.parse(JSON.stringify(node.children)) : []
        
        // 只更新text字段，绝对不修改children
        const oldText = node.text
        node.text = content
        
        // ⚠️ 三重保障：确保children不被清空或丢失
        // 1. 检查children引用是否还存在
        if (!node.children) {
          logger.error(`节点 ${node.path} 的children引用丢失！正在恢复...`)
          node.children = currentChildren.length > 0 ? currentChildren : []
        }
        // 2. 检查children是否被清空
        else if (node.children.length === 0 && currentChildren.length > 0) {
          logger.warn(`节点 ${node.path} 的children被意外清空，正在恢复...`)
          node.children = currentChildren
        }
        // 3. 检查children内容是否丢失（通过路径比较）
        else if (node.children.length > 0 && currentChildren.length > 0) {
          const currentPaths = new Set(node.children.map((c: DocumentOutlineNode) => c.path).filter(Boolean))
          const savedPaths = new Set(currentChildren.map((c: DocumentOutlineNode) => c.path).filter(Boolean))
          // 如果保存的路径中有但当前没有的，需要恢复
          for (const savedChild of currentChildren) {
            if (savedChild.path && !currentPaths.has(savedChild.path)) {
              logger.warn(`节点 ${node.path} 的子节点 ${savedChild.path} 丢失，正在恢复...`)
              node.children.push(JSON.parse(JSON.stringify(savedChild)))
            }
          }
        }
        
        this.contextManager.updateNodeContent(node.path, content)
        
        // 立即保存到executedNodes，确保内容被记录，同时保存children
        this.executedNodes.set(node.path, {
          content: content,
          children: node.children || currentChildren  // 使用当前children或备份
        })
        
        return {
          nodePath: node.path,
          success: true
        }
      }
      return {
        nodePath: node.path,
        success: false
      }
    })

    // 注册工具
    try {
      agentToolManager.registerTool(readTool)
      agentToolManager.registerTool(updateTool)
      registeredToolIds.push(readTool.id, updateTool.id)
      logger.debug(`注册内部工具: ${readTool.id}, ${updateTool.id}`)
    } catch (error) {
      logger.error('注册内部工具失败:', error)
    }

    return registeredToolIds
  }

  /**
   * 取消注册内部工具
   */
  private unregisterInternalTools(toolIds: string[]): void {
    for (const toolId of toolIds) {
      try {
        agentToolManager.unregisterTool(toolId)
        logger.debug(`取消注册内部工具: ${toolId}`)
      } catch (error) {
        logger.warn(`取消注册内部工具失败: ${toolId}`, error)
      }
    }
  }

  /**
   * 从Session中提取内容更新
   */
  private extractContentFromSession(
    session: AgentSession,
    node: DocumentOutlineNode
  ): string | undefined {
    // 查找 update-node-content 工具调用的结果
    // 工具调用结果应该在session的messages中
    const messages = session.messages || []
    
    // 查找工具调用消息（从后往前查找，获取最后一次更新）
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      if (message.type === 'tool') {
        const toolMessage = message as any
        // 检查是否是update-node-content工具
        if (toolMessage.toolId === 'update-node-content' || 
            toolMessage.toolName === 'update-node-content') {
          const result = toolMessage.result || toolMessage.content
          if (result) {
            // 如果result是对象，提取content字段
            if (typeof result === 'object' && result.content) {
              return result.content as string
            }
            // 如果result是字符串，直接返回
            if (typeof result === 'string') {
              return result
            }
          }
        }
      }
    }

    // 如果没有找到工具调用，检查节点是否已被更新（通过executedNodes）
    const executed = this.executedNodes.get(node.path)
    if (executed?.content !== undefined && executed.content !== node.text) {
      return executed.content
    }

    // 如果没有找到工具调用，返回undefined（表示没有更新）
    return undefined
  }

  /**
   * 获取执行状态
   */
  getExecutionState(): {
    activeNodePaths: string[]
    executedNodePaths: string[]
  } {
    return {
      activeNodePaths: Array.from(this.activeNodePaths),
      executedNodePaths: Array.from(this.executedNodes.keys())
    }
  }

  /**
   * 获取节点的Agent Session
   */
  getNodeSession(nodePath: string): AgentSession | undefined {
    return this.nodeSessions.get(nodePath)
  }

  /**
   * 清理执行状态
   */
  clear(): void {
    this.executedNodes.clear()
    this.activeNodePaths.clear()
    this.nodeSessions.clear()
  }
}

