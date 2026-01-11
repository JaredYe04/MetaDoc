/**
 * 目录监听服务
 * 用于监听目录内容变化，实现工作目录的实时同步
 */

import * as chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import { createMainLogger } from '../logger';
import { WebContents } from 'electron';
import { isSupportedFormat } from './supported-formats';

const logger = createMainLogger('DirectoryWatcherService');

export interface DirectoryWatcherInfo {
  directoryPath: string;
  watcher: chokidar.FSWatcher;
  webContents: WebContents;
}

class DirectoryWatcherService {
  private watchers = new Map<string, DirectoryWatcherInfo>();
  private isEnabled = true;
  // 目录变化的防抖处理（避免频繁触发）
  private changeDebounceTimers = new Map<string, NodeJS.Timeout>();

  /**
   * 启动目录监听
   * @param directoryPath 目录路径
   * @param webContents 用于发送 IPC 消息的 WebContents
   */
  watchDirectory(directoryPath: string, webContents: WebContents): void {
    if (!this.isEnabled) {
      logger.debug('目录监听已禁用，跳过监听', { directoryPath });
      return;
    }

    // 规范化目录路径
    const normalizedPath = path.normalize(directoryPath);

    // 如果已经在监听，先停止旧的监听
    if (this.watchers.has(normalizedPath)) {
      this.unwatchDirectory(normalizedPath);
    }

    // 检查目录是否存在
    if (!fs.existsSync(normalizedPath)) {
      logger.warn('目录不存在，无法监听', { directoryPath: normalizedPath });
      return;
    }

    // 检查是否为目录
    const stats = fs.statSync(normalizedPath);
    if (!stats.isDirectory()) {
      logger.warn('路径不是目录，无法监听', { directoryPath: normalizedPath });
      return;
    }

    try {
      // 创建目录监听器
      // 优化：使用函数过滤器，避免同步 I/O，只做快速字符串操作
      const watcher = chokidar.watch(normalizedPath, {
        persistent: true,
        ignoreInitial: true, // 忽略初始事件
        ignored: (filePath: string) => {
          // 快速路径检查：只做字符串操作，不调用任何 I/O 操作
          const basename = path.basename(filePath);
          
          // 忽略常见目录（通过路径名判断，不需要 stat）
          if (basename === 'node_modules' || basename === '.git' || basename === '.vscode' || 
              basename === '.idea' || basename === 'dist' || basename === 'build' || 
              basename === '.next' || basename === '.nuxt' || basename === 'coverage') {
            return true;
          }
          
          // 忽略系统特殊目录（Windows 系统中可能没有权限的目录）
          // 这些目录通常包含在 Documents 目录中，但用户可能没有访问权限
          if (basename === 'My Music' || basename === 'My Pictures' || basename === 'My Videos' ||
              basename === 'My Documents' || basename === 'Desktop' || basename === 'Downloads' ||
              filePath.includes('\\My Music\\') || filePath.includes('\\My Pictures\\') ||
              filePath.includes('\\My Videos\\') || filePath.includes('/My Music/') ||
              filePath.includes('/My Pictures/') || filePath.includes('/My Videos/')) {
            return true;
          }
          
          // 快速扩展名检查：只处理文件，目录会在 addDir/unlinkDir 事件中处理
          // chokidar 会自动区分文件和目录，这里我们只通过扩展名过滤文件
          const ext = path.extname(filePath).toLowerCase();
          
          // 如果有扩展名但不在支持列表中，直接忽略
          // 注意：没有扩展名的文件/目录也会被检查，但这是可以接受的
          // 因为目录会在 addDir/unlinkDir 事件中处理，不会影响性能
          if (ext && ext !== '.' && !isSupportedFormat(ext)) {
            return true;
          }
          
          // 允许通过：支持的扩展名文件或目录（目录会在事件系统中正确处理）
          return false;
        },
        awaitWriteFinish: {
          stabilityThreshold: 300, // 等待文件写入稳定后再触发（300ms）
          pollInterval: 100, // 轮询间隔
        },
        depth: 10, // 监听深度（最多10层）
      });

      // 监听文件添加
      watcher.on('add', (filePath) => {
        this.handleDirectoryChange(normalizedPath, 'add', filePath, webContents);
      });

      // 监听文件变化
      watcher.on('change', (filePath) => {
        this.handleDirectoryChange(normalizedPath, 'change', filePath, webContents);
      });

      // 监听文件删除
      watcher.on('unlink', (filePath) => {
        this.handleDirectoryChange(normalizedPath, 'unlink', filePath, webContents);
      });

      // 监听目录添加
      watcher.on('addDir', (dirPath) => {
        this.handleDirectoryChange(normalizedPath, 'addDir', dirPath, webContents);
      });

      // 监听目录删除
      watcher.on('unlinkDir', (dirPath) => {
        this.handleDirectoryChange(normalizedPath, 'unlinkDir', dirPath, webContents);
      });

      // 监听错误
      watcher.on('error', (error: any) => {
        // 如果是权限错误（EPERM），只是警告并跳过，不影响用户体验
        if (error.code === 'EPERM' || error.errno === -4048) {
          logger.warn('目录监听权限错误，跳过该目录', { directoryPath: normalizedPath, path: error.path || error.filename, error: error.code || error.errno });
          return;
        }
        // 其他错误才记录为错误
        logger.error('目录监听错误', { directoryPath: normalizedPath, error });
      });

      // 保存监听器信息
      this.watchers.set(normalizedPath, {
        directoryPath: normalizedPath,
        watcher,
        webContents,
      });

      logger.info('开始监听目录', { directoryPath: normalizedPath });
    } catch (error) {
      logger.error('启动目录监听失败', { directoryPath: normalizedPath, error });
    }
  }

  /**
   * 停止目录监听
   * @param directoryPath 目录路径
   */
  unwatchDirectory(directoryPath: string): void {
    const normalizedPath = path.normalize(directoryPath);
    const info = this.watchers.get(normalizedPath);

    if (info) {
      try {
        info.watcher.close();
        this.watchers.delete(normalizedPath);
        // 清除防抖定时器
        const timer = this.changeDebounceTimers.get(normalizedPath);
        if (timer) {
          clearTimeout(timer);
          this.changeDebounceTimers.delete(normalizedPath);
        }
        logger.info('停止监听目录', { directoryPath: normalizedPath });
      } catch (error) {
        logger.error('停止目录监听失败', { directoryPath: normalizedPath, error });
      }
    }
  }

  /**
   * 停止所有目录监听
   */
  unwatchAll(): void {
    for (const [directoryPath] of this.watchers) {
      this.unwatchDirectory(directoryPath);
    }
  }

  /**
   * 处理目录变化（使用防抖）
   */
  private handleDirectoryChange(
    directoryPath: string,
    eventType: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir',
    filePath: string,
    webContents: WebContents
  ): void {
    // 清除之前的防抖定时器
    const existingTimer = this.changeDebounceTimers.get(directoryPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 设置新的防抖定时器（500ms）
    const timer = setTimeout(() => {
      this.changeDebounceTimers.delete(directoryPath);
      
      // 发送目录变化事件到渲染进程
      webContents.send('directory-changed', {
        directoryPath,
        eventType,
        filePath,
      });

      logger.debug('目录变化事件', { directoryPath, eventType, filePath });
    }, 500);

    this.changeDebounceTimers.set(directoryPath, timer);
  }

  /**
   * 检查目录是否正在被监听
   */
  isWatching(directoryPath: string): boolean {
    const normalizedPath = path.normalize(directoryPath);
    return this.watchers.has(normalizedPath);
  }

  /**
   * 获取所有正在监听的目录路径
   */
  getWatchedDirectories(): string[] {
    return Array.from(this.watchers.keys());
  }

  /**
   * 启用/禁用目录监听
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.unwatchAll();
    }
    logger.info('目录监听服务状态变更', { enabled });
  }
}

// 导出单例
export const directoryWatcherService = new DirectoryWatcherService();

