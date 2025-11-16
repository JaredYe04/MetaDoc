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
      console.warn('图表预渲染失败，继续使用原始 Markdown:', error);
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
  if (['html', 'docx'].includes(targetFormat)) {
    // 对 DOCX：将数学公式渲染为位图图片（仅 DOCX 需要）
    if (targetFormat === 'docx') {
      try {
        //logger.debug(`renderMarkdownMathToImages start`);
        markdown = await renderMarkdownMathToImages(markdown, 'png');
        //logger.debug(`renderMarkdownMathToImages end`);
      } catch (e) {
        logger.error('数学公式转图片失败，保留原文:', e);
      }
      // DOCX 需要将图片转换为 base64
    markdown = await image2base64(markdown);
    }
    // HTML 格式保持 HTTP URL，不需要转换为 base64
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
  const imageUrls: string[] = [];
  if (['html', 'docx', 'pdf', 'tex'].includes(targetFormat)) {
    // 从 markdown 中提取所有图片 URL
    const imageRegex = /!\[.*?\]\((http:\/\/localhost:52521\/images\/[^)]+)\)/g;
    let match;
    while ((match = imageRegex.exec(markdown)) !== null) {
      imageUrls.push(match[1]);
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


