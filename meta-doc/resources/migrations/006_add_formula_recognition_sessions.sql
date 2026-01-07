-- Migration: 添加公式识别会话表
-- Created: 2026-01-07T00:00:00.000Z
-- Description: 为公式识别工具创建会话管理表，支持保存画布状态和识别结果

-- 公式识别会话表
CREATE TABLE IF NOT EXISTS formula_recognition_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  canvas_image TEXT, -- Base64编码的画布图片，用于保存和恢复画布状态
  latex_result TEXT, -- 识别得到的LaTeX公式
  brush_size INTEGER DEFAULT 2, -- 笔刷粗细（1-20）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_formula_recognition_sessions_updated_at ON formula_recognition_sessions(updated_at DESC);

