/**
 * 向后兼容导出文件
 * 为原有的JavaScript文件提供兼容的API
 * 这个文件允许现有代码在不修改的情况下继续工作
 */

// 导入新的TypeScript服务
const pathService = require('./path-service').default;
const fileConversionService = require('./file-conversion-service').default;
const modelMergeService = require('./model-merge-service').default;
const latexService = require('./latex-service').default;
const ragService = require('./rag-service').default;

// ============ RAG Utils 兼容性导出 ============

// 配置常量
const VECTOR_LEN = 768;

// 导出原有的API
module.exports = {
  // 路径相关
  getResourcesPath: () => pathService.getResourcesPath(),
  getVectorDatabasePath: () => pathService.getVectorDatabasePath(),

  // 文件转换相关
  tryConvertFileToText: (filePath) => fileConversionService.convertFileToText(filePath),

  // 模型合并相关
  mergeModel: (modelFileName) => modelMergeService.mergeModel(modelFileName),

  // LaTeX编译相关
  compileLatexToPDF: (texFilePath, tex, outputDir, mainWindow, customPdfFileName) =>
    latexService.compileLatexToPDF({
      texFilePath,
      tex,
      outputDir,
      mainWindow,
      customPdfFileName
    }),

  // RAG相关
  initVectorDatabase: () => ragService.initVectorDatabase(),
  addFileToKnowledgeBase: (filePath) => ragService.addFileToKnowledgeBase(filePath),
  queryKnowledgeBase: (question, scoreThreshold) => ragService.queryKnowledgeBase(question, scoreThreshold),
  removeFromIndex: (fileBaseName) => ragService.removeFromIndex(fileBaseName),
  renameKnowledgeFile: (oldName, newName) => ragService.renameKnowledgeFile(oldName, newName),
  clearKnowledgeBase: () => ragService.clearKnowledgeBase(),

  // 访问器 - 使用getter确保获取最新状态
  get vectorIndex() {
    return ragService.getVectorIndex();
  },
  get vectorInfo() {
    return ragService.getVectorInfo();
  },
  get docIdToText() {
    return ragService.getDocuments();
  },

  // 路径常量
  get INDEX_PATH() {
    return pathService.getVectorDatabaseFile('vector_index.json');
  },
  get DOCS_PATH() {
    return pathService.getVectorDatabaseFile('vector_docs.json');
  },
  get VECTOR_INFO_PATH() {
    return pathService.getVectorDatabaseFile('vector_info.json');
  },

  // 导出常量
  VECTOR_LEN,

  // ANN Utils 兼容性导出
  cosineSimilarity: (vecA, vecB) => {
    // 从RAG服务的私有方法中提取逻辑
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] ** 2;
      normB += vecB[i] ** 2;
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  },

  // 简化的ANN搜索实现（如果需要单独使用）
  annSearch: (queryEmbedding, vectorIndex, docIdToText, topN = 30) => {
    // 简化实现，直接计算余弦相似度
    const results = vectorIndex
      .map(({ id, vector }) => ({
        id,
        cosSim: module.exports.cosineSimilarity(queryEmbedding, vector),
        text: docIdToText instanceof Map ? docIdToText.get(id) || '' : (docIdToText[id] || ''),
      }))
      .sort((a, b) => b.cosSim - a.cosSim)
      .slice(0, topN);
    
    return results;
  },

  buildInvertedIndex: (vectorIndex) => {
    // 简化的倒排索引实现
    const BUCKET_BITS = 8;
    const invertedIndex = new Map();

    for (const item of vectorIndex) {
      // 归一化向量
      const norm = Math.sqrt(item.vector.reduce((sum, x) => sum + x * x, 0));
      const normalizedVec = item.vector.map(x => x / norm);

      // 量化为桶key
      let bucketKey = '';
      for (let i = 0; i < BUCKET_BITS; i++) {
        const v = normalizedVec[i];
        const q = Math.floor(((v + 1) / 2) * 255);
        bucketKey += String.fromCharCode(q);
      }

      if (!invertedIndex.has(bucketKey)) {
        invertedIndex.set(bucketKey, []);
      }
      invertedIndex.get(bucketKey).push(item);
    }

    return invertedIndex;
  }
};

// 为了向后兼容，也以ES6模块的方式导出
if (typeof exports !== 'undefined') {
  Object.assign(exports, module.exports);
}
