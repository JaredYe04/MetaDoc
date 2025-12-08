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

const convertHtmlToPdfBuffer = async (html: string): Promise<Buffer> => {
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
    
    logger.info('开始生成 PDF');
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
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

const convertMarkdownToDocxBuffer = async (htmlContent: string): Promise<Buffer> => {
  // 将HTML中的标题和正文映射到Word样式库
  const styledHtml = mapHtmlToWordStyles(htmlContent);
  
  // 添加CSS样式表，定义Word样式库映射和代码框样式
  // Word在转换HTML时会识别这些样式类名并映射到样式库
  const wordStyles = `
    <style>
      /* Word样式库映射 */
      .Heading1, h1.Heading1 {
        font-size: 18pt;
        font-weight: bold;
        color: #000000;
        margin-top: 12pt;
        margin-bottom: 6pt;
        font-family: "Microsoft YaHei", "SimSun", serif;
      }
      .Heading2, h2.Heading2 {
        font-size: 16pt;
        font-weight: bold;
        color: #000000;
        margin-top: 10pt;
        margin-bottom: 6pt;
        font-family: "Microsoft YaHei", "SimSun", serif;
      }
      .Heading3, h3.Heading3 {
        font-size: 14pt;
        font-weight: bold;
        color: #000000;
        margin-top: 8pt;
        margin-bottom: 4pt;
        font-family: "Microsoft YaHei", "SimSun", serif;
      }
      .Heading4, h4.Heading4 {
        font-size: 12pt;
        font-weight: bold;
        color: #000000;
        margin-top: 6pt;
        margin-bottom: 4pt;
        font-family: "Microsoft YaHei", "SimSun", serif;
      }
      .Normal, p.Normal {
        font-size: 10.5pt;
        color: #000000;
        margin-top: 0pt;
        margin-bottom: 6pt;
        line-height: 1.15;
        font-family: "Microsoft YaHei", "SimSun", serif;
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
  return Buffer.from(arrayBuffer);
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
      await writeTextFile(targetPath, payload.data.md);
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
      sendProgress(mainWindow, {
        message: 'agent.reference.progress.exporting',
        subMessage: 'agent.reference.progress.generatingFile',
        percentage: 90,
        params: { format: 'HTML' }
      });
      const wrapped = wrapHtmlWithTemplate(meta, payload.html);
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
      const buffer = await convertMarkdownToDocxBuffer(payload.html);
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
      const buffer = await convertHtmlToPdfBuffer(htmlDocument);
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
    sendProgress(mainWindow, {
      message: 'agent.reference.progress.exporting',
      subMessage: 'agent.reference.progress.generatingFile',
      percentage: 60,
      params: { format: 'HTML' }
    });
    const wrapped = wrapHtmlWithTemplate(meta, payload.html);
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


