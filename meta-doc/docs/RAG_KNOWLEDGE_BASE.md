# RAG 知识库系统文档

## 概述

RAG（检索增强生成）知识库系统是 MetaDoc 的核心功能之一，用于存储、索引和检索文档内容，为 AI 对话提供上下文信息。

### 架构演进

系统已从基于 JSON 文件的存储方式迁移到 **SQLite + sqlite-vec** 的现代化架构：

- **旧架构**：使用 JSON 文件（`vector_index.json`, `vector_docs.json`, `vector_info.json`）存储向量索引和文档映射
- **新架构**：使用 SQLite 数据库 + sqlite-vec 扩展进行向量存储和搜索

> **注意**：旧代码已迁移到 `rag-service-legacy.ts`，仅用于向后兼容和参考。

## 核心组件

### 1. RAG 服务 (`rag-service.ts`)

RAG 服务是知识库系统的核心，提供以下功能：

#### 主要功能

- **文件管理**：添加、删除、重命名知识库文件
- **向量生成**：将文档转换为向量嵌入（支持本地模型和 API 模式）
- **向量搜索**：使用优化的 ANN（近似最近邻）算法进行相似度搜索
- **混合检索**：结合向量相似度和关键词匹配的混合评分机制

#### 关键方法

```typescript
// 初始化向量数据库
await ragService.initVectorDatabase();

// 添加文件到知识库
await ragService.addFileToKnowledgeBase(
  filePath,
  progressCallback,
  abortSignal
);

// 查询知识库
const results = await ragService.queryKnowledgeBase(
  question,
  scoreThreshold
);

// 从索引中移除文档
ragService.removeFromIndex(fileBaseName);

// 重命名知识库文件
await ragService.renameKnowledgeFile(oldName, newName);

// 清空知识库
await ragService.clearKnowledgeBase();
```

### 2. 数据库层 (`knowledge-db.ts`)

数据库层提供知识库相关的数据库操作接口。

#### 数据模型

**knowledge_files 表**：存储知识库文件元信息
- `id`: 主键
- `filename`: 文件名（唯一）
- `original_path`: 原始文件路径
- `format`: 文件格式
- `enabled`: 是否启用（1/0）
- `chunks`: 数据块数量
- `vector_dim`: 向量维度
- `vector_count`: 向量数量
- `origin`: 来源（'local' 等）
- `created_at`, `updated_at`: 时间戳

**data_chunks 表**：存储文档分块
- `id`: 主键
- `knowledge_file_id`: 关联的知识库文件ID
- `chunk_index`: 块索引
- `chunk_text`: 块文本内容
- `vector_id`: 关联的向量ID
- `embedding_model`: 使用的嵌入模型
- `created_at`: 创建时间

**vectors 表**：存储向量嵌入
- `id`: 主键
- `chunk_id`: 关联的数据块ID（唯一）
- `embedding`: 向量数据（BLOB）
- `created_at`: 创建时间

**vec0_index 虚拟表**：sqlite-vec 扩展的向量索引表（如果可用）
- `chunk_id`: 数据块ID
- `embedding`: 向量数据（FLOAT32[768]）

#### 主要函数

```typescript
// 文件管理
createKnowledgeFile(filename, originalPath, format?, origin?)
getKnowledgeFileByFilename(filename)
getAllKnowledgeFiles()
updateKnowledgeFile(id, updates)
deleteKnowledgeFileByFilename(filename)
renameKnowledgeFileInDB(oldFilename, newFilename)
clearAllKnowledgeFiles()

// 数据块管理
createDataChunks(knowledgeFileId, chunks)
getDataChunksByFileId(knowledgeFileId)
deleteDataChunksByFileId(knowledgeFileId)

// 向量管理
createVectors(vectors)
getVectorsByFileId(knowledgeFileId)
deleteVectorsByFileId(knowledgeFileId)

// 向量搜索（使用sqlite-vec）
searchSimilarVectors(queryVector, topK?, threshold?, enabledOnly?)
```

### 3. 文件转换服务 (`file-conversion-service.ts`)

负责将各种格式的文件转换为文本，支持：
- PDF
- Word (docx)
- 图片（OCR）
- 纯文本
- 其他格式

## 工作流程

### 添加文件到知识库

1. **文件转换**：将文件转换为文本
2. **文本分块**：将文本分割成固定大小的块（默认 500 字符，重叠 50 字符）
3. **生成向量**：为每个块生成向量嵌入
   - **API 模式**：使用 SiliconFlow API（`netease-youdao/bce-embedding-base_v1`）
   - **本地模式**：使用本地模型（`bce-embedding-base_v1-Q8_0.gguf`）
4. **存储到数据库**：
   - 保存文件元信息到 `knowledge_files`
   - 保存数据块到 `data_chunks`
   - 保存向量到 `vectors` 和 `vec0_index`（如果可用）
5. **构建索引**：在内存中构建优化的 ANN 索引

### 查询知识库

1. **查询向量化**：将查询文本转换为向量
2. **ANN 搜索**：使用优化的多哈希 LSH + IVF 算法找到相似向量
3. **关键词匹配**：计算关键词匹配分数
4. **混合评分**：结合向量相似度（70%）和关键词匹配（30%）
5. **重排序**：对结果进行重新排序
6. **过滤**：根据阈值过滤低分结果

## 向量搜索算法

### 优化策略

系统使用多级优化策略提高搜索性能：

1. **多哈希 LSH**：使用 3 个哈希函数，每个使用 12 位（4096 个桶）
2. **IVF 聚类**：使用 K-means 聚类（16 个聚类中心）进行快速过滤
3. **候选限制**：限制候选数量（最多 200 个）避免过度计算
4. **快速预排序**：使用点积进行快速预排序

### 后备方案

- **小规模数据**（< 100 向量）：直接使用暴力搜索
- **sqlite-vec 不可用**：使用内存 ANN 算法
- **LSH 候选为空**：回退到快速点积预排序

## 配置参数

### 向量配置

- **向量维度**：768（bce-embedding-base_v1）
- **块大小**：500 字符
- **重叠大小**：50 字符
- **默认相似度阈值**：0.5

### ANN 搜索配置

```typescript
{
  numHashFunctions: 3,      // 哈希函数数量
  hashBits: 12,              // 每个哈希函数的位数（2^12 = 4096 桶）
  maxCandidates: 200,       // 最大候选数量
  numClusters: 16,           // IVF 聚类数量
  searchClusters: 4          // 每个查询搜索的聚类数量
}
```

### Embedding 模式

- **API 模式**（默认）：使用 SiliconFlow API
  - 需要配置 `SILICONFLOW_API_KEY` 环境变量
  - 模型：`netease-youdao/bce-embedding-base_v1`
  
- **本地模式**：使用本地模型
  - 模型文件：`bce-embedding-base_v1-Q8_0.gguf`
  - 需要先合并模型文件

切换模式：
```typescript
ragService.setEmbeddingMode('api');  // 或 'local'
const mode = ragService.getEmbeddingMode();
```

## 数据存储位置

### 数据库文件

- **位置**：`{userData}/database/meta-doc.db`
- **用户数据目录**：Electron 的 `app.getPath('userData')`

### 知识库文件

- **位置**：`~/Documents/meta-doc-kb/`
- **内容**：原始上传的文档文件

### 缓存

- **Embedding 缓存**：`~/Documents/meta-doc-kb/embedding_cache/cache.json`
- **用途**：缓存已生成的向量，避免重复计算

## 性能优化

### 1. 向量缓存

系统会缓存已生成的向量，避免重复计算相同文本的嵌入。

### 2. 索引缓存

倒排索引和 IVF 聚类中心会缓存在内存中，避免每次查询都重新构建。

### 3. 批量操作

- 批量创建数据块和向量
- 使用事务确保数据一致性

### 4. 渐进式加载

向量索引按需加载，只在查询时构建必要的索引结构。

## 错误处理

### 常见错误

1. **文件转换失败**：检查文件格式是否支持
2. **向量生成失败**：
   - API 模式：检查 API 密钥和网络连接
   - 本地模式：检查模型文件是否存在
3. **数据库错误**：检查数据库文件权限和磁盘空间
4. **sqlite-vec 不可用**：系统会自动回退到内存 ANN 算法

### 日志

所有操作都会记录日志，使用 `createMainLogger('RagService')` 创建日志器。

## 迁移指南

### 从旧版本迁移

如果系统检测到旧的 JSON 文件，可以：

1. **自动迁移**：系统会自动从数据库读取数据，忽略 JSON 文件
2. **清理旧文件**：使用 `rag-service-legacy.ts` 中的 `cleanupLegacyJsonFiles()` 函数

### 数据备份

建议定期备份：
- 数据库文件：`{userData}/database/meta-doc.db`
- 知识库文件：`~/Documents/meta-doc-kb/`

## 最佳实践

1. **文件大小**：建议单个文件不超过 10MB
2. **文件格式**：优先使用 PDF、Word 或纯文本
3. **定期清理**：删除不再需要的文件以节省空间
4. **启用/禁用**：可以禁用不需要的文件而不删除，保留历史记录
5. **相似度阈值**：根据实际需求调整阈值（默认 0.5）

## 扩展开发

### 添加新的文件格式支持

1. 在 `file-conversion-service.ts` 中添加新的转换器
2. 实现 `convertFileToText()` 方法
3. 注册到转换服务中

### 自定义搜索算法

1. 继承或修改 `RAGServiceImpl` 类
2. 重写 `annSearch()` 或 `optimizedAnnSearch()` 方法
3. 实现自定义的搜索逻辑

### 添加新的嵌入模型

1. 修改 `VECTOR_LEN` 常量（如果维度不同）
2. 更新 `embedText()` 方法支持新模型
3. 更新数据库 schema（如果需要）

## 相关文件

- `src/main/utils/rag-service.ts` - RAG 服务主文件
- `src/main/utils/rag-service-legacy.ts` - 遗留代码（已废弃）
- `src/main/database/knowledge-db.ts` - 数据库访问层
- `src/main/utils/file-conversion-service.ts` - 文件转换服务
- `src/main/database/schemas.ts` - 数据库表结构定义

## 故障排查

### 问题：查询返回空结果

1. 检查是否有启用的文件：`ragService.getStats()`
2. 降低相似度阈值：`queryKnowledgeBase(question, 0.3)`
3. 检查向量是否正确生成：查看数据库中的 `vector_count`

### 问题：添加文件失败

1. 检查文件格式是否支持
2. 查看日志中的错误信息
3. 检查磁盘空间和文件权限

### 问题：搜索速度慢

1. 检查向量数量：大量向量可能需要更长时间
2. 考虑使用 sqlite-vec 扩展（如果可用）
3. 调整 ANN 搜索配置参数

## 更新日志

- **v2.0**：迁移到 SQLite + sqlite-vec 架构
- **v1.0**：基于 JSON 文件的初始实现

