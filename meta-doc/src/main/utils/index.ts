/**
 * Utils 统一入口文件
 * 整合所有重构后的服务，提供统一的API接口
 */

import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { join } from 'path';
import { createMainLogger } from '../logger';
import { updateServiceStatus } from '../service-status';

const logger = createMainLogger('UtilsManager');

// ============ 服务实例导出 ============
export { default as pathService } from './path-service';
export { default as fileConversionService } from './file-conversion-service';
export { default as modelMergeService } from './model-merge-service';
export { default as latexService } from './latex-service';
export { default as ragService } from './rag-service';

// ============ 类型导出 ============
export type {
  // 通用类型
  FilePath,
  FileExtension,
  OperationResult,
  
  // RAG 相关类型
  VectorDimension,
  EmbeddingVector,
  DocumentId,
  DocumentChunk,
  VectorIndexItem,
  VectorDatabaseConfig,
  DocumentMetadata,
  VectorInfoMap,
  QueryResult,
  SearchConfig,
  FileUploadResult,
  KnowledgeItem,
  KnowledgeOperationResult,
  
  // LaTeX 相关类型
  LaTeXCompileResult,
  LaTeXCompileConfig,
  
  // 文件转换相关类型
  SupportedFileType,
  FileConversionResult,
  
  // 服务接口类型
  RAGService,
  FileConversionService,
  LaTeXService,
  PathService
} from '../../types/utils';

// ============ 向后兼容的API导出 ============

// 路径相关 - 保持原有API
export {
  getResourcesPath,
  getVectorDatabasePath
} from './path-service';

// 文件转换相关 - 保持原有API
export {
  tryConvertFileToText
} from './file-conversion-service';

// 模型合并相关 - 保持原有API
export {
  mergeModel
} from './model-merge-service';

// LaTeX编译相关 - 保持原有API
export {
  compileLatexToPDF
} from './latex-service';

// RAG相关 - 保持原有API
export {
  initVectorDatabase,
  addFileToKnowledgeBase,
  queryKnowledgeBase,
  removeFromIndex,
  renameKnowledgeFile,
  clearKnowledgeBase,
  vectorIndex,
  vectorInfo,
  INDEX_PATH,
  DOCS_PATH,
  VECTOR_INFO_PATH
} from './rag-service';

// 导出RAG服务实例的保存方法
import ragService from './rag-service';
import pathService from './path-service';
import latexService from './latex-service';
export const saveDocs = () => ragService.saveDocs();
export const saveVectorInfo = () => ragService.saveVectorInfo();
export const setEmbeddingMode = (mode: 'local' | 'api') => ragService.setEmbeddingMode(mode);
export const getEmbeddingMode = () => ragService.getEmbeddingMode();

// ============ 统一服务管理器 ============

/**
 * 工具服务管理器
 * 提供统一的初始化和管理功能
 */
export class UtilsManager {
  private static instance: UtilsManager;
  private initialized = false;

  private constructor() {}

  static getInstance(): UtilsManager {
    if (!UtilsManager.instance) {
      UtilsManager.instance = new UtilsManager();
    }
    return UtilsManager.instance;
  }

  /**
   * 初始化所有服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      updateServiceStatus('rag', 'ready');
      return;
    }

    try {
      logger.info('正在初始化工具服务');
      updateServiceStatus('rag', 'loading');

      // 初始化RAG服务（最重要的）
      logger.info('初始化 RAG 服务');
      await ragService.initVectorDatabase();

      this.initialized = true;
      logger.info('工具服务初始化完成');
      updateServiceStatus('rag', 'ready');

    } catch (error) {
      logger.error('工具服务初始化失败', error);
      updateServiceStatus('rag', 'error', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * 检查服务是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 重新初始化服务
   */
  async reinitialize(): Promise<void> {
    this.initialized = false;
    await this.initialize();
  }

  /**
   * 获取服务状态信息
   */
  async getStatus() {
    return {
      initialized: this.initialized,
      rag: {
        stats: ragService.getStats(),
        config: pathService.getConfig()
      },
      latex: {
        available: latexService.isTectonicAvailable(),
        version: await latexService.getTectonicVersion()
      }
    };
  }
}

// ============ 便捷函数 ============

/**
 * 快速初始化所有工具服务
 */
export const initializeUtils = async (): Promise<void> => {
  const manager = UtilsManager.getInstance();
  await manager.initialize();
};

/**
 * 获取工具服务管理器实例
 */
export const getUtilsManager = (): UtilsManager => {
  return UtilsManager.getInstance();
};

/**
 * 检查工具服务是否准备就绪
 */
export const isUtilsReady = (): boolean => {
  return UtilsManager.getInstance().isInitialized();
};
