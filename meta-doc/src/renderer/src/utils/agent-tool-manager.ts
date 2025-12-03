/**
 * Agent Tool 管理器
 * 负责Tool的注册、调用、状态管理等
 */

import type {
  AgentToolConfig,
  RegisteredTool,
  ToolInvocationContext,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress,
  ToolExecutionStatus,
  ToolLocales,
  ToolExecutionSnapshot
} from '../types/agent-tool'
import { createRendererLogger } from './logger'
import { i18n } from '../i18n'
import { emitToolUpdate, emitToolComplete, emitToolFailed } from './agent-tools/tool-display-communication'
import eventBus from './event-bus.js'
import {
  serializeToolExecutionSnapshot,
  deserializeToolExecutionSnapshot,
  createToolExecutionSnapshot,
  validateToolExecutionSnapshot
} from './agent-tools/tool-serialization'
import { findTaskByOriginKey } from './ai_tasks'



/**
 * Agent Tool管理器类
 */
class AgentToolManager {
  private tools: Map<string, RegisteredTool> = new Map()
  private invocations: Map<string, ToolInvocationContext> = new Map()
  private aliveCheckInterval: number | null = null
  private readonly ALIVE_CHECK_INTERVAL = 30000 // 30秒检查一次
  private readonly ALIVE_TIMEOUT = 60000 // 60秒超时

  /**
   * 注册Tool
   */
  registerTool(config: AgentToolConfig): void {
    const logger = createRendererLogger('AgentToolManager')
    if (this.tools.has(config.id)) {
      logger.warn(`Tool ${config.id} 已存在，将被覆盖`)
    }

    const registeredTool: RegisteredTool = {
      config: {
        ...config,
        enabled: config.enabled ?? true,
        editable: config.editable ?? (config.origin === 'internal' ? false : true)
      },
      running: false,
      usageCount: 0
    }

    this.tools.set(config.id, registeredTool)
    logger.debug(`Tool ${config.id} 已注册`)
  }

  /**
   * 注销Tool
   */
  unregisterTool(toolId: string): void {
    const logger = createRendererLogger('AgentToolManager')
    if (this.tools.has(toolId)) {
      // 检查是否有正在运行的 invocation
      const hasRunningInvocations = Array.from(this.invocations.values()).some(
        inv => inv.toolId === toolId
      )
      if (hasRunningInvocations) {
        logger.warn(`Tool ${toolId} 有正在运行的调用，无法注销`)
        return
      }
      this.tools.delete(toolId)
      logger.info(`Tool ${toolId} 已注销`)
    }
  }

  /**
   * 获取所有已注册的Tool
   */
  getAllTools(): RegisteredTool[] {
    return Array.from(this.tools.values())
  }

  /**
   * 获取启用的Tool
   */
  getEnabledTools(): RegisteredTool[] {
    return Array.from(this.tools.values()).filter(tool => tool.config.enabled)
  }

  /**
   * 根据ID获取Tool
   */
  getTool(toolId: string): RegisteredTool | undefined {
    return this.tools.get(toolId)
  }

  /**
   * 调用Tool
   */
  async invokeTool(
    toolId: string,
    params: Record<string, unknown>,
    onStatusUpdate?: (status: ToolExecutionStatus, data?: ToolCallbackData, progress?: ToolProgress) => void
  ): Promise<ToolCallbackResult> {
    const tool = this.tools.get(toolId)
    if (!tool) {
      throw new Error(`Tool ${toolId} 未找到`)
    }

    if (!tool.config.enabled) {
      throw new Error(`Tool ${toolId} 已禁用`)
    }

    // 不再检查 tool.running，因为现在支持同一 Tool 的并发执行
    // 每个 invocation 都有独立的 invocationId，通过 invocations Map 来管理

    const invocationId = `invocation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const controller = new AbortController()

    const context: ToolInvocationContext = {
      invocationId,
      toolId,
      params,
      startTime: new Date().toISOString(),
      controller,
      onStatusUpdate,
      timeoutCount: 0,  // 初始化超时计数
      lastUpdateTime: Date.now(),  // 初始化最后更新时间
      lastRefValue: '',  // 初始化最后ref值
      lastRefLength: 0   // 初始化最后ref长度
    }

    this.invocations.set(invocationId, context)
    // 设置 running 为 true（因为当前 invocation 即将开始运行）
    // 即使有其他正在运行的 invocation，这个标志也应该为 true
    tool.running = true
    tool.lastUsed = new Date().toISOString()
    tool.usageCount++

    // 通过eventBus发送初始化事件，包含invocationId
    const startEvent = {
      invocationId,
      toolId,
      params,
      timestamp: Date.now()
    }
    console.log(`[AgentToolManager] 发送 tool-invocation-started 事件:`, startEvent)
    eventBus.emit('tool-invocation-started', startEvent)
    
    // 通知状态更新
    onStatusUpdate?.('running')

    try {
      // 创建更新回调
      const onUpdate = (data: ToolCallbackData, progress?: ToolProgress) => {
        // 更新最后更新时间（表示有进展）
        context.lastUpdateTime = Date.now()
        
        // 通过eventBus发送实时更新事件
        emitToolUpdate(invocationId, data, progress)
        // 同时调用原有的回调（保持兼容性）
        onStatusUpdate?.('running', data, progress)
      }

      // 调用Tool回调函数
      const result = await tool.config.callback(params, controller.signal, onUpdate)

      // 更新状态：检查是否还有其他正在运行的 invocation
      const hasOtherRunningInvocations = Array.from(this.invocations.values()).some(
        inv => inv.toolId === toolId && inv.invocationId !== invocationId
      )
      if (!hasOtherRunningInvocations) {
        tool.running = false
      }
      
      // 通过eventBus发送完成事件
      // 转换status为emitToolComplete期望的格式
      const completeStatus = result.status === 'succeeded' || result.status === 'failed' || result.status === 'cancelled'
        ? result.status
        : result.status === 'running' ? 'succeeded' : 'failed'
      emitToolComplete(invocationId, {
        status: completeStatus,
        data: result.data,
        error: result.error,
        progress: result.progress
      })
      
      // 同时调用原有的回调（保持兼容性）
      onStatusUpdate?.(result.status, result.data, result.progress)

      return result
    } catch (error) {
      const logger = createRendererLogger('AgentToolManager')
      // 更新状态：检查是否还有其他正在运行的 invocation
      const hasOtherRunningInvocations = Array.from(this.invocations.values()).some(
        inv => inv.toolId === toolId && inv.invocationId !== invocationId
      )
      if (!hasOtherRunningInvocations) {
        tool.running = false
      }
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`Tool ${toolId} 执行失败:`, error)

      const errorResult: ToolCallbackResult = {
        status: 'failed',
        error: errorMessage
      }

      // 通过eventBus发送失败事件
      emitToolFailed(invocationId, errorMessage)
      
      // 同时调用原有的回调（保持兼容性）
      onStatusUpdate?.('failed', undefined, undefined)
      return errorResult
    } finally {
      this.invocations.delete(invocationId)
    }
  }

  /**
   * 取消Tool调用
   */
  cancelInvocation(invocationId: string): void {
    const logger = createRendererLogger('AgentToolManager')
    const context = this.invocations.get(invocationId)
    if (context) {
      context.controller.abort()
      const tool = this.tools.get(context.toolId)
      if (tool) {
        // 检查是否还有其他正在运行的 invocation
        const hasOtherRunningInvocations = Array.from(this.invocations.values()).some(
          inv => inv.toolId === context.toolId && inv.invocationId !== invocationId
        )
        if (!hasOtherRunningInvocations) {
          tool.running = false
        }
      }
      this.invocations.delete(invocationId)
      logger.info(`Tool调用 ${invocationId} 已取消`)
    }
  }

  /**
   * 创建工具执行快照
   * @param invocationId - 调用ID
   * @param result - 执行结果
   * @param outputs - 中间输出（可选）
   * @returns 工具执行快照
   */
  createExecutionSnapshot(
    invocationId: string,
    result: ToolCallbackResult,
    outputs?: Array<{
      id: string
      label: string
      format: string
      data: unknown
      timestamp?: number
    }>
  ): ToolExecutionSnapshot | null {
    const context = this.invocations.get(invocationId)
    if (!context) {
      const logger = createRendererLogger('AgentToolManager')
      logger.warn(`无法创建快照：找不到调用上下文 ${invocationId}`)
      return null
    }

    const tool = this.tools.get(context.toolId)
    if (!tool) {
      const logger = createRendererLogger('AgentToolManager')
      logger.warn(`无法创建快照：找不到Tool ${context.toolId}`)
      return null
    }

    // 获取Tool显示名称
    const toolName = this.getLocalizedText(tool.config.name)

    // 创建Tool配置快照（不包含函数和组件）
    const toolConfigSnapshot = {
      id: tool.config.id,
      name: tool.config.name,
      description: tool.config.description,
      origin: tool.config.origin,
      displayComponent: typeof tool.config.displayComponent === 'string'
        ? tool.config.displayComponent
        : tool.config.displayComponent?.name || undefined
    }

    const timestamp = new Date(context.startTime).getTime()

    return createToolExecutionSnapshot(
      invocationId,
      context.toolId,
      toolName,
      context.params,
      timestamp,
      result,
      outputs,
      toolConfigSnapshot
    )
  }

  /**
   * 序列化工具执行快照
   * @param snapshot - 工具执行快照
   * @returns JSON字符串
   */
  serializeExecutionSnapshot(snapshot: ToolExecutionSnapshot): string {
    return serializeToolExecutionSnapshot(snapshot)
  }

  /**
   * 反序列化工具执行快照
   * @param serialized - JSON字符串
   * @returns 工具执行快照
   */
  deserializeExecutionSnapshot(serialized: string): ToolExecutionSnapshot {
    const snapshot = deserializeToolExecutionSnapshot(serialized)
    
    // 验证快照
    const validation = validateToolExecutionSnapshot(snapshot)
    if (!validation.valid) {
      const logger = createRendererLogger('AgentToolManager')
      logger.warn('快照验证失败:', validation.errors)
      throw new Error(`快照验证失败: ${validation.errors.join(', ')}`)
    }

    return snapshot
  }

  /**
   * 检查Tool是否存活
   * 只有在没有更新（ref没有变化，且没有onUpdate调用）时才认为超时
   */
  async checkToolAlive(toolId: string): Promise<boolean> {
    const logger = createRendererLogger('AgentToolManager')
    const tool = this.tools.get(toolId)
    if (!tool) {
      return false
    }

    // 如果Tool有alive检查方法，调用它
    // 这里可以扩展为在config中添加aliveCheck方法
    // 目前简单实现：检查是否有正在运行的调用
    if (tool.running) {
      // 检查最近的调用是否超时
      const runningInvocation = Array.from(this.invocations.values()).find(
        inv => inv.toolId === toolId
      )
      if (runningInvocation) {
        // 检查是否有对应的AI任务正在运行
        let hasUpdate = false
        
        // 如果有originKey，尝试查找对应的AI任务
        let aiTask = runningInvocation.originKey 
          ? findTaskByOriginKey(runningInvocation.originKey)
          : null
          
        // 如果没有找到，尝试通过工具ID查找（对于proofread工具，originKey模式是proofread-xxx）
        if (!aiTask && toolId === 'proofread') {
          const { useAiTasks } = await import('./ai_tasks')
          const allTasks = useAiTasks().value
          // 查找最近创建的、正在运行的proofread任务
          aiTask = allTasks.find(t => 
            t.status.value === '运行中' && 
            t.origin_key && 
            t.origin_key.startsWith('proofread-')
          )
          if (aiTask) {
            // 保存originKey以便下次直接查找
            runningInvocation.originKey = aiTask.origin_key
          }
        }
        
        if (aiTask && aiTask.target) {
          const currentRefValue = aiTask.target.value || ''
          const currentRefLength = currentRefValue.length
          
          // 检查ref是否有更新（值变化或长度变化）
          if (currentRefLength !== (runningInvocation.lastRefLength || 0) ||
              currentRefValue !== (runningInvocation.lastRefValue || '')) {
            // ref有更新，说明正在工作
            hasUpdate = true
            runningInvocation.lastRefValue = currentRefValue
            runningInvocation.lastRefLength = currentRefLength
            runningInvocation.lastUpdateTime = Date.now()
            logger.debug(`Tool ${toolId} ref有更新，长度=${currentRefLength}`)
          }
        }
        
        // 检查是否有onUpdate调用（通过lastUpdateTime判断）
        const now = Date.now()
        const timeSinceLastUpdate = runningInvocation.lastUpdateTime 
          ? now - runningInvocation.lastUpdateTime 
          : now - new Date(runningInvocation.startTime).getTime()
        
        // 如果最近有更新（30秒内），认为工具还活着
        if (hasUpdate || timeSinceLastUpdate < 30000) {
          return true
        }
        
        // 如果没有更新，且距离最后一次更新超过超时时间，认为超时
        if (timeSinceLastUpdate > this.ALIVE_TIMEOUT) {
          logger.warn(`Tool ${toolId} 调用超时（${Math.round(timeSinceLastUpdate / 1000)}秒无更新）`)
          return false
        }
        
        // 如果距离开始时间超过超时时间，也认为超时（防止初始状态就没有更新）
        const elapsed = now - new Date(runningInvocation.startTime).getTime()
        if (elapsed > this.ALIVE_TIMEOUT && !hasUpdate && timeSinceLastUpdate > this.ALIVE_TIMEOUT) {
          logger.warn(`Tool ${toolId} 调用超时（总运行时间${Math.round(elapsed / 1000)}秒，无更新）`)
          return false
        }
      }
      return true
    }

    return true
  }

  /**
   * 启动存活检查
   */
  startAliveCheck(): void {
    
    if (this.aliveCheckInterval !== null) {
      return
    }

    this.aliveCheckInterval = window.setInterval(async () => {
      const runningTools = Array.from(this.tools.values()).filter(t => t.running)
      for (const tool of runningTools) {
        this.checkToolAlive(tool.config.id).then(async (alive) => {
          const logger = createRendererLogger('AgentToolManager')
          // 查找对应的invocation
          const runningInvocation = Array.from(this.invocations.values()).find(
            inv => inv.toolId === tool.config.id
          )
          
          if (!runningInvocation) {
            return
          }
          
          // 检查是否有对应的AI任务正在运行，并更新ref值
          // 如果没有originKey，尝试通过工具ID和任务名称模式匹配
          let aiTask = runningInvocation.originKey 
            ? findTaskByOriginKey(runningInvocation.originKey)
            : null
            
          // 如果没有找到，尝试通过工具ID查找（对于proofread工具，originKey模式是proofread-xxx）
          if (!aiTask && tool.config.id === 'proofread') {
            const { useAiTasks } = await import('./ai_tasks')
            const allTasks = useAiTasks().value
            // 查找最近创建的、正在运行的proofread任务
            aiTask = allTasks.find(t => 
              t.status.value === '运行中' && 
              t.origin_key && 
              t.origin_key.startsWith('proofread-')
            )
            if (aiTask) {
              // 保存originKey以便下次直接查找
              runningInvocation.originKey = aiTask.origin_key
            }
          }
          
          // 对于其他工具，也可以尝试类似的匹配逻辑
          if (!aiTask) {
            const { useAiTasks } = await import('./ai_tasks')
            const allTasks = useAiTasks().value
            // 查找最近创建的、正在运行的、名称匹配的任务
            const toolNamePattern = tool.config.id.toLowerCase()
            aiTask = allTasks.find(t => 
              t.status.value === '运行中' && 
              t.origin_key && 
              t.origin_key.toLowerCase().startsWith(toolNamePattern + '-')
            )
            if (aiTask) {
              // 保存originKey以便下次直接查找
              runningInvocation.originKey = aiTask.origin_key
            }
          }
          
          if (aiTask && aiTask.target) {
            const currentRefValue = aiTask.target.value || ''
            const currentRefLength = currentRefValue.length
            
            // 检查ref是否有更新
            if (currentRefLength !== (runningInvocation.lastRefLength || 0) ||
                currentRefValue !== (runningInvocation.lastRefValue || '')) {
              // ref有更新，重置超时计数
              runningInvocation.lastRefValue = currentRefValue
              runningInvocation.lastRefLength = currentRefLength
              runningInvocation.lastUpdateTime = Date.now()
              runningInvocation.timeoutCount = 0
              logger.debug(`Tool ${tool.config.id} ref有更新，重置超时计数`)
              return
            }
          }
          
          if (!alive) {
            // 增加超时计数
            runningInvocation.timeoutCount = (runningInvocation.timeoutCount || 0) + 1
            logger.warn(`Tool ${tool.config.id} 调用超时 (${runningInvocation.timeoutCount}/3)`)
            
            // 检查是否有输出内容
            let hasContent = false
            if (aiTask && aiTask.target) {
              const currentRefValue = aiTask.target.value || ''
              if (currentRefValue.trim().length > 0) {
                hasContent = true
                logger.warn(`Tool ${tool.config.id} 超时但检测到有输出内容，将尝试解析已有内容`)
              }
            }
            
            // 如果连续超时3次
            if (runningInvocation.timeoutCount >= 3) {
              if (hasContent) {
                // 有内容，标记为超时但允许解析
                logger.warn(`Tool ${tool.config.id} 连续超时3次，但检测到有输出内容，标记为超时并允许解析`)
                runningInvocation.isTimeout = true
                // 不abort，让工具回调函数处理已有内容
                // 设置一个标记，让工具回调知道已经超时
                runningInvocation.controller.abort()
                // 但不要立即删除invocation，让工具回调有机会处理
              } else {
                // 没有内容，直接取消
                logger.error(`Tool ${tool.config.id} 连续超时3次且无输出内容，自动取消任务`)
                runningInvocation.controller.abort()
                // 发送失败事件
                emitToolFailed(runningInvocation.invocationId, '工具调用连续超时3次且无输出内容，已自动取消')
                // 从invocations中移除
                this.invocations.delete(runningInvocation.invocationId)
                // 更新tool状态
                const hasOtherRunningInvocations = Array.from(this.invocations.values()).some(
                  inv => inv.toolId === tool.config.id
                )
                if (!hasOtherRunningInvocations) {
                  tool.running = false
                }
              }
            } else {
              // 未达到3次，标记为超时但继续等待
              runningInvocation.isTimeout = true
            }
          } else {
            // 如果工具还活着，重置超时计数和超时标记
            runningInvocation.timeoutCount = 0
            runningInvocation.isTimeout = false
          }
        })
      }
    }, this.ALIVE_CHECK_INTERVAL)

  }

  /**
   * 停止存活检查
   */
  stopAliveCheck(): void {
    const logger = createRendererLogger('AgentToolManager')
    if (this.aliveCheckInterval !== null) {
      clearInterval(this.aliveCheckInterval)
      this.aliveCheckInterval = null
      logger.info('Tool存活检查已停止')
    }
  }

  /**
   * 启用/禁用Tool
   */
  setToolEnabled(toolId: string, enabled: boolean): void {
    const logger = createRendererLogger('AgentToolManager')
    const tool = this.tools.get(toolId)
    if (tool) {
      tool.config.enabled = enabled
      logger.info(`Tool ${toolId} ${enabled ? '已启用' : '已禁用'}`)
    }
  }

  /**
   * 更新Tool配置（仅限可编辑的Tool）
   */
  updateToolConfig(toolId: string, updates: Partial<AgentToolConfig>): void {
    const logger = createRendererLogger('AgentToolManager')
    const tool = this.tools.get(toolId)
    if (!tool) {
      throw new Error(`Tool ${toolId} 未找到`)
    }

    if (!tool.config.editable) {
      throw new Error(`Tool ${toolId} 不可编辑`)
    }

    tool.config = {
      ...tool.config,
      ...updates,
      id: toolId, // 不允许修改ID
      origin: tool.config.origin // 不允许修改origin
    }

    logger.info(`Tool ${toolId} 配置已更新`)
  }

  /**
   * 导出Tool配置（用于插件化）
   */
  exportToolConfig(toolId: string): AgentToolConfig | null {
    const tool = this.tools.get(toolId)
    if (!tool) {
      return null
    }

    // 导出时排除回调函数和组件（这些不能序列化）
    const { callback, displayComponent, ...exportableConfig } = tool.config
    return exportableConfig as AgentToolConfig
  }

  /**
   * 导入Tool配置（用于插件化）
   */
  importToolConfig(config: Partial<AgentToolConfig> & { id: string }): void {
    const logger = createRendererLogger('AgentToolManager')
    // 验证配置
    if (!config.id || !config.name || !config.description || !config.instruction) {
      throw new Error('Tool配置不完整')
    }

    // 如果是MCP tool，需要特殊处理
    if (config.origin === 'mcp' && config.mcpConfig) {
      // MCP tool需要动态加载回调函数
      // 这里可以扩展为MCP客户端实现
      logger.info(`导入MCP Tool: ${config.id}`)
    }

    // 注册Tool（注意：导入的tool需要提供callback，否则无法使用）
    this.registerTool(config as AgentToolConfig)
  }

  /**
   * 获取本地化文本
   * @param text 文本或ToolLocales对象
   * @returns 本地化后的字符串
   */
  getLocalizedText(text: string | ToolLocales): string {
    if (typeof text === 'string') {
      return text
    }
    if (typeof text !== 'object' || text === null) {
      return ''
    }
    
    const currentLocale = String((i18n.global.locale as any).value || 'zh_CN').replace('-', '_').toLowerCase()
    const locales = text as ToolLocales
    
    // 1. 尝试当前语言
    if (locales[currentLocale]) {
      const localeData = locales[currentLocale]
      if (typeof localeData === 'object' && localeData !== null) {
        return localeData.name || localeData.description || ''
      }
    }
    
    // 2. 回退到en_us
    if (locales['en_us']) {
      const localeData = locales['en_us']
      if (typeof localeData === 'object' && localeData !== null) {
        return localeData.name || localeData.description || ''
      }
    }
    
    // 3. 回退到en_US
    if (locales['en_US']) {
      const localeData = locales['en_US']
      if (typeof localeData === 'object' && localeData !== null) {
        return localeData.name || localeData.description || ''
      }
    }
    
    // 4. 尝试其他支持的语言
    const supportedLocales = ['zh_cn', 'de_DE', 'fr_FR', 'ja_JP', 'ko_KR']
    for (const locale of supportedLocales) {
      if (locales[locale]) {
        const localeData = locales[locale]
        if (typeof localeData === 'object' && localeData !== null) {
          return localeData.name || localeData.description || ''
        }
      }
    }
    
    // 5. 返回第一个可用的值
    const values = Object.values(locales)
    if (values.length > 0) {
      const first = values[0]
      if (typeof first === 'object' && first !== null) {
        return first.name || first.description || ''
      }
    }
    
    return ''
  }
}

// 导出单例
export const agentToolManager = new AgentToolManager()

// 自动启动存活检查
if (typeof window !== 'undefined') {
  agentToolManager.startAliveCheck()
}

