-- Migration: 添加AIGC检测会话表
-- Created: 2024-12-20T00:00:00.000Z
-- Description: 为AIGC检测工具创建会话管理表，支持保存文章内容、分析结果和报告

-- AIGC检测会话表
CREATE TABLE IF NOT EXISTS aigc_detection_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  article_content TEXT, -- 文章内容
  content_source TEXT, -- 内容来源：'file' | 'document'
  source_file_path TEXT, -- 如果是文件上传，保存文件路径
  source_tab_id TEXT, -- 如果是从文档tab获取，保存tab id
  overall_analysis TEXT, -- 总体分析结果（JSON格式）
  paragraph_analyses TEXT, -- 分段分析结果（JSON数组格式）
  report_markdown TEXT, -- 生成的报告（Markdown格式）
  language TEXT DEFAULT 'zh', -- 语言：'zh' | 'en' 等
  domain TEXT DEFAULT 'academic', -- 领域：'academic' | 'general' 等
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_aigc_detection_sessions_updated_at ON aigc_detection_sessions(updated_at DESC);

