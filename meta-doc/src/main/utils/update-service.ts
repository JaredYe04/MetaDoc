/**
 * 自动更新服务
 * 基于 electron-updater 实现
 */

import { autoUpdater, UpdateInfo } from 'electron-updater';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
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
 * 初始化更新服务
 */
export function initUpdateService(): void {
  try {
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

    // 禁用自动下载（手动控制）
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    
    // 允许检查预发布版本
    autoUpdater.allowPrerelease = true;

    // 设置更新检查间隔（毫秒）- 默认24小时
    const checkInterval = parseInt(process.env.UPDATE_CHECK_INTERVAL || '86400000', 10);
    
    logger.info(`更新服务已初始化: ${config.githubOwner}/${config.githubRepo}`);
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
      autoUpdater.once('download-progress', (progressObj) => {
        logger.info('下载进度:', `${Math.round(progressObj.percent)}%`);
      });

      autoUpdater.once('update-downloaded', () => {
        logger.info('更新下载完成');
        resolve(true);
      });

      autoUpdater.once('error', (error: Error) => {
        logger.error('下载更新失败:', error);
        reject(error);
      });

      autoUpdater.downloadUpdate().catch((error) => {
        logger.error('下载更新异常:', error);
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
