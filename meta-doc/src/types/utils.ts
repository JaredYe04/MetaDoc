// TypeScript 类型定义文件 - utils 模块

import { BrowserWindow } from 'electron';

// ============ 通用类型 ============

/** 文件路径类型 */
export type FilePath = string;

/** 文件扩展名类型 */
export type FileExtension = '.txt' | '.md' | '.pdf' | '.docx';

/** 操作结果类型 */
export interface OperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============ RAG 相关类型 ============

/** 向量维度 */
export type VectorDimension = number;

/** 嵌入向量类型 */
export type EmbeddingVector = readonly number[];

/** 文档ID类型 */
export type DocumentId = string;

/** 文档块配置 */
export interface ChunkConfig {
  chunkSize: number;
  overlap: number;
  minLength?: number;
}

/** 文档块 */
export interface DocumentChunk {
  id: DocumentId;
  text: string;
  index: number;
  fileBaseName: string;
}

/** 向量索引项 */
export interface VectorIndexItem {
  id: DocumentId;
  vector: EmbeddingVector;
  docId?: string;
}

/** 向量数据库配置 */
export interface VectorDatabaseConfig {
  vectorLength: VectorDimension;
  databasePath: FilePath;
  indexPath: FilePath;
  docsPath: FilePath;
  vectorInfoPath: FilePath;
}

/** 文档元信息 */
export interface DocumentMetadata {
  chunks: number;
  vector_dim: VectorDimension;
  vector_count: number;
  enabled?: boolean;
}

/** 向量信息映射 */
export type VectorInfoMap = Record<string, DocumentMetadata>;

/** 查询结果 */
export interface QueryResult {
  id: DocumentId;
  text: string;
  cosSim: number;
  keywordSim?: number;
  hybridScore?: number;
  rerankScore?: number;
}

/** 搜索配置 */
export interface SearchConfig {
  topN: number;
  scoreThreshold: number;
  hybridWeights?: {
    vector: number;
    keyword: number;
  };
}

/** 嵌入缓存项 */
export interface EmbeddingCacheItem {
  hash: string;
  vector: EmbeddingVector;
}

/** 嵌入上下文接口 */
export interface EmbeddingContext {
  getEmbeddingFor(text: string): Promise<{ vector: readonly number[] }>;
}

/** ANN搜索配置 */
export interface ANNSearchConfig {
  bucketBits: number;
  bucketSize: number;
}

// ============ LaTeX 相关类型 ============

/** LaTeX 编译结果 */
export interface LaTeXCompileResult {
  status: 'success' | 'failed';
  pdfPath?: FilePath;
  exitCode?: number;
}

/** LaTeX 编译配置 */
export interface LaTeXCompileConfig {
  texFilePath: FilePath;
  tex: string;
  outputDir?: FilePath;
  mainWindow?: BrowserWindow;
  customPdfFileName?: string;
}

// ============ 文件转换相关类型 ============

/** 支持的文件类型 */
export type SupportedFileType = 'txt' | 'md' | 'pdf' | 'docx';

/** 文件转换结果 */
export interface FileConversionResult {
  success: boolean;
  text?: string;
  error?: string;
}

// ============ 模型合并相关类型 ============

/** 模型信息 */
export interface ModelInfo {
  name: string;
  exists: boolean;
  partFiles: string[];
}

/** 模型合并结果 */
export interface ModelMergeResult {
  success: boolean;
  mergedPath?: FilePath;
  error?: string;
}

// ============ 资源路径相关类型 ============

/** 路径配置 */
export interface PathConfig {
  resourcesPath: FilePath;
  vectorDatabasePath: FilePath;
  isPackaged: boolean;
}

// ============ 知识库API相关类型 ============

/** 知识库项目 */
export interface KnowledgeItem {
  id: string;
  name: string;
  info: {
    path: FilePath;
    size: number;
    sizeText: string;
    enabled?: boolean;
    chunks: number;
    vector_dim: VectorDimension;
    vector_count: number;
  };
}

/** 知识库操作结果 */
export interface KnowledgeOperationResult {
  success: boolean;
  message?: string;
  data?: any;
}

/** 文件上传结果 */
export interface FileUploadResult {
  success: boolean;
  message?: string;
  chunks?: number;
  vector_dim?: VectorDimension;
  vector_count?: number;
}

/** 文件重命名参数 */
export interface FileRenameParams {
  oldName: string;
  newName: string;
}

// ============ 工厂函数类型 ============

/** RAG服务接口 */
export interface RAGService {
  initVectorDatabase(): Promise<void>;
  addFileToKnowledgeBase(filePath: FilePath): Promise<FileUploadResult>;
  queryKnowledgeBase(question: string, scoreThreshold?: number): Promise<string[]>;
  removeFromIndex(fileBaseName: string): void;
  renameKnowledgeFile(oldName: string, newName: string): Promise<OperationResult>;
  clearKnowledgeBase(): Promise<void>;
}

/** 文件转换服务接口 */
export interface FileConversionService {
  convertFileToText(filePath: FilePath): Promise<string | null>;
  supportedTypes: readonly SupportedFileType[];
}

/** LaTeX编译服务接口 */
export interface LaTeXService {
  compileLatexToPDF(config: LaTeXCompileConfig): Promise<LaTeXCompileResult>;
}

/** 路径服务接口 */
export interface PathService {
  getResourcesPath(): FilePath;
  getVectorDatabasePath(): FilePath;
  getConfig(): PathConfig;
}
