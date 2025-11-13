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
  local2image,
} from '../utils/md-utils';
import type { WorkspaceDocument } from '../stores/workspace';

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

  const serialized = serializeDocument(doc);
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

  if (['html', 'docx', 'pdf', 'md'].includes(targetFormat)) {
    markdown = await local2image(markdown);
  }

  if (['html', 'docx'].includes(targetFormat)) {
    markdown = await image2base64(markdown);
  }

  let html = '';
  if (targetFormat === 'docx') {
    html = await ConvertMarkdownToHtmlVditor(markdown);
  } else if (targetFormat === 'pdf') {
    html = await ConvertHtmlForPdf(markdown);
  } else if (targetFormat === 'html') {
    html = await ConvertMarkdownToHtmlManually(markdown);
  } else if (targetFormat === 'md') {
    html = await ConvertMarkdownToHtmlManually(markdown);
  } else if (targetFormat === 'tex') {
    html = ''; // 不需要
  }

  return {
    ...base,
    html,
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


