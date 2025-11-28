/**
 * 工具集（ToolCollection）管理器
 * 负责工具集的CRUD操作和持久化
 */

import type { ToolCollection, SerializedEntity } from '../../types/agent-framework'
import type { LocalizedText } from '../../types/agent-tool'
import { createRendererLogger } from '../logger'

const logger = createRendererLogger('ToolCollectionManager')

/**
 * 工具集管理器类
 */
class ToolCollectionManager {
  private collections: Map<string, ToolCollection> = new Map()
  private readonly STORAGE_KEY = 'agent-tool-collections'

  constructor() {
    this.loadFromStorage()
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
    logger.info(`工具集已创建: ${id}`)
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
    return Array.from(this.collections.values()).filter(c => c.enabled !== false)
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
    logger.info(`工具集已更新: ${id}`)
  }

  /**
   * 删除工具集
   */
  deleteCollection(id: string): void {
    if (!this.collections.has(id)) {
      throw new Error(`工具集 ${id} 未找到`)
    }

    this.collections.delete(id)
    this.saveToStorage()
    logger.info(`工具集已删除: ${id}`)
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

    collection.toolIds = collection.toolIds.filter(id => id !== toolId)
    this.updateCollection(collectionId, { toolIds: collection.toolIds })
  }

  /**
   * 获取工具集的工具ID列表（取交集，如果有多个工具集）
   */
  getToolIdsFromCollections(collectionIds: string[]): string[] {
    if (collectionIds.length === 0) {
      return []
    }

    const collections = collectionIds
      .map(id => this.collections.get(id))
      .filter((c): c is ToolCollection => c !== undefined && c.enabled !== false)

    if (collections.length === 0) {
      return []
    }

    // 取交集
    let result = new Set(collections[0].toolIds)
    for (let i = 1; i < collections.length; i++) {
      const currentSet = new Set(collections[i].toolIds)
      result = new Set([...result].filter(id => currentSet.has(id)))
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
    logger.info(`工具集已导入: ${collection.id}`)
    return collection
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
          logger.info(`已加载 ${data.length} 个工具集`)
        }
      }
    } catch (error) {
      logger.error('加载工具集失败:', error)
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
      logger.error('保存工具集失败:', error)
    }
  }
}

// 导出单例
export const toolCollectionManager = new ToolCollectionManager()

