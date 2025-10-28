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

/**
 * RAG 服务实现类
 */
class RAGServiceImpl implements RAGService {
  // 配置常量
  private readonly VECTOR_LEN: VectorDimension = 768;
  private readonly CHUNK_SIZE = 500;
  private readonly DEFAULT_OVERLAP = 50;
  private readonly DEFAULT_SCORE_THRESHOLD = 0.5;
  
  // ANN 搜索配置
  private readonly ANN_CONFIG: ANNSearchConfig = {
    bucketBits: 8,
    bucketSize: 256
  };

  // 路径配置
  private readonly config: VectorDatabaseConfig;

  // 内存状态
  private vectorIndex: VectorIndexItem[] = [];
  private docIdToText: Map<DocumentId, string> = new Map();
  private vectorInfo: VectorInfoMap = {};
  private embeddingContext: EmbeddingContext | null = null;
  private embedCache: Record<string, number[]> = {};

  // 缓存配置
  private readonly cacheDir: FilePath;
  private readonly cacheFile: FilePath;

  constructor() {
    const vectorDatabasePath = pathService.getVectorDatabasePath();
    
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

      console.log(`向量数据库初始化完成: ${this.docIdToText.size} 个文档`);
    } catch (error) {
      console.error('向量数据库初始化失败:', error);
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
          console.warn(`向量维度不匹配: 期望 ${this.VECTOR_LEN}, 实际 ${vector.length}`);
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

      return {
        success: true,
        chunks: chunks.length,
        vector_dim: this.VECTOR_LEN,
        vector_count: this.vectorIndex.length
      };

    } catch (error) {
      console.error('添加文件到知识库失败:', error);
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
      console.warn('知识库查询未返回高相似度结果');
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

    console.log(`文档 ${fileBaseName} 已从向量索引中删除`);
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
      return { success: true };

    } catch (error) {
      console.error('重命名失败:', error);
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
    this.vectorIndex = [];
    this.docIdToText.clear();
    this.vectorInfo = {};
    this.saveAll();
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
   * 初始化嵌入模型
   */
  private async initEmbedder(modelFileName = "bce-embedding-base_v1-Q8_0.gguf"): Promise<void> {
    const { getLlama } = await import("node-llama-cpp");

    console.log(`🔄 正在合并模型 ${modelFileName}...`);
    const mergedPath = await modelMergeService.mergeModel(modelFileName);

    console.log(`📂 从 ${mergedPath} 加载模型...`);
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
    console.log("✅ 嵌入上下文初始化完成");
  }

  /**
   * 生成文本嵌入向量
   */
  private async embedText(text: string): Promise<readonly number[]> {
    if (!this.embeddingContext) {
      await this.initEmbedder();
    }

    const embedding = await this.embeddingContext!.getEmbeddingFor(text);
    return embedding.vector;
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
   * ANN搜索
   */
  private annSearch(
    queryEmbedding: readonly number[],
    vectorIndex: VectorIndexItem[],
    topN = 30
  ): QueryResult[] {
    // 构建倒排索引
    const invertedIndex = this.buildInvertedIndex(vectorIndex);

    // 归一化查询向量
    const norm = Math.sqrt(queryEmbedding.reduce((sum, x) => sum + x * x, 0));
    const normalizedQuery = queryEmbedding.map(x => x / norm);

    // 量化查询向量
    let bucketKey = '';
    for (let i = 0; i < this.ANN_CONFIG.bucketBits; i++) {
      const v = normalizedQuery[i];
      const q = Math.floor(((v + 1) / 2) * 255);
      bucketKey += String.fromCharCode(q);
    }

    // 获取候选项
    let candidates = invertedIndex.get(bucketKey) || [];
    if (candidates.length < topN) {
      candidates = vectorIndex;
    }

    // 计算相似度并排序
    return candidates
      .map(({ id, vector }) => ({
        id,
        cosSim: this.cosineSimilarity(queryEmbedding, vector),
        text: this.docIdToText.get(id) || '',
      }))
      .sort((a, b) => b.cosSim - a.cosSim)
      .slice(0, topN);
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
        console.error('读取嵌入缓存失败:', error);
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
      console.error('保存嵌入缓存失败:', error);
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
      console.error('保存向量索引失败:', error);
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
      console.error('保存文档映射失败:', error);
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
      console.error('保存向量信息失败:', error);
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
      console.error('保存文档映射失败:', error);
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
      console.error('保存向量信息失败:', error);
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

// 导出路径常量
export const INDEX_PATH = pathService.getVectorDatabaseFile('vector_index.json');
export const DOCS_PATH = pathService.getVectorDatabaseFile('vector_docs.json');  
export const VECTOR_INFO_PATH = pathService.getVectorDatabaseFile('vector_info.json');
