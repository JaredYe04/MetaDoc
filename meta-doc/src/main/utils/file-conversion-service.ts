/**
 * 文件转换服务 - TypeScript 重构版本
 * 将各种文件格式转换为纯文本
 */

import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import Store from 'electron-store';
import type { 
  FilePath, 
  SupportedFileType, 
  FileConversionResult, 
  FileConversionService 
} from '../../types/utils';
import { createMainLogger } from '../logger';
import ocrService from './ocr-service';
import os from 'os';
import type { BrowserWindow } from 'electron';
const logger = createMainLogger('FileConversionService');

/**
 * 进度回调函数类型
 */
export type ProgressCallback = (progress: {
  message: string;
  subMessage?: string;
  percentage: number;
  status?: 'success' | 'exception' | 'warning' | '';
  params?: Record<string, any>;
}) => void;
/**
 * 文件转换服务实现类
 */
class FileConversionServiceImpl implements FileConversionService {
  
  /**
   * 支持的文件类型列表
   */
  public readonly supportedTypes: readonly SupportedFileType[] = ['txt', 'md', 'pdf', 'docx', 'pptx', 'xlsx', 'xls'] as SupportedFileType[];
  private readonly settingStore = new Store();

  /**
   * OCR任务Promise池：用于统一管理和取消OCR任务
   * key: requestId，value: Promise数组（包含worker引用）
   */
  private readonly ocrTaskPools = new Map<string, Array<{ promise: Promise<any>; worker?: any }>>();

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
      logger.error('File conversion error:', error);
      return null;
    }
  }

  /**
   * 尝试转换文件到文本，返回详细结果
   * @param filePath 文件路径
   * @param progressCallback 进度回调函数（可选）
   * @param abortSignal 取消信号（可选）
   * @param requestId 请求ID，用于管理OCR任务池（可选）
   * @returns 转换结果对象
   */
  async tryConvertFileToText(filePath: FilePath, progressCallback?: ProgressCallback, abortSignal?: AbortSignal, requestId?: string): Promise<FileConversionResult> {
    try {
      const ext = this.getFileExtension(filePath);
      
      if (!this.isSupported(ext)) {
        return {
          success: false,
          error: `Unsupported file type: ${ext}`
        };
      }

      let text: string;

      // 根据文件扩展名选择转换方法
      if (ext === 'txt' || ext === 'md') {
          text = await this.readTextFile(filePath);
      } else if (ext === 'pdf') {
        text = await this.convertPdfToText(filePath, progressCallback, abortSignal, requestId);
      } else if (ext === 'docx') {
        text = await this.convertDocxToText(filePath, progressCallback, abortSignal, requestId);
      } else if (ext === 'pptx') {
        text = await this.convertPptxToText(filePath, progressCallback, abortSignal, requestId);
      } else if (ext === 'xlsx' || ext === 'xls') {
        text = await this.convertExcelToText(filePath);
      } else {
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
      // 如果任务被取消，清空OCR任务池
      if (requestId && error instanceof Error && error.message === '操作已取消') {
        this.clearOcrTaskPool(requestId);
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown conversion error'
      };
    } finally {
      // 任务完成后清理OCR任务池
      if (requestId) {
        this.clearOcrTaskPool(requestId);
      }
    }
  }

  /**
   * 添加OCR任务到Promise池
   */
  private addOcrTaskToPool(requestId: string, promise: Promise<any>, worker?: any): void {
    if (!requestId) return;
    if (!this.ocrTaskPools.has(requestId)) {
      this.ocrTaskPools.set(requestId, []);
    }
    this.ocrTaskPools.get(requestId)!.push({ promise, worker });
  }

  /**
   * 清空指定requestId的OCR任务池并终止所有worker
   */
  private async clearOcrTaskPool(requestId: string): Promise<void> {
    if (!requestId) return;
    const pool = this.ocrTaskPools.get(requestId);
    if (pool) {
      logger.info(`清空OCR任务池: ${requestId}，共 ${pool.length} 个任务`);
      // 终止所有worker（不等待，因为可能已经被终止）
      const terminatePromises = pool
        .filter(({ worker }) => worker && typeof worker.terminate === 'function')
        .map(({ worker }) => {
          try {
            return worker!.terminate();
          } catch (error) {
            logger.warn('终止OCR worker失败:', error);
            return Promise.resolve();
          }
        });
      // 并行终止所有worker，但不等待完成（因为可能已经被终止）
      Promise.allSettled(terminatePromises).catch(() => {
        // 忽略错误，因为worker可能已经被终止
      });
      this.ocrTaskPools.delete(requestId);
    }
  }

  /**
   * 取消指定requestId的所有OCR任务（公共方法）
   */
  public async cancelOcrTasks(requestId: string): Promise<void> {
    if (!requestId) return;
    await this.clearOcrTaskPool(requestId);
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
    const supportedExtensions: string[] = ['txt', 'md', 'pdf', 'docx', 'pptx', 'xlsx', 'xls'];
    return supportedExtensions.includes(extension);
  }

  /**
   * 是否允许解析文档内嵌图片（OCR）
   */
  private isEmbeddedImageParsingEnabled(): boolean {
    try {
      const value = this.settingStore.get('parseEmbeddedImages');
      // 默认开启，只有显式为 false 时才关闭
      return value !== false;
    } catch (error) {
      logger.warn('读取解析图片设置失败，默认开启:', error);
      return true;
    }
  }

  /**
   * 读取纯文本文件
   */
  private async readTextFile(filePath: FilePath): Promise<string> {
    return await fs.promises.readFile(filePath, 'utf-8');
  }

  /**
   * 将PDF文件转换为文本（包含图片OCR）
   * @param filePath 文件路径
   * @param progressCallback 进度回调函数（可选）
   * @param abortSignal 取消信号（可选）
   * @param requestId 请求ID，用于管理OCR任务池（可选）
   */
  private async convertPdfToText(filePath: FilePath, progressCallback?: ProgressCallback, abortSignal?: AbortSignal, requestId?: string): Promise<string> {
    try {
      progressCallback?.({
        message: 'agent.reference.progress.parsingFile',
        subMessage: 'agent.reference.progress.extractingText',
        percentage: 10,
        params: { filename: path.basename(filePath) }
      });
      
      const dataBuffer = await fs.promises.readFile(filePath);
      const data = await pdfParse(dataBuffer);
      const numPages = data.numpages || 1;
      const parseImages = this.isEmbeddedImageParsingEnabled();
      
      // 按页面提取文本和OCR结果
      let fullText = '';
      
      if (parseImages) {
        try {
          // 提取所有图片的OCR结果（按页面分组）
          const imageOcrResults = await this.extractImagesFromPdfAndOCR(dataBuffer, progressCallback, abortSignal, requestId);
          
          // 按页面分组OCR结果
          const ocrByPage = new Map<number, string[]>();
          for (const ocrResult of imageOcrResults) {
            // OCR结果格式：`第${pageIndex}页 图片${imageIndex}:\n${ocrText}`
            const pageMatch = ocrResult.match(/第(\d+)页/);
            if (pageMatch) {
              const pageNum = parseInt(pageMatch[1], 10);
              if (!ocrByPage.has(pageNum)) {
                ocrByPage.set(pageNum, []);
              }
              // 提取OCR文本（去掉页眉）
              const ocrText = ocrResult.replace(/^第\d+页 图片\d+:\s*\n/, '');
              ocrByPage.get(pageNum)!.push(ocrText);
            }
          }
          
          // 按页面构建文本，在每页文本后插入该页的OCR结果
          // 注意：pdf-parse提取的文本是全部文本，我们需要估算每页的文本位置
          const allText = data.text || '';
          const textLines = allText.split('\n');
          const linesPerPage = Math.max(1, Math.floor(textLines.length / numPages));
          
          for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const startLine = (pageNum - 1) * linesPerPage;
            const endLine = pageNum === numPages ? textLines.length : pageNum * linesPerPage;
            const pageText = textLines.slice(startLine, endLine).join('\n');
            
            if (pageText.trim()) {
              fullText += pageText;
            }
            
            // 在该页文本后插入该页的OCR结果
            const pageOcrResults = ocrByPage.get(pageNum);
            if (pageOcrResults && pageOcrResults.length > 0) {
              // 清理OCR结果中的连续换行符（最多2个）
              const cleanedOcrResults = pageOcrResults.map(ocr => ocr.replace(/\n{3,}/g, '\n\n'));
              fullText += '\n\n[第' + pageNum + '页图片OCR识别结果]\n' + cleanedOcrResults.join('\n\n');
            }
            
            // 页面之间添加分隔
            if (pageNum < numPages) {
              fullText += '\n\n---\n\n';
            }
          }
        } catch (ocrError) {
          // 如果是取消错误，直接抛出
          if (ocrError instanceof Error && ocrError.message === '操作已取消') {
            throw ocrError;
          }
          logger.warn('PDF图片OCR失败，继续使用文本内容:', ocrError);
          // OCR失败时回退到原始文本
          fullText = data.text || '';
        }
      } else {
        logger.info('已关闭解析文档内嵌图片设置，跳过PDF图片OCR');
        fullText = data.text || '';
      }
      
      return fullText;
    } catch (error) {
      logger.error('Error parsing PDF:', error);
      throw new Error('Failed to parse PDF file');
    }
  }

  /**
   * 从PDF中提取图片并进行OCR（并行处理）
   * 使用pdf-parse解析PDF，然后通过正则表达式提取图片引用
   * 注意：这是一个简化实现，对于复杂PDF可能无法提取所有图片
   * @param pdfBuffer PDF文件Buffer
   * @param progressCallback 进度回调函数（可选）
   * @param abortSignal 取消信号（可选）
   * @param requestId 请求ID，用于管理OCR任务池（可选）
   */
  private async extractImagesFromPdfAndOCR(pdfBuffer: Buffer, progressCallback?: ProgressCallback, abortSignal?: AbortSignal, requestId?: string): Promise<string[]> {
    try {
      // 使用pdf-parse获取PDF信息
      const pdfData = await pdfParse(pdfBuffer);
      const numPages = pdfData.numpages || 1;
      
      logger.info(`PDF中找到 ${numPages} 页，开始提取图片并并行OCR识别`);
      
      // 尝试从PDF Buffer中提取图片
      // PDF格式中，图片通常以特定的字节模式存储
      // 这里我们使用一个简化的方法：查找PDF中的图片流对象
      const images: Array<{ pageIndex: number; imageIndex: number; imageBuffer: Buffer }> = [];
      
      // 查找PDF中的图片对象（查找 /Image 和 stream 标记）
      const pdfString = pdfBuffer.toString('binary');
      const imagePattern = /\/Subtype\s*\/Image[\s\S]*?stream\s*([\s\S]*?)\s*endstream/gi;
      let match;
      let imageIndex = 0;
      
      while ((match = imagePattern.exec(pdfString)) !== null) {
        try {
          const streamData = match[1];
          // 移除可能的空白字符和换行
          const cleanStream = streamData.replace(/[\r\n\s]/g, '');
          
          // 尝试解码Base85或Hex编码的图片数据
          // 这里简化处理，直接尝试将数据转换为Buffer
          let imageBuffer: Buffer;
          
          try {
            // 尝试作为十六进制解码
            if (/^[0-9a-fA-F]+$/.test(cleanStream)) {
              imageBuffer = Buffer.from(cleanStream, 'hex');
            } else {
              // 尝试作为二进制数据
              imageBuffer = Buffer.from(streamData, 'binary');
            }
            
            // 验证是否为有效的图片数据（检查常见的图片文件头）
            const isValidImage = this.isValidImageBuffer(imageBuffer);
            if (isValidImage && imageBuffer.length > 100) { // 至少100字节
              imageIndex++;
              // 估算页面索引（简化处理，假设图片均匀分布）
              const estimatedPage = Math.min(Math.floor((imageIndex / 10) + 1), numPages);
              images.push({
                pageIndex: estimatedPage,
                imageIndex: imageIndex,
                imageBuffer: imageBuffer
              });
            }
          } catch (decodeError) {
            logger.debug(`解码PDF图片流失败:`, decodeError);
          }
        } catch (error) {
          logger.debug(`提取PDF图片流失败:`, error);
        }
      }
      
      // 如果上面的方法没有找到图片，尝试使用更通用的方法
      // 查找所有可能的图片数据块
      if (images.length === 0) {
        logger.debug('使用备用方法提取PDF图片');
        // 可以在这里添加其他提取方法
      }
      
      if (images.length === 0) {
        logger.info('PDF中没有找到可提取的图片');
        return [];
      }
      
      logger.info(`PDF中找到 ${images.length} 张图片，开始并行OCR识别`);
      
      // 检查是否已取消
      if (abortSignal?.aborted) {
        throw new Error('操作已取消');
      }
      
      progressCallback?.({
        message: 'agent.reference.progress.ocrRecognizing',
        subMessage: 'agent.reference.progress.foundImages',
        percentage: 30,
        params: { 
          count: images.length,
          totalPages: numPages,
          imageTotal: images.length,
          imageCurrent: 0
        }
      });
      
      // 并行进行OCR识别，带进度更新
      // 计算每张图片的进度增量
      const progressPerImage = images.length > 0 ? 60 / images.length : 0;
      let completedCount = 0;
      
      // 创建包装的进度回调，在发送进度前检查是否已取消
      const safeProgressCallback = (progress: Parameters<ProgressCallback>[0]) => {
        if (abortSignal?.aborted) {
          return; // 如果已取消，不发送进度更新
        }
        progressCallback?.(progress);
      };
      
      // 创建OCR任务Promise数组
      const ocrPromises = images.map(async ({ pageIndex, imageIndex, imageBuffer }, idx) => {
        // 检查是否已取消
        if (abortSignal?.aborted) {
          throw new Error('操作已取消');
        }
        
        try {
          const { promise, worker } = await ocrService.recognizeFromBufferWithWorker(imageBuffer, undefined, abortSignal);
          
          // 将Promise和worker添加到池中
          if (requestId) {
            this.addOcrTaskToPool(requestId, promise, worker);
          }
          
          const ocrText = await promise;
          
          // 检查是否已取消（在OCR完成后）
          if (abortSignal?.aborted) {
            throw new Error('操作已取消');
          }
          
          // 每完成一张图片，更新进度（使用安全的进度回调）
          completedCount++;
          safeProgressCallback({
            message: 'agent.reference.progress.ocrRecognizing',
            subMessage: 'agent.reference.progress.processingImageWithPage',
            percentage: 30 + Math.round(completedCount * progressPerImage),
            params: { 
              current: completedCount, 
              total: images.length, 
              page: pageIndex,
              totalPages: numPages,
              imageCurrent: completedCount,
              imageTotal: images.length
            }
          });
          
          if (ocrText.trim()) {
            return `第${pageIndex}页 图片${imageIndex}:\n${ocrText}`;
          }
          return null;
        } catch (error) {
          // 如果是因为取消而失败，直接抛出
          if (abortSignal?.aborted || (error instanceof Error && error.message === '操作已取消')) {
            throw error;
          }
          completedCount++;
          // 即使失败也要更新进度（使用安全的进度回调）
          safeProgressCallback({
            message: 'agent.reference.progress.ocrRecognizing',
            subMessage: 'agent.reference.progress.processingImageFailed',
            percentage: 30 + Math.round(completedCount * progressPerImage),
            params: { 
              current: completedCount, 
              total: images.length, 
              page: pageIndex,
              totalPages: numPages,
              imageCurrent: completedCount,
              imageTotal: images.length
            }
          });
          logger.warn(`PDF第${pageIndex}页图片${imageIndex} OCR失败:`, error instanceof Error ? error.message : String(error));
          return null;
        }
      });
      
      const ocrResults = await Promise.allSettled(ocrPromises);
      
      // 检查是否有因取消而失败的任务
      const hasCancelled = ocrResults.some(result => 
        result.status === 'rejected' && 
        result.reason instanceof Error && 
        result.reason.message === '操作已取消'
      );
      if (hasCancelled) {
        throw new Error('操作已取消');
      }
      
      // 收集成功的OCR结果
      const results = ocrResults
        .map((result) => {
          if (result.status === 'fulfilled' && result.value !== null) {
            return result.value;
          }
          return null;
        })
        .filter((text): text is string => text !== null);
      
      logger.info(`PDF OCR完成，成功识别 ${results.length}/${images.length} 张图片`);
      
      return results;
    } catch (error) {
      logger.warn('提取PDF图片失败:', error);
      return [];
    }
  }

  /**
   * 验证Buffer是否为有效的图片数据
   * @param buffer 待验证的Buffer
   * @returns 是否为有效图片
   */
  private isValidImageBuffer(buffer: Buffer): boolean {
    if (!buffer || buffer.length < 10) {
      return false;
    }
    
    // 检查常见的图片文件头
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return true;
    }
    
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return true;
    }
    
    // GIF: 47 49 46 38
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
      return true;
    }
    
    // BMP: 42 4D
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
      return true;
    }
    
    return false;
  }

  /**
   * 将DOCX文件转换为文本（包含图片OCR）
   * @param filePath 文件路径
   * @param progressCallback 进度回调函数（可选）
   * @param abortSignal 取消信号（可选）
   * @param requestId 请求ID，用于管理OCR任务池（可选）
   */
  private async convertDocxToText(filePath: FilePath, progressCallback?: ProgressCallback, abortSignal?: AbortSignal, requestId?: string): Promise<string> {
    try {
      // 检查是否已取消
      if (abortSignal?.aborted) {
        throw new Error('操作已取消');
      }
      
      progressCallback?.({
        message: 'agent.reference.progress.parsingFile',
        subMessage: 'agent.reference.progress.extractingText',
        percentage: 10,
        params: { filename: path.basename(filePath) }
      });
      
      const buffer = await fs.promises.readFile(filePath);
      
      // 检查是否已取消
      if (abortSignal?.aborted) {
        throw new Error('操作已取消');
      }
      
      // 验证buffer是否有效
      if (!buffer || buffer.length === 0) {
        throw new Error('DOCX文件为空或无法读取');
      }
      
      // 验证是否为有效的DOCX文件（检查ZIP文件头）
      if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
        throw new Error('文件不是有效的DOCX格式（缺少ZIP文件头）');
      }
      
      // 使用mammoth提取文本，如果失败则抛出错误
      let result;
      try {
        result = await mammoth.extractRawText({ buffer });
      } catch (mammothError) {
        logger.error('Mammoth提取文本失败:', mammothError);
        const errorDetails = mammothError instanceof Error 
          ? `${mammothError.message}${mammothError.stack ? `\n${mammothError.stack}` : ''}` 
          : String(mammothError);
        logger.error('详细错误信息:', errorDetails);
        throw new Error(`Word解析失败: ${errorDetails}`);
      }
      
      // 检查mammoth返回的结果
      if (!result) {
        throw new Error('Mammoth返回空结果');
      }
      
      let text = result.value || '';
      const parseImages = this.isEmbeddedImageParsingEnabled();
      
      // 提取DOCX中的图片并进行OCR
      if (parseImages) {
        try {
          // 使用mammoth的HTML输出，保留图片位置信息
          const htmlResult = await mammoth.convertToHtml({ buffer });
          const htmlText = htmlResult.value || '';
          
          // 提取图片OCR结果
          const imageOcrResults = await this.extractImagesFromDocxAndOCR(buffer, progressCallback, abortSignal, requestId);
          
          if (imageOcrResults.length > 0) {
            // 解析HTML，找到图片位置，并在相应位置插入OCR结果
            // 由于HTML中图片通常以<img>标签形式存在，我们可以找到这些位置
            let resultText = text;
            const textLines = text.split('\n');
            const imageCount = imageOcrResults.length;
            
            // 如果HTML中有图片标记，尝试在相应位置插入
            // 否则，在文档中按段落均匀分布插入
            const paragraphCount = textLines.filter(line => line.trim() !== '').length;
            const insertInterval = paragraphCount > imageCount ? Math.max(1, Math.floor(paragraphCount / (imageCount + 1))) : 1;
            
            let resultLines: string[] = [];
            let imageInserted = 0;
            let nonEmptyLineCount = 0;
            
            for (let i = 0; i < textLines.length; i++) {
              const line = textLines[i];
              resultLines.push(line);
              
              // 在非空行后按间隔插入OCR结果
              if (line.trim() !== '') {
                nonEmptyLineCount++;
                if (imageInserted < imageCount && nonEmptyLineCount % insertInterval === 0) {
                  const ocrText = imageOcrResults[imageInserted];
                  // 提取OCR文本（去掉图片标识）
                  let cleanOcrText = ocrText.replace(/^图片 \d+ \([^)]+\):\s*\n/, '').trim();
                  // 清理连续换行符（最多2个）
                  cleanOcrText = cleanOcrText.replace(/\n{3,}/g, '\n\n');
                  if (cleanOcrText) {
                    resultLines.push('');
                    resultLines.push('[图片OCR识别结果]');
                    resultLines.push(cleanOcrText);
                    resultLines.push('');
                  }
                  imageInserted++;
                }
              }
            }
            
            // 如果还有未插入的OCR结果，追加到末尾
            while (imageInserted < imageCount) {
              const ocrText = imageOcrResults[imageInserted];
              let cleanOcrText = ocrText.replace(/^图片 \d+ \([^)]+\):\s*\n/, '').trim();
              // 清理连续换行符（最多2个）
              cleanOcrText = cleanOcrText.replace(/\n{3,}/g, '\n\n');
              if (cleanOcrText) {
                resultLines.push('');
                resultLines.push('[图片OCR识别结果]');
                resultLines.push(cleanOcrText);
              }
              imageInserted++;
            }
            
            text = resultLines.join('\n');
          }
        } catch (ocrError) {
          // 如果是取消错误，直接抛出
          if (ocrError instanceof Error && ocrError.message === '操作已取消') {
            throw ocrError;
          }
          logger.warn('DOCX图片OCR失败，继续使用文本内容:', ocrError);
          // OCR失败不影响整体解析，继续返回文本内容
        }
      } else {
        logger.info('已关闭解析文档内嵌图片设置，跳过DOCX图片OCR');
      }
      
      return text;
    } catch (error) {
      logger.error('Error parsing DOCX:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to parse DOCX file';
      throw new Error(`DOCX转换失败: ${errorMessage}`);
    }
  }

  /**
   * 从DOCX中提取图片并进行OCR（并行处理）
   * @param docxBuffer DOCX文件Buffer
   * @param progressCallback 进度回调函数（可选）
   * @param abortSignal 取消信号（可选）
   * @param requestId 请求ID，用于管理OCR任务池（可选）
   */
  private async extractImagesFromDocxAndOCR(docxBuffer: Buffer, progressCallback?: ProgressCallback, abortSignal?: AbortSignal, requestId?: string): Promise<string[]> {
    try {
      // 检查是否已取消
      if (abortSignal?.aborted) {
        throw new Error('操作已取消');
      }
      
      const zip = await JSZip.loadAsync(docxBuffer);
      const imageFiles = Object.keys(zip.files).filter(name => 
        name.startsWith('word/media/') && /\.(jpg|jpeg|png|gif|bmp)$/i.test(name)
      );
      
      logger.info(`DOCX中找到 ${imageFiles.length} 张图片，开始并行OCR识别`);
      
      if (imageFiles.length === 0) {
        return [];
      }
      
      progressCallback?.({
        message: 'agent.reference.progress.ocrRecognizing',
        subMessage: 'agent.reference.progress.foundImages',
        percentage: 10,
        params: { 
          count: imageFiles.length,
          imageTotal: imageFiles.length,
          imageCurrent: 0
        }
      });
      
      // 并行提取所有图片Buffer
      const imageBuffers = await Promise.all(
        imageFiles.map(async (imageFile, index) => {
          // 检查是否已取消
          if (abortSignal?.aborted) {
            throw new Error('操作已取消');
          }
          
          try {
            const buffer = await zip.files[imageFile].async('nodebuffer');
            if (!buffer || buffer.length === 0) {
              logger.warn(`图片 ${index + 1} (${path.basename(imageFile)}) Buffer为空`);
              return null;
            }
            return { index: index + 1, filename: path.basename(imageFile), buffer };
          } catch (error) {
            logger.warn(`提取图片 ${index + 1} (${path.basename(imageFile)}) Buffer失败:`, error);
            return null;
          }
        })
      );
      
      // 检查是否已取消
      if (abortSignal?.aborted) {
        throw new Error('操作已取消');
      }
      
      // 过滤掉无效的图片
      const validImages = imageBuffers.filter((img): img is { index: number; filename: string; buffer: Buffer } => img !== null);
      
      if (validImages.length === 0) {
        logger.warn('DOCX中没有有效的图片');
        return [];
      }
      
      logger.info(`开始并行OCR识别 ${validImages.length} 张图片`);
      
      progressCallback?.({
        message: 'agent.reference.progress.ocrRecognizing',
        subMessage: 'agent.reference.progress.foundImages',
        percentage: 30,
        params: { 
          count: validImages.length,
          imageTotal: validImages.length,
          imageCurrent: 0
        }
      });
      
      // 并行进行OCR识别，带进度更新
      const progressPerImage = validImages.length > 0 ? 60 / validImages.length : 0;
      let completedCount = 0;
      
      // 创建包装的进度回调，在发送进度前检查是否已取消
      const safeProgressCallback = (progress: Parameters<ProgressCallback>[0]) => {
        if (abortSignal?.aborted) {
          return; // 如果已取消，不发送进度更新
        }
        progressCallback?.(progress);
      };
      
      // 创建OCR任务Promise数组
      const ocrPromises = validImages.map(async ({ index, filename, buffer }) => {
        // 检查是否已取消
        if (abortSignal?.aborted) {
          throw new Error('操作已取消');
        }
        
        try {
          const { promise, worker } = await ocrService.recognizeFromBufferWithWorker(buffer, ['eng', 'chi_sim'], abortSignal);
          
          // 将Promise和worker添加到池中
          if (requestId) {
            this.addOcrTaskToPool(requestId, promise, worker);
          }
          
          const ocrText = await promise;
          
          // 检查是否已取消（在OCR完成后）
          if (abortSignal?.aborted) {
            throw new Error('操作已取消');
          }
          
          completedCount++;
          safeProgressCallback({
            message: 'agent.reference.progress.ocrRecognizing',
            subMessage: 'agent.reference.progress.processingImage',
            percentage: 30 + Math.round(completedCount * progressPerImage),
            // 同时提供 current/total 与 imageCurrent/imageTotal 以兼容前端展示
            params: { 
              current: completedCount, 
              total: validImages.length, 
              imageCurrent: completedCount,
              imageTotal: validImages.length,
              page: 1 
            }
          });
          
          if (ocrText.trim()) {
            return `图片 ${index} (${filename}):\n${ocrText}`;
          }
          return null;
        } catch (error) {
          // 如果是因为取消而失败，直接抛出
          if (abortSignal?.aborted || (error instanceof Error && error.message === '操作已取消')) {
            throw error;
          }
          completedCount++;
          safeProgressCallback({
            message: 'agent.reference.progress.ocrRecognizing',
            subMessage: 'agent.reference.progress.processingImageFailed',
            percentage: 30 + Math.round(completedCount * progressPerImage),
            params: { 
              current: completedCount, 
              total: validImages.length, 
              imageCurrent: completedCount,
              imageTotal: validImages.length,
              page: 1 
            }
          });
          logger.warn(`图片 ${index} (${filename}) OCR失败:`, error instanceof Error ? error.message : String(error));
          return null;
        }
      });
      
      const ocrResults = await Promise.allSettled(ocrPromises);
      
      // 检查是否已取消
      if (abortSignal?.aborted) {
        throw new Error('操作已取消');
      }
      
      // 检查是否有因取消而失败的任务
      const hasCancelled = ocrResults.some(result => 
        result.status === 'rejected' && 
        result.reason instanceof Error && 
        result.reason.message === '操作已取消'
      );
      if (hasCancelled) {
        throw new Error('操作已取消');
      }
      
      // 收集成功的OCR结果
      const imageTexts = ocrResults
        .map((result, idx) => {
          if (result.status === 'fulfilled' && result.value !== null) {
            return result.value;
          }
          return null;
        })
        .filter((text): text is string => text !== null);
      
      logger.info(`DOCX OCR完成，成功识别 ${imageTexts.length}/${validImages.length} 张图片`);
      
      return imageTexts;
    } catch (error) {
      // 如果是取消错误，直接抛出
      if (error instanceof Error && error.message === '操作已取消') {
        throw error;
      }
      logger.warn('提取DOCX图片失败:', error);
      return [];
    }
  }

  /**
   * 将PPTX文件转换为文本（包含图片OCR）
   * @param filePath 文件路径
   * @param progressCallback 进度回调函数（可选）
   * @param abortSignal 取消信号（可选）
   * @param requestId 请求ID，用于管理OCR任务池（可选）
   */
  private async convertPptxToText(filePath: FilePath, progressCallback?: ProgressCallback, abortSignal?: AbortSignal, requestId?: string): Promise<string> {
    try {
      // 检查是否已取消
      if (abortSignal?.aborted) {
        throw new Error('操作已取消');
      }
      
      progressCallback?.({
        message: 'agent.reference.progress.parsingFile',
        subMessage: 'agent.reference.progress.extractingText',
        percentage: 10,
        params: { filename: path.basename(filePath) }
      });
      
      const buffer = await fs.promises.readFile(filePath);
      
      // 检查是否已取消
      if (abortSignal?.aborted) {
        throw new Error('操作已取消');
      }
      
      const zip = await JSZip.loadAsync(buffer);
      const textParts: string[] = [];
      const parseImages = this.isEmbeddedImageParsingEnabled();
      
      // PPTX文件结构：ppt/slides/slide*.xml 包含幻灯片内容
      const slideFiles = Object.keys(zip.files).filter(name => 
        name.startsWith('ppt/slides/slide') && name.endsWith('.xml')
      );
      
      const totalSlides = slideFiles.length;
      logger.info(`PPTX中找到 ${totalSlides} 张幻灯片`);
      
      progressCallback?.({
        message: 'agent.reference.progress.parsingFile',
        subMessage: 'agent.reference.progress.foundSlides',
        percentage: 20,
        params: { count: totalSlides }
      });
      
      for (let i = 0; i < slideFiles.length; i++) {
        // 检查是否已取消
        if (abortSignal?.aborted) {
          throw new Error('操作已取消');
        }
        
        const slideFile = slideFiles[i];
        const slideIndex = i + 1;
        
        progressCallback?.({
          message: 'agent.reference.progress.processingSlide',
          subMessage: 'agent.reference.progress.extractingText',
          percentage: 20 + Math.round((i / totalSlides) * 30),
          params: { current: slideIndex, total: totalSlides }
        });
        
        const slideContent = await zip.files[slideFile].async('string');
        
        // 提取该幻灯片的图片并进行OCR（在提取文本之前，以便知道图片位置）
        let slideImageTexts: string[] = [];
        if (parseImages) {
          try {
            slideImageTexts = await this.extractImagesFromPptxSlideAndOCR(zip, slideIndex, totalSlides, progressCallback, abortSignal, requestId);
          } catch (ocrError) {
            // 如果是取消错误，直接抛出
            if (ocrError instanceof Error && ocrError.message === '操作已取消') {
              throw ocrError;
            }
            logger.warn(`幻灯片 ${slideIndex} 图片OCR失败:`, ocrError);
          }
        } else {
          logger.info('已关闭解析文档内嵌图片设置，跳过PPTX图片OCR');
        }
        
        // 提取文本内容（简单的XML文本提取）
        const textMatch = slideContent.match(/<a:t[^>]*>([^<]*)<\/a:t>/g);
        let slideText = '';
        if (textMatch) {
          slideText = textMatch
            .map(match => match.replace(/<[^>]*>/g, ''))
            .join(' ');
        }
        
        // 构建幻灯片文本，在文本后插入该幻灯片的OCR结果
        if (slideText.trim() || slideImageTexts.length > 0) {
          let slideContentText = `幻灯片 ${slideIndex}:`;
          if (slideText.trim()) {
            slideContentText += '\n' + slideText;
          }
          
          // 在该幻灯片文本后插入OCR结果
          if (slideImageTexts.length > 0) {
            const cleanOcrTexts = slideImageTexts.map(ocr => {
              // 提取OCR文本（去掉图片标识）
              let text = ocr.replace(/^图片 \d+ \([^)]+\):\s*\n/, '').trim();
              // 清理连续换行符（最多2个）
              text = text.replace(/\n{3,}/g, '\n\n');
              return text;
            }).filter(text => text.length > 0);
            
            if (cleanOcrTexts.length > 0) {
              slideContentText += '\n\n[图片OCR识别结果]\n' + cleanOcrTexts.join('\n\n');
            }
          }
          
          textParts.push(slideContentText);
        }
      }
      
      return textParts.join('\n\n') || 'PPTX文件无文本内容';
    } catch (error) {
      logger.error('Error parsing PPTX:', error);
      throw new Error('Failed to parse PPTX file');
    }
  }

  /**
   * 从PPTX幻灯片中提取图片并进行OCR（并行处理）
   * @param zip JSZip实例
   * @param slideIndex 幻灯片索引
   * @param totalSlides 幻灯片总数
   * @param progressCallback 进度回调函数（可选）
   * @param abortSignal 取消信号（可选）
   * @param requestId 请求ID，用于管理OCR任务池（可选）
   */
  private async extractImagesFromPptxSlideAndOCR(zip: JSZip, slideIndex: number, totalSlides: number, progressCallback?: ProgressCallback, abortSignal?: AbortSignal, requestId?: string): Promise<string[]> {
    try {
      // 检查是否已取消
      if (abortSignal?.aborted) {
        throw new Error('操作已取消');
      }
      
      // 读取当前幻灯片的XML内容，找到该幻灯片使用的图片
      const slideFile = `ppt/slides/slide${slideIndex}.xml`;
      const slideXml = await zip.files[slideFile]?.async('string');
      
      if (!slideXml) {
        logger.warn(`无法找到幻灯片 ${slideIndex} 的XML文件`);
        return [];
      }
      
      // 从幻灯片XML中提取图片关系ID
      const imageRelIds: string[] = [];
      // 查找图片引用：<a:blip r:embed="rIdX"/>
      const blipPattern = /<a:blip[^>]*r:embed="([^"]+)"/g;
      let match;
      while ((match = blipPattern.exec(slideXml)) !== null) {
        imageRelIds.push(match[1]);
      }
      
      // 读取幻灯片关系文件，找到图片文件路径
      const relFile = `ppt/slides/_rels/slide${slideIndex}.xml.rels`;
      const relXml = await zip.files[relFile]?.async('string');
      
      const slideImageFiles: string[] = [];
      if (relXml) {
        // 从关系文件中找到图片文件路径
        for (const relId of imageRelIds) {
          const relPattern = new RegExp(`<Relationship[^>]*Id="${relId}"[^>]*Target="([^"]+)"`, 'i');
          const relMatch = relXml.match(relPattern);
          if (relMatch) {
            let imagePath = relMatch[1];
            // 处理相对路径
            if (imagePath.startsWith('../')) {
              imagePath = 'ppt/' + imagePath.substring(3);
            } else if (!imagePath.startsWith('ppt/')) {
              imagePath = 'ppt/media/' + imagePath;
            }
            slideImageFiles.push(imagePath);
          }
        }
      }
      
      // 如果无法通过关系文件找到图片，回退到查找所有图片（简化处理）
      const imageFiles = slideImageFiles.length > 0 
        ? slideImageFiles.filter(name => zip.files[name] && /\.(jpg|jpeg|png|gif|bmp)$/i.test(name))
        : Object.keys(zip.files).filter(name => 
            name.startsWith('ppt/media/') && /\.(jpg|jpeg|png|gif|bmp)$/i.test(name)
          );
      
      // 检查是否已取消
      if (abortSignal?.aborted) {
        throw new Error('操作已取消');
      }
      
      logger.info(`PPTX幻灯片 ${slideIndex} 中找到 ${imageFiles.length} 张图片，开始并行OCR识别`);
      
      if (imageFiles.length === 0) {
        return [];
      }
      
      progressCallback?.({
        message: 'agent.reference.progress.processingSlide',
        subMessage: 'agent.reference.progress.foundImages',
        percentage: 10,
        params: { 
          current: slideIndex, 
          total: totalSlides, 
          count: imageFiles.length,
          totalPages: totalSlides,
          imageTotal: imageFiles.length,
          imageCurrent: 0
        }
      });
      
      // 检查是否已取消
      if (abortSignal?.aborted) {
        throw new Error('操作已取消');
      }
      
      // 并行提取所有图片Buffer，但使用Promise.allSettled以便在取消时能快速响应
      // 在开始提取之前检查取消状态
      if (abortSignal?.aborted) {
        throw new Error('操作已取消');
      }
      
      const imageBuffers = await Promise.allSettled(
        imageFiles.map(async (imageFile, index) => {
          // 检查是否已取消
          if (abortSignal?.aborted) {
            throw new Error('操作已取消');
          }
          
          try {
            const buffer = await zip.files[imageFile].async('nodebuffer');
            
            // 检查是否已取消
            if (abortSignal?.aborted) {
              throw new Error('操作已取消');
            }
            
            if (!buffer || buffer.length === 0) {
              logger.warn(`PPTX图片 ${index + 1} (${path.basename(imageFile)}) Buffer为空`);
              return null;
            }
            return { index: index + 1, filename: path.basename(imageFile), buffer };
          } catch (error) {
            // 如果是取消错误，直接抛出
            if (abortSignal?.aborted || (error instanceof Error && error.message === '操作已取消')) {
              throw error;
            }
            logger.warn(`提取PPTX图片 ${index + 1} (${path.basename(imageFile)}) Buffer失败:`, error);
            return null;
          }
        })
      );
      
      // 检查是否已取消（在提取完成后立即检查）
      if (abortSignal?.aborted) {
        throw new Error('操作已取消');
      }
      
      // 检查是否有因取消而失败的任务（在过滤之前）
      const hasCancelledInExtraction = imageBuffers.some(result => 
        result.status === 'rejected' && 
        result.reason instanceof Error && 
        result.reason.message === '操作已取消'
      );
      if (hasCancelledInExtraction) {
        throw new Error('操作已取消');
      }
      
      // 过滤掉无效的图片
      const validImages = imageBuffers
        .map(result => result.status === 'fulfilled' ? result.value : null)
        .filter((img): img is { index: number; filename: string; buffer: Buffer } => img !== null);
      
      if (validImages.length === 0) {
        logger.warn(`PPTX幻灯片 ${slideIndex} 中没有有效的图片`);
        return [];
      }
      
      // 检查是否已取消（在开始OCR之前）
      if (abortSignal?.aborted) {
        throw new Error('操作已取消');
      }
      
      logger.info(`PPTX幻灯片 ${slideIndex} 开始并行OCR识别 ${validImages.length} 张图片`);
      
      progressCallback?.({
        message: 'agent.reference.progress.processingSlide',
        subMessage: 'agent.reference.progress.foundImages',
        percentage: 30,
        params: { 
          current: slideIndex, 
          total: totalSlides, 
          count: validImages.length,
          totalPages: totalSlides,
          imageTotal: validImages.length,
          imageCurrent: 0
        }
      });
      
      // 再次检查是否已取消（在开始OCR之前）
      if (abortSignal?.aborted) {
        throw new Error('操作已取消');
      }
      
      // 并行进行OCR识别，带进度更新
      // 计算每张图片的进度增量
      const progressPerImage = validImages.length > 0 ? 60 / validImages.length : 0;
      let completedCount = 0;
      
      // 创建包装的进度回调，在发送进度前检查是否已取消
      const safeProgressCallback = (progress: Parameters<ProgressCallback>[0]) => {
        if (abortSignal?.aborted) {
          return; // 如果已取消，不发送进度更新
        }
        progressCallback?.(progress);
      };
      
      // 创建OCR任务Promise数组
      const ocrPromises = validImages.map(async ({ index, filename, buffer }) => {
        // 检查是否已取消（在每个OCR任务开始前）
        if (abortSignal?.aborted) {
          throw new Error('操作已取消');
        }
        
        try {
          const { promise, worker } = await ocrService.recognizeFromBufferWithWorker(buffer, ['eng', 'chi_sim'], abortSignal);
          
          // 将Promise和worker添加到池中
          if (requestId) {
            this.addOcrTaskToPool(requestId, promise, worker);
          }
          
          const ocrText = await promise;
          
          // 检查是否已取消（在OCR完成后）
          if (abortSignal?.aborted) {
            throw new Error('操作已取消');
          }
          
          // 每完成一张图片，更新进度（使用安全的进度回调）
          completedCount++;
          safeProgressCallback({
            message: 'agent.reference.progress.processingSlide',
            subMessage: 'agent.reference.progress.processingImage',
            percentage: 30 + Math.round(completedCount * progressPerImage),
            params: { 
              current: slideIndex, 
              total: totalSlides, 
              imageCurrent: completedCount, 
              imageTotal: validImages.length, 
              page: slideIndex,
              totalPages: totalSlides
            }
          });
          
          if (ocrText.trim()) {
            return `图片 ${index} (${filename}):\n${ocrText}`;
          }
          return null;
        } catch (error) {
          // 如果是因为取消而失败，直接抛出
          if (abortSignal?.aborted || (error instanceof Error && error.message === '操作已取消')) {
            throw error;
          }
          completedCount++;
          // 即使失败也要更新进度（使用安全的进度回调）
          safeProgressCallback({
            message: 'agent.reference.progress.processingSlide',
            subMessage: 'agent.reference.progress.processingImageFailed',
            percentage: 30 + Math.round(completedCount * progressPerImage),
            params: { 
              current: slideIndex, 
              total: totalSlides, 
              imageCurrent: completedCount, 
              imageTotal: validImages.length,
              totalPages: totalSlides
            }
          });
          logger.warn(`PPTX图片 ${index} (${filename}) OCR失败:`, error instanceof Error ? error.message : String(error));
          return null;
        }
      });
      
      const ocrResults = await Promise.allSettled(ocrPromises);
      
      // 检查是否已取消
      if (abortSignal?.aborted) {
        throw new Error('操作已取消');
      }
      
      // 检查是否有因取消而失败的任务
      const hasCancelled = ocrResults.some(result => 
        result.status === 'rejected' && 
        result.reason instanceof Error && 
        result.reason.message === '操作已取消'
      );
      if (hasCancelled) {
        throw new Error('操作已取消');
      }
      
      // 收集成功的OCR结果
      const imageTexts = ocrResults
        .map((result) => {
          if (result.status === 'fulfilled' && result.value !== null) {
            return result.value;
          }
          return null;
        })
        .filter((text): text is string => text !== null);
      
      logger.info(`PPTX幻灯片 ${slideIndex} OCR完成，成功识别 ${imageTexts.length}/${validImages.length} 张图片`);
      
      return imageTexts;
    } catch (error) {
      // 如果是取消错误，直接抛出
      if (error instanceof Error && error.message === '操作已取消') {
        throw error;
      }
      logger.warn('提取PPTX图片失败:', error);
      return [];
    }
  }

  /**
   * 将Excel文件转换为文本
   */
  private async convertExcelToText(filePath: FilePath): Promise<string> {
    try {
      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        logger.error(`Excel文件不存在: ${filePath}`);
        throw new Error(`文件不存在: ${filePath}。文件可能已被删除或移动到其他位置，请重新上传文件。`);
      }
      
      const buffer = await fs.promises.readFile(filePath);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const textParts: string[] = [];
      
      // 遍历所有工作表
      workbook.SheetNames.forEach((sheetName, index) => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
        if (jsonData.length > 0) {
          textParts.push(`工作表 ${index + 1}: ${sheetName}`);
          // 将数据转换为表格格式的文本
          jsonData.forEach((row: unknown, rowIndex: number) => {
            const rowText = Array.isArray(row) 
              ? row.map(cell => String(cell || '')).join('\t')
              : String(row);
            if (rowText.trim()) {
              textParts.push(`行 ${rowIndex + 1}: ${rowText}`);
            }
          });
          textParts.push(''); // 空行分隔
        }
      });
      
      return textParts.join('\n') || 'Excel文件无数据';
    } catch (error) {
      logger.error('Error parsing Excel:', error);
      // 如果错误信息已经包含文件不存在的提示，直接抛出
      if (error instanceof Error && error.message.includes('文件不存在')) {
        throw error;
      }
      // 其他错误统一处理
      throw new Error(`解析Excel文件失败: ${error instanceof Error ? error.message : String(error)}`);
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
