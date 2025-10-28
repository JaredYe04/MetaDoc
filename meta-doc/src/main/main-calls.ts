/**
 * 主进程事件处理函数 - TypeScript 重构版本
 * 处理所有来自渲染进程的IPC调用
 */

import { 
  app, 
  shell, 
  BrowserWindow, 
  ipcMain, 
  nativeTheme, 
  dialog, 
  Notification,
  IpcMainEvent,
  IpcMainInvokeEvent,
  OpenDialogReturnValue,
  SaveDialogReturnValue,
  WebContents
} from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import path from 'path';
import fs from 'fs';

// 第三方模块
import { marked } from 'marked';
import mammoth from 'mammoth';
import markdownIt from 'markdown-it';
// @ts-ignore
import htmlDocx from 'html-docx-js';
import os from 'os';

// 内部模块导入
import { 
  mainWindow, 
  openSettingDialog, 
  openAiChatDialog, 
  openFomulaRecognitionDialog, 
  openAiGraphDialog, 
  initBroadcastChannel 
} from './index';
import { dirname } from './index';
import { imageUploadDir } from './express-server';
import { queryKnowledgeBase, getResourcesPath, compileLatexToPDF } from './utils';
import type { LaTeXCompileResult } from '../types/utils';

// ============ 接口定义 ============

interface SaveData {
  path: string;
  md: string;
  json: string;
  tex: string;
  args?: {
    format: string;
  };
}

interface ExportData {
  json: string;
  html: string;
  format: string;
  tex: string;
}

interface CompileTexData {
  texPath: string;
  tex: string;
  outputDir?: string;
  customPdfFileName?: string;
}

interface QueryKnowledgeBaseParams {
  question: string;
  scoreThreshold?: number;
}

interface SettingData {
  key: string;
  value?: any;
}

interface UpdateRecentDocsData {
  path: string;
}

interface CutWordsData {
  text: string;
}

interface SimpleTexOCRData {
  fileName: string;
  fileType: string;
  fileBuffer: ArrayBuffer;
  reqData: Record<string, any>;
  header: Record<string, string>;
}

interface SystemNotificationData {
  title: string;
  body: string;
  path?: string;
}

interface TaskInfo {
  handle: string;
  [key: string]: any;
}

// ============ 全局变量 ============

let is_need_save: boolean = false;

// ============ 主要功能 ============

/**
 * 绑定所有主进程事件处理函数
 */
export function mainCalls(): void {
  bindBasicHandlers();
  bindDialogHandlers();
  bindFileHandlers();
  bindSettingHandlers();
  bindUtilityHandlers();
  bindKnowledgeHandlers();
  bindAITaskHandlers();
  bindSystemHandlers();
  
  initBroadcastChannel();
}

/**
 * 绑定基础事件处理器
 */
function bindBasicHandlers(): void {
  ipcMain.on('quit', quit);
  ipcMain.on('save', async (event: IpcMainEvent, data: SaveData) => {
    await save(data, false);
    is_need_save = false;
  });
  
  ipcMain.on('save-as', async (event: IpcMainEvent, data: SaveData) => {
    await save(data, true);
  });
  
  ipcMain.on('open-doc', async (event: IpcMainEvent, filePath: string) => {
    await openDoc(filePath);
  });
  
  ipcMain.on('export', async (event: IpcMainEvent, data: ExportData) => {
    await exportFile(event, data);
  });
}

/**
 * 绑定对话框事件处理器
 */
function bindDialogHandlers(): void {
  ipcMain.on('setting', () => {
    openSettingDialog();
  });
  
  ipcMain.on('ai-chat', () => {
    openAiChatDialog();
  });
  
  ipcMain.on('ai-graph', () => {
    openAiGraphDialog();
  });
  
  ipcMain.on('fomula-recognition', () => {
    openFomulaRecognitionDialog();
  });
}

/**
 * 绑定文件操作处理器
 */
function bindFileHandlers(): void {
  ipcMain.on('open-link', (event: IpcMainEvent, url: string) => {
    shell.openExternal(url);
  });
  
  ipcMain.on('shell-open', async (event: IpcMainEvent, filePath: string) => {
    try {
      await shell.openPath(filePath);
    } catch (error) {
      console.error('打开文件失败:', error);
    }
  });
}

/**
 * 绑定设置相关处理器
 */
function bindSettingHandlers(): void {
  ipcMain.handle('get-setting', async (event: IpcMainInvokeEvent, data: SettingData): Promise<any> => {
    return await getSetting(data.key);
  });
  
  ipcMain.handle('set-setting', async (event: IpcMainInvokeEvent, data: SettingData): Promise<void> => {
    return await setSetting(data.key, data.value);
  });
  
  ipcMain.handle('update-recent-docs', async (event: IpcMainInvokeEvent, data: UpdateRecentDocsData): Promise<void> => {
    return await updateRecentDocs(data);
  });
  
  ipcMain.handle('get-recent-docs', async (event: IpcMainInvokeEvent): Promise<string[]> => {
    return await getRecentDocs();
  });
}

/**
 * 绑定工具功能处理器
 */
function bindUtilityHandlers(): void {
  ipcMain.handle('cut-words', async (event: IpcMainInvokeEvent, data: CutWordsData): Promise<any[]> => {
    return await cut_words(data.text);
  });
  
  ipcMain.handle('get-image-path', async (event: IpcMainInvokeEvent): Promise<string> => {
    return await getImagePath();
  });
  
  ipcMain.handle('get-os-theme', async (event: IpcMainInvokeEvent): Promise<string> => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  });
  
  ipcMain.handle('compute-md5', async (event: IpcMainInvokeEvent, data: string): Promise<string> => {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(data).digest('hex');
  });
  
  ipcMain.handle('resources-path', (event: IpcMainInvokeEvent): string => {
    return getResourcesPath();
  });
  
  ipcMain.handle('simpletex-ocr', async (event: IpcMainInvokeEvent, params: SimpleTexOCRData): Promise<any> => {
    return await handleSimpleTexOCR(params);
  });
}

/**
 * 绑定知识库处理器
 */
function bindKnowledgeHandlers(): void {
  ipcMain.handle('compile-tex', async (event: IpcMainInvokeEvent, data: CompileTexData): Promise<LaTeXCompileResult> => {
    try {
      const result = await compileLatexToPDF(
        data.texPath,
        data.tex,
        data.outputDir,
        mainWindow ?? undefined,
        data.customPdfFileName
      );

      if (result.status === 'success') {
        mainWindow?.webContents.send('compile-latex-success', result);
      } else {
        mainWindow?.webContents.send('compile-latex-fail', `编译失败，退出码: ${result.exitCode}`);
      }
      
      return result;
    } catch (error) {
      const errorMessage = (error as Error).message;
      mainWindow?.webContents.send('compile-latex-fail', errorMessage);
      console.error('PDF 编译失败:', errorMessage);
      return { status: 'failed', exitCode: -1 };
    }
  });
  
  ipcMain.handle('query-knowledge-base', async (event: IpcMainInvokeEvent, params: QueryKnowledgeBaseParams): Promise<string[]> => {
    return await queryKnowledgeBase(params.question, params.scoreThreshold);
  });
}

/**
 * 绑定AI任务处理器
 */
function bindAITaskHandlers(): void {
  ipcMain.on('register-ai-task', (event: IpcMainEvent, taskInfo: TaskInfo) => {
    const mainWin = BrowserWindow.getAllWindows().find(w => 
      w.webContents.getURL().includes('#/home')
    );
    
    if (mainWin) {
      mainWin.webContents.send('register-ai-task', taskInfo);
    }
  });

  ipcMain.on('ai-task-done', (event: IpcMainEvent, handle: string) => {
    const mainWin = BrowserWindow.getAllWindows().find(w => 
      w.webContents.getURL().includes('#/home')
    );
    
    if (mainWin) {
      mainWin.webContents.send('ai-task-done', handle);
    }
  });

  ipcMain.on('broadcast-cancel-ai-task', (event: IpcMainEvent, handle: string) => {
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('cancel-task', handle);
    });
  });

  ipcMain.on('start-task', (event: IpcMainEvent, handle: string) => {
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('start-task', handle);
    });
  });
}

/**
 * 绑定系统事件处理器
 */
function bindSystemHandlers(): void {
  ipcMain.on('system-notification', (event: IpcMainEvent, data: SystemNotificationData) => {
    systemNotification(data.title, data.body, data.path);
  });
  
  ipcMain.on('update-window-title', (event: IpcMainEvent, title: string) => {
    updateWindowTitle(title);
  });

  nativeTheme.on('updated', () => {
    mainWindow?.webContents.send('os-theme-changed');
  });
}

// ============ 工具函数 ============

/**
 * 分词处理
 */
const cut_words = async (text: string): Promise<any[]> => {
  const Segment = require('segment');
  const segment = new Segment();
  segment.useDefault();
  
  return await segment.doSegment(text, {
    simple: true
  });
};

/**
 * 获取图片路径
 */
const getImagePath = async (): Promise<string> => {
  return imageUploadDir;
};

/**
 * 系统通知
 */
const systemNotification = (title: string, body: string, path: string = ''): void => {
  const notification = new Notification({
    title,
    body
  });
  
  notification.on('click', () => {
    if (path) {
      shell.openPath(path).then(() => {
        console.log(`已尝试打开: ${path}`);
      }).catch(err => {
        console.error(`打开文件失败: ${err}`);
      });
    }
  });

  notification.show();
};

/**
 * 更新窗口标题
 */
const updateWindowTitle = (title: string): void => {
  if (mainWindow) {
    if (title.length > 30) {
      title = title.substring(0, 30) + '...';
    }
    
    if (title.length === 0) {
      mainWindow.setTitle("MetaDoc");
    } else {
      mainWindow.setTitle(title + " - MetaDoc");
    }
  }
};

/**
 * 更新最近文档
 */
const updateRecentDocs = async (data: UpdateRecentDocsData): Promise<void> => {
  const json = store.get('recent-docs') as string | null;
  let recentDocs: string[] = json ? JSON.parse(json) : [];
  
  // 移除重复项并添加到前面
  recentDocs = recentDocs.filter((item) => item !== data.path);
  recentDocs.unshift(data.path);
  
  if (recentDocs.length > 5) {
    recentDocs.pop();
  }

  store.set('recent-docs', JSON.stringify(recentDocs));
};

/**
 * 获取最近文档
 */
const getRecentDocs = async (): Promise<string[]> => {
  const json = store.get('recent-docs') as string | null;
  let recentDocs: string[] = json ? JSON.parse(json) : [];
  const result: string[] = [];
  
  for (const filePath of recentDocs) {
    if (fs.existsSync(filePath)) {
      result.push(filePath);
    }
  }
  
  return result;
};

// ============ 设置存储 ============

const Store = require('electron-store');
const store = new Store();

function getSetting(key: string): any {
  return store.get(key);
}

function setSetting(key: string, value: any): void {
  return store.set(key, value);
}

// ============ 应用控制 ============

const quit = (): void => {
  app.quit();
};

// ============ 文件操作 ============

/**
 * 保存文件
 */
const save = async (data: SaveData, saveAs: boolean): Promise<void> => {
  let filePath = data.path;
  let content = '';

  if (filePath === '' || saveAs) {
    filePath = await chooseSaveFile(data);
    if (!filePath) return;
  }

  const format = path.extname(filePath).slice(1).toLowerCase();
  
  switch (format) {
    case 'md':
      content = data.md;
      break;
    case 'json':
      content = data.json;
      break;
    case 'tex':
      content = data.tex;
      break;
    default:
      return;
  }

  if (filePath) {
    fs.writeFileSync(filePath, content);
    mainWindow?.webContents.send('save-success', {
      path: filePath,
      saveAs,
      format
    });
  }
};

/**
 * 打开文档
 */
export const openDoc = async (filePath?: string): Promise<void> => {
  if (filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const format = path.extname(filePath).slice(1).toLowerCase();
    
    const payload = {
      content,
      format,
    };
    
    mainWindow?.webContents.send('open-doc-success', payload);
    mainWindow?.webContents.send('update-current-path', filePath);
    return;
  }

  const result: OpenDialogReturnValue = await dialog.showOpenDialog(mainWindow!, {
    title: '打开文件',
    filters: [
      { name: 'Markdown Files', extensions: ['md'] },
      { name: 'LaTeX Files', extensions: ['tex'] },
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];
    const content = fs.readFileSync(selectedPath, 'utf-8');
    const format = path.extname(selectedPath).slice(1).toLowerCase();
    
    const payload = {
      content,
      format,
    };
    
    mainWindow?.webContents.send('open-doc-success', payload);
    mainWindow?.webContents.send('update-current-path', selectedPath);
  }
};

/**
 * 选择保存文件路径
 */
const chooseSaveFile = async (data: SaveData): Promise<string> => {
  const dateString = new Date()
    .toISOString()
    .replace(/:/g, '-')
    .replace('T', '_')
    .split('.')[0];
    
  const metadata = JSON.parse(data.json);
  const title = metadata.current_article_meta_data?.title;
  const filename = title || dateString;

  let filters: Electron.FileFilter[] = [];
  
  if (data.args?.format) {
    switch (data.args.format.toLowerCase()) {
      case 'md':
      case 'markdown':
        filters = [{ name: 'Markdown Files', extensions: ['md'] }];
        break;
      case 'tex':
      case 'latex':
        filters = [{ name: 'LaTeX Files', extensions: ['tex'] }];
        break;
      case 'json':
        filters = [{ name: 'JSON Files', extensions: ['json'] }];
        break;
      default:
        filters = [{ name: 'All Files', extensions: ['*'] }];
    }
  } else {
    filters = [
      { name: 'Markdown Files', extensions: ['md'] },
      { name: 'LaTeX Files', extensions: ['tex'] },
      { name: 'JSON Files', extensions: ['json'] },
    ];
  }

  const result: SaveDialogReturnValue = await dialog.showSaveDialog(mainWindow!, {
    title: 'Save File',
    defaultPath: filename,
    filters
  });

  if (!result.canceled && result.filePath) {
    mainWindow?.webContents.send('save-file-path', result.filePath);
    return result.filePath;
  }
  
  return '';
};

/**
 * 导出文件
 */
const exportFile = async (event: IpcMainEvent, data: ExportData): Promise<void> => {
  const parsedData = { ...JSON.parse(data.json), html: data.html, format: data.format, tex: data.tex };

  const dateString = new Date()
    .toISOString()
    .replace(/:/g, '-')
    .replace('T', '_')
    .split('.')[0];
    
  const title = parsedData.current_article_meta_data?.title;
  const filename = title || dateString;
  const format = data.format;

  let filter: Electron.FileFilter;
  
  switch (format) {
    case 'docx':
      filter = { name: 'DOCX File', extensions: ['docx'] };
      break;
    case 'md':
      filter = { name: 'Markdown File', extensions: ['md'] };
      break;
    case 'html':
      filter = { name: 'HTML File', extensions: ['html'] };
      break;
    case 'tex':
      filter = { name: 'LaTeX File', extensions: ['tex'] };
      break;
    default:
      filter = { name: 'All Files', extensions: ['*'] };
  }

  const result: SaveDialogReturnValue = await dialog.showSaveDialog(mainWindow!, {
    title: '导出文档',
    defaultPath: filename + '.' + format,
    filters: [filter],
  });

  if (!result.canceled && result.filePath) {
    const ext = path.extname(result.filePath).toLowerCase();
    let buffer: Buffer | null = null;

    try {
      switch (ext) {
        case '.pdf':
          buffer = await convertHtmlToPdfBuffer(parsedData.html);
          break;
        case '.docx':
          buffer = await convertMarkdownToDocxBuffer(parsedData.html);
          break;
        case '.md':
          buffer = Buffer.from(parsedData.current_article, 'utf-8');
          break;
        case '.html':
          buffer = Buffer.from(
            wrapHtmlWithTemplate(parsedData.current_article_meta_data?.title, parsedData.html),
            'utf-8'
          );
          break;
        case '.tex':
          buffer = Buffer.from(parsedData.tex, 'utf-8');
          break;
      }

      if (buffer) {
        await fs.promises.writeFile(result.filePath, buffer);
        mainWindow?.webContents.send('export-success', result.filePath);
      }
    } catch (error) {
      console.error('导出失败:', error);
    }
  }
};

// ============ 文件转换工具 ============

/**
 * 转换HTML为PDF
 */
const convertHtmlToPdfBuffer = async (html: string): Promise<Buffer> => {
  const waitForRenderComplete = async (
    win: BrowserWindow,
    timeout: number = 10000,
    interval: number = 500
  ): Promise<void> => {
    const maxTries = Math.ceil(timeout / interval);
    let lastHTML = '';
    let stableCount = 0;
    const requiredStableCount = 2;
    
    for (let i = 0; i < maxTries; i++) {
      try {
        const currentHTML = await win.webContents.executeJavaScript(
          'document.documentElement.innerHTML',
          true
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
      } catch (err) {
        // 忽略错误
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error('渲染超时：页面内容持续变动，未能稳定');
  };

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: false,
    }
  });

  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await waitForRenderComplete(win);
    
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
    });
    return pdfBuffer;
    win.close();
  } catch (error) {
    console.error('转换PDF失败:', error);
    throw error;
  }
};

/**
 * 转换Markdown为DOCX
 */
async function convertMarkdownToDocxBuffer(htmlContent: string): Promise<Buffer> {
  const htmlWrapped = `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>Document</title></head><body>${htmlContent}</body></html>`;
  const docxBlob = htmlDocx.asBlob(htmlWrapped);
  const arrayBuffer = await docxBlob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * 包装HTML模板
 */
function wrapHtmlWithTemplate(title: string, bodyContent: string): string {
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>${title}</title></head><body>${bodyContent}</body></html>`;
}

/**
 * 处理SimpleTeX OCR
 */
async function handleSimpleTexOCR(params: SimpleTexOCRData): Promise<any> {
  const { fileName, fileType, fileBuffer, reqData, header } = params;
  
  // 重新构造 Buffer
  const buffer = Buffer.from(fileBuffer);

  // 直接用 ArrayBuffer，而不是 Buffer，避免类型错误
  const arrayBuffer = fileBuffer instanceof ArrayBuffer ? fileBuffer : Buffer.from(fileBuffer).buffer;
  const blob = new Blob([arrayBuffer], { type: fileType });
  
  const formData = new FormData();
  formData.append("file", blob, fileName);

  // 添加额外参数
  for (const key in reqData) {
    formData.append(key, reqData[key]);
  }

  try {
    const response = await fetch("https://server.simpletex.cn/api/simpletex_ocr", {
      method: "POST",
      headers: header,
      body: formData
    });
    
    return await response.json();
  } catch (err) {
    console.error(err);
    return 'error:' + err;
  }
}
