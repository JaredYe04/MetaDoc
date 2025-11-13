import { BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import htmlDocx from 'html-docx-js';
import type { DocumentFormat, ExportFormat } from '../../types';
import type { LaTeXCompileResult } from '../../types/utils';
import { getExportTargets } from '../../common/export-rules';
import { t } from '../i18n';
import { compileLatexToPDF } from '../utils';

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
  const waitForRenderComplete = async (
    win: BrowserWindow,
    timeout = 10000,
    interval = 500,
  ): Promise<void> => {
    const maxTries = Math.ceil(timeout / interval);
    let lastHTML = '';
    let stableCount = 0;
    const requiredStableCount = 2;

    for (let i = 0; i < maxTries; i++) {
      try {
        const currentHTML = await win.webContents.executeJavaScript(
          'document.documentElement.innerHTML',
          true,
        );

        if (currentHTML === lastHTML) {
          stableCount++;
          if (stableCount >= requiredStableCount) {
            return;
          }
        } else {
          stableCount = 0;
          lastHTML = currentHTML;
        }
      } catch (error) {
        // ignore transient errors
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error('渲染超时：页面内容持续变动，未能稳定');
  };

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: false,
    },
  });

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await waitForRenderComplete(win);
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
    });
    return pdfBuffer;
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

const wrapHtmlWithTemplate = (title: string, bodyContent: string): string => {
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>${title}</title></head><body>${bodyContent}</body></html>`;
};

const extractDocumentTitle = (payload: RendererExportPayload): string => {
  try {
    const parsed = JSON.parse(payload.data.json || '{}');
    return parsed?.current_article_meta_data?.title || payload.suggestedName || 'Untitled';
  } catch {
    return payload.suggestedName || 'Untitled';
  }
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
    const title = extractDocumentTitle(payload);
    const wrapped = wrapHtmlWithTemplate(title, payload.html);
    await writeTextFile(targetPath, wrapped);
  },
  docx: async ({ payload, targetPath }) => {
    if (!payload.html) {
      throw new Error('缺少 HTML 数据，无法导出为 DOCX');
    }
    const buffer = await convertMarkdownToDocxBuffer(payload.html);
    await writeBinaryFile(targetPath, buffer);
  },
  pdf: async ({ payload, targetPath }) => {
    if (!payload.html) {
      throw new Error('缺少 HTML 数据，无法导出为 PDF');
    }
    const buffer = await convertHtmlToPdfBuffer(payload.html);
    await writeBinaryFile(targetPath, buffer);
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
  },
  md: async ({ payload, targetPath }) => {
    await writeTextFile(targetPath, payload.data.md);
  },
  html: async ({ payload, targetPath }) => {
    if (!payload.html) {
      throw new Error('缺少 HTML 数据，无法导出为 HTML');
    }
    const title = extractDocumentTitle(payload);
    const wrapped = wrapHtmlWithTemplate(title, payload.html);
    await writeTextFile(targetPath, wrapped);
  },
  docx: async ({ payload, targetPath }) => {
    if (!payload.html) {
      throw new Error('缺少 HTML 数据，无法导出为 DOCX');
    }
    const buffer = await convertMarkdownToDocxBuffer(payload.html);
    await writeBinaryFile(targetPath, buffer);
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

    const dialogResult = await dialog.showSaveDialog(mainWindow ?? undefined, {
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


