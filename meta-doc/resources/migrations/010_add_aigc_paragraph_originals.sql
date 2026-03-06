-- Migration: 添加 AIGC 段落原文备份（用于改写后撤回）
-- Description: 改写时直接替换正文，此处保存原文以便单段撤回

ALTER TABLE aigc_detection_sessions ADD COLUMN paragraph_originals TEXT;
