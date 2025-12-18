-- Migration: 为 data_chunks 表添加 embedding_model 字段
-- Created: 2024-12-18T00:00:00.000Z
-- Description: 此字段用于记录每个数据块使用的嵌入模型

-- 注意：SQLite 不支持 ALTER TABLE ADD COLUMN IF NOT EXISTS
-- 迁移系统会自动检查字段是否存在，如果已存在则跳过此迁移

ALTER TABLE data_chunks ADD COLUMN embedding_model TEXT DEFAULT 'bce-embedding-base_v1';

