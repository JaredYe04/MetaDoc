/**
 * 通用数据库ORM层
 * 提供SQLite数据库连接、初始化和DDL管理
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { createMainLogger } from '../logger';

const logger = createMainLogger('Database');

let dbInstance: Database.Database | null = null;
let dbPath: string | null = null;

/**
 * 获取数据库文件路径
 */
export function getDatabasePath(): string {
  if (dbPath) {
    return dbPath;
  }

  // 获取程序所在文件夹（应用的用户数据目录）
  const userDataPath = app.getPath('userData');
  const dbDir = path.join(userDataPath, 'database');
  
  // 确保目录存在
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  dbPath = path.join(dbDir, 'meta-doc.db');
  return dbPath;
}

let sqliteVecLoaded = false;

/**
 * 加载sqlite-vec扩展
 */
function loadSqliteVecExtension(db: Database.Database): void {
  if (sqliteVecLoaded) {
    return;
  }

  try {
    // 优先尝试使用sqlite-vec npm包加载扩展（推荐方式）
    const sqliteVec = require('sqlite-vec');
    if (sqliteVec && typeof sqliteVec.load === 'function') {
      sqliteVec.load(db);
      sqliteVecLoaded = true;
      logger.info('sqlite-vec扩展加载成功（通过npm包）');
      return;
    } else {
      logger.debug('sqlite-vec包存在但load函数不可用');
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.debug(`无法通过npm包加载sqlite-vec: ${errorMsg}，尝试直接加载扩展文件`);
  }

  try {
    // 回退方案：直接加载扩展文件
    // 根据 sqlite-vec 的包结构，扩展文件在平台特定的包中
    const os = require('os');
    const platform = os.platform();
    const arch = os.arch();
    
    // 构建平台特定的包名和扩展文件名
    const platformName = platform === 'win32' ? 'windows' : platform;
    const archName = arch === 'x64' ? 'x64' : arch === 'arm64' ? 'arm64' : arch;
    const packageName = `sqlite-vec-${platformName}-${archName}`;
    
    // 尝试多个可能的路径（开发环境和打包环境）
    const possiblePaths: string[] = [];
    
    // 1. 相对于当前文件的路径（开发环境）
    if (platform === 'win32') {
      possiblePaths.push(path.join(__dirname, '../../../../node_modules', packageName, 'vec0.dll'));
    } else if (platform === 'darwin') {
      possiblePaths.push(path.join(__dirname, '../../../../node_modules', packageName, 'vec0.dylib'));
    } else {
      possiblePaths.push(path.join(__dirname, '../../../../node_modules', packageName, 'vec0.so'));
    }
    
    // 2. 使用 app.getAppPath()（打包环境）
    if (app && app.isPackaged) {
      const appPath = app.getAppPath();
      if (platform === 'win32') {
        possiblePaths.push(path.join(appPath, 'node_modules', packageName, 'vec0.dll'));
      } else if (platform === 'darwin') {
        possiblePaths.push(path.join(appPath, 'node_modules', packageName, 'vec0.dylib'));
      } else {
        possiblePaths.push(path.join(appPath, 'node_modules', packageName, 'vec0.so'));
      }
    }
    
    // 尝试每个可能的路径
    for (const extensionPath of possiblePaths) {
      if (extensionPath && fs.existsSync(extensionPath)) {
        db.loadExtension(extensionPath);
        sqliteVecLoaded = true;
        logger.info(`sqlite-vec扩展加载成功（通过扩展文件: ${extensionPath}）`);
        return;
      }
    }
    
    logger.debug(`扩展文件不存在，尝试的路径: ${possiblePaths.join(', ')}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.debug(`无法通过扩展文件加载sqlite-vec: ${errorMsg}`);
  }

  // 如果所有方法都失败，记录警告但继续运行
  logger.warn('sqlite-vec扩展加载失败，向量搜索将使用JavaScript计算余弦相似度。');
}

/**
 * 检查sqlite-vec扩展是否可用
 */
export function isSqliteVecAvailable(): boolean {
  if (!dbInstance) {
    return false;
  }

  // 如果已经加载过，直接返回
  if (sqliteVecLoaded) {
    return true;
  }

  try {
    // 尝试执行一个简单的sqlite-vec函数来验证扩展是否可用
    // 检查是否有vec0相关的函数或表
    const result = dbInstance.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='vec0_index'
    `).get();
    return result !== undefined;
  } catch {
    // 如果查询失败，尝试检查是否有vec_distance函数
    try {
      dbInstance.prepare("SELECT vec_distance(?)").run([new Float32Array([1, 2, 3])]);
      sqliteVecLoaded = true;
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * 获取数据库实例（单例模式）
 */
export function getDatabase(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbFilePath = getDatabasePath();
  logger.info(`连接数据库: ${dbFilePath}`);

  try {
    // 创建或打开数据库
    dbInstance = new Database(dbFilePath);
    
    // 启用外键约束（虽然SQLite默认不强制执行，但我们可以手动检查）
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
    
    // 启用扩展加载（在某些平台上可能需要）
    try {
      dbInstance.pragma('load_extension = true');
    } catch (error) {
      // 某些平台可能不支持动态加载扩展，忽略错误
      logger.debug('无法启用扩展加载（可能受限）', error);
    }
    
    // 尝试加载sqlite-vec扩展
    loadSqliteVecExtension(dbInstance);
    
    logger.info('数据库连接成功');
    return dbInstance;
  } catch (error) {
    logger.error('数据库连接失败', error as Error);
    throw error;
  }
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
      logger.info('数据库连接已关闭');
    } catch (error) {
      logger.error('关闭数据库连接失败', error as Error);
    } finally {
      dbInstance = null;
    }
  }
}

/**
 * 执行DDL语句（用于建表、建索引等）
 */
export function executeDDL(ddl: string): void {
  const db = getDatabase();
  try {
    db.exec(ddl);
    logger.debug('DDL执行成功');
  } catch (error) {
    logger.error('DDL执行失败', error as Error);
    throw error;
  }
}

/**
 * 执行查询（返回结果）
 */
export function query<T = any>(sql: string, params: any[] = []): T[] {
  const db = getDatabase();
  try {
    const stmt = db.prepare(sql);
    return stmt.all(...params) as T[];
  } catch (error) {
    logger.error('查询执行失败', error as Error, { sql, params });
    throw error;
  }
}

/**
 * 执行查询（返回单行）
 */
export function queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
  const db = getDatabase();
  try {
    const stmt = db.prepare(sql);
    return stmt.get(...params) as T | undefined;
  } catch (error) {
    logger.error('查询执行失败', error as Error, { sql, params });
    throw error;
  }
}

/**
 * 执行更新（INSERT、UPDATE、DELETE）
 */
export function execute(sql: string, params: any[] = []): Database.RunResult {
  const db = getDatabase();
  try {
    const stmt = db.prepare(sql);
    return stmt.run(...params);
  } catch (error) {
    logger.error('执行更新失败', error as Error, { sql, params });
    throw error;
  }
}

/**
 * 执行事务
 */
export function transaction<T>(fn: () => T): T {
  const db = getDatabase();
  const dbFn = db.transaction(fn);
  return dbFn();
}

/**
 * 检查表是否存在
 */
export function tableExists(tableName: string): boolean {
  const db = getDatabase();
  const result = queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?",
    [tableName]
  );
  return (result?.count || 0) > 0;
}

/**
 * 初始化数据库（建表等）
 */
export function initializeDatabase(ddlStatements: string[]): void {
  const db = getDatabase();
  
  try {
    // 开始事务
    db.transaction(() => {
      for (const ddl of ddlStatements) {
        db.exec(ddl);
      }
    })();
    
    logger.info('数据库初始化完成');
  } catch (error) {
    logger.error('数据库初始化失败', error as Error);
    throw error;
  }
}

