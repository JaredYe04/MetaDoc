/**
 * 数据库迁移系统
 * 提供类似 Prisma 的自动化数据库迁移功能
 */

import {
  getDatabase,
  query,
  queryOne,
  execute,
  transaction,
  tableExists,
  executeDDL
} from './database'
import { createMainLogger } from '../logger'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import pathService from '../utils/path-service'

const logger = createMainLogger('Migration')

/**
 * 迁移记录接口
 */
export interface MigrationRecord {
  id: number
  name: string
  executed_at: string
}

/**
 * 迁移文件信息
 */
export interface MigrationFile {
  name: string
  path: string
  order: number // 迁移顺序号（用于排序）
}

/**
 * 获取迁移文件存储目录
 */
export function getMigrationsDirectory(): string {
  const userDataPath = app.getPath('userData')
  const migrationsDir = path.join(userDataPath, 'database', 'migrations')

  // 确保目录存在
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true })
  }

  return migrationsDir
}

/**
 * 获取内置迁移文件目录（项目源码中的迁移文件）
 * 迁移文件现在位于 resources/migrations 目录，在 dev 和打包环境都能正确访问
 */
export function getBuiltinMigrationsDirectory(): string {
  // 使用 path-service 获取稳定的迁移文件路径
  // 在开发环境：resources/migrations
  // 在打包环境：app.asar.unpacked/resources/migrations（通过 asarUnpack 解包）
  const migrationsDir = pathService.getMigrationsPath()

  // 如果目录不存在，自动创建
  if (!fs.existsSync(migrationsDir)) {
    try {
      fs.mkdirSync(migrationsDir, { recursive: true })
      logger.info(`已创建迁移文件目录: ${migrationsDir}`)
    } catch (error) {
      logger.error(`创建迁移文件目录失败: ${migrationsDir}`, error as Error)
      // 列出 resources 目录的内容以便调试
      try {
        const resourcesPath = pathService.getResourcesPath()
        if (fs.existsSync(resourcesPath)) {
          const dirContents = fs.readdirSync(resourcesPath)
          logger.debug(`resources 目录 (${resourcesPath}) 内容:`, dirContents.join(', '))
        }
      } catch (debugError) {
        logger.error('无法读取 resources 目录内容', debugError as Error)
      }
    }
  }

  // 添加调试日志
  logger.debug(`迁移文件目录: ${migrationsDir}, 存在: ${fs.existsSync(migrationsDir)}`)

  return migrationsDir
}

/**
 * 初始化迁移系统（创建迁移记录表）
 */
export function initializeMigrationSystem(): void {
  const db = getDatabase()

  // 创建迁移记录表
  if (!tableExists('_migrations')) {
    executeDDL(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    logger.info('迁移系统初始化完成')
  }
}

/**
 * 获取所有已执行的迁移记录
 */
export function getExecutedMigrations(): MigrationRecord[] {
  initializeMigrationSystem()

  return query<MigrationRecord>('SELECT * FROM _migrations ORDER BY executed_at ASC')
}

/**
 * 检查迁移是否已执行
 */
export function isMigrationExecuted(migrationName: string): boolean {
  const executed = getExecutedMigrations()
  return executed.some((m) => m.name === migrationName)
}

/**
 * 记录迁移执行
 */
export function recordMigration(migrationName: string): void {
  initializeMigrationSystem()

  try {
    execute('INSERT INTO _migrations (name) VALUES (?)', [migrationName])
    logger.info(`迁移记录已保存: ${migrationName}`)
  } catch (error) {
    logger.error(`保存迁移记录失败: ${migrationName}`, error as Error)
    throw error
  }
}

/**
 * 从文件名解析迁移信息
 * 支持两种格式：
 * 1. 顺序号格式: NNN_description.sql (推荐，如 001_initial_schema.sql)
 * 2. 时间戳格式: YYYYMMDDHHMMSS_description.sql (兼容旧格式)
 */
export function parseMigrationFileName(fileName: string): { order: number; name: string } | null {
  // 优先匹配顺序号格式: NNN_description.sql
  const orderMatch = fileName.match(/^(\d{3,})_(.+)\.sql$/)
  if (orderMatch) {
    const order = parseInt(orderMatch[1], 10)
    const name = orderMatch[2]
    return { order, name }
  }

  // 兼容旧的时间戳格式: YYYYMMDDHHMMSS_description.sql
  const timestampMatch = fileName.match(/^(\d{14})_(.+)\.sql$/)
  if (timestampMatch) {
    // 将时间戳转换为顺序号（使用时间戳作为顺序号，确保旧文件仍然可以正确排序）
    const timestamp = parseInt(timestampMatch[1], 10)
    const name = timestampMatch[2]
    return { order: timestamp, name }
  }

  return null
}

/**
 * 获取所有迁移文件（从内置目录和用户数据目录）
 */
export function getAllMigrationFiles(): MigrationFile[] {
  const files: MigrationFile[] = []

  // 1. 从内置迁移目录读取（项目源码中的迁移）
  const builtinDir = getBuiltinMigrationsDirectory()
  logger.debug(`检查内置迁移目录: ${builtinDir}`)
  if (fs.existsSync(builtinDir)) {
    try {
      const builtinFiles = fs
        .readdirSync(builtinDir)
        .filter((f) => f.endsWith('.sql'))
        .map((f) => {
          const parsed = parseMigrationFileName(f)
          if (parsed) {
            return {
              name: f,
              path: path.join(builtinDir, f),
              order: parsed.order
            }
          }
          logger.warn(`无法解析迁移文件名: ${f}`)
          return null
        })
        .filter((f): f is MigrationFile => f !== null)

      logger.debug(
        `从内置目录找到 ${builtinFiles.length} 个迁移文件:`,
        builtinFiles.map((f) => f.name).join(', ')
      )
      files.push(...builtinFiles)
    } catch (error) {
      logger.error(`读取内置迁移目录失败: ${builtinDir}`, error as Error)
    }
  } else {
    logger.warn(`内置迁移目录不存在: ${builtinDir}`)
  }

  // 2. 从用户数据目录读取（运行时创建的迁移）
  const userDir = getMigrationsDirectory()
  logger.debug(`检查用户迁移目录: ${userDir}`)
  if (fs.existsSync(userDir)) {
    try {
      const userFiles = fs
        .readdirSync(userDir)
        .filter((f) => f.endsWith('.sql'))
        .map((f) => {
          const parsed = parseMigrationFileName(f)
          if (parsed) {
            return {
              name: f,
              path: path.join(userDir, f),
              order: parsed.order
            }
          }
          logger.warn(`无法解析迁移文件名: ${f}`)
          return null
        })
        .filter((f): f is MigrationFile => f !== null)

      logger.debug(
        `从用户目录找到 ${userFiles.length} 个迁移文件:`,
        userFiles.map((f) => f.name).join(', ')
      )
      files.push(...userFiles)
    } catch (error) {
      logger.error(`读取用户迁移目录失败: ${userDir}`, error as Error)
    }
  }

  // 按顺序号排序
  const sorted = files.sort((a, b) => a.order - b.order)
  logger.debug(`总共找到 ${sorted.length} 个迁移文件`)
  return sorted
}

/**
 * 获取待执行的迁移文件
 */
export function getPendingMigrations(): MigrationFile[] {
  const allFiles = getAllMigrationFiles()
  const executed = getExecutedMigrations()
  const executedNames = new Set(executed.map((m) => m.name))

  return allFiles.filter((f) => !executedNames.has(f.name))
}

/**
 * 检查表中是否存在某个字段
 */
function columnExists(tableName: string, columnName: string): boolean {
  try {
    const result = query<{ name: string }>(`PRAGMA table_info(${tableName})`)
    return result.some((col) => col.name === columnName)
  } catch (error) {
    logger.debug(`检查字段存在性失败: ${tableName}.${columnName}`, error as Error)
    return false
  }
}

/**
 * 执行单个迁移文件
 */
export function executeMigration(migrationFile: MigrationFile): void {
  const migrationName = migrationFile.name

  if (isMigrationExecuted(migrationName)) {
    logger.debug(`迁移已执行，跳过: ${migrationName}`)
    return
  }

  logger.info(`开始执行迁移: ${migrationName}`)

  try {
    // 读取迁移文件内容
    let sql = fs.readFileSync(migrationFile.path, 'utf-8')

    if (!sql.trim()) {
      logger.warn(`迁移文件为空，跳过: ${migrationName}`)
      recordMigration(migrationName)
      return
    }

    // 处理特殊的迁移：ADD COLUMN（SQLite 不支持 IF NOT EXISTS）
    // 如果迁移是添加字段，先检查字段是否存在
    const addColumnMatch = sql.match(/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/i)
    if (addColumnMatch) {
      const tableName = addColumnMatch[1]
      const columnName = addColumnMatch[2]

      if (columnExists(tableName, columnName)) {
        logger.info(`字段 ${tableName}.${columnName} 已存在，跳过迁移: ${migrationName}`)
        recordMigration(migrationName)
        return
      }
    }

    // 在事务中执行迁移
    transaction(() => {
      const db = getDatabase()

      // 执行迁移 SQL（可能包含多条语句）
      // 使用 exec 来执行可能包含多条语句的 SQL
      db.exec(sql)

      // 记录迁移执行
      recordMigration(migrationName)
    })

    logger.info(`迁移执行成功: ${migrationName}`)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)

    // 如果是字段已存在的错误，记录迁移并继续
    if (errorMsg.includes('duplicate column') || errorMsg.includes('already exists')) {
      logger.warn(`字段可能已存在，记录迁移并继续: ${migrationName}`)
      recordMigration(migrationName)
      return
    }

    logger.error(`迁移执行失败: ${migrationName}`, error as Error)
    throw error
  }
}

/**
 * 执行所有待执行的迁移
 */
export function runMigrations(): void {
  try {
    initializeMigrationSystem()

    // 获取所有迁移文件（用于调试）
    const allFiles = getAllMigrationFiles()
    logger.info(`扫描到 ${allFiles.length} 个迁移文件:`, allFiles.map((f) => f.name).join(', '))

    if (allFiles.length === 0) {
      logger.warn('未找到任何迁移文件！请检查迁移文件是否存在于正确的位置。')
      return
    }

    const pending = getPendingMigrations()

    if (pending.length === 0) {
      logger.info('没有待执行的迁移')
      return
    }

    logger.info(`发现 ${pending.length} 个待执行的迁移:`, pending.map((m) => m.name).join(', '))

    for (const migration of pending) {
      try {
        logger.info(`准备执行迁移: ${migration.name} (路径: ${migration.path})`)
        // 检查迁移文件是否存在
        if (!fs.existsSync(migration.path)) {
          logger.error(`迁移文件不存在: ${migration.path}`)
          throw new Error(`迁移文件不存在: ${migration.path}`)
        }
        executeMigration(migration)
      } catch (error) {
        logger.error(`迁移执行失败，停止后续迁移: ${migration.name}`, error as Error)
        throw error
      }
    }

    logger.info('所有迁移执行完成')
  } catch (error) {
    logger.error('执行迁移时发生错误', error as Error)
    throw error
  }
}

/**
 * 创建新的迁移文件
 * @param description 迁移描述（将用于文件名）
 * @returns 创建的迁移文件路径
 */
export function createMigration(description: string): string {
  // 获取下一个顺序号
  const allFiles = getAllMigrationFiles()
  const maxOrder = allFiles.length > 0 ? Math.max(...allFiles.map((f) => f.order)) : 0
  const nextOrder = maxOrder + 1

  // 格式化顺序号为3位数字（001, 002, ...）
  const orderStr = String(nextOrder).padStart(3, '0')

  // 清理描述，只保留字母、数字、下划线和连字符
  const cleanDescription = description
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')

  const fileName = `${orderStr}_${cleanDescription}.sql`
  const migrationsDir = getMigrationsDirectory()
  const filePath = path.join(migrationsDir, fileName)

  // 创建空的迁移文件
  const now = new Date()
  fs.writeFileSync(
    filePath,
    `-- Migration: ${description}\n-- Created: ${now.toISOString()}\n\n`,
    'utf-8'
  )

  logger.info(`迁移文件已创建: ${filePath}`)

  return filePath
}

/**
 * 回滚最后一个迁移（仅删除记录，不执行回滚 SQL）
 * 注意：SQLite 不支持自动回滚，需要手动编写回滚 SQL
 */
export function rollbackLastMigration(): boolean {
  const executed = getExecutedMigrations()

  if (executed.length === 0) {
    logger.warn('没有已执行的迁移可以回滚')
    return false
  }

  const lastMigration = executed[executed.length - 1]

  try {
    execute('DELETE FROM _migrations WHERE name = ?', [lastMigration.name])
    logger.info(`迁移记录已删除: ${lastMigration.name}`)
    logger.warn('注意：此操作仅删除了迁移记录，数据库结构变更需要手动回滚')
    return true
  } catch (error) {
    logger.error(`回滚迁移失败: ${lastMigration.name}`, error as Error)
    return false
  }
}

/**
 * 获取数据库当前版本（最后执行的迁移）
 */
export function getDatabaseVersion(): string | null {
  const executed = getExecutedMigrations()

  if (executed.length === 0) {
    return null
  }

  const lastMigration = executed[executed.length - 1]
  return lastMigration.name
}

/**
 * 获取迁移状态信息
 */
export function getMigrationStatus(): {
  executed: number
  pending: number
  total: number
  currentVersion: string | null
} {
  const executed = getExecutedMigrations()
  const pending = getPendingMigrations()
  const all = getAllMigrationFiles()

  return {
    executed: executed.length,
    pending: pending.length,
    total: all.length,
    currentVersion: getDatabaseVersion()
  }
}
