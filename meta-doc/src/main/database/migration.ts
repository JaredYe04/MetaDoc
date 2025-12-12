/**
 * 数据库迁移系统
 * 提供类似 Prisma 的自动化数据库迁移功能
 */

import { getDatabase, query, queryOne, execute, transaction, tableExists, executeDDL } from './database';
import { createMainLogger } from '../logger';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

const logger = createMainLogger('Migration');

/**
 * 迁移记录接口
 */
export interface MigrationRecord {
  id: number;
  name: string;
  executed_at: string;
}

/**
 * 迁移文件信息
 */
export interface MigrationFile {
  name: string;
  path: string;
  timestamp: number;
}

/**
 * 获取迁移文件存储目录
 */
export function getMigrationsDirectory(): string {
  const userDataPath = app.getPath('userData');
  const migrationsDir = path.join(userDataPath, 'database', 'migrations');
  
  // 确保目录存在
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }
  
  return migrationsDir;
}

/**
 * 获取内置迁移文件目录（项目源码中的迁移文件）
 */
export function getBuiltinMigrationsDirectory(): string {
  return path.join(__dirname, 'migrations');
}

/**
 * 初始化迁移系统（创建迁移记录表）
 */
export function initializeMigrationSystem(): void {
  const db = getDatabase();
  
  // 创建迁移记录表
  if (!tableExists('_migrations')) {
    executeDDL(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    logger.info('迁移系统初始化完成');
  }
}

/**
 * 获取所有已执行的迁移记录
 */
export function getExecutedMigrations(): MigrationRecord[] {
  initializeMigrationSystem();
  
  return query<MigrationRecord>(
    'SELECT * FROM _migrations ORDER BY executed_at ASC'
  );
}

/**
 * 检查迁移是否已执行
 */
export function isMigrationExecuted(migrationName: string): boolean {
  const executed = getExecutedMigrations();
  return executed.some(m => m.name === migrationName);
}

/**
 * 记录迁移执行
 */
export function recordMigration(migrationName: string): void {
  initializeMigrationSystem();
  
  try {
    execute(
      'INSERT INTO _migrations (name) VALUES (?)',
      [migrationName]
    );
    logger.info(`迁移记录已保存: ${migrationName}`);
  } catch (error) {
    logger.error(`保存迁移记录失败: ${migrationName}`, error as Error);
    throw error;
  }
}

/**
 * 从文件名解析迁移信息
 * 格式: YYYYMMDDHHMMSS_description.sql
 */
export function parseMigrationFileName(fileName: string): { timestamp: number; name: string } | null {
  const match = fileName.match(/^(\d{14})_(.+)\.sql$/);
  if (!match) {
    return null;
  }
  
  const timestamp = parseInt(match[1], 10);
  const name = match[2];
  
  return { timestamp, name };
}

/**
 * 获取所有迁移文件（从内置目录和用户数据目录）
 */
export function getAllMigrationFiles(): MigrationFile[] {
  const files: MigrationFile[] = [];
  
  // 1. 从内置迁移目录读取（项目源码中的迁移）
  const builtinDir = getBuiltinMigrationsDirectory();
  if (fs.existsSync(builtinDir)) {
    const builtinFiles = fs.readdirSync(builtinDir)
      .filter(f => f.endsWith('.sql'))
      .map(f => {
        const parsed = parseMigrationFileName(f);
        if (parsed) {
          return {
            name: f,
            path: path.join(builtinDir, f),
            timestamp: parsed.timestamp
          };
        }
        return null;
      })
      .filter((f): f is MigrationFile => f !== null);
    
    files.push(...builtinFiles);
  }
  
  // 2. 从用户数据目录读取（运行时创建的迁移）
  const userDir = getMigrationsDirectory();
  if (fs.existsSync(userDir)) {
    const userFiles = fs.readdirSync(userDir)
      .filter(f => f.endsWith('.sql'))
      .map(f => {
        const parsed = parseMigrationFileName(f);
        if (parsed) {
          return {
            name: f,
            path: path.join(userDir, f),
            timestamp: parsed.timestamp
          };
        }
        return null;
      })
      .filter((f): f is MigrationFile => f !== null);
    
    files.push(...userFiles);
  }
  
  // 按时间戳排序
  return files.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * 获取待执行的迁移文件
 */
export function getPendingMigrations(): MigrationFile[] {
  const allFiles = getAllMigrationFiles();
  const executed = getExecutedMigrations();
  const executedNames = new Set(executed.map(m => m.name));
  
  return allFiles.filter(f => !executedNames.has(f.name));
}

/**
 * 检查表中是否存在某个字段
 */
function columnExists(tableName: string, columnName: string): boolean {
  try {
    const result = query<{ name: string }>(
      `PRAGMA table_info(${tableName})`
    );
    return result.some(col => col.name === columnName);
  } catch (error) {
    logger.debug(`检查字段存在性失败: ${tableName}.${columnName}`, error as Error);
    return false;
  }
}

/**
 * 执行单个迁移文件
 */
export function executeMigration(migrationFile: MigrationFile): void {
  const migrationName = migrationFile.name;
  
  if (isMigrationExecuted(migrationName)) {
    logger.debug(`迁移已执行，跳过: ${migrationName}`);
    return;
  }
  
  logger.info(`开始执行迁移: ${migrationName}`);
  
  try {
    // 读取迁移文件内容
    let sql = fs.readFileSync(migrationFile.path, 'utf-8');
    
    if (!sql.trim()) {
      logger.warn(`迁移文件为空，跳过: ${migrationName}`);
      recordMigration(migrationName);
      return;
    }
    
    // 处理特殊的迁移：ADD COLUMN（SQLite 不支持 IF NOT EXISTS）
    // 如果迁移是添加字段，先检查字段是否存在
    const addColumnMatch = sql.match(/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/i);
    if (addColumnMatch) {
      const tableName = addColumnMatch[1];
      const columnName = addColumnMatch[2];
      
      if (columnExists(tableName, columnName)) {
        logger.info(`字段 ${tableName}.${columnName} 已存在，跳过迁移: ${migrationName}`);
        recordMigration(migrationName);
        return;
      }
    }
    
    // 在事务中执行迁移
    transaction(() => {
      const db = getDatabase();
      
      // 执行迁移 SQL（可能包含多条语句）
      // 使用 exec 来执行可能包含多条语句的 SQL
      db.exec(sql);
      
      // 记录迁移执行
      recordMigration(migrationName);
    });
    
    logger.info(`迁移执行成功: ${migrationName}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // 如果是字段已存在的错误，记录迁移并继续
    if (errorMsg.includes('duplicate column') || errorMsg.includes('already exists')) {
      logger.warn(`字段可能已存在，记录迁移并继续: ${migrationName}`);
      recordMigration(migrationName);
      return;
    }
    
    logger.error(`迁移执行失败: ${migrationName}`, error as Error);
    throw error;
  }
}

/**
 * 执行所有待执行的迁移
 */
export function runMigrations(): void {
  initializeMigrationSystem();
  
  const pending = getPendingMigrations();
  
  if (pending.length === 0) {
    logger.debug('没有待执行的迁移');
    return;
  }
  
  logger.info(`发现 ${pending.length} 个待执行的迁移`);
  
  for (const migration of pending) {
    try {
      executeMigration(migration);
    } catch (error) {
      logger.error(`迁移执行失败，停止后续迁移: ${migration.name}`, error as Error);
      throw error;
    }
  }
  
  logger.info('所有迁移执行完成');
}

/**
 * 创建新的迁移文件
 * @param description 迁移描述（将用于文件名）
 * @returns 创建的迁移文件路径
 */
export function createMigration(description: string): string {
  // 生成时间戳（YYYYMMDDHHMMSS）
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  const timestamp = `${year}${month}${day}${hours}${minutes}${seconds}`;
  
  // 清理描述，只保留字母、数字、下划线和连字符
  const cleanDescription = description
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '');
  
  const fileName = `${timestamp}_${cleanDescription}.sql`;
  const migrationsDir = getMigrationsDirectory();
  const filePath = path.join(migrationsDir, fileName);
  
  // 创建空的迁移文件
  fs.writeFileSync(filePath, `-- Migration: ${description}\n-- Created: ${now.toISOString()}\n\n`, 'utf-8');
  
  logger.info(`迁移文件已创建: ${filePath}`);
  
  return filePath;
}

/**
 * 回滚最后一个迁移（仅删除记录，不执行回滚 SQL）
 * 注意：SQLite 不支持自动回滚，需要手动编写回滚 SQL
 */
export function rollbackLastMigration(): boolean {
  const executed = getExecutedMigrations();
  
  if (executed.length === 0) {
    logger.warn('没有已执行的迁移可以回滚');
    return false;
  }
  
  const lastMigration = executed[executed.length - 1];
  
  try {
    execute('DELETE FROM _migrations WHERE name = ?', [lastMigration.name]);
    logger.info(`迁移记录已删除: ${lastMigration.name}`);
    logger.warn('注意：此操作仅删除了迁移记录，数据库结构变更需要手动回滚');
    return true;
  } catch (error) {
    logger.error(`回滚迁移失败: ${lastMigration.name}`, error as Error);
    return false;
  }
}

/**
 * 获取数据库当前版本（最后执行的迁移）
 */
export function getDatabaseVersion(): string | null {
  const executed = getExecutedMigrations();
  
  if (executed.length === 0) {
    return null;
  }
  
  const lastMigration = executed[executed.length - 1];
  return lastMigration.name;
}

/**
 * 获取迁移状态信息
 */
export function getMigrationStatus(): {
  executed: number;
  pending: number;
  total: number;
  currentVersion: string | null;
} {
  const executed = getExecutedMigrations();
  const pending = getPendingMigrations();
  const all = getAllMigrationFiles();
  
  return {
    executed: executed.length,
    pending: pending.length,
    total: all.length,
    currentVersion: getDatabaseVersion()
  };
}

