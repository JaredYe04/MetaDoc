/**
 * OCR服务 - 使用Tesseract.js进行图片文字识别
 * 支持多语言OCR
 */

import { createWorker, Worker, PSM, OEM } from 'tesseract.js';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { createMainLogger } from '../logger';
import pathService from './path-service';
import { getLocale } from '../i18n';

const logger = createMainLogger('OCRService');

/**
 * 智能清理OCR文本，使其更加自然连贯
 * @param text 原始OCR文本
 * @returns 清理后的文本
 */
function cleanOcrText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // 1. 将多个连续空格和制表符替换为单个空格
  text = text.replace(/[ \t]+/g, ' ');
  
  // 2. 处理换行符：保留段落间的换行，但去除多余的空行
  // 将3个或更多连续换行替换为2个换行（段落分隔）
  // 确保最多只有2个连续的换行符
  text = text.replace(/\n{3,}/g, '\n\n');
  
  // 3. 按行处理，逐行清理
  const lines = text.split('\n');
  const cleanedLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // 去除行首行尾的空白字符
    line = line.trim();
    
    if (line === '') {
      // 空行处理：保留段落分隔，但去除连续空行
      if (cleanedLines.length === 0 || cleanedLines[cleanedLines.length - 1] !== '') {
        cleanedLines.push('');
      }
      continue;
    }
    
    // 4. 激进策略：彻底去除同一行内中文字符之间的所有空格
    // 使用最简单但最有效的方法：将文本按字符处理，去除中文字符之间的空格
    // 中文字符范围（更全面）：
    // \u4e00-\u9fa5（基本汉字）
    // \u3400-\u4dbf（扩展A）
    // \u3000-\u303f（CJK符号和标点）
    // \uff00-\uffef（全角字符）
    // \u2e80-\u2eff（CJK部首补充）
    // \u2f00-\u2fdf（康熙部首）
    // \u31c0-\u31ef（CJK笔画）
    const chineseCharPattern = /[\u4e00-\u9fa5\u3400-\u4dbf\u3000-\u303f\uff00-\uffef\u2e80-\u2eff\u2f00-\u2fdf\u31c0-\u31ef]/;
    
    // 方法：逐字符处理，构建新字符串
    // 如果当前字符是中文，且前一个字符也是中文，则跳过中间的空格
    let cleanedLine = '';
    let lastCharWasChinese = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const isChinese = chineseCharPattern.test(char);
      const isWhitespace = /[\s\t]/.test(char);
      
      if (isChinese) {
        // 如果是中文字符
        if (lastCharWasChinese && cleanedLine.length > 0) {
          // 如果前一个字符也是中文，直接添加（中间的空格已经被跳过）
          cleanedLine += char;
        } else {
          // 如果前一个字符不是中文，检查是否需要添加空格
          // 如果前一个字符是英文/数字，保留一个空格
          if (cleanedLine.length > 0 && /[a-zA-Z0-9]/.test(cleanedLine[cleanedLine.length - 1])) {
            cleanedLine += ' ' + char;
          } else {
            cleanedLine += char;
          }
        }
        lastCharWasChinese = true;
      } else if (isWhitespace) {
        // 如果是空格
        if (!lastCharWasChinese) {
          // 如果前一个字符不是中文，保留空格（用于英文单词之间）
          cleanedLine += char;
        }
        // 如果前一个字符是中文，跳过空格（不添加到cleanedLine）
        // lastCharWasChinese 保持不变
      } else {
        // 其他字符（英文、数字、标点等）
        if (lastCharWasChinese && cleanedLine.length > 0) {
          // 如果前一个字符是中文，添加一个空格
          cleanedLine += ' ' + char;
        } else {
          cleanedLine += char;
        }
        lastCharWasChinese = false;
      }
    }
    
    line = cleanedLine;
    
    // 5. 处理中英文混合：中文和英文之间保留一个空格
    // 先处理中文和英文/数字之间，确保只有一个空格
    line = line.replace(/([\u4e00-\u9fa5\u3400-\u4dbf\u3000-\u303f\uff00-\uffef\u2e80-\u2eff\u2f00-\u2fdf\u31c0-\u31ef])\s+([a-zA-Z0-9])/g, '$1 $2');
    line = line.replace(/([a-zA-Z0-9])\s+([\u4e00-\u9fa5\u3400-\u4dbf\u3000-\u303f\uff00-\uffef\u2e80-\u2eff\u2f00-\u2fdf\u31c0-\u31ef])/g, '$1 $2');
    
    // 6. 处理中文标点符号前后的空格（完全去除）
    // 中文标点前不应该有空格
    line = line.replace(/\s+([\u3000-\u303f\uff00-\uffef])/g, '$1');
    // 中文标点后不应该有空格（除非后面是英文或数字）
    line = line.replace(/([\u3000-\u303f\uff00-\uffef])\s+(?![a-zA-Z0-9])/g, '$1');
    
    // 7. 处理英文标点后的空格（保留一个，去除多余）
    line = line.replace(/([.,!?;:])\s{2,}/g, '$1 ');
    
    // 8. 去除行内多余的空格（保留英文单词之间的单个空格）
    // 将多个连续空格替换为单个空格（但保留英文单词之间的空格）
    line = line.replace(/[ ]{2,}/g, ' ');
    
    // 9. 去除行尾空格
    line = line.replace(/ +$/, '');
    
    cleanedLines.push(line);
  }
  
  // 10. 合并处理后的行
  text = cleanedLines.join('\n');
  
  // 11. 最终清理：去除开头和结尾的空白字符
  text = text.trim();
  
  return text;
}

/**
 * i18n语言代码到Tesseract语言代码的映射
 */
const I18N_TO_TESSERACT_LANG_MAP: Record<string, string> = {
  'en_US': 'eng',
  'zh_CN': 'chi_sim',
  'zh_TW': 'chi_tra', // 繁体中文（如果将来支持）
  'ja_JP': 'jpn',
  'ko_KR': 'kor',
  'fr_FR': 'fra',
  'de_DE': 'deu',
  'es_ES': 'spa', // 西班牙语（如果将来支持）
  'ru_RU': 'rus', // 俄语（如果将来支持）
};

/**
 * OCR服务类
 */
class OCRServiceImpl {
  private workers: Map<string, Worker> = new Map();
  private initialized: boolean = false;
  private supportedLanguages: string[] = ['eng', 'chi_sim', 'chi_tra', 'jpn', 'kor', 'fra', 'deu', 'spa', 'rus'];

  /**
   * 根据i18n语言代码获取对应的Tesseract语言代码
   * @param i18nLocale i18n语言代码（如 'zh_CN', 'en_US'）
   * @returns Tesseract语言代码（如 'chi_sim', 'eng'），如果未找到则返回 'eng'
   */
  private getTesseractLangFromI18n(i18nLocale: string): string {
    return I18N_TO_TESSERACT_LANG_MAP[i18nLocale] || 'eng';
  }

  /**
   * 获取默认OCR语言列表（英语 + 当前用户语言）
   * @returns 默认语言列表，至少包含 'eng'
   */
  private getDefaultLanguages(): string[] {
    try {
      const currentLocale = getLocale();
      const userLang = this.getTesseractLangFromI18n(currentLocale);
      
      // 如果用户语言是英语，只返回英语
      if (userLang === 'eng') {
        return ['eng'];
      }
      
      // 否则返回英语 + 用户语言
      return ['eng', userLang];
    } catch (error) {
      logger.warn('获取i18n语言失败，使用默认英语:', error);
      return ['eng'];
    }
  }

  /**
   * 初始化OCR Worker（懒加载）
   */
  private async getWorker(languages?: string[]): Promise<Worker> {
    // 如果没有指定语言，使用默认语言（英语 + 当前用户语言）
    const langList = languages || this.getDefaultLanguages();
    const langKey = langList.sort().join('+');
    
    if (this.workers.has(langKey)) {
      return this.workers.get(langKey)!;
    }

    logger.debug(`初始化OCR Worker，语言: ${langKey}`);
    
    // 获取本地Tesseract训练数据路径
    const tesseractDataPath = pathService.getTesseractDataPath();
    
    // 检查训练数据文件夹是否存在
    const langPathExists = fs.existsSync(tesseractDataPath);
    
    // 配置createWorker选项，优先使用本地训练数据
    // Tesseract.js v6的createWorker支持options参数，可以指定langPath
    const workerOptions: any = {};
    if (langPathExists) {
      workerOptions.langPath = tesseractDataPath;
      logger.debug(`使用本地Tesseract训练数据: ${tesseractDataPath}`);
    } else {
      logger.warn(`本地Tesseract训练数据路径不存在: ${tesseractDataPath}，将使用CDN下载`);
    }
    
    // createWorker的第一个参数是语言，第二个参数是选项对象
    const worker = await createWorker(langKey, workerOptions);
    
    // 优化OCR配置以提高精度
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO, // 自动页面分割模式
      tessedit_ocr_engine_mode: OEM.LSTM_ONLY, // 使用LSTM引擎（更准确）
      tessedit_char_whitelist: '', // 不限制字符集
      preserve_interword_spaces: '1', // 保留单词间空格
      classify_bln_numeric_mode: '0', // 不强制数字模式
      textord_min_linesize: '2.5', // 最小行大小
      classify_enable_learning: '0', // 禁用学习模式（提高速度）
      load_system_dawg: '1', // 加载系统字典
      load_freq_dawg: '1', // 加载频率字典
      load_unambig_dawg: '1', // 加载无歧义字典
      load_punc_dawg: '1', // 加载标点字典
      load_number_dawg: '1', // 加载数字字典
    });
    
    this.workers.set(langKey, worker);
    this.initialized = true;
    
    return worker;
  }

  /**
   * 预处理图片以提高OCR精度
   * @param imageBuffer 原始图片Buffer
   * @returns 处理后的图片Buffer
   */
  private async preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
    try {
      // 获取图片元数据
      const metadata = await sharp(imageBuffer).metadata();
      
      // 如果图片太小，先放大以提高识别精度
      const minSize = 300; // 最小尺寸
      let pipeline = sharp(imageBuffer);
      
      if (metadata.width && metadata.height) {
        const needsResize = metadata.width < minSize || metadata.height < minSize;
        if (needsResize) {
          const scale = Math.max(minSize / metadata.width, minSize / metadata.height);
          pipeline = pipeline.resize(
            Math.round(metadata.width * scale),
            Math.round(metadata.height * scale),
            { kernel: sharp.kernel.lanczos3 } // 使用高质量缩放算法
          );
        }
      }
      
      // 图片预处理流程
      const processedBuffer = await pipeline
        .greyscale() // 转为灰度图（OCR通常只需要灰度信息）
        .normalize() // 归一化（增强对比度，使图片更清晰）
        .sharpen(1, 1, 2) // 锐化（提高边缘清晰度）
        .png({ quality: 100, compressionLevel: 9 }) // 转换为高质量PNG格式（确保格式正确）
        .toBuffer();
      
      return processedBuffer;
    } catch (error) {
      logger.warn('图片预处理失败，尝试简单转换:', error);
      // 如果预处理失败，尝试至少转换为PNG格式
      try {
        return await sharp(imageBuffer)
          .png()
          .toBuffer();
      } catch (convertError) {
        logger.warn('图片格式转换失败，使用原始Buffer:', convertError);
        return imageBuffer; // 如果都失败，返回原始Buffer
      }
    }
  }

  /**
   * 验证图片Buffer是否有效
   * @param imageBuffer 图片Buffer
   * @returns 是否为有效的图片
   */
  private async validateImageBuffer(imageBuffer: Buffer): Promise<boolean> {
    try {
      // 使用sharp验证图片格式
      const metadata = await sharp(imageBuffer).metadata();
      return metadata.width !== undefined && metadata.height !== undefined && metadata.width > 0 && metadata.height > 0;
    } catch (error) {
      logger.warn('图片验证失败:', error);
      return false;
    }
  }

  /**
   * 从图片文件路径进行OCR识别
   * @param imagePath 图片文件路径
   * @param languages 语言列表，如果不指定则使用默认语言（英语 + 当前用户语言）
   * @returns OCR识别结果文本
   */
  async recognizeFromFile(imagePath: string, languages?: string[]): Promise<string> {
    try {
      if (!fs.existsSync(imagePath)) {
        throw new Error(`图片文件不存在: ${imagePath}`);
      }

      const langList = languages || this.getDefaultLanguages();
      const worker = await this.getWorker(langList);
      logger.debug(`开始OCR识别: ${imagePath}`);
      
      const { data: { text } } = await worker.recognize(imagePath);
      
      // 智能清理OCR文本
      const cleanedText = cleanOcrText(text);
      
      logger.debug(`OCR识别完成，原始文本长度: ${text.length}，清理后长度: ${cleanedText.length}`);
      return cleanedText;
    } catch (error) {
      logger.error('OCR识别失败:', error);
      throw new Error(`OCR识别失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 从Buffer进行OCR识别
   * @param imageBuffer 图片Buffer
   * @param languages 语言列表，如果不指定则使用默认语言（英语 + 当前用户语言）
   * @param abortSignal 可选的AbortSignal，用于取消操作
   * @returns OCR识别结果文本
   */
  async recognizeFromBuffer(imageBuffer: Buffer, languages?: string[], abortSignal?: AbortSignal): Promise<string> {
    const result = await this.recognizeFromBufferWithWorker(imageBuffer, languages, abortSignal);
    return result.promise;
  }

  /**
   * 从Buffer进行OCR识别，返回Promise和Worker引用（用于统一管理和取消）
   * @param imageBuffer 图片Buffer
   * @param languages 语言列表，如果不指定则使用默认语言（英语 + 当前用户语言）
   * @param abortSignal 取消信号（可选）
   * @returns 包含Promise和Worker的对象
   */
  async recognizeFromBufferWithWorker(
    imageBuffer: Buffer, 
    languages?: string[], 
    abortSignal?: AbortSignal
  ): Promise<{ promise: Promise<string>; worker: Worker }> {
    try {
      // 检查是否已取消
      if (abortSignal?.aborted) {
        throw new Error('操作已取消');
      }
      
      // 验证图片Buffer是否有效
      const isValid = await this.validateImageBuffer(imageBuffer);
      if (!isValid) {
        throw new Error('无效的图片Buffer，无法进行OCR识别');
      }

      // 检查是否已取消
      if (abortSignal?.aborted) {
        throw new Error('操作已取消');
      }

      // 预处理图片以提高OCR精度
      const processedBuffer = await this.preprocessImage(imageBuffer);
      
      // 检查是否已取消
      if (abortSignal?.aborted) {
        throw new Error('操作已取消');
      }
      
      // 为每个OCR任务创建独立的worker，以便在取消时能够安全终止
      // 注意：我们不使用缓存的worker，因为终止worker会影响其他任务
      const langList = languages || this.getDefaultLanguages();
      const langKey = langList.sort().join('+');
      logger.debug(`创建独立OCR Worker，语言: ${langKey}`);
      
      // 获取tesseract数据路径
      const tesseractDataPath = pathService.getTesseractDataPath();
      
      // 配置createWorker选项
      const workerOptions: any = {};
      if (tesseractDataPath && fs.existsSync(tesseractDataPath)) {
        workerOptions.langPath = tesseractDataPath;
      }
      
      // 创建独立的worker
      const worker = await createWorker(langKey, workerOptions);
      
      // 配置worker参数
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        tessedit_ocr_engine_mode: OEM.LSTM_ONLY,
      });
      
      logger.debug(`开始OCR识别（Buffer），大小: ${imageBuffer.length} bytes`);
      
      // 检查是否已取消
      if (abortSignal?.aborted) {
        await worker.terminate();
        throw new Error('操作已取消');
      }
      
      // 使用预处理后的图片进行识别
      const recognizePromise = worker.recognize(processedBuffer);
      
      // 创建一个包装的Promise，在取消时强制终止worker
      let isTerminated = false;
      const wrappedPromise = new Promise<string>((resolve, reject) => {
        // 监听取消信号
        const abortHandler = () => {
          if (!isTerminated) {
            isTerminated = true;
            logger.info('检测到取消信号，强制终止OCR worker');
            // 终止worker（异步，不等待）
            worker.terminate().catch((error) => {
              logger.warn('终止OCR worker失败:', error);
            });
            reject(new Error('操作已取消'));
          }
        };
        
        if (abortSignal) {
          abortSignal.addEventListener('abort', abortHandler);
        }
        
        recognizePromise
          .then(async (result) => {
            // 移除监听器
            if (abortSignal) {
              abortSignal.removeEventListener('abort', abortHandler);
            }
            
            // 检查是否已取消（在Promise resolve之前）
            if (abortSignal?.aborted || isTerminated) {
              await worker.terminate();
              reject(new Error('操作已取消'));
              return;
            }
            
            const { data: { text } } = result;
            
            // 智能清理OCR文本
            const cleanedText = cleanOcrText(text);
            
            logger.debug(`OCR识别完成，原始文本长度: ${text.length}，清理后长度: ${cleanedText.length}`);
            
            // 任务完成后终止worker（因为这是独立worker）
            await worker.terminate();
            
            resolve(cleanedText);
          })
          .catch(async (error) => {
            // 移除监听器
            if (abortSignal) {
              abortSignal.removeEventListener('abort', abortHandler);
            }
            
            // 终止worker
            try {
              await worker.terminate();
            } catch (terminateError) {
              logger.warn('终止OCR worker失败:', terminateError);
            }
            
            // 如果是因为取消而失败，不记录错误
            if (abortSignal?.aborted || isTerminated || (error instanceof Error && error.message === '操作已取消')) {
              reject(new Error('操作已取消'));
              return;
            }
            
            logger.error('OCR识别失败:', error);
            reject(new Error(`OCR识别失败: ${error instanceof Error ? error.message : String(error)}`));
          });
      });
      
      return { promise: wrappedPromise, worker };
    } catch (error) {
      logger.error('OCR识别失败:', error);
      throw new Error(`OCR识别失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 从Base64字符串进行OCR识别
   * @param base64String Base64编码的图片字符串（包含data:image/...前缀）
   * @param languages 语言列表，如果不指定则使用默认语言（英语 + 当前用户语言）
   * @returns OCR识别结果文本
   */
  async recognizeFromBase64(base64String: string, languages?: string[]): Promise<string> {
    try {
      // 移除data URL前缀（如果有）
      const base64Data = base64String.includes(',') 
        ? base64String.split(',')[1] 
        : base64String;
      
      const imageBuffer = Buffer.from(base64Data, 'base64');
      return await this.recognizeFromBuffer(imageBuffer, languages);
    } catch (error) {
      logger.error('OCR识别失败（Base64）:', error);
      throw new Error(`OCR识别失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取支持的语言列表
   */
  getSupportedLanguages(): string[] {
    return [...this.supportedLanguages];
  }

  /**
   * 终止所有Worker并清理资源
   */
  async terminate(): Promise<void> {
    logger.debug('终止所有OCR Workers');
    const terminatePromises = Array.from(this.workers.values()).map(worker => worker.terminate());
    await Promise.all(terminatePromises);
    this.workers.clear();
    this.initialized = false;
  }
}

// 创建单例实例
const ocrService = new OCRServiceImpl();

// 导出单例实例
export default ocrService;
export { OCRServiceImpl };

