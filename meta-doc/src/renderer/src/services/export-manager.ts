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
import eventBus from '../utils/event-bus';
import { useI18n } from 'vue-i18n';
import { exportAdapterRegistry, type ExportOptions } from './export-adapters';
import { loadExportOptions, mergeExportOptions } from './export-adapters/storage';
import { processMarkdownImages, processHtmlImages, extractImageUrls, extractImageUrlsFromHtml, type ImageProcessingMode } from './image-processor';

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
  // 注意：适配器的 prepareExportData 主要用于处理选项相关的逻辑
  // 实际的转换逻辑仍然使用原有代码，但会根据选项进行调整
  try {
    // 对于需要HTML的格式，执行原有的转换逻辑
    let html = '';
    let tex = '';
    let markdown = base.data.md;
    let imageUrls: string[] = [];

    if (sourceFormat === 'md') {
      markdown = await prepareMarkdownForExport(markdown, targetFormat, handle, doc);
      
      // 收集预渲染生成的图片 URL
      const originalImageUrls = new Set<string>();
      if (['html', 'docx', 'pdf', 'tex'].includes(targetFormat)) {
        const originalImageRegex = /!\[.*?\]\((.*?)\)/g;
        let match;
        while ((match = originalImageRegex.exec(base.data.md)) !== null) {
          const imagePath = match[1];
          if (imagePath.startsWith('http://localhost:52521/images/')) {
            originalImageUrls.add(imagePath);
          } else if (!imagePath.startsWith('data:image/')) {
            const fileName = imagePath.split(/[/\\]/).pop() || imagePath;
            originalImageUrls.add(`http://localhost:52521/images/${fileName}`);
          }
        }
      }

      // 根据导出选项处理图片
      if (targetFormat === 'html' || targetFormat === 'md' || targetFormat === 'tex') {
        const imageProcessing = (finalOptions as any)?.imageProcessing as ImageProcessingMode | undefined;
        if (imageProcessing) {
          markdown = await processMarkdownImages(markdown, imageProcessing, targetFormat);
        }
      }

      if (targetFormat === 'docx') {
        html = await ConvertMarkdownToHtmlVditor(markdown);
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
        const { convertMarkdownToLatex } = await import('../utils/latex-utils');
        const title = doc.meta?.title || 'Generated Document';
        tex = await convertMarkdownToLatex(markdown, title);
      }

      // 收集预渲染生成的图片 URL
      if (['html', 'docx', 'pdf', 'tex'].includes(targetFormat)) {
        const imageRegex = /!\[.*?\]\((http:\/\/localhost:52521\/images\/[^)]+)\)/g;
        let match;
        while ((match = imageRegex.exec(markdown)) !== null) {
          const imageUrl = match[1];
          if (!originalImageUrls.has(imageUrl)) {
            imageUrls.push(imageUrl);
          }
        }
      }
    } else if (sourceFormat === 'tex') {
      if (targetFormat === 'tex' || targetFormat === 'pdf') {
        // LaTeX 导出不需要转换
        return {
          ...base,
          exportOptions: finalOptions,
        };
      }

      const markdownFromTex = convertLatexToMarkdown(doc.tex ?? base.data.tex ?? '');
      let processedMarkdown = markdownFromTex;
      if (['html', 'docx', 'pdf'].includes(targetFormat)) {
        processedMarkdown = await local2image(processedMarkdown);
      }
      if (['html', 'docx'].includes(targetFormat)) {
        processedMarkdown = await image2base64(processedMarkdown);
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
      // 将导出选项附加到payload中，以便main进程使用
      exportOptions: finalOptions,
    };
  } catch (error) {
    logger.error('准备导出数据失败，回退到原有逻辑:', error);
    return await prepareExportPayloadLegacy(doc, targetFormat, explicitName, requestId, handle);
  }
};

/**
 * 原有的导出准备逻辑（作为回退）
 */
const prepareExportPayloadLegacy = async (
  doc: WorkspaceDocument,
  targetFormat: ExportFormat,
  explicitName: string | undefined,
  requestId: string,
  handle: any,
): Promise<BaseExportPayload> => {
  const sourceFormat = (doc.format ?? 'md') as DocumentFormat;
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

  switch (sourceFormat) {
    case 'md':
      return await prepareMarkdownExports(base, doc, targetFormat, handle);
    case 'tex':
      return await prepareLatexExports(base, doc, targetFormat, handle);
    case 'json':
      return await prepareJsonExports(base, targetFormat, handle);
    default:
      throw new Error(`未知的文档格式: ${String(sourceFormat)}`);
  }
};

/**
 * 准备Markdown用于导出（提取的公共逻辑）
 */
const prepareMarkdownForExport = async (
  markdown: string,
  targetFormat: ExportFormat,
  handle: any,
  doc: WorkspaceDocument,
): Promise<string> => {
  const logger = createRendererLogger('ExportManager');
  let processedMarkdown = filterMetaDataFromMd(markdown);

  // 记录原始 markdown 中的图片
  const originalImageUrls = new Set<string>();
  if (['html', 'docx', 'pdf', 'tex'].includes(targetFormat)) {
    const originalImageRegex = /!\[.*?\]\((.*?)\)/g;
    let match;
    while ((match = originalImageRegex.exec(processedMarkdown)) !== null) {
      const imagePath = match[1];
      if (imagePath.startsWith('http://localhost:52521/images/')) {
        originalImageUrls.add(imagePath);
      } else if (!imagePath.startsWith('data:image/')) {
        const fileName = imagePath.split(/[/\\]/).pop() || imagePath;
        originalImageUrls.add(`http://localhost:52521/images/${fileName}`);
      }
    }
  }

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

  // 将数学公式转换为图片
  if (['html', 'docx', 'pdf'].includes(targetFormat)) {
    try {
      const imageFormat = targetFormat === 'docx' ? 'png' : 'svg';
      logger.debug(`renderMarkdownMathToImages start, format: ${imageFormat}`);
      processedMarkdown = await renderMarkdownMathToImages(processedMarkdown, imageFormat);
      logger.debug(`renderMarkdownMathToImages end`);
    } catch (e) {
      logger.error('数学公式转图片失败，保留原文:', e);
    }
  }

  // 后处理图片路径
  processedMarkdown = await postProcessMarkdownImages(processedMarkdown, targetFormat);

  return processedMarkdown;
};


const postProcessMarkdownImages = async (markdown: string, targetFormat: ExportFormat) => {
  // 注意：图片处理现在由导出选项控制，这个函数保留用于向后兼容
  // 对于使用适配器的导出，图片处理已经在 prepareExportPayload 中根据选项处理
  // 这里只处理不使用适配器的情况（向后兼容）
  
  // 根据导出格式处理图片路径
  if (targetFormat === 'tex') {
    // LaTeX 导出需要本地文件路径
    markdown = await image2local(markdown);
  } else {
    // 其他格式（html, docx, pdf）需要 HTTP URL
    markdown = await local2image(markdown);
  }
  // DOCX 需要将图片内联嵌入，确保文件独立
  // HTML 不需要在这里转换，ConvertMarkdownToHtmlManually 会在渲染后处理
  if (targetFormat === 'docx') {
    markdown = await image2base64(markdown);
  }
  return markdown;
}
const prepareMarkdownExports = async (
  base: BaseExportPayload,
  doc: WorkspaceDocument,
  targetFormat: ExportFormat,
  handle: any,
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
      handle.mark(5, { message: 'agent.reference.progress.preRenderingCharts', subMessage: 'agent.reference.progress.preparingExport' })
      markdown = await preRenderAllCharts(markdown, '', chartFormat, (progress: any) => {
        const percent = Math.min(80, progress?.percentage ?? 0);
        handle.mark(percent, {
          message: progress?.message ?? 'agent.reference.progress.preRenderingCharts',
          subMessage: progress?.subMessage ?? 'agent.reference.progress.preparingExport',
          params: progress?.params,
          status: progress?.status as any
        });
      });
      logger.debug(`preRenderAllCharts end`);
      handle.mark(80, { message: 'agent.reference.progress.preRenderingCharts' })
    } catch (error) {
      logger.warn('图表预渲染失败，继续使用原始 Markdown:', error);
      handle.mark(5, {
        message: '图表预渲染失败',
        subMessage: error instanceof Error ? error.message : String(error),
        status: 'warning'
      });
    }


  }
  // 对于需要生成HTML的格式（html, docx, pdf），将数学公式转换为图片
  if (['html', 'docx', 'pdf'].includes(targetFormat)) {
    try {
      const imageFormat = targetFormat === 'docx' ? 'png' : 'svg';
      logger.debug(`renderMarkdownMathToImages start, format: ${imageFormat}`);
      markdown = await renderMarkdownMathToImages(markdown, imageFormat);
      logger.debug(`renderMarkdownMathToImages end`);
    } catch (e) {
      logger.error('数学公式转图片失败，保留原文:', e);
    }
    // PDF 保持 HTTP URL，不需要转换为 base64（PDF导出时会处理）
  }
  // 后处理图片路径（根据导出选项）
  // 注意：这里不再自动处理图片，而是根据导出选项来决定
  // 图片处理逻辑已经在 prepareExportPayload 中根据选项处理了



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
    requestId: base.requestId,
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
  _handle: any,
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
  _handle: any,
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


