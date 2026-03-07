/**
 * Agent配置（AgentConfig）管理器
 * 负责AgentConfig的CRUD操作和持久化
 */

import type { AgentConfig, SerializedEntity } from '../../types/agent-framework'
import type { LocalizedText } from '../../types/agent-tool'
import { createRendererLogger } from '../logger'
import { toolCollectionManager } from './tool-collection-manager'

/**
 * Agent配置管理器类
 */
class AgentConfigManager {
  private configs: Map<string, AgentConfig> = new Map()
  private readonly STORAGE_KEY = 'agent-configs'
  private logger: ReturnType<typeof createRendererLogger> | null = null

  constructor() {
    // 延迟初始化logger，避免循环依赖
    this.loadFromStorage()
  }

  /**
   * 获取logger（懒加载）
   */
  private getLogger() {
    if (!this.logger) {
      this.logger = createRendererLogger('AgentConfigManager')
    }
    return this.logger
  }

  /**
   * 创建Agent配置
   */
  createConfig(
    name: string | LocalizedText,
    description: string | LocalizedText,
    toolCollectionIds: string[] = []
  ): AgentConfig {
    // 转换为LocalizedText格式
    const nameText: LocalizedText =
      typeof name === 'string' ? { zh_cn: { name }, en_us: { name } } : name
    const descText: LocalizedText =
      typeof description === 'string'
        ? { zh_cn: { description }, en_us: { description } }
        : description
    const id = `agent-config-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const now = Date.now()

    const config: AgentConfig = {
      entityType: 'agent-config',
      id,
      name: nameText,
      description: descText,
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      toolCollectionIds,
      enabled: true,
      tags: []
    }

    this.configs.set(id, config)
    this.saveToStorage()
    this.getLogger().info(`Agent配置已创建: ${id}`)
    return config
  }

  /**
   * 按指定 ID 获取或创建 Agent 配置（用于内置 Subagent 预设）
   */
  getOrCreateConfig(
    id: string,
    name: LocalizedText,
    description: LocalizedText,
    toolCollectionIds: string[],
    options?: { systemPrompt?: string; systemPromptKey?: string; injectTimestamp?: boolean }
  ): AgentConfig {
    const existing = this.configs.get(id)
    if (existing) {
      this.updateConfig(id, {
        name,
        description,
        toolCollectionIds,
        llmConfig: {
          ...existing.llmConfig,
          systemPrompt: options?.systemPrompt ?? existing.llmConfig?.systemPrompt,
          systemPromptKey: options?.systemPromptKey ?? existing.llmConfig?.systemPromptKey,
          injectTimestamp: options?.injectTimestamp ?? existing.llmConfig?.injectTimestamp
        },
        updatedAt: Date.now()
      })
      return this.configs.get(id)!
    }
    const now = Date.now()
    const config: AgentConfig = {
      entityType: 'agent-config',
      id,
      name,
      description,
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      toolCollectionIds,
      enabled: true,
      tags: [],
      isSubagent: true,
      llmConfig: {
        systemPromptKey: options?.systemPromptKey,
        systemPrompt: options?.systemPrompt,
        injectTimestamp: options?.injectTimestamp ?? true
      }
    }
    this.configs.set(id, config)
    this.saveToStorage()
    this.getLogger().info(`Agent配置已创建(预设 Subagent): ${id}`)
    return config
  }

  /**
   * 获取Agent配置
   */
  getConfig(id: string): AgentConfig | undefined {
    return this.configs.get(id)
  }

  /**
   * 获取所有Agent配置
   */
  getAllConfigs(): AgentConfig[] {
    return Array.from(this.configs.values())
  }

  /**
   * 获取启用的Agent配置
   */
  getEnabledConfigs(): AgentConfig[] {
    return Array.from(this.configs.values()).filter((c) => c.enabled !== false)
  }

  /**
   * 获取所有标记为 Subagent 的配置（供主 Agent 作为工具调用）
   */
  getSubagentConfigs(): AgentConfig[] {
    return Array.from(this.configs.values()).filter(
      (c) => c.enabled !== false && (c as any).isSubagent === true
    )
  }

  /**
   * 根据场景获取Agent配置
   */
  getConfigsByScenario(scenario: AgentConfig['scenario']): AgentConfig[] {
    return Array.from(this.configs.values()).filter(
      (c) => c.scenario === scenario && c.enabled !== false
    )
  }

  /**
   * 更新Agent配置
   */
  updateConfig(id: string, updates: Partial<AgentConfig>): void {
    const config = this.configs.get(id)
    if (!config) {
      throw new Error(`Agent配置 ${id} 未找到`)
    }

    const updated: AgentConfig = {
      ...config,
      ...updates,
      id, // 不允许修改ID
      entityType: 'agent-config', // 不允许修改类型
      updatedAt: Date.now()
    }

    this.configs.set(id, updated)
    this.saveToStorage()
    this.getLogger().info(`Agent配置已更新: ${id}`)
  }

  /**
   * 删除Agent配置
   */
  deleteConfig(id: string): void {
    if (!this.configs.has(id)) {
      throw new Error(`Agent配置 ${id} 未找到`)
    }

    // 检查是否是默认配置
    if (id === 'default-agent-config') {
      throw new Error('不能删除默认Agent配置')
    }

    this.configs.delete(id)
    this.saveToStorage()
    this.getLogger().info(`Agent配置已删除: ${id}`)
  }

  /**
   * 初始化默认Agent配置
   */
  initializeDefaultAgentConfig(
    defaultToolCollectionId: string,
    additionalToolCollectionIds: string[] = []
  ): void {
    const defaultId = 'default-agent-config'

    // 合并所有工具集ID
    const allToolCollectionIds = [defaultToolCollectionId, ...additionalToolCollectionIds].filter(
      Boolean
    )

    // 检查是否已存在
    if (this.configs.has(defaultId)) {
      // 更新工具集列表，并确保默认配置不是 Subagent
      const existingConfig = this.configs.get(defaultId)!
      const existingIds = existingConfig.toolCollectionIds || []
      // 合并现有的和新的工具集ID，去重
      const mergedIds = Array.from(new Set([...existingIds, ...allToolCollectionIds]))
      this.updateConfig(defaultId, {
        isSubagent: false,
        toolCollectionIds: mergedIds,
        name: {
          zh_cn: { name: '默认Agent配置' },
          en_us: { name: 'Default Agent Config' }
        },
        description: {
          zh_cn: {
            description:
              'MetaDoc默认Agent配置。MetaDoc是一个专业的AI写作助手，高效地使用所含的AI工具，为用户生成图文并茂、内容充实丰富的、专业的、多领域的文章。该配置定义了MetaDoc的核心职责和工作方式，包括理解用户需求、检索知识、生成可视化内容、优化文档结构、确保内容质量等能力。'
          },
          en_us: {
            description:
              "Default MetaDoc Agent config. MetaDoc is a professional AI writing assistant that efficiently uses AI tools to generate well-illustrated, rich, professional, multi-domain articles for users. This config defines MetaDoc's core responsibilities and working methods, including understanding user needs, retrieving knowledge, generating visualizations, optimizing document structure, and ensuring content quality."
          }
        },
        llmConfig: {
          systemPromptKey: 'agent.default.systemPrompt',
          injectTimestamp: true
        },
        maxToolCalls: null // 无限制
      })
      return
    }

    // 创建默认Agent配置（主 Agent，非 Subagent）
    const defaultConfig: AgentConfig = {
      entityType: 'agent-config',
      id: defaultId,
      isSubagent: false,
      name: {
        zh_cn: { name: '默认Agent配置' },
        en_us: { name: 'Default Agent Config' }
      },
      description: {
        zh_cn: {
          description:
            'MetaDoc默认Agent配置。MetaDoc是一个专业的AI写作助手，高效地使用所含的AI工具，为用户生成图文并茂、内容充实丰富的、专业的、多领域的文章。该配置定义了MetaDoc的核心职责和工作方式，包括理解用户需求、检索知识、生成可视化内容、优化文档结构、确保内容质量等能力。'
        },
        en_us: {
          description:
            "Default MetaDoc Agent config. MetaDoc is a professional AI writing assistant that efficiently uses AI tools to generate well-illustrated, rich, professional, multi-domain articles for users. This config defines MetaDoc's core responsibilities and working methods, including understanding user needs, retrieving knowledge, generating visualizations, optimizing document structure, and ensuring content quality."
        }
      },
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      toolCollectionIds: allToolCollectionIds,
      enabled: true,
      tags: ['default', 'built-in'],
      maxToolCalls: null, // 无限制（null表示无限制）
      llmConfig: {
        systemPromptKey: 'agent.default.systemPrompt',
        injectTimestamp: true
      }
    }

    this.configs.set(defaultId, defaultConfig)
    this.saveToStorage()
    this.getLogger().info('默认Agent配置已初始化')
  }

  /**
   * 获取Agent配置可用的工具ID列表（取工具集的交集）
   */
  getAvailableToolIds(configId: string): string[] {
    const config = this.configs.get(configId)
    if (!config) {
      return []
    }

    return toolCollectionManager.getToolIdsFromCollections(config.toolCollectionIds)
  }

  /**
   * 验证Agent配置
   */
  validateConfig(config: AgentConfig): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = []
    const warnings: string[] = []

    // 检查工具集是否存在
    for (const collectionId of config.toolCollectionIds) {
      const collection = toolCollectionManager.getCollection(collectionId)
      if (!collection) {
        errors.push(`工具集 ${collectionId} 不存在`)
      } else if (collection.enabled === false) {
        warnings.push(`工具集 ${collectionId} 已禁用`)
      }
    }

    // 检查是否有可用的工具
    const availableToolIds = this.getAvailableToolIds(config.id)
    if (availableToolIds.length === 0 && config.toolCollectionIds.length > 0) {
      warnings.push('没有可用的工具（工具集交集为空）')
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * 导出Agent配置
   */
  exportConfig(id: string, includeDependencies = false): SerializedEntity | null {
    const config = this.configs.get(id)
    if (!config) {
      return null
    }

    const entity: SerializedEntity = {
      entityType: 'agent-config',
      data: JSON.parse(JSON.stringify(config)),
      exportedAt: Date.now(),
      exportVersion: '1.0.0'
    }

    if (includeDependencies) {
      const dependencies: SerializedEntity[] = []

      // 收集依赖的工具集
      for (const collectionId of config.toolCollectionIds) {
        const collection = toolCollectionManager.getCollection(collectionId)
        if (collection) {
          const collectionEntity = toolCollectionManager.exportCollection(collectionId, false)
          if (collectionEntity) {
            dependencies.push(collectionEntity)
          }
        }
      }

      entity.dependencies = dependencies
    }

    return entity
  }

  /**
   * 导入Agent配置
   */
  importConfig(entity: SerializedEntity, overwrite = false): AgentConfig {
    if (entity.entityType !== 'agent-config') {
      throw new Error('实体类型不匹配，期望 agent-config')
    }

    const config = entity.data as AgentConfig

    // 验证配置
    const validation = this.validateConfig(config)
    if (!validation.valid) {
      throw new Error(`Agent配置验证失败: ${validation.errors.join(', ')}`)
    }

    if (validation.warnings.length > 0) {
      this.getLogger().warn(`Agent配置导入警告: ${validation.warnings.join(', ')}`)
    }

    const existing = this.configs.get(config.id)

    if (existing && !overwrite) {
      throw new Error(`Agent配置 ${config.id} 已存在，请使用 overwrite=true 覆盖`)
    }

    this.configs.set(config.id, config)
    this.saveToStorage()
    this.getLogger().info(`Agent配置已导入: ${config.id}`)
    return config
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
          data.forEach((item: AgentConfig) => {
            // 迁移：旧数据无 isSubagent，默认配置为 false，其它保持原样
            if ((item as any).isSubagent === undefined) {
              ;(item as any).isSubagent = item.id === 'default-agent-config' ? false : false
            }
            this.configs.set(item.id, item)
          })
          // 延迟记录日志，避免在构造函数中初始化logger
          if (this.logger) {
            this.logger.info(`已加载 ${data.length} 个Agent配置`)
          }
        }
      }
    } catch (error) {
      // 延迟记录日志，避免在构造函数中初始化logger
      if (this.logger) {
        this.logger.error('加载Agent配置失败:', error)
      } else {
        console.error('加载Agent配置失败:', error)
      }
    }
  }

  /**
   * 保存到本地存储
   */
  private saveToStorage(): void {
    try {
      const data = Array.from(this.configs.values())
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      // 延迟记录日志，避免在构造函数中初始化logger
      if (this.logger) {
        this.logger.error('保存Agent配置失败:', error)
      } else {
        console.error('保存Agent配置失败:', error)
      }
    }
  }
}

// 导出单例
export const agentConfigManager = new AgentConfigManager()
