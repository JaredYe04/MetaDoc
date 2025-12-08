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
  systemPreferences,
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
import os from 'os';
import { exec, spawn } from 'child_process';
import https from 'https';
import http from 'http';

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
import { queryKnowledgeBase, getResourcesPath, compileLatexToPDF, setEmbeddingMode, getEmbeddingMode, fileConversionService } from './utils';
import ocrService from './utils/ocr-service';
import type { LaTeXCompileResult } from '../types/utils';
import type { DocumentFormat } from '../types';
import { performExportRequest, type RendererExportPayload, abortExportTask } from './export/export-manager';
import { MainProgressHandle } from './utils/progress-handle';
import { createMainLogger, handleRendererLog, getLoggerConfig, getLoggerHistory, openCurrentLogFile, openLogDirectory, updateLoggerConfig } from './logger';
import { getServiceStatus } from './service-status';
import type { LogPayload, LogLevel } from '../common/logger-constants';
import { t } from './i18n';
import { fileWatcherService } from './utils/file-watcher-service';

// ============ 取消令牌管理 ============
// 维护requestId到AbortController的映射，用于取消异步任务
const cancellationTokens = new Map<string, AbortController>();

// 生成唯一的requestId
function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 创建取消令牌
function createCancellationToken(requestId: string): AbortController {
  const controller = new AbortController();
  cancellationTokens.set(requestId, controller);
  return controller;
}

// 取消任务
function cancelTask(requestId: string): void {
  const controller = cancellationTokens.get(requestId);
  if (controller) {
    controller.abort();
    cancellationTokens.delete(requestId);
  }
}

// 清理取消令牌
function cleanupCancellationToken(requestId: string): void {
  cancellationTokens.delete(requestId);
}

// ============ 接口定义 ============

interface SaveData {
  path: string;
  md: string;
  json: string;
  tex: string;
  format: DocumentFormat;
  args?: {
    format: string;
  };
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

const logger = createMainLogger('MainCalls');

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
  bindLoggerHandlers();
  bindExportHandlers();
  bindTerminalHandlers();
  
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
  
  ipcMain.handle('workspace-save-document', async (event, payload: { data: SaveData; saveAs?: boolean }) => {
    if (!payload || !payload.data) {
      return null;
    }
    const result = await saveInternal(payload.data, Boolean(payload.saveAs));
    return result;
  });
  
  ipcMain.on('open-doc', async (event: IpcMainEvent, filePath: string) => {
    await openDoc(filePath);
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
      logger.error('打开文件失败:', error);
    }
  });
  
  // 保存PDF对话框
  ipcMain.handle('save-pdf-dialog', async (event: IpcMainInvokeEvent, options: { sourcePath: string; defaultName: string }) => {
    try {
      if (!fs.existsSync(options.sourcePath)) {
        return { success: false, error: 'PDF file not found' };
      }
      
      // 读取PDF文件
      const pdfBuffer = fs.readFileSync(options.sourcePath);
      
      // 打开保存对话框
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: t('latexEditor.pdfMenu.saveDialogTitle', 'Save PDF File'),
        defaultPath: options.defaultName,
        filters: [
          { name: 'PDF Files', extensions: ['pdf'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }
      
      // 保存文件
      fs.writeFileSync(result.filePath, pdfBuffer);
      
      return { success: true, filePath: result.filePath };
    } catch (error) {
      logger.error('保存PDF失败:', error);
      return { success: false, error: String(error) };
    }
  });
  
  // 获取文件所在目录路径
  ipcMain.handle('get-directory-path', async (event: IpcMainInvokeEvent, filePath: string) => {
    try {
      return path.dirname(filePath);
    } catch (error) {
      logger.error('获取目录路径失败:', error);
      return null;
    }
  });
  
  // 读取文件内容
  ipcMain.handle('read-file-content', async (event: IpcMainInvokeEvent, filePath: string): Promise<string | null> => {
    try {
      if (!fs.existsSync(filePath)) {
        // 文件不存在时返回 null，而不是抛出错误
        return null;
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return content;
    } catch (error) {
      logger.error('读取文件失败:', error);
      throw error;
    }
  });

  ipcMain.handle('write-file-content', async (event: IpcMainInvokeEvent, payload: { filePath: string; content: string }): Promise<void> => {
    try {
      const { filePath, content } = payload;
      if (!filePath || !content) {
        throw new Error('文件路径和内容不能为空');
      }
      
      // 确保目录存在
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(filePath, content, 'utf-8');
    } catch (error) {
      logger.error('写入文件失败:', error);
      throw error;
    }
  });

  // 保存引用文件到临时目录
  ipcMain.handle('save-reference-file', async (event: IpcMainInvokeEvent, payload: { filename: string; content: string }): Promise<string> => {
    try {
      const { filename, content } = payload;
      if (!filename || !content) {
        throw new Error('文件名和内容不能为空');
      }
      
      // 创建临时目录（如果不存在）
      const tempDir = path.join(os.tmpdir(), 'metadoc-references');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // 生成唯一文件名（避免冲突）
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substr(2, 9);
      const ext = path.extname(filename);
      const baseName = path.basename(filename, ext);
      const uniqueFilename = `${baseName}-${timestamp}-${randomStr}${ext}`;
      const filePath = path.join(tempDir, uniqueFilename);
      
      // 将base64内容转换为Buffer并写入文件
      const buffer = Buffer.from(content, 'base64');
      fs.writeFileSync(filePath, buffer);
      
      logger.info(`引用文件已保存到临时目录: ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error('保存引用文件失败:', error);
      throw error;
    }
  });

  // 转换PDF到文本
  ipcMain.handle('convert-pdf-to-text', async (event: IpcMainInvokeEvent, filePath: string, requestId?: string): Promise<string> => {
    const reqId = requestId || generateRequestId();
    const abortController = createCancellationToken(reqId);
    const handle = new MainProgressHandle({
      requestId: reqId,
      canCancel: true,
      send: (p) => event.sender.send('global-progress', p),
      initialMessage: 'agent.reference.progress.parsingFile',
      initialPercentage: 0,
    });
    try {
      const progressCallback = (progress: { message: string; subMessage?: string; percentage: number; status?: string; params?: Record<string, any> }) => {
        if (abortController.signal.aborted) return;
        handle.mark(progress.percentage, {
          message: progress.message,
          subMessage: progress.subMessage,
          status: progress.status as any,
          params: progress.params
        });
      };
      
      const result = await fileConversionService.tryConvertFileToText(filePath, progressCallback, abortController.signal, reqId);
      if (!result.success || result.text === undefined || result.text === null) {
        throw new Error(result.error || 'PDF转换失败');
      }
      
      handle.success({ message: 'agent.reference.progress.parseCompleteGeneric' });
      return result.text;
    } catch (error) {
      if (abortController.signal.aborted) {
        handle.cancel();
        throw new Error('操作已取消');
      }
      logger.error('PDF转换失败:', error);
      handle.fail(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      cancellationTokens.delete(reqId);
    }
  });

  // 取消文件转换任务
  ipcMain.handle('cancel-file-conversion', async (event: IpcMainInvokeEvent, requestId: string): Promise<void> => {
    cancelTask(requestId);
    // 取消该requestId的所有OCR任务
    await fileConversionService.cancelOcrTasks(requestId);
  });

  // 转换DOCX到文本
  ipcMain.handle('convert-docx-to-text', async (event: IpcMainInvokeEvent, filePath: string, requestId?: string): Promise<string> => {
    const reqId = requestId || generateRequestId();
    const abortController = createCancellationToken(reqId);
    const handle = new MainProgressHandle({
      requestId: reqId,
      canCancel: true,
      send: (p) => event.sender.send('global-progress', p),
      initialMessage: 'agent.reference.progress.parsingFile',
      initialPercentage: 0,
    });
    
    try {
      const progressCallback = (progress: { message: string; subMessage?: string; percentage: number; status?: string; params?: Record<string, any> }) => {
        // 检查是否已取消
        if (abortController.signal.aborted) {
          return;
        }
        handle.mark(progress.percentage, {
          message: progress.message,
          subMessage: progress.subMessage,
          status: progress.status as any,
          params: progress.params
        });
      };
      
      const result = await fileConversionService.tryConvertFileToText(filePath, progressCallback, abortController.signal, reqId);
      if (!result.success || result.text === undefined || result.text === null) {
        throw new Error(result.error || 'DOCX转换失败');
      }
      
      handle.success({ message: 'agent.reference.progress.parseCompleteGeneric' });
      return result.text;
    } catch (error) {
      logger.error('DOCX转换失败:', error);
      // 如果是取消错误，不显示错误消息
      if (error instanceof Error && error.message === '操作已取消') {
        handle.cancel();
        throw error;
      }
      handle.fail(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      // 清理取消令牌
      cancellationTokens.delete(reqId);
    }
  });

  // 转换PPTX到文本
  ipcMain.handle('convert-pptx-to-text', async (event: IpcMainInvokeEvent, filePath: string, requestId?: string): Promise<string> => {
    const reqId = requestId || generateRequestId();
    const abortController = createCancellationToken(reqId);
    const handle = new MainProgressHandle({
      requestId: reqId,
      canCancel: true,
      send: (p) => event.sender.send('global-progress', p),
      initialMessage: 'agent.reference.progress.parsingFile',
      initialPercentage: 0,
    });
    
    try {
      const progressCallback = (progress: { message: string; subMessage?: string; percentage: number; status?: string; params?: Record<string, any> }) => {
        // 检查是否已取消
        if (abortController.signal.aborted) {
          return;
        }
        handle.mark(progress.percentage, {
          message: progress.message,
          subMessage: progress.subMessage,
          status: progress.status as any,
          params: progress.params
        });
      };
      
      const result = await fileConversionService.tryConvertFileToText(filePath, progressCallback, abortController.signal, reqId);
      if (!result.success || result.text === undefined || result.text === null) {
        throw new Error(result.error || 'PPTX转换失败');
      }
      
      handle.success({ message: 'agent.reference.progress.parseCompleteGeneric' });
      return result.text;
    } catch (error) {
      logger.error('PPTX转换失败:', error);
      // 如果是取消错误，不显示错误消息
      if (error instanceof Error && error.message === '操作已取消') {
        handle.cancel();
        throw error;
      }
      handle.fail(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      // 清理取消令牌
      cancellationTokens.delete(reqId);
    }
  });

  // 转换Excel到文本
  ipcMain.handle('convert-excel-to-text', async (event: IpcMainInvokeEvent, filePath: string): Promise<string> => {
    try {
      const result = await fileConversionService.tryConvertFileToText(filePath);
      if (!result.success || result.text === undefined || result.text === null) {
        throw new Error(result.error || 'Excel转换失败');
      }
      return result.text;
    } catch (error) {
      logger.error('Excel转换失败:', error);
      throw error;
    }
  });

  // OCR识别图片（从文件路径）
  ipcMain.handle('ocr-recognize-file', async (event: IpcMainInvokeEvent, payload: { imagePath: string; languages?: string[] }): Promise<string> => {
    try {
      const { imagePath, languages } = payload;
      if (!imagePath) {
        throw new Error('图片路径不能为空');
      }
      return await ocrService.recognizeFromFile(imagePath, languages);
    } catch (error) {
      logger.error('OCR识别失败:', error);
      throw error;
    }
  });

  // OCR识别图片（从Base64）
  ipcMain.handle('ocr-recognize-base64', async (event: IpcMainInvokeEvent, payload: { base64String: string; languages?: string[] }): Promise<string> => {
    try {
      const { base64String, languages } = payload;
      if (!base64String) {
        throw new Error('Base64字符串不能为空');
      }
      return await ocrService.recognizeFromBase64(base64String, languages);
    } catch (error) {
      logger.error('OCR识别失败:', error);
      throw error;
    }
  });

  // 获取OCR支持的语言列表
  ipcMain.handle('ocr-get-supported-languages', async (): Promise<string[]> => {
    return ocrService.getSupportedLanguages();
  });

  // ============ 文件监听处理器 ============
  
  // 启动文件监听
  ipcMain.on('watch-file', (event: IpcMainEvent, filePath: string, tabId?: string) => {
    try {
      if (!filePath) {
        logger.warn('文件路径为空，无法启动监听');
        return;
      }
      fileWatcherService.watchFile(filePath, event.sender, tabId);
    } catch (error) {
      logger.error('启动文件监听失败', { filePath, error });
    }
  });

  // 停止文件监听
  ipcMain.on('unwatch-file', (event: IpcMainEvent, filePath: string) => {
    try {
      if (!filePath) {
        return;
      }
      fileWatcherService.unwatchFile(filePath);
    } catch (error) {
      logger.error('停止文件监听失败', { filePath, error });
    }
  });

  // 更新文件监听的标签页 ID
  ipcMain.on('update-file-watcher-tab-id', (event: IpcMainEvent, filePath: string, tabId: string) => {
    try {
      if (!filePath || !tabId) {
        return;
      }
      fileWatcherService.updateTabId(filePath, tabId);
    } catch (error) {
      logger.error('更新文件监听标签页 ID 失败', { filePath, tabId, error });
    }
  });
}

function bindLoggerHandlers(): void {
  ipcMain.on('logger-log', (_event: IpcMainEvent, payload: LogPayload) => {
    handleRendererLog(payload);
  });

  ipcMain.handle('get-logger-config', async () => {
    return getLoggerConfig();
  });

  ipcMain.on('open-log-file', async () => {
    await openCurrentLogFile();
  });

  ipcMain.on('open-log-directory', async () => {
    await openLogDirectory();
  });

  ipcMain.handle('get-logger-history', async () => {
    return getLoggerHistory();
  });

  ipcMain.handle('get-service-status', async () => {
    return getServiceStatus();
  });
}

function bindExportHandlers(): void {
  ipcMain.handle('perform-export', async (event: IpcMainInvokeEvent, payload: RendererExportPayload) => {
    const result = await performExportRequest(payload, mainWindow);
    if (result.success && result.path) {
      event.sender.send('export-success', result.path);
    } else if (!result.success && result.error) {
      event.sender.send('export-error', result.error);
    }
    return result;
  });

  ipcMain.handle('cancel-export-task', async (_event: IpcMainInvokeEvent, requestId: string) => {
    return abortExportTask(requestId);
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

  // 获取环境变量（仅限安全的环境变量，不暴露敏感信息）
  ipcMain.handle('get-env', async (event: IpcMainInvokeEvent, key: string): Promise<string | undefined> => {
    // 只允许获取特定的环境变量
    const allowedKeys = ['SIMPLETEX_APP_ID', 'SIMPLETEX_APP_SECRET', 'SILICONFLOW_API_KEY', 'SERVER_URL'];
    if (allowedKeys.includes(key)) {
      return process.env[key];
    }
    return undefined;
  });

  // 设置 embedding 模式
  ipcMain.handle('set-embedding-mode', async (event: IpcMainInvokeEvent, mode: 'local' | 'api'): Promise<void> => {
    setEmbeddingMode(mode);
  });

  // 获取 embedding 模式
  ipcMain.handle('get-embedding-mode', async (event: IpcMainInvokeEvent): Promise<'local' | 'api'> => {
    return getEmbeddingMode();
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
  
  // 获取系统主题（亮暗色）
  ipcMain.handle('get-os-theme', async (event: IpcMainInvokeEvent): Promise<string> => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  });
  
  // 获取系统主题信息（包括亮暗色和主题色）
  ipcMain.handle('get-os-theme-info', async (event: IpcMainInvokeEvent): Promise<{ mode: 'dark' | 'light', accentColor?: string }> => {
    const mode = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    let accentColor: string | undefined;
    
    // 尝试获取系统主题色（不同平台的方法不同）
    try {
      if (process.platform === 'win32') {
        // Windows: 通过注册表获取主题色
        accentColor = await getWindowsAccentColor();
      } else if (process.platform === 'darwin') {
        // macOS: 使用 Electron API 获取系统主题色
        accentColor = getMacOSAccentColor();
      } else {
        // Linux: 通过 gsettings 或其他方式获取主题色
        accentColor = await getLinuxAccentColor();
      }
    } catch (e) {
      console.error('Failed to get system accent color:', e);
      accentColor = undefined;
    }
    
    return { mode, accentColor };
  });
  
  // Windows: 从注册表获取系统主题色
  async function getWindowsAccentColor(): Promise<string | undefined> {
    try {
      // 使用 PowerShell 读取注册表
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // 读取 DWM AccentColor 注册表项
      // HKEY_CURRENT_USER\Software\Microsoft\Windows\DWM\AccentColor
      const command = 'powershell -Command "Get-ItemProperty -Path \'HKCU:\\Software\\Microsoft\\Windows\\DWM\' -Name AccentColor -ErrorAction SilentlyContinue | Select-Object -ExpandProperty AccentColor"';
      
      const { stdout, stderr } = await execAsync(command, { encoding: 'utf8', timeout: 5000 });
      
      if (stderr || !stdout || stdout.trim() === '') {
        return undefined;
      }
      
      // 注册表中的值是 DWORD (十进制) 或 ARGB (十六进制字符串)
      // 例如: 4280151749 或 "0xFF0078D4"
      let colorValue = stdout.trim();
      
      // Windows 注册表中的 AccentColor 格式是 0xAABBGGRR (DWORD)
      // AA = Alpha, BB = Blue, GG = Green, RR = Red
      // 需要提取 RGB 并转换为标准 HEX 格式
      
      // 如果是十进制数字，转换为十六进制
      if (/^\d+$/.test(colorValue)) {
        const num = parseInt(colorValue, 10);
        // 按照 0xAABBGGRR 格式解析
        const r = (num >> 0) & 0xFF;   // 最低字节是 Red
        const g = (num >> 8) & 0xFF;    // 第二字节是 Green
        const b = (num >> 16) & 0xFF;   // 第三字节是 Blue
        // Alpha 在最高字节，我们不需要
        // 转换为 HEX 格式 (RGB)
        const hexColor = `#${[r, g, b].map(x => {
          const hex = x.toString(16).padStart(2, '0');
          return hex;
        }).join('')}`;
        return hexColor;
      }
      
      // 如果已经是十六进制格式
      if (colorValue.startsWith('0x') || colorValue.startsWith('0X')) {
        colorValue = colorValue.substring(2);
        // Windows 注册表中的格式是 0xAABBGGRR
        if (colorValue.length === 8) {
          // 按照 AABBGGRR 顺序解析
          const r = parseInt(colorValue.substring(6, 8), 16); // RR (最后两位)
          const g = parseInt(colorValue.substring(4, 6), 16); // GG (中间两位)
          const b = parseInt(colorValue.substring(2, 4), 16); // BB (前两位，跳过 AA)
          // 转换为 RGB HEX 格式
          return `#${[r, g, b].map(x => {
            const hex = x.toString(16).padStart(2, '0');
            return hex;
          }).join('')}`;
        } else if (colorValue.length === 6) {
          // 如果已经是 6 位，假设是 RGB 格式
          return `#${colorValue}`;
        }
      }
      
      return undefined;
    } catch (error) {
      console.error('Failed to get Windows accent color:', error);
      return undefined;
    }
  }
  
  // macOS: 获取系统主题色
  function getMacOSAccentColor(): string | undefined {
    try {
      // Electron 的 systemPreferences.getAccentColor() 返回 RGB 字符串，如 "12, 123, 234"
      const rgb = systemPreferences.getAccentColor();
      if (!rgb) {
        return undefined;
      }
      
      // 解析 RGB 字符串并转换为 HEX
      const parts = rgb.split(',').map(s => parseInt(s.trim(), 10));
      if (parts.length === 3) {
        const [r, g, b] = parts;
        return `#${[r, g, b].map(x => {
          const hex = x.toString(16).padStart(2, '0');
          return hex;
        }).join('')}`;
      }
      
      return undefined;
    } catch (error) {
      console.error('Failed to get macOS accent color:', error);
      return undefined;
    }
  }
  
  // Linux: 获取系统主题色
  async function getLinuxAccentColor(): Promise<string | undefined> {
    try {
      // 尝试通过 gsettings 获取 GNOME 主题色
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // 检查是否在 GNOME 环境中
      const desktopEnv = process.env.XDG_CURRENT_DESKTOP || process.env.DESKTOP_SESSION || '';
      
      if (desktopEnv.toLowerCase().includes('gnome')) {
        // GNOME: 尝试获取 accent-color (GNOME 42+)
        try {
          const { stdout } = await execAsync('gsettings get org.gnome.desktop.interface accent-color', { encoding: 'utf8', timeout: 3000 });
          if (stdout && stdout.trim() && stdout.trim() !== "''") {
            let color = stdout.trim().replace(/'/g, '');
            // 如果已经是 HEX 格式
            if (color.startsWith('#')) {
              return color;
            }
            // 如果是 RGB 格式，尝试转换
            if (color.startsWith('rgb')) {
              const match = color.match(/(\d+),\s*(\d+),\s*(\d+)/);
              if (match) {
                const [, r, g, b] = match;
                return `#${[r, g, b].map(x => {
                  const hex = parseInt(x, 10).toString(16).padStart(2, '0');
                  return hex;
                }).join('')}`;
              }
            }
          }
        } catch (e) {
          // 如果 accent-color 不存在，尝试获取 theme-name 并解析
        }
        
        // 备选方案: 尝试从 GTK 主题获取
        try {
          const { stdout } = await execAsync('gsettings get org.gnome.desktop.interface gtk-theme', { encoding: 'utf8', timeout: 3000 });
          // 这里可以进一步解析主题文件，但比较复杂
          // 暂时返回 undefined，让用户手动选择
        } catch (e) {
          // 忽略错误
        }
      } else if (desktopEnv.toLowerCase().includes('kde')) {
        // KDE: 可以通过 kreadconfig5 获取
        try {
          const { stdout } = await execAsync('kreadconfig5 --file kdeglobals --group Colors:Window --key BackgroundNormal', { encoding: 'utf8', timeout: 3000 });
          // KDE 的颜色格式可能不同，需要解析
        } catch (e) {
          // 忽略错误
        }
      }
      
      return undefined;
    } catch (error) {
      console.error('Failed to get Linux accent color:', error);
      return undefined;
    }
  }
  
  ipcMain.handle('get-is-packaged', async (event: IpcMainInvokeEvent): Promise<boolean> => {
    return app.isPackaged;
  });
  
  ipcMain.handle('get-all-window-types', async (event: IpcMainInvokeEvent): Promise<string[]> => {
    const windows = BrowserWindow.getAllWindows();
    const windowTypes = new Set<string>();
    
    // 主窗口总是存在
    windowTypes.add('home');
    
    // 从所有窗口的 URL 中提取 windowType
    windows.forEach((win: BrowserWindow) => {
      if (win && !win.isDestroyed()) {
        const url = win.webContents.getURL();
        const match = url.match(/[?&]windowType=([^&]+)/);
        if (match) {
          windowTypes.add(match[1]);
        }
      }
    });
    
    return Array.from(windowTypes).sort();
  });
  
  ipcMain.handle('compute-md5', async (event: IpcMainInvokeEvent, data: string): Promise<string> => {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(data).digest('hex');
  });
  
  ipcMain.handle('resources-path', (event: IpcMainInvokeEvent): string => {
    return getResourcesPath();
  });
  
  // HTTP请求代理处理器（通过主进程绕过CORS限制）
  ipcMain.handle('execute-http-request', async (
    event: IpcMainInvokeEvent,
    options: {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeout?: number;
      maxRedirects?: number;
    }
  ): Promise<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    content: string;
    contentType: string;
  }> => {
    const logger = createMainLogger('HttpRequest');
    const { url, method = 'GET', headers = {}, body, timeout = 30000, maxRedirects = 64 } = options;
    
    // 内部函数：执行单个HTTP请求
    const makeRequest = (
      requestUrl: string,
      requestMethod: string,
      requestHeaders: Record<string, string>,
      requestBody: string | undefined,
      redirectCount: number = 0
    ): Promise<{
      status: number;
      statusText: string;
      headers: Record<string, string>;
      content: string;
      contentType: string;
    }> => {
      return new Promise((resolve, reject) => {
        try {
          // 检查重定向次数
          if (redirectCount > maxRedirects) {
            reject(new Error(`重定向次数超过限制 (${maxRedirects})`));
            return;
          }

          const urlObj = new URL(requestUrl);
          const isHttps = urlObj.protocol === 'https:';
          const httpModule = isHttps ? https : http;
          
          const requestOptions: http.RequestOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: requestMethod,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              ...requestHeaders
            },
            timeout: timeout
          };
          
          let timeoutId: NodeJS.Timeout | null = null;
          
          const req = httpModule.request(requestOptions, (res) => {
            let responseData = '';
            
            res.on('data', (chunk: Buffer) => {
              responseData += chunk.toString();
            });
            
            res.on('end', () => {
              if (timeoutId) {
                clearTimeout(timeoutId);
              }
              
              const responseHeaders: Record<string, string> = {};
              Object.keys(res.headers).forEach(key => {
                const value = res.headers[key];
                if (value) {
                  responseHeaders[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
                }
              });
              
              const statusCode = res.statusCode || 200;
              
              // 检查是否是重定向状态码
              if ((statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) && responseHeaders['location']) {
                const location = responseHeaders['location'];
                let redirectUrl: string;
                
                // 处理相对路径和绝对路径
                try {
                  redirectUrl = new URL(location, requestUrl).href;
                } catch {
                  redirectUrl = location;
                }
                
                logger.info(`跟随重定向: ${requestUrl} -> ${redirectUrl} (${statusCode})`);
                
                // 对于GET和HEAD请求，自动跟随重定向
                // 对于POST/PUT等，只有307/308才跟随，且不改变方法
                if (requestMethod === 'GET' || requestMethod === 'HEAD') {
                  // GET/HEAD请求，所有重定向都跟随，且改为GET
                  makeRequest(redirectUrl, 'GET', requestHeaders, undefined, redirectCount + 1)
                    .then(resolve)
                    .catch(reject);
                  return;
                } else if ((statusCode === 307 || statusCode === 308) && requestBody) {
                  // POST/PUT等请求，只有307/308才跟随，且保持原方法
                  makeRequest(redirectUrl, requestMethod, requestHeaders, requestBody, redirectCount + 1)
                    .then(resolve)
                    .catch(reject);
                  return;
                }
              }
              
              // 非重定向或无法跟随的重定向，返回响应
              resolve({
                status: statusCode,
                statusText: res.statusMessage || 'OK',
                headers: responseHeaders,
                content: responseData,
                contentType: responseHeaders['content-type'] || 'text/plain'
              });
            });
          });
          
          req.on('error', (error: Error) => {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            logger.error('HTTP请求失败:', error);
            reject(new Error(`HTTP请求失败: ${error.message}`));
          });
          
          req.on('timeout', () => {
            req.destroy();
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            reject(new Error('请求超时'));
          });
          
          // 设置超时
          timeoutId = setTimeout(() => {
            req.destroy();
            reject(new Error('请求超时'));
          }, timeout);
          
          // 发送请求体
          if (requestBody && (requestMethod === 'POST' || requestMethod === 'PUT' || requestMethod === 'PATCH')) {
            req.write(requestBody);
          }
          
          req.end();
        } catch (error) {
          logger.error('HTTP请求配置失败:', error);
          reject(new Error(`HTTP请求配置失败: ${error instanceof Error ? error.message : String(error)}`));
        }
      });
    };
    
    // 准备请求体
    let bodyString: string | undefined = undefined;
    if (body) {
      bodyString = body;
    }
    
    return makeRequest(url, method, headers, bodyString, 0);
  });
  
  ipcMain.handle('simpletex-ocr', async (event: IpcMainInvokeEvent, params: SimpleTexOCRData): Promise<any> => {
    return await handleSimpleTexOCR(params);
  });

  // PlantUML 渲染处理器
  ipcMain.handle('render-plantuml', async (event: IpcMainInvokeEvent, plantumlCode: string, format: string = 'svg'): Promise<string> => {
    return await renderPlantUMLToLocalImage(plantumlCode, format);
  });
  
  ipcMain.handle('render-echarts', async (event: IpcMainInvokeEvent, optionJson: string): Promise<string> => {
    // 主进程只返回 SVG 字符串，PNG 转换在渲染进程中完成
    return await renderEChartsToLocalImage(optionJson);
  });
  
  // SVG 转 PDF 处理器
  ipcMain.handle('convert-svg-to-pdf', async (event: IpcMainInvokeEvent, svgPath: string): Promise<{ success: boolean; pdfPath?: string; error?: string }> => {
    const logger = createMainLogger('SvgToPdf');
    try {
      const { convertSvgToPdf } = await import('./utils/svg-to-pdf');
      const pdfPath = await convertSvgToPdf(svgPath);
      return { success: true, pdfPath };
    } catch (error) {
      logger.error('SVG 转 PDF 失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // SVG 字符串 → PNG 文件（resvg）
  ipcMain.handle('convert-svg-string-to-png', async (event: IpcMainInvokeEvent, svgContent: string): Promise<{ success: boolean; url?: string; error?: string }> => {
    const logger = createMainLogger('SvgToPng');
    try {
      const { convertSvgStringToPngFile } = await import('./utils/svg-to-pdf');
      const url = await convertSvgStringToPngFile(svgContent);
      return { success: true, url };
    } catch (error) {
      logger.error('SVG 字符串转 PNG 失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // SVG 字符串 → PDF 文件（resvg）
  ipcMain.handle('convert-svg-string-to-pdf', async (event: IpcMainInvokeEvent, svgContent: string): Promise<{ success: boolean; pdfPath?: string; error?: string }> => {
    const logger = createMainLogger('SvgToPdf');
    try {
      const { convertSvgStringToPdfFile } = await import('./utils/svg-to-pdf');
      const url = await convertSvgStringToPdfFile(svgContent);
      // 从URL中提取文件路径（用于返回）
      const fileName = url.replace('http://localhost:52521/images/', '');
      const { imageUploadDir } = await import('./express-server');
      const pdfPath = path.join(imageUploadDir, fileName);
      return { success: true, pdfPath };
    } catch (error) {
      logger.error('SVG 字符串转 PDF 失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // 保存图片文件
  ipcMain.handle('save-image-file', async (event: IpcMainInvokeEvent, imageUrl: string, suggestedName: string): Promise<{ success: boolean; path?: string; error?: string }> => {
    const logger = createMainLogger('SaveImage');
    try {
      // 显示保存对话框
      const suggestedExt = (() => {
        const m = suggestedName && suggestedName.match(/\.([a-z0-9]+)$/i);
        return m ? m[1].toLowerCase() : '';
      })();
      let ext = suggestedExt || (imageUrl.endsWith('.svg') ? 'svg' : 'png');
      if (!suggestedExt && imageUrl.startsWith('data:')) {
        if (imageUrl.startsWith('data:image/svg+xml')) ext = 'svg';
        else if (imageUrl.startsWith('data:image/png')) ext = 'png';
        else if (imageUrl.startsWith('data:application/pdf')) ext = 'pdf';
      }
      const filters: Electron.FileFilter[] = [
        { name: ext.toUpperCase(), extensions: [ext] },
        { name: 'All Files', extensions: ['*'] },
      ];
      
      const result: SaveDialogReturnValue = await dialog.showSaveDialog(mainWindow!, {
        title: t('main.dialogs.saveFileTitle', '保存文件'),
        defaultPath: suggestedName.endsWith(`.${ext}`) ? suggestedName : `${suggestedName}.${ext}`,
        filters,
      });
      
      if (result.canceled || !result.filePath) {
        return { success: false };
      }
      
      const targetPath = result.filePath;
      
      // 下载图片
      logger.debug(`开始下载图片: ${imageUrl}`);
      let fileBuffer: Buffer;
      if (imageUrl.startsWith('data:')) {
        // 处理 data URL
        const commaIdx = imageUrl.indexOf(',');
        const meta = imageUrl.substring(5, commaIdx); // e.g. image/png;base64
        const base64 = imageUrl.substring(commaIdx + 1);
        const binary = Buffer.from(base64, 'base64');
        fileBuffer = binary;
      } else if (fs.existsSync(imageUrl)) {
        // 本地文件路径
        fileBuffer = fs.readFileSync(imageUrl);
      } else {
        // HTTP(S) 下载
        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new Error(`下载图片失败: ${response.status} ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();
        fileBuffer = Buffer.from(buffer);
      }
      
      // 确保父目录存在
      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      
      // 保存文件
      fs.writeFileSync(targetPath, fileBuffer);
      logger.info(`图片已保存到: ${targetPath}`);
      
      return {
        success: true,
        path: targetPath,
      };
    } catch (error) {
      logger.error('保存图片失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // 保存 JSON 文件
  ipcMain.handle('save-json-file', async (event: IpcMainInvokeEvent, jsonContent: string, suggestedName: string): Promise<{ success: boolean; path?: string; error?: string; canceled?: boolean }> => {
    const logger = createMainLogger('SaveJson');
    try {
      // 使用调用 IPC 的窗口，而不是固定的 mainWindow
      // 这样可以确保对话框显示在正确的窗口（主窗口或设置窗口）
      const targetWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow
      if (!targetWindow) {
        logger.error('无法获取窗口引用');
        return {
          success: false,
          error: '无法获取窗口引用'
        };
      }

      const filters: Electron.FileFilter[] = [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] },
      ];
      
      logger.debug(`显示保存对话框，建议文件名: ${suggestedName}`);
      const result: SaveDialogReturnValue = await dialog.showSaveDialog(targetWindow, {
        title: t('main.dialogs.saveFileTitle', '保存文件'),
        defaultPath: suggestedName.endsWith('.json') ? suggestedName : `${suggestedName}.json`,
        filters,
      });
      
      if (result.canceled || !result.filePath) {
        logger.debug('用户取消了保存对话框');
        return { success: false, canceled: true };
      }
      
      const targetPath = result.filePath;
      logger.debug(`用户选择保存路径: ${targetPath}`);
      
      // 确保父目录存在
      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      
      // 保存文件
      fs.writeFileSync(targetPath, jsonContent, 'utf-8');
      logger.info(`JSON文件已保存到: ${targetPath}`);
      
      return {
        success: true,
        path: targetPath,
      };
    } catch (error) {
      logger.error('保存JSON文件失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

/**
 * 绑定终端命令执行处理器
 */
function bindTerminalHandlers(): void {
  ipcMain.handle('execute-terminal-command', async (
    event: IpcMainInvokeEvent,
    options: { command: string; cwd?: string; timeout?: number; invocationId?: string }
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
    const logger = createMainLogger('TerminalCommand');
    const { command, cwd, timeout = 30000 } = options;

    return new Promise((resolve, reject) => {
      logger.info(`执行命令: ${command} (cwd: ${cwd || process.cwd()}, timeout: ${timeout}ms)`);

      // 根据平台选择shell
      const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
      const shellArgs = process.platform === 'win32' ? ['/c'] : ['-c'];

      // 创建超时定时器
      let timeoutId: NodeJS.Timeout | null = null;
      let childProcess: ReturnType<typeof spawn> | null = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (childProcess && !childProcess.killed) {
          childProcess.kill('SIGTERM');
          // 如果SIGTERM无效，强制kill
          setTimeout(() => {
            if (childProcess && !childProcess.killed) {
              childProcess.kill('SIGKILL');
            }
          }, 1000);
        }
      };

      try {
        childProcess = spawn(shell, [...shellArgs, command], {
          cwd: cwd || process.cwd(),
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        const invocationId = options.invocationId || `terminal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

        childProcess.stdout?.on('data', (data: Buffer) => {
          const text = data.toString()
          stdout += text
          // 实时发送 stdout 到渲染进程
          event.sender.send('terminal-stdout-stream', {
            invocationId,
            data: text,
            command
          })
        });

        childProcess.stderr?.on('data', (data: Buffer) => {
          const text = data.toString()
          stderr += text
          // 实时发送 stderr 到渲染进程
          event.sender.send('terminal-stderr-stream', {
            invocationId,
            data: text,
            command
          })
        });

        childProcess.on('close', (code: number | null) => {
          cleanup();
          const exitCode = code ?? 1;
          logger.info(`命令执行完成: exitCode=${exitCode}`);
          resolve({
            exitCode,
            stdout: stdout.trim(),
            stderr: stderr.trim()
          });
        });

        childProcess.on('error', (error: Error) => {
          cleanup();
          logger.error('命令执行错误:', error);
          reject(error);
        });

        // 设置超时
        timeoutId = setTimeout(() => {
          logger.warn(`命令执行超时: ${command}`);
          cleanup();
          reject(new Error(`命令执行超时 (${timeout}ms)`));
        }, timeout);

      } catch (error) {
        cleanup();
        logger.error('启动命令失败:', error);
        reject(error);
      }
    });
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
        mainWindow?.webContents.send(
          'compile-latex-fail',
          t('main.latex.compileFailed', `Compilation failed, exit code: ${result.exitCode}`, { code: String(result.exitCode ?? '') })
        );
      }
      
      return result;
    } catch (error) {
      const errorMessage = (error as Error).message;
      mainWindow?.webContents.send(
        'compile-latex-fail',
        errorMessage || t('main.latex.compileFailed', 'Compilation failed, exit code: -1', { code: '-1' })
      );
      logger.error('PDF 编译失败:', errorMessage);
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
  ipcMain.on('register-ai-task', (_event: IpcMainEvent, taskInfo: TaskInfo) => {
    const targetWindow = (mainWindow && !mainWindow.isDestroyed())
      ? mainWindow
      : BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('#/home'));

    targetWindow?.webContents.send('register-ai-task', taskInfo);
  });

  ipcMain.on('ai-task-done', (_event: IpcMainEvent, handle: string) => {
    const targetWindow = (mainWindow && !mainWindow.isDestroyed())
      ? mainWindow
      : BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('#/home'));

    targetWindow?.webContents.send('ai-task-done', handle);
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
        logger.info('已尝试打开文件', path);
      }).catch(err => {
        logger.error(`打开文件失败: ${err}`);
      });
    }
  });

  notification.show();
};

/**
 * 更新窗口标题
 */
let lastDocumentTitle = '';

const updateWindowTitle = (title: string): void => {
  lastDocumentTitle = title;

  if (mainWindow) {
    if (title.length > 30) {
      title = title.substring(0, 30) + '...';
    }
    
    if (title.length === 0) {
      mainWindow.setTitle(t('main.windows.appTitle', 'MetaDoc'));
    } else {
      const truncated = title;
      mainWindow.setTitle(
        t('main.windows.documentTitlePattern', '{name} - {app}', {
          name: truncated,
          app: t('main.windows.appTitle', 'MetaDoc')
        })
      );
    }
  }
};

export const refreshMainWindowTitle = (): void => {
  updateWindowTitle(lastDocumentTitle);
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
  
  if (recentDocs.length > 50) {
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
  store.set(key, value);

  if (key === 'loggingEnabled') {
    updateLoggerConfig({ enabled: Boolean(value) });
  }

  if (key === 'loggingLevel') {
    const normalized = typeof value === 'string' ? value.toLowerCase() : value;
    updateLoggerConfig({ level: normalized as LogLevel });
  }
}

// ============ 应用控制 ============

const quit = (): void => {
  app.quit();
};

// ============ 文件操作 ============

/**
 * 保存文件
 */
const saveInternal = async (
  data: SaveData,
  saveAs: boolean,
): Promise<{ path: string; format: string } | null> => {
  let filePath = data.path;
  let content = '';

  if (filePath === '' || saveAs) {
    filePath = await chooseSaveFile(data);
    if (!filePath) return null;
  }

  const format = data.format || (path.extname(filePath).slice(1).toLowerCase() as DocumentFormat);
  if (!format) {
    return null;
  }

  filePath = ensureFileNameExtension(filePath, format);

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
      return null;
  }

  // 标记文件正在保存，避免触发文件监听
  const normalizedPath = path.normalize(filePath);
  fileWatcherService.markFileAsSaving(normalizedPath, 2000); // 2秒内忽略文件变化

  // 写入文件
  fs.writeFileSync(filePath, content);
  
  return {
    path: filePath,
    format,
  };
};

const save = async (data: SaveData, saveAs: boolean): Promise<void> => {
  const result = await saveInternal(data, saveAs);
  if (result) {
    const fileName = result.path ? path.basename(result.path) : '';
    mainWindow?.webContents.send('save-success', {
      path: result.path,
      saveAs,
      format: result.format,
      fileName,
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
      path: filePath,
      fileName: path.basename(filePath),
    };
    
    mainWindow?.webContents.send('open-doc-success', payload);
    mainWindow?.webContents.send('update-current-path', filePath);
    return;
  }

  const supportedFilterName = t('main.dialogs.filters.supportedDocuments', 'MetaDoc 文档');

  const result: OpenDialogReturnValue = await dialog.showOpenDialog(mainWindow!, {
    title: t('main.dialogs.openFileTitle'),
    filters: [
      { name: supportedFilterName, extensions: ['md', 'tex', 'json'] },
      { name: t('main.dialogs.filters.markdown'), extensions: ['md'] },
      { name: t('main.dialogs.filters.latex'), extensions: ['tex'] },
      { name: t('main.dialogs.filters.json'), extensions: ['json'] },
      { name: t('main.dialogs.filters.all'), extensions: ['*'] },
    ],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];
    const content = fs.readFileSync(selectedPath, 'utf-8');
    const format = path.extname(selectedPath).slice(1).toLowerCase();
    
    const payload = {
      content,
      format,
      path: selectedPath,
      fileName: path.basename(selectedPath),
    };
    
    mainWindow?.webContents.send('open-doc-success', payload);
    mainWindow?.webContents.send('update-current-path', selectedPath);
  }
};

/**
 * 选择保存文件路径
 */
const getSaveFilterByFormat = (format: DocumentFormat): Electron.FileFilter => {
  switch (format) {
    case 'md':
      return { name: t('main.dialogs.filters.markdown'), extensions: ['md'] };
    case 'tex':
      return { name: t('main.dialogs.filters.latex'), extensions: ['tex'] };
    case 'json':
      return { name: t('main.dialogs.filters.json'), extensions: ['json'] };
    default:
      return { name: t('main.dialogs.filters.all'), extensions: ['*'] };
  }
};

const ensureFileNameExtension = (input: string, format: DocumentFormat): string => {
  const expectedExt = `.${format}`;

  if (!input || input.trim().length === 0) {
    return `Untitled${expectedExt}`;
  }

  const normalized = input.trim();
  const existingExt = path.extname(normalized).toLowerCase();

  if (existingExt === expectedExt) {
    return normalized;
  }

  if (existingExt) {
    return `${normalized.slice(0, -existingExt.length)}${expectedExt}`;
  }

  return `${normalized}${expectedExt}`;
};

/**
 * 从文档内容中提取标题（用于文件名）
 */
function extractTitleFromSaveData(data: SaveData): string | null {
  try {
    const metadata = JSON.parse(data.json);
    const metaTitle = metadata.current_article_meta_data?.title;
    
    // 如果元信息中有标题，直接使用
    if (metaTitle && typeof metaTitle === 'string' && metaTitle.trim().length > 0) {
      return metaTitle.trim();
    }
    
    // 如果元信息没有标题，尝试从内容中提取
    const format = data.format || 'md';
    let content = '';
    
    if (format === 'md') {
      content = data.md || '';
    } else if (format === 'tex') {
      content = data.tex || '';
    }
    
    if (!content) {
      return null;
    }
    
    // 简单的标题提取逻辑（与渲染进程保持一致）
    if (format === 'md') {
      // 移除 Markdown 中的元信息标记（<!--meta-info: ... -->）
      const contentWithoutMeta = content.replace(/<!--meta-info:[^>]*-->/g, '').trim();
      const firstTitleMatch = contentWithoutMeta.match(/^(#+)\s+(.+)$/m);
      if (firstTitleMatch) {
        const title = firstTitleMatch[2].trim();
        return title.replace(/\*\*|__|\*|_|`/g, '').trim();
      }
    } else if (format === 'tex') {
      // 移除 LaTeX 中的元信息标记（%META-INFO: ... 和警告行）
      const contentWithoutMeta = content
        .replace(/% 请勿手动修改此行及下面的 META-INFO.*\n?/g, '')
        .replace(/%META-INFO:[^\n]*\n?/g, '')
        .trim();
      // 尝试匹配 \title{}
      const titleMatch = contentWithoutMeta.match(/\\title\{([^}]+)\}/);
      if (titleMatch) {
        return titleMatch[1].trim();
      }
      // 尝试匹配 \section{}
      const sectionMatch = contentWithoutMeta.match(/\\section\{([^}]+)\}/);
      if (sectionMatch) {
        return sectionMatch[1].trim();
      }
    }
    
    return null;
  } catch (error) {
    logger.warn('提取标题失败', error);
    return null;
  }
}

/**
 * 清理标题，使其适合作为文件名
 */
function sanitizeTitleForFilename(title: string): string {
  if (!title || typeof title !== 'string') {
    return '';
  }
  
  return title
    .trim()
    .replace(/[<>:"/\\|?*]/g, '') // 移除 Windows 不允许的字符
    .replace(/\s+/g, ' ') // 合并多个空格
    .replace(/^\s+|\s+$/g, '') // 移除首尾空格
    .substring(0, 100); // 限制长度
}

const chooseSaveFile = async (data: SaveData): Promise<string> => {
  const dateString = new Date()
    .toISOString()
    .replace(/:/g, '-')
    .replace('T', '_')
    .split('.')[0];

  // 尝试从元信息或内容中提取标题
  const extractedTitle = extractTitleFromSaveData(data);
  const sanitizedTitle = extractedTitle ? sanitizeTitleForFilename(extractedTitle) : null;
  
  // 优先使用提取的标题，否则使用时间戳
  const baseName = sanitizedTitle || dateString;
  const format = data.format || (data.args?.format as DocumentFormat) || 'md';

  const filters: Electron.FileFilter[] = [getSaveFilterByFormat(format)];
  const defaultPath = ensureFileNameExtension(baseName, format);

  const result: SaveDialogReturnValue = await dialog.showSaveDialog(mainWindow!, {
    title: t('main.dialogs.saveFileTitle'),
    defaultPath,
    filters,
  });

  if (!result.canceled && result.filePath) {
    const normalizedPath = ensureFileNameExtension(result.filePath, format);
    mainWindow?.webContents.send('save-file-path', normalizedPath);
    return normalizedPath;
  }

  return '';
};

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
    logger.error('处理SimpleTeX OCR失败:', err);
    return 'error:' + err;
  }
}

/**
 * 使用 node-plantuml 渲染 PlantUML 代码为本地 SVG
 * @param plantumlCode PlantUML 源代码
 * @returns 本地 SVG 的 HTTP URL
 */
async function renderPlantUMLToLocalImage(plantumlCode: string, format: string = 'svg'): Promise<string> {
  // @ts-ignore
  const plantuml = require('node-plantuml');
  const logger = createMainLogger('PlantUML');
  const crypto = require('crypto');
  
  // 关键修复：设置 Java 环境变量，确保使用 UTF-8 编码
  // 保存原始环境变量
  const originalJavaOpts = process.env.JAVA_OPTS;
  const originalJavaOptions = process.env._JAVA_OPTIONS;
  const originalLang = process.env.LANG;
  const originalLcAll = process.env.LC_ALL;
  
  try {
    // 设置 Java 环境变量，强制使用 UTF-8 编码
    // JAVA_OPTS 和 _JAVA_OPTIONS 都可以设置 Java 参数
    if (!process.env.JAVA_OPTS || !process.env.JAVA_OPTS.includes('-Dfile.encoding')) {
      process.env.JAVA_OPTS = (process.env.JAVA_OPTS || '') + ' -Dfile.encoding=UTF-8';
    }
    if (!process.env._JAVA_OPTIONS || !process.env._JAVA_OPTIONS.includes('-Dfile.encoding')) {
      process.env._JAVA_OPTIONS = (process.env._JAVA_OPTIONS || '') + ' -Dfile.encoding=UTF-8';
    }
    
    // 设置系统语言环境为 UTF-8（Windows 上可能不需要，但设置也无妨）
    if (!process.env.LANG) {
      process.env.LANG = 'en_US.UTF-8';
    }
    if (!process.env.LC_ALL) {
      process.env.LC_ALL = 'en_US.UTF-8';
    }
    
    // 确保代码是 UTF-8 编码的字符串，移除可能的 BOM
    let cleanCode = plantumlCode.replace(/^\uFEFF/, '').trim();
    
    if (!cleanCode) {
      throw new Error('PlantUML 代码为空');
    }
    
    // 关键修复：检查并处理 !theme 指令
    // 如果 node-plantuml 使用的 PlantUML 版本较旧，可能不支持 !theme 指令
    // 在这种情况下，我们需要移除 !theme 指令以避免语法错误
    // 注意：这是一个临时解决方案，更好的方法是更新 PlantUML jar 文件
    // 修复正则表达式：匹配整行，包括可能的行首空格、主题名称（可能包含连字符）、注释等
    // 格式示例：!theme plain、!theme cerulean、!theme reddress-darkred、!theme plain // comment
    const hasThemeDirective = /^[ \t]*!theme\s+[^\n]+/mi.test(cleanCode);
    if (hasThemeDirective) {
      logger.warn('检测到 !theme 指令，如果 PlantUML 版本不支持，可能会导致语法错误');
      logger.warn('建议：更新 node-plantuml 使用的 PlantUML jar 文件到最新版本');
      // 移除整行：匹配行首可能的空格/制表符 + !theme + 空格 + 主题名称和可能的注释 + 换行符
      // 使用多行模式 (m) 和全局模式 (g) 来匹配所有出现的 !theme 行
      cleanCode = cleanCode.replace(/^[ \t]*!theme\s+[^\n]*(?:\r?\n|$)/gmi, '');
      logger.info('已移除 !theme 指令以兼容旧版本 PlantUML');
    }
    
    // 关键修复：确保接收到的代码是正确编码的 UTF-8 字符串
    // 如果代码是字符串，确保它是有效的 UTF-8
    if (typeof cleanCode === 'string') {
      try {
        // 使用 Buffer 来验证和修复编码
        // 将字符串编码为 UTF-8 Buffer，然后解码回来，确保编码正确
        const buffer = Buffer.from(cleanCode, 'utf-8');
        cleanCode = buffer.toString('utf-8');
      } catch (error) {
        logger.warn('代码编码验证失败，使用原始代码:', error);
        // 如果编码转换失败，使用原始代码
      }
    }
    
    logger.info('开始渲染 PlantUML，代码长度:', cleanCode.length, '格式:', format);
    logger.debug('PlantUML 代码前200字符:', cleanCode.substring(0, 200));
    logger.debug('Java 环境变量 JAVA_OPTS:', process.env.JAVA_OPTS);
    logger.debug('Java 环境变量 _JAVA_OPTIONS:', process.env._JAVA_OPTIONS);
    
    // 根据格式选择输出类型
    const outputFormat = format === 'png' ? 'png' : 'svg';
    
    // 检查 node-plantuml 的 API：可能需要使用 Buffer 或直接传递字符串
    // 根据 node-plantuml 文档，应该直接传递字符串，不需要指定编码
    // 注意：我们已经修改了 node-plantuml 的源码，添加了 -Dfile.encoding=UTF-8 参数
    const gen = plantuml.generate({
      format: outputFormat,
    });
    
    // 将 PlantUML 代码写入生成器
    // 关键：确保使用 UTF-8 编码的 Buffer 写入，而不是直接写入字符串
    // 这样可以确保编码正确传递
    const codeBuffer = Buffer.from(cleanCode, 'utf-8');
    gen.in.write(codeBuffer);
    gen.in.end();
    
    // 收集生成的图片数据
    const chunks: Buffer[] = [];
    gen.out.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    
    // 收集错误输出（stderr）
    const errorChunks: Buffer[] = [];
    
    // 等待生成完成
    // 需要同时等待 stdout 和 stderr 都结束
    await new Promise<void>((resolve, reject) => {
      let outEnded = false;
      let errEnded = false;
      
      const checkComplete = () => {
        if (outEnded && errEnded) {
          resolve();
        }
      };
      
      gen.out.on('end', () => {
        outEnded = true;
        checkComplete();
      });
      gen.out.on('error', (err: Error) => {
        logger.error('PlantUML stdout错误:', err);
        reject(err);
      });
      
      if (gen.err) {
        // 收集 stderr 数据
        gen.err.on('data', (chunk: Buffer) => {
          errorChunks.push(chunk);
        });
        
        gen.err.on('end', () => {
          errEnded = true;
          checkComplete();
        });
        gen.err.on('error', (err: Error) => {
          logger.warn('PlantUML stderr错误:', err.message);
          errEnded = true;
          checkComplete();
        });
      } else {
        errEnded = true;
        checkComplete();
      }
      
      // 设置超时，避免无限等待
      setTimeout(() => {
        if (!outEnded || !errEnded) {
          logger.warn('PlantUML 渲染超时');
          resolve(); // 继续处理，即使超时
        }
      }, 30000); // 30秒超时
    });
    
    // 检查是否有错误输出（stderr）
    if (errorChunks.length > 0) {
      const errorOutput = Buffer.concat(errorChunks).toString('utf-8');
      if (errorOutput.trim()) {
        logger.error('PlantUML stderr错误输出:', errorOutput);
        // 尝试提取错误信息
        const errorMatch = errorOutput.match(/(?:syntax\s+error|error|Error)[:\s]*(.+?)(?:\n|$)/i);
        const errorMsg = errorMatch ? errorMatch[1].trim() : errorOutput.trim();
        throw new Error(`PlantUML语法错误: ${errorMsg}`);
      }
    }
    
    const imageBuffer = Buffer.concat(chunks);
    logger.info('PlantUML 渲染完成，大小:', imageBuffer.length, 'bytes');
    
    if (imageBuffer.length === 0) {
      throw new Error(`生成的 ${outputFormat.toUpperCase()} 为空`);
    }
    
    // 错误检测逻辑：
    // 1. 如果 stderr 有输出，说明有错误（已经在上面检查过了）
    // 2. 如果 stderr 没有输出，但文件大小异常小，可能是错误图片
    // 3. 对于 SVG，检查是否是有效的 SVG 格式
    // 注意：不要检查 SVG 内容中的 "Syntax Error" 文本，因为正常的 SVG 可能也包含这些文本
    
    if (outputFormat === 'svg') {
      const imageContent = imageBuffer.toString('utf-8');
      
      // 检查是否是有效的 SVG（包含 <svg> 标签）
      if (!imageContent.includes('<svg')) {
        // 如果不是 SVG 格式，可能是纯文本错误信息
        const errorMsg = imageContent.substring(0, 200).trim();
        logger.error('PlantUML渲染返回非SVG内容，可能是错误:', errorMsg);
        throw new Error(`PlantUML语法错误: ${errorMsg}`);
      }
      
      // 检查文件大小是否异常小（错误 SVG 通常很小，小于 2KB）
      // 正常的 PlantUML SVG 通常至少几 KB
      if (imageBuffer.length < 2048) {
        // 进一步检查：如果 SVG 很小，且包含错误标记，才认为是错误
        // 错误 SVG 通常包含 "[From string" 和 "Syntax Error" 的组合
        if (imageContent.includes('[From string') && 
            (imageContent.includes('Syntax Error') || imageContent.includes('syntax error'))) {
          logger.error('PlantUML渲染检测到语法错误（文件大小异常小且包含错误标记）');
          throw new Error('PlantUML语法错误: 检测到语法错误，请检查 PlantUML 代码');
        }
        // 如果只是文件小，但不包含错误标记，可能是简单的图表，不报错
      }
    } else if (outputFormat === 'png') {
      // 对于PNG，检查文件大小是否异常小（通常错误PNG文件很小）
      // 如果文件大小小于1KB，可能是错误图片
      if (imageBuffer.length < 1024) {
        logger.warn('PlantUML生成的PNG文件异常小，可能是语法错误:', imageBuffer.length, 'bytes');
        // PNG 无法检查内容，只警告，不报错
      }
    }
    
    // 保存到本地图片目录（使用基于源码+格式的稳定哈希文件名，避免重复生成）
    const { imageUploadDir } = await import('./express-server');
    const fileExt = outputFormat === 'png' ? 'png' : 'svg';
    const hash = crypto.createHash('sha256').update(String(plantumlCode) + ':' + outputFormat).digest('hex').slice(0, 16);
    const fileName = `${hash}_plantuml.${fileExt}`;
    const filePath = path.join(imageUploadDir, fileName);

    // 如已存在，直接返回 URL（复用）
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      const existsUrl = `http://localhost:52521/images/${fileName}`;
      logger.info('PlantUML 已存在，复用文件:', existsUrl);
      return existsUrl;
    } catch {
      // not exists, continue to write
    }
    
    await fs.promises.writeFile(filePath, imageBuffer);
    logger.info(`${outputFormat.toUpperCase()} 已保存到:`, filePath);
    
    // 返回本地 HTTP URL
    const localUrl = `http://localhost:52521/images/${fileName}`;
    logger.info('返回本地 URL:', localUrl);
    
    return localUrl;
  } catch (error) {
    logger.error('PlantUML 渲染失败:', error);
    throw error;
  } finally {
    // 恢复原始的环境变量（可选，为了安全我们暂时不恢复）
    // 让 UTF-8 设置保持全局，确保所有 PlantUML 调用都使用 UTF-8
    // 如果需要恢复，可以取消下面的注释
    /*
    if (originalJavaOpts !== undefined) {
      process.env.JAVA_OPTS = originalJavaOpts;
    } else {
      delete process.env.JAVA_OPTS;
    }
    if (originalJavaOptions !== undefined) {
      process.env._JAVA_OPTIONS = originalJavaOptions;
    } else {
      delete process.env._JAVA_OPTIONS;
    }
    */
  }
}

/**
 * 使用 ECharts SSR 渲染图表为 SVG
 * 注意：主进程只负责生成 SVG，PNG 转换在渲染进程中完成
 * @param optionJson ECharts option 的 JSON 字符串
 * @returns SVG 字符串内容
 */
async function renderEChartsToLocalImage(optionJson: string): Promise<string> {
  // @ts-ignore
  const echarts = require('echarts');
  const logger = createMainLogger('ECharts');
  
  // 递归恢复函数（将字符串形式的函数转换回函数对象）
  function restoreFunctions(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      // 如果是字符串且看起来像函数，尝试转换
      if (typeof obj === 'string' && obj.trim().startsWith('function')) {
        try {
          return new Function('return ' + obj)();
        } catch {
          return obj;
        }
      }
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(restoreFunctions);
    }
    
    const restored: any = {};
    for (const key in obj) {
      const value = obj[key];
      if (typeof value === 'string' && value.trim().startsWith('function')) {
        try {
          restored[key] = new Function('return ' + value)();
        } catch {
          restored[key] = restoreFunctions(value);
        }
      } else {
        restored[key] = restoreFunctions(value);
      }
    }
    return restored;
  }
  
  try {
    logger.info('开始渲染 ECharts 为 SVG');
    
    let option;
    try {
      option = JSON.parse(optionJson);
      // 检查是否有函数被序列化为字符串，需要恢复
      option = restoreFunctions(option);
    } catch (e) {
      // 如果JSON解析失败，可能是包含了函数，尝试使用Function解析
      try {
        // 使用Function构造器安全地解析（避免直接eval）
        option = new Function('return ' + optionJson)();
      } catch (evalError) {
      const errorMessage = e instanceof Error ? e.message : String(e);
        const evalErrorMessage = evalError instanceof Error ? evalError.message : String(evalError);
        throw new Error(`ECharts option 解析失败。JSON错误: ${errorMessage}，Eval错误: ${evalErrorMessage}`);
      }
    }
    
    // 使用 SSR SVG 渲染（零依赖）
    const chart = echarts.init(null, null, {
      renderer: 'svg',
      ssr: true,
      width: 800,
      height: 600,
    });
    
    chart.setOption(option);
    const svgStr = chart.renderToSVGString();
    chart.dispose();
    
    logger.info('ECharts SVG 渲染完成，大小:', svgStr.length, 'bytes');
    
    // 返回 SVG 字符串内容（不保存文件，由渲染进程决定如何处理）
    return svgStr;
  } catch (error) {
    logger.error('ECharts 渲染失败:', error);
    throw error;
  }
}
