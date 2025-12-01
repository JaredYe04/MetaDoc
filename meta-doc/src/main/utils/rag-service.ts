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
 * RAG 服务实现类
 */
class RAGServiceImpl implements RAGService {
  // 配置常量
  private readonly VECTOR_LEN: VectorDimension = 768; // bce-embedding-base_v1 的维度是 768
  private readonly CHUNK_SIZE = 500;
  private readonly DEFAULT_OVERLAP = 50;
  private readonly DEFAULT_SCORE_THRESHOLD = 0.5;
  
  // ANN 搜索配置
  private readonly ANN_CONFIG: ANNSearchConfig = {
    bucketBits: 8,
    bucketSize: 256
  };

  // 优化的ANN搜索配置
  private readonly OPTIMIZED_ANN_CONFIG = {
    // 使用多个哈希函数提高召回率
    numHashFunctions: 3,
    // 每个哈希函数使用的位数
    hashBits: 12, // 2^12 = 4096 个桶
    // 最大候选数量（在计算精确相似度之前）
    maxCandidates: 200,
    // 使用IVF（倒排文件索引）的聚类数量
    numClusters: 16,
    // 每个查询搜索的聚类数量
    searchClusters: 4
  };

  // 缓存：倒排索引（避免每次重新构建）
  private cachedInvertedIndex: Map<string, VectorIndexItem[]> | null = null;
  private cachedInvertedIndexVersion: number = 0;
  private invertedIndexVersion: number = 0;

  // IVF 聚类中心（用于快速过滤）
  private clusterCenters: number[][] | null = null;
  private vectorToCluster: Map<string, number> = new Map(); // vector id -> cluster id

  // 路径配置
  private readonly config: VectorDatabaseConfig;

  // 内存状态
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
    
    this.config = {
      vectorLength: this.VECTOR_LEN,
      databasePath: vectorDatabasePath,
      indexPath: path.join(vectorDatabasePath, 'vector_index.json'),
      docsPath: path.join(vectorDatabasePath, 'vector_docs.json'),
      vectorInfoPath: path.join(vectorDatabasePath, 'vector_info.json')
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
      // 加载向量索引
      if (fs.existsSync(this.config.indexPath)) {
        this.vectorIndex = JSON.parse(fs.readFileSync(this.config.indexPath, 'utf-8'));
      }

      // 加载文档映射
      if (fs.existsSync(this.config.docsPath)) {
        const docsJson = JSON.parse(fs.readFileSync(this.config.docsPath, 'utf-8'));
        this.docIdToText = new Map(Object.entries(docsJson));
      }

      // 加载向量信息
      if (fs.existsSync(this.config.vectorInfoPath)) {
        this.vectorInfo = JSON.parse(fs.readFileSync(this.config.vectorInfoPath, 'utf-8'));
      }

      // 加载嵌入缓存
      this.loadEmbeddingCache();

      // 标记索引需要重建
      this.invertedIndexVersion++;
      this.cachedInvertedIndex = null;

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
   * 添加文件到知识库
   */
  async addFileToKnowledgeBase(filePath: FilePath): Promise<FileUploadResult> {
    try {
      await this.initVectorDatabase();

      // 转换文件为文本
      const text = await fileConversionService.convertFileToText(filePath);
      if (!text) {
        return {
          success: false,
          message: '文件转换失败'
        };
      }

      // 分段处理
      const chunks = this.chunkText(text);
      const fileBaseName = path.basename(filePath);
      let successCount = 0;

      // 为每个chunk生成向量
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const vector = await this.embedText(chunk);

        if (vector.length === this.VECTOR_LEN) {
          const id = `${fileBaseName}_${i}`;
          this.vectorIndex.push({ id, vector });
          this.docIdToText.set(id, chunk);
          successCount++;
        } else {
          logger.warn(`向量维度不匹配: 期望 ${this.VECTOR_LEN}, 实际 ${vector.length}`);
        }
      }

      // 更新元信息
      this.vectorInfo[fileBaseName] = {
        chunks: chunks.length,
        vector_dim: this.VECTOR_LEN,
        vector_count: successCount,
        enabled: true
      };

      // 保存状态
      this.saveAll();

      // 标记索引需要重建
      this.invertedIndexVersion++;
      this.cachedInvertedIndex = null;

      return {
        success: true,
        chunks: chunks.length,
        vector_dim: this.VECTOR_LEN,
        vector_count: successCount  // 返回当前文件成功生成的向量数，而不是所有向量的总数
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
   * 查询知识库
   */
  async queryKnowledgeBase(question: string, scoreThreshold = this.DEFAULT_SCORE_THRESHOLD): Promise<string[]> {
    await this.initVectorDatabase();

    const chunks = question.length > this.CHUNK_SIZE
      ? this.chunkText(question, this.CHUNK_SIZE, this.DEFAULT_OVERLAP)
      : [question];

    let allCandidates: QueryResult[] = [];

    for (const chunk of chunks) {
      const queryEmbedding = await this.embedText(chunk);

      // 过滤启用的文档
      const filteredVectorIndex = this.vectorIndex.filter(vec => {
        const lastUnderscoreIndex = vec.id.lastIndexOf('_');
        const baseName = lastUnderscoreIndex !== -1
          ? vec.id.slice(0, lastUnderscoreIndex)
          : vec.id;
        return this.vectorInfo[baseName]?.enabled !== false;
      });

      // ANN 搜索
      let candidates = this.annSearch(queryEmbedding, filteredVectorIndex, 10);

      // 添加关键词匹配和混合评分
      candidates.forEach(r => {
        r.keywordSim = this.keywordScore(chunk, r.text);
        r.hybridScore = this.hybridScore(r.cosSim, r.keywordSim);
      });

      // 按混合评分排序
      candidates = candidates.sort((a, b) => b.hybridScore! - a.hybridScore!).slice(0, 10);

      // 重新排序
      candidates = this.rerankResults(queryEmbedding, candidates);

      allCandidates.push(...candidates);
    }

    // 合并去重
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
      .filter(r => r.hybridScore! >= scoreThreshold);

    if (merged.length === 0) {
      logger.debug('知识库查询未返回高相似度结果');
    }

    return merged.map(r => r.text);
  }

  /**
   * 从索引中移除文档
   */
  removeFromIndex(fileBaseName: string): void {
    // 删除向量索引
    this.vectorIndex = this.vectorIndex.filter(vec => 
      !vec.id.startsWith(fileBaseName + '_')
    );

    // 删除文档映射
    for (const key of [...this.docIdToText.keys()]) {
      if (key.startsWith(fileBaseName + '_')) {
        this.docIdToText.delete(key);
      }
    }

    // 删除元信息
    delete this.vectorInfo[fileBaseName];

    // 保存更新
    this.saveAll();

    // 标记索引需要重建
    this.invertedIndexVersion++;
    this.cachedInvertedIndex = null;

    this.logger.info(`文档 ${fileBaseName} 已从向量索引中删除`);
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

      // 更新文档映射
      const newDocIdToText = new Map<string, string>();
      for (const [docId, text] of this.docIdToText.entries()) {
        if (docId.startsWith(oldName + '_')) {
          const suffix = docId.substring(oldName.length);
          newDocIdToText.set(newName + suffix, text);
        } else {
          newDocIdToText.set(docId, text);
        }
      }
      this.docIdToText = newDocIdToText;

      // 更新向量索引
      this.vectorIndex = this.vectorIndex.map(vec => {
        if (vec.id.startsWith(oldName + '_')) {
          const suffix = vec.id.substring(oldName.length);
          return {
            ...vec,
            id: newName + suffix,
            docId: newName,
          };
        }
        return vec;
      });

      // 更新元信息
      if (this.vectorInfo[oldName]) {
        this.vectorInfo[newName] = this.vectorInfo[oldName];
        delete this.vectorInfo[oldName];
      }

      this.saveAll();
      
      // 标记索引需要重建
      this.invertedIndexVersion++;
      this.cachedInvertedIndex = null;

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
      // 清空内存中的向量数据
      this.vectorIndex = [];
      this.docIdToText.clear();
      this.vectorInfo = {};
      this.embedCache = {};
      
      // 保存清空后的状态（清空向量索引文件）
      this.saveAll();
      
      // 清空索引缓存
      this.cachedInvertedIndex = null;
      this.clusterCenters = null;
      this.vectorToCluster.clear();
      this.invertedIndexVersion++;
      
      // 删除知识库目录中的所有原始文档文件
      const knowledgeUploadDir = this.getKnowledgeUploadDir();
      if (fs.existsSync(knowledgeUploadDir)) {
        const files = fs.readdirSync(knowledgeUploadDir);
        const configFiles = ['knowledge_index.json', 'vector_index.json', 'vector_docs.json', 'vector_info.json'];
        
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
   */
  private async initEmbedder(modelFileName = "bce-embedding-base_v1-Q8_0.gguf"): Promise<void> {
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
  }

  /**
   * 使用外部 API 生成文本嵌入向量
   */
  private async embedTextViaAPI(text: string): Promise<readonly number[]> {
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

      return new Promise<readonly number[]>((resolve, reject) => {
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
                  resolve(embedding);
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
  private async embedText(text: string): Promise<readonly number[]> {
    if (this.embeddingMode === 'api') {
      return await this.embedTextViaAPI(text);
    } else {
      // 本地模式
      if (!this.embeddingContext) {
        await this.initEmbedder();
      }
      const embedding = await this.embeddingContext!.getEmbeddingFor(text);
      return embedding.vector;
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

    const vector = await this.embedText(text);
    this.embedCache[key] = [...vector]; // 转换为可变数组存储
    this.saveEmbeddingCache();

    return vector;
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

  /**
   * 优化的ANN搜索 - 使用多哈希LSH + IVF
   */
  private annSearch(
    queryEmbedding: readonly number[],
    vectorIndex: VectorIndexItem[],
    topN = 30
  ): QueryResult[] {
    // 过滤维度不匹配的向量
    const queryDim = queryEmbedding.length;
    const filteredIndex = vectorIndex.filter(item => {
      if (item.vector.length !== queryDim) {
        this.logger.debug(`跳过维度不匹配的向量: id=${item.id}, 维度=${item.vector.length}, 查询维度=${queryDim}`);
        return false;
      }
      return true;
    });

    if (filteredIndex.length === 0) {
      this.logger.warn('没有找到维度匹配的向量');
      return [];
    }

    // 如果数据量较小，直接使用暴力搜索
    if (filteredIndex.length < 100) {
      return this.bruteForceSearch(queryEmbedding, filteredIndex, topN);
    }

    // 使用优化的多级搜索
    return this.optimizedAnnSearch(queryEmbedding, filteredIndex, topN);
  }

  /**
   * 暴力搜索（用于小规模数据）
   */
  private bruteForceSearch(
    queryEmbedding: readonly number[],
    vectorIndex: VectorIndexItem[],
    topN: number
  ): QueryResult[] {
    return vectorIndex
      .map(({ id, vector }) => ({
        id,
        cosSim: this.cosineSimilarity(queryEmbedding, vector),
        text: this.docIdToText.get(id) || '',
      }))
      .sort((a, b) => b.cosSim - a.cosSim)
      .slice(0, topN);
  }

  /**
   * 优化的ANN搜索（多哈希LSH + IVF）
   */
  private optimizedAnnSearch(
    queryEmbedding: readonly number[],
    vectorIndex: VectorIndexItem[],
    topN: number
  ): QueryResult[] {
    // 确保索引已构建
    this.ensureIndexBuilt(vectorIndex);

    // 归一化查询向量
    const norm = Math.sqrt(queryEmbedding.reduce((sum, x) => sum + x * x, 0));
    const normalizedQuery = queryEmbedding.map(x => x / norm);

    // 第一步：使用多哈希LSH获取候选集
    const lshCandidates = this.getLshCandidates(normalizedQuery, vectorIndex);

    // 第二步：如果使用了IVF，进一步过滤候选集
    let candidates = lshCandidates;
    if (this.clusterCenters && this.clusterCenters.length > 0) {
      candidates = this.filterByClusters(normalizedQuery, lshCandidates);
    }

    // 限制候选数量，避免计算过多相似度
    if (candidates.length > this.OPTIMIZED_ANN_CONFIG.maxCandidates) {
      // 使用快速近似相似度（点积）进行预排序
      candidates = this.quickPreSort(normalizedQuery, candidates)
        .slice(0, this.OPTIMIZED_ANN_CONFIG.maxCandidates);
    }

    // 第三步：计算精确相似度并排序
    const results = candidates
      .map(({ id, vector }) => {
        // 归一化候选向量
        const vecNorm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
        const normalizedVec = vector.map(x => x / vecNorm);
        
        // 计算点积（归一化后的点积等于余弦相似度）
        let dot = 0;
        for (let i = 0; i < normalizedQuery.length; i++) {
          dot += normalizedQuery[i] * normalizedVec[i];
        }

        return {
          id,
          cosSim: dot,
          text: this.docIdToText.get(id) || '',
        };
      })
      .sort((a, b) => b.cosSim - a.cosSim)
      .slice(0, topN);

    return results;
  }

  /**
   * 使用多哈希LSH获取候选集
   */
  private getLshCandidates(
    normalizedQuery: number[],
    vectorIndex: VectorIndexItem[]
  ): VectorIndexItem[] {
    const candidateSet = new Set<string>();
    const invertedIndex = this.getOrBuildInvertedIndex(vectorIndex);

    // 使用多个哈希函数
    for (let hashFunc = 0; hashFunc < this.OPTIMIZED_ANN_CONFIG.numHashFunctions; hashFunc++) {
      const bucketKey = this.computeHashKey(normalizedQuery, hashFunc);
      const candidates = invertedIndex.get(bucketKey) || [];
      
      for (const candidate of candidates) {
        candidateSet.add(candidate.id);
      }
    }

    // 转换为VectorIndexItem数组
    const candidateMap = new Map(vectorIndex.map(item => [item.id, item]));
    return Array.from(candidateSet)
      .map(id => candidateMap.get(id))
      .filter((item): item is VectorIndexItem => item !== undefined);
  }

  /**
   * 计算哈希键（使用不同的哈希函数）
   */
  private computeHashKey(normalizedVec: number[], hashFunc: number): string {
    const bits = this.OPTIMIZED_ANN_CONFIG.hashBits;
    const startBit = (hashFunc * bits) % normalizedVec.length;
    
    let bucketKey = '';
    for (let i = 0; i < bits; i++) {
      const idx = (startBit + i) % normalizedVec.length;
      const v = normalizedVec[idx];
      // 将 [-1, 1] 映射到 [0, 255]
      const q = Math.floor(((v + 1) / 2) * 255);
      bucketKey += String.fromCharCode(q);
    }
    return bucketKey;
  }

  /**
   * 快速预排序（使用点积近似）
   */
  private quickPreSort(
    normalizedQuery: number[],
    candidates: VectorIndexItem[]
  ): VectorIndexItem[] {
    return candidates
      .map(item => {
        // 快速点积计算（不归一化，用于排序）
        let dot = 0;
        const minLen = Math.min(normalizedQuery.length, item.vector.length);
        for (let i = 0; i < minLen; i++) {
          dot += normalizedQuery[i] * item.vector[i];
        }
        return { item, score: dot };
      })
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);
  }

  /**
   * 使用IVF聚类过滤候选集
   */
  private filterByClusters(
    normalizedQuery: number[],
    candidates: VectorIndexItem[]
  ): VectorIndexItem[] {
    if (!this.clusterCenters || this.clusterCenters.length === 0) {
      return candidates;
    }

    // 找到最相关的聚类
    const clusterScores = this.clusterCenters.map((center, idx) => {
      let dot = 0;
      for (let i = 0; i < Math.min(normalizedQuery.length, center.length); i++) {
        dot += normalizedQuery[i] * center[i];
      }
      return { idx, score: dot };
    });

    clusterScores.sort((a, b) => b.score - a.score);
    const topClusters = new Set(
      clusterScores
        .slice(0, this.OPTIMIZED_ANN_CONFIG.searchClusters)
        .map(c => c.idx)
    );

    // 只保留属于这些聚类的候选
    return candidates.filter(item => {
      const clusterId = this.vectorToCluster.get(item.id);
      return clusterId !== undefined && topClusters.has(clusterId);
    });
  }

  /**
   * 确保索引已构建
   */
  private ensureIndexBuilt(vectorIndex: VectorIndexItem[]): void {
    // 检查是否需要重建索引
    if (this.cachedInvertedIndex === null || 
        this.invertedIndexVersion !== this.cachedInvertedIndexVersion) {
      this.buildOptimizedIndex(vectorIndex);
      this.cachedInvertedIndexVersion = this.invertedIndexVersion;
    }
  }

  /**
   * 获取或构建倒排索引
   */
  private getOrBuildInvertedIndex(vectorIndex: VectorIndexItem[]): Map<string, VectorIndexItem[]> {
    if (this.cachedInvertedIndex === null) {
      this.buildOptimizedIndex(vectorIndex);
    }
    return this.cachedInvertedIndex!;
  }

  /**
   * 构建优化的索引（多哈希LSH + IVF）
   */
  private buildOptimizedIndex(vectorIndex: VectorIndexItem[]): void {
    this.logger.info('构建优化的向量索引...');
    
    // 构建多哈希倒排索引
    const invertedIndex = new Map<string, VectorIndexItem[]>();

    for (const item of vectorIndex) {
      // 归一化向量
      const norm = Math.sqrt(item.vector.reduce((sum, x) => sum + x * x, 0));
      if (norm === 0) continue;
      
      const normalizedVec = item.vector.map(x => x / norm);

      // 为每个哈希函数生成桶键
      for (let hashFunc = 0; hashFunc < this.OPTIMIZED_ANN_CONFIG.numHashFunctions; hashFunc++) {
        const bucketKey = this.computeHashKey(normalizedVec, hashFunc);
        
        if (!invertedIndex.has(bucketKey)) {
          invertedIndex.set(bucketKey, []);
        }
        invertedIndex.get(bucketKey)!.push(item);
      }
    }

    this.cachedInvertedIndex = invertedIndex;

    // 如果向量数量足够大，构建IVF聚类
    if (vectorIndex.length > 100) {
      this.buildIVFClusters(vectorIndex);
    } else {
      this.clusterCenters = null;
      this.vectorToCluster.clear();
    }

    this.logger.info(`索引构建完成: ${invertedIndex.size} 个桶, ${vectorIndex.length} 个向量`);
  }

  /**
   * 构建IVF聚类（简化的K-means）
   */
  private buildIVFClusters(vectorIndex: VectorIndexItem[]): void {
    const numClusters = Math.min(
      this.OPTIMIZED_ANN_CONFIG.numClusters,
      Math.floor(vectorIndex.length / 10) // 确保每个聚类至少有10个向量
    );

    if (numClusters < 2) {
      this.clusterCenters = null;
      return;
    }

    this.logger.info(`构建IVF聚类: ${numClusters} 个聚类中心`);

    // 归一化所有向量
    const normalizedVectors = vectorIndex.map(item => {
      const norm = Math.sqrt(item.vector.reduce((sum, x) => sum + x * x, 0));
      if (norm === 0) return null;
      return {
        id: item.id,
        vector: item.vector.map(x => x / norm)
      };
    }).filter((item): item is { id: string; vector: number[] } => item !== null);

    if (normalizedVectors.length === 0) {
      this.clusterCenters = null;
      return;
    }

    // 简化的K-means初始化：随机选择初始中心
    const centers: number[][] = [];
    const dim = normalizedVectors[0].vector.length;
    
    for (let i = 0; i < numClusters; i++) {
      const randomIdx = Math.floor(Math.random() * normalizedVectors.length);
      centers.push([...normalizedVectors[randomIdx].vector]);
    }

    // 简化的K-means迭代（只迭代几次，避免太耗时）
    const maxIterations = 5;
    for (let iter = 0; iter < maxIterations; iter++) {
      const clusters: number[][] = Array(numClusters).fill(null).map(() => Array(dim).fill(0));
      const clusterCounts: number[] = Array(numClusters).fill(0);
      const assignments: number[] = [];

      // 分配每个向量到最近的聚类
      for (const { id, vector } of normalizedVectors) {
        let bestCluster = 0;
        let bestScore = -Infinity;

        for (let c = 0; c < numClusters; c++) {
          let dot = 0;
          for (let d = 0; d < dim; d++) {
            dot += vector[d] * centers[c][d];
          }
          if (dot > bestScore) {
            bestScore = dot;
            bestCluster = c;
          }
        }

        assignments.push(bestCluster);
        clusterCounts[bestCluster]++;
        for (let d = 0; d < dim; d++) {
          clusters[bestCluster][d] += vector[d];
        }
      }

      // 更新聚类中心
      let changed = false;
      for (let c = 0; c < numClusters; c++) {
        if (clusterCounts[c] > 0) {
          const newCenter = clusters[c].map(sum => sum / clusterCounts[c]);
          // 归一化新中心
          const norm = Math.sqrt(newCenter.reduce((s, x) => s + x * x, 0));
          if (norm > 0) {
            const normalizedCenter = newCenter.map(x => x / norm);
            // 检查是否改变
            if (!centers[c] || this.cosineSimilarity(centers[c], normalizedCenter) < 0.99) {
              changed = true;
            }
            centers[c] = normalizedCenter;
          }
        }
      }

      if (!changed) break;
    }

    // 保存聚类中心和向量分配
    this.clusterCenters = centers;
    this.vectorToCluster.clear();
    
    // 重新分配向量到聚类（使用最终的中心）
    for (let i = 0; i < normalizedVectors.length; i++) {
      const { id, vector } = normalizedVectors[i];
      let bestCluster = 0;
      let bestScore = -Infinity;

      for (let c = 0; c < numClusters; c++) {
        let dot = 0;
        for (let d = 0; d < dim; d++) {
          dot += vector[d] * centers[c][d];
        }
        if (dot > bestScore) {
          bestScore = dot;
          bestCluster = c;
        }
      }

      this.vectorToCluster.set(id, bestCluster);
    }

    this.logger.info(`IVF聚类构建完成: ${numClusters} 个聚类`);
  }

  /**
   * 构建倒排索引
   */
  private buildInvertedIndex(vectorIndex: VectorIndexItem[]): Map<string, VectorIndexItem[]> {
    const invertedIndex = new Map<string, VectorIndexItem[]>();

    for (const item of vectorIndex) {
      // 归一化向量
      const norm = Math.sqrt(item.vector.reduce((sum, x) => sum + x * x, 0));
      const normalizedVec = item.vector.map(x => x / norm);

      // 量化为桶key
      let bucketKey = '';
      for (let i = 0; i < this.ANN_CONFIG.bucketBits; i++) {
        const v = normalizedVec[i];
        const q = Math.floor(((v + 1) / 2) * 255);
        bucketKey += String.fromCharCode(q);
      }

      if (!invertedIndex.has(bucketKey)) {
        invertedIndex.set(bucketKey, []);
      }
      invertedIndex.get(bucketKey)!.push(item);
    }

    return invertedIndex;
  }

  /**
   * 关键词评分
   */
  private keywordScore(query: string, text: string): number {
    const keywords = query.toLowerCase().split(/\s+/);
    let score = 0;
    for (const word of keywords) {
      if (text.toLowerCase().includes(word)) score += 1;
    }
    return score / keywords.length;
  }

  /**
   * 混合评分
   */
  private hybridScore(cosSim: number, keywordSim: number, wVec = 0.7, wKey = 0.3): number {
    return cosSim * wVec + keywordSim * wKey;
  }

  /**
   * 重新排序结果
   */
  private rerankResults(queryEmbedding: readonly number[], candidates: QueryResult[]): QueryResult[] {
    // 简化实现：在实际应用中，这里应该使用更复杂的重排算法
    return candidates
      .map(r => ({
        ...r,
        rerankScore: r.cosSim // 使用余弦相似度作为重排分数
      }))
      .sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0));
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
   */
  private saveAll(): void {
    this.saveIndex();
    this.saveDocsInternal();
    this.saveVectorInfoInternal();
  }

  /**
   * 保存向量索引
   */
  private saveIndex(): void {
    try {
      if (fs.existsSync(this.config.indexPath)) {
        fs.unlinkSync(this.config.indexPath);
      }
      fs.writeFileSync(this.config.indexPath, JSON.stringify(this.vectorIndex));
    } catch (error) {
      logger.error('保存向量索引失败:', error);
    }
  }

  /**
   * 保存文档映射（私有方法，内部使用）
   */
  private saveDocsInternal(): void {
    try {
      if (fs.existsSync(this.config.docsPath)) {
        fs.unlinkSync(this.config.docsPath);
      }
      fs.writeFileSync(this.config.docsPath, JSON.stringify(Object.fromEntries(this.docIdToText)));
    } catch (error) {
      logger.error('保存文档映射失败:', error);
    }
  }

  /**
   * 保存向量信息（私有方法，内部使用）
   */
  private saveVectorInfoInternal(): void {
    try {
      if (fs.existsSync(this.config.vectorInfoPath)) {
        fs.unlinkSync(this.config.vectorInfoPath);
      }
      fs.writeFileSync(this.config.vectorInfoPath, JSON.stringify(this.vectorInfo, null, 2), 'utf-8');
    } catch (error) {
      logger.error('保存向量信息失败:', error);
    }
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
   * 保存文档映射
   */
  public saveDocs(): void {
    try {
      if (fs.existsSync(this.config.docsPath)) {
        fs.unlinkSync(this.config.docsPath);
      }
      fs.writeFileSync(this.config.docsPath, JSON.stringify(Object.fromEntries(this.docIdToText)));
    } catch (error) {
      logger.error('保存文档映射失败:', error);
    }
  }

  /**
   * 保存向量信息
   */
  public saveVectorInfo(): void {
    try {
      if (fs.existsSync(this.config.vectorInfoPath)) {
        fs.unlinkSync(this.config.vectorInfoPath);
      }
      fs.writeFileSync(this.config.vectorInfoPath, JSON.stringify(this.vectorInfo, null, 2), 'utf-8');
    } catch (error) {
      logger.error('保存向量信息失败:', error);
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
export const addFileToKnowledgeBase = (filePath: FilePath) => ragService.addFileToKnowledgeBase(filePath);
export const queryKnowledgeBase = (question: string, scoreThreshold?: number) => 
  ragService.queryKnowledgeBase(question, scoreThreshold);
export const removeFromIndex = (fileBaseName: string) => ragService.removeFromIndex(fileBaseName);
export const renameKnowledgeFile = (oldName: string, newName: string) => 
  ragService.renameKnowledgeFile(oldName, newName);
export const clearKnowledgeBase = () => ragService.clearKnowledgeBase();

// 导出配置访问
export const vectorIndex = ragService.getVectorIndex();
export const vectorInfo = ragService.getVectorInfo();

// 导出路径常量（使用 meta-doc-kb 文件夹）
const os = require('os');
const metaDocKbPath = path.join(os.homedir(), 'Documents', 'meta-doc-kb');
export const INDEX_PATH = path.join(metaDocKbPath, 'vector_index.json');
export const DOCS_PATH = path.join(metaDocKbPath, 'vector_docs.json');  
export const VECTOR_INFO_PATH = path.join(metaDocKbPath, 'vector_info.json');
