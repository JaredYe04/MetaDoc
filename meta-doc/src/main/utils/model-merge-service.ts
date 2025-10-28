/**
 * 模型合并服务 - TypeScript 重构版本
 * 处理分卷模型文件的合并
 */

import fs from 'fs';
import path from 'path';
import pathService from './path-service';
import type { FilePath, ModelInfo, ModelMergeResult } from '../../types/utils';

/**
 * 模型合并服务实现类
 */
class ModelMergeService {
  private readonly modelsJsonPath: FilePath;
  private readonly resourcesPath: FilePath;

  constructor() {
    this.resourcesPath = pathService.getResourcesPath();
    this.modelsJsonPath = path.join(this.resourcesPath, 'models.json');
  }

  /**
   * 合并模型分卷文件
   * @param modelFileName 模型文件名
   * @returns 合并后的完整模型路径
   */
  async mergeModel(modelFileName: string): Promise<string> {
    const result = await this.tryMergeModel(modelFileName);
    
    if (!result.success) {
      throw new Error(result.error || 'Model merge failed');
    }

    return result.mergedPath!;
  }

  /**
   * 尝试合并模型，返回详细结果
   * @param modelFileName 模型文件名
   * @returns 合并结果
   */
  async tryMergeModel(modelFileName: string): Promise<ModelMergeResult> {
    try {
      // 检查模型是否在配置中
      const modelExists = await this.isModelConfigured(modelFileName);
      if (!modelExists) {
        return {
          success: false,
          error: `模型 ${modelFileName} 在 models.json 中未找到`
        };
      }

      const mergedPath = path.join(this.resourcesPath, modelFileName);

      // 如果完整模型已存在，清理分卷文件并返回
      if (fs.existsSync(mergedPath)) {
        await this.cleanupPartFiles(modelFileName);
        return {
          success: true,
          mergedPath
        };
      }

      // 查找分卷文件
      const partFiles = this.findPartFiles(modelFileName);
      if (partFiles.length === 0) {
        return {
          success: false,
          error: `模型 ${modelFileName} 的分卷文件不存在`
        };
      }

      // 执行合并
      await this.performMerge(modelFileName, partFiles, mergedPath);

      return {
        success: true,
        mergedPath
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown merge error'
      };
    }
  }

  /**
   * 检查模型是否在配置文件中
   */
  private async isModelConfigured(modelFileName: string): Promise<boolean> {
    try {
      const modelsData: string[] = JSON.parse(
        fs.readFileSync(this.modelsJsonPath, 'utf-8')
      );
      return modelsData.includes(modelFileName);
    } catch (error) {
      console.error('Error reading models.json:', error);
      return false;
    }
  }

  /**
   * 查找分卷文件
   */
  private findPartFiles(modelFileName: string): string[] {
    try {
      const files = fs.readdirSync(this.resourcesPath);
      return files
        .filter(file => file.startsWith(modelFileName + '.part'))
        .sort(); // 保证按序合并
    } catch (error) {
      console.error('Error reading resources directory:', error);
      return [];
    }
  }

  /**
   * 执行实际的合并操作
   */
  private async performMerge(
    modelFileName: string,
    partFiles: string[],
    mergedPath: FilePath
  ): Promise<void> {
    console.log(`🔗 合并 ${partFiles.length} 个分卷为完整模型...`);

    const writeStream = fs.createWriteStream(mergedPath, { flags: 'w' });

    try {
      for (const partFile of partFiles) {
        const partPath = path.join(this.resourcesPath, partFile);
        const data = fs.readFileSync(partPath);
        writeStream.write(data);
        
        // 合并后删除分卷
        fs.unlinkSync(partPath);
      }
    } finally {
      writeStream.close();
    }

    console.log(`✅ 模型合并完成: ${mergedPath}`);
  }

  /**
   * 清理分卷文件
   */
  private async cleanupPartFiles(modelFileName: string): Promise<void> {
    const partFiles = this.findPartFiles(modelFileName);
    for (const partFile of partFiles) {
      const partPath = path.join(this.resourcesPath, partFile);
      try {
        fs.unlinkSync(partPath);
      } catch (error) {
        console.warn(`Failed to delete part file ${partFile}:`, error);
      }
    }
  }

  /**
   * 获取模型信息
   */
  getModelInfo(modelFileName: string): ModelInfo {
    const mergedPath = path.join(this.resourcesPath, modelFileName);
    const exists = fs.existsSync(mergedPath);
    const partFiles = this.findPartFiles(modelFileName);

    return {
      name: modelFileName,
      exists,
      partFiles
    };
  }

  /**
   * 检查模型是否需要合并
   */
  needsMerge(modelFileName: string): boolean {
    const info = this.getModelInfo(modelFileName);
    return !info.exists && info.partFiles.length > 0;
  }

  /**
   * 获取所有可用的模型
   */
  async getAvailableModels(): Promise<ModelInfo[]> {
    try {
      const modelsData: string[] = JSON.parse(
        fs.readFileSync(this.modelsJsonPath, 'utf-8')
      );
      
      return modelsData.map(modelName => this.getModelInfo(modelName));
    } catch (error) {
      console.error('Error reading models configuration:', error);
      return [];
    }
  }
}

// 创建单例实例
const modelMergeService = new ModelMergeService();

// 导出单例实例和类
export default modelMergeService;
export { ModelMergeService };

// 向后兼容的导出（保持原有API）
export const mergeModel = (modelFileName: string): Promise<string> =>
  modelMergeService.mergeModel(modelFileName);
