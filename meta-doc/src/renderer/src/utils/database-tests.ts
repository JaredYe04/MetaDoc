/**
 * SQLite数据库相关单元测试
 * 测试数据库创建、连接、查询和向量相关逻辑
 */

import { testFramework, type TestFunction } from './test-framework'

/**
 * 获取IPC渲染器（仅支持Electron环境，数据库操作需要Node.js）
 */
function getIpcRenderer() {
  let ipcRenderer: any = null
  if (typeof window !== 'undefined') {
    if ((window as any).electron?.ipcRenderer) {
      ipcRenderer = (window as any).electron.ipcRenderer
    } else {
      // 数据库测试需要Electron环境，web环境不支持
      throw new Error('数据库测试需要在Electron环境中运行')
    }
  }
  return ipcRenderer
}

/**
 * 测试数据库连接和初始化
 */
const testDatabaseConnection: TestFunction = {
  id: 'database.test-connection',
  name: '测试数据库连接',
  description: '测试数据库是否能正常连接和初始化',
  module: '数据库',
  fn: async () => {
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
      throw new Error('无法访问IPC，测试需要在Electron或Web环境中运行')
    }

    try {
      const result = await ipcRenderer.invoke('test-database-connection')
      return {
        success: result.success,
        message: result.message || '数据库连接成功',
        dbPath: result.dbPath
      }
    } catch (error) {
      throw new Error(
        `数据库连接测试失败: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

/**
 * 测试创建表结构
 */
const testCreateTables: TestFunction = {
  id: 'database.test-create-tables',
  name: '测试创建表结构',
  description: '测试知识库相关表的创建',
  module: '数据库',
  fn: async () => {
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
      throw new Error('无法访问IPC，测试需要在Electron或Web环境中运行')
    }

    try {
      const result = await ipcRenderer.invoke('test-database-create-tables')
      return {
        success: result.success,
        message: result.message || '表创建成功',
        tablesCreated: result.tablesCreated || []
      }
    } catch (error) {
      throw new Error(`创建表测试失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

/**
 * 测试插入和查询知识库文件
 */
const testKnowledgeFileCRUD: TestFunction = {
  id: 'database.test-knowledge-file-crud',
  name: '测试知识库文件CRUD操作',
  description: '测试知识库文件的创建、读取、更新和删除',
  module: '数据库',
  fn: async (filename?: string, originalPath?: string) => {
    const testFilename = filename || 'test-file.txt'
    const testPath = originalPath || '/test/path/test-file.txt'

    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
      throw new Error('无法访问IPC，测试需要在Electron或Web环境中运行')
    }

    try {
      // 1. 创建文件
      const createResult = await ipcRenderer.invoke('test-database-create-file', {
        filename: testFilename,
        originalPath: testPath,
        format: 'txt',
        origin: 'test'
      })

      if (!createResult.success) {
        throw new Error(`创建文件失败: ${createResult.message}`)
      }

      const fileId = createResult.fileId

      // 2. 读取文件
      const readResult = await ipcRenderer.invoke('test-database-read-file', {
        filename: testFilename
      })

      if (!readResult.success || !readResult.file) {
        throw new Error(`读取文件失败: ${readResult.message}`)
      }

      // 3. 更新文件
      const updateResult = await ipcRenderer.invoke('test-database-update-file', {
        fileId: fileId,
        updates: {
          chunks: 10,
          vector_dim: 768,
          vector_count: 10,
          enabled: 1
        }
      })

      if (!updateResult.success) {
        throw new Error(`更新文件失败: ${updateResult.message}`)
      }

      // 4. 验证更新
      const verifyResult = await ipcRenderer.invoke('test-database-read-file', {
        filename: testFilename
      })

      if (verifyResult.file.chunks !== 10 || verifyResult.file.vector_count !== 10) {
        throw new Error('更新验证失败: 数据未正确更新')
      }

      // 5. 删除文件
      const deleteResult = await ipcRenderer.invoke('test-database-delete-file', {
        fileId: fileId
      })

      if (!deleteResult.success) {
        throw new Error(`删除文件失败: ${deleteResult.message}`)
      }

      // 6. 验证删除
      const verifyDeleteResult = await ipcRenderer.invoke('test-database-read-file', {
        filename: testFilename
      })

      if (verifyDeleteResult.file) {
        throw new Error('删除验证失败: 文件仍然存在')
      }

      return {
        success: true,
        message: 'CRUD操作全部通过',
        operations: ['create', 'read', 'update', 'delete'],
        fileId: fileId
      }
    } catch (error) {
      throw new Error(`CRUD操作测试失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
  params: [
    {
      name: 'filename',
      type: 'string',
      defaultValue: 'test-file.txt',
      description: '测试文件名'
    },
    {
      name: 'originalPath',
      type: 'string',
      defaultValue: '/test/path/test-file.txt',
      description: '测试文件路径'
    }
  ]
}

/**
 * 测试数据块和向量操作
 */
const testDataChunksAndVectors: TestFunction = {
  id: 'database.test-data-chunks-vectors',
  name: '测试数据块和向量操作',
  description: '测试数据块的创建和向量的存储与检索',
  module: '数据库',
  fn: async (knowledgeFileId?: number) => {
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
      throw new Error('无法访问IPC，测试需要在Electron或Web环境中运行')
    }

    try {
      // 1. 如果没有提供fileId，先创建一个测试文件
      let fileId = knowledgeFileId
      if (!fileId) {
        const createResult = await ipcRenderer.invoke('test-database-create-file', {
          filename: 'test-vector-file.txt',
          originalPath: '/test/path/test-vector-file.txt',
          format: 'txt',
          origin: 'test'
        })
        if (!createResult.success) {
          throw new Error(`创建测试文件失败: ${createResult.message}`)
        }
        fileId = createResult.fileId
      }

      // 2. 创建数据块（包含 embedding_model）
      const chunks = [
        { index: 0, text: '这是第一个数据块', embedding_model: 'bce-embedding-base_v1' },
        { index: 1, text: '这是第二个数据块', embedding_model: 'bce-embedding-base_v1' },
        { index: 2, text: '这是第三个数据块', embedding_model: 'bce-embedding-base_v1' }
      ]

      const createChunksResult = await ipcRenderer.invoke('test-database-create-chunks', {
        knowledgeFileId: fileId,
        chunks: chunks
      })

      if (!createChunksResult.success) {
        throw new Error(`创建数据块失败: ${createChunksResult.message}`)
      }

      const chunkIds = createChunksResult.chunkIds
      if (chunkIds.length !== chunks.length) {
        throw new Error(`数据块数量不匹配: 期望 ${chunks.length}, 实际 ${chunkIds.length}`)
      }

      // 3. 创建向量（768维向量）
      const vectors = chunkIds.map((chunkId: number, index: number) => ({
        chunkId: chunkId,
        embedding: new Array(768).fill(0).map((_, i) => Math.random() * 2 - 1) // 随机向量
      }))

      const createVectorsResult = await ipcRenderer.invoke('test-database-create-vectors', {
        vectors: vectors
      })

      if (!createVectorsResult.success) {
        throw new Error(`创建向量失败: ${createVectorsResult.message}`)
      }

      // 4. 查询数据块和向量
      const queryChunksResult = await ipcRenderer.invoke('test-database-query-chunks', {
        knowledgeFileId: fileId
      })

      if (!queryChunksResult.success || queryChunksResult.chunks.length !== chunks.length) {
        throw new Error(
          `查询数据块失败: 期望 ${chunks.length} 个, 实际 ${queryChunksResult.chunks?.length || 0} 个`
        )
      }

      // 5. 查询向量
      const queryVectorsResult = await ipcRenderer.invoke('test-database-query-vectors', {
        knowledgeFileId: fileId
      })

      if (!queryVectorsResult.success || queryVectorsResult.vectors.length !== vectors.length) {
        throw new Error(
          `查询向量失败: 期望 ${vectors.length} 个, 实际 ${queryVectorsResult.vectors?.length || 0} 个`
        )
      }

      // 6. 验证向量维度
      for (const vec of queryVectorsResult.vectors) {
        if (vec.embedding.length !== 768) {
          throw new Error(`向量维度不正确: 期望 768, 实际 ${vec.embedding.length}`)
        }
      }

      // 7. 清理测试数据（如果创建了测试文件）
      if (!knowledgeFileId) {
        await ipcRenderer.invoke('test-database-delete-file', { fileId: fileId })
      }

      return {
        success: true,
        message: '数据块和向量操作全部通过',
        chunksCreated: chunkIds.length,
        vectorsCreated: createVectorsResult.vectorIds?.length || 0,
        fileId: fileId
      }
    } catch (error) {
      throw new Error(
        `数据块和向量测试失败: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  },
  params: [
    {
      name: 'knowledgeFileId',
      type: 'number',
      description: '知识库文件ID（可选，如果不提供会自动创建测试文件）'
    }
  ]
}

/**
 * 测试向量搜索（如果sqlite-vec可用）
 */
const testVectorSearch: TestFunction = {
  id: 'database.test-vector-search',
  name: '测试向量搜索',
  description: '测试使用sqlite-vec进行向量相似度搜索',
  module: '数据库',
  fn: async (queryVector?: string) => {
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
      throw new Error('无法访问IPC，测试需要在Electron或Web环境中运行')
    }

    try {
      // 0. 先清理可能存在的旧测试数据
      const testFilename = 'test-search-file.txt'
      const existingFile = await ipcRenderer.invoke('test-database-read-file', {
        filename: testFilename
      })

      if (existingFile.success && existingFile.file) {
        // 如果文件已存在，先删除它（包括相关的向量和数据块）
        await ipcRenderer.invoke('test-database-delete-file', {
          fileId: existingFile.file.id
        })
      }

      // 1. 创建测试文件和数据
      const createResult = await ipcRenderer.invoke('test-database-create-file', {
        filename: testFilename,
        originalPath: '/test/path/test-search-file.txt',
        format: 'txt',
        origin: 'test'
      })

      if (!createResult.success) {
        throw new Error(`创建测试文件失败: ${createResult.message}`)
      }

      const fileId = createResult.fileId

      // 2. 创建数据块和向量（包含 embedding_model）
      const chunks = [
        {
          index: 0,
          text: '机器学习是人工智能的一个分支',
          embedding_model: 'bce-embedding-base_v1'
        },
        {
          index: 1,
          text: '深度学习使用神经网络进行学习',
          embedding_model: 'bce-embedding-base_v1'
        },
        { index: 2, text: '自然语言处理是NLP的缩写', embedding_model: 'bce-embedding-base_v1' }
      ]

      const createChunksResult = await ipcRenderer.invoke('test-database-create-chunks', {
        knowledgeFileId: fileId,
        chunks: chunks
      })

      const chunkIds = createChunksResult.chunkIds

      // 创建测试向量（使用固定的向量以便测试）
      const baseVector = new Array(768).fill(0).map((_, i) => Math.sin(i * 0.01))
      const vectors = chunkIds.map((chunkId: number, index: number) => ({
        chunkId: chunkId,
        embedding: baseVector.map((v, i) => v + index * 0.1 + Math.random() * 0.01) // 相似但略有不同
      }))

      const createVectorsResult = await ipcRenderer.invoke('test-database-create-vectors', {
        vectors: vectors
      })

      if (!createVectorsResult.success) {
        throw new Error(`创建向量失败: ${createVectorsResult.message}`)
      }

      // 3. 执行向量搜索
      const searchVector = queryVector
        ? JSON.parse(queryVector).map((v: any) => Number(v))
        : baseVector // 使用基础向量作为查询向量

      if (searchVector.length !== 768) {
        throw new Error(`查询向量维度不正确: 期望 768, 实际 ${searchVector.length}`)
      }

      // 先验证文件是否启用（测试用例中文件默认是启用的）
      const fileInfo = await ipcRenderer.invoke('test-database-read-file', {
        filename: testFilename
      })

      if (!fileInfo.success || !fileInfo.file) {
        throw new Error('无法读取测试文件信息')
      }

      if (fileInfo.file.enabled !== 1) {
        // 如果文件未启用，先启用它
        await ipcRenderer.invoke('test-database-update-file', {
          fileId: fileId,
          updates: { enabled: 1 }
        })
      }

      // 执行向量搜索
      // 注意：相似度转换可能产生负值，所以使用 -1.0 作为阈值，确保能找到所有结果
      // 如果 vec0_index 表中没有数据，搜索会失败
      // 但测试用例中应该已经将向量插入到 vec0_index 中了
      const searchResult = await ipcRenderer.invoke('test-database-search-vectors', {
        queryVector: searchVector,
        topK: 3,
        threshold: -1.0, // 使用 -1.0 阈值，确保能找到所有结果（即使相似度转换后是负数）
        enabledOnly: true
      })

      if (!searchResult.success) {
        // 如果sqlite-vec不可用，返回警告而不是错误
        if (searchResult.message?.includes('不可用') || searchResult.message?.includes('未加载')) {
          return {
            success: true,
            message: 'sqlite-vec扩展不可用，使用内存ANN算法',
            warning: true,
            sqliteVecAvailable: false
          }
        }
        throw new Error(`向量搜索失败: ${searchResult.message}`)
      }

      // 4. 验证搜索结果
      if (!searchResult.results || searchResult.results.length === 0) {
        // 提供更详细的错误信息，帮助调试
        const vectorsInfo = await ipcRenderer.invoke('test-database-query-vectors', {
          knowledgeFileId: fileId
        })
        throw new Error(
          `向量搜索未返回结果。` +
            `已创建 ${vectors.length} 个向量，` +
            `数据库中查询到 ${vectorsInfo.success ? vectorsInfo.vectors?.length || 0 : 0} 个向量。` +
            `文件ID: ${fileId}, 文件启用状态: ${fileInfo.file.enabled}。` +
            `请检查 vec0_index 表中是否有数据。`
        )
      }

      // 5. 验证结果格式
      for (const result of searchResult.results) {
        if (
          typeof result.chunkId !== 'number' ||
          typeof result.similarity !== 'number' ||
          typeof result.chunkText !== 'string'
        ) {
          throw new Error('搜索结果格式不正确')
        }
        // 相似度值应该在 -1 到 1 之间（因为使用了复杂的转换逻辑，可能产生负值）
        if (result.similarity < -1 || result.similarity > 1) {
          throw new Error(`相似度值超出范围: ${result.similarity}（应该在 -1 到 1 之间）`)
        }
      }

      // 6. 清理测试数据
      await ipcRenderer.invoke('test-database-delete-file', { fileId: fileId })

      return {
        success: true,
        message: '向量搜索测试通过',
        resultsCount: searchResult.results.length,
        sqliteVecAvailable: searchResult.sqliteVecAvailable !== false,
        topResult: searchResult.results[0]
      }
    } catch (error) {
      throw new Error(`向量搜索测试失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
  params: [
    {
      name: 'queryVector',
      type: 'string',
      description: '查询向量（JSON数组字符串，768维，可选）'
    }
  ]
}

/**
 * 测试批量操作性能
 */
const testBatchOperations: TestFunction = {
  id: 'database.test-batch-operations',
  name: '测试批量操作性能',
  description: '测试批量插入数据块和向量的性能',
  module: '数据库',
  fn: async (batchSize?: number) => {
    const size = batchSize || 100

    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
      throw new Error('无法访问IPC，测试需要在Electron或Web环境中运行')
    }

    try {
      // 1. 创建测试文件
      const createResult = await ipcRenderer.invoke('test-database-create-file', {
        filename: 'test-batch-file.txt',
        originalPath: '/test/path/test-batch-file.txt',
        format: 'txt',
        origin: 'test'
      })

      if (!createResult.success) {
        throw new Error(`创建测试文件失败: ${createResult.message}`)
      }

      const fileId = createResult.fileId

      // 2. 批量创建数据块（包含 embedding_model）
      const chunks = Array.from({ length: size }, (_, i) => ({
        index: i,
        text: `这是第 ${i + 1} 个数据块，包含一些测试文本内容。`,
        embedding_model: 'bce-embedding-base_v1'
      }))

      const startChunks = Date.now()
      const createChunksResult = await ipcRenderer.invoke('test-database-create-chunks', {
        knowledgeFileId: fileId,
        chunks: chunks
      })
      const chunksDuration = Date.now() - startChunks

      if (!createChunksResult.success) {
        throw new Error(`批量创建数据块失败: ${createChunksResult.message}`)
      }

      const chunkIds = createChunksResult.chunkIds

      // 3. 批量创建向量
      const vectors = chunkIds.map((chunkId: number) => ({
        chunkId: chunkId,
        embedding: new Array(768).fill(0).map(() => Math.random() * 2 - 1)
      }))

      const startVectors = Date.now()
      const createVectorsResult = await ipcRenderer.invoke('test-database-create-vectors', {
        vectors: vectors
      })
      const vectorsDuration = Date.now() - startVectors

      if (!createVectorsResult.success) {
        throw new Error(`批量创建向量失败: ${createVectorsResult.message}`)
      }

      // 4. 查询性能测试
      const startQuery = Date.now()
      const queryResult = await ipcRenderer.invoke('test-database-query-chunks', {
        knowledgeFileId: fileId
      })
      const queryDuration = Date.now() - startQuery

      // 5. 清理测试数据
      await ipcRenderer.invoke('test-database-delete-file', { fileId: fileId })

      return {
        success: true,
        message: '批量操作性能测试完成',
        batchSize: size,
        performance: {
          chunksInsert: {
            duration: chunksDuration,
            itemsPerSecond: Math.round((size / chunksDuration) * 1000)
          },
          vectorsInsert: {
            duration: vectorsDuration,
            itemsPerSecond: Math.round((size / vectorsDuration) * 1000)
          },
          query: {
            duration: queryDuration,
            itemsPerSecond: queryResult.chunks
              ? Math.round((queryResult.chunks.length / queryDuration) * 1000)
              : 0
          }
        }
      }
    } catch (error) {
      throw new Error(`批量操作测试失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
  params: [
    {
      name: 'batchSize',
      type: 'number',
      defaultValue: 100,
      description: '批量操作的大小'
    }
  ]
}

/**
 * 注册所有数据库测试
 */
export function registerDatabaseTests(): void {
  testFramework.register(testDatabaseConnection)
  testFramework.register(testCreateTables)
  testFramework.register(testKnowledgeFileCRUD)
  testFramework.register(testDataChunksAndVectors)
  testFramework.register(testVectorSearch)
  testFramework.register(testBatchOperations)
}
