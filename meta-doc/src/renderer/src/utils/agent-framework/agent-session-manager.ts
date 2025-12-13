/**
 * Agent会话（AgentSession）管理器
 * 负责Agent会话的创建、管理和持久化
 * 注意：Agent会话存储在文档的metadata中，不存储在全局存储中
 */

import type {
  AgentSession,
  Reference,
  PublicContext,
  QueuedMessage,
  ExecutionNode,
  AgentSessionStatus
} from '../../types/agent-framework'
import type { AgentMessage } from '../../types/agent'
import { createRendererLogger } from '../logger'
import { agentConfigManager } from './agent-config-manager'
import { workflowManager } from './workflow-manager'
import { toolCollectionManager } from './tool-collection-manager'
import { DEFAULT_AGENT_ASSISTANT_GREETING } from '../../constants/document'

/**
 * Agent会话管理器类
 */
class AgentSessionManager {
  private logger: ReturnType<typeof createRendererLogger> | null = null

  /**
   * 获取logger（懒加载）
   */
  private getLogger() {
    if (!this.logger) {
      this.logger = createRendererLogger('AgentSessionManager')
    }
    return this.logger
  }
  /**
   * 创建Agent会话
   */
  createSession(
    agentConfigId: string,
    title: string,
    description?: string
  ): AgentSession {
    const id = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const now = Date.now()

    // 验证AgentConfig是否存在
    const config = agentConfigManager.getConfig(agentConfigId)
    if (!config) {
      throw new Error(`Agent配置 ${agentConfigId} 未找到`)
    }

    // 创建初始问候语消息
    const greetingMessage: AgentMessage = {
      id: `msg-${now}-greeting`,
      role: 'assistant',
      type: 'chat',
      timestamp: new Date(now).toISOString(),
      markdown: DEFAULT_AGENT_ASSISTANT_GREETING
    }

    const session: AgentSession = {
      entityType: 'agent-session',
      id,
      title,
      description,
      agentConfigId,
      createdAt: now,
      updatedAt: now,
      messages: [greetingMessage],
      messageQueue: [],
      referenceStore: [],
      publicContext: {
        currentTime: new Date().toISOString()
      },
      executionNodes: [],
      status: 'idle',
      readonly: false,
      enableBuiltInDocumentReference: true // 默认开启内置0号reference
    }

    this.getLogger().info(`Agent会话已创建: ${id}`)
    return session
  }

  /**
   * 向消息队列添加消息
   */
  enqueueMessage(
    session: AgentSession,
    content: string,
    role: 'user' | 'system' | 'assistant',
    insertedAtMessageId?: string
  ): QueuedMessage {
    const message: QueuedMessage = {
      id: `queued-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content,
      role,
      timestamp: Date.now(),
      insertedAtMessageId,
      processed: false
    }

    session.messageQueue.push(message)
    this.touchSession(session)
    this.getLogger().debug(`消息已加入队列: ${message.id}`)
    return message
  }

  /**
   * 处理消息队列（在Agent执行下一步之前调用）
   */
  processMessageQueue(session: AgentSession): QueuedMessage[] {
    const unprocessed = session.messageQueue.filter(msg => !msg.processed)
    
    if (unprocessed.length === 0) {
      return []
    }

    // 标记为已处理
    unprocessed.forEach(msg => {
      msg.processed = true
    })

    this.touchSession(session)
    this.getLogger().debug(`处理了 ${unprocessed.length} 条队列消息`)
    return unprocessed
  }

  /**
   * 添加引用素材（兼容旧接口，但需要提供parsedContent）
   */
  addReference(
    session: AgentSession,
    name: string,
    origin: string,
    format: string,
    parsedContent: string,
    description?: string,
    metadata?: Record<string, unknown>
  ): Reference {
    const reference: Reference = {
      id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      origin,
      format,
      parsedContent,
      description,
      metadata,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    session.referenceStore.push(reference)
    this.touchSession(session)
    this.getLogger().info(`引用素材已添加: ${reference.id}`)
    return reference
  }

  /**
   * 移除引用素材
   */
  removeReference(session: AgentSession, referenceId: string): void {
    const index = session.referenceStore.findIndex(ref => ref.id === referenceId)
    if (index === -1) {
      throw new Error(`引用素材 ${referenceId} 未找到`)
    }

    session.referenceStore.splice(index, 1)
    this.touchSession(session)
    this.getLogger().info(`引用素材已移除: ${referenceId}`)
  }

  /**
   * 添加引用素材对象（直接添加已解析的Reference对象）
   */
  addReferenceObject(session: AgentSession, reference: Reference): void {
    this.getLogger().info(`[addReferenceObject] 添加引用素材`, {
      referenceId: reference.id,
      referenceName: reference.name,
      format: reference.format,
      hasParsedContent: !!reference.parsedContent,
      parsedContentLength: reference.parsedContent?.length || 0,
      referenceStoreLength: session.referenceStore.length
    })
    session.referenceStore.push(reference)
    this.touchSession(session)
    this.getLogger().info(`[addReferenceObject] 引用素材已添加到referenceStore，当前引用数: ${session.referenceStore.length}`)
  }

  /**
   * 更新引用素材
   */
  updateReference(
    session: AgentSession,
    referenceId: string,
    updates: Partial<Reference>
  ): void {
    const reference = session.referenceStore.find(ref => ref.id === referenceId)
    if (!reference) {
      throw new Error(`引用素材 ${referenceId} 未找到`)
    }

    Object.assign(reference, updates, {
      updatedAt: Date.now()
    })
    this.touchSession(session)
    this.getLogger().info(`引用素材已更新: ${referenceId}`)
  }

  /**
   * 写入公共上下文空间
   */
  writeToPublicContext(
    session: AgentSession,
    key: string,
    value: unknown
  ): void {
    if (!session.publicContext.custom) {
      session.publicContext.custom = {}
    }

    session.publicContext.custom[key] = value
    this.touchSession(session)
    this.getLogger().debug(`公共上下文已更新: ${key}`)
  }

  /**
   * 读取公共上下文空间
   */
  readFromPublicContext(session: AgentSession, key: string): unknown {
    if (key === 'currentTime') {
      return session.publicContext.currentTime || new Date().toISOString()
    }
    if (key === 'timezone') {
      return session.publicContext.timezone
    }
    if (key === 'document') {
      return session.publicContext.document
    }
    if (session.publicContext.custom) {
      return session.publicContext.custom[key]
    }
    return undefined
  }

  /**
   * 添加执行节点
   */
  addExecutionNode(
    session: AgentSession,
    type: ExecutionNode['type'],
    data: unknown
  ): ExecutionNode {
    const node: ExecutionNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: Date.now(),
      data,
      status: 'pending'
    }

    session.executionNodes.push(node)
    session.currentExecutionNodeId = node.id
    this.touchSession(session)
    this.getLogger().debug(`执行节点已添加: ${node.id}`)
    return node
  }

  /**
   * 更新执行节点状态
   */
  updateExecutionNode(
    session: AgentSession,
    nodeId: string,
    updates: Partial<ExecutionNode>
  ): void {
    const node = session.executionNodes.find(n => n.id === nodeId)
    if (!node) {
      throw new Error(`执行节点 ${nodeId} 未找到`)
    }

    Object.assign(node, updates)
    this.touchSession(session)
    this.getLogger().debug(`执行节点已更新: ${nodeId}`)
  }

  /**
   * 重试到指定节点
   */
  retryToNode(session: AgentSession, nodeId: string): void {
    const nodeIndex = session.executionNodes.findIndex(n => n.id === nodeId)
    if (nodeIndex === -1) {
      throw new Error(`执行节点 ${nodeId} 未找到`)
    }

    // 移除该节点之后的所有节点
    session.executionNodes = session.executionNodes.slice(0, nodeIndex + 1)
    session.currentExecutionNodeId = nodeId

    // 移除该节点之后的所有消息
    const node = session.executionNodes[nodeIndex]
    if (node && node.timestamp) {
      session.messages = session.messages.filter(
        msg => new Date(msg.timestamp).getTime() <= node.timestamp
      )
    }

    this.touchSession(session)
    this.getLogger().info(`已重试到节点: ${nodeId}`)
  }

  /**
   * 复制会话（Duplicate）
   */
  duplicateSession(session: AgentSession, atNodeId?: string): AgentSession {
    const newId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const now = Date.now()

    // 深拷贝会话
    const duplicated: AgentSession = JSON.parse(JSON.stringify(session))
    duplicated.id = newId
    duplicated.title = `${session.title} (副本)`
    duplicated.createdAt = now
    duplicated.updatedAt = now

    // 如果指定了节点ID，只保留到该节点的内容
    if (atNodeId) {
      const nodeIndex = duplicated.executionNodes.findIndex(n => n.id === atNodeId)
      if (nodeIndex !== -1) {
        const node = duplicated.executionNodes[nodeIndex]
        duplicated.executionNodes = duplicated.executionNodes.slice(0, nodeIndex + 1)
        duplicated.currentExecutionNodeId = atNodeId

        if (node && node.timestamp) {
          duplicated.messages = duplicated.messages.filter(
            msg => new Date(msg.timestamp).getTime() <= node.timestamp
          )
        }
      }
    }

    this.getLogger().info(`会话已复制: ${newId}`)
    return duplicated
  }

  /**
   * 更新会话状态
   */
  updateSessionStatus(session: AgentSession, status: AgentSessionStatus): void {
    session.status = status
    this.touchSession(session)
  }

  /**
   * 添加消息到会话
   */
  addMessage(session: AgentSession, message: AgentMessage): void {
    session.messages.push(message)
    this.touchSession(session)
  }

  /**
   * 更新会话时间戳
   */
  touchSession(session: AgentSession): void {
    session.updatedAt = Date.now()
  }

  /**
   * 序列化会话（用于导出）
   */
  serializeSession(session: AgentSession, includeDependencies = false): {
    session: AgentSession
    dependencies?: {
      agentConfig?: any
      toolCollections?: any[]
      workflows?: any[]
    }
  } {
    const serialized: {
      session: AgentSession
      dependencies?: {
        agentConfig?: any
        toolCollections?: any[]
        workflows?: any[]
      }
    } = {
      session: JSON.parse(JSON.stringify(session))
    }

    if (includeDependencies) {
      const dependencies: {
        agentConfig?: any
        toolCollections?: any[]
        workflows?: any[]
      } = {}

      // 收集AgentConfig
      const config = agentConfigManager.getConfig(session.agentConfigId)
      if (config) {
        const configEntity = agentConfigManager.exportConfig(session.agentConfigId, true)
        if (configEntity) {
          dependencies.agentConfig = configEntity
        }
      }

      serialized.dependencies = dependencies
    }

    return serialized
  }

  /**
   * 反序列化会话（用于导入）
   */
  deserializeSession(
    data: {
      session: AgentSession
      dependencies?: {
        agentConfig?: any
        toolCollections?: any[]
        workflows?: any[]
      }
    },
    options: {
      importDependencies?: boolean
      overwriteDependencies?: boolean
    } = {}
  ): AgentSession {
    const { session, dependencies } = data

    // 如果包含依赖，先导入依赖
    if (dependencies && options.importDependencies) {
      // 导入AgentConfig
      if (dependencies.agentConfig) {
        try {
          agentConfigManager.importConfig(
            dependencies.agentConfig,
            options.overwriteDependencies
          )
        } catch (error) {
          this.getLogger().warn(`导入AgentConfig失败: ${error}`)
        }
      }

      // 导入工具集
      if (dependencies.toolCollections) {
        for (const collectionEntity of dependencies.toolCollections) {
          try {
            toolCollectionManager.importCollection(
              collectionEntity,
              options.overwriteDependencies
            )
          } catch (error) {
            this.getLogger().warn(`导入工具集失败: ${error}`)
          }
        }
      }

      // 导入工作流
      if (dependencies.workflows) {
        for (const workflowEntity of dependencies.workflows) {
          try {
            workflowManager.importWorkflow(
              workflowEntity,
              options.overwriteDependencies
            )
          } catch (error) {
            this.getLogger().warn(`导入工作流失败: ${error}`)
          }
        }
      }
    }

    // 验证AgentConfig是否存在
    const config = agentConfigManager.getConfig(session.agentConfigId)
    if (!config) {
      throw new Error(`Agent配置 ${session.agentConfigId} 不存在，请先导入依赖`)
    }

    return session
  }
}

// 导出单例
export const agentSessionManager = new AgentSessionManager()

