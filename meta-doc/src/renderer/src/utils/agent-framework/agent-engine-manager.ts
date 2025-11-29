/**
 * AgentEngine（智能体引擎）管理器
 * 负责AgentEngine的CRUD操作和持久化
 */

import type { AgentEngine, SerializedEntity, EngineType, LlmConfigMode, CustomLlmConfig, EngineInterceptor } from '../../types/agent-framework'
import type { LocalizedText } from '../../types/agent-tool'
import { createRendererLogger } from '../logger'

/**
 * AgentEngine 管理器类
 */
class AgentEngineManager {
  private engines: Map<string, AgentEngine> = new Map()
  private readonly STORAGE_KEY = 'agent-engines'
  private logger: ReturnType<typeof createRendererLogger> | null = null

  constructor() {
    this.loadFromStorage()
    this.initializeBuiltInEngines()
  }

  /**
   * 获取logger（懒加载）
   */
  private getLogger() {
    if (!this.logger) {
      this.logger = createRendererLogger('AgentEngineManager')
    }
    return this.logger
  }

  /**
   * 初始化内置引擎
   */
  private initializeBuiltInEngines(): void {
    // 检查是否已存在内置引擎，避免重复创建
    const builtInIds = [
      'default-autogpt-engine',
      'default-react-engine',
      'default-plan-execute-engine',
      'default-simple-chat-engine',
      'default-workflow-engine'
    ]

    let needsInit = false
    for (const id of builtInIds) {
      if (!this.engines.has(id)) {
        needsInit = true
        break
      }
    }

    if (!needsInit) {
      return
    }

    // AutoGPT 引擎（默认）
    this.createBuiltInEngine(
      'default-autogpt-engine',
      'AutoGPT 引擎',
      'Default AutoGPT Engine',
      'AutoGPT 范式：计划→执行→反思循环，自主决策，适合多数智能任务',
      'AutoGPT paradigm: Planning → Execution → Reflection loop, autonomous decision-making, suitable for most intelligent tasks',
      'autogpt',
      {
        maxIterations: 10,
        enableReflection: true,
        enablePlanning: true
      }
    )

    // ReAct 引擎
    this.createBuiltInEngine(
      'default-react-engine',
      'ReAct 引擎',
      'Default ReAct Engine',
      'ReAct 范式：推理+行动模式，Observation 驱动',
      'ReAct paradigm: Reasoning + Acting mode, Observation-driven',
      'react',
      {
        thinkingDepth: 5
      }
    )

    // Plan-Execute 引擎
    this.createBuiltInEngine(
      'default-plan-execute-engine',
      'Plan-Execute 引擎',
      'Default Plan-Execute Engine',
      'Plan-Execute 范式：先生成计划，再逐项执行',
      'Plan-Execute paradigm: Generate plan first, then execute step by step',
      'plan-execute',
      {
        enablePlanning: true
      }
    )

    // Simple Chat 引擎
    this.createBuiltInEngine(
      'default-simple-chat-engine',
      'Simple Chat 引擎',
      'Default Simple Chat Engine',
      'Simple Chat 范式：轻量对话，适合无工具任务',
      'Simple Chat paradigm: Lightweight conversation, suitable for tool-free tasks',
      'simple-chat',
      {}
    )

    // Workflow 引擎
    this.createBuiltInEngine(
      'default-workflow-engine',
      'Workflow 引擎',
      'Default Workflow Engine',
      'Workflow 范式：专为执行 Workflow 这个 tool 而设计',
      'Workflow paradigm: Designed specifically for executing Workflow tools',
      'workflow',
      {}
    )

    this.saveToStorage()
  }

  /**
   * 创建内置引擎
   */
  private createBuiltInEngine(
    id: string,
    nameZh: string,
    nameEn: string,
    descZh: string,
    descEn: string,
    engineType: EngineType,
    engineConfig: Record<string, unknown> = {}
  ): void {
    const engine: AgentEngine = {
      entityType: 'agent-engine',
      id,
      name: {
        'zh_cn': { name: nameZh },
        'en_us': { name: nameEn }
      },
      description: {
        'zh_cn': { description: descZh },
        'en_us': { description: descEn }
      },
      engineType,
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      llmConfigMode: 'global',
      engineConfig,
      interceptors: [],
      enabled: true,
      tags: ['built-in', 'default'],
      isBuiltIn: true
    }

    this.engines.set(id, engine)
  }

  /**
   * 创建引擎
   */
  createEngine(
    name: string | LocalizedText,
    description: string | LocalizedText,
    engineType: EngineType,
    llmConfigMode: LlmConfigMode = 'global',
    customLlmConfig?: CustomLlmConfig
  ): AgentEngine {
    const nameText: LocalizedText = typeof name === 'string'
      ? { 'zh_cn': { name }, 'en_us': { name } }
      : name
    const descText: LocalizedText = typeof description === 'string'
      ? { 'zh_cn': { description }, 'en_us': { description } }
      : description

    const id = `agent-engine-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const now = Date.now()

    const engine: AgentEngine = {
      entityType: 'agent-engine',
      id,
      name: nameText,
      description: descText,
      engineType,
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      llmConfigMode,
      customLlmConfig,
      enabled: true,
      tags: [],
      isBuiltIn: false
    }

    this.engines.set(id, engine)
    this.saveToStorage()
    this.getLogger().info(`Agent引擎已创建: ${id}`)
    return engine
  }

  /**
   * 获取引擎
   */
  getEngine(id: string): AgentEngine | undefined {
    return this.engines.get(id)
  }

  /**
   * 获取所有引擎
   */
  getAllEngines(): AgentEngine[] {
    return Array.from(this.engines.values())
  }

  /**
   * 获取启用的引擎
   */
  getEnabledEngines(): AgentEngine[] {
    return Array.from(this.engines.values()).filter(e => e.enabled !== false)
  }

  /**
   * 根据类型获取引擎
   */
  getEnginesByType(engineType: EngineType): AgentEngine[] {
    return Array.from(this.engines.values()).filter(
      e => e.engineType === engineType && e.enabled !== false
    )
  }

  /**
   * 获取默认引擎（AutoGPT）
   */
  getDefaultEngine(): AgentEngine | undefined {
    return this.getEngine('default-autogpt-engine')
  }

  /**
   * 更新引擎
   */
  updateEngine(id: string, updates: Partial<AgentEngine>): void {
    const engine = this.engines.get(id)
    if (!engine) {
      throw new Error(`Agent引擎 ${id} 未找到`)
    }

    if (engine.isBuiltIn) {
      // 内置引擎只允许修改部分配置
      const allowedUpdates: (keyof AgentEngine)[] = [
        'llmConfigMode',
        'customLlmConfig',
        'engineConfig',
        'interceptors',
        'enabled',
        'updatedAt'
      ]
      const invalidKeys = Object.keys(updates).filter(
        key => !allowedUpdates.includes(key as keyof AgentEngine)
      )
      if (invalidKeys.length > 0) {
        throw new Error(`内置引擎不允许修改: ${invalidKeys.join(', ')}`)
      }
    }

    const updated: AgentEngine = {
      ...engine,
      ...updates,
      id, // 不允许修改ID
      entityType: 'agent-engine', // 不允许修改类型
      isBuiltIn: engine.isBuiltIn, // 不允许修改内置标识
      updatedAt: Date.now()
    }

    this.engines.set(id, updated)
    this.saveToStorage()
    this.getLogger().info(`Agent引擎已更新: ${id}`)
  }

  /**
   * 删除引擎
   */
  deleteEngine(id: string): void {
    const engine = this.engines.get(id)
    if (!engine) {
      throw new Error(`Agent引擎 ${id} 未找到`)
    }

    if (engine.isBuiltIn) {
      throw new Error('不能删除内置引擎')
    }

    this.engines.delete(id)
    this.saveToStorage()
    this.getLogger().info(`Agent引擎已删除: ${id}`)
  }

  /**
   * 验证引擎
   */
  validateEngine(engine: AgentEngine): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = []
    const warnings: string[] = []

    // 检查 LLM 配置
    if (engine.llmConfigMode === 'custom') {
      if (!engine.customLlmConfig) {
        errors.push('自定义 LLM 配置模式下必须提供 customLlmConfig')
      } else {
        if (!engine.customLlmConfig.baseUrl) {
          errors.push('自定义 LLM 配置必须提供 baseUrl')
        }
        if (!engine.customLlmConfig.apiKey) {
          errors.push('自定义 LLM 配置必须提供 apiKey')
        }
        if (!engine.customLlmConfig.model) {
          errors.push('自定义 LLM 配置必须提供 model')
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * 导出引擎
   */
  exportEngine(id: string): SerializedEntity | null {
    const engine = this.engines.get(id)
    if (!engine) {
      return null
    }

    return {
      entityType: 'agent-engine',
      data: JSON.parse(JSON.stringify(engine)),
      exportedAt: Date.now(),
      exportVersion: '1.0.0'
    }
  }

  /**
   * 导入引擎
   */
  importEngine(entity: SerializedEntity, overwrite = false): AgentEngine {
    if (entity.entityType !== 'agent-engine') {
      throw new Error('实体类型不匹配，期望 agent-engine')
    }

    const engine = entity.data as AgentEngine

    // 验证引擎
    const validation = this.validateEngine(engine)
    if (!validation.valid) {
      throw new Error(`Agent引擎验证失败: ${validation.errors.join(', ')}`)
    }

    if (validation.warnings.length > 0) {
      this.getLogger().warn(`Agent引擎导入警告: ${validation.warnings.join(', ')}`)
    }

    const existing = this.engines.get(engine.id)

    if (existing && !overwrite) {
      throw new Error(`Agent引擎 ${engine.id} 已存在，请使用 overwrite=true 覆盖`)
    }

    // 不允许导入内置引擎
    if (engine.isBuiltIn) {
      throw new Error('不允许导入内置引擎')
    }

    // 移除内置标识
    engine.isBuiltIn = false

    this.engines.set(engine.id, engine)
    this.saveToStorage()
    this.getLogger().info(`Agent引擎已导入: ${engine.id}`)
    return engine
  }

  /**
   * 从本地存储加载
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      if (stored) {
        const data = JSON.parse(stored)
        if (Array.isArray(data)) {
          data.forEach((item: AgentEngine) => {
            this.engines.set(item.id, item)
          })
          if (this.logger) {
            this.getLogger().info(`已加载 ${data.length} 个Agent引擎`)
          }
        }
      }
    } catch (error) {
      if (this.logger) {
        this.getLogger().error('加载Agent引擎失败:', error)
      } else {
        console.error('加载Agent引擎失败:', error)
      }
    }
  }

  /**
   * 保存到本地存储
   */
  private saveToStorage(): void {
    try {
      const data = Array.from(this.engines.values())
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      if (this.logger) {
        this.getLogger().error('保存Agent引擎失败:', error)
      } else {
        console.error('保存Agent引擎失败:', error)
      }
    }
  }
}

// 导出单例
export const agentEngineManager = new AgentEngineManager()

