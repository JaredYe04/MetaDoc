/**
 * 更新服务 Mock 工具
 * 用于在开发环境中模拟更新检查、下载等功能
 */

export interface MockUpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

export interface MockUpdateStatus {
  checking: boolean;
  updateAvailable: boolean;
  updateNotAvailable: boolean;
  error: string | null;
  updateInfo: MockUpdateInfo | null;
}

export interface MockDownloadProgress {
  percent: number;
  transferred: number;
  total: number;
}

class UpdateMockService {
  private currentVersion: string = '0.13.4';
  private mockUpdateVersion: string = '0.14.0';
  private updateStatus: MockUpdateStatus = {
    checking: false,
    updateAvailable: false,
    updateNotAvailable: false,
    error: null,
    updateInfo: null
  };
  private downloadProgress: number = 0;
  private isDownloading: boolean = false;
  private downloadAbortController: AbortController | null = null;
  private progressCallbacks: Array<(progress: MockDownloadProgress) => void> = [];

  /**
   * 设置当前版本（用于测试）
   */
  setCurrentVersion(version: string): void {
    this.currentVersion = version;
  }

  /**
   * 设置模拟更新版本（用于测试）
   */
  setMockUpdateVersion(version: string): void {
    this.mockUpdateVersion = version;
  }

  /**
   * 模拟检查更新
   */
  async checkForUpdates(channel: 'dev' | 'release' = 'release', shouldHaveUpdate: boolean = true): Promise<MockUpdateStatus> {
    this.updateStatus = {
      checking: true,
      updateAvailable: false,
      updateNotAvailable: false,
      error: null,
      updateInfo: null
    };

    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

    if (Math.random() < 0.1) {
      // 10% 概率模拟网络错误
      this.updateStatus = {
        checking: false,
        updateAvailable: false,
        updateNotAvailable: false,
        error: '网络连接失败，请检查网络设置',
        updateInfo: null
      };
      return { ...this.updateStatus };
    }

    if (shouldHaveUpdate) {
      // 模拟发现新版本
      this.updateStatus = {
        checking: false,
        updateAvailable: true,
        updateNotAvailable: false,
        error: null,
        updateInfo: {
          version: this.mockUpdateVersion,
          releaseDate: new Date().toISOString(),
          releaseNotes: `版本 ${this.mockUpdateVersion} 更新内容：\n- 修复了若干已知问题\n- 优化了性能\n- 新增了多项功能`
        }
      };
    } else {
      // 模拟已是最新版本
      this.updateStatus = {
        checking: false,
        updateAvailable: false,
        updateNotAvailable: true,
        error: null,
        updateInfo: {
          version: this.currentVersion,
          releaseDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        }
      };
    }

    return { ...this.updateStatus };
  }

  /**
   * 模拟下载更新
   */
  async downloadUpdate(
    onProgress?: (progress: MockDownloadProgress) => void
  ): Promise<{ success: boolean; error?: string }> {
    if (this.isDownloading) {
      return { success: false, error: '下载已在进行中' };
    }

    if (!this.updateStatus.updateAvailable) {
      return { success: false, error: '没有可用的更新' };
    }

    this.isDownloading = true;
    this.downloadProgress = 0;
    this.downloadAbortController = new AbortController();

    if (onProgress) {
      this.progressCallbacks.push(onProgress);
    }

    try {
      // 模拟下载过程（3-5秒）
      const downloadDuration = 3000 + Math.random() * 2000;
      const steps = 50;
      const stepDuration = downloadDuration / steps;

      for (let i = 0; i <= steps; i++) {
        if (this.downloadAbortController?.signal.aborted) {
          throw new Error('下载已取消');
        }

        this.downloadProgress = (i / steps) * 100;
        const progress: MockDownloadProgress = {
          percent: Math.round(this.downloadProgress),
          transferred: Math.round((i / steps) * 100 * 1024 * 1024), // 假设总大小 100MB
          total: 100 * 1024 * 1024
        };

        // 通知所有进度回调
        this.progressCallbacks.forEach(callback => {
          try {
            callback(progress);
          } catch (error) {
            console.error('进度回调执行失败:', error);
          }
        });

        await new Promise(resolve => setTimeout(resolve, stepDuration));
      }

      this.isDownloading = false;
      this.downloadProgress = 100;
      return { success: true };
    } catch (error) {
      this.isDownloading = false;
      this.downloadProgress = 0;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    } finally {
      this.progressCallbacks = [];
      this.downloadAbortController = null;
    }
  }

  /**
   * 取消下载
   */
  cancelDownload(): void {
    if (this.downloadAbortController) {
      this.downloadAbortController.abort();
      this.isDownloading = false;
      this.downloadProgress = 0;
      this.progressCallbacks = [];
    }
  }

  /**
   * 模拟安装更新并重启
   */
  async quitAndInstall(): Promise<void> {
    if (!this.updateStatus.updateAvailable) {
      throw new Error('没有可用的更新');
    }

    // 模拟安装过程
    await new Promise(resolve => setTimeout(resolve, 500));

    // 在真实环境中，这里会调用 electron-updater 的 quitAndInstall
    // 在 mock 环境中，我们只是模拟
    console.log('[Mock] 模拟安装更新并重启应用');
  }

  /**
   * 获取当前更新状态
   */
  getUpdateStatus(): MockUpdateStatus {
    return { ...this.updateStatus };
  }

  /**
   * 获取下载进度
   */
  getDownloadProgress(): number {
    return this.downloadProgress;
  }

  /**
   * 检查是否正在下载
   */
  isDownloadingUpdate(): boolean {
    return this.isDownloading;
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.updateStatus = {
      checking: false,
      updateAvailable: false,
      updateNotAvailable: false,
      error: null,
      updateInfo: null
    };
    this.downloadProgress = 0;
    this.isDownloading = false;
    if (this.downloadAbortController) {
      this.downloadAbortController.abort();
      this.downloadAbortController = null;
    }
    this.progressCallbacks = [];
  }

  /**
   * 模拟获取版本信息
   */
  async getVersionInfo(): Promise<{ version: string; updatedAt: string }> {
    return {
      version: this.currentVersion,
      updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    };
  }
}

// 导出单例
export const updateMockService = new UpdateMockService();

