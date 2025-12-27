-- Migration: 为 data_analysis_sessions 表添加分析参数字段
-- Created: 2024-12-21T00:00:00.000Z
-- Description: 添加分析需求提示词、自动聚合分析、生成AI报告等字段，支持持久化和会话绑定

-- 注意：SQLite 不支持 ALTER TABLE ADD COLUMN IF NOT EXISTS
-- 迁移系统会自动检查字段是否存在，如果已存在则跳过此迁移

ALTER TABLE data_analysis_sessions ADD COLUMN analysis_request TEXT;
ALTER TABLE data_analysis_sessions ADD COLUMN auto_group_by INTEGER; -- 0或1，表示false或true
ALTER TABLE data_analysis_sessions ADD COLUMN generate_report INTEGER; -- 0或1，表示false或true


