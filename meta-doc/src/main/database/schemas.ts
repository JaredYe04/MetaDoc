/**
 * 数据库表结构定义（DDL语句）
 * 统一管理所有表的创建语句
 */

/**
 * 知识库文件表
 */
export const KNOWLEDGE_FILES_TABLE = `
CREATE TABLE IF NOT EXISTS knowledge_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL UNIQUE,
  original_path TEXT NOT NULL,
  format TEXT,
  enabled INTEGER DEFAULT 1,
  chunks INTEGER DEFAULT 0,
  vector_dim INTEGER DEFAULT 0,
  vector_count INTEGER DEFAULT 0,
  origin TEXT DEFAULT 'local',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

/**
 * 数据块表（存储chunk文本和向量）
 */
export const DATA_CHUNKS_TABLE = `
CREATE TABLE IF NOT EXISTS data_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  knowledge_file_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  vector_id INTEGER,
  embedding_model TEXT DEFAULT 'bce-embedding-base_v1',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(knowledge_file_id, chunk_index),
  FOREIGN KEY (knowledge_file_id) REFERENCES knowledge_files(id) ON DELETE CASCADE
);
`;

/**
 * 向量表（使用sqlite-vec扩展）
 * 注意：sqlite-vec需要在运行时加载，这里先创建表结构
 * 实际的向量索引需要在sqlite-vec加载后创建
 */
export const VECTORS_TABLE = `
CREATE TABLE IF NOT EXISTS vectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chunk_id INTEGER NOT NULL UNIQUE,
  embedding BLOB NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chunk_id) REFERENCES data_chunks(id) ON DELETE CASCADE
);
`;

/**
 * 创建sqlite-vec虚拟表（如果扩展可用）
 * 这个表用于高效的向量搜索
 */
export const VEC0_VIRTUAL_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS vec0_index USING vec0(
  chunk_id INTEGER,
  embedding FLOAT32[768]
);
`;

/**
 * 创建索引
 */
export const CREATE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_knowledge_files_filename ON knowledge_files(filename);`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_files_enabled ON knowledge_files(enabled);`,
  `CREATE INDEX IF NOT EXISTS idx_data_chunks_file_id ON data_chunks(knowledge_file_id);`,
  `CREATE INDEX IF NOT EXISTS idx_data_chunks_file_index ON data_chunks(knowledge_file_id, chunk_index);`,
  `CREATE INDEX IF NOT EXISTS idx_vectors_chunk_id ON vectors(chunk_id);`
];

/**
 * 获取所有DDL语句
 */
export function getAllDDLStatements(): string[] {
  return [
    KNOWLEDGE_FILES_TABLE,
    DATA_CHUNKS_TABLE,
    VECTORS_TABLE,
    ...CREATE_INDEXES
  ];
}

/**
 * 获取sqlite-vec相关的DDL语句（需要在扩展加载后执行）
 */
export function getVec0DDLStatements(): string[] {
  return [
    VEC0_VIRTUAL_TABLE
  ];
}

