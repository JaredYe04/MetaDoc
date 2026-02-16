/**
 * Express 服务器遗留代码
 *
 * 此文件包含已废弃的知识库JSON文件相关的代码
 * 这些代码在迁移到SQLite+vector数据库后不再使用
 * 保留此文件仅用于向后兼容和参考
 *
 * @deprecated 所有数据现在存储在SQLite数据库中，不再使用JSON文件
 */

import type { KnowledgeItem } from '../../types/utils'

/**
 * 旧的配置文件列表（不应出现在知识库列表中）
 * @deprecated 现在使用SQLite数据库，这些JSON文件已不再使用
 */
export const LEGACY_CONFIG_FILES = [
  'knowledge_index.json',
  'vector_index.json',
  'vector_docs.json',
  'vector_info.json'
]

/**
 * 加载知识库索引文件（已废弃，现在从数据库读取）
 * @deprecated 现在使用SQLite数据库，不再使用JSON文件
 * 保留此函数以保持向后兼容性，但不再使用
 */
export function loadLegacyKnowledgeIndex(): Record<string, KnowledgeItem> {
  // 不再使用 JSON 文件，所有数据从数据库读取
  return {}
}

/**
 * 保存知识库索引文件（已废弃，现在使用数据库存储）
 * @deprecated 现在使用SQLite数据库，不再使用JSON文件
 * 保留此函数以保持向后兼容性，但不再执行任何操作
 */
export function saveLegacyKnowledgeIndex(index: Record<string, KnowledgeItem>): void {
  // 不再使用 JSON 文件，所有数据存储在数据库中
  // 此函数保留为空实现以保持向后兼容性
}

/**
 * 更新索引文件中的向量信息（旧实现）
 * @deprecated 现在直接更新数据库，不再使用JSON文件
 */
export function updateLegacyIndexVectorInfo(
  fileName: string,
  vectorInfo: { chunks: number; vector_dim: number; vector_count: number }
): void {
  // 旧实现：更新JSON文件中的向量信息
  // 新实现：直接更新数据库（在 knowledge-db.ts 中）
  // 此函数保留为空实现以保持向后兼容性
}
