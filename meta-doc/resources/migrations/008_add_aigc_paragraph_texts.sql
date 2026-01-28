-- Migration: AIGC 会话表增加 paragraph_texts
-- Created: 2026-01-27
-- Description: 持久化用户划分/预处理后的段落列表，供“开始分析”直接使用

ALTER TABLE aigc_detection_sessions ADD COLUMN paragraph_texts TEXT;
