# 数据库迁移文件

此目录包含数据库迁移 SQL 文件。

## 命名规范

迁移文件必须遵循以下命名格式：

```
YYYYMMDDHHMMSS_description.sql
```

**示例**：
- `20240101000000_initial_schema.sql` - 初始数据库表结构
- `20240101000001_add_embedding_model_column.sql` - 添加 embedding_model 字段

## 迁移文件格式

每个迁移文件应该包含：

1. **文件头注释**：描述迁移的目的和创建时间
2. **SQL 语句**：执行数据库结构变更的 SQL

**示例**：

```sql
-- Migration: 添加用户偏好设置表
-- Created: 2024-01-15T12:00:00.000Z

CREATE TABLE IF NOT EXISTS user_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  theme TEXT DEFAULT 'light',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
```

## 最佳实践

1. **使用 IF NOT EXISTS**：对于 CREATE TABLE 和 CREATE INDEX，使用 `IF NOT EXISTS` 确保幂等性
2. **提供默认值**：添加新字段时，提供默认值以确保向后兼容
3. **原子性**：每个迁移文件应该是一个完整的、可独立执行的变更单元
4. **描述性命名**：使用清晰的描述性名称，便于理解迁移的目的

## 特殊处理

### ADD COLUMN

SQLite 不支持 `ALTER TABLE ADD COLUMN IF NOT EXISTS`，但迁移系统会自动处理：

- 迁移系统会在执行前检查字段是否存在
- 如果字段已存在，会跳过迁移并记录
- 如果执行时遇到 "duplicate column" 错误，也会自动处理

```sql
-- 迁移系统会自动处理字段已存在的情况
ALTER TABLE data_chunks ADD COLUMN embedding_model TEXT DEFAULT 'bce-embedding-base_v1';
```

## 迁移执行顺序

迁移文件按时间戳顺序执行，确保数据库结构变更的顺序性。

## 注意事项

- 迁移文件一旦执行，不应修改（除非是新迁移）
- 如果需要修改已执行的迁移，应该创建新的迁移文件来修复
- 重要迁移前建议备份数据库

