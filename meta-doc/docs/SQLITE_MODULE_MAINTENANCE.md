# SQLite 模块维护文档

## 概述

MetaDoc 使用 SQLite 作为主要的数据存储方案，配合 sqlite-vec 扩展实现高效的向量搜索功能。本文档介绍 SQLite 模块的架构、维护方法和最佳实践。

## 架构设计

### 模块结构

```
src/main/database/
├── database.ts          # 数据库连接和基础操作
├── schemas.ts           # 表结构定义（DDL）
└── knowledge-db.ts      # 知识库相关的数据库操作
```

### 核心组件

#### 1. 数据库连接层 (`database.ts`)

负责数据库连接、扩展加载和基础操作。

**主要功能**：

- 数据库连接管理（单例模式）
- sqlite-vec 扩展加载
- 基础 CRUD 操作封装
- 事务管理

**关键函数**：

```typescript
// 获取数据库实例
getDatabase(): Database.Database

// 检查 sqlite-vec 是否可用
isSqliteVecAvailable(): boolean

// 基础操作
query<T>(sql, params?): T[]
queryOne<T>(sql, params?): T | undefined
execute(sql, params?): RunResult
transaction<T>(fn): T

// 表管理
tableExists(tableName): boolean
initializeDatabase(ddlStatements): void
```

#### 2. 表结构定义 (`schemas.ts`)

统一管理所有数据库表的 DDL 语句。

**表结构**：

- `knowledge_files` - 知识库文件元信息
- `data_chunks` - 文档分块
- `vectors` - 向量存储
- `vec0_index` - sqlite-vec 虚拟表（如果可用）

**使用方式**：

```typescript
import { getAllDDLStatements, getVec0DDLStatements } from './schemas'

// 初始化所有表
initializeDatabase(getAllDDLStatements())

// 初始化 sqlite-vec 虚拟表（如果扩展可用）
if (isSqliteVecAvailable()) {
  const vec0DDL = getVec0DDLStatements()
  // 执行 DDL...
}
```

#### 3. 业务数据访问层 (`knowledge-db.ts`)

提供知识库相关的数据库操作接口。

**主要功能**：

- 文件管理（CRUD）
- 数据块管理
- 向量管理
- 向量搜索

## 数据库文件位置

### 默认位置

- **路径**：`{userData}/database/meta-doc.db`
- **userData**：Electron 的 `app.getPath('userData')`
  - Windows: `%APPDATA%/MetaDoc/`
  - macOS: `~/Library/Application Support/MetaDoc/`
  - Linux: `~/.config/MetaDoc/`

### 获取路径

```typescript
import { getDatabasePath } from './database'
const dbPath = getDatabasePath()
```

## sqlite-vec 扩展

### 扩展功能

sqlite-vec 提供了高效的向量搜索功能：

- 向量存储和索引
- 向量相似度计算（`vec_distance`）
- 虚拟表支持（`vec0_index`）

### 加载机制

系统会按以下顺序尝试加载扩展：

1. **npm 包方式**：使用 `sqlite-vec` npm 包

   ```typescript
   const sqliteVec = require('sqlite-vec')
   sqliteVec.load(db)
   ```

2. **扩展文件方式**：直接加载扩展文件
   - Windows: `vector0.dll`
   - macOS: `vector0.dylib`
   - Linux: `vector0.so`

### 检查扩展可用性

```typescript
import { isSqliteVecAvailable } from './database'

if (isSqliteVecAvailable()) {
  // 使用 sqlite-vec 功能
} else {
  // 使用内存 ANN 算法作为后备
}
```

### 后备方案

如果 sqlite-vec 不可用，系统会自动使用内存中的 ANN（近似最近邻）算法进行向量搜索，功能不受影响。

## 数据库初始化

### 自动初始化

数据库会在首次使用时自动初始化：

```typescript
import { ensureInitialized } from './knowledge-db'

// 确保数据库已初始化（会自动创建表）
ensureInitialized()
```

### 初始化流程

1. 检查表是否存在
2. 如果不存在，执行 DDL 语句创建表
3. 如果 sqlite-vec 可用，创建虚拟表
4. 执行数据库迁移（添加新字段等）

### 手动初始化

```typescript
import { initializeDatabase } from './database'
import { getAllDDLStatements, getVec0DDLStatements } from './schemas'

// 初始化基础表
initializeDatabase(getAllDDLStatements())

// 初始化 sqlite-vec 虚拟表（如果可用）
if (isSqliteVecAvailable()) {
  const db = getDatabase()
  const vec0DDL = getVec0DDLStatements()
  for (const ddl of vec0DDL) {
    db.exec(ddl)
  }
}
```

## 数据库迁移

### 迁移系统概述

MetaDoc 使用类似 Prisma 的自动化数据库迁移系统，提供版本管理和迁移执行功能。

**核心特性**：

- 自动检测和执行待执行的迁移
- 迁移文件版本管理（基于时间戳）
- 迁移执行记录追踪
- 支持内置迁移和运行时迁移

### 迁移文件结构

迁移文件存储在两个位置：

1. **内置迁移**：`src/main/database/migrations/` - 项目源码中的迁移文件
2. **运行时迁移**：`{userData}/database/migrations/` - 运行时创建的迁移文件

### 迁移文件命名规范

迁移文件必须遵循以下命名格式：

```
YYYYMMDDHHMMSS_description.sql
```

**示例**：

- `20240101000000_initial_schema.sql`
- `20240101000001_add_embedding_model_column.sql`
- `20240115120000_add_user_preferences_table.sql`

### 使用迁移系统

#### 自动执行迁移

迁移会在数据库初始化时自动执行：

```typescript
import { ensureInitialized } from './knowledge-db'

// 确保数据库已初始化（会自动执行所有待执行的迁移）
ensureInitialized()
```

#### 手动执行迁移

```typescript
import { runMigrations } from './migration'

// 执行所有待执行的迁移
runMigrations()
```

#### 创建新迁移

```typescript
import { createMigration } from './migration'

// 创建新的迁移文件
const migrationPath = createMigration('add_user_preferences_table')
// 返回: {userData}/database/migrations/20240115120000_add_user_preferences_table.sql
```

#### 查看迁移状态

```typescript
import { getMigrationStatus, getDatabaseVersion } from './migration'

// 获取迁移状态
const status = getMigrationStatus()
console.log(
  `已执行: ${status.executed}, 待执行: ${status.pending}, 当前版本: ${status.currentVersion}`
)

// 获取数据库当前版本
const version = getDatabaseVersion()
```

#### 获取迁移记录

```typescript
import { getExecutedMigrations, getPendingMigrations } from './migration'

// 获取已执行的迁移
const executed = getExecutedMigrations()

// 获取待执行的迁移
const pending = getPendingMigrations()
```

### 编写迁移文件

迁移文件是纯 SQL 文件，可以包含多条 SQL 语句：

```sql
-- Migration: 添加用户偏好设置表
-- Created: 2024-01-15T12:00:00.000Z

-- 创建用户偏好设置表
CREATE TABLE IF NOT EXISTS user_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  theme TEXT DEFAULT 'light',
  language TEXT DEFAULT 'zh-CN',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
```

### 特殊处理：ADD COLUMN

由于 SQLite 不支持 `ALTER TABLE ADD COLUMN IF NOT EXISTS`，迁移系统会自动处理字段已存在的情况：

```sql
-- 迁移系统会自动检查字段是否存在
-- 如果字段已存在，会跳过此迁移并记录
ALTER TABLE data_chunks ADD COLUMN embedding_model TEXT DEFAULT 'bce-embedding-base_v1';
```

### 迁移最佳实践

1. **幂等性**：确保迁移可以安全地多次执行

   - 使用 `CREATE TABLE IF NOT EXISTS`
   - 使用 `CREATE INDEX IF NOT EXISTS`
   - 对于 `ADD COLUMN`，迁移系统会自动处理

2. **向后兼容**：新字段应该有默认值

   ```sql
   ALTER TABLE table_name ADD COLUMN new_field TEXT DEFAULT 'default_value';
   ```

3. **数据备份**：重要迁移前备份数据库

   ```typescript
   import { getDatabasePath } from './database'
   import fs from 'fs'

   const dbPath = getDatabasePath()
   const backupPath = `${dbPath}.backup`
   fs.copyFileSync(dbPath, backupPath)
   ```

4. **测试**：在测试环境先验证迁移

5. **描述性命名**：使用清晰的迁移文件名描述变更内容

6. **原子性**：每个迁移文件应该是一个完整的、可独立执行的变更单元

### 迁移记录表

系统会自动创建 `_migrations` 表来追踪已执行的迁移：

```sql
CREATE TABLE _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 回滚迁移

**注意**：SQLite 不支持自动回滚，需要手动编写回滚 SQL。

```typescript
import { rollbackLastMigration } from './migration'

// 删除最后一个迁移的记录（不执行回滚 SQL）
// 注意：这只会删除迁移记录，不会回滚数据库结构变更
rollbackLastMigration()
```

如果需要回滚数据库结构变更，需要手动编写并执行回滚 SQL。

## 事务管理

### 使用事务

```typescript
import { transaction } from './database'

transaction(() => {
  // 执行多个操作
  execute('INSERT INTO table1 ...')
  execute('INSERT INTO table2 ...')
  // 如果任何操作失败，所有操作都会回滚
})
```

### 事务最佳实践

1. **批量操作**：使用事务包装批量操作
2. **数据一致性**：确保相关操作在同一事务中
3. **错误处理**：事务中的错误会自动回滚

## 查询优化

### 索引

系统已为常用查询创建索引：

```sql
-- 知识库文件表
CREATE INDEX idx_knowledge_files_filename ON knowledge_files(filename);
CREATE INDEX idx_knowledge_files_enabled ON knowledge_files(enabled);

-- 数据块表
CREATE INDEX idx_data_chunks_file_id ON data_chunks(knowledge_file_id);
CREATE INDEX idx_data_chunks_file_index ON data_chunks(knowledge_file_id, chunk_index);

-- 向量表
CREATE INDEX idx_vectors_chunk_id ON vectors(chunk_id);
```

### 查询建议

1. **使用索引字段**：在 WHERE 子句中使用已索引的字段
2. **避免全表扫描**：使用 LIMIT 限制结果数量
3. **JOIN 优化**：使用 INNER JOIN 而非子查询
4. **参数化查询**：使用参数化查询防止 SQL 注入

### 性能监控

```typescript
// 使用 EXPLAIN QUERY PLAN 分析查询
const plan = query('EXPLAIN QUERY PLAN SELECT ...')
console.log(plan)
```

## 数据备份与恢复

### 备份

```typescript
import { getDatabasePath } from './database'
import fs from 'fs'

const dbPath = getDatabasePath()
const backupPath = `${dbPath}.backup`

// 使用 SQLite 的备份 API
const db = getDatabase()
db.backup(backupPath)
```

### 恢复

```typescript
import Database from 'better-sqlite3'

const backupPath = 'path/to/backup.db'
const dbPath = getDatabasePath()

// 关闭当前连接
closeDatabase()

// 复制备份文件
fs.copyFileSync(backupPath, dbPath)

// 重新打开数据库
getDatabase()
```

### 定期备份建议

1. **自动备份**：在应用启动时创建备份
2. **版本控制**：保留多个备份版本
3. **压缩存储**：备份文件可以压缩节省空间

## 错误处理

### 常见错误

1. **数据库锁定**：多个进程同时访问数据库
   - 解决：使用 WAL 模式（已启用）
2. **磁盘空间不足**：数据库文件无法写入

   - 解决：检查磁盘空间，清理不必要的数据

3. **权限错误**：无法创建或写入数据库文件

   - 解决：检查文件权限，确保应用有写入权限

4. **扩展加载失败**：sqlite-vec 无法加载
   - 解决：系统会自动使用内存算法，不影响功能

### 错误处理模式

```typescript
import { query, execute } from './database'

try {
  const results = query('SELECT ...')
} catch (error) {
  if (error.code === 'SQLITE_BUSY') {
    // 处理锁定错误
  } else {
    // 处理其他错误
    logger.error('查询失败', error)
  }
}
```

## 维护任务

### 定期维护

1. **VACUUM**：重建数据库文件，回收空间

   ```typescript
   execute('VACUUM')
   ```

2. **ANALYZE**：更新查询优化器的统计信息

   ```typescript
   execute('ANALYZE')
   ```

3. **检查完整性**：检查数据库完整性
   ```typescript
   const result = queryOne('PRAGMA integrity_check')
   ```

### 清理任务

1. **删除孤立数据**：删除没有关联的向量或数据块
2. **清理旧数据**：删除过期的数据
3. **压缩数据库**：定期执行 VACUUM

## 调试技巧

### 启用 SQL 日志

```typescript
// 在开发环境中启用 SQL 日志
if (process.env.NODE_ENV === 'development') {
  const db = getDatabase()
  db.on('trace', (sql) => {
    console.log('SQL:', sql)
  })
}
```

### 查看表结构

```typescript
const columns = query('PRAGMA table_info(knowledge_files)')
console.log(columns)
```

### 查看数据库统计

```typescript
const stats = {
  pageCount: queryOne('PRAGMA page_count'),
  pageSize: queryOne('PRAGMA page_size'),
  freelistCount: queryOne('PRAGMA freelist_count')
}
console.log('数据库统计:', stats)
```

## 安全考虑

### SQL 注入防护

始终使用参数化查询：

```typescript
// ✅ 正确
query('SELECT * FROM table WHERE id = ?', [id])

// ❌ 错误
query(`SELECT * FROM table WHERE id = ${id}`)
```

### 数据加密

SQLite 本身不提供加密，如需加密：

1. 使用应用层加密
2. 使用 SQLCipher（需要修改数据库驱动）
3. 使用文件系统加密

### 访问控制

- 数据库文件应存储在用户数据目录，受操作系统权限保护
- 避免在代码中硬编码敏感信息
- 使用环境变量存储配置

## 性能优化

### WAL 模式

系统已启用 WAL（Write-Ahead Logging）模式，提供：

- 更好的并发性能
- 更快的写入速度
- 更好的数据完整性

### 连接池

better-sqlite3 使用单例模式，所有操作共享一个连接，无需连接池。

### 批量操作

使用事务和批量插入提高性能：

```typescript
transaction(() => {
  for (const item of items) {
    execute('INSERT INTO table ...', [item.data])
  }
})
```

## 测试

### 单元测试

```typescript
import { getDatabase, initializeDatabase } from './database'
import { getAllDDLStatements } from './schemas'

// 使用内存数据库进行测试
const testDb = new Database(':memory:')
initializeDatabase(getAllDDLStatements())

// 执行测试...

testDb.close()
```

### 集成测试

使用临时文件进行集成测试：

```typescript
import { tmpdir } from 'os'
import { join } from 'path'

const testDbPath = join(tmpdir(), 'test-meta-doc.db')
// 使用测试数据库路径...
```

## 故障排查

### 问题：数据库文件损坏

1. 检查完整性：`PRAGMA integrity_check`
2. 尝试恢复：使用 `.recover` 命令（需要 sqlite3 命令行工具）
3. 从备份恢复

### 问题：性能下降

1. 执行 `VACUUM` 重建数据库
2. 执行 `ANALYZE` 更新统计信息
3. 检查索引是否被使用：`EXPLAIN QUERY PLAN`

### 问题：扩展加载失败

1. 检查扩展文件是否存在
2. 检查文件权限
3. 查看日志中的错误信息
4. 系统会自动使用后备方案，不影响功能

## 相关资源

- [SQLite 官方文档](https://www.sqlite.org/docs.html)
- [better-sqlite3 文档](https://github.com/WiseLibs/better-sqlite3)
- [sqlite-vec 项目](https://github.com/asg017/sqlite-vec)

## 更新日志

- **v2.0**：添加 sqlite-vec 支持，迁移到新的数据库架构
- **v1.0**：初始实现，基础 CRUD 操作
