-- Migration: 添加 AIGC 分段改写结果存储
-- Description: 每段对应一个改写后的文本（JSON 数组，与段落一一对应），不修改原文

ALTER TABLE aigc_detection_sessions ADD COLUMN paragraph_paraphrases TEXT;
