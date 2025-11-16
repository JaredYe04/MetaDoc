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

const logger = createMainLogger('PDFExport');

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

const convertMarkdownToDocxBuffer = async (htmlContent: string): Promise<Buffer> => {
  const htmlWrapped = `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>Document</title></head><body>${htmlContent}</body></html>`;
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

const MARKDOWN_HANDLERS: Record<ExportFormat, ExportHandler> = {
  md: async ({ payload, targetPath }) => {
    await writeTextFile(targetPath, payload.data.md);
  },
  html: async ({ payload, targetPath }) => {
    if (!payload.html) {
      throw new Error('缺少 HTML 数据，无法导出为 HTML');
    }
    const meta = extractDocumentMeta(payload);
    const wrapped = wrapHtmlWithTemplate(meta, payload.html);
    await writeTextFile(targetPath, wrapped);
  },
  docx: async ({ payload, targetPath }) => {
    if (!payload.html) {
      throw new Error('缺少 HTML 数据，无法导出为 DOCX');
    }
    const meta = extractDocumentMeta(payload);
    const buffer = await convertMarkdownToDocxBuffer(payload.html);
    const bufferWithMeta = await applyDocxMetadata(buffer, meta);
    await writeBinaryFile(targetPath, bufferWithMeta);
  },
  pdf: async ({ payload, targetPath }) => {
    logger.info('Markdown -> PDF 导出开始');
    if (!payload.html) {
      logger.error('缺少 HTML 数据');
      throw new Error('缺少 HTML 数据，无法导出为 PDF');
    }
    logger.info(`HTML 数据长度: ${payload.html.length}`);
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
    try {
      const buffer = await convertHtmlToPdfBuffer(htmlDocument);
      logger.info(`PDF Buffer 生成完成，大小: ${buffer.length}`);
      const updated = await applyPdfMetadata(buffer, meta);
      logger.info('元数据应用完成');
      await writeBinaryFile(targetPath, updated);
      logger.info(`PDF 文件写入完成: ${targetPath}`);
    } catch (error) {
      logger.error('PDF 导出过程中出错:', error);
      throw error;
    }
  },
  tex: async ({ payload, targetPath }) => {
    await writeTextFile(targetPath, payload.data.tex);
  },
  json: async () => {
    throw new Error('Markdown 文档不支持导出为 JSON');
  },
};

const LATEX_HANDLERS: Partial<Record<ExportFormat, ExportHandler>> = {
  tex: async ({ payload, targetPath }) => {
    await writeTextFile(targetPath, payload.data.tex);
  },
  pdf: async ({ payload, targetPath, mainWindow }) => {
    const meta = extractDocumentMeta(payload);
    await ensureParentDirectory(targetPath);
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
      throw new Error(message);
    }

    if (compileResult.pdfPath !== targetPath) {
      await fs.promises.copyFile(compileResult.pdfPath, targetPath);
    }

    await writePdfMetadataToFile(targetPath, meta);
  },
  md: async ({ payload, targetPath }) => {
    await writeTextFile(targetPath, payload.data.md);
  },
  html: async ({ payload, targetPath }) => {
    if (!payload.html) {
      throw new Error('缺少 HTML 数据，无法导出为 HTML');
    }
    const meta = extractDocumentMeta(payload);
    const wrapped = wrapHtmlWithTemplate(meta, payload.html);
    await writeTextFile(targetPath, wrapped);
  },
  docx: async ({ payload, targetPath }) => {
    if (!payload.html) {
      throw new Error('缺少 HTML 数据，无法导出为 DOCX');
    }
    const meta = extractDocumentMeta(payload);
    const buffer = await convertMarkdownToDocxBuffer(payload.html);
    const bufferWithMeta = await applyDocxMetadata(buffer, meta);
    await writeBinaryFile(targetPath, bufferWithMeta);
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
    
    const dialogResult = await dialog.showSaveDialog(mainWindow || undefined, {
      title: t('main.dialogs.exportDocumentTitle'),
      defaultPath: defaultFileName,
      filters,
    });

    if (dialogResult.canceled || !dialogResult.filePath) {
      return { success: false };
    }

    const handler = EXPORT_HANDLER_MAP[payload.sourceFormat]?.[payload.targetFormat];
    if (!handler) {
      return {
        success: false,
        error: t('main.dialogs.exportNotSupported', '不支持的导出格式'),
      };
    }

    const targetPath = enforceExtension(dialogResult.filePath, payload.targetFormat);
    await handler({
      payload,
      targetPath,
      mainWindow,
    });

    // 导出完成后，清理中间图片文件（仅对 PDF 和 DOCX）
    // HTML 和 TEX 需要保留图片文件，因为它们会引用图片地址
    if (payload.imageUrls && payload.imageUrls.length > 0) {
      if (payload.targetFormat === 'pdf' || payload.targetFormat === 'docx') {
        await cleanupIntermediateImages(payload.imageUrls);
      }
    }

    return {
      success: true,
      path: targetPath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};


