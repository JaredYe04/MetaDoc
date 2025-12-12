-- Migration: 初始数据库表结构
-- Created: 2024-01-01T00:00:00.000Z
-- Description: 创建所有基础表结构和索引

-- 知识库文件表
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

-- 数据块表
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

-- 向量表
CREATE TABLE IF NOT EXISTS vectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chunk_id INTEGER NOT NULL UNIQUE,
  embedding BLOB NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chunk_id) REFERENCES data_chunks(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_knowledge_files_filename ON knowledge_files(filename);
CREATE INDEX IF NOT EXISTS idx_knowledge_files_enabled ON knowledge_files(enabled);
CREATE INDEX IF NOT EXISTS idx_data_chunks_file_id ON data_chunks(knowledge_file_id);
CREATE INDEX IF NOT EXISTS idx_data_chunks_file_index ON data_chunks(knowledge_file_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_vectors_chunk_id ON vectors(chunk_id);

