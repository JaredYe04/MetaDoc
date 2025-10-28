/**
 * 文件转换服务 - TypeScript 重构版本
 * 将各种文件格式转换为纯文本
 */

import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import type { 
  FilePath, 
  SupportedFileType, 
  FileConversionResult, 
  FileConversionService 
} from '../../types/utils';

/**
 * 文件转换服务实现类
 */
class FileConversionServiceImpl implements FileConversionService {
  
  /**
   * 支持的文件类型列表
   */
  public readonly supportedTypes: readonly SupportedFileType[] = ['txt', 'md', 'pdf', 'docx'] as const;

  /**
   * 将文件转换为文本
   * @param filePath 文件路径
   * @returns 转换后的文本内容，失败时返回null
   */
  async convertFileToText(filePath: FilePath): Promise<string | null> {
    try {
      const result = await this.tryConvertFileToText(filePath);
      return result.success ? result.text || null : null;
    } catch (error) {
      console.error('File conversion error:', error);
      return null;
    }
  }

  /**
   * 尝试转换文件到文本，返回详细结果
   * @param filePath 文件路径
   * @returns 转换结果对象
   */
  async tryConvertFileToText(filePath: FilePath): Promise<FileConversionResult> {
    try {
      const ext = this.getFileExtension(filePath);
      
      if (!this.isSupported(ext)) {
        return {
          success: false,
          error: `Unsupported file type: ${ext}`
        };
      }

      let text: string;

      switch (ext) {
        case 'txt':
        case 'md':
          text = await this.readTextFile(filePath);
          break;
        case 'pdf':
          text = await this.convertPdfToText(filePath);
          break;
        case 'docx':
          text = await this.convertDocxToText(filePath);
          break;
        default:
          return {
            success: false,
            error: `Unsupported file type: ${ext}`
          };
      }

      return {
        success: true,
        text
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown conversion error'
      };
    }
  }

  /**
   * 获取文件扩展名（不带点号）
   */
  private getFileExtension(filePath: FilePath): string {
    return path.extname(filePath).toLowerCase().slice(1);
  }

  /**
   * 检查文件类型是否受支持
   */
  private isSupported(extension: string): extension is SupportedFileType {
    return this.supportedTypes.includes(extension as SupportedFileType);
  }

  /**
   * 读取纯文本文件
   */
  private async readTextFile(filePath: FilePath): Promise<string> {
    return await fs.promises.readFile(filePath, 'utf-8');
  }

  /**
   * 将PDF文件转换为文本
   */
  private async convertPdfToText(filePath: FilePath): Promise<string> {
    try {
      const dataBuffer = await fs.promises.readFile(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } catch (error) {
      console.error('Error parsing PDF:', error);
      throw new Error('Failed to parse PDF file');
    }
  }

  /**
   * 将DOCX文件转换为文本
   */
  private async convertDocxToText(filePath: FilePath): Promise<string> {
    try {
      const buffer = await fs.promises.readFile(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      console.error('Error parsing DOCX:', error);
      throw new Error('Failed to parse DOCX file');
    }
  }

  /**
   * 检查文件是否存在
   */
  fileExists(filePath: FilePath): boolean {
    return fs.existsSync(filePath);
  }

  /**
   * 获取文件大小（字节）
   */
  getFileSize(filePath: FilePath): number {
    const stats = fs.statSync(filePath);
    return stats.size;
  }

  /**
   * 获取文件统计信息
   */
  getFileStats(filePath: FilePath): fs.Stats {
    return fs.statSync(filePath);
  }
}

// 创建单例实例
const fileConversionService = new FileConversionServiceImpl();

// 导出单例实例和类型
export default fileConversionService;
export { FileConversionServiceImpl };

// 向后兼容的导出（保持原有API）
export const tryConvertFileToText = (filePath: FilePath): Promise<string | null> => 
  fileConversionService.convertFileToText(filePath);
