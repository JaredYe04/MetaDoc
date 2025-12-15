/**
 * RAG (检索增强生成) 服务 - TypeScript 重构版本
 * 整合原有的 rag_utils.js 和 ann_utils.js 功能
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import natural from 'natural';
import pathService from './path-service';
import fileConversionService from './file-conversion-service';
import modelMergeService from './model-merge-service';
import { createMainLogger } from '../logger';
import {
  ensureInitialized,
  createKnowledgeFile,
  getKnowledgeFileByFilename,
  getAllKnowledgeFiles,
  updateKnowledgeFile,
  deleteKnowledgeFileByFilename,
  clearAllKnowledgeFiles,
  renameKnowledgeFileInDB,
  createDataChunks,
  getDataChunksByFileId,
  deleteDataChunksByFileId,
  deleteVectorsByFileId,
  createVectors,
  getVectorsByFileId,
  searchSimilarVectors
} from '../database/knowledge-db';
import type {
  FilePath,
  VectorDimension,
  EmbeddingVector,
  DocumentId,
  VectorIndexItem,
  VectorDatabaseConfig,
  DocumentMetadata,
  VectorInfoMap,
  QueryResult,
  SearchConfig,
  EmbeddingContext,
  ChunkConfig,
  DocumentChunk,
  FileUploadResult,
  OperationResult,
  RAGService,
  ANNSearchConfig
} from '../../types/utils';

const logger = createMainLogger('RagService');

/**
 * Embedding 结果（包含向量和模型信息）
 */
interface EmbeddingResult {
  vector: readonly number[];
  model: string;
}

/**
 * RAG 服务实现类
 */
class RAGServiceImpl implements RAGService {
  // 配置常量
  private readonly VECTOR_LEN: VectorDimension = 768; // bce-embedding-base_v1 的维度是 768
  private readonly CHUNK_SIZE = 500;
  private readonly DEFAULT_OVERLAP = 50;
  private readonly DEFAULT_SCORE_THRESHOLD = 0.5;
  
  // 向量搜索配置
  private readonly VECTOR_SEARCH_TOP_K = 50; // 从数据库获取的初始候选数量
  private readonly RERANK_TOP_K = 10; // 重排后返回的最终结果数量

  // 路径配置（已废弃，保留用于兼容性）
  private readonly config: VectorDatabaseConfig;

  // 内存状态（仅用于统计和兼容性，不再用于搜索）
  private vectorIndex: VectorIndexItem[] = [];
  private docIdToText: Map<DocumentId, string> = new Map();
  private vectorInfo: VectorInfoMap = {};
  private embeddingContext: EmbeddingContext | null = null;
  private embedCache: Record<string, number[]> = {};
  private readonly logger = createMainLogger('RagService');

  // Embedding 模式：'local' 或 'api'
  private embeddingMode: 'local' | 'api' = 'api';
  
  // SiliconFlow API 配置
  private readonly SILICONFLOW_API_URL = 'https://api.siliconflow.cn/v1/embeddings';
  private readonly SILICONFLOW_MODEL = 'netease-youdao/bce-embedding-base_v1';

  // 缓存配置
  private readonly cacheDir: FilePath;
  private readonly cacheFile: FilePath;

  constructor() {
    // 使用 meta-doc-kb 文件夹作为向量数据库路径（与知识库文件在同一目录）
    const os = require('os');
    const vectorDatabasePath = path.join(os.homedir(), 'Documents', 'meta-doc-kb');
    
    // 确保目录存在
    if (!fs.existsSync(vectorDatabasePath)) {
      fs.mkdirSync(vectorDatabasePath, { recursive: true });
    }
    
    // 注意：indexPath, docsPath, vectorInfoPath 已废弃（现在使用SQLite数据库）
    // 保留这些路径仅用于向后兼容
    this.config = {
      vectorLength: this.VECTOR_LEN,
      databasePath: vectorDatabasePath,
      indexPath: path.join(vectorDatabasePath, 'vector_index.json'), // @deprecated
      docsPath: path.join(vectorDatabasePath, 'vector_docs.json'), // @deprecated
      vectorInfoPath: path.join(vectorDatabasePath, 'vector_info.json') // @deprecated
    };

    this.cacheDir = path.join(vectorDatabasePath, 'embedding_cache');
    this.cacheFile = path.join(this.cacheDir, 'cache.json');
  }

  // ============ 公共 API 方法 ============

  /**
   * 初始化向量数据库
   */
  async initVectorDatabase(): Promise<void> {
    try {
      // 确保数据库已初始化
      ensureInitialized();

      // 从数据库加载向量索引和文档映射（仅用于统计和兼容性）
      await this.loadFromDatabase();

      // 加载嵌入缓存
      this.loadEmbeddingCache();

      this.logger.info(`向量数据库初始化完成: ${this.docIdToText.size} 个文档`);
    } catch (error) {
      this.logger.error('向量数据库初始化失败', error as Error);
      // 重置状态
      this.vectorIndex = [];
      this.docIdToText = new Map();
      this.vectorInfo = {};
    }
  }

  /**
   * 从数据库加载向量索引和文档映射
   */
  private async loadFromDatabase(): Promise<void> {
    this.vectorIndex = [];
    this.docIdToText = new Map();
    this.vectorInfo = {};

    // 获取所有知识库文件
    const files = getAllKnowledgeFiles();

    for (const file of files) {
      // 加载向量信息
      this.vectorInfo[file.filename] = {
        chunks: file.chunks,
        vector_dim: file.vector_dim,
        vector_count: file.vector_count,
        enabled: file.enabled === 1
      };

      // 加载数据块和向量
      const chunks = getDataChunksByFileId(file.id);
      const vectors = getVectorsByFileId(file.id);

      // 创建向量映射（chunk_id -> embedding）
      const vectorMap = new Map<number, number[]>();
      for (const vec of vectors) {
        vectorMap.set(vec.chunkId, vec.embedding);
      }

      // 构建vectorIndex和docIdToText
      for (const chunk of chunks) {
        const id = `${file.filename}_${chunk.chunk_index}`;
        const embedding = chunk.vector_id ? vectorMap.get(chunk.vector_id) : null;

        if (embedding) {
          this.vectorIndex.push({ id, vector: embedding });
          this.docIdToText.set(id, chunk.chunk_text);
        }
      }
    }
  }

  /**
   * 添加文件到知识库
   * @param filePath 文件路径
   * @param progressCallback 进度回调函数（可选）
   * @param abortSignal 取消信号（可选）
   */
  async addFileToKnowledgeBase(
    filePath: FilePath,
    progressCallback?: (progress: { message: string; subMessage?: string; percentage: number; status?: 'success' | 'exception' | 'warning' | ''; params?: Record<string, any> }) => void,
    abortSignal?: AbortSignal
  ): Promise<FileUploadResult> {
    try {
      progressCallback?.({
        message: '正在初始化向量数据库...',
        percentage: 5,
        params: { filename: path.basename(filePath) }
      });

      await this.initVectorDatabase();

      // 检查是否已取消
      if (abortSignal?.aborted) {
        return { success: false, message: '操作已取消' };
      }

      progressCallback?.({
        message: '正在转换文件为文本...',
        percentage: 10,
        params: { filename: path.basename(filePath) }
      });

      // 转换文件为文本（使用进度回调和取消信号）
      const convertResult = await fileConversionService.tryConvertFileToText(
        filePath,
        progressCallback ? (p) => {
          // 将文件转换进度映射到 10-40%
          progressCallback({
            ...p,
            percentage: 10 + (p.percentage * 0.3)
          });
        } : undefined,
        abortSignal
      );

      if (!convertResult.success || !convertResult.text) {
        return {
          success: false,
          message: convertResult.error || '文件转换失败'
        };
      }

      const text = convertResult.text;

      // 检查是否已取消
      if (abortSignal?.aborted) {
        return { success: false, message: '操作已取消' };
      }

      progressCallback?.({
        message: '正在分段处理文本...',
        percentage: 40,
        params: { filename: path.basename(filePath) }
      });

      // 分段处理
      const chunks = this.chunkText(text);
      const fileBaseName = path.basename(filePath);
      const fileExt = path.extname(filePath).slice(1); // 去掉点号

      // 检查文件是否已存在
      let fileId: number;
      const existingFile = getKnowledgeFileByFilename(fileBaseName);
      
      if (existingFile) {
        // 如果文件已存在，先删除旧数据
        // 手动删除旧向量（包括 vec0_index），然后删除数据块
        // 这样可以确保在重建向量时，旧的向量数据被完全清理（因为 SQLite 没有外键约束）
        deleteVectorsByFileId(existingFile.id);
        deleteDataChunksByFileId(existingFile.id);
        fileId = existingFile.id;
        
        // 更新文件信息
        updateKnowledgeFile(existingFile.id, {
          chunks: chunks.length,
          vector_dim: this.VECTOR_LEN,
          vector_count: 0, // 稍后会更新
          enabled: 1
        });
      } else {
        // 创建新文件记录
        fileId = createKnowledgeFile(fileBaseName, filePath, fileExt, 'local');
      }

      // 检查是否已取消
      if (abortSignal?.aborted) {
        return { success: false, message: '操作已取消' };
      }

      progressCallback?.({
        message: '正在生成向量嵌入...',
        subMessage: `处理中: 0/${chunks.length}`,
        percentage: 45,
        params: { filename: path.basename(filePath), total: chunks.length, current: 0 }
      });

      // 为每个chunk生成向量
      const embeddingResults: Array<{ vector: number[]; model: string }> = [];
      const embeddingProgressStep = 40 / chunks.length; // 45% 到 85%
      
      for (let i = 0; i < chunks.length; i++) {
        // 检查是否已取消
        if (abortSignal?.aborted) {
          return { success: false, message: '操作已取消' };
        }

        const chunk = chunks[i];
        const result = await this.embedText(chunk);

        if (result.vector.length === this.VECTOR_LEN) {
          embeddingResults.push({
            vector: Array.from(result.vector),
            model: result.model
          });
        } else {
          logger.warn(`向量维度不匹配: 期望 ${this.VECTOR_LEN}, 实际 ${result.vector.length}`);
        }

        // 更新进度
        progressCallback?.({
          message: '正在生成向量嵌入...',
          subMessage: `处理中: ${i + 1}/${chunks.length}`,
          percentage: 45 + (i + 1) * embeddingProgressStep,
          params: { filename: path.basename(filePath), total: chunks.length, current: i + 1 }
        });
      }

      // 检查是否已取消
      if (abortSignal?.aborted) {
        return { success: false, message: '操作已取消' };
      }

      progressCallback?.({
        message: '正在保存向量数据...',
        percentage: 85,
        params: { filename: path.basename(filePath) }
      });

      // 批量创建数据块（包含 embedding_model 信息）
      const chunkData = chunks.map((chunk, index) => ({
        index,
        text: chunk,
        embedding_model: embeddingResults[index]?.model || 'bce-embedding-base_v1'
      }));
      const chunkIds = createDataChunks(fileId, chunkData);

      // 准备向量数据
      const vectors: Array<{ chunkId: number; embedding: number[] }> = [];
      let successCount = 0;

      for (let i = 0; i < embeddingResults.length && i < chunkIds.length; i++) {
        if (embeddingResults[i]) {
          vectors.push({
            chunkId: chunkIds[i],
            embedding: embeddingResults[i].vector
          });
          successCount++;
        }
      }

      // 批量保存向量
      if (vectors.length > 0) {
        createVectors(vectors);
      }

      // 检查是否已取消
      if (abortSignal?.aborted) {
        return { success: false, message: '操作已取消' };
      }

      progressCallback?.({
        message: '正在更新文件信息...',
        percentage: 95,
        params: { filename: path.basename(filePath) }
      });

      // 更新文件信息（chunks、vector_dim 和 vector_count）
      updateKnowledgeFile(fileId, {
        chunks: chunks.length,
        vector_dim: this.VECTOR_LEN,
        vector_count: successCount
      });

      // 重新加载到内存（仅用于统计和兼容性）
      await this.loadFromDatabase();

      progressCallback?.({
        message: '完成',
        percentage: 100,
        status: 'success',
        params: { filename: path.basename(filePath) }
      });

      return {
        success: true,
        chunks: chunks.length,
        vector_dim: this.VECTOR_LEN,
        vector_count: successCount
      };

    } catch (error) {
      logger.error('添加文件到知识库失败:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 查询知识库（使用SQLite向量搜索）
   */
  async queryKnowledgeBase(question: string, scoreThreshold = this.DEFAULT_SCORE_THRESHOLD): Promise<string[]> {
    await this.initVectorDatabase();

    // 检查是否有启用的文档
    const enabledFiles = getAllKnowledgeFiles().filter(f => f.enabled === 1);
    if (enabledFiles.length === 0) {
      this.logger.warn('没有启用的文档，无法进行搜索');
      return [];
    }

    // 如果查询文本很长，分段处理
    const chunks = question.length > this.CHUNK_SIZE
      ? this.chunkText(question, this.CHUNK_SIZE, this.DEFAULT_OVERLAP)
      : [question];

    let allCandidates: QueryResult[] = [];

    for (const chunk of chunks) {
      // 生成查询向量
      const embeddingResult = await this.embedText(chunk);
      const queryEmbedding = embeddingResult.vector;

      // 使用SQLite向量搜索获取候选结果
      // 传入queryText用于关键词匹配和混合评分
      const dbResults = searchSimilarVectors(
        Array.from(queryEmbedding), // 转换为可变数组
        this.VECTOR_SEARCH_TOP_K,
        0, // 在searchSimilarVectors中不设置阈值，因为会进行标准化和混合评分
        true, // 只搜索启用的文档
        chunk // 传入查询文本用于关键词匹配
      );

      if (dbResults.length === 0) {
        this.logger.debug(`SQLite向量搜索未返回结果 (查询: ${chunk.substring(0, 50)}...)`);
        continue;
      }

      // 转换为QueryResult格式
      // searchSimilarVectors已经进行了标准化和关键词匹配，返回的similarity是混合评分
      let candidates: QueryResult[] = dbResults.map(r => ({
        id: `chunk_${r.chunkId}`,
        cosSim: r.similarity, // 已经是混合评分后的similarity
        text: r.chunkText,
        hybridScore: r.similarity // 使用混合评分作为hybridScore
      }));

      // searchSimilarVectors已经按similarity排序，这里不需要再排序

      // 使用改进的重排算法
      candidates = this.rerankResults(queryEmbedding, candidates, chunk);

      allCandidates.push(...candidates);
    }

    // 合并去重（基于文本内容）
    const seen = new Set<string>();
    let merged: QueryResult[] = [];
    for (const c of allCandidates) {
      if (!seen.has(c.text)) {
        seen.add(c.text);
        merged.push(c);
      }
    }

    // 按混合评分排序和过滤
    merged = merged
      .sort((a, b) => b.hybridScore! - a.hybridScore!)
      .filter(r => r.hybridScore! >= scoreThreshold)
      .slice(0, this.RERANK_TOP_K);

    if (merged.length === 0) {
      this.logger.warn(`知识库查询未返回结果 (阈值: ${scoreThreshold}, 候选数: ${allCandidates.length}, 合并后: ${merged.length})`);
      // 如果阈值设为0仍然没有结果，返回前几个结果（即使混合评分为负）
      if (scoreThreshold === 0 && allCandidates.length > 0) {
        this.logger.warn('阈值设为0仍无结果，返回前几个候选');
        const fallbackResults = allCandidates
          .sort((a, b) => (b.hybridScore || 0) - (a.hybridScore || 0))
          .slice(0, this.RERANK_TOP_K)
          .map(r => r.text);
        return fallbackResults;
      }
    }

    return merged.map(r => r.text);
  }

  /**
   * 从索引中移除文档
   */
  removeFromIndex(fileBaseName: string): void {
    try {
      // 从数据库删除
      const deleted = deleteKnowledgeFileByFilename(fileBaseName);
      
      if (deleted) {
        // 从内存中删除
        this.vectorIndex = this.vectorIndex.filter(vec => 
          !vec.id.startsWith(fileBaseName + '_')
        );

        for (const key of [...this.docIdToText.keys()]) {
          if (key.startsWith(fileBaseName + '_')) {
            this.docIdToText.delete(key);
          }
        }

        delete this.vectorInfo[fileBaseName];

        this.logger.info(`文档 ${fileBaseName} 已从向量索引中删除`);
      } else {
        this.logger.warn(`文档 ${fileBaseName} 不存在于数据库中`);
      }
    } catch (error) {
      this.logger.error(`删除文档 ${fileBaseName} 失败`, error as Error);
      throw error;
    }
  }

  /**
   * 重命名知识库文件
   */
  async renameKnowledgeFile(oldName: string, newName: string): Promise<OperationResult> {
    try {
      const knowledgeUploadDir = this.getKnowledgeUploadDir();
      const oldFilePath = path.join(knowledgeUploadDir, oldName);
      const newFilePath = path.join(knowledgeUploadDir, newName);

      if (!fs.existsSync(oldFilePath)) {
        return { success: false, error: '原文件不存在' };
      }
      if (fs.existsSync(newFilePath)) {
        return { success: false, error: '新文件名已存在' };
      }

      // 重命名文件
      fs.renameSync(oldFilePath, newFilePath);

      // 检查新文件名是否已存在于数据库
      const existingFile = getKnowledgeFileByFilename(newName);
      if (existingFile) {
        return { success: false, error: '新文件名在数据库中已存在' };
      }

      // 更新数据库
      const success = renameKnowledgeFileInDB(oldName, newName);
      if (!success) {
        return { success: false, error: '数据库更新失败' };
      }

      // 重新加载到内存（仅用于统计和兼容性）
      await this.loadFromDatabase();

      return { success: true };

    } catch (error) {
      logger.error('重命名失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '重命名失败'
      };
    }
  }

  /**
   * 清空知识库
   */
  async clearKnowledgeBase(): Promise<void> {
    try {
      // 清空数据库
      clearAllKnowledgeFiles();
      
      // 清空内存中的向量数据
      this.vectorIndex = [];
      this.docIdToText.clear();
      this.vectorInfo = {};
      this.embedCache = {};
      
      // 清空索引缓存（已废弃，保留用于兼容性）
      
      // 删除知识库目录中的所有原始文档文件
      const knowledgeUploadDir = this.getKnowledgeUploadDir();
      if (fs.existsSync(knowledgeUploadDir)) {
        const files = fs.readdirSync(knowledgeUploadDir);
        // 旧的配置文件列表（已废弃，现在使用SQLite数据库）
        const configFiles = ['vector_index.json', 'vector_docs.json', 'vector_info.json']; // @deprecated
        
        for (const file of files) {
          const filePath = path.join(knowledgeUploadDir, file);
          const stat = fs.statSync(filePath);
          
          // 跳过配置文件
          if (configFiles.includes(file)) {
            continue;
          }
          
          // 删除文件或目录
          if (stat.isFile()) {
            fs.unlinkSync(filePath);
            this.logger.debug(`已删除知识库文件: ${file}`);
          } else if (stat.isDirectory()) {
            // 删除目录（如 embedding_cache）
            fs.rmSync(filePath, { recursive: true, force: true });
            this.logger.debug(`已删除知识库目录: ${file}`);
          }
        }
      }
      
      // 清空 embedding 缓存目录
      if (fs.existsSync(this.cacheDir)) {
        fs.rmSync(this.cacheDir, { recursive: true, force: true });
        this.logger.debug('已清空 embedding 缓存目录');
      }
      
      this.logger.info('知识库已完全清空（包括原始文档文件）');
    } catch (error) {
      this.logger.error('清空知识库失败:', error);
      throw error;
    }
  }

  // ============ 私有方法 ============

  /**
   * 文本分段
   */
  private chunkText(text: string, chunkSize = this.CHUNK_SIZE, overlap = this.DEFAULT_OVERLAP): string[] {
    if (!text || typeof text !== 'string') return [];

    // 预处理：去除无用信息
    text = this.preprocessText(text);

    // 标准化文本
    text = text
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/ +/g, ' ')
      .split(/(?<=[。！？.!?])\s+|\n+/)
      .join('');

    const tokenizer = new natural.SentenceTokenizer([]);
    let sentences = tokenizer.tokenize(text) || [];
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if (this.isMeaningless(sentence)) continue;

      const overlapText = currentChunk.slice(-overlap);
      if ((currentChunk + sentence).length <= chunkSize) {
        currentChunk += sentence;
      } else {
        if (currentChunk.trim().length <= chunkSize) {
          chunks.push(currentChunk.trim());
        } else {
          const splitChunks = this.splitLongChunk(currentChunk, chunkSize);
          chunks.push(...splitChunks);
        }
        currentChunk = overlapText + sentence;
      }
    }

    if (currentChunk.trim() && currentChunk.trim().length <= chunkSize) {
      chunks.push(currentChunk.trim());
    }

    // 合并过短的块
    return this.mergeShortChunks(chunks, chunkSize);
  }

  /**
   * 预处理文本：去除无用信息
   * - 去除连续过长的相同字符
   * - 去除无意义的 base64 文本块
   */
  private preprocessText(text: string): string {
    if (!text || typeof text !== 'string') return '';

    let processed = text;

    // 1. 去除连续过长的相同字符（连续超过 10 个相同字符）
    // 匹配连续超过 10 个相同字符（包括空格、换行等）
    processed = processed.replace(/(.)\1{10,}/g, (match, char) => {
      // 如果是空格或换行，保留最多 2 个
      if (/\s/.test(char)) {
        return char.repeat(Math.min(2, match.length));
      }
      // 其他字符保留最多 3 个
      return char.repeat(Math.min(3, match.length));
    });

    // 2. 去除 base64 文本块
    // 匹配 base64 编码的文本块（通常以字母数字和 +/= 组成，长度较长）
    // 使用更严格的 base64 检测：至少 30 个字符，且 base64 字符占比超过 80%
    processed = processed.replace(/[A-Za-z0-9+/=]{30,}/g, (match) => {
      // 计算 base64 字符占比
      const base64Chars = match.match(/[A-Za-z0-9+/=]/g)?.length || 0;
      const base64Ratio = base64Chars / match.length;
      
      // 如果 base64 字符占比超过 80%，且长度超过 30，认为是 base64 文本
      if (base64Ratio > 0.8 && match.length >= 30) {
        // 检查是否包含常见的中文或标点（如果有，可能不是纯 base64）
        const hasChinese = /[\u4e00-\u9fa5]/.test(match);
        const hasPunctuation = /[，。！？、；：""''（）【】《》]/.test(match);
        
        // 如果包含中文或标点，可能不是 base64，保留
        if (hasChinese || hasPunctuation) {
          return match;
        }
        
        // 否则认为是 base64，去除
        this.logger.debug(`移除 base64 文本块: ${match.substring(0, 50)}... (长度: ${match.length})`);
        return '';
      }
      
      return match;
    });

    // 3. 去除连续的 base64 行（整行都是 base64 字符）
    // 按行处理，去除整行都是 base64 的行
    const lines = processed.split(/\n/);
    const filteredLines: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // 空行暂时保留，后续统一处理
      if (!trimmed) {
        filteredLines.push(line);
        continue;
      }
      
      // 如果整行都是 base64 字符且长度超过 20
      const base64Chars = trimmed.match(/[A-Za-z0-9+/=]/g)?.length || 0;
      const base64Ratio = base64Chars / trimmed.length;
      
      if (base64Ratio > 0.9 && trimmed.length >= 20) {
        // 检查是否包含中文或标点
        const hasChinese = /[\u4e00-\u9fa5]/.test(trimmed);
        const hasPunctuation = /[，。！？、；：""''（）【】《》]/.test(trimmed);
        
        if (!hasChinese && !hasPunctuation) {
          this.logger.debug(`移除 base64 行: ${trimmed.substring(0, 50)}...`);
          continue; // 跳过该行
        }
      }
      
      filteredLines.push(line);
    }
    
    processed = filteredLines.join('\n');

    // 4. 清理多余的空行（超过 3 个连续换行保留为 2 个）
    processed = processed.replace(/\n{4,}/g, '\n\n');

    return processed;
  }

  /**
   * 分割过长的块
   */
  private splitLongChunk(chunk: string, chunkSize: number): string[] {
    const splitChunks: string[] = [];
    for (let i = 0; i < chunk.length; i += chunkSize) {
      splitChunks.push(chunk.slice(i, i + chunkSize));
    }
    return splitChunks;
  }

  /**
   * 合并过短的块
   */
  private mergeShortChunks(chunks: string[], chunkSize: number): string[] {
    const minLen = Math.floor(chunkSize * 0.4);
    const mergedChunks: string[] = [];

    for (const chunk of chunks) {
      if (
        mergedChunks.length > 0 &&
        chunk.length < minLen &&
        (mergedChunks[mergedChunks.length - 1].length + chunk.length) <= chunkSize
      ) {
        mergedChunks[mergedChunks.length - 1] += chunk;
      } else {
        mergedChunks.push(chunk);
      }
    }

    return mergedChunks.filter(chunk => chunk.trim().length > 0);
  }

  /**
   * 检测无意义字符串
   */
  private isMeaningless(str: string): boolean {
    if (!str) return true;
    const clean = str.replace(/\s+/g, '');
    
    // Base64/Hash检测
    if (/^[A-Za-z0-9+/=]{20,}$/.test(clean)) return true;
    
    // 非字母数字字符比例检测
    const nonAlphaNumRatio = (clean.match(/[^A-Za-z0-9\u4e00-\u9fa5]/g)?.length || 0) / clean.length;
    if (nonAlphaNumRatio > 0.6) return true;
    
    // 数字比例检测
    const digitRatio = (clean.match(/\d/g)?.length || 0) / clean.length;
    if (digitRatio > 0.8) return true;
    
    // 短文本且无中文
    if (clean.length < 5 && !/[\u4e00-\u9fa5]/.test(clean)) return true;
    
    return false;
  }

  /**
   * 设置 embedding 模式
   */
  setEmbeddingMode(mode: 'local' | 'api'): void {
    this.embeddingMode = mode;
    this.logger.info(`Embedding 模式已切换为: ${mode}`);
  }

  /**
   * 获取当前 embedding 模式
   */
  getEmbeddingMode(): 'local' | 'api' {
    return this.embeddingMode;
  }

  /**
   * 初始化嵌入模型
   * 注意：本地嵌入模型功能已暂时关闭，此函数已禁用
   */
  private async initEmbedder(modelFileName = "bce-embedding-base_v1-Q8_0.gguf"): Promise<void> {
    throw new Error('本地嵌入模型功能已暂时关闭。如需启用，请将 node-llama-cpp 移回 dependencies');
    // 以下代码已注释，因为本地嵌入模型功能已暂时关闭
    // node-llama-cpp 已移至 devDependencies，不会被打包
    /*
    const { getLlama } = await import("node-llama-cpp");

    this.logger.info(`正在合并模型 ${modelFileName}...`);
    const mergedPath = await modelMergeService.mergeModel(modelFileName);

    this.logger.info(`从 ${mergedPath} 加载模型...`);
    const llama = await getLlama({});
    const model = await llama.loadModel({ modelPath: mergedPath });

    const ctx = await model.createEmbeddingContext();
    // 适配接口
    this.embeddingContext = {
      getEmbeddingFor: async (text: string) => {
        const result = await ctx.getEmbeddingFor(text);
        return { vector: [...result.vector] }; // 转换为可变数组
      }
    };
    this.logger.info('嵌入上下文初始化完成');
    */
  }

  /**
   * 使用外部 API 生成文本嵌入向量
   */
  private async embedTextViaAPI(text: string): Promise<EmbeddingResult> {
    const apiKey = process.env.SILICONFLOW_API_KEY;
    if (!apiKey) {
      throw new Error('SILICONFLOW_API_KEY 未配置，请检查 .env 文件');
    }

    try {
      const https = require('https');
      const http = require('http');
      const url = require('url');

      const requestData = JSON.stringify({
        model: this.SILICONFLOW_MODEL,
        input: text
      });

      const urlObj = new URL(this.SILICONFLOW_API_URL);
      const isHttps = urlObj.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      return new Promise<EmbeddingResult>((resolve, reject) => {
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Content-Length': Buffer.byteLength(requestData)
          }
        };

        const req = httpModule.request(options, (res: any) => {
          let data = '';

          res.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });

          res.on('end', () => {
            try {
              const response = JSON.parse(data);
              if (response.data && response.data[0] && response.data[0].embedding) {
                const embedding = response.data[0].embedding;
                if (embedding.length === this.VECTOR_LEN) {
                  resolve({
                    vector: embedding,
                    model: this.SILICONFLOW_MODEL
                  });
                } else {
                  this.logger.warn(`API 返回的向量维度不匹配: 期望 ${this.VECTOR_LEN}, 实际 ${embedding.length}`);
                  reject(new Error(`向量维度不匹配: 期望 ${this.VECTOR_LEN}, 实际 ${embedding.length}`));
                }
              } else {
                reject(new Error('API 响应格式错误'));
              }
            } catch (error) {
              this.logger.error('解析 API 响应失败:', error);
              reject(error);
            }
          });
        });

        req.on('error', (error: Error) => {
          this.logger.error('API 请求失败:', error);
          reject(error);
        });

        req.write(requestData);
        req.end();
      });
    } catch (error) {
      this.logger.error('使用 API 生成嵌入向量失败:', error);
      throw error;
    }
  }

  /**
   * 生成文本嵌入向量
   */
  private async embedText(text: string): Promise<EmbeddingResult> {
    if (this.embeddingMode === 'api') {
      return await this.embedTextViaAPI(text);
    } else {
      // 本地模式
      if (!this.embeddingContext) {
        await this.initEmbedder();
      }
      const embedding = await this.embeddingContext!.getEmbeddingFor(text);
      return {
        vector: embedding.vector,
        model: 'bce-embedding-base_v1' // 本地模式默认使用 bce-embedding-base_v1
      };
    }
  }

  /**
   * 生成文本嵌入向量（带缓存）
   */
  private async embedTextCached(text: string): Promise<readonly number[]> {
    const key = this.hashKey(text);
    
    if (this.embedCache[key]) {
      return this.embedCache[key];
    }

    const result = await this.embedText(text);
    this.embedCache[key] = [...result.vector]; // 转换为可变数组存储
    this.saveEmbeddingCache();

    return result.vector;
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(vecA: readonly number[], vecB: readonly number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] ** 2;
      normB += vecB[i] ** 2;
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // ============ 旧的ANN搜索方法已迁移到 rag-service-legacy.ts ============
  // 以下所有ANN搜索相关方法已删除，已迁移到 rag-service-legacy.ts
  // 包括：annSearch, bruteForceSearch, optimizedAnnSearch, getLshCandidates,
  // computeHashKey, quickPreSort, filterByClusters, ensureIndexBuilt,
  // getOrBuildInvertedIndex, buildOptimizedIndex, buildIVFClusters 等
  // 实际搜索现在使用SQLite的searchSimilarVectors函数

  /**
   * 构建倒排索引（旧实现）
   * @deprecated 已迁移到 rag-service-legacy.ts 的 buildLegacyInvertedIndex
   * 此方法已不再被调用，保留仅为类型兼容性
   */
  private buildInvertedIndex(vectorIndex: VectorIndexItem[]): Map<string, VectorIndexItem[]> {
    // 此方法已不再使用，实际使用的是 buildOptimizedIndex 方法
    // 如果确实需要旧实现，请使用 rag-service-legacy.ts 中的 buildLegacyInvertedIndex
    return new Map();
  }

  /**
   * 关键词评分（改进版：使用TF-IDF和词频加权）
   */
  private keywordScore(query: string, text: string): number {
    // 提取关键词（去除标点符号，保留中英文和数字）
    const queryWords = query.toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);
    
    if (queryWords.length === 0) {
      return 0;
    }

    const textLower = text.toLowerCase();
    let totalScore = 0;
    let matchedCount = 0;

    for (const word of queryWords) {
      if (word.length === 0) continue;
      
      // 计算词频（在文本中出现的次数）
      const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = textLower.match(regex);
      const termFreq = matches ? matches.length : 0;
      
      if (termFreq > 0) {
        matchedCount++;
        // 使用对数缩放词频，避免高频词过度影响
        // 同时考虑词的长度（长词匹配更有意义）
        const wordWeight = Math.log(1 + termFreq) * (1 + word.length / 10);
        totalScore += wordWeight;
      }
    }

    // 归一化：考虑匹配率和总词频
    const matchRatio = matchedCount / queryWords.length;
    const normalizedScore = (totalScore / queryWords.length) * matchRatio;
    
    // 限制在 [0, 1] 范围内
    return Math.min(1, normalizedScore);
  }

  /**
   * 混合评分（改进版：动态权重调整）
   */
  private hybridScore(cosSim: number, keywordSim: number, wVec = 0.7, wKey = 0.3): number {
    // 如果向量相似度很低，增加关键词权重
    if (cosSim < 0.3) {
      wVec = 0.5;
      wKey = 0.5;
    }
    
    // 如果关键词匹配度很高，适当增加其权重
    if (keywordSim > 0.7) {
      wVec = 0.6;
      wKey = 0.4;
    }
    
    // 基础混合评分
    const baseScore = cosSim * wVec + keywordSim * wKey;
    
    // 如果两者都很高，给予额外奖励
    if (cosSim > 0.7 && keywordSim > 0.5) {
      return baseScore * 1.1;
    }
    
    return baseScore;
  }


  /**
   * 重新排序结果（改进版：结合BM25、位置信息、长度惩罚等）
   */
  private rerankResults(
    queryEmbedding: readonly number[],
    candidates: QueryResult[],
    queryText: string
  ): QueryResult[] {
    if (candidates.length === 0) {
      return [];
    }

    // 计算BM25分数（用于文本相似度）
    const bm25Scores = this.calculateBM25(queryText, candidates.map(c => c.text));

    return candidates
      .map((r, index) => {
        const bm25Score = bm25Scores[index];
        
        // 长度惩罚：过短或过长的文本可能不太相关
        const textLength = r.text.length;
        const lengthPenalty = this.calculateLengthPenalty(textLength, queryText.length);
        
        // 位置奖励：如果关键词出现在文本开头，给予奖励
        const positionBonus = this.calculatePositionBonus(queryText, r.text);
        
        // 综合重排分数
        // 权重：向量相似度 40%，BM25 30%，混合评分 20%，位置奖励 10%
        const rerankScore = 
          r.cosSim * 0.4 +
          bm25Score * 0.3 +
          (r.hybridScore || 0) * 0.2 +
          positionBonus * 0.1;
        
        // 应用长度惩罚
        const finalScore = rerankScore * lengthPenalty;
        
        return {
          ...r,
          rerankScore: finalScore
        };
      })
      .sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0));
  }

  /**
   * 计算BM25分数（简化的BM25算法）
   */
  private calculateBM25(query: string, texts: string[]): number[] {
    // 提取查询词
    const queryTerms = query.toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);
    
    if (queryTerms.length === 0) {
      return texts.map(() => 0);
    }

    // BM25参数
    const k1 = 1.5; // 词频饱和度参数
    const b = 0.75; // 长度归一化参数
    const avgDocLength = texts.reduce((sum, t) => sum + t.length, 0) / texts.length || 1;

    return texts.map(text => {
      const textLower = text.toLowerCase();
      let score = 0;

      for (const term of queryTerms) {
        if (term.length === 0) continue;
        
        // 计算词频
        const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = textLower.match(regex);
        const termFreq = matches ? matches.length : 0;
        
        if (termFreq > 0) {
          // 简化的BM25公式
          const idf = Math.log((texts.length + 1) / (1 + 1)); // 简化IDF
          const numerator = termFreq * (k1 + 1);
          const denominator = termFreq + k1 * (1 - b + b * (text.length / avgDocLength));
          score += idf * (numerator / denominator);
        }
      }

      // 归一化到 [0, 1]
      return Math.min(1, score / queryTerms.length);
    });
  }

  /**
   * 计算长度惩罚
   */
  private calculateLengthPenalty(textLength: number, queryLength: number): number {
    // 理想长度：查询长度的3-10倍
    const idealMin = queryLength * 3;
    const idealMax = queryLength * 10;
    
    if (textLength < idealMin) {
      // 过短：轻微惩罚
      return 0.9;
    } else if (textLength > idealMax) {
      // 过长：根据超出程度惩罚
      const excessRatio = textLength / idealMax;
      return Math.max(0.7, 1 / excessRatio);
    } else {
      // 理想长度：无惩罚
      return 1.0;
    }
  }

  /**
   * 计算位置奖励（关键词出现在文本开头给予奖励）
   */
  private calculatePositionBonus(query: string, text: string): number {
    const queryWords = query.toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);
    
    if (queryWords.length === 0) {
      return 0;
    }

    const textLower = text.toLowerCase();
    let bonus = 0;
    const checkLength = Math.min(text.length, 200); // 只检查前200个字符

    for (const word of queryWords) {
      if (word.length === 0) continue;
      
      const index = textLower.substring(0, checkLength).indexOf(word);
      if (index !== -1) {
        // 位置越靠前，奖励越高
        const positionRatio = 1 - (index / checkLength);
        bonus += positionRatio;
      }
    }

    // 归一化到 [0, 1]
    return Math.min(1, bonus / queryWords.length);
  }

  /**
   * 生成哈希键
   */
  private hashKey(text: string): string {
    return crypto.createHash('sha1').update(text).digest('hex');
  }

  /**
   * 加载嵌入缓存
   */
  private loadEmbeddingCache(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    
    if (fs.existsSync(this.cacheFile)) {
      try {
        this.embedCache = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
      } catch (error) {
        logger.error('读取嵌入缓存失败:', error);
        this.embedCache = {};
      }
    }
  }

  /**
   * 保存嵌入缓存
   */
  private saveEmbeddingCache(): void {
    try {
      fs.writeFileSync(this.cacheFile, JSON.stringify(this.embedCache), 'utf8');
    } catch (error) {
      logger.error('保存嵌入缓存失败:', error);
    }
  }

  /**
   * 保存所有状态
   * 注意：现在使用数据库存储，这个方法主要用于保持接口兼容性
   * @deprecated 现在使用数据库存储，不再需要手动保存
   */
  private saveAll(): void {
    // 数据已存储在数据库中，不需要额外保存
    // 如果需要同步enabled状态到数据库，可以在这里实现
    try {
      // 同步enabled状态到数据库
      for (const [filename, info] of Object.entries(this.vectorInfo)) {
        const file = getKnowledgeFileByFilename(filename);
        if (file && file.enabled !== (info.enabled ? 1 : 0)) {
          updateKnowledgeFile(file.id, { enabled: info.enabled ? 1 : 0 });
        }
      }
    } catch (error) {
      logger.error('同步状态到数据库失败:', error);
    }
  }

  /**
   * 保存向量索引（已废弃，数据存储在数据库中）
   * @deprecated 已迁移到SQLite数据库，参见 rag-service-legacy.ts
   */
  private saveIndex(): void {
    // 数据已存储在数据库中，不再需要保存到JSON文件
    // 旧实现已迁移到 rag-service-legacy.ts
  }

  /**
   * 保存文档映射（已废弃，数据存储在数据库中）
   * @deprecated 已迁移到SQLite数据库，参见 rag-service-legacy.ts
   */
  private saveDocsInternal(): void {
    // 数据已存储在数据库中，不再需要保存到JSON文件
    // 旧实现已迁移到 rag-service-legacy.ts
  }

  /**
   * 保存向量信息（已废弃，数据存储在数据库中）
   * @deprecated 已迁移到SQLite数据库，参见 rag-service-legacy.ts
   */
  private saveVectorInfoInternal(): void {
    // 数据已存储在数据库中，不再需要保存到JSON文件
    // 旧实现已迁移到 rag-service-legacy.ts
  }

  /**
   * 获取知识库上传目录
   */
  private getKnowledgeUploadDir(): FilePath {
    const os = require('os');
    return path.join(os.homedir(), 'Documents', 'meta-doc-kb');
  }

  // ============ 公共保存方法 ============

  /**
   * 保存文档映射（已废弃，数据存储在数据库中）
   * 保留此方法以保持接口兼容性
   */
  public saveDocs(): void {
    // 数据已存储在数据库中，不再需要保存到JSON文件
  }

  /**
   * 保存向量信息（已废弃，数据存储在数据库中）
   * 保留此方法以保持接口兼容性
   */
  public saveVectorInfo(): void {
    // 数据已存储在数据库中，不再需要保存到JSON文件
    // 如果需要同步状态，可以在这里实现
    try {
      for (const [filename, info] of Object.entries(this.vectorInfo)) {
        const file = getKnowledgeFileByFilename(filename);
        if (file) {
          updateKnowledgeFile(file.id, {
            chunks: info.chunks,
            vector_dim: info.vector_dim,
            vector_count: info.vector_count,
            enabled: info.enabled ? 1 : 0
          });
        }
      }
    } catch (error) {
      logger.error('同步向量信息到数据库失败:', error);
    }
  }

  // ============ 公共访问器 ============

  /**
   * 获取向量索引（只读）
   */
  getVectorIndex(): readonly VectorIndexItem[] {
    return [...this.vectorIndex];
  }

  /**
   * 获取文档映射（只读）
   */
  getDocuments(): ReadonlyMap<DocumentId, string> {
    return new Map(this.docIdToText);
  }

  /**
   * 获取向量信息（只读）
   */
  getVectorInfo(): Readonly<VectorInfoMap> {
    return { ...this.vectorInfo };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      documentCount: this.docIdToText.size,
      vectorCount: this.vectorIndex.length,
      enabledDocuments: Object.values(this.vectorInfo).filter(info => info.enabled !== false).length,
      cacheSize: Object.keys(this.embedCache).length
    };
  }
}

// 创建单例实例
const ragService = new RAGServiceImpl();

// 导出单例实例和类型
export default ragService;
export { RAGServiceImpl };

// 向后兼容的导出（保持原有API）
export const initVectorDatabase = () => ragService.initVectorDatabase();
export const addFileToKnowledgeBase = (
  filePath: FilePath,
  progressCallback?: (progress: { message: string; subMessage?: string; percentage: number; status?: 'success' | 'exception' | 'warning' | ''; params?: Record<string, any> }) => void,
  abortSignal?: AbortSignal
) => ragService.addFileToKnowledgeBase(filePath, progressCallback, abortSignal);
export const queryKnowledgeBase = (question: string, scoreThreshold?: number) => 
  ragService.queryKnowledgeBase(question, scoreThreshold);
export const removeFromIndex = (fileBaseName: string) => ragService.removeFromIndex(fileBaseName);
export const renameKnowledgeFile = (oldName: string, newName: string) => 
  ragService.renameKnowledgeFile(oldName, newName);
export const clearKnowledgeBase = () => ragService.clearKnowledgeBase();

// 导出配置访问
export const vectorIndex = ragService.getVectorIndex();
export const vectorInfo = ragService.getVectorInfo();

// 导出路径常量（已废弃，保留用于向后兼容）
// @deprecated 现在使用SQLite数据库，不再需要JSON文件路径
// 如需访问旧路径，请使用 rag-service-legacy.ts 中的常量
const os = require('os');
const metaDocKbPath = path.join(os.homedir(), 'Documents', 'meta-doc-kb');
export const INDEX_PATH = path.join(metaDocKbPath, 'vector_index.json'); // @deprecated
export const DOCS_PATH = path.join(metaDocKbPath, 'vector_docs.json'); // @deprecated
export const VECTOR_INFO_PATH = path.join(metaDocKbPath, 'vector_info.json'); // @deprecated
