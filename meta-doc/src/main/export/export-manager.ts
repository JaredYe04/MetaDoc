import { BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import htmlDocx from 'html-docx-js';
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
                
                img.style.width = finalWidth + 'px';
                img.style.height = finalHeight + 'px';
                img.style.maxWidth = availableWidthPx + 'px';
                img.style.maxHeight = availableHeightPx + 'px';
                img.style.objectFit = 'contain';
                img.style.display = 'block';
                img.style.margin = '0 auto';
                return true;
              } else {
                // 即使不需要缩放，也确保宽度不超过可用宽度
                if (displayWidth > availableWidthPx) {
                  img.style.maxWidth = availableWidthPx + 'px';
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
 * 将 DOCX 中的超链接转换为 Word 交叉引用字段
 * 处理格式：<a href="#ref-1">[1]</a> -> Word REF 字段
 */
const convertHyperlinksToWordCrossReferences = async (docxBuffer: Buffer): Promise<Buffer> => {
  const zip = await JSZip.loadAsync(docxBuffer);
  
  // 读取 document.xml
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    logger.warn('DOCX 文件中未找到 word/document.xml，跳过交叉引用转换');
    return docxBuffer;
  }
  
  let documentXml = await documentFile.async('string');
  
  // 第一步：收集现有的书签信息
  // 查找所有现有的书签，记录它们的名称和 ID
  const bookmarkStartRegex = /<w:bookmarkStart[^>]*w:id="(\d+)"[^>]*w:name="ref-([^"]+)"[^>]*\/>/g;
  const existingBookmarks = new Set<string>(); // refId 集合
  const existingBookmarkIds = new Set<number>(); // 已使用的书签 ID 集合
  let bookmarkMatch;
  while ((bookmarkMatch = bookmarkStartRegex.exec(documentXml)) !== null) {
    const bookmarkId = parseInt(bookmarkMatch[1], 10);
    const refId = bookmarkMatch[2];
    existingBookmarks.add(refId);
    existingBookmarkIds.add(bookmarkId);
  }
  
  // 查找所有引用编号，为它们创建书签映射（如果还没有书签）
  const refBookmarks = new Map<string, string>(); // refId -> citationNum
  const allRefMatches = documentXml.matchAll(/<w:t[^>]*>\[(\d+)\][\s\S]*?<\/w:t>/g);
  for (const match of allRefMatches) {
    const citationNum = match[1];
    const refId = citationNum; // 假设引用编号就是 refId
    if (!existingBookmarks.has(refId) && !refBookmarks.has(refId)) {
      refBookmarks.set(refId, citationNum);
    }
  }
  
  // 生成新的书签 ID（确保不与现有 ID 冲突）
  let bookmarkIdCounter = 1;
  while (existingBookmarkIds.has(bookmarkIdCounter)) {
    bookmarkIdCounter++;
  }
  
  // 第二步：处理超链接，转换为 Word 交叉引用字段
  // 情况1：匹配 w:anchor 属性的超链接（理想情况）
  const hyperlinkAnchorRegex = /<w:hyperlink[^>]*w:anchor="ref-([^"]+)"[^>]*>([\s\S]*?)<\/w:hyperlink>/g;
  documentXml = documentXml.replace(hyperlinkAnchorRegex, (match, refId, content) => {
    // 提取引用编号（从内容中提取）
    const citationMatch = content.match(/<w:t[^>]*>\[([^\]]+)\]<\/w:t>/);
    const citationNum = citationMatch ? citationMatch[1] : refId;
    
    // 确保书签存在
    if (!existingBookmarks.has(refId)) {
      existingBookmarks.add(refId);
    }
    
    // 转换为 Word 交叉引用字段
    // Word 字段代码格式：{ REF ref-X \h }
    return `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> REF ref-${refId} \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>[${citationNum}]</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  });
  
  // 情况2：匹配 file:// 链接（html-docx-js 可能将 #ref-X 转换为 file:// 链接）
  // 格式：<w:hyperlink w:history="1" r:id="rIdX"> 或 <w:hyperlink r:id="rIdX">
  // 需要从 relationships 中查找对应的 URL
  const relationshipsFile = zip.file('word/_rels/document.xml.rels');
  const refIdToRIdMap = new Map<string, string>(); // refId -> rId
  
  if (relationshipsFile) {
    const relationshipsXml = await relationshipsFile.async('string');
    // 匹配 <Relationship Id="rIdX" Target="#ref-X" ... />
    const relRegex = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="#ref-([^"]+)"[^>]*\/>/g;
    let relMatch;
    while ((relMatch = relRegex.exec(relationshipsXml)) !== null) {
      refIdToRIdMap.set(relMatch[2], relMatch[1]);
    }
    
    // 也匹配 file:// 链接，提取 ref-X
    const fileRefRegex = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="file:\/\/\/[^"]*#ref-([^"]+)"[^>]*\/>/g;
    while ((relMatch = fileRefRegex.exec(relationshipsXml)) !== null) {
      refIdToRIdMap.set(relMatch[2], relMatch[1]);
    }
  }
  
  // 处理使用 r:id 的超链接
  for (const [refId, rId] of refIdToRIdMap.entries()) {
    const hyperlinkRIdRegex = new RegExp(`<w:hyperlink[^>]*r:id="${rId}"[^>]*>([\\s\\S]*?)<\\/w:hyperlink>`, 'g');
    documentXml = documentXml.replace(hyperlinkRIdRegex, (match, content) => {
      // 提取引用编号
      const citationMatch = content.match(/<w:t[^>]*>\[([^\]]+)\]<\/w:t>/);
      const citationNum = citationMatch ? citationMatch[1] : refId;
      
      // 确保书签存在
      if (!existingBookmarks.has(refId)) {
        existingBookmarks.add(refId);
      }
      
      // 转换为 Word 交叉引用字段
      return `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> REF ref-${refId} \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>[${citationNum}]</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
    });
  }
  
  // 第三步：在参考文献列表位置创建书签（如果还没有）
  // 查找参考文献列表中的引用编号，在它们前面插入书签
  for (const [refId, citationNum] of refBookmarks.entries()) {
    if (!existingBookmarks.has(refId)) {
      // 生成唯一的书签 ID
      while (existingBookmarkIds.has(bookmarkIdCounter)) {
        bookmarkIdCounter++;
      }
      const bookmarkId = bookmarkIdCounter++;
      existingBookmarkIds.add(bookmarkId);
      
      // 查找引用编号的位置，在其前面插入书签
      // 匹配格式：<w:p>...<w:t>[数字]</w:t>...</w:p>
      const citationPattern = new RegExp(`(<w:p[^>]*>)([\\s\\S]*?)(<w:t[^>]*>\\[${citationNum}\\][\\s\\S]*?<\\/w:t>)`, 'g');
      documentXml = documentXml.replace(citationPattern, (match, paraStart, beforeText, citationText) => {
        // 检查是否已经包含书签（避免重复插入）
        if (match.includes(`w:name="ref-${refId}"`)) {
          return match;
        }
        // 在引用编号前插入书签开始和结束标记
        return `${paraStart}${beforeText}<w:bookmarkStart w:id="${bookmarkId}" w:name="ref-${refId}"/><w:bookmarkEnd w:id="${bookmarkId}"/>${citationText}`;
      });
      existingBookmarks.add(refId);
    }
  }
  
  // 更新 document.xml
  zip.file('word/document.xml', documentXml);
  
  // 重新生成 DOCX buffer
  const newBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return newBuffer;
};

/**
 * 将 Markdown 引用格式转换为 Word 交叉引用格式
 * 处理格式：[[1](#ref-1)] -> Word 交叉引用
 */
const convertCitationsToWordCrossReferences = (html: string): string => {
  // 匹配引用链接格式：[[数字或字符串](#ref-数字或字符串)]
  const citationRegex = /\[\[([^\]]+)\]\(#ref-([^)]+)\)\]/g;
  
  // 替换为 Word 交叉引用格式
  // 使用超链接格式，Word 可以识别并转换为交叉引用
  let processedHtml = html.replace(citationRegex, (match, citationNum, refId) => {
    // 使用 Word 可以识别的超链接格式
    // 添加 superscript 样式使其看起来像上标引用
    return `<a href="#ref-${refId}" style="text-decoration: none; color: #0000FF; vertical-align: super; font-size: 0.83em;">[${citationNum}]</a>`;
  });
  
  // 处理 Vditor IR 模式的链接结构
  // 匹配 <span data-type="a">...<span class="vditor-ir__marker--link">#ref-X</span>...</span>
  const vditorLinkRegex = /<span\s+data-type="a"[^>]*>.*?<span[^>]*class="[^"]*vditor-ir__marker--link[^"]*"[^>]*>(#ref-([^<]+))<\/span>.*?<\/span>/gs;
  
  processedHtml = processedHtml.replace(vditorLinkRegex, (match, refLink, refId) => {
    // 提取引用编号（从链接文本中）
    const linkTextMatch = match.match(/<span[^>]*class="[^"]*vditor-ir__link[^"]*"[^>]*>([^<]+)<\/span>/);
    const citationNum = linkTextMatch ? linkTextMatch[1] : refId;
    
    return `<a href="${refLink}" style="text-decoration: none; color: #0000FF; vertical-align: super; font-size: 0.83em;">[${citationNum}]</a>`;
  });
  
  // 处理普通 <a> 标签中的引用链接（Vditor 渲染后的格式）
  const anchorLinkRegex = /<a\s+href="#ref-([^"]+)"[^>]*>\[([^\]]+)\]<\/a>/g;
  processedHtml = processedHtml.replace(anchorLinkRegex, (match, refId, citationNum) => {
    return `<a href="#ref-${refId}" style="text-decoration: none; color: #0000FF; vertical-align: super; font-size: 0.83em;">[${citationNum}]</a>`;
  });
  
  // 处理参考文献列表中的锚点
  // 将 <div id="ref-X"/> 转换为 Word 可以识别的书签格式
  const anchorRegex = /<div\s+id="ref-([^"]+)"\s*\/>/g;
  processedHtml = processedHtml.replace(anchorRegex, (match, refId) => {
    // 使用 Word 可以识别的书签格式（使用 <a name> 标签）
    return `<a name="ref-${refId}" id="ref-${refId}"></a>`;
  });
  
  return processedHtml;
};

const convertMarkdownToDocxBuffer = async (
  htmlContent: string,
  options?: {
    enableStyleMapping?: boolean;
    styleMapping?: {
      normal?: { fontFamily: string; fontSize: number; lineHeight: number };
      heading1?: { fontFamily: string; fontSize: number; lineHeight: number };
      heading2?: { fontFamily: string; fontSize: number; lineHeight: number };
      heading3?: { fontFamily: string; fontSize: number; lineHeight: number };
      heading4?: { fontFamily: string; fontSize: number; lineHeight: number };
    };
  }
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
  
  // 将HTML中的标题和正文映射到Word样式库（如果启用）
  let styledHtml = enableStyleMapping ? mapHtmlToWordStyles(htmlContent) : htmlContent;
  
  // 处理引用链接，转换为 Word 交叉引用格式
  styledHtml = convertCitationsToWordCrossReferences(styledHtml);
  
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
      }
      .Heading2, h2.Heading2 {
        font-size: ${styleMapping.heading2?.fontSize || 16}pt;
        font-weight: bold;
        color: #000000;
        margin-top: 10pt;
        margin-bottom: 6pt;
        line-height: ${styleMapping.heading2?.lineHeight || 1.2};
        font-family: "${styleMapping.heading2?.fontFamily || 'Microsoft YaHei'}", "SimSun", serif;
      }
      .Heading3, h3.Heading3 {
        font-size: ${styleMapping.heading3?.fontSize || 14}pt;
        font-weight: bold;
        color: #000000;
        margin-top: 8pt;
        margin-bottom: 4pt;
        line-height: ${styleMapping.heading3?.lineHeight || 1.2};
        font-family: "${styleMapping.heading3?.fontFamily || 'Microsoft YaHei'}", "SimSun", serif;
      }
      .Heading4, h4.Heading4 {
        font-size: ${styleMapping.heading4?.fontSize || 12}pt;
        font-weight: bold;
        color: #000000;
        margin-top: 6pt;
        margin-bottom: 4pt;
        line-height: ${styleMapping.heading4?.lineHeight || 1.2};
        font-family: "${styleMapping.heading4?.fontFamily || 'Microsoft YaHei'}", "SimSun", serif;
      }
      .Normal, p.Normal {
        font-size: ${styleMapping.normal?.fontSize || 10.5}pt;
        color: #000000;
        margin-top: 0pt;
        margin-bottom: 6pt;
        line-height: ${styleMapping.normal?.lineHeight || 1.15};
        font-family: "${styleMapping.normal?.fontFamily || 'Microsoft YaHei'}", "SimSun", serif;
      }
      
      /* 代码框样式 - 确保代码显示在带边框和背景的框内 */
      pre, .md-editor-code, pre code, code[class*="language-"] {
        background-color: #f5f5f5 !important;
        border: 1px solid #d0d0d0 !important;
        border-radius: 4px !important;
        padding: 12pt !important;
        margin: 6pt 0 !important;
        font-family: "Consolas", "Monaco", "Courier New", monospace !important;
        font-size: 9pt !important;
        line-height: 1.4 !important;
        color: #333333 !important;
        overflow-x: auto !important;
        white-space: pre !important;
        word-wrap: normal !important;
        display: block !important;
      }
      
      /* 代码块容器 */
      pre {
        margin: 12pt 0 !important;
        padding: 12pt !important;
        background-color: #f5f5f5 !important;
        border: 1px solid #d0d0d0 !important;
        border-radius: 4px !important;
      }
      
      /* 代码块内的code标签 */
      pre code {
        background-color: transparent !important;
        border: none !important;
        padding: 0 !important;
        margin: 0 !important;
        font-size: 9pt !important;
        color: #333333 !important;
        display: block !important;
        white-space: pre !important;
        overflow-x: auto !important;
      }
      
      /* 内联代码样式（保持原有样式，不添加边框） */
      code:not(pre code) {
        background-color: #f0f0f0 !important;
        border: none !important;
        padding: 2pt 4pt !important;
        border-radius: 2px !important;
        font-family: "Consolas", "Monaco", "Courier New", monospace !important;
        font-size: 9pt !important;
        color: #d14 !important;
      }
      
      /* md-editor-code 特定样式 */
      .md-editor-code {
        background-color: #f5f5f5 !important;
        border: 1px solid #d0d0d0 !important;
        border-radius: 4px !important;
        padding: 12pt !important;
        margin: 12pt 0 !important;
      }
      
      .md-editor-code pre {
        margin: 0 !important;
        padding: 0 !important;
        background-color: transparent !important;
        border: none !important;
      }
      
      .md-editor-code pre code {
        background-color: transparent !important;
        border: none !important;
        padding: 0 !important;
      }
      
      /* highlight.js 代码高亮样式兼容 */
      .hljs, code.hljs {
        background-color: #f5f5f5 !important;
        border: 1px solid #d0d0d0 !important;
        border-radius: 4px !important;
        padding: 12pt !important;
        margin: 12pt 0 !important;
      }
    </style>
  `;
  
  const htmlWrapped = `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>Document</title>${wordStyles}</head><body>${styledHtml}</body></html>`;
  const docxBlob = htmlDocx.asBlob(htmlWrapped);
  const arrayBuffer = await docxBlob.arrayBuffer();
  let docxBuffer = Buffer.from(arrayBuffer);
  
  // 后处理：将超链接转换为 Word 交叉引用字段
  try {
    docxBuffer = await convertHyperlinksToWordCrossReferences(docxBuffer);
  } catch (error) {
    logger.warn('转换交叉引用字段失败，使用超链接格式:', error);
  }
  
  return docxBuffer;
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

const applyDocxMetadata = async (buffer: Buffer, meta: DocumentMetaInfo): Promise<Buffer> => {
  const zip = await JSZip.loadAsync(buffer);
  zip.file('docProps/core.xml', buildCorePropertiesXml(meta));
  await ensureCorePropsRegistered(zip);
  const updated = await zip.generateAsync({ type: 'nodebuffer' });
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
      } : undefined;
      const buffer = await convertMarkdownToDocxBuffer(payload.html, docxOptions);
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exporting',
        subMessage: 'agent.reference.progress.addingMetadata',
        percentage: 95,
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
    const buffer = await convertMarkdownToDocxBuffer(payload.html);
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


