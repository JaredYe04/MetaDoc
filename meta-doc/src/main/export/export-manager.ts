import { BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
// @ts-ignore - html-to-docx 没有类型定义
import HTMLtoDOCX from 'html-to-docx';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import type { DocumentFormat, ExportFormat } from '../../types';
import type { LaTeXCompileResult } from '../../types/utils';
import { getExportTargets } from '../../common/export-rules';
import { t } from '../i18n';
import { compileLatexToPDF } from '../utils';
import { createMainLogger } from '../logger';
import { imageUploadDir } from '../express-server';
import { MainProgressHandle } from '../utils/progress-handle';
import {
  saveImagesToFolder,
  updateMarkdownImageLinks,
  updateHtmlImageLinks,
  updateLatexImageLinks,
} from '../utils/image-export-service';
import {
  DocxProcessingManager,
  OMMLInsertionProcessor,
  DocumentXmlFixProcessor,
  WordTocProcessor,
  HeaderFooterProcessor,
} from './docx-processor';

const logger = createMainLogger('PDFExport');
let currentRequestId: string | undefined;

/**
 * 清理中间图片文件
 * @param imageUrls - 图片 URL 数组
 */
const cleanupIntermediateImages = async (imageUrls: string[]): Promise<void> => {
  try {
    logger.info(`开始清理 ${imageUrls.length} 个中间图片文件`);
    let deletedCount = 0;
    let errorCount = 0;

    for (const url of imageUrls) {
      try {
        // 从 URL 中提取文件名
        // URL 格式: http://localhost:52521/images/filename
        if (url.startsWith('http://localhost:52521/images/')) {
          const fileName = url.replace('http://localhost:52521/images/', '');
          const filePath = path.join(imageUploadDir, fileName);

          // 检查文件是否存在
          if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
            deletedCount++;
            logger.debug(`已删除中间文件: ${fileName}`);
          } else {
            logger.warn(`文件不存在，跳过: ${fileName}`);
          }
        }
      } catch (error) {
        errorCount++;
        logger.warn(`删除文件失败: ${url}`, error);
      }
    }

    logger.info(`清理完成: 成功删除 ${deletedCount} 个文件，失败 ${errorCount} 个`);
  } catch (error) {
    logger.error('清理中间图片文件时出错:', error);
    // 不抛出错误，清理失败不应该影响导出结果
  }
};

export interface RendererExportPayload {
  sourceFormat: DocumentFormat;
  targetFormat: ExportFormat;
  suggestedName: string;
  sourcePath?: string;
  requestId?: string;
  data: {
    md: string;
    json: string;
    tex: string;
  };
  html?: string;
  imageUrls?: string[]; // 预渲染生成的图片 URL，用于清理
  exportOptions?: any; // 导出选项（从适配器传递）
}

export interface ExportResponse {
  success: boolean;
  path?: string;
  error?: string;
}

interface ExportContext {
  payload: RendererExportPayload;
  targetPath: string;
  mainWindow: BrowserWindow | null;
}

type ExportHandler = (ctx: ExportContext) => Promise<void>;

const exportAbortControllers = new Map<string, AbortController>();
const exportProgressHandles = new Map<string, MainProgressHandle>();

export function abortExportTask(requestId: string): boolean {
  let aborted = false;
  const controller = exportAbortControllers.get(requestId);
  if (controller && !controller.signal.aborted) {
    controller.abort();
    aborted = true;
  }
  const handle = exportProgressHandles.get(requestId);
  if (handle) {
    handle.cancel();
    aborted = true;
  }
  exportAbortControllers.delete(requestId);
  exportProgressHandles.delete(requestId);
  return aborted;
}

const ensureParentDirectory = async (filePath: string): Promise<void> => {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
};

const writeTextFile = async (filePath: string, content: string): Promise<void> => {
  await ensureParentDirectory(filePath);
  await fs.promises.writeFile(filePath, content, 'utf-8');
};

const writeBinaryFile = async (filePath: string, buffer: Buffer): Promise<void> => {
  await ensureParentDirectory(filePath);
  await fs.promises.writeFile(filePath, buffer);
};

const convertHtmlToPdfBuffer = async (html: string, options?: {
  margins?: { top: number; bottom: number; left: number; right: number };
  pageSize?: 'A4' | 'A3' | 'Letter' | 'Legal' | 'A5' | 'B5';
  printBackground?: boolean;
}): Promise<Buffer> => {
  logger.info(`开始转换 HTML 到 PDF，HTML 长度: ${html.length}`);
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: false,
    },
  });

  try {
    logger.info('加载 HTML 到 BrowserWindow');
    
    // 设置超时机制
    const loadTimeout = 30000; // 30秒超时
    const loadPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('页面加载超时'));
      }, loadTimeout);
      
      win.webContents.once('did-finish-load', () => {
        clearTimeout(timeout);
        logger.info('页面加载完成');
        resolve();
      });
      
      win.webContents.once('did-fail-load', (event, errorCode, errorDescription) => {
        clearTimeout(timeout);
        logger.error(`页面加载失败: ${errorCode} - ${errorDescription}`);
        reject(new Error(`页面加载失败: ${errorCode} - ${errorDescription}`));
      });
    });
    
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await loadPromise;
    
    // 等待一小段时间确保资源完全加载
    logger.info('等待资源加载...');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // 检查图片是否加载完成
    const imagesLoaded = await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const images = document.querySelectorAll('img');
        if (images.length === 0) {
          resolve(true);
          return;
        }
        let loadedCount = 0;
        const totalImages = images.length;
        
        const checkComplete = () => {
          loadedCount++;
          if (loadedCount >= totalImages) {
            resolve(true);
          }
        };
        
        images.forEach((img) => {
          if (img.complete && img.naturalWidth > 0) {
            checkComplete();
          } else {
            img.onload = checkComplete;
            img.onerror = checkComplete;
          }
        });
        
        // 超时保护
        setTimeout(() => {
          resolve(true);
        }, 5000);
      })
    `);
    
    logger.info(`图片加载完成: ${imagesLoaded}`);
    
    // 在生成 PDF 之前，确保代码块完全展开，移除滚动限制
    await win.webContents.executeJavaScript(`
      (function() {
        // 移除所有代码块的滚动限制
        const codeBlocks = document.querySelectorAll('.md-editor-code pre code, pre code, .hljs');
        codeBlocks.forEach(block => {
          block.style.overflow = 'visible';
          block.style.overflowX = 'visible';
          block.style.overflowY = 'visible';
          block.style.maxHeight = 'none';
          block.style.height = 'auto';
          
          // 处理父级 pre 元素
          const parentPre = block.closest('pre');
          if (parentPre) {
            parentPre.style.overflow = 'visible';
            parentPre.style.maxHeight = 'none';
            parentPre.style.height = 'auto';
          }
          
          // 处理父级 .md-editor-code 容器
          const parentCode = block.closest('.md-editor-code');
          if (parentCode) {
            parentCode.style.overflow = 'visible';
            parentCode.style.maxHeight = 'none';
          }
        });
        
        // 额外等待一小段时间，确保样式已应用
        return new Promise(resolve => setTimeout(resolve, 100));
      })();
    `);
    
    logger.info('代码块滚动限制已移除');
    
    // 在生成 PDF 之前，确保内容宽度适合页面，并智能缩放超长图片
    await win.webContents.executeJavaScript(`
      (function() {
        // A4 纸张尺寸和页边距计算
        // A4: 210mm × 297mm = 8.27" × 11.69" = 595.44pt × 841.68pt
        // 页边距：上下左右各 0.5 英寸 = 36pt
        const pageWidthPt = 595.44;  // A4 宽度（points）
        const pageHeightPt = 841.68; // A4 高度（points）
        const marginTopPt = 36;       // 上边距（points）
        const marginBottomPt = 36;     // 下边距（points）
        const marginLeftPt = 36;       // 左边距（points）
        const marginRightPt = 36;      // 右边距（points）
        
        // 可用内容区域
        const availableWidthPt = pageWidthPt - marginLeftPt - marginRightPt;
        const availableHeightPt = pageHeightPt - marginTopPt - marginBottomPt;
        
        // 将 points 转换为 pixels（假设 96 DPI，1 inch = 72pt = 96px）
        const ptToPx = 96 / 72;
        const availableWidthPx = availableWidthPt * ptToPx;
        const availableHeightPx = availableHeightPt * ptToPx;
        
        // 设置 body 和预览容器的最大宽度，确保内容不会超出页面
        const body = document.body;
        const preview = document.getElementById('preview');
        
        if (body) {
          body.style.maxWidth = '100%';
          body.style.boxSizing = 'border-box';
          body.style.padding = '0';
          body.style.margin = '0';
        }
        
        if (preview) {
          preview.style.maxWidth = '100%';
          preview.style.boxSizing = 'border-box';
        }
        
        // 确保所有内容容器都有正确的盒模型
        const allContainers = document.querySelectorAll('*');
        allContainers.forEach(el => {
          const style = window.getComputedStyle(el);
          if (style.width && style.width !== 'auto' && !style.width.includes('%')) {
            const widthValue = parseFloat(style.width);
            if (widthValue > 700) {
              el.style.maxWidth = '100%';
              el.style.boxSizing = 'border-box';
            }
          }
        });
        
        // 处理表格溢出问题
        const tables = document.querySelectorAll('table');
        tables.forEach(table => {
          const rect = table.getBoundingClientRect();
          if (rect.width > availableWidthPx) {
            // 表格超出宽度，进行缩放
            const scale = availableWidthPx / rect.width;
            table.style.width = availableWidthPx + 'px';
            table.style.maxWidth = availableWidthPx + 'px';
            table.style.boxSizing = 'border-box';
            table.style.tableLayout = 'auto';
            table.style.wordWrap = 'break-word';
            
            // 同时调整表格内容的字体大小，避免列太窄导致文字重叠
            const fontSize = window.getComputedStyle(table).fontSize;
            if (fontSize) {
              const currentSize = parseFloat(fontSize);
              // 如果缩放比例小于0.9，适当缩小字体（但不小于0.8倍）
              if (scale < 0.9) {
                table.style.fontSize = (currentSize * Math.max(scale, 0.8)) + 'px';
              }
            }
            
            // 确保表格单元格内容可以换行，避免溢出
            const cells = table.querySelectorAll('th, td');
            cells.forEach(cell => {
              cell.style.wordWrap = 'break-word';
              cell.style.overflowWrap = 'break-word';
              cell.style.whiteSpace = 'normal';
              cell.style.maxWidth = 'none'; // 让表格自动分配列宽
              cell.style.boxSizing = 'border-box';
            });
          } else {
            // 即使不超出，也确保表格不会超出
            table.style.maxWidth = '100%';
            table.style.boxSizing = 'border-box';
            table.style.tableLayout = 'auto';
            
            // 确保单元格内容可以换行
            const cells = table.querySelectorAll('th, td');
            cells.forEach(cell => {
              cell.style.wordWrap = 'break-word';
              cell.style.overflowWrap = 'break-word';
              cell.style.whiteSpace = 'normal';
            });
          }
        });
        
        // 智能缩放和放置图片（特别是 SVG 图表）
        // 等待所有图片加载完成
        const images = document.querySelectorAll('img');
        let imagesProcessed = 0;
        const totalImages = images.length;
        
        if (totalImages === 0) {
          return { adjusted: 0, total: 0 };
        }
        
        return new Promise((resolve) => {
          const processImage = (img) => {
            return new Promise((imgResolve) => {
              if (img.complete && img.naturalHeight > 0) {
                checkAndScaleImage(img);
                imgResolve();
              } else {
                img.onload = () => {
                  checkAndScaleImage(img);
                  imgResolve();
                };
                img.onerror = () => imgResolve(); // 加载失败也继续
                // 超时保护
                setTimeout(() => imgResolve(), 3000);
              }
            });
          };
          
          const checkAndScaleImage = (img) => {
            try {
              // 获取图片的原始尺寸和当前显示尺寸
              const naturalWidth = img.naturalWidth || 0;
              const naturalHeight = img.naturalHeight || 0;
              const rect = img.getBoundingClientRect();
              let displayWidth = rect.width || naturalWidth;
              let displayHeight = rect.height || naturalHeight;
              
              // 如果图片没有尺寸信息，跳过
              if (displayWidth <= 0 || displayHeight <= 0) {
                return false;
              }
              
              // 计算图片在页面中的位置，估算上一页的剩余空间
              // 在PDF导出时，浏览器会根据内容自动分页
              // 我们通过检测图片相对于文档的位置来估算分页情况
              const bodyRect = document.body.getBoundingClientRect();
              const imgTop = rect.top - bodyRect.top;
              
              // 估算当前位置在PDF页面中的偏移（假设从页面顶部开始）
              // 考虑页边距，实际内容区域从marginTopPt开始
              const estimatedPageOffset = (imgTop % availableHeightPx);
              const remainingSpace = availableHeightPx - estimatedPageOffset;
              
              // 最小缩放比例阈值（避免过度缩放导致模糊，70%是最低可接受值）
              const minScale = 0.7;
              
              // 如果剩余空间小于页面高度的20%，认为已经在页面底部，不需要智能放置
              const isNearPageBottom = remainingSpace < availableHeightPx * 0.2;
              
              // 计算必需的缩放比例
              let requiredScale = 1;
              let needsScaling = false;
              
              // 如果图片高度超过可用高度，必须缩放
              if (displayHeight > availableHeightPx) {
                requiredScale = availableHeightPx / displayHeight;
                needsScaling = true;
              }
              
              // 如果缩放后的宽度超过可用宽度，需要进一步缩放
              const scaledWidth = displayWidth * requiredScale;
              if (scaledWidth > availableWidthPx) {
                requiredScale = availableWidthPx / displayWidth;
                needsScaling = true;
              }
              
              // 规格化处理：对于中等大小的图表进行标准化缩放
              // 这样可以避免上一页留白过多，下一页图表被挤到下一页的情况
              // 规格化只在图片不需要强制缩放时进行（即图片本身能放在一页内）
              if (!needsScaling) {
                // 计算图片高度占页面可用高度的百分比
                const heightPercentage = (displayHeight / availableHeightPx) * 100;
                
                // 如果高度在30-50%（不含）之间，统一缩放为30%
                // 这样可以统一中等大小图表的尺寸，提升排版美观度
                if (heightPercentage >= 30 && heightPercentage < 50) {
                  const targetHeight = availableHeightPx * 0.3;
                  const heightScale = targetHeight / displayHeight;
                  const widthScale = availableWidthPx / displayWidth;
                  // 取高度缩放和宽度缩放的较小值，确保同时满足高度和宽度限制
                  requiredScale = Math.min(heightScale, widthScale);
                  needsScaling = true;
                }
                // 如果高度在50-70%（不含）之间，统一缩放为50%
                // 这样可以统一较大图表的尺寸，保持排版一致性
                else if (heightPercentage >= 50 && heightPercentage < 70) {
                  const targetHeight = availableHeightPx * 0.5;
                  const heightScale = targetHeight / displayHeight;
                  const widthScale = availableWidthPx / displayWidth;
                  // 取高度缩放和宽度缩放的较小值，确保同时满足高度和宽度限制
                  requiredScale = Math.min(heightScale, widthScale);
                  needsScaling = true;
                }
              }
              
              // 智能放置：如果上一页剩余空间较大，且图片只需要小幅缩放就能放下
              // 就尝试放在上一页，而不是换到下一页
              if (!needsScaling && !isNearPageBottom && displayHeight > remainingSpace) {
                // 计算需要缩放多少才能放在剩余空间中
                const fitScale = remainingSpace / displayHeight;
                
                // 检查缩放后的宽度是否也合适
                const fitScaledWidth = displayWidth * fitScale;
                let finalFitScale = fitScale;
                if (fitScaledWidth > availableWidthPx) {
                  finalFitScale = availableWidthPx / displayWidth;
                }
                
                // 计算缩放后的实际高度
                const fitScaledHeight = displayHeight * finalFitScale;
                
                // 判断条件：
                // 1. 剩余空间足够大（超过30%页面高度），值得尝试
                // 2. 缩放比例在可接受范围内（70%-100%），不会太模糊
                // 3. 缩放后确实能放在剩余空间中
                if (remainingSpace > availableHeightPx * 0.3 && 
                    finalFitScale >= minScale && 
                    finalFitScale < 1 && 
                    fitScaledHeight <= remainingSpace) {
                  requiredScale = finalFitScale;
                  needsScaling = true;
                }
              }
              
              if (needsScaling) {
                // 确保缩放比例不低于最小阈值
                const finalScale = Math.max(requiredScale, minScale);
                const newWidth = displayWidth * finalScale;
                const newHeight = displayHeight * finalScale;
                
                // 再次检查缩放后的尺寸是否超出限制
                const finalWidth = Math.min(newWidth, availableWidthPx);
                const finalHeight = Math.min(newHeight, availableHeightPx);
                
                // 使用max-width和max-height而不是固定的width和height，以保持图片原始质量
                // 这样浏览器/PDF渲染器会使用原始图片质量，只是限制显示尺寸
                img.style.maxWidth = finalWidth + 'px';
                img.style.maxHeight = finalHeight + 'px';
                img.style.width = 'auto';
                img.style.height = 'auto';
                img.style.objectFit = 'contain';
                img.style.display = 'block';
                img.style.margin = '0 auto';
                return true;
              } else {
                // 即使不需要缩放，也确保宽度不超过可用宽度
                if (displayWidth > availableWidthPx) {
                  img.style.maxWidth = availableWidthPx + 'px';
                  img.style.maxHeight = 'none';
                  img.style.width = 'auto';
                  img.style.height = 'auto';
                  img.style.objectFit = 'contain';
                  img.style.display = 'block';
                  img.style.margin = '0 auto';
                }
                return false;
              }
            } catch (error) {
              console.warn('处理图片时出错:', error);
              return false;
            }
          };
          
          // 并行处理所有图片
          Promise.all(Array.from(images).map(processImage)).then(() => {
            // 等待一小段时间确保样式已应用
            setTimeout(() => {
              const adjustedCount = Array.from(images).filter(img => {
                const hasMaxHeight = img.style.maxHeight && parseFloat(img.style.maxHeight) > 0;
                const hasHeight = img.style.height && parseFloat(img.style.height) > 0;
                return hasMaxHeight || hasHeight;
              }).length;
              resolve({ adjusted: adjustedCount, total: totalImages });
            }, 200);
          });
        });
      })();
    `);
    
    logger.info(`图片智能缩放处理完成`);
    
    logger.info('开始生成 PDF');
    // 使用导出选项或默认值
    const margins = options?.margins || { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 };
    let pageSize = options?.pageSize || 'A4';
    // Electron 的 printToPDF 不支持 B5，将其映射为 A4
    if (pageSize === 'B5') {
      logger.warn('B5 纸张大小不受支持，使用 A4 代替');
      pageSize = 'A4';
    }
    const printBackground = options?.printBackground !== undefined ? options.printBackground : true;
    
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground,
      margins: {
        marginType: 'custom',
        top: margins.top,
        bottom: margins.bottom,
        left: margins.left,
        right: margins.right,
      },
      pageSize: pageSize as any, // 类型转换，因为我们已经处理了 B5
    });
    logger.info(`PDF 生成完成，大小: ${pdfBuffer.length} bytes`);
    return pdfBuffer;
  } catch (error) {
    logger.error('转换过程中出错:', error);
    throw error;
  } finally {
    if (!win.isDestroyed()) {
      win.close();
    }
  }
};

/**
 * 将HTML中的标题和正文映射到Word样式库
 * Word会识别特定的类名和样式，映射到样式库中的样式
 * 使用Word标准样式名称：Heading1, Heading2, Heading3, Heading4, Normal
 */
const mapHtmlToWordStyles = (html: string): string => {
  // 使用正则表达式替换标题标签，添加Word样式类名和样式
  // Word在转换HTML时会识别这些类名并映射到样式库
  let styledHtml = html;
  
  // 映射h1到标题1样式（Heading 1）
  // 使用Word标准样式名称，并添加相应的格式
  styledHtml = styledHtml.replace(
    /<h1([^>]*)>/gi,
    (match, attrs) => {
      // 如果已经有class属性，追加；否则添加
      if (attrs.includes('class=')) {
        return match.replace(/class="([^"]*)"/, 'class="$1 Heading1"');
      }
      return `<h1${attrs} class="Heading1">`;
    }
  );
  
  // 映射h2到标题2样式（Heading 2）
  styledHtml = styledHtml.replace(
    /<h2([^>]*)>/gi,
    (match, attrs) => {
      if (attrs.includes('class=')) {
        return match.replace(/class="([^"]*)"/, 'class="$1 Heading2"');
      }
      return `<h2${attrs} class="Heading2">`;
    }
  );
  
  // 映射h3到标题3样式（Heading 3）
  styledHtml = styledHtml.replace(
    /<h3([^>]*)>/gi,
    (match, attrs) => {
      if (attrs.includes('class=')) {
        return match.replace(/class="([^"]*)"/, 'class="$1 Heading3"');
      }
      return `<h3${attrs} class="Heading3">`;
    }
  );
  
  // 映射h4到标题4样式（Heading 4）
  styledHtml = styledHtml.replace(
    /<h4([^>]*)>/gi,
    (match, attrs) => {
      if (attrs.includes('class=')) {
        return match.replace(/class="([^"]*)"/, 'class="$1 Heading4"');
      }
      return `<h4${attrs} class="Heading4">`;
    }
  );
  
  // 映射p到正文样式（Normal）
  // 只处理没有class的p标签，避免覆盖已有的样式
  styledHtml = styledHtml.replace(
    /<p(?![^>]*class=)([^>]*)>/gi,
    '<p$1 class="Normal">'
  );
  
  // 为h5和h6也添加样式类（虽然Word样式库通常只有4级标题）
  styledHtml = styledHtml.replace(
    /<h5([^>]*)>/gi,
    (match, attrs) => {
      if (attrs.includes('class=')) {
        return match.replace(/class="([^"]*)"/, 'class="$1 Heading5"');
      }
      return `<h5${attrs} class="Heading5">`;
    }
  );
  
  styledHtml = styledHtml.replace(
    /<h6([^>]*)>/gi,
    (match, attrs) => {
      if (attrs.includes('class=')) {
        return match.replace(/class="([^"]*)"/, 'class="$1 Heading6"');
      }
      return `<h6${attrs} class="Heading6">`;
    }
  );
  
  return styledHtml;
};

/**
 * 移除Markdown格式符号，提取纯文本
 * 用于目录标题的清理，去除加粗、斜体等Markdown符号
 */
const stripMarkdownFromTitle = (title: string): string => {
  let text = title;
  
  // 移除链接但保留文本 [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\[[^\]]+\]/g, '$1');
  
  // 移除图片 ![alt](url) -> alt
  text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1');
  
  // 移除代码标记 `code` -> code
  text = text.replace(/`([^`]+)`/g, '$1');
  
  // 移除粗体和斜体标记（注意顺序：先处理双星号，再处理单星号）
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');  // **bold** -> bold
  text = text.replace(/__([^_]+)__/g, '$1');      // __bold__ -> bold
  text = text.replace(/\*([^*]+)\*/g, '$1');      // *italic* -> italic
  text = text.replace(/_([^_]+)_/g, '$1');        // _italic_ -> italic
  
  // 移除删除线 ~~text~~ -> text
  text = text.replace(/~~([^~]+)~~/g, '$1');
  
  return text.trim();
};

// 注意：手动目录生成已移除，现在使用 Word 自动目录（WordTocProcessor）

/**
 * 处理代码块，将换行符转换为<br>标签，并包装在表格中创建背景框
 * html-to-docx可能不支持white-space: pre和某些CSS属性（如背景色、边框），
 * 使用表格来创建边框和背景效果
 */
const processCodeBlocksForWord = (html: string): string => {
  let processed = html;
  
  // 辅助函数：提取纯文本内容并处理换行符
  const extractAndProcessCode = (content: string): string => {
    
    // 先处理HTML实体，避免在移除标签时丢失信息
    let text = content
      .replace(/&lt;/g, '\u0001LT\u0001')  // 临时标记，避免<被当作标签
      .replace(/&gt;/g, '\u0001GT\u0001')  // 临时标记，避免>被当作标签
      .replace(/&amp;/g, '\u0001AMP\u0001')  // 临时标记
      .replace(/&quot;/g, '\u0001QUOT\u0001')
      .replace(/&#39;/g, '\u0001APOS\u0001')
      .replace(/&nbsp;/g, ' ');  // &nbsp;转换为空格
    
    // 将现有的<br>标签转换为换行符
    text = text.replace(/<br\s*\/?>/gi, '\n');
    
    // 移除所有HTML标签，但保留文本内容
    // 使用递归方式移除嵌套标签，确保正确提取文本
    let lastText = '';
    while (text !== lastText) {
      lastText = text;
      text = text.replace(/<[^>]+>/g, '');
    }
    
    // 恢复HTML实体
    text = text
      .replace(/\u0001LT\u0001/g, '<')
      .replace(/\u0001GT\u0001/g, '>')
      .replace(/\u0001AMP\u0001/g, '&')
      .replace(/\u0001QUOT\u0001/g, '"')
      .replace(/\u0001APOS\u0001/g, "'");
    
    // 统一换行符（\r\n -> \n, \r -> \n）
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // 分割为行
    let lines = text.split('\n');
    
    // 移除开头的空行（纯空白行）
    while (lines.length > 0 && lines[0].trim().length === 0) {
      lines.shift();
    }
    
    // 移除结尾的空行（纯空白行）
    while (lines.length > 0 && lines[lines.length - 1].trim().length === 0) {
      lines.pop();
    }
    
    // 如果所有行都被移除了，返回空字符串
    if (lines.length === 0) {
      logger.warn('所有行都被移除了，返回空字符串');
      return '';
    }
    
    // 处理第一行：移除第一行前面的多余空格（只移除前导空格，不影响代码本身的缩进）
    if (lines.length > 0) {
      lines[0] = lines[0].replace(/^\s+/, '');
    }
    
    // 过滤掉所有空行（行与行之间的多余空行）
    const processedLines = lines.filter(line => line.trim().length > 0);
    
    // 将每行代码用<p>标签包裹，每个<p>标签设置margin:0和padding:0，避免多余的空行
    // 这样可以确保在Word中每行代码之间没有额外的间距
    // 注意：需要先转义HTML特殊字符，因为代码可能包含<、>等字符
    const escapeHtml = (text: string): string => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };
    
    const result = processedLines.map(line => 
      `<p style="margin: 0 !important; padding: 0 !important; line-height: 1.2 !important;">${escapeHtml(line)}</p>`
    ).join('');
    
    return result;
  };
  
  // 表格样式模板（使用更明显的背景色）
  // 注意：td的padding设为6pt上下（减少上下padding），左右12pt
  // 每个代码行使用<p>标签，margin和padding都设为0，避免多余的空行
  // 表格的margin-bottom设为0，避免代码框之后有多余的换行
  const codeTableTemplate = (content: string) => 
    `<table style="width: 100%; border: 1px solid #d0d0d0; background-color: #f5f5f5; margin: 0 0 0 0; border-collapse: collapse;" bgcolor="#f5f5f5">
      <tr>
        <td style="padding: 6pt 12pt !important; font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important; font-size: 9pt !important; color: #333333 !important; background-color: #f5f5f5 !important; line-height: 1.2 !important;" bgcolor="#f5f5f5">
          ${content}
        </td>
      </tr>
    </table>`;
  
  // 1. 处理<div class="md-editor-code">包装的代码块（优先处理，因为可能包含pre和code）
  processed = processed.replace(/<div[^>]*class="[^"]*md-editor-code[^"]*"[^>]*>([\s\S]*?)<\/div>/gi, (match, content) => {
    // 如果content已经是表格（被上面的处理替换了），直接返回
    if (content.includes('<table')) {
      return match;
    }
    const codeContent = extractAndProcessCode(content);
    return codeTableTemplate(codeContent);
  });
  
  // 2. 处理<pre>标签（可能包含<code>标签）
  processed = processed.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (match, content) => {
    // 如果content已经是表格（被上面的处理替换了），直接返回
    if (content.includes('<table')) {
      return match;
    }
    const codeContent = extractAndProcessCode(content);
    return codeTableTemplate(codeContent);
  });
  
  // 3. 处理独立的<code class="hljs">代码块
  processed = processed.replace(/<code[^>]*class="[^"]*hljs[^"]*"[^>]*>([\s\S]*?)<\/code>/gi, (match, content) => {
    // 如果content已经是表格（被上面的处理替换了），直接返回
    if (content.includes('<table')) {
      return match;
    }
    const codeContent = extractAndProcessCode(content);
    return codeTableTemplate(codeContent);
  });
  
  return processed;
};

/**
 * 处理表格样式，统一表格边框，确保边框粗细一致
 * @param html HTML 内容
 * @returns 处理后的 HTML
 */
const processTablesForWord = (html: string): string => {
  // 使用正则表达式匹配所有表格
  // 匹配 <table> 标签及其内容（包括嵌套的表格）
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  
  return html.replace(tableRegex, (match, tableContent) => {
    // 提取原始 table 标签的属性
    const tableTagMatch = match.match(/<table[^>]*>/i);
    if (!tableTagMatch) return match;
    
    const originalTableTag = tableTagMatch[0];
    
    // 统一表格边框样式
    // 使用 border-collapse: collapse 确保边框合并，避免双重边框
    // 统一边框宽度为 0.5pt（Word 中常用的细边框）
    const borderStyle = '0.5pt solid #000000';
    
    // 更新 table 标签的样式
    let updatedTableTag = originalTableTag;
    
    // 移除现有的 border 相关样式
    updatedTableTag = updatedTableTag.replace(/\s*border[^;]*;?/gi, '');
    updatedTableTag = updatedTableTag.replace(/\s*border-collapse[^;]*;?/gi, '');
    updatedTableTag = updatedTableTag.replace(/\s*border-spacing[^;]*;?/gi, '');
    
    // 添加统一的边框样式
    if (updatedTableTag.includes('style=')) {
      // 如果已有 style 属性，追加样式
      updatedTableTag = updatedTableTag.replace(
        /style\s*=\s*["']([^"']*)["']/i,
        (_, existingStyle) => {
          const cleanStyle = existingStyle.trim().replace(/;\s*$/, '');
          return `style="${cleanStyle}; border: ${borderStyle}; border-collapse: collapse;"`;
        }
      );
    } else {
      // 如果没有 style 属性，添加新的 style 属性
      updatedTableTag = updatedTableTag.replace(
        /<table([^>]*)>/i,
        `<table$1 style="border: ${borderStyle}; border-collapse: collapse;">`
      );
    }
    
    // 处理表格内容中的 th 和 td 标签
    let processedContent = tableContent;
    
    // 处理 th 标签
    processedContent = processedContent.replace(/<th[^>]*>/gi, (thTag: string) => {
      // 移除现有的 border 相关样式
      let updatedThTag = thTag
        .replace(/\s*border[^;]*;?/gi, '')
        .replace(/\s*border-top[^;]*;?/gi, '')
        .replace(/\s*border-right[^;]*;?/gi, '')
        .replace(/\s*border-bottom[^;]*;?/gi, '')
        .replace(/\s*border-left[^;]*;?/gi, '');
      
      // 添加统一的边框样式（所有边都使用相同的边框）
      if (updatedThTag.includes('style=')) {
        updatedThTag = updatedThTag.replace(
          /style\s*=\s*["']([^"']*)["']/i,
          (_: string, existingStyle: string) => {
            const cleanStyle = existingStyle.trim().replace(/;\s*$/, '');
            return `style="${cleanStyle}; border: ${borderStyle}; padding: 4pt;"`;
          }
        );
      } else {
        updatedThTag = updatedThTag.replace(
          /<th([^>]*)>/i,
          `<th$1 style="border: ${borderStyle}; padding: 4pt;">`
        );
      }
      
      return updatedThTag;
    });
    
    // 处理 td 标签
    processedContent = processedContent.replace(/<td[^>]*>/gi, (tdTag: string) => {
      // 移除现有的 border 相关样式
      let updatedTdTag = tdTag
        .replace(/\s*border[^;]*;?/gi, '')
        .replace(/\s*border-top[^;]*;?/gi, '')
        .replace(/\s*border-right[^;]*;?/gi, '')
        .replace(/\s*border-bottom[^;]*;?/gi, '')
        .replace(/\s*border-left[^;]*;?/gi, '');
      
      // 添加统一的边框样式（所有边都使用相同的边框）
      if (updatedTdTag.includes('style=')) {
        updatedTdTag = updatedTdTag.replace(
          /style\s*=\s*["']([^"']*)["']/i,
          (_: string, existingStyle: string) => {
            const cleanStyle = existingStyle.trim().replace(/;\s*$/, '');
            return `style="${cleanStyle}; border: ${borderStyle}; padding: 4pt;"`;
          }
        );
      } else {
        updatedTdTag = updatedTdTag.replace(
          /<td([^>]*)>/i,
          `<td$1 style="border: ${borderStyle}; padding: 4pt;">`
        );
      }
      
      return updatedTdTag;
    });
    
    // 返回更新后的表格
    return `${updatedTableTag}${processedContent}</table>`;
  });
};

/**
 * 将 HTML 中的公式替换为 MathML
 * @param htmlContent HTML 内容
 * @param markdown 原始 Markdown 内容（用于提取公式）
 * @returns 替换后的 HTML
 */
const convertFormulaToMathML = async (htmlContent: string, markdown: string): Promise<string> => {
  // 匹配公式的正则表达式（与 math-renderer.js 中的一致）
  const mathBlockRegex = /(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$/g;
  const mathInlineRegex = /(?<!\\)\$(?!\$)([^\n$]+?)(?<!\\)\$/g;
  
  // 从 Markdown 中提取所有公式
  const blockMatches: Array<{ content: string; index: number }> = [];
  const inlineMatches: Array<{ content: string; index: number }> = [];
  
  let match;
  while ((match = mathBlockRegex.exec(markdown)) !== null) {
    blockMatches.push({ content: match[1].trim(), index: match.index });
  }
  
  while ((match = mathInlineRegex.exec(markdown)) !== null) {
    inlineMatches.push({ content: match[1].trim(), index: match.index });
  }
  
  // 合并所有公式（块级在前，行内在后，按出现顺序排序）
  const allFormulas = [
    ...blockMatches.map(m => ({ ...m, display: true })),
    ...inlineMatches.map(m => ({ ...m, display: false })),
  ].sort((a, b) => a.index - b.index);
  
  if (allFormulas.length === 0) {
    return htmlContent;
  }
  
  // 在 HTML 中查找公式元素
  // 公式可能是图片（_math.svg 或 _math.png）或 .language-math 类的元素
  const formulaImageRegex = /<img[^>]+src\s*=\s*["']([^"']*_math\.(?:svg|png)[^"']*)["'][^>]*>/gi;
  const formulaLanguageRegex = /<(span|div)[^>]*class\s*=\s*["'][^"']*language-math[^"']*["'][^>]*>([\s\S]*?)<\/(span|div)>/gi;
  
  // 先找出所有公式图片
  const imageMatches: Array<{ tag: string; type: 'image'; index: number }> = [];
  let imgMatch;
  while ((imgMatch = formulaImageRegex.exec(htmlContent)) !== null) {
    imageMatches.push({
      tag: imgMatch[0],
      type: 'image',
      index: imgMatch.index
    });
  }
  
  // 再找出所有 .language-math 类的元素
  const languageMatches: Array<{ tag: string; content: string; display: boolean; type: 'language-math'; index: number }> = [];
  let langMatch;
  while ((langMatch = formulaLanguageRegex.exec(htmlContent)) !== null) {
    const tagName = langMatch[1].toLowerCase();
    const isDisplay = tagName === 'div';
    let content = langMatch[2].trim();
    
    // 解码 HTML 实体（如 =3D 表示 =）
    // 使用简单的替换来处理常见的实体
    content = content
      .replace(/=3D/g, '=')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
    
    languageMatches.push({
      tag: langMatch[0],
      content: content,
      display: isDisplay,
      type: 'language-math',
      index: langMatch.index
    });
  }
  
  // 合并所有匹配，按位置排序
  // 对于 .language-math 元素，尝试通过内容匹配公式，而不是简单的顺序匹配
  const allMatches: Array<{
    tag: string;
    type: 'image' | 'language-math';
    index: number;
    formulaIndex: number;
    content?: string;
    display?: boolean;
  }> = [];
  
  // 添加图片匹配
  for (const imgMatch of imageMatches) {
    allMatches.push({
      ...imgMatch,
      formulaIndex: -1
    });
  }
  
  // 添加 .language-math 匹配，并尝试匹配对应的公式
  for (const langMatch of languageMatches) {
    // 尝试通过内容匹配公式（允许一些差异，比如空格、换行等）
    const normalizedContent = langMatch.content.replace(/\s+/g, ' ').trim();
    let matchedFormulaIndex = -1;
    
    for (let i = 0; i < allFormulas.length; i++) {
      const formula = allFormulas[i];
      const normalizedFormula = formula.content.replace(/\s+/g, ' ').trim();
      // 检查是否匹配（允许部分匹配，因为可能有转义字符的差异）
      if (normalizedContent === normalizedFormula || 
          normalizedContent.includes(normalizedFormula) || 
          normalizedFormula.includes(normalizedContent)) {
        matchedFormulaIndex = i;
        break;
      }
    }
    
    allMatches.push({
      tag: langMatch.tag,
      type: 'language-math',
      index: langMatch.index,
      formulaIndex: matchedFormulaIndex,
      content: langMatch.content,
      display: langMatch.display
    });
  }
  
  // 按位置排序
  allMatches.sort((a, b) => a.index - b.index);
  
  // 对于没有匹配到的图片，使用顺序分配
  let nextFormulaIndex = 0;
  for (const match of allMatches) {
    if (match.formulaIndex < 0) {
      // 找到一个未使用的公式索引
      while (nextFormulaIndex < allFormulas.length && 
             allMatches.some(m => m.formulaIndex === nextFormulaIndex)) {
        nextFormulaIndex++;
      }
      if (nextFormulaIndex < allFormulas.length) {
        match.formulaIndex = nextFormulaIndex;
        nextFormulaIndex++;
      }
    }
  }
  
  logger.info(`找到 ${imageMatches.length} 个公式图片，${languageMatches.length} 个 .language-math 元素，提取了 ${allFormulas.length} 个公式`, {
    imageCount: imageMatches.length,
    languageMathCount: languageMatches.length,
    formulaCount: allFormulas.length,
    formulas: allFormulas.map(f => ({ content: f.content.substring(0, 30), display: f.display }))
  });
  
  // 对于DOCX导出，我们使用占位符策略：在HTML阶段创建占位符（包含LaTeX代码），
  // 后续在document.xml处理阶段转换为OMML
  // 从后往前替换，避免索引偏移
  // 对于DOCX导出，我们使用占位符策略：在HTML阶段创建占位符（包含LaTeX代码），
  // 后续在document.xml处理阶段转换为OMML
  let result = htmlContent;
  for (let i = allMatches.length - 1; i >= 0; i--) {
    const match = allMatches[i];
    
    // 获取LaTeX代码
    let latexCode: string | null = null;
    let isDisplay = false;
    
    if (match.type === 'language-math' && match.content) {
      // 对于 .language-math 元素，直接使用元素内容
      latexCode = match.content;
      isDisplay = match.display || false;
    } else if (match.formulaIndex >= 0 && match.formulaIndex < allFormulas.length) {
      // 对于图片，使用从markdown中提取的公式
      const formula = allFormulas[match.formulaIndex];
      latexCode = formula.content;
      isDisplay = formula.display;
    }
    
    if (latexCode) {
      // 创建占位符（包含LaTeX代码，而不是OMML）
      const placeholder = convertLatexToPlaceholder(latexCode, isDisplay);
      
      if (match.type === 'language-math') {
        //logger.debug(`替换 .language-math 元素为占位符: ${latexCode}`);
        result = result.substring(0, match.index) + placeholder + result.substring(match.index + match.tag.length);
      } else if (match.type === 'image') {
        logger.debug(`替换公式图片为占位符: ${latexCode.substring(0, 30)}...`);
        result = result.substring(0, match.index) + placeholder + result.substring(match.index + match.tag.length);
      }
    } else {
      logger.warn(`无法获取公式代码，保留原元素`, {
        matchIndex: i,
        matchType: match.type,
        formulaIndex: match.formulaIndex
      });
    }
  }
  
  logger.info(`公式替换完成，共处理 ${allMatches.length} 个元素（${imageMatches.length} 个图片，${languageMatches.length} 个 .language-math）`);
  return result;
};

// 公式占位符存储（用于在document.xml处理阶段替换）
const formulaPlaceholders = new Map<number, { latex: string; display: boolean }>();
let formulaPlaceholderIndex = 0;

/**
 * 转义 LaTeX 代码中的特殊字符，避免在后续处理中被破坏
 * 这些字符在 Markdown/HTML 转换过程中可能被转义或误解析
 * 
 * @param latex LaTeX 公式代码
 * @returns 转义后的 LaTeX 代码
 */
/**
 * 转义 LaTeX 代码中的特殊字符，避免在后续处理中被破坏
 * 只转义会影响 XML 解析的字符（< 和 >），不转义其他字符
 * 
 * @param latex LaTeX 公式代码
 * @returns 转义后的 LaTeX 代码
 */
const escapeLatexForMarkdown = (latex: string): string => {
  let escaped = latex;
  
  // 只转义会影响 XML 解析的字符：< 和 >
  // 转义小于号 < 为 \lt（LaTeX 命令）
  // 注意：只转义不在反斜杠后的 <，避免破坏 LaTeX 命令
  // 注意：不要加空格，MathJax 可能无法正确解析带空格的 \lt
  // 改进：更精确的匹配，避免匹配到 LaTeX 命令中的 <（如 \langle）
  escaped = escaped.replace(/(?<!\\)<(?![a-zA-Z\\])/g, '\\lt');
  
  // 转义大于号 > 为 \gt（LaTeX 命令）
  // 注意：不要加空格
  // 改进：更精确的匹配，避免匹配到 LaTeX 命令中的 >（如 \rangle）
  escaped = escaped.replace(/(?<!\\)>(?![a-zA-Z\\])/g, '\\gt');
  
  // 不再转义 & 符号，因为：
  // 1. 在数学公式中，& 通常不需要转义（如 aligned 环境中的对齐符号）
  // 2. 如果确实需要转义，应该在 LaTeX 代码中手动使用 \&
  // 3. 过度转义会导致公式无法被正确解析
  // 注意：& 符号在后续的 XML 处理中会被正确转义为 &amp;，但这里我们保持原始 LaTeX 代码
  
  // 不转义 % 符号，因为：
  // 1. 在 LaTeX 中，% 是注释符号，但在数学公式中可能作为普通字符使用（如 O\%）
  // 2. 如果确实需要转义，应该在 LaTeX 代码中手动使用 \%
  // 3. 保持原始 LaTeX 代码，让 MathJax 处理
  
  return escaped;
};

/**
 * 在 Markdown 中提取公式并替换为 XML 注释占位符
 * 这样可以避免在 HTML 转换过程中 LaTeX 代码被破坏
 * 
 * @param markdown 原始 Markdown 内容
 * @returns 处理后的 Markdown 和公式占位符 Map
 */
const extractFormulasFromMarkdown = (markdown: string): { processedMarkdown: string; placeholders: Map<number, { latex: string; display: boolean }> } => {
  const placeholders = new Map<number, { latex: string; display: boolean }>();
  let index = 0;
  let processedMarkdown = markdown;
  
  // 匹配公式的正则表达式
  // 块级公式：使用非贪婪匹配，但需要确保能匹配多行复杂公式（如 \begin{aligned}...\end{aligned}）
  // 改进：使用更精确的匹配，确保能正确处理包含 $$ 的公式内容
  const mathBlockRegex = /(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$/g;
  // 行内公式：不跨行，避免匹配到块级公式的一部分
  const mathInlineRegex = /(?<!\\)\$(?!\$)([^\n$]+?)(?<!\\)\$/g;
  
  // 收集所有公式（块级和行内）
  const allMatches: Array<{ match: string; content: string; index: number; display: boolean; startPos: number }> = [];
  
  // 检查是否启用详细日志（同步导入）
  let verbose = false;
  try {
    const { shouldLogVerbose } = require('../utils/formula-conversion-config');
    verbose = shouldLogVerbose();
  } catch (error) {
    // 如果导入失败，使用默认值
    verbose = false;
  }
  
  // 提取块级公式
  // 注意：需要重置正则表达式的 lastIndex，避免全局匹配的问题
  mathBlockRegex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = mathBlockRegex.exec(markdown)) !== null) {
    let content = match[1];
    
    // 对于包含 \begin{...} 和 \end{...} 的复杂公式，需要确保内容完整
    // 检查是否包含未闭合的环境（如 \begin{aligned} 但没有对应的 \end{aligned}）
    // 这种情况通常不会发生，因为正则表达式已经匹配了完整的 $$...$$ 块
    // 但为了安全，我们仍然保留原始内容，不做额外的处理
    
    // 只去除首尾空白，保留内部格式（包括换行符）
    content = content.trim();
    
    if (verbose) {
      logger.debug(`[提取公式-块级] 位置: ${match.index}, 长度: ${match[0].length}, 内容预览: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
      logger.debug(`[提取公式-块级] 完整内容: ${JSON.stringify(content)}`);
      // 检查是否包含复杂结构
      if (content.includes('\\begin{') || content.includes('\\end{')) {
        logger.debug(`[提取公式-块级] 检测到复杂公式结构（包含 \\begin 或 \\end）`);
      }
    }
    allMatches.push({
      match: match[0],
      content: content,
      index: match.index,
      display: true,
      startPos: match.index,
    });
  }
  
  // 提取行内公式
  // 注意：需要重置正则表达式的 lastIndex，避免全局匹配的问题
  mathInlineRegex.lastIndex = 0;
  match = null;
  while ((match = mathInlineRegex.exec(markdown)) !== null) {
    // 检查这个行内公式是否在块级公式内部（避免重复匹配）
    // 如果匹配位置在已提取的块级公式范围内，跳过
    const matchIndex = match.index;
    const isInsideBlockFormula = allMatches.some(m => 
      m.display && matchIndex >= m.startPos && matchIndex < m.startPos + m.match.length
    );
    if (isInsideBlockFormula) {
      if (verbose) {
        logger.debug(`[提取公式-行内] 跳过位于块级公式内部的行内公式: ${match.index}`);
      }
      continue;
    }
    
    const content = match[1].trim();
    if (verbose) {
      logger.debug(`[提取公式-行内] 位置: ${match.index}, 长度: ${match[0].length}, 内容预览: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
      logger.debug(`[提取公式-行内] 完整内容: ${JSON.stringify(content)}`);
    }
    allMatches.push({
      match: match[0],
      content: content,
      index: match.index,
      display: false,
      startPos: match.index,
    });
  }
  
  // 按位置从后往前排序，避免替换时索引偏移
  allMatches.sort((a, b) => b.startPos - a.startPos);
  
  // 替换公式为文本占位符
  // 使用特殊格式的文本占位符，避免与普通文本冲突
  // 格式：__MATH_PLACEHOLDER_0__（块级）或 __MATH_PLACEHOLDER_0_INLINE__
  for (const formulaMatch of allMatches) {
    // 转义 LaTeX 代码
    const escapedLatex = escapeLatexForMarkdown(formulaMatch.content);
    
    if (verbose) {
      logger.debug(`[存储占位符] 索引: ${index}, 原始内容长度: ${formulaMatch.content.length}, 转义后长度: ${escapedLatex.length}`);
      logger.debug(`[存储占位符] 原始内容: ${JSON.stringify(formulaMatch.content)}`);
      logger.debug(`[存储占位符] 转义后内容: ${JSON.stringify(escapedLatex)}`);
    }
    
    // 存储到占位符 Map
    const placeholderIndex = index++;
    placeholders.set(placeholderIndex, { 
      latex: escapedLatex, 
      display: formulaMatch.display 
    });
    
    // 创建文本占位符（使用特殊格式，避免与普通文本冲突和被 Markdown 渲染器处理）
    // 使用 [MATH_PLACEHOLDER_0] 格式，方括号在 Markdown 中通常用于链接，但这里我们使用特殊格式避免冲突
    const placeholderText = formulaMatch.display
      ? `[MATH_PLACEHOLDER_${placeholderIndex}]`
      : `[MATH_PLACEHOLDER_${placeholderIndex}_INLINE]`;
    
    // 替换公式
    processedMarkdown = processedMarkdown.substring(0, formulaMatch.startPos) + 
                       placeholderText + 
                       processedMarkdown.substring(formulaMatch.startPos + formulaMatch.match.length);
  }
  
  // 更新全局占位符 Map
  formulaPlaceholders.clear();
  placeholders.forEach((value, key) => {
    formulaPlaceholders.set(key, value);
  });
  formulaPlaceholderIndex = index;
  
  logger.info(`从 Markdown 中提取了 ${placeholders.size} 个公式（${allMatches.filter(m => m.display).length} 个块级，${allMatches.filter(m => !m.display).length} 个行内）`);
  
  return { processedMarkdown, placeholders };
};

/**
 * 在 HTML 中查找并替换公式为文本占位符（用于兼容 HTML 中可能存在的公式）
 * 注意：主要处理应该在 Markdown 阶段完成，这里作为备用
 */
const replaceFormulasInHtml = (htmlContent: string, placeholders: Map<number, { latex: string; display: boolean }>): string => {
  let processedHtml = htmlContent;
  let index = placeholders.size;
  
  // 匹配公式图片和 .language-math 元素
  const formulaImageRegex = /<img[^>]+src\s*=\s*["']([^"']*_math\.(?:svg|png)[^"']*)["'][^>]*>/gi;
  const formulaLanguageRegex = /<(span|div)[^>]*class\s*=\s*["'][^"']*language-math[^"']*["'][^>]*>([\s\S]*?)<\/(span|div)>/gi;
  
  // 收集所有匹配
  const allMatches: Array<{ match: string; index: number; isBlockLevel: boolean }> = [];
  
  let match;
  while ((match = formulaImageRegex.exec(htmlContent)) !== null) {
    const tagName = match[0];
    const isBlockLevel = tagName.includes('display') || tagName.includes('block');
    allMatches.push({ match: tagName, index: match.index, isBlockLevel });
  }
  
  while ((match = formulaLanguageRegex.exec(htmlContent)) !== null) {
    const tagName = match[1].toLowerCase();
    const isBlockLevel = tagName === 'div';
    allMatches.push({ match: match[0], index: match.index, isBlockLevel });
  }
  
  // 按位置从后往前排序
  allMatches.sort((a, b) => b.index - a.index);
  
  // 替换为文本占位符
  for (const formulaMatch of allMatches) {
    const placeholderText = formulaMatch.isBlockLevel
      ? `__MATH_PLACEHOLDER_${index}__`
      : `__MATH_PLACEHOLDER_${index}_INLINE__`;
    
    processedHtml = processedHtml.substring(0, formulaMatch.index) + 
                   placeholderText + 
                   processedHtml.substring(formulaMatch.index + formulaMatch.match.length);
    index++;
  }
  
  return processedHtml;
};

/**
 * 将 LaTeX 公式转换为占位符（用于DOCX导出，保留用于向后兼容）
 * 注意：现在公式提取已提前到 Markdown 阶段，此函数主要用于 HTML 阶段的兼容处理
 * 
 * @param latex LaTeX 公式代码
 * @param displayMode 是否为块级公式
 * @returns 包含占位符的 HTML 字符串
 */
const convertLatexToPlaceholder = (latex: string, displayMode: boolean): string => {
  const index = formulaPlaceholderIndex++;
  formulaPlaceholders.set(index, { latex, display: displayMode });
  
  // 使用文本占位符
  const placeholderText = displayMode
    ? `[MATH_PLACEHOLDER_${index}]`
    : `[MATH_PLACEHOLDER_${index}_INLINE]`;
  
  // 在 HTML 中使用 span 元素包装占位符文本
  const placeholder = `<span>${placeholderText}</span>`;
  
  if (displayMode) {
    return `<p class="Normal" style="text-align: center; margin: 12pt 0;">${placeholder}</p>`;
  } else {
    return placeholder;
  }
};

/**
 * 获取所有公式占位符数据（用于document.xml处理）
 */
export const getFormulaPlaceholders = (): Map<number, { latex: string; display: boolean }> => {
  return new Map(formulaPlaceholders);
};

/**
 * 清除公式占位符数据
 */
export const clearFormulaPlaceholders = (): void => {
  formulaPlaceholders.clear();
  formulaPlaceholderIndex = 0;
};

/**
 * 将 LaTeX 公式转换为包含 MathML 和 OOXML 的 HTML（保留用于PDF导出）
 * 使用 mathjax-node 进行准确的 LaTeX 到 MathML 转换
 * 
 * @param latex LaTeX 公式代码
 * @param displayMode 是否为块级公式
 * @returns 包含 MathML 和 OOXML 的 HTML 字符串
 */
const convertLatexToMathML = async (latex: string, displayMode: boolean): Promise<string> => {
  // 导入转换函数（在主进程中直接调用，不需要 IPC）
  const { convertLatexToMathML: convertLatex } = await import('../utils/mathml-converter');
  
  // 使用 mathjax-node 转换为 MathML
  const mathml = await convertLatex(latex, displayMode);
  
  // 如果转换失败，使用转义的 LaTeX 作为后备
  if (!mathml) {
    logger.warn(`LaTeX 转 MathML 失败，使用后备方案: ${latex}`);
    const escapedLatex = escapeXml(latex);
    const fallbackMathML = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${displayMode ? 'block' : 'inline'}">
  <mtext>${escapedLatex}</mtext>
</math>`;
    
    if (displayMode) {
      return `<p class="Normal" style="text-align: center; margin: 12pt 0;">${fallbackMathML}</p>`;
    } else {
      return `<span>${fallbackMathML}</span>`;
    }
  }
  
  // 清理 MathML：移除 MathJax 特定的属性和 HTML 注释，使其符合 Word 的要求
  const cleanedMathml = cleanMathMLForWord(mathml);
  
  // 将 MathML 转换为 OMML（Office Math Markup Language）
  // OMML 是 Word 的原生数学公式格式，能够正确渲染
  let omml: string;
  try {
    // 动态导入 mathml2omml（ES Module）
    // mathml2omml 使用命名导出 mml2omml
    const { mml2omml } = await import('mathml2omml');
    omml = mml2omml(cleanedMathml);
    
    logger.debug('MathML 转换为 OMML 成功', {
      mathmlLength: cleanedMathml.length,
      ommlLength: omml.length,
      ommlPreview: omml.substring(0, 300),
      hasOMath: omml.includes('<m:oMath'),
      hasOMathPara: omml.includes('<m:oMathPara')
    });
  } catch (error) {
    logger.error('MathML 转换为 OMML 失败，使用原始 MathML:', error);
    // 如果转换失败，回退到标准 MathML
    const mathmlContent = cleanedMathml.replace(/^<math[^>]*>/, '').replace(/<\/math>$/, '').trim();
    const wordFormat = displayMode
      ? `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${mathmlContent}</math>`
      : `<math xmlns="http://www.w3.org/1998/Math/MathML">${mathmlContent}</math>`;
    
    if (displayMode) {
      return `<p class="Normal" style="text-align: center; margin: 12pt 0;">
${wordFormat}
</p>`;
    } else {
      return wordFormat;
    }
  }
  
  // mathml2omml 返回的 OMML 通常已经包含了 <m:oMath> 标签
  // 我们需要检查并适当包装
  let ommlContent = omml.trim();
  
  // 如果返回的 OMML 不包含 <m:oMath> 或 <m:oMathPara>，需要包装
  if (!ommlContent.includes('<m:oMath')) {
    if (displayMode) {
      ommlContent = `<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
<m:oMath>
${ommlContent}
</m:oMath>
</m:oMathPara>`;
    } else {
      ommlContent = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${ommlContent}</m:oMath>`;
    }
  } else if (displayMode && !ommlContent.includes('<m:oMathPara')) {
    // 如果是块级公式但没有 oMathPara，需要包装
    ommlContent = `<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${ommlContent}</m:oMathPara>`;
  }
  
  // 使用占位符标记，后续在 document.xml 中替换为正确的 WordprocessingML 结构
  // 将 OMML 内容进行 Base64 编码，避免特殊字符问题
  const ommlBase64 = Buffer.from(ommlContent, 'utf-8').toString('base64');
  const placeholder = `<span data-omml="${ommlBase64}" data-display="${displayMode}"></span>`;
  
  if (displayMode) {
    return `<p class="Normal" style="text-align: center; margin: 12pt 0;">${placeholder}</p>`;
  } else {
    return placeholder;
  }
};

/**
 * 清理 MathML，移除 MathJax 特定的属性和 HTML 注释，使其符合 Word 的要求
 */
function cleanMathMLForWord(mathml: string): string {
  let cleaned = mathml;
  
  // 1. 移除 HTML 注释（如 <!-- ϕ -->、<!-- − --> 等）
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  
  // 2. 移除 MathJax 特定的类名（如 class="MJX-TeXAtom-OPEN"、class="MJX-TeXAtom-ORD" 等）
  cleaned = cleaned.replace(/\s+class="[^"]*"/g, '');
  
  // 3. 移除 scriptlevel 属性（MathJax 特定）
  cleaned = cleaned.replace(/\s+scriptlevel="[^"]*"/g, '');
  
  // 4. 移除 maxsize 和 minsize 属性（MathJax 特定，Word 不支持）
  cleaned = cleaned.replace(/\s+maxsize="[^"]*"/g, '');
  cleaned = cleaned.replace(/\s+minsize="[^"]*"/g, '');
  
  // 5. 移除其他 MathJax 特定的属性（如 mathvariant、mathcolor 等可能不被 Word 支持）
  // 但保留基本的 MathML 属性（如 xmlns、display 等）
  
  // 6. 清理多余的空白字符（标签之间的）
  cleaned = cleaned.replace(/>\s+</g, '><');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  cleaned = cleaned.trim();
  
  logger.debug('MathML 清理完成', {
    originalLength: mathml.length,
    cleanedLength: cleaned.length,
    preview: cleaned.substring(0, 200)
  });
  
  return cleaned;
}

// 生成封面 HTML
const generateCoverPage = (meta: DocumentMetaInfo, styleMapping?: {
  normal?: { fontFamily: string; fontSize: number; lineHeight: number };
  heading1?: { fontFamily: string; fontSize: number; lineHeight: number };
}): string => {
  // 使用与正文相同的字体，默认使用 Microsoft YaHei
  const fontFamily = styleMapping?.normal?.fontFamily || styleMapping?.heading1?.fontFamily || 'Microsoft YaHei';
  const baseFontSize = styleMapping?.normal?.fontSize || 10.5;
  
  // 根据标题长度动态调整字体大小，确保在一行内显示
  // 使用简单的分段策略，根据字符数选择合适的字体大小
  let titleFontSize = 28; // 默认28pt
  if (meta.title) {
    const titleLength = meta.title.length;
    // 根据字符数分段设置字体大小
    if (titleLength <= 10) {
      titleFontSize = 32; // 短标题使用大字体
    } else if (titleLength <= 20) {
      titleFontSize = 28; // 中等标题
    } else if (titleLength <= 30) {
      titleFontSize = 24; // 较长标题
    } else if (titleLength <= 40) {
      titleFontSize = 20; // 很长标题
    } else {
      titleFontSize = 18; // 非常长的标题，使用最小字体
    }
  }
  
  // 使用简单的段落结构，合理控制间距
  // 标题：普通段落，居中，加粗，动态字号
  const titleHtml = meta.title 
    ? `<p style="text-align: center; font-size: ${titleFontSize}pt; font-weight: bold; margin-top: 200pt; margin-bottom: 40pt; font-family: '${fontFamily}', 'SimSun', serif;">${escapeHtml(meta.title)}</p>` 
    : '';
  
  // 作者：居中
  const authorHtml = meta.author 
    ? `<p style="text-align: center; font-size: ${baseFontSize + 3.5}pt; margin-bottom: 30pt; font-family: '${fontFamily}', 'SimSun', serif;">作者：${escapeHtml(meta.author)}</p>` 
    : '';
  
  // 摘要：加粗"摘要"标识，内容靠左对齐，使用与正文相同的字体
  const descriptionHtml = meta.description 
    ? `<p style="text-align: left; font-size: ${baseFontSize + 1.5}pt; margin-top: 30pt; margin-bottom: 15pt; padding: 0 100pt; font-family: '${fontFamily}', 'SimSun', serif;"><strong>摘要：</strong>${escapeHtml(meta.description)}</p>` 
    : '';
  
  // 关键词：加粗"关键词"标识，关键词用逗号分割，使用与正文相同的字体
  const keywordsHtml = meta.keywords.length > 0 
    ? `<p style="text-align: left; font-size: ${baseFontSize + 1.5}pt; margin-top: 15pt; margin-bottom: 0; padding: 0 100pt; font-family: '${fontFamily}', 'SimSun', serif;"><strong>关键词：</strong>${escapeHtml(meta.keywords.join(', '))}</p>` 
    : '';
  
  // 组合封面内容，使用分页标记
  return `
    ${titleHtml}
    ${authorHtml}
    ${descriptionHtml}
    ${keywordsHtml}
    <div class="page-break" style="page-break-after: always;"></div>
  `;
};


const convertMarkdownToDocxBuffer = async (
  htmlContent: string,
  markdown: string,
  options?: {
    enableStyleMapping?: boolean;
    styleMapping?: {
      normal?: { fontFamily: string; fontSize: number; lineHeight: number };
      heading1?: { fontFamily: string; fontSize: number; lineHeight: number };
      heading2?: { fontFamily: string; fontSize: number; lineHeight: number };
      heading3?: { fontFamily: string; fontSize: number; lineHeight: number };
      heading4?: { fontFamily: string; fontSize: number; lineHeight: number };
    };
    generateCover?: boolean;
    generateToc?: boolean;
    processFormula?: boolean;
  },
  meta?: DocumentMetaInfo
): Promise<Buffer> => {
  // 使用导出选项或默认值
  const enableStyleMapping = options?.enableStyleMapping !== undefined ? options.enableStyleMapping : true;
  const styleMapping = options?.styleMapping || {
    normal: { fontFamily: 'Microsoft YaHei', fontSize: 10.5, lineHeight: 1.15 },
    heading1: { fontFamily: 'Microsoft YaHei', fontSize: 18, lineHeight: 1.2 },
    heading2: { fontFamily: 'Microsoft YaHei', fontSize: 16, lineHeight: 1.2 },
    heading3: { fontFamily: 'Microsoft YaHei', fontSize: 14, lineHeight: 1.2 },
    heading4: { fontFamily: 'Microsoft YaHei', fontSize: 12, lineHeight: 1.2 },
  };
  
  // 只有当 processFormula 不为 false 时，才在 Markdown 阶段提取公式并替换为文本占位符
  // 这样可以避免在 HTML 转换过程中 LaTeX 代码被破坏
  let processedMarkdown = markdown;
  let markdownPlaceholders = new Map<number, { latex: string; display: boolean }>();
  if (options?.processFormula !== false) {
    const result = extractFormulasFromMarkdown(markdown);
    processedMarkdown = result.processedMarkdown;
    markdownPlaceholders = result.placeholders;
  }
  
  // 只有当 processFormula 不为 false 时，才在 HTML 中查找公式元素并替换为占位符
  // 因为 HTML 是在渲染进程中生成的，公式可能已经被转换为图片或 MathML
  // 我们需要在 HTML 中找到这些公式元素，并替换为对应的占位符
  let processedHtml = htmlContent;
  
  if (options?.processFormula !== false) {
    // 只匹配 .language-math 元素（不匹配图片，因为图片不是公式）
    const formulaLanguageRegex = /<(span|div)[^>]*class\s*=\s*["'][^"']*language-math[^"']*["'][^>]*>([\s\S]*?)<\/(span|div)>/gi;
    
    // 也匹配 MathML 元素（如果 HTML 中包含原生 MathML）
    const mathmlRegex = /<math[^>]*>[\s\S]*?<\/math>/gi;
    
    // 收集所有公式元素（只包含 language-math 和 MathML，不包含图片）
    const htmlFormulaMatches: Array<{ match: string; index: number; type: 'language-math'; isBlockLevel: boolean; latexContent?: string }> = [];
    
    let match;
    while ((match = formulaLanguageRegex.exec(htmlContent)) !== null) {
      const tagName = match[1].toLowerCase();
      const isBlockLevel = tagName === 'div';
      const latexContent = match[2].trim(); // 提取 LaTeX 内容
      htmlFormulaMatches.push({ 
        match: match[0], 
        index: match.index, 
        type: 'language-math',
        isBlockLevel,
        latexContent
      });
    }
    
    // 匹配 MathML 元素
    while ((match = mathmlRegex.exec(htmlContent)) !== null) {
      // 判断是否为块级（通过检查 display 属性或周围的标签）
      const beforeMatch = htmlContent.substring(Math.max(0, match.index - 100), match.index);
      const afterMatch = htmlContent.substring(match.index + match[0].length, Math.min(htmlContent.length, match.index + match[0].length + 100));
      const isBlockLevel = match[0].includes('display="block"') || 
                           match[0].includes('display="block"') ||
                           beforeMatch.includes('<p') || beforeMatch.includes('<div') || 
                           afterMatch.includes('</p>') || afterMatch.includes('</div>');
      htmlFormulaMatches.push({ 
        match: match[0], 
        index: match.index, 
        type: 'language-math', // 使用相同的类型
        isBlockLevel
        // MathML 元素没有直接的 LaTeX 内容
      });
    }
    
    // 按位置从后往前排序，避免替换时索引偏移
    htmlFormulaMatches.sort((a, b) => b.index - a.index);
    
    const blockCount = htmlFormulaMatches.filter(m => m.isBlockLevel).length;
    const inlineCount = htmlFormulaMatches.filter(m => !m.isBlockLevel).length;
    const markdownBlockCount = Array.from(markdownPlaceholders.values()).filter(v => v.display).length;
    const markdownInlineCount = Array.from(markdownPlaceholders.values()).filter(v => !v.display).length;
    
    logger.info(`在 HTML 中找到 ${htmlFormulaMatches.length} 个公式元素（块级：${blockCount}，行内：${inlineCount}），Markdown 中有 ${markdownPlaceholders.size} 个公式（块级：${markdownBlockCount}，行内：${markdownInlineCount}）`);
    
    // 将 HTML 中的公式元素替换为占位符
    // 按块级和行内分别匹配
    const blockPlaceholderIndices = Array.from(markdownPlaceholders.entries())
      .filter(([_, data]) => data.display)
      .map(([index]) => index)
      .sort((a, b) => a - b);
    const inlinePlaceholderIndices = Array.from(markdownPlaceholders.entries())
      .filter(([_, data]) => !data.display)
      .map(([index]) => index)
      .sort((a, b) => a - b);
    
    let blockIndex = 0;
    let inlineIndex = 0;
    let replacedCount = 0;
    const unmatchedHtmlFormulas: number[] = [];
    const unmatchedPlaceholders: number[] = [];
    
    // 改进匹配策略：对于无法匹配的 HTML 公式，尝试跳过（可能是重复渲染）
    // 但需要确保所有 Markdown 公式都能被匹配
    for (let i = 0; i < htmlFormulaMatches.length; i++) {
      const htmlMatch = htmlFormulaMatches[i];
      let placeholderIndex: number | null = null;
      
      if (htmlMatch.isBlockLevel && blockIndex < blockPlaceholderIndices.length) {
        placeholderIndex = blockPlaceholderIndices[blockIndex];
        blockIndex++;
      } else if (!htmlMatch.isBlockLevel && inlineIndex < inlinePlaceholderIndices.length) {
        placeholderIndex = inlinePlaceholderIndices[inlineIndex];
        inlineIndex++;
      } else {
        // 无法匹配的公式元素：HTML 中有但 Markdown 中没有
        // 说明 Markdown 侧解析有问题，以 HTML 为准
        // 从 HTML 中提取 LaTeX 内容，添加到占位符 Map 中
        if (htmlMatch.latexContent) {
          // 生成新的占位符索引
          const newIndex = markdownPlaceholders.size;
          markdownPlaceholders.set(newIndex, {
            latex: htmlMatch.latexContent,
            display: htmlMatch.isBlockLevel
          });
          placeholderIndex = newIndex;
          
          // 更新占位符索引列表
          if (htmlMatch.isBlockLevel) {
            blockPlaceholderIndices.push(newIndex);
            blockIndex++;
          } else {
            inlinePlaceholderIndices.push(newIndex);
            inlineIndex++;
          }
          
          logger.info(`从 HTML 中提取公式并添加到占位符 ${newIndex}（${htmlMatch.isBlockLevel ? '块级' : '行内'}）: ${htmlMatch.latexContent.substring(0, 100)}`);
        } else {
          // 没有 LaTeX 内容（可能是 MathML），无法处理
          unmatchedHtmlFormulas.push(i);
          logger.warn(`无法匹配 HTML 中的公式元素 ${i}（${htmlMatch.isBlockLevel ? '块级' : '行内'}），且无法提取 LaTeX 内容。HTML 元素预览: ${htmlMatch.match.substring(0, 100)}`);
        }
      }
      
      if (placeholderIndex !== null) {
          // 创建占位符文本
          const placeholderText = htmlMatch.isBlockLevel
            ? `[MATH_PLACEHOLDER_${placeholderIndex}]`
            : `[MATH_PLACEHOLDER_${placeholderIndex}_INLINE]`;
        
        // 替换公式元素为占位符
        if (htmlMatch.isBlockLevel) {
          // 块级公式：替换为段落中的占位符
          processedHtml = processedHtml.substring(0, htmlMatch.index) + 
                          `<p class="Normal" style="text-align: center; margin: 12pt 0;"><span>${placeholderText}</span></p>` + 
                          processedHtml.substring(htmlMatch.index + htmlMatch.match.length);
        } else {
          // 行内公式：替换为 span 中的占位符
          processedHtml = processedHtml.substring(0, htmlMatch.index) + 
                          `<span>${placeholderText}</span>` + 
                          processedHtml.substring(htmlMatch.index + htmlMatch.match.length);
        }
        
        replacedCount++;
      }
    }
    
    // 检查未匹配的占位符
    if (blockIndex < blockPlaceholderIndices.length) {
      const remaining = blockPlaceholderIndices.slice(blockIndex);
      unmatchedPlaceholders.push(...remaining);
      logger.warn(`有 ${remaining.length} 个块级占位符无法在 HTML 中找到对应的公式元素: ${remaining.slice(0, 10).join(', ')}`);
      // 输出未匹配占位符的详细信息，便于调试
      for (const idx of remaining.slice(0, 5)) {
        const placeholderData = markdownPlaceholders.get(idx);
        if (placeholderData) {
          logger.warn(`未匹配的块级占位符 ${idx} 的 LaTeX: ${placeholderData.latex}`);
        }
      }
    }
    if (inlineIndex < inlinePlaceholderIndices.length) {
      const remaining = inlinePlaceholderIndices.slice(inlineIndex);
      unmatchedPlaceholders.push(...remaining);
      logger.warn(`有 ${remaining.length} 个行内占位符无法在 HTML 中找到对应的公式元素: ${remaining.slice(0, 10).join(', ')}`);
      // 输出未匹配占位符的详细信息，便于调试
      for (const idx of remaining.slice(0, 5)) {
        const placeholderData = markdownPlaceholders.get(idx);
        if (placeholderData) {
          logger.warn(`未匹配的行内占位符 ${idx} 的 LaTeX: ${placeholderData.latex}`);
        }
      }
    }
    
    logger.info(`在 HTML 中替换了 ${replacedCount} 个公式元素为占位符（块级：${blockIndex}，行内：${inlineIndex}），未匹配：HTML 公式 ${unmatchedHtmlFormulas.length} 个，占位符 ${unmatchedPlaceholders.length} 个`);
    
    // 验证占位符是否在 HTML 中（用于调试）
    const placeholderCountInHtml = (processedHtml.match(/\[MATH_PLACEHOLDER_\d+(?:_INLINE)?\]/g) || []).length;
    logger.info(`HTML 中包含 ${placeholderCountInHtml} 个占位符文本`);
  }
  
  // 将HTML中的标题和正文映射到Word样式库（如果启用）
  let styledHtml = enableStyleMapping ? mapHtmlToWordStyles(processedHtml) : processedHtml;
  
  // 添加封面
  let coverHtml = '';
  if (options?.generateCover && meta) {
    coverHtml = generateCoverPage(meta, styleMapping);
  }
  
  // 添加目录占位符（如果有封面，目录在封面后；如果没有封面，目录在正文前）
  // 目录标题在HTML阶段插入，目录内容占位符将在document.xml处理阶段替换为Word自动目录
  // 注意：目录标题不使用 h1（会被映射为 Heading1），而是使用普通的加粗居中段落，避免目录项包含"目录"
  let tocPlaceholder = '';
  if (options?.generateToc) {
    const tocTitle = t('export.options.generateToc.title', '目录');
    // 目录占位符：普通加粗居中段落 + 占位符div（将被替换为Word自动目录字段）
    // 注意：占位符div需要使用特定的data属性，以便在document.xml处理阶段识别
    // 注意：不在HTML阶段添加分页符，WordTocProcessor会在目录后自动添加分页符
    tocPlaceholder = `
      <p style="text-align: center; margin-bottom: 20pt; font-weight: bold; font-size: 18pt;">
        <span>${escapeHtml(tocTitle)}</span>
      </p>
      <div data-toc-placeholder="true" style="display: none;"></div>
    `;
  }

  // 处理代码块：将换行符转换为<br>标签，并使用表格包装创建背景框
  // html-to-docx可能不支持white-space: pre和某些CSS属性（如背景色、边框）
  styledHtml = processCodeBlocksForWord(styledHtml);

  // 处理表格样式：统一表格边框，确保边框粗细一致
  styledHtml = processTablesForWord(styledHtml);

  // 注意：公式已经在 Markdown 阶段被替换为文本占位符
  // 如果 HTML 中还有公式元素，也需要替换为占位符（作为备用处理）
  // 这里不再需要 convertFormulaToMathML，因为占位符会直接传递到 document.xml
  
  // 添加CSS样式表，定义Word样式库映射和代码框样式
  // Word在转换HTML时会识别这些样式类名并映射到样式库
  const wordStyles = `
    <style>
      /* Word样式库映射 */
      .Heading1, h1.Heading1 {
        font-size: ${styleMapping.heading1?.fontSize || 18}pt;
        font-weight: bold;
        color: #000000;
        margin-top: 12pt;
        margin-bottom: 6pt;
        line-height: ${styleMapping.heading1?.lineHeight || 1.2};
        font-family: "${styleMapping.heading1?.fontFamily || 'Microsoft YaHei'}", "SimSun", serif;
        text-align: left !important; /* 确保标题左对齐 */
      }
      .Heading2, h2.Heading2 {
        font-size: ${styleMapping.heading2?.fontSize || 16}pt;
        font-weight: bold;
        color: #000000;
        margin-top: 10pt;
        margin-bottom: 6pt;
        line-height: ${styleMapping.heading2?.lineHeight || 1.2};
        font-family: "${styleMapping.heading2?.fontFamily || 'Microsoft YaHei'}", "SimSun", serif;
        text-align: left !important; /* 确保标题左对齐 */
      }
      .Heading3, h3.Heading3 {
        font-size: ${styleMapping.heading3?.fontSize || 14}pt;
        font-weight: bold;
        color: #000000;
        margin-top: 8pt;
        margin-bottom: 4pt;
        line-height: ${styleMapping.heading3?.lineHeight || 1.2};
        font-family: "${styleMapping.heading3?.fontFamily || 'Microsoft YaHei'}", "SimSun", serif;
        text-align: left !important; /* 确保标题左对齐 */
      }
      .Heading4, h4.Heading4 {
        font-size: ${styleMapping.heading4?.fontSize || 12}pt;
        font-weight: bold;
        color: #000000;
        margin-top: 6pt;
        margin-bottom: 4pt;
        line-height: ${styleMapping.heading4?.lineHeight || 1.2};
        font-family: "${styleMapping.heading4?.fontFamily || 'Microsoft YaHei'}", "SimSun", serif;
        text-align: left !important; /* 确保标题左对齐 */
      }
      .Normal, p.Normal {
        font-size: ${styleMapping.normal?.fontSize || 10.5}pt;
        color: #000000;
        margin-top: 0pt;
        margin-bottom: 6pt;
        line-height: ${styleMapping.normal?.lineHeight || 1.15};
        font-family: "${styleMapping.normal?.fontFamily || 'Microsoft YaHei'}", "SimSun", serif;
        text-align: left !important; /* 确保正文段落左对齐 */
      }
      
      /* 确保所有段落默认左对齐，除非明确指定 */
      p {
        text-align: left !important;
      }
      
      /* 标题可以居中（如果有明确指定） */
      h1[style*="center"], h2[style*="center"], h3[style*="center"], h4[style*="center"], h5[style*="center"], h6[style*="center"] {
        /* 保持居中对齐 */
      }
      
      /* 代码框样式 - 代码块已通过processCodeBlocksForWord函数转换为表格格式 */
      /* 这里只保留内联代码的样式 */
      /* 内联代码样式（保持原有样式，不添加边框） */
      code:not(pre code):not(.hljs) {
        background-color: #f0f0f0 !important;
        border: none !important;
        padding: 2pt 4pt !important;
        border-radius: 2px !important;
        font-family: "Consolas", "Monaco", "Courier New", monospace !important;
        font-size: 9pt !important;
        color: #d14 !important;
      }
      
      /* 图片尺寸控制 - 使用max-width和max-height保持原始质量 */
      /* A4页面可用区域：约680px × 1000px */
      img {
        max-width: 680px !important;
        max-height: 1000px !important;
        width: auto !important;
        height: auto !important;
        object-fit: contain !important;
      }
      
      /* 表格样式 - 统一边框粗细，确保美观 */
      table {
        border-collapse: collapse !important;
        border: 0.5pt solid #000000 !important;
        width: 100% !important;
        margin: 6pt 0 !important;
      }
      
      table th,
      table td {
        border: 0.5pt solid #000000 !important;
        padding: 4pt !important;
        vertical-align: top !important;
      }
      
      table th {
        background-color: #f5f5f5 !important;
        font-weight: bold !important;
      }
    </style>
  `;
  
  // 组合封面、目录占位符和正文（目录占位符将在document.xml处理阶段替换为Word自动目录）
  const finalContent = coverHtml + tocPlaceholder + styledHtml;
  
  // 使用 html-to-docx 库生成 DOCX
  // 该库直接生成 document.xml，不包含 afchunk.mht
  const htmlWrapped = `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>Document</title>${wordStyles}</head><body>${finalContent}</body></html>`;
  
  // html-to-docx 配置选项
  const documentOptions = {
    orientation: 'portrait' as const,
    margins: {
      top: 1440, // TWIP (1/20 point), 默认约 2.54cm
      right: 1800,
      bottom: 1440,
      left: 1800,
      header: 720,
      footer: 720,
      gutter: 0,
    },
    title: meta?.title || 'Document',
    creator: meta?.author || DEFAULT_AUTHOR,
    keywords: meta?.keywords || [],
    description: meta?.description || '',
    font: styleMapping.normal?.fontFamily || 'Microsoft YaHei',
    fontSize: (styleMapping.normal?.fontSize || 10.5) * 2, // html-to-docx 使用 HIP (Half of point)，所以需要乘以 2
    lang: 'zh-CN', // 设置语言为中文，避免拼写检查错误
  };
  
  const docxBuffer = await HTMLtoDOCX(htmlWrapped, null, documentOptions, null);
  return Buffer.from(docxBuffer);
};

// 导出公式占位符数据，供DOCX处理器使用
export const getCurrentFormulaPlaceholders = (): Map<number, { latex: string; display: boolean }> => {
  return getFormulaPlaceholders();
};

interface DocumentMetaInfo {
  title: string;
  author: string;
  description: string;
  keywords: string[];
}

const DEFAULT_AUTHOR = 'MetaDoc';
const DEFAULT_APPLICATION = 'MetaDoc';

const sanitizeMetaField = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const extractDocumentMeta = (payload: RendererExportPayload): DocumentMetaInfo => {
  try {
    const parsed = JSON.parse(payload.data.json || '{}');
    const meta = parsed?.current_article_meta_data ?? {};
    const keywordsSource = meta?.keywords;
    const keywords = Array.isArray(keywordsSource)
      ? keywordsSource.map((item: any) => sanitizeMetaField(item)).filter(Boolean)
      : [];
    const title = sanitizeMetaField(meta?.title) || payload.suggestedName || 'Untitled';
    const author = sanitizeMetaField(meta?.author) || DEFAULT_AUTHOR;
    const description = sanitizeMetaField(meta?.description);
    return { title, author, description, keywords };
  } catch {
    return {
      title: payload.suggestedName || 'Untitled',
      author: DEFAULT_AUTHOR,
      description: '',
      keywords: [],
    };
  }
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const wrapHtmlWithTemplate = (meta: DocumentMetaInfo, bodyContent: string): string => {
  const title = escapeHtml(meta.title || 'Document');
  const authorMeta = meta.author
    ? `<meta name="author" content="${escapeHtml(meta.author)}">`
    : '';
  const descriptionMeta = meta.description
    ? `<meta name="description" content="${escapeHtml(meta.description)}">`
    : '';
  const keywordsMeta =
    meta.keywords.length > 0
      ? `<meta name="keywords" content="${escapeHtml(meta.keywords.join(', '))}">`
      : '';
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>${title}</title>${authorMeta}${descriptionMeta}${keywordsMeta}</head><body>${bodyContent}</body></html>`;
};

const buildCorePropertiesXml = (meta: DocumentMetaInfo): string => {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(meta.title)}</dc:title>
  <dc:subject>${escapeXml(meta.description)}</dc:subject>
  <dc:creator>${escapeXml(meta.author)}</dc:creator>
  <cp:lastModifiedBy>${escapeXml(DEFAULT_APPLICATION)}</cp:lastModifiedBy>
  <cp:keywords>${escapeXml(meta.keywords.join(', '))}</cp:keywords>
  <dc:description>${escapeXml(meta.description)}</dc:description>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
};

const CORE_PROPERTIES_PART = '/docProps/core.xml';
const CORE_PROPERTIES_CONTENT_TYPE = 'application/vnd.openxmlformats-package.core-properties+xml';
const CORE_PROPERTIES_REL_TYPE =
  'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties';

// 创建 DOCX 处理管理器实例（单例）
let docxProcessingManager: DocxProcessingManager | null = null;

/**
 * 获取 DOCX 处理管理器
 * 使用单例模式，确保所有处理器只注册一次
 */
const getDocxProcessingManager = (): DocxProcessingManager => {
  if (!docxProcessingManager) {
    docxProcessingManager = new DocxProcessingManager();
    // 注册 Document XML 修复处理器（首先执行，修复对齐、分页、语言等问题）
    docxProcessingManager.register(new DocumentXmlFixProcessor());
    // 注册 Word 自动目录处理器
    docxProcessingManager.register(new WordTocProcessor());
    // 注册页眉页脚处理器
    docxProcessingManager.register(new HeaderFooterProcessor());
    // 注册 OMML 插入处理器（最后执行，插入公式）
    docxProcessingManager.register(new OMMLInsertionProcessor());
  }
  return docxProcessingManager;
};

const applyDocxMetadata = async (
  buffer: Buffer, 
  meta: DocumentMetaInfo, 
  options?: {
    generateToc?: boolean;
    processFormula?: boolean;
    showPageNumbers?: boolean;
    showHeader?: boolean;
    styleMapping?: {
      normal?: { fontFamily: string; fontSize: number; lineHeight: number };
      heading1?: { fontFamily: string; fontSize: number; lineHeight: number };
    };
    targetPath?: string; // 用于调试文件保存
  },
  progressCallback?: (current: number, total: number, message?: string) => void
): Promise<Buffer> => {
  // 首先应用元数据
  const zip = await JSZip.loadAsync(buffer);
  zip.file('docProps/core.xml', buildCorePropertiesXml(meta));
  await ensureCorePropsRegistered(zip);
  let updated = await zip.generateAsync({ type: 'nodebuffer' });
  
  // 应用 DOCX 处理器（如目录、页眉页脚、OMML等）
  const processorManager = getDocxProcessingManager();
  
  // 从 options 中提取 targetPath（如果存在）
  const targetPath = (options as any)?.targetPath;
  
  // 如果 processFormula 为 true，传递公式占位符数据；否则不传递，跳过公式处理
  const processOptions: any = {
    ...options,
    title: meta.title,
    progressCallback: progressCallback, // 传递进度回调
    targetPath: targetPath, // 传递目标路径用于调试文件保存
  };
  
  // 只有当 processFormula 不为 false 时才处理公式
  if (options?.processFormula !== false) {
    const formulaPlaceholders = getFormulaPlaceholders();
    processOptions.formulaPlaceholders = formulaPlaceholders;
  }
  
  updated = await processorManager.process(updated, processOptions);
  
  // 清除公式占位符数据
  clearFormulaPlaceholders();
  
  return Buffer.from(updated);
};

const applyPdfMetadata = async (buffer: Buffer, meta: DocumentMetaInfo): Promise<Buffer> => {
  const pdfDoc = await PDFDocument.load(buffer);
  if (meta.title) {
    pdfDoc.setTitle(meta.title, { showInWindowTitleBar: true });
  }
  if (meta.author) {
    pdfDoc.setAuthor(meta.author);
  }
  if (meta.description) {
    pdfDoc.setSubject(meta.description);
  }
  if (meta.keywords.length > 0) {
    pdfDoc.setKeywords(meta.keywords);
  }
  pdfDoc.setProducer(DEFAULT_APPLICATION);
  pdfDoc.setCreator(DEFAULT_APPLICATION);
  const now = new Date();
  pdfDoc.setCreationDate(now);
  pdfDoc.setModificationDate(now);
  const updated = await pdfDoc.save();
  return Buffer.from(updated);
};

const ensureCorePropsRegistered = async (zip: JSZip): Promise<void> => {
  const contentTypesFile = zip.file('[Content_Types].xml');
  if (contentTypesFile) {
    const xml = await contentTypesFile.async('string');
    const nextXml = ensureContentTypesHasCoreProps(xml);
    zip.file('[Content_Types].xml', nextXml);
  }

  const relsFile = zip.file('_rels/.rels');
  if (relsFile) {
    const xml = await relsFile.async('string');
    const nextXml = ensureRelsHasCoreProps(xml);
    zip.file('_rels/.rels', nextXml);
  }
};

const ensureContentTypesHasCoreProps = (xml: string): string => {
  if (xml.includes(CORE_PROPERTIES_PART)) {
    return xml;
  }
  const insertion = `  <Override PartName="${CORE_PROPERTIES_PART}" ContentType="${CORE_PROPERTIES_CONTENT_TYPE}"/>\n`;
  if (xml.includes('</Types>')) {
    return xml.replace('</Types>', `${insertion}</Types>`);
  }
  return `${xml}\n${insertion}`;
};

const ensureRelsHasCoreProps = (xml: string): string => {
  if (xml.includes('Target="docProps/core.xml"')) {
    return xml;
  }
  const nextRelationshipId = getNextRelationshipId(xml);
  const insertion = `  <Relationship Id="${nextRelationshipId}" Type="${CORE_PROPERTIES_REL_TYPE}" Target="docProps/core.xml"/>\n`;
  if (xml.includes('</Relationships>')) {
    return xml.replace('</Relationships>', `${insertion}</Relationships>`);
  }
  return `${xml}\n${insertion}`;
};

const getNextRelationshipId = (xml: string): string => {
  const matches = Array.from(xml.matchAll(/Id="rId(\d+)"/g));
  const max = matches.reduce((acc, match) => {
    const num = Number(match[1]);
    if (!Number.isNaN(num) && num > acc) {
      return num;
    }
    return acc;
  }, 0);
  return `rId${max + 1 || 1}`;
};

const writePdfMetadataToFile = async (
  filePath: string,
  meta: DocumentMetaInfo,
): Promise<void> => {
  const buffer = await fs.promises.readFile(filePath);
  const updated = await applyPdfMetadata(buffer, meta);
  await writeBinaryFile(filePath, updated);
};

const enforceExtension = (fileName: string, targetFormat: ExportFormat): string => {
  const extension = `.${targetFormat}`;
  if (!fileName || fileName.trim().length === 0) {
    return `Untitled${extension}`;
  }

  if (fileName.toLowerCase().endsWith(extension)) {
    return fileName;
  }

  return `${fileName.replace(/\.+$/, '')}${extension}`;
};

const sendProgress = (mainWindow: BrowserWindow | null, progress: {
  visible?: boolean;
  message?: string;
  subMessage?: string;
  percentage?: number;
  status?: 'success' | 'exception' | 'warning' | '';
  params?: Record<string, any>;
}, requestId?: string) => {
  const reqId = requestId ?? currentRequestId;
  if (mainWindow && !mainWindow.isDestroyed()) {
    // 正确处理 visible 属性：如果明确设置为 false，则保持 false；否则默认为 true
    const isVisible = progress.visible !== undefined ? progress.visible : true
    mainWindow.webContents.send('global-progress', {
      visible: isVisible,
      message: progress.message || '',
      subMessage: progress.subMessage,
      percentage: progress.percentage ?? 0,
      status: progress.status || '',
      params: progress.params,
      requestId: reqId,
      canCancel: !!reqId,
    });
  }
};

const MARKDOWN_HANDLERS: Record<ExportFormat, ExportHandler> = {
  md: async ({ payload, targetPath, mainWindow }) => {
    try {
      // Markdown导出不需要预渲染，从0%开始
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exporting',
        percentage: 50,
        params: { format: 'Markdown' }
      });
      
      let finalMarkdown = payload.data.md;
      
      // 处理图片（如果是 folder 模式）
      const imageProcessing = payload.exportOptions?.imageProcessing;
      if (imageProcessing === 'folder') {
        sendProgress(mainWindow, {
          message: 'agent.reference.progress.exporting',
          subMessage: 'agent.reference.progress.savingImages',
          percentage: 60,
          params: { format: 'Markdown' }
        });
        
        // 提取所有图片 URL
        const imageUrls: string[] = [];
        const regex = /!\[.*?\]\((.*?)\)/g;
        let match;
        while ((match = regex.exec(finalMarkdown)) !== null) {
          const url = match[1];
          if (url.startsWith('http://localhost:52521/images/')) {
            imageUrls.push(url);
          }
        }
        
        if (imageUrls.length > 0) {
          // 创建图片文件夹
          const docName = path.basename(targetPath, path.extname(targetPath));
          const imagesFolder = path.join(path.dirname(targetPath), `${docName}_images`);
          
          // 保存图片
          const results = await saveImagesToFolder(imageUrls, imagesFolder);
          
          // 创建 URL 到相对路径的映射
          const imageMappings = new Map<string, string>();
          for (const result of results) {
            imageMappings.set(result.originalUrl, result.relativePath);
          }
          
          // 更新 Markdown 中的图片链接
          finalMarkdown = updateMarkdownImageLinks(finalMarkdown, imageMappings);
        }
      }
      
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exporting',
        subMessage: 'agent.reference.progress.generatingFile',
        percentage: 80,
        params: { format: 'Markdown' }
      });
      await writeTextFile(targetPath, finalMarkdown);
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exportComplete',
        percentage: 100,
        status: 'success'
      });
      setTimeout(() => {
        sendProgress(mainWindow, { visible: false, message: '', percentage: 0 });
      }, 1000);
    } finally {
      setTimeout(() => {
        sendProgress(mainWindow, { visible: false, message: '', percentage: 0 });
      }, 2000);
    }
  },
  html: async ({ payload, targetPath, mainWindow }) => {
    try {
      if (!payload.html) {
        throw new Error('缺少 HTML 数据，无法导出为 HTML');
      }
      // 预渲染已完成（0-80%），现在从80%开始
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exporting',
        subMessage: 'agent.reference.progress.convertingMarkdown',
        percentage: 80,
        params: { format: 'HTML' }
      });
      const meta = extractDocumentMeta(payload);
      
      let finalHtml = payload.html;
      
      // 处理图片（如果是 folder 模式）
      const imageProcessing = payload.exportOptions?.imageProcessing;
      if (imageProcessing === 'folder') {
        sendProgress(mainWindow, {
          message: 'agent.reference.progress.exporting',
          subMessage: 'agent.reference.progress.savingImages',
          percentage: 85,
          params: { format: 'HTML' }
        });
        
        // 提取所有图片 URL
        const imageUrls: string[] = [];
        const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
        const matches = Array.from(finalHtml.matchAll(imgRegex));
        for (const match of matches) {
          const src = match[1];
          if (src.startsWith('http://localhost:52521/images/')) {
            imageUrls.push(src);
          }
        }
        
        if (imageUrls.length > 0) {
          // 创建图片文件夹
          const docName = path.basename(targetPath, path.extname(targetPath));
          const imagesFolder = path.join(path.dirname(targetPath), `${docName}_images`);
          
          // 保存图片
          const results = await saveImagesToFolder(imageUrls, imagesFolder);
          
          // 创建 URL 到相对路径的映射
          const imageMappings = new Map<string, string>();
          for (const result of results) {
            imageMappings.set(result.originalUrl, result.relativePath);
          }
          
          // 更新 HTML 中的图片链接
          finalHtml = updateHtmlImageLinks(finalHtml, imageMappings);
        }
      }
      
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exporting',
        subMessage: 'agent.reference.progress.generatingFile',
        percentage: 90,
        params: { format: 'HTML' }
      });
      const wrapped = wrapHtmlWithTemplate(meta, finalHtml);
      await writeTextFile(targetPath, wrapped);
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exportComplete',
        percentage: 100,
        status: 'success'
      });
      setTimeout(() => {
        sendProgress(mainWindow, { visible: false, message: '', percentage: 0 });
      }, 1000);
    } finally {
      setTimeout(() => {
        sendProgress(mainWindow, { visible: false, message: '', percentage: 0 });
      }, 2000);
    }
  },
  docx: async ({ payload, targetPath, mainWindow }) => {
    try {
      if (!payload.html) {
        throw new Error('缺少 HTML 数据，无法导出为 DOCX');
      }
      // 预渲染已完成（0-80%），现在从80%开始
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exporting',
        subMessage: 'agent.reference.progress.convertingMarkdown',
        percentage: 80,
        params: { format: 'DOCX' }
      });
      const meta = extractDocumentMeta(payload);
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exporting',
        subMessage: 'agent.reference.progress.generatingFile',
        percentage: 88,
        params: { format: 'DOCX' }
      });
      // 从导出选项中提取DOCX选项
      const docxOptions = payload.exportOptions ? {
        enableStyleMapping: payload.exportOptions.enableStyleMapping,
        styleMapping: payload.exportOptions.styleMapping,
        generateCover: payload.exportOptions.generateCover,
        generateToc: payload.exportOptions.generateToc,
        processFormula: payload.exportOptions.processFormula,
        showPageNumbers: payload.exportOptions.showPageNumbers,
        showHeader: payload.exportOptions.showHeader,
      } : undefined;
      const buffer = await convertMarkdownToDocxBuffer(payload.html, payload.data.md, docxOptions, meta);
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exporting',
        subMessage: 'agent.reference.progress.addingMetadata',
        percentage: 88,
        params: { format: 'DOCX' }
      });
      
      // 创建进度回调，将公式转换进度映射到 88-95% 区间
      const formulaPlaceholders = getFormulaPlaceholders();
      const totalFormulas = formulaPlaceholders ? formulaPlaceholders.size : 0;
      const formulaProgressStart = 88;
      const formulaProgressEnd = 95;
      const formulaProgressRange = formulaProgressEnd - formulaProgressStart;
      
      const formulaProgressCallback = totalFormulas > 0 
        ? (current: number, total: number, message?: string) => {
            // current 是 0-100 的进度值（转换阶段0-50，替换阶段50-100）
            // 将其映射到 88-95% 区间
            const ratio = Math.min(current / 100, 1);
            const mappedProgress = formulaProgressStart + (ratio * formulaProgressRange);
            
            sendProgress(mainWindow, {
              message: 'agent.reference.progress.exporting',
              subMessage: message || 'agent.reference.progress.convertingFormulas',
              percentage: Math.min(mappedProgress, formulaProgressEnd),
              params: { format: 'DOCX' }
            });
          }
        : undefined;
      
      const bufferWithMeta = await applyDocxMetadata(buffer, meta, {
        generateToc: docxOptions?.generateToc,
        processFormula: docxOptions?.processFormula,
        styleMapping: docxOptions?.styleMapping,
        targetPath: targetPath, // 传递目标路径用于调试
      }, formulaProgressCallback);
      await writeBinaryFile(targetPath, bufferWithMeta);
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exportComplete',
        percentage: 100,
        status: 'success'
      });
      setTimeout(() => {
        sendProgress(mainWindow, { visible: false, message: '', percentage: 0 });
      }, 1000);
    } finally {
      setTimeout(() => {
        sendProgress(mainWindow, { visible: false, message: '', percentage: 0 });
      }, 2000);
    }
  },
  pdf: async ({ payload, targetPath, mainWindow }) => {
    try {
      logger.info('Markdown -> PDF 导出开始');
      if (!payload.html) {
        logger.error('缺少 HTML 数据');
        throw new Error('缺少 HTML 数据，无法导出为 PDF');
      }
      logger.info(`HTML 数据长度: ${payload.html.length}`);
      // 预渲染已完成（0-80%），现在从80%开始
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exporting',
        subMessage: 'agent.reference.progress.renderingHtml',
        percentage: 80,
        params: { format: 'PDF' }
      });
      const meta = extractDocumentMeta(payload);
      // ConvertHtmlForPdf 已经返回完整的 HTML 文档，不需要再次包装
      // 但我们需要注入元数据到 head 中
      let htmlDocument = payload.html;
      if (!htmlDocument.includes('<!DOCTYPE html>')) {
        // 如果不是完整文档，则包装
        htmlDocument = wrapHtmlWithTemplate(meta, payload.html);
      } else {
        // 如果是完整文档，注入元数据到 head
        const metaTags = [
          meta.title ? `<title>${escapeHtml(meta.title)}</title>` : '',
          meta.author ? `<meta name="author" content="${escapeHtml(meta.author)}">` : '',
          meta.description ? `<meta name="description" content="${escapeHtml(meta.description)}">` : '',
          meta.keywords.length > 0 ? `<meta name="keywords" content="${escapeHtml(meta.keywords.join(', '))}">` : '',
        ].filter(Boolean).join('');
        if (metaTags) {
          htmlDocument = htmlDocument.replace('</head>', `${metaTags}</head>`);
        }
      }
      logger.info(`处理后的 HTML 长度: ${htmlDocument.length}`);
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exporting',
        subMessage: 'agent.reference.progress.renderingHtml',
        percentage: 85,
        params: { format: 'PDF' }
      });
      // 从导出选项中提取PDF选项
      const pdfOptions = payload.exportOptions ? {
        margins: payload.exportOptions.margins,
        pageSize: payload.exportOptions.pageSize,
        printBackground: payload.exportOptions.printBackground,
      } : undefined;
      const buffer = await convertHtmlToPdfBuffer(htmlDocument, pdfOptions);
      logger.info(`PDF Buffer 生成完成，大小: ${buffer.length}`);
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exporting',
        subMessage: 'agent.reference.progress.addingMetadata',
        percentage: 95,
        params: { format: 'PDF' }
      });
      const updated = await applyPdfMetadata(buffer, meta);
      logger.info('元数据应用完成');
      await writeBinaryFile(targetPath, updated);
      logger.info(`PDF 文件写入完成: ${targetPath}`);
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exportComplete',
        percentage: 100,
        status: 'success'
      });
      setTimeout(() => {
        sendProgress(mainWindow, { visible: false, message: '', percentage: 0 });
      }, 1000);
    } catch (error) {
      logger.error('PDF 导出过程中出错:', error);
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exportError',
        subMessage: error instanceof Error ? error.message : String(error),
        percentage: 0,
        status: 'exception'
      });
      setTimeout(() => {
        sendProgress(mainWindow, { visible: false, message: '', percentage: 0 });
      }, 2000);
      throw error;
    } finally {
      // 确保进度条最终消失
      setTimeout(() => {
        sendProgress(mainWindow, { visible: false, message: '', percentage: 0 });
      }, 3000);
    }
  },
  tex: async ({ payload, targetPath, mainWindow }) => {
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exporting',
      percentage: 50,
      params: { format: 'LaTeX' }
    });
    await writeTextFile(targetPath, payload.data.tex);
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exportComplete',
      percentage: 100,
      status: 'success'
    });
    setTimeout(() => {
      sendProgress(mainWindow, { visible: false, message: '', percentage: 0 });
    }, 1000);
  },
  json: async () => {
    throw new Error('Markdown 文档不支持导出为 JSON');
  },
};

const LATEX_HANDLERS: Partial<Record<ExportFormat, ExportHandler>> = {
  tex: async ({ payload, targetPath, mainWindow }) => {
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exporting',
      percentage: 50,
      params: { format: 'LaTeX' }
    });
    
    let finalTex = payload.data.tex;
    
    // 处理图片（如果是 folder 模式）
    const imageProcessing = payload.exportOptions?.imageProcessing;
    if (imageProcessing === 'folder') {
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exporting',
        subMessage: 'agent.reference.progress.savingImages',
        percentage: 60,
        params: { format: 'LaTeX' }
      });
      
      // 提取所有图片 URL
      const imageUrls: string[] = [];
      const latexRegex = /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g;
      let match;
      while ((match = latexRegex.exec(finalTex)) !== null) {
        const imagePath = match[1];
        if (imagePath.startsWith('http://localhost:52521/images/')) {
          imageUrls.push(imagePath);
        }
      }
      
      if (imageUrls.length > 0) {
        // 创建图片文件夹
        const docName = path.basename(targetPath, path.extname(targetPath));
        const imagesFolder = path.join(path.dirname(targetPath), `${docName}_images`);
        
        // 保存图片
        const results = await saveImagesToFolder(imageUrls, imagesFolder);
        
        // 创建 URL 到相对路径的映射
        const imageMappings = new Map<string, string>();
        for (const result of results) {
          imageMappings.set(result.originalUrl, result.relativePath);
        }
        
        // 更新 LaTeX 中的图片链接
        finalTex = updateLatexImageLinks(finalTex, imageMappings);
      }
    }
    
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exporting',
      subMessage: 'agent.reference.progress.generatingFile',
      percentage: 80,
      params: { format: 'LaTeX' }
    });
    await writeTextFile(targetPath, finalTex);
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exportComplete',
      percentage: 100,
      status: 'success'
    });
    setTimeout(() => {
      sendProgress(mainWindow, { visible: false, message: '', percentage: 0 });
    }, 1000);
  },
  pdf: async ({ payload, targetPath, mainWindow }) => {
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exporting',
      subMessage: 'agent.reference.progress.compilingLatex',
      percentage: 10,
      params: { format: 'PDF' }
    });
    
    const meta = extractDocumentMeta(payload);
    await ensureParentDirectory(targetPath);
    
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exporting',
      subMessage: 'agent.reference.progress.executingLatexCompile',
      percentage: 30,
      params: { format: 'PDF' }
    });
    
    const compileResult: LaTeXCompileResult = await compileLatexToPDF(
      payload.sourcePath || targetPath,
      payload.data.tex,
      path.dirname(targetPath),
      mainWindow ?? undefined,
      path.basename(targetPath),
    );

    if (compileResult.status !== 'success' || !compileResult.pdfPath) {
      const message =
        compileResult.status === 'failed'
          ? t(
              'main.latex.compileFailed',
              `Compilation failed, exit code: ${String(compileResult.exitCode ?? '')}`,
              { code: String(compileResult.exitCode ?? '') },
            )
          : t('main.latex.compileFailed', 'Compilation failed, exit code: -1', { code: '-1' });
      
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exportError',
        subMessage: message,
        percentage: 0,
        status: 'exception'
      });
      setTimeout(() => {
        sendProgress(mainWindow, { visible: false, message: '', percentage: 0 });
      }, 2000);
      
      throw new Error(message);
    }

    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exporting',
      subMessage: 'agent.reference.progress.copyingPdf',
      percentage: 80,
      params: { format: 'PDF' }
    });

    if (compileResult.pdfPath !== targetPath) {
      await fs.promises.copyFile(compileResult.pdfPath, targetPath);
    }

    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exporting',
      subMessage: 'agent.reference.progress.addingMetadata',
      percentage: 90,
      params: { format: 'PDF' }
    });

    await writePdfMetadataToFile(targetPath, meta);
    
    // 注意：LaTeX编译的PDF颜色模式需要在LaTeX文档中配置
    // 这里我们只是记录选项，实际的颜色模式需要在LaTeX源码中使用相应的包（如xcolor）来设置
    if (payload.exportOptions?.colorMode === 'grayscale') {
      logger.info('颜色模式设置为灰度，但LaTeX编译的PDF需要在LaTeX源码中配置颜色模式');
      // 如果需要，可以在这里添加PDF后处理逻辑（但pdf-lib不支持直接转换为灰度）
    }
    
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exportComplete',
      percentage: 100,
      status: 'success'
    });
    
    setTimeout(() => {
      sendProgress(mainWindow, { visible: false, message: '', percentage: 0 });
    }, 1000);
  },
  md: async ({ payload, targetPath, mainWindow }) => {
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exporting',
      percentage: 50,
      params: { format: 'Markdown' }
    });
    await writeTextFile(targetPath, payload.data.md);
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exportComplete',
      percentage: 100,
      status: 'success'
    });
    setTimeout(() => {
      sendProgress(mainWindow, { visible: false, message: '', percentage: 0 });
    }, 1000);
  },
  html: async ({ payload, targetPath, mainWindow }) => {
    if (!payload.html) {
      throw new Error('缺少 HTML 数据，无法导出为 HTML');
    }
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exporting',
      subMessage: 'agent.reference.progress.convertingMarkdown',
      percentage: 30,
      params: { format: 'HTML' }
    });
    const meta = extractDocumentMeta(payload);
    
    let finalHtml = payload.html;
    
    // 处理图片（如果是 folder 模式）
    const imageProcessing = payload.exportOptions?.imageProcessing;
    if (imageProcessing === 'folder') {
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exporting',
        subMessage: 'agent.reference.progress.savingImages',
        percentage: 50,
        params: { format: 'HTML' }
      });
      
      // 提取所有图片 URL
      const imageUrls: string[] = [];
      const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
      const matches = Array.from(finalHtml.matchAll(imgRegex));
      for (const match of matches) {
        const src = match[1];
        if (src.startsWith('http://localhost:52521/images/')) {
          imageUrls.push(src);
        }
      }
      
      if (imageUrls.length > 0) {
        // 创建图片文件夹
        const docName = path.basename(targetPath, path.extname(targetPath));
        const imagesFolder = path.join(path.dirname(targetPath), `${docName}_images`);
        
        // 保存图片
        const results = await saveImagesToFolder(imageUrls, imagesFolder);
        
        // 创建 URL 到相对路径的映射
        const imageMappings = new Map<string, string>();
        for (const result of results) {
          imageMappings.set(result.originalUrl, result.relativePath);
        }
        
        // 更新 HTML 中的图片链接
        finalHtml = updateHtmlImageLinks(finalHtml, imageMappings);
      }
    }
    
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exporting',
      subMessage: 'agent.reference.progress.generatingFile',
      percentage: 60,
      params: { format: 'HTML' }
    });
    const wrapped = wrapHtmlWithTemplate(meta, finalHtml);
    await writeTextFile(targetPath, wrapped);
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exportComplete',
      percentage: 100,
      status: 'success'
    });
    setTimeout(() => {
      sendProgress(mainWindow, { visible: false, message: '', percentage: 0 });
    }, 1000);
  },
  docx: async ({ payload, targetPath, mainWindow }) => {
    if (!payload.html) {
      throw new Error('缺少 HTML 数据，无法导出为 DOCX');
    }
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exporting',
      subMessage: 'agent.reference.progress.convertingMarkdown',
      percentage: 20,
      params: { format: 'DOCX' }
    });
    const meta = extractDocumentMeta(payload);
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exporting',
      subMessage: 'agent.reference.progress.generatingFile',
      percentage: 50,
      params: { format: 'DOCX' }
    });
    const buffer = await convertMarkdownToDocxBuffer(payload.html, payload.data.md);
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exporting',
      subMessage: 'agent.reference.progress.addingMetadata',
      percentage: 80,
      params: { format: 'DOCX' }
    });
    const bufferWithMeta = await applyDocxMetadata(buffer, meta);
    await writeBinaryFile(targetPath, bufferWithMeta);
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exportComplete',
      percentage: 100,
      status: 'success'
    });
    setTimeout(() => {
      sendProgress(mainWindow, { visible: false, message: '', percentage: 0 });
    }, 1000);
  },
  json: async () => {
    throw new Error('LaTeX 文档不支持导出为 JSON');
  },
};

const JSON_HANDLERS: Partial<Record<ExportFormat, ExportHandler>> = {
  json: async ({ payload, targetPath }) => {
    await writeTextFile(targetPath, payload.data.json);
  },
  md: async () => {
    throw new Error('JSON 文档暂不支持导出为 Markdown');
  },
  html: async () => {
    throw new Error('JSON 文档暂不支持导出为 HTML');
  },
  docx: async () => {
    throw new Error('JSON 文档暂不支持导出为 DOCX');
  },
  pdf: async () => {
    throw new Error('JSON 文档暂不支持导出为 PDF');
  },
  tex: async () => {
    throw new Error('JSON 文档暂不支持导出为 LaTeX');
  },
};

const EXPORT_HANDLER_MAP: Record<DocumentFormat, Partial<Record<ExportFormat, ExportHandler>>> = {
  md: MARKDOWN_HANDLERS,
  tex: {
    ...LATEX_HANDLERS,
  },
  json: JSON_HANDLERS,
};

const FILTER_MAP: Record<ExportFormat, Electron.FileFilter> = {
  pdf: { name: t('main.dialogs.filters.pdf'), extensions: ['pdf'] },
  docx: { name: t('main.dialogs.filters.docx'), extensions: ['docx'] },
  html: { name: t('main.dialogs.filters.html'), extensions: ['html'] },
  md: { name: t('main.dialogs.filters.markdown'), extensions: ['md'] },
  tex: { name: t('main.dialogs.filters.latex'), extensions: ['tex'] },
  json: { name: 'JSON', extensions: ['json'] },
};

export const performExportRequest = async (
  payload: RendererExportPayload,
  mainWindow: BrowserWindow | null,
): Promise<ExportResponse> => {
  currentRequestId = payload.requestId;
  const abortController = payload.requestId ? new AbortController() : null;
  if (payload.requestId && abortController) {
    exportAbortControllers.set(payload.requestId, abortController);
  }
  const progressHandle = payload.requestId
    ? new MainProgressHandle({
        requestId: payload.requestId,
        canCancel: true,
        send: (p) => sendProgress(mainWindow, p, payload.requestId),
        initialMessage: 'agent.reference.progress.preparingExport',
        initialPercentage: 80,
      })
    : null;
  if (payload.requestId && progressHandle) {
    exportProgressHandles.set(payload.requestId, progressHandle);
  }

  const ensureNotCancelled = () => {
    if (abortController?.signal.aborted) {
      throw new Error('操作已取消');
    }
  };

  try {
    const availableTargets = getExportTargets(payload.sourceFormat);
    if (!availableTargets.some((item) => item.format === payload.targetFormat)) {
      return {
        success: false,
        error: t('main.dialogs.exportNotSupported', '不支持的导出格式'),
      };
    }

    const defaultFileName = enforceExtension(payload.suggestedName, payload.targetFormat);
    const filters = FILTER_MAP[payload.targetFormat]
      ? [FILTER_MAP[payload.targetFormat]]
      : [{ name: payload.targetFormat.toUpperCase(), extensions: [payload.targetFormat] }];

    // 在弹出对话框之前，通知渲染进程恢复鼠标状态
    if (mainWindow) {
      mainWindow.webContents.send('export-dialog-opening');
    }
    
    // @ts-ignore - Electron's showSaveDialog accepts BrowserWindow | undefined
    const dialogResult = await dialog.showSaveDialog(mainWindow || undefined, {
      title: t('main.dialogs.exportDocumentTitle'),
      defaultPath: defaultFileName,
      filters,
    });

    if (dialogResult.canceled || !dialogResult.filePath) {
      // 用户取消了对话框，取消任务并隐藏进度条
      if (progressHandle) {
        progressHandle.cancel();
      }
      if (abortController) {
        abortController.abort();
      }
      sendProgress(mainWindow, { visible: false }, payload.requestId);
      return { success: false };
    }

    // 显示导出进度条
    // 预渲染已完成（0-80%），现在从80%开始
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exporting',
      subMessage: 'agent.reference.progress.preparingExport',
      percentage: 80,
      params: { format: payload.targetFormat }
    }, payload.requestId);

    const handler = EXPORT_HANDLER_MAP[payload.sourceFormat]?.[payload.targetFormat];
    if (!handler) {
      return {
        success: false,
        error: t('main.dialogs.exportNotSupported', '不支持的导出格式'),
      };
    }

    const targetPath = enforceExtension(dialogResult.filePath, payload.targetFormat);
    ensureNotCancelled();
    await handler({
      payload,
      targetPath,
      mainWindow,
    });
    ensureNotCancelled();

    // 导出完成后，清理中间图片文件（仅对 PDF 和 DOCX）
    // HTML 和 TEX 需要保留图片文件，因为它们会引用图片地址
    if (payload.imageUrls && payload.imageUrls.length > 0) {
      if (payload.targetFormat === 'pdf' || payload.targetFormat === 'docx') {
        sendProgress(mainWindow, {
          message: 'agent.reference.progress.cleaningTempFiles',
          percentage: 98
        }, payload.requestId);
        await cleanupIntermediateImages(payload.imageUrls);
      }
    }

    // 清理完成后，确保进度条消失
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exportComplete',
      percentage: 100,
      status: 'success'
    }, payload.requestId);
    setTimeout(() => {
      sendProgress(mainWindow, { visible: false, message: '', percentage: 0 }, payload.requestId);
    }, 1000);

    return {
      success: true,
      path: targetPath,
    };
  } catch (error) {
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exportError',
      subMessage: error instanceof Error ? error.message : String(error),
      percentage: 0,
      status: 'exception'
    }, payload.requestId);
    setTimeout(() => {
      sendProgress(mainWindow, { visible: false, message: '', percentage: 0 }, payload.requestId);
    }, 2000);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    // 确保进度条最终消失
    setTimeout(() => {
      sendProgress(mainWindow, { visible: false, message: '', percentage: 0 }, payload.requestId);
    }, 3000);
    if (payload.requestId) {
      exportAbortControllers.delete(payload.requestId);
      exportProgressHandles.delete(payload.requestId);
    }
    currentRequestId = undefined;
  }
};


