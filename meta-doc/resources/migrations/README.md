# 数据库迁移文件

此目录包含数据库迁移 SQL 文件，用于管理数据库结构的版本控制和演进。

## 命名规范

迁移文件必须遵循以下命名格式：

```
NNN_description.sql
```

其中：
- `NNN` 是3位数字的顺序号（001, 002, 003, ...），用于确定迁移的执行顺序
- `description` 是迁移的描述性名称（使用小写字母、数字、下划线和连字符）

**示例**：
- `001_initial_schema.sql` - 初始数据库表结构
- `002_add_embedding_model_column.sql` - 添加 embedding_model 字段
- `003_add_tool_sessions_tables.sql` - 添加工具会话表

### 兼容性说明

迁移系统同时支持旧的时间戳格式（`YYYYMMDDHHMMSS_description.sql`），以便兼容已存在的迁移文件。新创建的迁移文件应使用顺序号格式。

## 迁移文件格式

每个迁移文件应该包含：

1. **文件头注释**：描述迁移的目的和创建时间
2. **SQL 语句**：执行数据库结构变更的 SQL

**示例**：

```sql
-- Migration: 添加用户偏好设置表
-- Created: 2024-12-18T12:00:00.000Z
-- Description: 创建用户偏好设置表，用于存储用户个性化配置

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
5. **顺序号递增**：确保顺序号连续且递增，不要跳过或重复使用顺序号

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

迁移文件按顺序号（或时间戳）升序执行，确保数据库结构变更的顺序性。

迁移系统会：
1. 扫描所有迁移文件（包括内置目录和用户数据目录）
2. 按顺序号排序
3. 检查哪些迁移尚未执行（通过 `_migrations` 表记录）
4. 按顺序执行所有待执行的迁移

## 迁移记录

迁移系统会在数据库中维护一个 `_migrations` 表，记录所有已执行的迁移：

```sql
CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

每个迁移执行后，会在 `_migrations` 表中插入一条记录，防止重复执行。

## 注意事项

- **不要修改已执行的迁移文件**：迁移文件一旦执行，不应修改（除非是新迁移）
- **如果需要修改已执行的迁移**：应该创建新的迁移文件来修复或调整
- **重要迁移前建议备份数据库**：在执行可能影响数据的迁移前，建议备份数据库
- **测试迁移**：在开发环境中充分测试迁移，确保迁移脚本正确无误

## 创建新迁移

使用迁移系统提供的 `createMigration` 函数可以自动创建新的迁移文件：

```typescript
import { createMigration } from './database/migration';

// 创建新的迁移文件
const filePath = createMigration('add_user_preferences_table');
// 返回: /path/to/migrations/004_add_user_preferences_table.sql
```

系统会自动：
- 计算下一个顺序号
- 清理描述文本（转换为小写，移除特殊字符）
- 创建空的迁移文件模板

## 迁移执行时机

迁移会在以下时机自动执行：

1. **应用启动时**：在 `app.whenReady()` 中执行，确保在创建任何窗口之前完成
2. **数据库初始化时**：在 `ensureInitialized()` 中执行，确保数据库结构是最新的

迁移系统会确保：
- 每个迁移只执行一次
- 迁移按正确顺序执行
- 迁移失败时会停止后续迁移并记录错误


