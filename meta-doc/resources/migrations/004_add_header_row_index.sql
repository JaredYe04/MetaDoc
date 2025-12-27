-- Migration: 为 data_analysis_sessions 表添加 header_row_index 字段
-- Created: 2024-12-20T00:00:00.000Z
-- Description: 此字段用于记录CSV/Excel文件的表头行索引（从0开始），支持手动指定表头位置

-- 注意：SQLite 不支持 ALTER TABLE ADD COLUMN IF NOT EXISTS
-- 迁移系统会自动检查字段是否存在，如果已存在则跳过此迁移

ALTER TABLE data_analysis_sessions ADD COLUMN header_row_index INTEGER;


