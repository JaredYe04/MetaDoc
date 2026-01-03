/**
 * 自动更新服务
 * 基于 electron-updater 实现
 */

import { autoUpdater, UpdateInfo } from 'electron-updater';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
//@ts-ignore
import dotenv from 'dotenv';
import { createMainLogger } from '../logger';

const logger = createMainLogger('UpdateService');

// 更新渠道类型
export type UpdateChannel = 'dev' | 'release';

// 更新状态
export interface UpdateStatus {
  checking: boolean;
  updateAvailable: boolean;
  updateNotAvailable: boolean;
  error: string | null;
  updateInfo: UpdateInfo | null;
}

// 全局更新状态
let updateStatus: UpdateStatus = {
  checking: false,
  updateAvailable: false,
  updateNotAvailable: false,
  error: null,
  updateInfo: null
};

// 全局存储配置，避免重复读取
let updateConfig: {
  githubOwner: string;
  githubRepo: string;
  githubToken: string;
} | null = null;

/**
 * 加载更新配置
 */
function loadUpdateConfig(): { githubOwner: string; githubRepo: string; githubToken: string } | null {
  if (updateConfig) {
    return updateConfig;
  }

  try {
    // 加载环境变量（如果还没有加载）
    let envPath: string;
    if (app.isPackaged) {
      envPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', '.env');
    } else {
      envPath = path.resolve(__dirname, '../../../.env');
    }
    
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    }

    // 从环境变量读取配置
    const githubOwner = process.env.UPDATE_GITHUB_OWNER || '';
    const githubRepo = process.env.UPDATE_GITHUB_REPO || '';
    const githubToken = process.env.UPDATE_GITHUB_TOKEN || '';

    if (!githubOwner || !githubRepo) {
      logger.warn('更新服务未配置：缺少 UPDATE_GITHUB_OWNER 或 UPDATE_GITHUB_REPO 环境变量');
      logger.debug(`环境变量路径: ${envPath}, 文件存在: ${fs.existsSync(envPath)}`);
      return null;
    }

    updateConfig = { githubOwner, githubRepo, githubToken };
    return updateConfig;
  } catch (error) {
    logger.error('加载更新配置失败:', error);
    return null;
  }
}

/**
 * 清理更新安装包缓存
 * electron-updater 会在安装后自动清理，但为了确保，我们在应用启动时也清理旧的安装包
 * electron-updater 会将下载的安装包存储在临时目录中，安装完成后通常会自动清理
 * 这里我们作为额外保障，清理可能遗留的安装包文件
 */
function cleanupUpdateCache(): void {
  try {
    // electron-updater 的缓存目录位置取决于平台
    // Windows: %LOCALAPPDATA%\<app-name>\pending
    // macOS: ~/Library/Application Support/<app-name>/pending  
    // Linux: ~/.config/<app-name>/pending 或 ~/.cache/<app-name>/pending
    
    // 使用 app.getPath 获取用户数据目录（electron-updater 可能在这里存储待安装文件）
    const userDataPath = app.getPath('userData');
    const pendingDir = path.join(userDataPath, 'pending');
    
    if (fs.existsSync(pendingDir)) {
      try {
        // 清理 pending 目录中的安装包文件
        const files = fs.readdirSync(pendingDir);
        for (const file of files) {
          const filePath = path.join(pendingDir, file);
          try {
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
              // 检查文件扩展名，只清理安装包文件
              const ext = path.extname(file).toLowerCase();
              if (['.exe', '.dmg', '.zip', '.AppImage', '.deb', '.rpm', '.pkg'].includes(ext)) {
                fs.unlinkSync(filePath);
                logger.info(`已清理旧安装包: ${file}`);
              }
            }
          } catch (error) {
            logger.warn(`清理文件失败: ${file}`, error);
          }
        }
        
        // 如果目录为空，尝试删除目录
        try {
          const remainingFiles = fs.readdirSync(pendingDir);
          if (remainingFiles.length === 0) {
            fs.rmdirSync(pendingDir);
          }
        } catch (error) {
          // 忽略删除目录失败的错误
        }
      } catch (error) {
        logger.warn(`清理缓存目录失败: ${pendingDir}`, error);
      }
    }
    
    // 也检查临时目录中的 electron-updater 缓存
    const tempDir = os.tmpdir();
    const electronUpdaterCacheDir = path.join(tempDir, 'electron-updater');
    if (fs.existsSync(electronUpdaterCacheDir)) {
      try {
        const cacheDirs = fs.readdirSync(electronUpdaterCacheDir, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => path.join(electronUpdaterCacheDir, dirent.name, 'pending'));
        
        for (const pendingDir of cacheDirs) {
          if (fs.existsSync(pendingDir)) {
            try {
              const files = fs.readdirSync(pendingDir);
              for (const file of files) {
                const filePath = path.join(pendingDir, file);
                try {
                  const stats = fs.statSync(filePath);
                  if (stats.isFile()) {
                    const ext = path.extname(file).toLowerCase();
                    if (['.exe', '.dmg', '.zip', '.AppImage', '.deb', '.rpm', '.pkg'].includes(ext)) {
                      fs.unlinkSync(filePath);
                      logger.info(`已清理临时目录中的旧安装包: ${file}`);
                    }
                  }
                } catch (error) {
                  logger.warn(`清理临时文件失败: ${file}`, error);
                }
              }
            } catch (error) {
              logger.warn(`清理临时缓存目录失败: ${pendingDir}`, error);
            }
          }
        }
      } catch (error) {
        logger.debug('清理临时缓存目录失败（可忽略）:', error);
      }
    }
  } catch (error) {
    // 清理失败不影响应用启动
    logger.debug('清理更新缓存失败（可忽略）:', error);
  }
}

/**
 * 初始化更新服务
 */
export function initUpdateService(): void {
  try {
    // 清理旧的安装包缓存
    cleanupUpdateCache();
    
    const config = loadUpdateConfig();
    if (!config) {
      return;
    }

    // 配置 autoUpdater
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: config.githubOwner,
      repo: config.githubRepo,
      private: !!config.githubToken,
      token: config.githubToken || undefined
    });

    // 启用自动下载，用户手动选择安装更新
    autoUpdater.autoDownload = true;
    // 禁用自动安装，只允许用户手动选择安装更新
    autoUpdater.autoInstallOnAppQuit = false;
    
    // 允许检查预发布版本
    autoUpdater.allowPrerelease = true;

    // 在开发环境中也允许更新检查
    // electron-updater 默认在开发环境中会跳过更新检查
    // 通过设置 devUpdater 配置来强制启用开发环境更新检查
    if (!app.isPackaged) {
      try {
        // 方法1: 尝试设置 forceDevUpdateConfig（某些版本支持）
        (autoUpdater as any).forceDevUpdateConfig = true;
        logger.info('已启用开发环境更新检查 (forceDevUpdateConfig)');
      } catch (error) {
        // 如果 forceDevUpdateConfig 不存在，尝试其他方法
        try {
          // 方法2: 通过设置 devUpdater 配置
          const updaterConfig = (autoUpdater as any).config;
          if (updaterConfig) {
            updaterConfig.devUpdater = true;
            logger.info('已启用开发环境更新检查 (devUpdater)');
          }
        } catch (e) {
          logger.warn('无法强制启用开发环境更新检查，electron-updater 可能会跳过更新检查');
          logger.warn('提示：在开发环境中可以使用调试界面的"更新测试"功能来测试更新逻辑');
        }
      }
    }

    // 设置更新检查间隔（毫秒）- 默认24小时
    const checkInterval = parseInt(process.env.UPDATE_CHECK_INTERVAL || '86400000', 10);
    
    logger.info(`更新服务已初始化: ${config.githubOwner}/${config.githubRepo}${!app.isPackaged ? ' (开发环境)' : ''}`);
  } catch (error) {
    logger.error('初始化更新服务失败:', error);
  }
}

/**
 * 设置更新渠道
 */
export function setUpdateChannel(channel: UpdateChannel): void {
  try {
    const config = loadUpdateConfig();
    if (!config) {
      logger.warn('无法设置更新渠道：缺少配置');
      return;
    }

    // 根据渠道选择不同的tag前缀
    // dev渠道：使用dev标签
    // release渠道：使用latest标签或默认
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: config.githubOwner,
      repo: config.githubRepo,
      private: !!config.githubToken,
      token: config.githubToken || undefined,
      channel: channel === 'dev' ? 'dev' : undefined
    });

    logger.info(`更新渠道已设置为: ${channel}`);
  } catch (error) {
    logger.error('设置更新渠道失败:', error);
  }
}

/**
 * 检查更新
 */
export async function checkForUpdates(channel: UpdateChannel = 'release'): Promise<UpdateStatus> {
  return new Promise((resolve) => {
    try {
      // 在开发环境中，electron-updater 默认会跳过更新检查
      // 需要在每次检查前都设置 forceDevUpdateConfig
      if (!app.isPackaged) {
        try {
          (autoUpdater as any).forceDevUpdateConfig = true;
        } catch (error) {
          // 如果设置失败，继续尝试检查（可能会被跳过）
          logger.debug('无法设置 forceDevUpdateConfig，继续尝试检查更新');
        }
      }

      // 设置渠道
      setUpdateChannel(channel);

      // 重置状态
      updateStatus = {
        checking: true,
        updateAvailable: false,
        updateNotAvailable: false,
        error: null,
        updateInfo: null
      };

      // 检查更新事件处理
      autoUpdater.once('checking-for-update', () => {
        logger.info('正在检查更新...');
        updateStatus.checking = true;
      });

      autoUpdater.once('update-available', (info: UpdateInfo) => {
        logger.info('发现新版本:', info.version);
        updateStatus.checking = false;
        updateStatus.updateAvailable = true;
        updateStatus.updateInfo = info;
        resolve(updateStatus);
      });

      autoUpdater.once('update-not-available', (info: UpdateInfo) => {
        logger.info('当前已是最新版本:', info.version);
        updateStatus.checking = false;
        updateStatus.updateNotAvailable = true;
        updateStatus.updateInfo = info;
        resolve(updateStatus);
      });

      autoUpdater.once('error', (error: Error) => {
        logger.error('检查更新失败:', error);
        updateStatus.checking = false;
        updateStatus.error = error.message;
        resolve(updateStatus);
      });

      // 开始检查更新
      autoUpdater.checkForUpdates().catch((error) => {
        logger.error('检查更新异常:', error);
        updateStatus.checking = false;
        updateStatus.error = error.message;
        resolve(updateStatus);
      });
    } catch (error) {
      logger.error('检查更新失败:', error);
      updateStatus.checking = false;
      updateStatus.error = error instanceof Error ? error.message : String(error);
      resolve(updateStatus);
    }
  });
}

/**
 * 下载更新
 */
export async function downloadUpdate(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      // 使用 on 而不是 once，因为进度事件会多次触发
      const progressHandler = (progressObj: { percent: number }) => {
        logger.info('下载进度:', `${Math.round(progressObj.percent)}%`);
      };

      const downloadedHandler = () => {
        logger.info('更新下载完成');
        // 清理监听器
        autoUpdater.removeListener('download-progress', progressHandler);
        autoUpdater.removeListener('update-downloaded', downloadedHandler);
        autoUpdater.removeListener('error', errorHandler);
        resolve(true);
      };

      const errorHandler = (error: Error) => {
        logger.error('下载更新失败:', error);
        // 清理监听器
        autoUpdater.removeListener('download-progress', progressHandler);
        autoUpdater.removeListener('update-downloaded', downloadedHandler);
        autoUpdater.removeListener('error', errorHandler);
        reject(error);
      };

      autoUpdater.on('download-progress', progressHandler);
      autoUpdater.once('update-downloaded', downloadedHandler);
      autoUpdater.once('error', errorHandler);

      autoUpdater.downloadUpdate().catch((error) => {
        logger.error('下载更新异常:', error);
        // 清理监听器
        autoUpdater.removeListener('download-progress', progressHandler);
        autoUpdater.removeListener('update-downloaded', downloadedHandler);
        autoUpdater.removeListener('error', errorHandler);
        reject(error);
      });
    } catch (error) {
      logger.error('下载更新失败:', error);
      reject(error);
    }
  });
}

/**
 * 安装更新并退出
 */
export function quitAndInstall(): void {
  try {
    autoUpdater.quitAndInstall(false, true);
  } catch (error) {
    logger.error('安装更新失败:', error);
  }
}

/**
 * 获取当前更新状态
 */
export function getUpdateStatus(): UpdateStatus {
  return { ...updateStatus };
}

/**
 * 重置更新状态
 */
export function resetUpdateStatus(): void {
  updateStatus = {
    checking: false,
    updateAvailable: false,
    updateNotAvailable: false,
    error: null,
    updateInfo: null
  };
}
