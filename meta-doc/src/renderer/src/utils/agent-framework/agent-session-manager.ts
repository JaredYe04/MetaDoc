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
import { toolCollectionManager } from './tool-collection-manager'
import { DEFAULT_AGENT_ASSISTANT_GREETING } from '../../constants/document'
import { i18n } from '../../i18n'

const TITLE_MAX_LEN = 32

/** 持久化时若 output.renderer 缺失，按 toolId 补全以便重开后能正确渲染 */
const TOOL_ID_TO_RENDERER: Record<string, string> = {
  edit: 'EditDisplay',
  grep: 'GrepDisplay',
  todolist: 'TodoListDisplay',
  'todolist-planning': 'TodoListDisplay',
  workspace: 'WorkspaceDisplay',
  'outline-tree': 'OutlineTreeDisplay',
  'outline-optimize': 'OutlineOptimizeDisplay',
  diff: 'DiffDisplay',
  proofread: 'ProofreadDisplay',
  'title-format': 'TitleFormatDisplay',
  'chart-generation': 'ChartGenerationDisplay',
  'data-analysis': 'DataAnalysisDisplay',
  'web-crawler': 'WebCrawlerDisplay',
  terminal: 'TerminalExecutionDisplay',
  metadata: 'MetadataDisplay',
  color: 'ColorDisplay',
  rag: 'RAGToolDisplay'
}

/**
 * 根据首条用户消息内容生成会话标题（去掉 @[xxx]、取首行、截断）
 */
export function generateSessionTitleFromContent(
  content: string,
  maxLen: number = TITLE_MAX_LEN
): string {
  const stripped = content.replace(/@\[[^\]]*\]/g, '').trim()
  const firstLine = stripped.split(/\r?\n/)[0]?.trim() || stripped
  if (!firstLine) return ''
  if (firstLine.length <= maxLen) return firstLine
  return firstLine.slice(0, maxLen).trim() + '…'
}

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
  createSession(agentConfigId: string, title: string, description?: string): AgentSession {
    const id = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const now = Date.now()

    // 验证AgentConfig是否存在
    const config = agentConfigManager.getConfig(agentConfigId)
    if (!config) {
      throw new Error(`Agent配置 ${agentConfigId} 未找到`)
    }

    // 创建初始问候语消息
    // 使用i18n替换模板中的占位符
    const t = i18n.global.t
    const greetingMarkdown = DEFAULT_AGENT_ASSISTANT_GREETING.replace(
      '{{agentEngine.greeting.title}}',
      t('agentEngine.greeting.title')
    )
      .replace('{{agentEngine.greeting.subtitle}}', t('agentEngine.greeting.subtitle'))
      .replace('{{agentEngine.greeting.canDo}}', t('agentEngine.greeting.canDo'))
      .replace('{{agentEngine.greeting.ragTool}}', t('agentEngine.greeting.ragTool'))
      .replace('{{agentEngine.greeting.chartTool}}', t('agentEngine.greeting.chartTool'))
      .replace('{{agentEngine.greeting.editTool}}', t('agentEngine.greeting.editTool'))
      .replace('{{agentEngine.greeting.proofreadTool}}', t('agentEngine.greeting.proofreadTool'))
      .replace('{{agentEngine.greeting.tellMe}}', t('agentEngine.greeting.tellMe'))

    const greetingMessage: AgentMessage = {
      id: `msg-${now}-greeting`,
      role: 'assistant',
      type: 'chat',
      timestamp: new Date(now).toISOString(),
      markdown: greetingMarkdown
    }

    const session: AgentSession = {
      entityType: 'agent-session',
      id,
      title,
      titleUserEdited: false,
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
    const unprocessed = session.messageQueue.filter((msg) => !msg.processed)

    if (unprocessed.length === 0) {
      return []
    }

    // 标记为已处理
    unprocessed.forEach((msg) => {
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
    const index = session.referenceStore.findIndex((ref) => ref.id === referenceId)
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
    this.getLogger().info(
      `[addReferenceObject] 引用素材已添加到referenceStore，当前引用数: ${session.referenceStore.length}`
    )
  }

  /**
   * 更新引用素材
   */
  updateReference(session: AgentSession, referenceId: string, updates: Partial<Reference>): void {
    const reference = session.referenceStore.find((ref) => ref.id === referenceId)
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
  writeToPublicContext(session: AgentSession, key: string, value: unknown): void {
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
    const node = session.executionNodes.find((n) => n.id === nodeId)
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
    const nodeIndex = session.executionNodes.findIndex((n) => n.id === nodeId)
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
        (msg) => new Date(msg.timestamp).getTime() <= node.timestamp
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
    duplicated.titleUserEdited = true
    duplicated.createdAt = now
    duplicated.updatedAt = now

    // 如果指定了节点ID，只保留到该节点的内容
    if (atNodeId) {
      const nodeIndex = duplicated.executionNodes.findIndex((n) => n.id === atNodeId)
      if (nodeIndex !== -1) {
        const node = duplicated.executionNodes[nodeIndex]
        duplicated.executionNodes = duplicated.executionNodes.slice(0, nodeIndex + 1)
        duplicated.currentExecutionNodeId = atNodeId

        if (node && node.timestamp) {
          duplicated.messages = duplicated.messages.filter(
            (msg) => new Date(msg.timestamp).getTime() <= node.timestamp
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
   * @param session 会话对象
   * @param includeDependencies 是否包含依赖（agentConfig、toolCollections），紧凑模式下忽略
   * @param options.compact 为 true 时仅导出会话与消息必要信息：不包含依赖；工具消息只保留调用参数与结果摘要
   */
  serializeSession(
    session: AgentSession,
    includeDependencies = false,
    options?: { compact?: boolean }
  ): {
    session: AgentSession
    dependencies?: {
      agentConfig?: any
      toolCollections?: any[]
    }
  } {
    let sessionData: AgentSession = JSON.parse(JSON.stringify(session))

    if (options?.compact) {
      sessionData = this.compactSessionForExport(sessionData)
      includeDependencies = false
    }

    const serialized: {
      session: AgentSession
      dependencies?: {
        agentConfig?: any
        toolCollections?: any[]
      }
    } = {
      session: sessionData
    }

    if (includeDependencies) {
      const dependencies: {
        agentConfig?: any
        toolCollections?: any[]
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

  /** 导出时截断字符串的最大长度 */
  private static readonly EXPORT_TRUNCATE_RESULT = 2000
  private static readonly EXPORT_TRUNCATE_REFERENCE_CONTENT = 500

  /**
   * 紧凑化会话用于导出：只保留会话与消息必要信息，工具只保留调用参数与结果摘要
   */
  private compactSessionForExport(session: AgentSession): AgentSession {
    const out = JSON.parse(JSON.stringify(session)) as AgentSession

    out.messages = (out.messages || []).map((msg: AgentMessage) =>
      this.compactMessageForExport(msg)
    ) as AgentMessage[]

    if (out.referenceStore && out.referenceStore.length > 0) {
      out.referenceStore = out.referenceStore.map((ref: Reference) => ({
        id: ref.id,
        name: ref.name,
        origin: ref.origin,
        format: ref.format,
        description: ref.description,
        createdAt: ref.createdAt,
        updatedAt: ref.updatedAt,
        parsedContent:
          typeof ref.parsedContent === 'string' &&
          ref.parsedContent.length > AgentSessionManager.EXPORT_TRUNCATE_REFERENCE_CONTENT
            ? ref.parsedContent.slice(0, AgentSessionManager.EXPORT_TRUNCATE_REFERENCE_CONTENT) +
              '…'
            : ref.parsedContent,
        metadata: undefined
      }))
    }

    if (out.executionNodes && out.executionNodes.length > 0) {
      out.executionNodes = out.executionNodes.map((node: ExecutionNode) => ({
        id: node.id,
        type: node.type,
        timestamp: node.timestamp,
        status: node.status,
        error: node.error,
        data: undefined,
        result: undefined
      }))
    }

    return out
  }

  private compactMessageForExport(msg: AgentMessage): AgentMessage {
    return this.compactMessageForPersistence(msg as any, { keepFullOutputForExternalTools: false })
  }

  private static isExternalToolMessage(m: any): boolean {
    const origin = m.tool_config?.origin
    if (origin === 'mcp' || origin === 'external') return true
    const id = String(m.tool?.id ?? m.tool_id ?? '').toLowerCase()
    const name = String(m.tool?.name ?? '').toLowerCase()
    return (
      id.startsWith('mcp') ||
      id.includes('mcp') ||
      name.includes('mcp') ||
      name.includes('external')
    )
  }

  /**
   * 紧凑化会话用于持久化（.metadoc/agent/sessions.json）
   * 与导出逻辑一致，但可选对「外部工具」（如 MCP）保留完整 outputs，便于恢复
   */
  compactSessionForPersistence(
    session: AgentSession,
    options?: { keepFullOutputForExternalTools?: boolean }
  ): AgentSession {
    const keepFull = options?.keepFullOutputForExternalTools !== false
    const out = JSON.parse(JSON.stringify(session)) as AgentSession
    out.messages = (out.messages || []).map((msg: AgentMessage) =>
      this.compactMessageForPersistence(msg as any, { keepFullOutputForExternalTools: keepFull })
    ) as AgentMessage[]

    if (out.referenceStore && out.referenceStore.length > 0) {
      out.referenceStore = out.referenceStore.map((ref: Reference) => ({
        id: ref.id,
        name: ref.name,
        origin: ref.origin,
        format: ref.format,
        description: ref.description,
        createdAt: ref.createdAt,
        updatedAt: ref.updatedAt,
        parsedContent:
          typeof ref.parsedContent === 'string' &&
          ref.parsedContent.length > AgentSessionManager.EXPORT_TRUNCATE_REFERENCE_CONTENT
            ? ref.parsedContent.slice(0, AgentSessionManager.EXPORT_TRUNCATE_REFERENCE_CONTENT) +
              '…'
            : ref.parsedContent,
        metadata: undefined
      }))
    }

    if (out.executionNodes && out.executionNodes.length > 0) {
      out.executionNodes = out.executionNodes.map((node: ExecutionNode) => ({
        id: node.id,
        type: node.type,
        timestamp: node.timestamp,
        status: node.status,
        error: node.error,
        data: undefined,
        result: undefined
      }))
    }
    return out
  }

  private compactMessageForPersistence(
    msg: any,
    options: { keepFullOutputForExternalTools: boolean }
  ): AgentMessage {
    const m = msg
    if (m.type === 'chat') {
      if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        m.tool_calls = m.tool_calls.map((tc: any) => ({
          id: tc.id,
          tool_id: tc.tool_id ?? tc.name ?? tc.function?.name,
          parameters: tc.parameters ?? tc.function?.arguments ?? tc.arguments ?? {}
        }))
      }
      return m
    }
    if (m.type === 'tool') {
      if (options.keepFullOutputForExternalTools && AgentSessionManager.isExternalToolMessage(m)) {
        return m
      }
      // edit 工具需保留完整 output（含 rawDiff）供 EditDisplay 的 Monaco 显示，不截断
      if (m.tool?.id === 'edit') {
        return m
      }
      // 持久化时保留完整 outputs（含 renderer 与 data），以便重新打开后能用 GrepDisplay/TodoListDisplay 等组件正确渲染，而不是显示裸 JSON
      const toolId = m.tool?.id
      const outputs =
        Array.isArray(m.outputs) && m.outputs.length > 0
          ? m.outputs.map((o: any) => ({
              id: o.id,
              label: o.label,
              format: o.format ?? 'json',
              data: o.data,
              renderer: o.renderer ?? (toolId ? TOOL_ID_TO_RENDERER[toolId] : undefined)
            }))
          : undefined
      const maxLen = AgentSessionManager.EXPORT_TRUNCATE_RESULT
      let summaryText: string | undefined = m.summary
      if (summaryText === undefined && outputs && outputs.length > 0) {
        const first = outputs[0]
        const data = first?.data
        if (typeof data === 'string') {
          summaryText = data.length > maxLen ? data.slice(0, maxLen) + '…' : data
        } else if (data !== null && data !== undefined) {
          try {
            const str = JSON.stringify(data)
            summaryText = str.length > maxLen ? str.slice(0, maxLen) + '…' : str
          } catch {
            summaryText = '[object]'
          }
        }
      }
      summaryText = summaryText ?? m.summary ?? m.error ?? ''
      return {
        id: m.id,
        role: m.role,
        type: 'tool',
        timestamp: m.timestamp,
        tool: m.tool ? { id: m.tool.id, name: m.tool.name } : undefined,
        status: m.status,
        tool_call_id: m.tool_call_id,
        summary: m.summary,
        error: m.error,
        outputs,
        tool_config: undefined,
        progress: undefined,
        markdown: summaryText || m.markdown,
        params: m.params,
        invocationId: m.invocationId
      } as any
    }
    return msg
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
          agentConfigManager.importConfig(dependencies.agentConfig, options.overwriteDependencies)
        } catch (error) {
          this.getLogger().warn(`导入AgentConfig失败: ${error}`)
        }
      }

      // 导入工具集
      if (dependencies.toolCollections) {
        for (const collectionEntity of dependencies.toolCollections) {
          try {
            toolCollectionManager.importCollection(collectionEntity, options.overwriteDependencies)
          } catch (error) {
            this.getLogger().warn(`导入工具集失败: ${error}`)
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

  /**
   * 回溯到指定节点（支持节点反演）
   * 将会话状态回退到指定节点，移除该节点之后的所有内容
   */
  revertToNode(session: AgentSession, nodeId: string): void {
    const nodeIndex = session.executionNodes.findIndex((n) => n.id === nodeId)
    if (nodeIndex === -1) {
      throw new Error(`执行节点 ${nodeId} 未找到`)
    }

    const targetNode = session.executionNodes[nodeIndex]

    // 移除该节点之后的所有节点
    session.executionNodes = session.executionNodes.slice(0, nodeIndex + 1)
    session.currentExecutionNodeId = nodeId

    // 移除该节点之后的所有消息
    if (targetNode && targetNode.timestamp) {
      const nodeTimestamp = targetNode.timestamp
      session.messages = session.messages.filter(
        (msg) => new Date(msg.timestamp).getTime() <= nodeTimestamp
      )
    }

    // 重置状态
    session.status = 'idle'

    this.touchSession(session)
    this.getLogger().info(`已回溯到节点: ${nodeId}`)
  }

  /**
   * 获取消息关联的执行节点
   */
  getMessageNode(session: AgentSession, messageId: string): ExecutionNode | null {
    // 查找与消息时间戳最接近的执行节点
    const message = session.messages.find((m) => m.id === messageId)
    if (!message) {
      return null
    }

    const messageTimestamp = new Date(message.timestamp).getTime()

    // 查找时间戳最接近且早于或等于消息时间的节点
    let closestNode: ExecutionNode | null = null
    let minDiff = Infinity

    for (const node of session.executionNodes) {
      const diff = messageTimestamp - node.timestamp
      if (diff >= 0 && diff < minDiff) {
        minDiff = diff
        closestNode = node
      }
    }

    return closestNode
  }

  /**
   * 获取工具调用消息关联的执行节点
   */
  getToolCallNode(session: AgentSession, toolCallId: string): ExecutionNode | null {
    // 查找类型为tool-call且包含该toolCallId的节点
    const toolNode = session.executionNodes.find((node) => {
      if (node.type === 'tool-call') {
        const data = node.data as any
        return data?.tool_call_id === toolCallId || data?.id === toolCallId
      }
      return false
    })

    return toolNode || null
  }

  /**
   * 重新执行消息节点（模拟消息重新发出）
   * 将会话回溯到该消息之前，然后重新触发Agent执行
   */
  async replayMessage(
    session: AgentSession,
    messageId: string,
    onReplay?: (message: AgentMessage) => Promise<void>
  ): Promise<void> {
    const message = session.messages.find((m) => m.id === messageId)
    if (!message) {
      throw new Error(`消息 ${messageId} 未找到`)
    }

    if (message.role !== 'user' || message.type !== 'chat') {
      throw new Error(`只能重新执行用户消息，当前消息类型: ${message.role}/${message.type}`)
    }

    // 找到消息在列表中的位置
    const messageIndex = session.messages.findIndex((m) => m.id === messageId)
    if (messageIndex === -1) {
      throw new Error(`消息 ${messageId} 在会话中未找到`)
    }

    // 移除该消息及之后的所有消息
    session.messages = session.messages.slice(0, messageIndex)

    // 移除该消息时间戳之后的所有执行节点
    const messageTimestamp = new Date(message.timestamp).getTime()
    session.executionNodes = session.executionNodes.filter(
      (node) => node.timestamp < messageTimestamp
    )

    // 重置状态
    session.status = 'idle'
    session.currentExecutionNodeId = undefined

    // 重新添加用户消息
    session.messages.push(message)

    this.touchSession(session)
    this.getLogger().info(`准备重新执行消息: ${messageId}`)

    // 如果提供了重放回调，调用它
    if (onReplay) {
      await onReplay(message)
    }
  }

  /**
   * 重新执行工具调用节点
   * 从会话中移除该工具调用的结果，然后重新执行工具调用
   */
  async replayToolCall(
    session: AgentSession,
    toolCallId: string,
    onReplay?: (toolCallData: any) => Promise<void>
  ): Promise<void> {
    // 查找工具调用消息
    const toolMessageIndex = session.messages.findIndex((msg) => {
      if (msg.role === 'tool' && msg.type === 'tool') {
        const toolMsg = msg as any
        return toolMsg.tool_call_id === toolCallId
      }
      return false
    })

    if (toolMessageIndex === -1) {
      throw new Error(`工具调用消息 ${toolCallId} 未找到`)
    }

    // 查找包含该工具调用的assistant消息
    let assistantMessageIndex = -1
    let assistantMessage: AgentMessage | null = null

    for (let i = toolMessageIndex - 1; i >= 0; i--) {
      const msg = session.messages[i]
      if (msg.role === 'assistant' && msg.type === 'chat') {
        const chatMsg = msg as any
        const toolCalls = chatMsg.tool_calls
        if (toolCalls && Array.isArray(toolCalls)) {
          const hasToolCall = toolCalls.some((tc: any) => tc.id === toolCallId)
          if (hasToolCall) {
            assistantMessageIndex = i
            assistantMessage = msg
            break
          }
        }
      }
    }

    if (!assistantMessage) {
      throw new Error(`未找到包含工具调用 ${toolCallId} 的assistant消息`)
    }

    // 获取工具调用数据
    const chatMsg = assistantMessage as any
    const toolCalls = chatMsg.tool_calls || []
    const toolCallData = toolCalls.find((tc: any) => tc.id === toolCallId)

    if (!toolCallData) {
      throw new Error(`工具调用数据 ${toolCallId} 未找到`)
    }

    // 移除工具调用消息
    session.messages.splice(toolMessageIndex, 1)

    // 移除该工具调用之后的所有消息（包括后续的assistant回复等）
    session.messages = session.messages.slice(0, toolMessageIndex)

    // 移除该工具调用时间戳之后的所有执行节点
    const toolMessage = session.messages[toolMessageIndex] || assistantMessage
    if (toolMessage) {
      const messageTimestamp = new Date(toolMessage.timestamp).getTime()
      session.executionNodes = session.executionNodes.filter(
        (node) => node.timestamp <= messageTimestamp
      )
    }

    // 重置状态
    session.status = 'idle'
    session.currentExecutionNodeId = undefined

    this.touchSession(session)
    this.getLogger().info(`准备重新执行工具调用: ${toolCallId}`)

    // 如果提供了重放回调，调用它
    if (onReplay) {
      await onReplay({
        tool_call_id: toolCallId,
        tool_id: toolCallData.function?.name || toolCallData.name,
        parameters: toolCallData.function?.arguments || toolCallData.arguments || {}
      })
    }
  }

  /**
   * 增强序列化：支持每个节点的完整序列化（包含执行上下文）
   */
  serializeSessionWithNodes(
    session: AgentSession,
    includeDependencies = false
  ): {
    session: AgentSession
    nodeMetadata?: Array<{
      nodeId: string
      type: ExecutionNode['type']
      timestamp: number
      messageIds: string[]
      toolCallIds?: string[]
      context: {
        messagesBefore: number
        messagesAfter: number
        nodesBefore: number
        nodesAfter: number
      }
    }>
    dependencies?: {
      agentConfig?: any
      toolCollections?: any[]
    }
  } {
    const serialized = this.serializeSession(session, includeDependencies)

    // 为每个执行节点生成元数据
    const nodeMetadata = session.executionNodes.map((node, index) => {
      const nodeTimestamp = node.timestamp

      // 查找该节点时间戳范围内的消息
      const messageIds = session.messages
        .filter((msg) => {
          const msgTimestamp = new Date(msg.timestamp).getTime()
          return msgTimestamp <= nodeTimestamp
        })
        .map((msg) => msg.id)

      // 如果是工具调用节点，提取toolCallIds
      const toolCallIds: string[] = []
      if (node.type === 'tool-call') {
        const data = node.data as any
        if (data?.tool_call_id) {
          toolCallIds.push(data.tool_call_id)
        } else if (data?.id) {
          toolCallIds.push(data.id)
        } else if (Array.isArray(data)) {
          data.forEach((item: any) => {
            if (item.tool_call_id) toolCallIds.push(item.tool_call_id)
            if (item.id) toolCallIds.push(item.id)
          })
        }
      }

      return {
        nodeId: node.id,
        type: node.type,
        timestamp: nodeTimestamp,
        messageIds,
        toolCallIds: toolCallIds.length > 0 ? toolCallIds : undefined,
        context: {
          messagesBefore: messageIds.length,
          messagesAfter: session.messages.length - messageIds.length,
          nodesBefore: index,
          nodesAfter: session.executionNodes.length - index - 1
        }
      }
    })

    return {
      ...serialized,
      nodeMetadata
    }
  }
}

// 导出单例
export const agentSessionManager = new AgentSessionManager()
