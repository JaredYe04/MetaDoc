import type { DocumentFormat, ExportFormat } from '../../../types';
import type { ExportTargetDescriptor } from '../../../common/export-rules';
import { getExportTargets } from '../../../common/export-rules';
import { serializeDocument } from './document-serializer';
import { convertLatexToMarkdown } from '../utils/latex-utils';
import {
  ConvertHtmlForPdf,
  ConvertMarkdownToHtmlManually,
  ConvertMarkdownToHtmlVditor,
  filterMetaDataFromMd,
  image2base64,
  image2local,
  local2image,
} from '../utils/md-utils';
import { preRenderAllCharts } from '../utils/chart-pre-renderer';
import type { WorkspaceDocument } from '../stores/workspace';
import { createRendererLogger } from '../utils/logger.js';
import { renderMarkdownMathToImages } from '../utils/math-renderer.js';

export interface BaseExportPayload {
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

export class NotImplementedExportError extends Error {
  constructor(sourceFormat: DocumentFormat, targetFormat: ExportFormat) {
    super(`Export from ${sourceFormat} to ${targetFormat} is not implemented yet.`);
    this.name = 'NotImplementedExportError';
  }
}

export const getExportOptions = (format: DocumentFormat): ExportTargetDescriptor[] => {
  return getExportTargets(format);
};

export const prepareExportPayload = async (
  doc: WorkspaceDocument,
  targetFormat: ExportFormat,
  explicitName?: string,
): Promise<BaseExportPayload> => {
  const sourceFormat = (doc.format ?? 'md') as DocumentFormat;
  const descriptor = getExportTargets(sourceFormat).find((item) => item.format === targetFormat);

  if (!descriptor) {
    throw new Error(`不支持 ${sourceFormat} 导出为 ${targetFormat}`);
  }

  const serialized = await serializeDocument(doc);
  const suggestedName = explicitName && explicitName.trim().length > 0
    ? explicitName.trim()
    : inferDocumentName(doc);

  const base: BaseExportPayload = {
    sourceFormat,
    targetFormat,
    suggestedName,
    sourcePath: doc.path,
    data: {
      md: serialized.md,
      json: serialized.json,
      tex: serialized.tex,
    },
  };

  if (descriptor.status === 'planned') {
    throw new NotImplementedExportError(sourceFormat, targetFormat);
  }

  switch (sourceFormat) {
    case 'md':
      return await prepareMarkdownExports(base, doc, targetFormat);
    case 'tex':
      return await prepareLatexExports(base, doc, targetFormat);
    case 'json':
      return await prepareJsonExports(base, targetFormat);
    default:
      throw new Error(`未知的文档格式: ${String(sourceFormat)}`);
  }
};

const prepareMarkdownExports = async (
  base: BaseExportPayload,
  doc: WorkspaceDocument,
  targetFormat: ExportFormat,
): Promise<BaseExportPayload> => {
  let markdown = filterMetaDataFromMd(base.data.md);
  const logger = createRendererLogger('ExportManager');
  //logger.debug(`targetFormat: ${targetFormat}`);
  
  // 记录原始 markdown 中的图片，用于区分用户原本引用的图片和预渲染生成的图片
  const originalImageUrls = new Set<string>();
  if (['html', 'docx', 'pdf', 'tex'].includes(targetFormat)) {
    // 提取原始 markdown 中的所有图片 URL（可能是本地路径或 HTTP URL）
    const originalImageRegex = /!\[.*?\]\((.*?)\)/g;
    let match;
    while ((match = originalImageRegex.exec(markdown)) !== null) {
      const imagePath = match[1];
      // 如果是 HTTP URL，直接记录
      if (imagePath.startsWith('http://localhost:52521/images/')) {
        originalImageUrls.add(imagePath);
      }
      // 如果是本地路径，转换为 HTTP URL 格式后记录（用于后续比较）
      else if (!imagePath.startsWith('data:image/')) {
        // 提取文件名
        const fileName = imagePath.split(/[/\\]/).pop() || imagePath;
        originalImageUrls.add(`http://localhost:52521/images/${fileName}`);
      }
    }
  }
  
  // 对于所有需要生成 HTML 的格式，先预渲染所有图表
  if (['html', 'docx', 'pdf', 'tex'].includes(targetFormat)) {
    // 先预渲染图表（统一处理，不依赖 Vditor）
    // 图表会被转换为本地图片 URL，这样在导出时就不需要依赖 Vditor 的渲染
    // Word 导出使用位图，其他格式使用矢量图
    const chartFormat = (targetFormat === 'docx') ? 'bitmap' : 'svg';
    try {
      logger.debug(`preRenderAllCharts start`);
      markdown = await preRenderAllCharts(markdown, '', chartFormat);
      logger.debug(`preRenderAllCharts end`);
    } catch (error) {
      logger.warn('图表预渲染失败，继续使用原始 Markdown:', error);
    }

    // 根据导出格式处理图片路径
    if (targetFormat === 'tex') {
      // LaTeX 导出需要本地文件路径
      markdown = await image2local(markdown);
    } else {
      // 其他格式（html, docx, pdf）需要 HTTP URL
    markdown = await local2image(markdown);
    }
  }
    if (targetFormat === 'docx') {
      try {
        const imageFormat = targetFormat === 'docx' ? 'png' : 'svg';
        logger.debug(`renderMarkdownMathToImages start, format: ${imageFormat}`);
        markdown = await renderMarkdownMathToImages(markdown, imageFormat);
        logger.debug(`renderMarkdownMathToImages end`);
      } catch (e) {
        logger.error('数学公式转图片失败，保留原文:', e);
      }
      // DOCX 需要将图片转换为 base64
      if (targetFormat === 'docx') {
    markdown = await image2base64(markdown);
      }
      // PDF 保持 HTTP URL，不需要转换为 base64
    }

  let html = '';
  let tex = '';
  if (targetFormat === 'docx') {
    html = await ConvertMarkdownToHtmlVditor(markdown);
  } else if (targetFormat === 'pdf') {
    html = await ConvertHtmlForPdf(markdown);
  } else if (targetFormat === 'html') {
    html = await ConvertMarkdownToHtmlManually(markdown);
  } else if (targetFormat === 'md') {
    html = await ConvertMarkdownToHtmlManually(markdown);
  } else if (targetFormat === 'tex') {
            // Markdown 转 LaTeX，图表已经预渲染为图片 URL
            const { convertMarkdownToLatex } = await import('../utils/latex-utils');
            const title = doc.meta?.title || 'Generated Document';
            tex = await convertMarkdownToLatex(markdown, title);
          }

  // 收集预渲染生成的图片 URL（用于后续清理）
  // 只收集那些不在原始图片列表中的 URL，即预渲染生成的图片
  const imageUrls: string[] = [];
  if (['html', 'docx', 'pdf', 'tex'].includes(targetFormat)) {
    // 从 markdown 中提取所有图片 URL
    const imageRegex = /!\[.*?\]\((http:\/\/localhost:52521\/images\/[^)]+)\)/g;
    let match;
    while ((match = imageRegex.exec(markdown)) !== null) {
      const imageUrl = match[1];
      // 只收集预渲染生成的图片（不在原始图片列表中的）
      if (!originalImageUrls.has(imageUrl)) {
        imageUrls.push(imageUrl);
        logger.debug(`收集预渲染生成的图片: ${imageUrl}`);
      } else {
        logger.debug(`跳过用户原本引用的图片: ${imageUrl}`);
      }
    }
  }

  return {
    ...base,
    html,
    data: {
      ...base.data,
      md: markdown,
      tex: tex || base.data.tex,
    },
    // 保存图片 URL 用于清理
    imageUrls,
  };
};

const prepareLatexExports = async (
  base: BaseExportPayload,
  doc: WorkspaceDocument,
  targetFormat: ExportFormat,
): Promise<BaseExportPayload> => {
  if (targetFormat === 'tex' || targetFormat === 'pdf') {
    return base;
  }

  const markdownFromTex = convertLatexToMarkdown(doc.tex ?? base.data.tex ?? '');
  const updatedBase: BaseExportPayload = {
    ...base,
    data: {
      ...base.data,
      md: markdownFromTex,
    },
  };

  if (targetFormat === 'md') {
    return updatedBase;
  }

  let markdown = markdownFromTex;
  if (['html', 'docx', 'pdf'].includes(targetFormat)) {
    markdown = await local2image(markdown);
  }

  if (['html', 'docx'].includes(targetFormat)) {
    markdown = await image2base64(markdown);
  }

  let html = '';
  if (targetFormat === 'docx') {
    html = await ConvertMarkdownToHtmlVditor(markdown);
  } else if (targetFormat === 'html') {
    html = await ConvertMarkdownToHtmlManually(markdown);
  }

  return {
    ...updatedBase,
    html,
  };
};

const prepareJsonExports = async (
  base: BaseExportPayload,
  targetFormat: ExportFormat,
): Promise<BaseExportPayload> => {
  if (targetFormat === 'json') {
    return base;
  }

  throw new NotImplementedExportError(base.sourceFormat, targetFormat);
};

const inferDocumentName = (doc: WorkspaceDocument): string => {
  const title = doc.meta?.title?.trim();
  if (title) {
    return title;
  }

  if (doc.path) {
    const segments = doc.path.split(/[/\\]+/).filter(Boolean);
    if (segments.length > 0) {
      return segments[segments.length - 1];
    }
  }

  return 'Untitled';
};


