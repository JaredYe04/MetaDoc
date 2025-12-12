/**
 * 知识库数据库访问层
 * 提供知识库相关的数据库操作接口
 */

import { getDatabase, query, queryOne, execute, transaction, tableExists, initializeDatabase, isSqliteVecAvailable } from './database';
import { getAllDDLStatements, getVec0DDLStatements } from './schemas';
import { runMigrations as runDatabaseMigrations, initializeMigrationSystem } from './migration';
import { createMainLogger } from '../logger';
import type { FilePath } from '../../types/utils';

const logger = createMainLogger('KnowledgeDB');

// 初始化数据库表结构
let initialized = false;

export function ensureInitialized(): void {
  if (initialized) {
    return;
  }

  try {
    // 初始化迁移系统（创建 _migrations 表）
    initializeMigrationSystem();
    
    // 检查表是否存在，如果不存在则初始化
    if (!tableExists('knowledge_files')) {
      logger.info('检测到数据库未初始化，开始创建表结构');
      
      // 使用迁移系统执行初始迁移
      // 初始迁移会创建所有基础表结构
      runDatabaseMigrations();
      
      // 如果sqlite-vec可用，创建虚拟表
      if (isSqliteVecAvailable()) {
        try {
          const vec0DDL = getVec0DDLStatements();
          const db = getDatabase();
          for (const ddl of vec0DDL) {
            db.exec(ddl);
          }
          logger.info('sqlite-vec虚拟表创建成功');
        } catch (error) {
          logger.warn('创建sqlite-vec虚拟表失败，向量搜索将使用JavaScript计算', error as Error);
        }
      } else {
        logger.info('sqlite-vec扩展不可用，向量搜索将使用JavaScript计算余弦相似度');
      }
      
      initialized = true;
      logger.info('数据库初始化完成');
    } else {
      // 表已存在，执行待执行的迁移
      logger.info('数据库表已存在，检查并执行待执行的迁移');
      runDatabaseMigrations();
      initialized = true;
    }
  } catch (error) {
    logger.error('数据库初始化失败', error as Error);
    throw error;
  }
}

/**
 * 知识库文件信息
 */
export interface KnowledgeFile {
  id: number;
  filename: string;
  original_path: string;
  format: string | null;
  enabled: number; // SQLite使用INTEGER存储布尔值，1=true, 0=false
  chunks: number;
  vector_dim: number;
  vector_count: number;
  origin: string;
  created_at: string;
  updated_at: string;
}

/**
 * 数据块信息
 */
export interface DataChunk {
  id: number;
  knowledge_file_id: number;
  chunk_index: number;
  chunk_text: string;
  vector_id: number | null;
  embedding_model: string;
  created_at: string;
}

/**
 * 向量信息
 */
export interface Vector {
  id: number;
  chunk_id: number;
  embedding: Buffer;
  created_at: string;
}

/**
 * 创建知识库文件记录
 */
export function createKnowledgeFile(
  filename: string,
  originalPath: FilePath,
  format?: string,
  origin: string = 'local'
): number {
  ensureInitialized();
  
  const result = execute(
    `INSERT INTO knowledge_files (filename, original_path, format, origin)
     VALUES (?, ?, ?, ?)`,
    [filename, originalPath, format || null, origin]
  );
  
  return result.lastInsertRowid as number;
}

/**
 * 获取知识库文件（通过文件名）
 */
export function getKnowledgeFileByFilename(filename: string): KnowledgeFile | undefined {
  ensureInitialized();
  return queryOne<KnowledgeFile>(
    'SELECT * FROM knowledge_files WHERE filename = ?',
    [filename]
  );
}

/**
 * 获取知识库文件（通过ID）
 */
export function getKnowledgeFileById(id: number): KnowledgeFile | undefined {
  ensureInitialized();
  return queryOne<KnowledgeFile>(
    'SELECT * FROM knowledge_files WHERE id = ?',
    [id]
  );
}

/**
 * 获取所有知识库文件
 */
export function getAllKnowledgeFiles(): KnowledgeFile[] {
  ensureInitialized();
  return query<KnowledgeFile>(
    'SELECT * FROM knowledge_files ORDER BY created_at DESC'
  );
}

/**
 * 获取启用的知识库文件
 */
export function getEnabledKnowledgeFiles(): KnowledgeFile[] {
  ensureInitialized();
  return query<KnowledgeFile>(
    'SELECT * FROM knowledge_files WHERE enabled = 1 ORDER BY created_at DESC'
  );
}

/**
 * 更新知识库文件信息
 */
export function updateKnowledgeFile(
  id: number,
  updates: Partial<Pick<KnowledgeFile, 'chunks' | 'vector_dim' | 'vector_count' | 'enabled'>>
): void {
  ensureInitialized();
  
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.chunks !== undefined) {
    fields.push('chunks = ?');
    values.push(updates.chunks);
  }
  if (updates.vector_dim !== undefined) {
    fields.push('vector_dim = ?');
    values.push(updates.vector_dim);
  }
  if (updates.vector_count !== undefined) {
    fields.push('vector_count = ?');
    values.push(updates.vector_count);
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }
  
  if (fields.length === 0) {
    return;
  }
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  execute(
    `UPDATE knowledge_files SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

/**
 * 重命名知识库文件
 */
export function renameKnowledgeFileInDB(oldFilename: string, newFilename: string): boolean {
  ensureInitialized();
  
  const result = execute(
    'UPDATE knowledge_files SET filename = ?, updated_at = CURRENT_TIMESTAMP WHERE filename = ?',
    [newFilename, oldFilename]
  );
  
  return result.changes > 0;
}

/**
 * 删除知识库文件（级联删除相关的chunks和vectors）
 */
export function deleteKnowledgeFile(id: number): boolean {
  ensureInitialized();
  
  // 手动实现级联删除（因为SQLite可能不强制执行外键）
  transaction(() => {
    // 先删除相关的向量（包括 vec0_index）
    deleteVectorsByFileId(id);
    
    // 删除数据块
    deleteDataChunksByFileId(id);
    
    // 删除文件记录
    execute('DELETE FROM knowledge_files WHERE id = ?', [id]);
  });
  
  return true;
}

/**
 * 删除知识库文件（通过文件名）
 */
export function deleteKnowledgeFileByFilename(filename: string): boolean {
  ensureInitialized();
  
  const file = getKnowledgeFileByFilename(filename);
  if (!file) {
    return false;
  }
  
  return deleteKnowledgeFile(file.id);
}

/**
 * 清空所有知识库数据
 */
export function clearAllKnowledgeFiles(): void {
  ensureInitialized();
  
  transaction(() => {
    execute('DELETE FROM vectors');
    execute('DELETE FROM data_chunks');
    execute('DELETE FROM knowledge_files');
  });
  
  logger.info('所有知识库数据已清空');
}

/**
 * 创建数据块
 */
export function createDataChunk(
  knowledgeFileId: number,
  chunkIndex: number,
  chunkText: string,
  embeddingModel: string = 'bce-embedding-base_v1'
): number {
  ensureInitialized();
  
  const result = execute(
    `INSERT INTO data_chunks (knowledge_file_id, chunk_index, chunk_text, embedding_model)
     VALUES (?, ?, ?, ?)`,
    [knowledgeFileId, chunkIndex, chunkText, embeddingModel]
  );
  
  return result.lastInsertRowid as number;
}

/**
 * 批量创建数据块
 */
export function createDataChunks(
  knowledgeFileId: number,
  chunks: Array<{ index: number; text: string; embedding_model?: string }>,
  defaultEmbeddingModel: string = 'bce-embedding-base_v1'
): number[] {
  ensureInitialized();
  
  const chunkIds: number[] = [];
  
  transaction(() => {
    for (const chunk of chunks) {
      const result = execute(
        `INSERT INTO data_chunks (knowledge_file_id, chunk_index, chunk_text, embedding_model)
         VALUES (?, ?, ?, ?)`,
        [knowledgeFileId, chunk.index, chunk.text, chunk.embedding_model || defaultEmbeddingModel]
      );
      chunkIds.push(result.lastInsertRowid as number);
    }
  });
  
  return chunkIds;
}

/**
 * 获取文件的所有数据块
 */
export function getDataChunksByFileId(knowledgeFileId: number): DataChunk[] {
  ensureInitialized();
  return query<DataChunk>(
    'SELECT * FROM data_chunks WHERE knowledge_file_id = ? ORDER BY chunk_index ASC',
    [knowledgeFileId]
  );
}

/**
 * 删除文件的所有向量（包括 vec0_index 中的数据）
 */
export function deleteVectorsByFileId(knowledgeFileId: number): void {
  ensureInitialized();
  
  // 获取该文件的所有 chunk_id
  const chunks = query<{ id: number }>(
    'SELECT id FROM data_chunks WHERE knowledge_file_id = ?',
    [knowledgeFileId]
  );
  
  const chunkIds = chunks.map(c => c.id);
  if (chunkIds.length === 0) {
    return;
  }
  
  const placeholders = chunkIds.map(() => '?').join(',');
  
  // 删除 vectors 表中的向量
  execute(`DELETE FROM vectors WHERE chunk_id IN (${placeholders})`, chunkIds);
  
  // 如果 sqlite-vec 可用，同时删除 vec0_index 中的数据
  if (isSqliteVecAvailable() && tableExists('vec0_index')) {
    try {
      execute(`DELETE FROM vec0_index WHERE chunk_id IN (${placeholders})`, chunkIds);
    } catch (error) {
      logger.warn('删除vec0_index中的向量失败', error as Error);
    }
  }
}

/**
 * 删除文件的所有数据块
 * 注意：此函数不会自动删除向量，需要在调用前先调用 deleteVectorsByFileId
 * 这样可以更灵活地控制删除顺序
 */
export function deleteDataChunksByFileId(knowledgeFileId: number): void {
  ensureInitialized();
  // 删除数据块
  execute('DELETE FROM data_chunks WHERE knowledge_file_id = ?', [knowledgeFileId]);
}

/**
 * 创建向量记录
 */
export function createVector(chunkId: number, embedding: number[]): number {
  ensureInitialized();
  
  // 将向量数组转换为Buffer
  const buffer = Buffer.from(new Float32Array(embedding).buffer);
  
  const result = execute(
    `INSERT INTO vectors (chunk_id, embedding) VALUES (?, ?)`,
    [chunkId, buffer]
  );
  
  const vectorId = result.lastInsertRowid as number;
  
  // 如果sqlite-vec可用，同时插入到vec0虚拟表
  // 注意：sqlite-vec 的 FLOAT32[768] 类型需要特殊处理
  if (isSqliteVecAvailable() && tableExists('vec0_index')) {
    try {
      // 确保 chunk_id 是严格的整数类型（sqlite-vec要求严格的INTEGER类型）
      let chunkIdInt: number;
      if (typeof chunkId === 'number') {
        chunkIdInt = Math.floor(chunkId);
      } else {
        chunkIdInt = Number.parseInt(String(chunkId), 10);
      }
      
      if (isNaN(chunkIdInt) || !Number.isInteger(chunkIdInt)) {
        logger.warn(`无效的chunk_id: ${chunkId}，跳过vec0_index插入`);
        return vectorId;
      }
      
      // sqlite-vec的FLOAT32[N]类型需要传递Buffer格式的数据
      // 将embedding数组转换为Float32Array，然后转换为Buffer
      const db = getDatabase();
      const float32Array = new Float32Array(embedding);
      const embeddingBuffer = Buffer.from(float32Array.buffer);
      
      // 使用CAST确保chunk_id是INTEGER类型（sqlite-vec要求严格类型）
      // 这是必需的，因为sqlite-vec的虚拟表对类型检查非常严格
      const stmt = db.prepare(`INSERT INTO vec0_index (chunk_id, embedding) VALUES (CAST(? AS INTEGER), ?)`);
      stmt.run(chunkIdInt, embeddingBuffer);
      logger.debug(`成功插入vec0_index: chunk_id=${chunkIdInt}, embedding维度=${embedding.length}`);
    } catch (error) {
      // 记录错误但不影响主流程，因为 vectors 表已经成功插入
      // 但记录为警告，因为vec0_index插入失败会影响向量搜索性能
      logger.warn('插入vec0虚拟表失败', error as Error);
    }
  }
  
  return vectorId;
}

/**
 * 批量创建向量记录
 */
export function createVectors(vectors: Array<{ chunkId: number; embedding: number[] }>): number[] {
  ensureInitialized();
  
  const vectorIds: number[] = [];
  const vec0Available = isSqliteVecAvailable() && tableExists('vec0_index');
  
  transaction(() => {
    for (const vec of vectors) {
      const buffer = Buffer.from(new Float32Array(vec.embedding).buffer);
      const result = execute(
        `INSERT INTO vectors (chunk_id, embedding) VALUES (?, ?)`,
        [vec.chunkId, buffer]
      );
      const vectorId = result.lastInsertRowid as number;
      vectorIds.push(vectorId);
      
      // 如果sqlite-vec可用，同时插入到vec0虚拟表
      // 注意：sqlite-vec 的 FLOAT32[768] 类型需要特殊处理
      if (vec0Available) {
        try {
          // 确保 chunk_id 是严格的整数类型（sqlite-vec要求严格的INTEGER类型）
          let chunkIdInt: number;
          if (typeof vec.chunkId === 'number') {
            chunkIdInt = Math.floor(vec.chunkId);
          } else {
            chunkIdInt = Number.parseInt(String(vec.chunkId), 10);
          }
          
          if (isNaN(chunkIdInt) || !Number.isInteger(chunkIdInt)) {
            logger.warn(`无效的chunk_id: ${vec.chunkId}，跳过vec0_index插入`);
            continue;
          }
          
          // sqlite-vec 的 FLOAT32[N] 类型需要传递Buffer格式的数据
          // 将embedding数组转换为Float32Array，然后转换为Buffer
          const float32Array = new Float32Array(vec.embedding);
          const embeddingBuffer = Buffer.from(float32Array.buffer);
          const db = getDatabase();
          
          // 使用CAST确保chunk_id是INTEGER类型（sqlite-vec要求严格类型）
          // 这是必需的，因为sqlite-vec的虚拟表对类型检查非常严格
          const stmt = db.prepare(`INSERT INTO vec0_index (chunk_id, embedding) VALUES (CAST(? AS INTEGER), ?)`);
          stmt.run(chunkIdInt, embeddingBuffer);
        } catch (error) {
          // 记录错误但不影响主流程，因为 vectors 表已经成功插入
          // 但记录为警告，因为vec0_index插入失败会影响向量搜索性能
          logger.warn(`插入vec0虚拟表失败: chunk_id=${vec.chunkId}`, error as Error);
        }
      }
      
      // 更新data_chunks表的vector_id字段
      execute(
        'UPDATE data_chunks SET vector_id = ? WHERE id = ?',
        [vectorId, vec.chunkId]
      );
    }
  });
  
  return vectorIds;
}

/**
 * 获取向量（通过chunk_id）
 */
export function getVectorByChunkId(chunkId: number): Vector | undefined {
  ensureInitialized();
  return queryOne<Vector>(
    'SELECT * FROM vectors WHERE chunk_id = ?',
    [chunkId]
  );
}

/**
 * 获取文件的所有向量
 */
export function getVectorsByFileId(knowledgeFileId: number): Array<{ chunkId: number; embedding: number[] }> {
  ensureInitialized();
  
  const vectors = query<{ chunk_id: number; embedding: Buffer }>(
    `SELECT v.chunk_id, v.embedding 
     FROM vectors v
     INNER JOIN data_chunks dc ON v.chunk_id = dc.id
     WHERE dc.knowledge_file_id = ?
     ORDER BY dc.chunk_index ASC`,
    [knowledgeFileId]
  );
  
  // 将Buffer转换回数组
  return vectors.map(v => {
    const floatArray = new Float32Array(v.embedding.buffer);
    return {
      chunkId: v.chunk_id,
      embedding: Array.from(floatArray)
    };
  });
}

/**
 * 使用segment库进行中文分词（参考cut_words实现）
 */
const Segment = require('segment');
const segment = new Segment();
segment.useDefault();
function segmentText(text: string): string[] {
  try {

    // 使用segment进行分词，simple模式返回词数组
    const words = segment.doSegment(text, { simple: true });
    return Array.isArray(words) ? words.filter((w: string) => w && w.trim().length > 0) : [];
  } catch (error) {
    // 如果segment不可用，回退到简单分词
    logger.debug('segment分词失败，使用简单分词', error as Error);
    return text
      .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);
  }
}

/**
 * 提取查询关键词（使用分词）
 */
function extractQueryKeywords(query: string): string[] {
  // 使用segment进行分词，得到更精准的关键词
  const segmentedWords = segmentText(query);
  
  // 过滤掉太短的词（单字符通常不是关键词）
  return segmentedWords.filter(w => w.length > 1 || /[\u4e00-\u9fa5]/.test(w));
}

/**
 * 关键词评分（用于混合搜索）
 * 使用segment分词实现更精准的匹配
 * 综合考虑：关键词匹配率、关键词在文本中的占比、词频、文本长度等
 */
function keywordScore(query: string, text: string): number {
  // 使用segment分词提取查询关键词
  const queryWords = extractQueryKeywords(query.toLowerCase());
  
  if (queryWords.length === 0) {
    return 0;
  }

  const textLower = text.toLowerCase();
  const textLength = text.length;
  
  // 使用segment分词提取文本中的所有词（用于计算密度）
  const textWords = segmentText(textLower);
  const textWordCount = textWords.length;
  
  let matchedCount = 0;
  let totalKeywordLength = 0; // 匹配到的关键词总字符数
  let totalKeywordOccurrences = 0; // 关键词出现的总次数
  let keywordLengthSum = 0; // 所有查询关键词的总字符数

  // 使用分词后的词进行精确匹配
  // 将文本分词后的词转换为Set，提高查找效率
  const textWordSet = new Set(textWords);
  
  for (const word of queryWords) {
    if (word.length === 0) continue;
    
    keywordLengthSum += word.length;
    
    // 方法1：精确匹配（分词后的词完全匹配）
    // 这是最精准的匹配方式
    let termFreq = 0;
    if (textWordSet.has(word)) {
      // 精确匹配：统计在分词结果中出现的次数
      termFreq = textWords.filter(w => w === word).length;
    }
    // else {
    //   // 方法2：如果精确匹配失败，尝试模糊匹配（包含匹配）
    //   // 这对于一些特殊情况（如标点符号处理差异）有帮助
    //   const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    //   const matches = textLower.match(regex);
    //   termFreq = matches ? matches.length : 0;
    // }
    
    if (termFreq > 0) {
      matchedCount++;
      totalKeywordLength += word.length * termFreq; // 考虑出现次数
      totalKeywordOccurrences += termFreq;
    }
  }

  if (matchedCount === 0) {
    return 0;
  }

  // 1. 关键词匹配率：匹配到的关键词数 / 查询关键词总数
  const matchRatio = matchedCount / queryWords.length;
  
  // 2. 关键词密度：匹配到的关键词字符数 / 文本总字符数
  // 这反映了关键词在文本中的占比，但需要对短文本进行惩罚
  const rawKeywordDensity = textLength > 0 ? totalKeywordLength / textLength : 0;
  
  // 对短文本的密度进行惩罚，避免短文本中关键词占比过大导致分数过高
  // 使用长度惩罚因子：文本越短，密度权重越低
  const minTextLength = 50; // 最小合理文本长度
  const lengthPenalty = textLength < minTextLength 
    ? Math.max(0.3, textLength / minTextLength) // 短文本惩罚
    : 1.0; // 正常长度文本不惩罚
  const keywordDensity = rawKeywordDensity * lengthPenalty;
  
  // 3. 关键词频率：关键词出现次数 / 文本总词数
  // 这反映了关键词在文本中的出现频率
  const keywordFrequency = textWordCount > 0 ? totalKeywordOccurrences / textWordCount : 0;
  
  // 4. 文本长度因子：考虑文本长度对关键词重要性的影响
  // 使用对数缩放，避免极短文本过度影响
  const lengthFactor = Math.min(1.0, Math.log(1 + textLength) / Math.log(1 + 500));
  
  // 5. 综合评分（优化后的权重分配）
  // 匹配率权重：0.4（必须匹配到关键词，最重要）
  // 密度权重：0.3（关键词在文本中的占比，但已对短文本进行惩罚）
  // 频率权重：0.2（关键词出现频率）
  // 长度因子：0.1（文本长度的影响）
  const baseScore = 
    matchRatio * 0.4 +
    Math.min(1, keywordDensity * 8) * 0.3 + // 密度乘以8放大，但限制在1以内（降低放大倍数）
    Math.min(1, keywordFrequency * 4) * 0.2 + // 频率乘以4放大，但限制在1以内（降低放大倍数）
    lengthFactor * 0.1;
  
  // 如果所有关键词都匹配到了且文本长度合理，给予额外奖励
  if (matchRatio === 1.0 && keywordDensity > 0.05 && textLength >= minTextLength) {
    return Math.min(1, baseScore * 1.05); // 降低奖励倍数
  }
  
  return Math.min(1, baseScore);
}

/**
 * 混合评分（结合向量相似度和关键词匹配度）
 * 固定权重：向量相似度0.8，关键词匹配度0.2
 */
function hybridScore(cosSim: number, keywordSim: number): number {
  // 固定权重：向量相似度80%，关键词匹配度20%
  const wVec = 0.8;
  const wKey = 0.2;
  
  // 基础混合评分
  const baseScore = cosSim * wVec + keywordSim * wKey;
  
  // 如果两者都很高，给予小幅额外奖励
  if (cosSim > 0.7 && keywordSim > 0.5) {
    return Math.min(1, baseScore * 1.05); // 降低奖励倍数
  }
  
  return baseScore;
}

/**
 * 搜索相似向量（使用sqlite-vec虚拟表）
 * 注意：如果sqlite-vec不可用，将返回空结果
 * 
 * @param queryVector 查询向量
 * @param queryText 查询文本（用于关键词匹配，可选）
 * @param topK 返回的结果数量
 * @param threshold 相似度阈值
 * @param enabledOnly 是否只搜索启用的文件
 */
export function searchSimilarVectors(
  queryVector: number[],
  topK: number = 10,
  threshold: number = 0.5,
  enabledOnly: boolean = true,
  queryText?: string
): Array<{ chunkId: number; similarity: number; chunkText: string }> {
  ensureInitialized();
  
  // 归一化查询向量（用于余弦相似度计算）
  const queryNorm = Math.sqrt(queryVector.reduce((sum, x) => sum + x * x, 0));
  if (queryNorm === 0) {
    logger.warn('查询向量范数为0，无法进行搜索');
    return [];
  }
  const normalizedQuery = queryVector.map(x => x / queryNorm);
  
  // 首先尝试使用sqlite-vec的虚拟表进行向量搜索
  // 注意：sqlite-vec使用虚拟表vec0_index，通过MATCH操作符进行KNN搜索
  if (isSqliteVecAvailable() && tableExists('vec0_index')) {
    try {
      const db = getDatabase();
      
      // 先检查vec0_index中是否有数据
      const countResult = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM vec0_index', []);
      if (!countResult || countResult.count === 0) {
        logger.debug('vec0_index表中没有数据，跳过虚拟表搜索，使用JavaScript计算');
        throw new Error('vec0_index表中没有数据');
      } else {
        logger.debug(`vec0_index表中有 ${countResult.count} 条数据，使用虚拟表搜索`);
      }
      
      // 检查扩展是否正确加载（尝试查询一个简单的向量）
      try {
        const sampleResult = queryOne<{ chunk_id: number }>('SELECT chunk_id FROM vec0_index LIMIT 1', []);
        if (!sampleResult) {
          logger.warn('无法从vec0_index读取数据，可能扩展未正确加载');
        } else {
          logger.debug(`vec0_index数据读取正常，示例chunk_id: ${sampleResult.chunk_id}`);
        }
      } catch (sampleError) {
        logger.error('读取vec0_index数据失败，可能扩展未正确加载', sampleError as Error);
        throw sampleError;
      }
      
      // 将查询向量转换为Buffer（sqlite-vec虚拟表需要）
      // better-sqlite3需要Buffer类型，而不是ArrayBuffer
      const queryFloat32 = new Float32Array(queryVector);
      const queryBuffer = Buffer.from(queryFloat32.buffer);
      
      // 构建查询：使用vec0_index虚拟表进行KNN搜索
      // sqlite-vec的虚拟表语法：WHERE embedding MATCH ? AND k = ? 用于向量搜索
      // 注意：sqlite-vec要求在使用MATCH时必须同时指定k参数（返回的最近邻数量）
      // 重要：MATCH操作符必须在WHERE子句中，且k参数必须与MATCH一起使用
      // 使用子查询先获取KNN结果，然后再JOIN其他表，避免JOIN条件影响MATCH操作
      
      // 正式查询：使用子查询获取KNN结果，然后JOIN其他表
      // 先获取KNN结果，然后再JOIN，避免JOIN条件影响MATCH操作
      const knnSql = `SELECT chunk_id, distance FROM vec0_index WHERE embedding MATCH ? AND k = ?`;
      const knnParams: any[] = [queryBuffer, topK * 2]; // 多取一些，因为后面还要过滤
      
      const knnResults = query<{ chunk_id: number; distance: number }>(knnSql, knnParams);
      logger.debug(`KNN查询返回 ${knnResults.length} 个结果，chunk_id列表: ${knnResults.slice(0, 10).map(r => r.chunk_id).join(', ')}`);
      
      if (knnResults.length === 0) {
        logger.warn('KNN查询返回0个结果');
        throw new Error('KNN查询返回0个结果');
      }
      
      // 检查这些chunk_id是否在data_chunks表中存在
      const knnChunkIds = knnResults.map(r => r.chunk_id);
      const chunkIdPlaceholders = knnChunkIds.map(() => '?').join(',');
      const chunkCheckSql = `SELECT id FROM data_chunks WHERE id IN (${chunkIdPlaceholders})`;
      const existingChunks = query<{ id: number }>(chunkCheckSql, knnChunkIds);
      logger.debug(`KNN结果中有 ${existingChunks.length}/${knnResults.length} 个chunk_id在data_chunks表中存在`);
      
      if (existingChunks.length === 0) {
        logger.error('KNN查询返回的chunk_id都不在data_chunks表中，数据不一致！');
        throw new Error('数据不一致：vec0_index中的chunk_id与data_chunks中的id不匹配');
      }
      
      // 只使用存在的chunk_id进行JOIN
      // 直接使用KNN查询的结果，不再重复执行MATCH
      const validChunkIds = existingChunks.map(c => c.id);
      const validPlaceholders = validChunkIds.map(() => '?').join(',');
      
      // 创建一个临时映射，将chunk_id映射到distance
      const chunkIdToDistance = new Map<number, number>();
      knnResults.forEach(r => {
        if (validChunkIds.includes(r.chunk_id)) {
          chunkIdToDistance.set(r.chunk_id, r.distance);
        }
      });
      
      // 直接JOIN data_chunks和knowledge_files表，使用KNN查询的结果
      let sql = `
        SELECT 
          dc.id as chunk_id,
          dc.chunk_text,
          ? as distance
        FROM data_chunks dc
        INNER JOIN knowledge_files kf ON dc.knowledge_file_id = kf.id
        WHERE dc.id IN (${validPlaceholders})
      `;
      
      // 注意：这里不能直接传递distance，需要为每个chunk_id单独查询
      // 改用更简单的方法：先获取所有数据，然后在代码中匹配distance
      sql = `
        SELECT 
          dc.id as chunk_id,
          dc.chunk_text
        FROM data_chunks dc
        INNER JOIN knowledge_files kf ON dc.knowledge_file_id = kf.id
        WHERE dc.id IN (${validPlaceholders})
      `;
      
      const params: any[] = [...validChunkIds];
      
      // 如果只搜索启用的文件，添加过滤条件
      if (enabledOnly) {
        sql += ' AND kf.enabled = 1';
      }
      
      // 执行查询
      const results = query<{
        chunk_id: number;
        chunk_text: string;
      }>(sql, params);
      
      // 将distance添加到结果中
      const resultsWithDistance = results
        .map(r => {
          const distance = chunkIdToDistance.get(r.chunk_id);
          return {
            chunk_id: r.chunk_id,
            chunk_text: r.chunk_text,
            distance: distance ?? 999 // 如果找不到distance，使用一个很大的值
          };
        })
        .filter(r => r.distance !== 999) // 过滤掉没有distance的结果
        .sort((a, b) => a.distance - b.distance); // 按distance排序
      
      const finalResults = resultsWithDistance.map(r => ({
        chunk_id: r.chunk_id,
        chunk_text: r.chunk_text,
        distance: r.distance
      }));
      
      // 添加调试日志：查看实际的distance值
      if (finalResults.length > 0) {
        const sampleDistances = finalResults.slice(0, 5).map(r => r.distance.toFixed(4));
        logger.debug(`sqlite-vec查询返回 ${finalResults.length} 个结果，前5个distance值: ${sampleDistances.join(', ')}`);
      } else {
        logger.debug('sqlite-vec查询返回0个结果，可能vec0_index表中没有数据或查询条件不匹配');
      }
      
      // 转换distance到similarity（使用全局统计信息和平滑函数）
      // 考虑整个向量数据库的相对对比，使用Z-score标准化结合sigmoid函数
      // 这样既考虑了相对位置，又保持了绝对意义的阈值
      
      // 第一步：计算全局统计信息
      const distances = finalResults.map(r => r.distance);
      const meanDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
      const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distances.length;
      const stdDistance = Math.sqrt(variance);
      const minDistance = Math.min(...distances);
      const maxDistance = Math.max(...distances);
      
      logger.debug(`distance统计: 均值=${meanDistance.toFixed(4)}, 标准差=${stdDistance.toFixed(4)}, 范围=[${minDistance.toFixed(4)}, ${maxDistance.toFixed(4)}]`);
      
      // 第二步：使用平滑函数转换distance到similarity
      // 使用Z-score标准化结合sigmoid函数，既考虑相对位置，又保持绝对意义
      const resultsWithSimilarity = finalResults
        .map(r => {
          const dist = r.distance;
          
          // 方法1：基于Z-score的sigmoid转换（考虑全局分布）
          // Z-score: z = (distance - mean) / std
          // 使用sigmoid函数平滑转换，但需要调整使得distance越小，similarity越大
          let zScore: number;
          if (stdDistance > 0.001) {
            // 有足够的方差，使用Z-score
            zScore = (dist - meanDistance) / stdDistance;
          } else {
            // 方差太小，使用简单的归一化
            zScore = (dist - meanDistance) / (maxDistance - minDistance || 1);
          }
          
          // 使用sigmoid函数，但需要反转（因为distance越小越好）
          // sigmoid(-z) 使得z越小（distance越小），结果越接近1
          // 使用缩放因子调整sigmoid的陡峭程度
          const sigmoidScale = 2.0; // 控制sigmoid的陡峭程度
          const sigmoidValue = 1 / (1 + Math.exp(sigmoidScale * zScore));
          
          // 方法2：结合绝对距离的混合评分
          // 基础相似度：1 - distance（绝对意义）
          // 但需要考虑全局分布，如果整个库的距离都很长，应该相对调整
          const absoluteSimilarity = 1.0 - dist; // 绝对相似度
          
          // 相对相似度：基于Z-score的sigmoid
          const relativeSimilarity = sigmoidValue;
          
          // 混合绝对和相对相似度
          // 权重：绝对相似度60%，相对相似度40%
          // 这样既保持了绝对意义的阈值，又考虑了全局分布
          const absoluteWeight = 0.6;
          const relativeWeight = 0.4;
          let baseSimilarity = absoluteSimilarity * absoluteWeight + relativeSimilarity * relativeWeight;
          
          // 如果整个库的距离都很长（meanDistance > 1），说明整体相似度较低
          // 在这种情况下，应该降低所有similarity，但保持相对排序
          if (meanDistance > 1.0) {
            // 使用全局调整因子，降低整体similarity
            const globalAdjustment = Math.max(0.3, 1.0 / meanDistance);
            baseSimilarity = baseSimilarity * globalAdjustment;
          }
          
          // 系数调整：放大baseSimilarity，使得0.5阈值下能找到3-5条相关结果
          // 如果高度相关的内容baseSim只有0.3-0.4，需要放大到0.5-0.6左右
          // 使用一个系数来调整，使得最相似的结果能够达到0.5-0.7的范围
          const similarityScale = 1.7; // 放大系数，可以根据实际情况调整
          baseSimilarity = baseSimilarity * similarityScale;
          
          // 确保similarity在合理范围内（-1到1）
          baseSimilarity = Math.max(-1, Math.min(1, baseSimilarity));
          
          // 如果提供了queryText，计算关键词匹配分数并混合
          let finalSimilarity = baseSimilarity;
          if (queryText) {
            const keywordSim = keywordScore(queryText, r.chunk_text);
            finalSimilarity = hybridScore(baseSimilarity, keywordSim);
            logger.debug(`chunk_id=${r.chunk_id}, baseSim=${baseSimilarity.toFixed(4)}, keywordSim=${keywordSim.toFixed(4)}, finalSim=${finalSimilarity.toFixed(4)}`);
          }
          
          return {
            chunkId: r.chunk_id,
            similarity: finalSimilarity,
            chunkText: r.chunk_text,
            rawDistance: dist, // 保留原始distance用于调试
            baseSimilarity // 保留基础相似度用于调试
          };
        })
        // 按similarity从高到低排序（similarity越大越相似）
        .sort((a, b) => b.similarity - a.similarity);
      
      // 过滤相似度阈值（使用混合评分后的similarity）
      const filteredResults = resultsWithSimilarity
        .filter(r => {
          const passes = r.similarity >= threshold;
          if (!passes && resultsWithSimilarity.length <= 10) {
            // 如果结果很少，记录详细信息
            const baseSim = r.baseSimilarity !== undefined ? r.baseSimilarity.toFixed(4) : 'N/A';
            logger.debug(`结果被过滤: chunk_id=${r.chunkId}, distance=${r.rawDistance.toFixed(4)}, baseSim=${baseSim}, finalSim=${r.similarity.toFixed(4)}, threshold=${threshold}`);
          }
          return passes;
        })
        .slice(0, topK) // 只取前topK个
        .map(r => ({
          chunkId: r.chunkId,
          similarity: r.similarity, // 返回混合评分后的similarity
          chunkText: r.chunkText
        }));
      
      if (filteredResults.length > 0) {
        logger.debug(`sqlite-vec虚拟表搜索成功: 找到 ${filteredResults.length} 个结果（阈值=${threshold}）`);
        return filteredResults;
      } else {
        const sampleSimilarities = resultsWithSimilarity.slice(0, 5).map(r => r.similarity.toFixed(4));
        logger.debug(`sqlite-vec虚拟表搜索完成，但没有结果超过阈值（阈值=${threshold}），返回的${resultsWithSimilarity.length}个结果的similarity值: ${sampleSimilarities.join(', ')}`);
        return [];
      }
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // 如果虚拟表查询失败，记录错误并返回空结果
      logger.error('sqlite-vec虚拟表搜索失败', error as Error);
      return [];
    }
  } else {
    logger.warn('sqlite-vec扩展或vec0_index虚拟表不可用，无法进行向量搜索');
    return [];
  }
}

/**
 * 重新同步vec0_index表的数据（从vectors表）
 * 用于修复数据不一致的问题
 */
export function resyncVec0Index(): void {
  ensureInitialized();
  
  if (!isSqliteVecAvailable() || !tableExists('vec0_index')) {
    logger.warn('sqlite-vec扩展或vec0_index表不可用，无法重新同步');
    return;
  }
  
  try {
    const db = getDatabase();
    
    // 清空vec0_index表
    logger.info('清空vec0_index表...');
    execute('DELETE FROM vec0_index', []);
    
    // 从vectors表读取所有向量数据
    logger.info('从vectors表读取向量数据...');
    const vectors = query<{ chunk_id: number; embedding: Buffer }>(
      'SELECT chunk_id, embedding FROM vectors',
      []
    );
    
    logger.info(`找到 ${vectors.length} 个向量，开始重新插入vec0_index...`);
    
    let successCount = 0;
    let failCount = 0;
    
    // 批量插入
    transaction(() => {
      for (const vec of vectors) {
        try {
          // 确保chunk_id是整数类型（sqlite-vec要求严格的INTEGER类型）
          // 使用parseInt确保是整数，然后使用Math.floor作为保险
          let chunkIdInt: number;
          if (typeof vec.chunk_id === 'number') {
            chunkIdInt = Math.floor(vec.chunk_id);
          } else {
            chunkIdInt = Number.parseInt(String(vec.chunk_id), 10);
          }
          
          if (isNaN(chunkIdInt) || !Number.isInteger(chunkIdInt)) {
            logger.warn(`无效的chunk_id: ${vec.chunk_id} (类型: ${typeof vec.chunk_id})，跳过`);
            failCount++;
            continue;
          }
          
          const embeddingBuffer = vec.embedding; // 已经是Buffer格式
          
          // sqlite-vec对类型要求非常严格，需要使用CAST确保chunk_id是INTEGER类型
          // 或者直接使用SQL的CAST函数
          const stmt = db.prepare(`INSERT INTO vec0_index (chunk_id, embedding) VALUES (CAST(? AS INTEGER), ?)`);
          stmt.run(chunkIdInt, embeddingBuffer);
          successCount++;
        } catch (error) {
          failCount++;
          logger.debug(`插入vec0_index失败: chunk_id=${vec.chunk_id}, 类型=${typeof vec.chunk_id}`, error as Error);
        }
      }
    });
    
    logger.info(`vec0_index重新同步完成: 成功 ${successCount} 个，失败 ${failCount} 个`);
    
    // 验证同步结果
    const vec0Count = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM vec0_index', []);
    const vec0Range = queryOne<{ min_id: number; max_id: number }>(
      'SELECT MIN(chunk_id) as min_id, MAX(chunk_id) as max_id FROM vec0_index',
      []
    );
    logger.info(`vec0_index表统计: 总数=${vec0Count?.count}, chunk_id范围=${vec0Range?.min_id} - ${vec0Range?.max_id}`);
    
  } catch (error) {
    logger.error('重新同步vec0_index失败', error as Error);
    throw error;
  }
}

