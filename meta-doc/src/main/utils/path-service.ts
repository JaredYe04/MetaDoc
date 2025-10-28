/**
 * 路径管理服务 - TypeScript 重构版本
 * 统一管理应用中所有路径相关的功能
 */

import path from 'path';
import { app } from 'electron';
import type { FilePath, PathConfig, PathService } from '../../types/utils';

/**
 * 路径服务实现类
 */
class PathServiceImpl implements PathService {
  private readonly config: PathConfig;

  constructor() {
    this.config = this.initializeConfig();
  }

  /**
   * 初始化路径配置
   */
  private initializeConfig(): PathConfig {
    const isPackaged = app.isPackaged;
    let resourcesPath: FilePath;

    if (!isPackaged) {
      // 开发环境：相对于当前模块的路径
      resourcesPath = path.resolve(__dirname, '../../resources');
    } else {
      // 打包环境：从 process.resourcesPath 获取
      resourcesPath = path.join(process.resourcesPath, '/app.asar.unpacked/resources');
    }

    return {
      resourcesPath,
      vectorDatabasePath: path.join(resourcesPath, 'vector_database'),
      isPackaged,
    };
  }

  /**
   * 获取资源根路径
   */
  getResourcesPath(): FilePath {
    return this.config.resourcesPath;
  }

  /**
   * 获取向量数据库路径
   */
  getVectorDatabasePath(): FilePath {
    return this.config.vectorDatabasePath;
  }

  /**
   * 获取路径配置
   */
  getConfig(): PathConfig {
    return { ...this.config };
  }

  /**
   * 获取指定资源文件的完整路径
   */
  getResourceFile(relativePath: string): FilePath {
    return path.join(this.config.resourcesPath, relativePath);
  }

  /**
   * 获取模型文件路径
   */
  getModelPath(modelName: string): FilePath {
    return this.getResourceFile(modelName);
  }

  /**
   * 获取向量数据库文件路径
   */
  getVectorDatabaseFile(fileName: string): FilePath {
    return path.join(this.config.vectorDatabasePath, fileName);
  }

  /**
   * 获取tectonic可执行文件路径
   */
  getTectonicPath(): FilePath {
    return this.getResourceFile('tectonic.exe');
  }

  /**
   * 检查路径是否存在（可选的辅助方法）
   */
  exists(filePath: FilePath): boolean {
    const fs = require('fs');
    return fs.existsSync(filePath);
  }
}

// 创建单例实例
const pathService = new PathServiceImpl();

// 导出单例实例和类型
export default pathService;
export { PathServiceImpl };
export type { PathService };

// 向后兼容的导出（保持原有API）
export const getResourcesPath = (): FilePath => pathService.getResourcesPath();
export const getVectorDatabasePath = (): FilePath => pathService.getVectorDatabasePath();
