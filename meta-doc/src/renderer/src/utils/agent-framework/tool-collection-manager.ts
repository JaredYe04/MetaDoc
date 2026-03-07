/**
 * 工具集（ToolCollection）管理器
 * 负责工具集的CRUD操作和持久化
 */

import type { ToolCollection, SerializedEntity } from '../../types/agent-framework'
import type { LocalizedText } from '../../types/agent-tool'
import { createRendererLogger } from '../logger'

/**
 * 工具集管理器类
 */
class ToolCollectionManager {
  private collections: Map<string, ToolCollection> = new Map()
  private readonly STORAGE_KEY = 'agent-tool-collections'
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
      this.logger = createRendererLogger('ToolCollectionManager')
    }
    return this.logger
  }

  /**
   * 按指定 ID 获取或创建工具集（用于内置/预设集合，如 Subagent 专用工具集）
   */
  getOrCreateCollection(
    id: string,
    name: LocalizedText,
    description: LocalizedText,
    toolIds: string[] = []
  ): ToolCollection {
    const existing = this.collections.get(id)
    if (existing) {
      this.updateCollection(id, { toolIds, name, description, updatedAt: Date.now() })
      return this.collections.get(id)!
    }
    const now = Date.now()
    const collection: ToolCollection = {
      entityType: 'tool-collection',
      id,
      name,
      description,
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      toolIds,
      enabled: true,
      tags: []
    }
    this.collections.set(id, collection)
    this.saveToStorage()
    this.getLogger().info(`工具集已创建(预设): ${id}`)
    return collection
  }

  /**
   * 创建工具集
   */
  createCollection(
    name: LocalizedText,
    description: LocalizedText,
    toolIds: string[] = []
  ): ToolCollection {
    const id = `tool-collection-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const now = Date.now()

    const collection: ToolCollection = {
      entityType: 'tool-collection',
      id,
      name,
      description,
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      toolIds,
      enabled: true,
      tags: []
    }

    this.collections.set(id, collection)
    this.saveToStorage()
    this.getLogger().info(`工具集已创建: ${id}`)
    return collection
  }

  /**
   * 获取工具集
   */
  getCollection(id: string): ToolCollection | undefined {
    return this.collections.get(id)
  }

  /**
   * 获取所有工具集
   */
  getAllCollections(): ToolCollection[] {
    return Array.from(this.collections.values())
  }

  /**
   * 获取启用的工具集
   */
  getEnabledCollections(): ToolCollection[] {
    return Array.from(this.collections.values()).filter((c) => c.enabled !== false)
  }

  /**
   * 更新工具集
   */
  updateCollection(id: string, updates: Partial<ToolCollection>): void {
    const collection = this.collections.get(id)
    if (!collection) {
      throw new Error(`工具集 ${id} 未找到`)
    }

    const updated: ToolCollection = {
      ...collection,
      ...updates,
      id, // 不允许修改ID
      entityType: 'tool-collection', // 不允许修改类型
      updatedAt: Date.now()
    }

    this.collections.set(id, updated)
    this.saveToStorage()
    this.getLogger().info(`工具集已更新: ${id}`)
  }

  /**
   * 删除工具集
   */
  deleteCollection(id: string): void {
    if (!this.collections.has(id)) {
      throw new Error(`工具集 ${id} 未找到`)
    }

    // 检查是否是内置工具集
    const collection = this.collections.get(id)
    if (collection && collection.isBuiltIn) {
      throw new Error(`工具集 ${id} 是内置工具集，不能删除`)
    }

    this.collections.delete(id)
    this.saveToStorage()
    this.getLogger().info(`工具集已删除: ${id}`)
  }

  /**
   * 添加工具到工具集
   */
  addToolToCollection(collectionId: string, toolId: string): void {
    const collection = this.collections.get(collectionId)
    if (!collection) {
      throw new Error(`工具集 ${collectionId} 未找到`)
    }

    if (!collection.toolIds.includes(toolId)) {
      collection.toolIds.push(toolId)
      this.updateCollection(collectionId, { toolIds: collection.toolIds })
    }
  }

  /**
   * 从工具集移除工具
   */
  removeToolFromCollection(collectionId: string, toolId: string): void {
    const collection = this.collections.get(collectionId)
    if (!collection) {
      throw new Error(`工具集 ${collectionId} 未找到`)
    }

    collection.toolIds = collection.toolIds.filter((id) => id !== toolId)
    this.updateCollection(collectionId, { toolIds: collection.toolIds })
  }

  /**
   * 获取工具集的工具ID列表（取并集，如果有多个工具集）
   */
  getToolIdsFromCollections(collectionIds: string[]): string[] {
    if (collectionIds.length === 0) {
      return []
    }

    const collections = collectionIds
      .map((id) => this.collections.get(id))
      .filter((c): c is ToolCollection => c !== undefined && c.enabled !== false)

    if (collections.length === 0) {
      return []
    }

    // 取并集（合并所有工具集的工具ID，去重）
    const result = new Set<string>()
    for (const collection of collections) {
      for (const toolId of collection.toolIds) {
        result.add(toolId)
      }
    }

    return Array.from(result)
  }

  /**
   * 导出工具集
   */
  exportCollection(id: string, includeDependencies = false): SerializedEntity | null {
    const collection = this.collections.get(id)
    if (!collection) {
      return null
    }

    const entity: SerializedEntity = {
      entityType: 'tool-collection',
      data: JSON.parse(JSON.stringify(collection)),
      exportedAt: Date.now(),
      exportVersion: '1.0.0'
    }

    if (includeDependencies) {
      // 可以在这里添加依赖的工具集、工作流等
      entity.dependencies = []
    }

    return entity
  }

  /**
   * 导入工具集
   */
  importCollection(entity: SerializedEntity, overwrite = false): ToolCollection {
    if (entity.entityType !== 'tool-collection') {
      throw new Error('实体类型不匹配，期望 tool-collection')
    }

    const collection = entity.data as ToolCollection
    const existing = this.collections.get(collection.id)

    if (existing && !overwrite) {
      throw new Error(`工具集 ${collection.id} 已存在，请使用 overwrite=true 覆盖`)
    }

    this.collections.set(collection.id, collection)
    this.saveToStorage()
    this.getLogger().info(`工具集已导入: ${collection.id}`)
    return collection
  }

  /**
   * 初始化默认工具集
   */
  initializeDefaultToolSet(allToolIds: string[]): void {
    const defaultId = 'default-tool-set'

    // 检查是否已存在
    if (this.collections.has(defaultId)) {
      // 更新工具列表（确保包含所有内置tool）
      this.updateCollection(defaultId, {
        toolIds: allToolIds,
        name: {
          zh_cn: { name: '默认工具集' },
          en_us: { name: 'Default Tool Set' }
        },
        description: {
          zh_cn: { description: 'MetaDoc内置的全部Agent工具，不可删除' },
          en_us: { description: 'All built-in MetaDoc Agent tools, cannot be deleted' }
        }
      })
      return
    }

    // 创建默认工具集
    const defaultCollection: ToolCollection = {
      entityType: 'tool-collection',
      id: defaultId,
      name: {
        zh_cn: { name: '默认工具集' },
        en_us: { name: 'Default Tool Set' }
      },
      description: {
        zh_cn: { description: 'MetaDoc内置的全部Agent工具，不可删除' },
        en_us: { description: 'All built-in MetaDoc Agent tools, cannot be deleted' }
      },
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      toolIds: allToolIds,
      enabled: true,
      tags: ['default', 'built-in'],
      isBuiltIn: true
    }

    this.collections.set(defaultId, defaultCollection)
    this.saveToStorage()
    this.getLogger().info('默认工具集已初始化')
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
          data.forEach((item: ToolCollection) => {
            this.collections.set(item.id, item)
          })
          // 延迟记录日志，避免在构造函数中初始化logger
          if (this.logger) {
            this.logger.info(`已加载 ${data.length} 个工具集`)
          }
        }
      }
    } catch (error) {
      // 延迟记录日志，避免在构造函数中初始化logger
      if (this.logger) {
        this.logger.error('加载工具集失败:', error)
      } else {
        console.error('加载工具集失败:', error)
      }
    }
  }

  /**
   * 保存到本地存储
   */
  private saveToStorage(): void {
    try {
      const data = Array.from(this.collections.values())
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      // 延迟记录日志，避免在构造函数中初始化logger
      if (this.logger) {
        this.logger.error('保存工具集失败:', error)
      } else {
        console.error('保存工具集失败:', error)
      }
    }
  }
}

// 导出单例
export const toolCollectionManager = new ToolCollectionManager()
