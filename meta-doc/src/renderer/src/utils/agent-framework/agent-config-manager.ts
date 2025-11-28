/**
 * Agent配置（AgentConfig）管理器
 * 负责AgentConfig的CRUD操作和持久化
 */

import type { AgentConfig, SerializedEntity } from '../../types/agent-framework'
import type { LocalizedText } from '../../types/agent-tool'
import { createRendererLogger } from '../logger'
import { toolCollectionManager } from './tool-collection-manager'

const logger = createRendererLogger('AgentConfigManager')

/**
 * Agent配置管理器类
 */
class AgentConfigManager {
  private configs: Map<string, AgentConfig> = new Map()
  private readonly STORAGE_KEY = 'agent-configs'

  constructor() {
    this.loadFromStorage()
  }

  /**
   * 创建Agent配置
   */
  createConfig(
    name: LocalizedText,
    description: LocalizedText,
    toolCollectionIds: string[] = []
  ): AgentConfig {
    const id = `agent-config-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
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
      tags: []
    }

    this.configs.set(id, config)
    this.saveToStorage()
    logger.info(`Agent配置已创建: ${id}`)
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
    return Array.from(this.configs.values()).filter(c => c.enabled !== false)
  }

  /**
   * 根据场景获取Agent配置
   */
  getConfigsByScenario(scenario: AgentConfig['scenario']): AgentConfig[] {
    return Array.from(this.configs.values()).filter(
      c => c.scenario === scenario && c.enabled !== false
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
    logger.info(`Agent配置已更新: ${id}`)
  }

  /**
   * 删除Agent配置
   */
  deleteConfig(id: string): void {
    if (!this.configs.has(id)) {
      throw new Error(`Agent配置 ${id} 未找到`)
    }

    this.configs.delete(id)
    this.saveToStorage()
    logger.info(`Agent配置已删除: ${id}`)
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
      logger.warn(`Agent配置导入警告: ${validation.warnings.join(', ')}`)
    }

    const existing = this.configs.get(config.id)

    if (existing && !overwrite) {
      throw new Error(`Agent配置 ${config.id} 已存在，请使用 overwrite=true 覆盖`)
    }

    this.configs.set(config.id, config)
    this.saveToStorage()
    logger.info(`Agent配置已导入: ${config.id}`)
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
            this.configs.set(item.id, item)
          })
          logger.info(`已加载 ${data.length} 个Agent配置`)
        }
      }
    } catch (error) {
      logger.error('加载Agent配置失败:', error)
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
      logger.error('保存Agent配置失败:', error)
    }
  }
}

// 导出单例
export const agentConfigManager = new AgentConfigManager()

