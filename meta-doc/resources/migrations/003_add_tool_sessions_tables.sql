-- Migration: 添加工具会话表（数据分析、OCR、附件解析、绘图工具）
-- Created: 2024-12-18T00:00:00.000Z
-- Description: 为数据分析、OCR、附件解析、绘图工具创建会话管理表，替代localStorage

-- 数据分析会话表
CREATE TABLE IF NOT EXISTS data_analysis_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  data_file_path TEXT,
  data_format TEXT,
  analysis_result TEXT, -- JSON格式存储分析结果
  report_markdown TEXT, -- Markdown格式的分析报告
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- OCR会话表
CREATE TABLE IF NOT EXISTS ocr_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  images TEXT, -- JSON数组，存储图片路径列表
  ocr_languages TEXT, -- JSON数组，存储选择的语言包
  ocr_results TEXT, -- JSON格式存储OCR结果
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 附件解析会话表
CREATE TABLE IF NOT EXISTS attachment_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  parsed_content TEXT, -- 解析后的文本内容
  ai_analysis TEXT, -- AI分析结果（Markdown格式）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 绘图工具会话表
CREATE TABLE IF NOT EXISTS graph_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  conversation_history TEXT, -- JSON数组，存储多轮对话历史
  current_prompt TEXT,
  output_format TEXT, -- svg/pdf/png/url
  output_path TEXT, -- 输出文件路径或URL
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- AIChat历史会话表（用于迁移localStorage数据）
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  messages TEXT NOT NULL, -- JSON数组，存储对话消息
  reference_store TEXT, -- JSON数组，存储引用
  created_at INTEGER NOT NULL, -- 使用时间戳（毫秒）
  updated_at INTEGER NOT NULL -- 使用时间戳（毫秒）
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_data_analysis_sessions_updated_at ON data_analysis_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_sessions_updated_at ON ocr_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_attachment_sessions_updated_at ON attachment_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_graph_sessions_updated_at ON graph_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_updated_at ON ai_chat_sessions(updated_at DESC);


