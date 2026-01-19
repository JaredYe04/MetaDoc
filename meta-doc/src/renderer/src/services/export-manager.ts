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
  embedImagesInline,
  local2fileProtocol,
  local2httpProtocol,
} from '../utils/md-utils';
import { preRenderAllCharts } from '../utils/chart-pre-renderer';
import type { WorkspaceDocument } from '../stores/workspace';
import { createRendererLogger } from '../utils/logger.js';
import { renderMarkdownMathToImages } from '../utils/math-renderer.js';
import { exportAdapterRegistry, type ExportOptions } from './export-adapters';
import { loadExportOptions, mergeExportOptions } from './export-adapters/storage';
import { processMarkdownImages, processHtmlImages, type ImageProcessingMode } from './image-processor';
import { prepareExportPayloadLegacy } from './export-manager.obsolete';

export interface BaseExportPayload {
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
  exportOptions?: ExportOptions; // 导出选项，传递给main进程
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
  exportOptions?: ExportOptions,
): Promise<BaseExportPayload> => {
  const { default: localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer')
  const { webMainCalls } = await import('../utils/web-adapter/web-main-calls')
  const ipcRenderer = (window as any)?.electron?.ipcRenderer ?? (webMainCalls(), localIpcRenderer)
  const { createProgressHandle } = await import('../utils/progress-handle')

  const requestId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const handle = createProgressHandle({
    requestId,
    message: 'agent.reference.progress.preparingExport',
    initialPercentage: 0,
    onCancel: () => {
      try {
        ipcRenderer?.invoke?.('cancel-export-task', requestId)
      } catch (err) {
        // ignore
      }
    }
  })

  const sourceFormat = (doc.format ?? 'md') as DocumentFormat;
  const descriptor = getExportTargets(sourceFormat).find((item) => item.format === targetFormat);

  if (!descriptor) {
    throw new Error(`不支持 ${sourceFormat} 导出为 ${targetFormat}`);
  }

  const logger = createRendererLogger('ExportManager');
  
  // 获取适配器
  const adapter = exportAdapterRegistry.get(sourceFormat, targetFormat);
  if (!adapter) {
    // 如果没有适配器，回退到原有逻辑
    logger.warn(`未找到适配器 ${sourceFormat}->${targetFormat}，使用原有导出逻辑`);
    return await prepareExportPayloadLegacy(doc, targetFormat, explicitName, requestId, handle);
  }

  // 获取并合并导出选项
  const defaultOptions = adapter.getDefaultOptions();
  const savedOptions = loadExportOptions(sourceFormat, targetFormat);
  const mergedOptions = mergeExportOptions(defaultOptions, savedOptions);
  const finalOptions = exportOptions ? mergeExportOptions(mergedOptions, exportOptions) : mergedOptions;

  const serialized = await serializeDocument(doc);
  const suggestedName = explicitName && explicitName.trim().length > 0
    ? explicitName.trim()
    : inferDocumentName(doc);

  const base: BaseExportPayload = {
    sourceFormat,
    targetFormat,
    suggestedName,
    sourcePath: doc.path,
    requestId,
    data: {
      md: serialized.md,
      json: serialized.json,
      tex: serialized.tex,
    },
  };

  if (descriptor.status === 'planned') {
    throw new NotImplementedExportError(sourceFormat, targetFormat);
  }

  // 使用适配器准备导出数据
  try {
    let html = '';
    let tex = '';
    let markdown = base.data.md;
    let imageUrls: string[] = [];

    if (sourceFormat === 'md') {
      // 预处理Markdown：过滤元数据、预渲染图表、转换数学公式
      markdown = await prepareMarkdownForExport(markdown, targetFormat, handle, doc);
      
      // 收集原始markdown中的图片URL（用于区分原始图片和预渲染生成的图片）
      const originalImageUrls = collectOriginalImageUrls(base.data.md);

      // 根据导出选项处理图片
      if (targetFormat === 'html' || targetFormat === 'md' || targetFormat === 'tex') {
        const imageProcessing = (finalOptions as any)?.imageProcessing as ImageProcessingMode | undefined;
        if (imageProcessing) {
          markdown = await processMarkdownImages(markdown, imageProcessing, targetFormat, doc.path);
        }
      }

      // 根据目标格式生成HTML或LaTeX
      if (targetFormat === 'docx') {
        // DOCX导出需要将图片转换为base64格式，以便内嵌到文档中
        let markdownWithBase64Images = await embedImagesInline(markdown);
        // 调整图片尺寸以适应页面大小
        markdownWithBase64Images = await resizeImagesForDocx(markdownWithBase64Images);
        html = await ConvertMarkdownToHtmlVditor(markdownWithBase64Images);
      } else if (targetFormat === 'pdf') {
        html = await ConvertHtmlForPdf(markdown);
      } else if (targetFormat === 'html') {
        html = await ConvertMarkdownToHtmlManually(markdown);
        // 对于 HTML，如果选择 Base64 模式，需要处理 HTML 中的图片
        const imageProcessing = (finalOptions as any)?.imageProcessing as ImageProcessingMode | undefined;
        if (imageProcessing === 'base64') {
          html = await processHtmlImages(html, 'base64');
        }
      } else if (targetFormat === 'tex') {
        tex = await convertMarkdownToLatexWithOptions(markdown, doc, base.data.json, finalOptions);
      }

      // 收集预渲染生成的图片 URL（排除原始图片）
      imageUrls = collectRenderedImageUrls(markdown, originalImageUrls);
    } else if (sourceFormat === 'tex') {
      if (targetFormat === 'tex' || targetFormat === 'pdf') {
        // LaTeX 导出不需要转换
        return {
          ...base,
          exportOptions: finalOptions,
        };
      }

      // LaTeX转其他格式：先转为Markdown，然后按照Markdown导出流程处理
      const markdownFromTex = convertLatexToMarkdown(doc.tex ?? base.data.tex ?? '');
      let processedMarkdown = markdownFromTex;
      if (['html', 'docx', 'pdf'].includes(targetFormat)) {
        processedMarkdown = await local2httpProtocol(processedMarkdown, doc.path);
        processedMarkdown = await local2fileProtocol(processedMarkdown, doc.path);
      }
      if (['html', 'docx'].includes(targetFormat)) {
        processedMarkdown = await embedImagesInline(processedMarkdown);
      }
      if (targetFormat === 'docx') {
        html = await ConvertMarkdownToHtmlVditor(processedMarkdown);
      } else if (targetFormat === 'html') {
        html = await ConvertMarkdownToHtmlManually(processedMarkdown);
      }
      markdown = processedMarkdown;
    }

    return {
      ...base,
      html,
      data: {
        ...base.data,
        md: markdown,
        json: base.data.json,
        tex: tex || base.data.tex,
      },
      imageUrls,
      exportOptions: finalOptions,
    };
  } catch (error) {
    logger.error('准备导出数据失败，回退到原有逻辑:', error);
    return await prepareExportPayloadLegacy(doc, targetFormat, explicitName, requestId, handle);
  }
};

/**
 * 准备Markdown用于导出（预处理：过滤元数据、预渲染图表、转换数学公式）
 */
const prepareMarkdownForExport = async (
  markdown: string,
  targetFormat: ExportFormat,
  handle: any,
  doc: WorkspaceDocument,
): Promise<string> => {
  const logger = createRendererLogger('ExportManager');
  let processedMarkdown = filterMetaDataFromMd(markdown);

  // 预渲染图表
  if (['html', 'docx', 'pdf', 'tex'].includes(targetFormat)) {
    const chartFormat = (targetFormat === 'docx') ? 'bitmap' : 'svg';
    try {
      logger.debug(`preRenderAllCharts start`);
      handle.mark(5, { message: 'agent.reference.progress.preRenderingCharts', subMessage: 'agent.reference.progress.preparingExport' });
      processedMarkdown = await preRenderAllCharts(processedMarkdown, '', chartFormat, (progress: any) => {
        const percent = Math.min(80, progress?.percentage ?? 0);
        handle.mark(percent, {
          message: progress?.message ?? 'agent.reference.progress.preRenderingCharts',
          subMessage: progress?.subMessage ?? 'agent.reference.progress.preparingExport',
          params: progress?.params,
          status: progress?.status as any
        });
      });
      logger.debug(`preRenderAllCharts end`);
      handle.mark(80, { message: 'agent.reference.progress.preRenderingCharts' });
    } catch (error) {
      logger.warn('图表预渲染失败，继续使用原始 Markdown:', error);
      handle.mark(5, {
        message: '图表预渲染失败',
        subMessage: error instanceof Error ? error.message : String(error),
        status: 'warning'
      });
    }
  }


  const mathToImageFormats=['html'];//只转换html，docx和pdf已经转换
  // 将数学公式转换为图片
  if (mathToImageFormats.includes(targetFormat)) {
    try {
      processedMarkdown = await renderMarkdownMathToImages(processedMarkdown, 'svg');
    } catch (e) {
      logger.error('数学公式转图片失败，保留原文:', e);
    }
  }

  // 处理图片路径（转换为HTTP URL格式，以便后续处理）
  processedMarkdown = await local2httpProtocol(processedMarkdown, doc.path);
  processedMarkdown = await local2fileProtocol(processedMarkdown, doc.path);
  return processedMarkdown;
};

/**
 * 收集原始markdown中的图片URL（用于区分原始图片和预渲染生成的图片）
 */
const collectOriginalImageUrls = (markdown: string): Set<string> => {
  const originalImageUrls = new Set<string>();
  const originalImageRegex = /!\[.*?\]\((.*?)\)/g;
  let match;
  while ((match = originalImageRegex.exec(markdown)) !== null) {
    const imagePath = match[1];
    if (imagePath.startsWith('http://localhost:52521/images/')) {
      originalImageUrls.add(imagePath);
    } else if (!imagePath.startsWith('data:image/')) {
      const fileName = imagePath.split(/[/\\]/).pop() || imagePath;
      originalImageUrls.add(`http://localhost:52521/images/${fileName}`);
    }
  }
  return originalImageUrls;
};

/**
 * 收集预渲染生成的图片URL（排除原始图片）
 */
const collectRenderedImageUrls = (markdown: string, originalImageUrls: Set<string>): string[] => {
  const imageUrls: string[] = [];
  const imageRegex = /!\[.*?\]\((http:\/\/localhost:52521\/images\/[^)]+)\)/g;
  let match;
  while ((match = imageRegex.exec(markdown)) !== null) {
    const imageUrl = match[1];
    if (!originalImageUrls.has(imageUrl)) {
      imageUrls.push(imageUrl);
    }
  }
  return imageUrls;
};

/**
 * 调整DOCX导出时的图片尺寸标记（不实际缩放图片，保持原始质量）
 * A4页面：210mm × 297mm，页边距上下左右各0.5英寸
 * 可用区域：约523pt × 770pt ≈ 697px × 1026px (96 DPI)
 * 使用稍小的值以确保安全：680px × 1000px
 * 
 * 注意：不实际缩放图片，而是通过添加HTML属性来控制显示尺寸
 * 这样html-to-docx会使用原始图片质量，只是限制显示尺寸
 */
const resizeImagesForDocx = async (markdown: string): Promise<string> => {
  // DOCX导出时，图片会在HTML阶段处理，这里不需要实际缩放
  // 保持原始图片质量，在HTML转换阶段通过CSS控制尺寸
  // 这个函数现在只返回原始markdown，不做任何处理
  return markdown;
};

/**
 * 将Markdown转换为LaTeX（带导出选项）
 */
const convertMarkdownToLatexWithOptions = async (
  markdown: string,
  doc: WorkspaceDocument,
  jsonData: string,
  exportOptions: ExportOptions,
): Promise<string> => {
  const { convertMarkdownToLatex } = await import('../utils/latex-utils');
  const { removeAllTitlePrefixes, generateMarkdownFromOutlineTree } = await import('../utils/document/outline');
  const title = doc.meta?.title || 'Generated Document';
  
  // 提取文档元信息
  let meta: any = {};
  try {
    const parsed = JSON.parse(jsonData || '{}');
    meta = parsed?.current_article_meta_data || {};
  } catch {
    // 忽略解析错误
  }
  
  // 如果启用了自动去除标题前缀选项，则处理大纲树
  let processedMarkdown = markdown;
  const latexOptions = exportOptions as any;
  if (latexOptions?.removeTitlePrefixes !== false && doc.outline) {
    // 深拷贝大纲树并移除标题前缀
    const modifiedOutline = removeAllTitlePrefixes(doc.outline);
    // 从修改后的大纲树重新生成 Markdown
    processedMarkdown = generateMarkdownFromOutlineTree(modifiedOutline);
  }
  
  // 传递导出选项和元信息
  const finalLatexOptions = {
    ...exportOptions,
    meta: {
      title: meta.title || title,
      author: meta.author || '',
      description: meta.description || '',
      keywords: Array.isArray(meta.keywords) ? meta.keywords : [],
    },
  };
  
  return await convertMarkdownToLatex(processedMarkdown, title, finalLatexOptions);
};

/**
 * 推断文档名称
 */
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


