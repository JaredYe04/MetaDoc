/**
 * RAG服务遗留代码
 *
 * 此文件包含已废弃的代码：
 * 1. JSON文件存储相关的代码（已迁移到SQLite）
 * 2. 内存ANN搜索算法（LSH + IVF）（已迁移到SQLite向量搜索）
 *
 * 这些代码在迁移到SQLite+vector数据库后不再使用
 * 保留此文件仅用于向后兼容和参考
 *
 * @deprecated 所有数据现在存储在SQLite数据库中，搜索使用SQLite的vec_distance函数
 */

import path from 'path'
import fs from 'fs'
import type {
  FilePath,
  VectorIndexItem,
  VectorDatabaseConfig,
  QueryResult
} from '../../types/utils'

/**
 * 旧的向量数据库配置（使用JSON文件）
 * @deprecated 现在使用SQLite数据库存储
 */
export interface LegacyVectorDatabaseConfig {
  vectorLength: number
  databasePath: FilePath
  indexPath: FilePath // vector_index.json
  docsPath: FilePath // vector_docs.json
  vectorInfoPath: FilePath // vector_info.json
}

/**
 * 获取旧的向量数据库配置
 * @deprecated 现在使用SQLite数据库，不再需要JSON文件路径
 */
export function getLegacyVectorDatabaseConfig(): LegacyVectorDatabaseConfig {
  const os = require('os')
  const vectorDatabasePath = path.join(os.homedir(), 'Documents', 'meta-doc-kb')

  return {
    vectorLength: 768,
    databasePath: vectorDatabasePath,
    indexPath: path.join(vectorDatabasePath, 'vector_index.json'),
    docsPath: path.join(vectorDatabasePath, 'vector_docs.json'),
    vectorInfoPath: path.join(vectorDatabasePath, 'vector_info.json')
  }
}

/**
 * 旧的JSON文件路径常量
 * @deprecated 现在使用SQLite数据库，不再需要这些路径
 */
export const LEGACY_INDEX_PATH = (() => {
  const os = require('os')
  return path.join(os.homedir(), 'Documents', 'meta-doc-kb', 'vector_index.json')
})()

export const LEGACY_DOCS_PATH = (() => {
  const os = require('os')
  return path.join(os.homedir(), 'Documents', 'meta-doc-kb', 'vector_docs.json')
})()

export const LEGACY_VECTOR_INFO_PATH = (() => {
  const os = require('os')
  return path.join(os.homedir(), 'Documents', 'meta-doc-kb', 'vector_info.json')
})()

/**
 * 旧的配置文件列表
 * @deprecated 现在使用SQLite数据库，不再需要这些配置文件
 */
export const LEGACY_CONFIG_FILES = [
  'knowledge_index.json',
  'vector_index.json',
  'vector_docs.json',
  'vector_info.json'
]

/**
 * 旧的倒排索引构建方法（使用简单的哈希桶）
 * @deprecated 现在使用优化的多哈希LSH + IVF算法
 */
export function buildLegacyInvertedIndex(
  vectorIndex: VectorIndexItem[],
  bucketBits: number = 8
): Map<string, VectorIndexItem[]> {
  const invertedIndex = new Map<string, VectorIndexItem[]>()

  for (const item of vectorIndex) {
    // 归一化向量
    const norm = Math.sqrt(item.vector.reduce((sum, x) => sum + x * x, 0))
    if (norm === 0) continue

    const normalizedVec = item.vector.map((x) => x / norm)

    // 量化为桶key
    let bucketKey = ''
    for (let i = 0; i < bucketBits; i++) {
      const v = normalizedVec[i]
      const q = Math.floor(((v + 1) / 2) * 255)
      bucketKey += String.fromCharCode(q)
    }

    if (!invertedIndex.has(bucketKey)) {
      invertedIndex.set(bucketKey, [])
    }
    invertedIndex.get(bucketKey)!.push(item)
  }

  return invertedIndex
}

/**
 * 检查并清理旧的JSON文件（如果存在）
 * @deprecated 仅用于迁移后的清理工作
 */
export function cleanupLegacyJsonFiles(): void {
  const os = require('os')
  const vectorDatabasePath = path.join(os.homedir(), 'Documents', 'meta-doc-kb')

  if (!fs.existsSync(vectorDatabasePath)) {
    return
  }

  const legacyFiles = [
    'knowledge_index.json',
    'vector_index.json',
    'vector_docs.json',
    'vector_info.json'
  ]

  for (const filename of legacyFiles) {
    const filePath = path.join(vectorDatabasePath, filename)
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath)
        console.log(`已删除旧文件: ${filename}`)
      } catch (error) {
        console.warn(`删除旧文件失败: ${filename}`, error)
      }
    }
  }
}

// ============ 旧的ANN搜索算法（已废弃） ============

/**
 * 优化的ANN搜索配置
 * @deprecated 现在使用SQLite的vec_distance函数进行向量搜索
 */
export interface LegacyOptimizedANNConfig {
  numHashFunctions: number
  hashBits: number
  maxCandidates: number
  numClusters: number
  searchClusters: number
}

/**
 * 默认的优化ANN配置
 * @deprecated 现在使用SQLite的vec_distance函数进行向量搜索
 */
export const LEGACY_OPTIMIZED_ANN_CONFIG: LegacyOptimizedANNConfig = {
  numHashFunctions: 3,
  hashBits: 12,
  maxCandidates: 200,
  numClusters: 16,
  searchClusters: 4
}

/**
 * 计算余弦相似度
 * @deprecated 现在使用SQLite的vec_distance函数
 */
export function legacyCosineSimilarity(vecA: readonly number[], vecB: readonly number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i]
    normA += vecA[i] ** 2
    normB += vecB[i] ** 2
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * 暴力搜索（用于小规模数据）
 * @deprecated 现在使用SQLite的vec_distance函数进行向量搜索
 */
export function legacyBruteForceSearch(
  queryEmbedding: readonly number[],
  vectorIndex: VectorIndexItem[],
  docIdToText: Map<string, string>,
  topN: number
): QueryResult[] {
  return vectorIndex
    .map(({ id, vector }) => ({
      id,
      cosSim: legacyCosineSimilarity(queryEmbedding, vector),
      text: docIdToText.get(id) || ''
    }))
    .sort((a, b) => b.cosSim - a.cosSim)
    .slice(0, topN)
}

/**
 * 计算哈希键（使用不同的哈希函数）
 * @deprecated 现在使用SQLite的vec_distance函数进行向量搜索
 */
export function legacyComputeHashKey(
  normalizedVec: number[],
  hashFunc: number,
  hashBits: number
): string {
  const startBit = (hashFunc * hashBits) % normalizedVec.length

  let bucketKey = ''
  for (let i = 0; i < hashBits; i++) {
    const idx = (startBit + i) % normalizedVec.length
    const v = normalizedVec[idx]
    // 将 [-1, 1] 映射到 [0, 255]
    const q = Math.floor(((v + 1) / 2) * 255)
    bucketKey += String.fromCharCode(q)
  }
  return bucketKey
}

/**
 * 使用多哈希LSH获取候选集
 * @deprecated 现在使用SQLite的vec_distance函数进行向量搜索
 */
export function legacyGetLshCandidates(
  normalizedQuery: number[],
  vectorIndex: VectorIndexItem[],
  invertedIndex: Map<string, VectorIndexItem[]>,
  config: LegacyOptimizedANNConfig
): VectorIndexItem[] {
  const candidateSet = new Set<string>()

  // 使用多个哈希函数
  for (let hashFunc = 0; hashFunc < config.numHashFunctions; hashFunc++) {
    const bucketKey = legacyComputeHashKey(normalizedQuery, hashFunc, config.hashBits)
    const candidates = invertedIndex.get(bucketKey) || []

    for (const candidate of candidates) {
      candidateSet.add(candidate.id)
    }
  }

  // 转换为VectorIndexItem数组
  const candidateMap = new Map(vectorIndex.map((item) => [item.id, item]))
  return Array.from(candidateSet)
    .map((id) => candidateMap.get(id))
    .filter((item): item is VectorIndexItem => item !== undefined)
}

/**
 * 快速预排序（使用点积近似）
 * @deprecated 现在使用SQLite的vec_distance函数进行向量搜索
 */
export function legacyQuickPreSort(
  normalizedQuery: number[],
  candidates: VectorIndexItem[]
): VectorIndexItem[] {
  return candidates
    .map((item) => {
      // 快速点积计算（不归一化，用于排序）
      let dot = 0
      const minLen = Math.min(normalizedQuery.length, item.vector.length)
      for (let i = 0; i < minLen; i++) {
        dot += normalizedQuery[i] * item.vector[i]
      }
      return { item, score: dot }
    })
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
}

/**
 * 优化的ANN搜索（多哈希LSH + IVF）
 * @deprecated 现在使用SQLite的vec_distance函数进行向量搜索
 */
export function legacyOptimizedAnnSearch(
  queryEmbedding: readonly number[],
  vectorIndex: VectorIndexItem[],
  docIdToText: Map<string, string>,
  invertedIndex: Map<string, VectorIndexItem[]>,
  clusterCenters: number[][] | null,
  vectorToCluster: Map<string, number>,
  config: LegacyOptimizedANNConfig,
  topN: number
): QueryResult[] {
  // 归一化查询向量
  const norm = Math.sqrt(queryEmbedding.reduce((sum, x) => sum + x * x, 0))
  if (norm === 0) {
    return legacyBruteForceSearch(queryEmbedding, vectorIndex, docIdToText, topN)
  }
  const normalizedQuery = queryEmbedding.map((x) => x / norm)

  // 第一步：使用多哈希LSH获取候选集
  const lshCandidates = legacyGetLshCandidates(normalizedQuery, vectorIndex, invertedIndex, config)

  // 如果LSH候选集为空，回退到暴力搜索
  if (lshCandidates.length === 0) {
    return legacyBruteForceSearch(queryEmbedding, vectorIndex, docIdToText, topN)
  }

  // 第二步：如果使用了IVF，进一步过滤候选集
  let candidates = lshCandidates
  if (clusterCenters && clusterCenters.length > 0) {
    // 找到最相关的聚类
    const clusterScores = clusterCenters.map((center, idx) => {
      let dot = 0
      for (let i = 0; i < Math.min(normalizedQuery.length, center.length); i++) {
        dot += normalizedQuery[i] * center[i]
      }
      return { idx, score: dot }
    })

    clusterScores.sort((a, b) => b.score - a.score)
    const topClusters = new Set(clusterScores.slice(0, config.searchClusters).map((c) => c.idx))

    // 只保留属于这些聚类的候选
    candidates = candidates.filter((item) => {
      const clusterId = vectorToCluster.get(item.id)
      if (clusterId === undefined) {
        return true
      }
      return topClusters.has(clusterId)
    })

    // 如果过滤后候选集为空，使用LSH候选集
    if (candidates.length === 0) {
      candidates = lshCandidates
    }
  }

  // 限制候选数量，避免计算过多相似度
  if (candidates.length > config.maxCandidates) {
    candidates = legacyQuickPreSort(normalizedQuery, candidates).slice(0, config.maxCandidates)
  }

  // 第三步：计算精确相似度并排序
  const results = candidates
    .map(({ id, vector }) => {
      // 归一化候选向量
      const vecNorm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0))
      if (vecNorm === 0) {
        return {
          id,
          cosSim: 0,
          text: docIdToText.get(id) || ''
        }
      }
      const normalizedVec = vector.map((x) => x / vecNorm)

      // 计算点积（归一化后的点积等于余弦相似度）
      let dot = 0
      for (let i = 0; i < normalizedQuery.length; i++) {
        dot += normalizedQuery[i] * normalizedVec[i]
      }

      return {
        id,
        cosSim: dot,
        text: docIdToText.get(id) || ''
      }
    })
    .sort((a, b) => b.cosSim - a.cosSim)
    .slice(0, topN)

  return results
}

/**
 * ANN搜索（主入口）
 * @deprecated 现在使用SQLite的vec_distance函数进行向量搜索
 */
export function legacyAnnSearch(
  queryEmbedding: readonly number[],
  vectorIndex: VectorIndexItem[],
  docIdToText: Map<string, string>,
  invertedIndex: Map<string, VectorIndexItem[]> | null,
  clusterCenters: number[][] | null,
  vectorToCluster: Map<string, number>,
  config: LegacyOptimizedANNConfig,
  topN: number = 30
): QueryResult[] {
  // 过滤维度不匹配的向量
  const queryDim = queryEmbedding.length
  const filteredIndex = vectorIndex.filter((item) => {
    return item.vector.length === queryDim
  })

  if (filteredIndex.length === 0) {
    return []
  }

  // 如果数据量较小，直接使用暴力搜索
  if (filteredIndex.length < 100) {
    return legacyBruteForceSearch(queryEmbedding, filteredIndex, docIdToText, topN)
  }

  // 如果倒排索引不存在，回退到暴力搜索
  if (!invertedIndex) {
    return legacyBruteForceSearch(queryEmbedding, filteredIndex, docIdToText, topN)
  }

  // 使用优化的多级搜索
  return legacyOptimizedAnnSearch(
    queryEmbedding,
    filteredIndex,
    docIdToText,
    invertedIndex,
    clusterCenters,
    vectorToCluster,
    config,
    topN
  )
}

/**
 * JavaScript实现的向量搜索（使用余弦相似度计算）
 * @deprecated 现在使用sqlite-vec虚拟表进行向量搜索
 */
export function legacySearchSimilarVectors(
  queryVector: number[],
  allVectors: Array<{ chunk_id: number; embedding: Buffer; chunk_text: string }>,
  topK: number = 10,
  threshold: number = 0.5
): Array<{ chunkId: number; similarity: number; chunkText: string }> {
  // 归一化查询向量（用于余弦相似度计算）
  const queryNorm = Math.sqrt(queryVector.reduce((sum, x) => sum + x * x, 0))
  if (queryNorm === 0) {
    return []
  }
  const normalizedQuery = queryVector.map((x) => x / queryNorm)

  // 计算所有向量的余弦相似度
  const similarities: Array<{ chunkId: number; similarity: number; chunkText: string }> = []

  for (const vec of allVectors) {
    // 将Buffer转换回Float32Array
    const embeddingArray = new Float32Array(vec.embedding.buffer)
    const embedding = Array.from(embeddingArray)

    // 检查维度是否匹配
    if (embedding.length !== normalizedQuery.length) {
      continue
    }

    // 归一化向量
    const vecNorm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0))
    if (vecNorm === 0) {
      continue
    }
    const normalizedVec = embedding.map((x) => x / vecNorm)

    // 计算余弦相似度（归一化后的点积）
    let dot = 0
    for (let i = 0; i < normalizedQuery.length; i++) {
      dot += normalizedQuery[i] * normalizedVec[i]
    }

    const similarity = dot

    // 只保留超过阈值的结果
    if (similarity >= threshold) {
      similarities.push({
        chunkId: vec.chunk_id,
        similarity,
        chunkText: vec.chunk_text
      })
    }
  }

  // 按相似度排序并返回topK
  const sorted = similarities.sort((a, b) => b.similarity - a.similarity)
  return sorted.slice(0, topK)
}
