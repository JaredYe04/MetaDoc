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
import iconv from 'iconv-lite';

// 内部模块导入
import { 
  mainWindow, 
  openSettingDialog, 
  openAiChatDialog, 
  openFomulaRecognitionDialog, 
  openAiGraphDialog,
  openDataAnalysisDialog,
  openOcrDialog,
  openAttachmentDialog,
  openGraphDialog,
  initBroadcastChannel 
} from './index';
import { dirname } from './index';
import { imageUploadDir } from './express-server';
import { queryKnowledgeBase, getResourcesPath, compileLatexToPDF, setEmbeddingMode, getEmbeddingMode, fileConversionService } from './utils';
import { initUpdateService, checkForUpdates, setUpdateChannel, getUpdateStatus, downloadUpdate, quitAndInstall, type UpdateChannel } from './utils/update-service';
import { getSystemFonts, type SystemFont } from './utils/font-service';
import {
  getDatabase,
  getDatabasePath,
  isSqliteVecAvailable,
  tableExists,
  query,
  execute
} from './database/database';
import {
  ensureInitialized,
  createKnowledgeFile,
  getKnowledgeFileByFilename,
  getKnowledgeFileById,
  updateKnowledgeFile,
  deleteKnowledgeFile,
  createDataChunks,
  getDataChunksByFileId,
  deleteDataChunksByFileId,
  createVectors,
  getVectorsByFileId,
  searchSimilarVectors
} from './database/knowledge-db';
import ocrService from './utils/ocr-service';
import { performSpellCheck, type SpellCheckParams } from './utils/spell-check-service';
import { addWordToDictionary, addWordsToDictionary } from './utils/spell-check-dictionary';
import type { LaTeXCompileResult } from '../types/utils';
import type { DocumentFormat } from '../types';
import { performExportRequest, type RendererExportPayload, abortExportTask } from './export/export-manager';
import { MainProgressHandle } from './utils/progress-handle';
import { createMainLogger, handleRendererLog, getLoggerConfig, getLoggerHistory, openCurrentLogFile, openLogDirectory, updateLoggerConfig, cleanupOldLogs } from './logger';
import { getServiceStatus } from './service-status';
import type { LogPayload, LogLevel } from '../common/logger-constants';
import { t } from './i18n';
import { fileWatcherService } from './utils/file-watcher-service';
import { directoryWatcherService } from './utils/directory-watcher-service';
import { convertSvgToPdf, convertSvgStringToPngFile, convertSvgStringToPdfFile } from './utils/svg-to-pdf';
import { queryOne, transaction } from './database/database';
import { isSupportedFormat } from './utils/supported-formats';

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
  sidecarMetadata?: Buffer | Uint8Array | number[]; // Sidecar文件的元信息（二进制，渲染进程传递Uint8Array，主进程转换为Buffer）
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

interface RemoveRecentDocData {
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
  bindDatabaseTestHandlers();
  bindDatabaseHandlers();
  bindMathHandlers();
  bindSpellCheckHandlers();
  
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
  
  // 窗口控制
  ipcMain.on('window-minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });
  
  ipcMain.on('window-maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
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
    openGraphDialog();
  });
  
  ipcMain.on('smart-drawing-assistant', () => {
    openGraphDialog();
  });
  
  ipcMain.on('fomula-recognition', () => {
    openFomulaRecognitionDialog();
  });
  
  ipcMain.on('data-analysis', () => {
    openDataAnalysisDialog();
  });
  
  ipcMain.on('ocr', () => {
    openOcrDialog();
  });
  
  ipcMain.on('attachment', () => {
    openAttachmentDialog();
  });
  
  ipcMain.on('graph', () => {
    openGraphDialog();
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
  
  // 保存文件对话框
  ipcMain.handle('save-file-dialog', async (event: IpcMainInvokeEvent, options: { defaultName?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<{ canceled: boolean; filePath?: string }> => {
    try {
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: options.defaultName ? '保存文件' : '保存文件',
        defaultPath: options.defaultName,
        filters: options.filters || [{ name: 'All Files', extensions: ['*'] }]
      });
      
      if (result.canceled || !result.filePath) {
        return { canceled: true };
      }
      
      return { canceled: false, filePath: result.filePath };
    } catch (error) {
      logger.error('保存文件对话框失败:', error);
      throw error;
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

  // 打开对话框（支持文件和文件夹选择）
  ipcMain.handle('show-open-dialog', async (event: IpcMainInvokeEvent, options: {
    title?: string
    defaultPath?: string
    filters?: Array<{ name: string; extensions: string[] }>
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>
  }): Promise<{ canceled: boolean; filePaths?: string[] }> => {
    try {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: options.title || '选择文件或文件夹',
        defaultPath: options.defaultPath,
        filters: options.filters,
        properties: options.properties || ['openFile']
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { canceled: true };
      }

      return { canceled: false, filePaths: result.filePaths };
    } catch (error) {
      logger.error('打开对话框失败:', error);
      throw error;
    }
  });

  // 读取目录内容
  ipcMain.handle('read-directory', async (event: IpcMainInvokeEvent, dirPath: string): Promise<Array<{ name: string; path: string; isDirectory: boolean }>> => {
    try {
      if (!fs.existsSync(dirPath)) {
        throw new Error(`目录不存在: ${dirPath}`);
      }

      const stats = fs.statSync(dirPath);
      if (!stats.isDirectory()) {
        throw new Error(`路径不是目录: ${dirPath}`);
      }

      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const result: Array<{ name: string; path: string; isDirectory: boolean }> = [];

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        result.push({
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory()
        });
      }

      return result;
    } catch (error) {
      logger.error('读取目录失败:', error);
      throw error;
    }
  });
  
  // 检查文件是否存在
  ipcMain.handle('file-exists', async (event: IpcMainInvokeEvent, filePath: string): Promise<boolean> => {
    try {
      return fs.existsSync(filePath);
    } catch (error) {
      logger.error('检查文件是否存在失败:', error);
      return false;
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

  // 读取二进制文件内容（用于PDF等二进制文件）
  ipcMain.handle('read-file-buffer', async (event: IpcMainInvokeEvent, filePath: string): Promise<Buffer | null> => {
    try {
      if (!fs.existsSync(filePath)) {
        // 文件不存在时返回 null，而不是抛出错误
        return null;
      }
      const buffer = fs.readFileSync(filePath);
      return buffer;
    } catch (error) {
      logger.error('读取二进制文件失败:', error);
      throw error;
    }
  });

  // 将PDF文件转换为Markdown
  ipcMain.handle('convert-pdf-to-markdown', async (event: IpcMainInvokeEvent, filePath: string): Promise<{ success: boolean; markdown?: string; error?: string }> => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: '文件不存在' };
      }

      // 读取PDF文件
      const pdfBuffer = fs.readFileSync(filePath);

      // 导入 node-pdf-to-markdown
      const pdf2md = require('node-pdf-to-markdown');
      
      // 获取PDF文件名（不含扩展名）并转换为base64编码的前16位字符
      // 这样可以避免特殊字符（空格、箭头等）导致图片路径解析失败
      const originalFileName = path.basename(filePath, path.extname(filePath));
      const pdfTitle = Buffer.from(originalFileName, 'utf8').toString('base64').substring(0, 16);
      
      // 转换PDF为Markdown，使用 relative 模式获取图片映射表
      const result = await pdf2md(pdfBuffer, {
        imageMode: 'relative',
        pdfTitle: pdfTitle
      });

      // result.markdown: string[] - Markdown 文本数组
      // result.images: Map<string, Buffer> - 图片名称到图片 Buffer 的映射
      const markdownPages = result.markdown;
      const images = result.images;

      // 确保图片上传目录存在
      if (!fs.existsSync(imageUploadDir)) {
        fs.mkdirSync(imageUploadDir, { recursive: true });
      }

      // 上传图片并构建图片名称到URL的映射
      const imageUrlMap = new Map<string, string>();
      
      // 导入 form-data 用于文件上传
      const FormData = require('form-data');
      
      for (const [imageName, imageBuffer] of images.entries()) {
        try {
          // 使用 form-data 创建上传请求
          const formData = new FormData();
          formData.append('file[]', imageBuffer, {
            filename: imageName,
            contentType: imageName.endsWith('.png') ? 'image/png' : 
                        imageName.endsWith('.jpg') || imageName.endsWith('.jpeg') ? 'image/jpeg' :
                        imageName.endsWith('.gif') ? 'image/gif' :
                        imageName.endsWith('.svg') ? 'image/svg+xml' :
                        'application/octet-stream'
          });

          // 通过 HTTP 接口上传图片
          // 使用 keepName=1 参数保持原始文件名（避免时间戳前缀）
          const uploadResult = await new Promise<{ success: boolean; fileName?: string; error?: string }>((resolve) => {
            const options = {
              hostname: 'localhost',
              port: 52521,
              path: '/api/image/upload?keepName=1',
              method: 'POST',
              headers: formData.getHeaders()
            };

            const req = http.request(options, (res) => {
              let data = '';
              res.on('data', (chunk) => {
                data += chunk;
              });
              res.on('end', () => {
                try {
                  const result = JSON.parse(data);
                  if (result.code === 0 && result.data && result.data.succMap) {
                    const uploadedFileName = Object.keys(result.data.succMap)[0];
                    resolve({ success: true, fileName: uploadedFileName });
                  } else {
                    resolve({ success: false, error: result.msg || '上传失败' });
                  }
                } catch (error) {
                  resolve({ success: false, error: '解析响应失败' });
                }
              });
            });

            req.on('error', (error) => {
              resolve({ success: false, error: error.message });
            });

            formData.pipe(req);
          });

          if (uploadResult.success && uploadResult.fileName) {
            // 构造图片URL
            const imageUrl = `http://localhost:52521/images/${uploadResult.fileName}`;
            // 使用原始图片名称作为 key，URL 作为 value
            // 这样可以在后续替换 Markdown 时使用原始名称匹配
            imageUrlMap.set(imageName, imageUrl);
          } else {
            logger.error(`上传图片 ${imageName} 失败:`, uploadResult.error);
            // 即使上传失败，也尝试使用原始名称构造 URL（降级处理）
            const fallbackUrl = `http://localhost:52521/images/${imageName}`;
            imageUrlMap.set(imageName, fallbackUrl);
          }
        } catch (error) {
          logger.error(`上传图片 ${imageName} 失败:`, error);
        }
      }

      // 将所有页面的 Markdown 合并
      let markdownContent = markdownPages.join('\n\n');

      // 替换 Markdown 中的相对路径为上传后的 URL
      // 图片路径格式: ./document_image1_p1.png 或 document_image1_p1.png
      for (const [imageName, imageUrl] of imageUrlMap.entries()) {
        // 转义特殊字符用于正则表达式
        const escapedImageName = imageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // 匹配各种可能的路径格式：
        // 1. ![alt](./image.png)
        // 2. ![alt](image.png)
        // 3. ![alt](./image.png) 在行尾
        const patterns = [
          new RegExp(`!\\[([^\\]]*)\\]\\(\\./${escapedImageName}\\)`, 'g'),
          new RegExp(`!\\[([^\\]]*)\\]\\(${escapedImageName}\\)`, 'g'),
        ];
        
        for (const pattern of patterns) {
          markdownContent = markdownContent.replace(pattern, `![$1](${imageUrl})`);
        }
      }

      // 最后一步：将 URL 替换为本地路径（类似 image2local 的逻辑）
      // 将 http://localhost:52521/images/ 替换为本地路径
      const localImagePath = imageUploadDir.replace(/\\/g, '/');
      markdownContent = markdownContent.replace(
        /http:\/\/localhost:52521\/images\/([^\s\)]+)/g,
        (match: string, imageName: string) => {
          return `${localImagePath}/${imageName}`;
        }
      );

      return { success: true, markdown: markdownContent };
    } catch (error) {
      logger.error('PDF转Markdown失败:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // 获取文件统计信息（创建时间、修改时间等）
  ipcMain.handle('get-file-stats', async (event: IpcMainInvokeEvent, filePath: string): Promise<{ birthtime: number; mtime: number; size: number } | null> => {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const stats = fs.statSync(filePath);
      return {
        birthtime: stats.birthtimeMs, // 创建时间（毫秒时间戳）
        mtime: stats.mtimeMs, // 修改时间（毫秒时间戳）
        size: stats.size // 文件大小（字节）
      };
    } catch (error) {
      logger.error('获取文件统计信息失败:', error);
      return null;
    }
  });

  // 删除文件或文件夹（移到回收站）
  ipcMain.handle('delete-file-or-folder', async (event: IpcMainInvokeEvent, filePath: string): Promise<void> => {
    try {
      // 规范化路径（确保使用正确的路径分隔符）
      const normalizedPath = path.normalize(filePath)
      
      if (!fs.existsSync(normalizedPath)) {
        throw new Error('文件或文件夹不存在');
      }

      // 先尝试使用 shell.trashItem 移到回收站（推荐方式）
      try {
        await shell.trashItem(normalizedPath);
        return; // 成功则直接返回
      } catch (trashError) {
        // 如果 shell.trashItem 失败（可能是权限问题或路径问题），使用直接删除作为回退
        logger.warn('使用 shell.trashItem 删除失败，尝试直接删除:', { path: normalizedPath, error: trashError });
        
        const stats = fs.statSync(normalizedPath);
        if (stats.isDirectory()) {
          // 删除目录（递归删除）
          fs.rmSync(normalizedPath, { recursive: true, force: true });
        } else {
          // 删除文件
          fs.unlinkSync(normalizedPath);
        }
        logger.info('使用直接删除方式成功删除:', normalizedPath);
      }
    } catch (error) {
      logger.error('删除文件或文件夹失败:', error);
      throw error;
    }
  });

  // 重命名文件或文件夹
  ipcMain.handle('rename-file-or-folder', async (event: IpcMainInvokeEvent, payload: { oldPath: string; newName: string }): Promise<string> => {
    try {
      const { oldPath, newName } = payload;
      if (!fs.existsSync(oldPath)) {
        throw new Error('文件或文件夹不存在');
      }

      // 验证新名称
      if (!newName || newName.trim() === '') {
        throw new Error('新名称不能为空');
      }

      // 检查非法字符（Windows: < > : " | ? * \ /）
      const invalidChars = /[<>:"|?*\\/]/;
      if (invalidChars.test(newName)) {
        throw new Error('文件名包含非法字符');
      }

      const dir = path.dirname(oldPath);
      const newPath = path.join(dir, newName);

      // 检查目标路径是否已存在
      if (fs.existsSync(newPath)) {
        throw new Error('目标文件或文件夹已存在');
      }

      fs.renameSync(oldPath, newPath);
      return newPath;
    } catch (error) {
      logger.error('重命名文件或文件夹失败:', error);
      throw error;
    }
  });

  // 创建文件夹
  ipcMain.handle('create-directory', async (event: IpcMainInvokeEvent, payload: { parentPath: string; folderName: string }): Promise<string> => {
    try {
      const { parentPath, folderName } = payload;
      
      if (!fs.existsSync(parentPath)) {
        throw new Error('父目录不存在');
      }

      // 验证文件夹名称
      if (!folderName || folderName.trim() === '') {
        throw new Error('文件夹名称不能为空');
      }

      // 检查非法字符
      const invalidChars = /[<>:"|?*\\/]/;
      if (invalidChars.test(folderName)) {
        throw new Error('文件夹名称包含非法字符');
      }

      const newPath = path.join(parentPath, folderName);

      // 检查目标路径是否已存在
      if (fs.existsSync(newPath)) {
        throw new Error('文件夹已存在');
      }

      fs.mkdirSync(newPath, { recursive: true });
      return newPath;
    } catch (error) {
      logger.error('创建文件夹失败:', error);
      throw error;
    }
  });

  // 创建文件
  ipcMain.handle('create-file', async (event: IpcMainInvokeEvent, payload: { parentPath: string; fileName: string; content?: string }): Promise<string> => {
    try {
      const { parentPath, fileName, content = '' } = payload;
      
      if (!fs.existsSync(parentPath)) {
        throw new Error('父目录不存在');
      }

      // 验证文件名称
      if (!fileName || fileName.trim() === '') {
        throw new Error('文件名称不能为空');
      }

      // 检查非法字符
      const invalidChars = /[<>:"|?*\\/]/;
      if (invalidChars.test(fileName)) {
        throw new Error('文件名称包含非法字符');
      }

      // 检查文件扩展名是否在支持的格式列表中
      const ext = path.extname(fileName).toLowerCase();
      if (!isSupportedFormat(ext)) {
        throw new Error(`不支持创建 ${ext} 格式的文件。支持的格式包括：.md, .tex, .txt, .json 等`);
      }

      const newPath = path.join(parentPath, fileName);

      // 检查目标路径是否已存在
      if (fs.existsSync(newPath)) {
        throw new Error('文件已存在');
      }

      fs.writeFileSync(newPath, content, 'utf-8');
      return newPath;
    } catch (error) {
      logger.error('创建文件失败:', error);
      throw error;
    }
  });

  // 复制文件或文件夹
  ipcMain.handle('copy-file-or-folder', async (event: IpcMainInvokeEvent, payload: { sourcePath: string; targetPath: string }): Promise<void> => {
    try {
      const { sourcePath, targetPath } = payload;
      
      if (!fs.existsSync(sourcePath)) {
        throw new Error('源文件或文件夹不存在');
      }

      if (fs.existsSync(targetPath)) {
        throw new Error('目标文件或文件夹已存在');
      }

      const stats = fs.statSync(sourcePath);
      if (stats.isDirectory()) {
        // 递归复制文件夹
        fs.cpSync(sourcePath, targetPath, { recursive: true });
      } else {
        // 复制文件
        fs.copyFileSync(sourcePath, targetPath);
      }
    } catch (error) {
      logger.error('复制文件或文件夹失败:', error);
      throw error;
    }
  });

  // 移动文件或文件夹（剪切）
  ipcMain.handle('move-file-or-folder', async (event: IpcMainInvokeEvent, payload: { sourcePath: string; targetPath: string }): Promise<void> => {
    try {
      const { sourcePath, targetPath } = payload;
      
      if (!fs.existsSync(sourcePath)) {
        throw new Error('源文件或文件夹不存在');
      }

      if (fs.existsSync(targetPath)) {
        throw new Error('目标文件或文件夹已存在');
      }

      // 确保目标目录存在
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      fs.renameSync(sourcePath, targetPath);
    } catch (error) {
      logger.error('移动文件或文件夹失败:', error);
      throw error;
    }
  });

  // 在文件管理器中显示文件
  ipcMain.handle('show-item-in-folder', async (event: IpcMainInvokeEvent, filePath: string): Promise<void> => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('文件或文件夹不存在');
      }
      shell.showItemInFolder(filePath);
    } catch (error) {
      logger.error('在文件管理器中显示文件失败:', error);
      throw error;
    }
  });

  // 检查路径是否存在（用于重名检测）
  ipcMain.handle('check-path-exists', async (event: IpcMainInvokeEvent, filePath: string): Promise<boolean> => {
    try {
      return fs.existsSync(filePath);
    } catch (error) {
      logger.error('检查路径是否存在失败:', error);
      return false;
    }
  });

  // 检查路径是否为目录
  ipcMain.handle('check-path-is-directory', async (event: IpcMainInvokeEvent, filePath: string): Promise<boolean> => {
    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }
      const stats = fs.statSync(filePath);
      return stats.isDirectory();
    } catch (error) {
      logger.error('检查路径是否为目录失败:', error);
      return false;
    }
  });

  // 读取Sidecar文件
  // 注意：Electron IPC会自动将Buffer序列化为ArrayBuffer，在渲染进程中会变成Uint8Array
  ipcMain.handle('read-sidecar-file', async (event: IpcMainInvokeEvent, payload: { path: string }): Promise<Buffer | null> => {
    try {
      const { path: filePath } = payload;
      
      if (!filePath) {
        logger.warn('[read-sidecar-file] 文件路径为空');
        return null;
      }
      
      if (!fs.existsSync(filePath)) {
        return null;
      }
      
      // 读取二进制文件
      const buffer = fs.readFileSync(filePath);
      
      // 验证文件完整性：检查是否有有效的数据
      if (buffer.length === 0) {
        logger.warn('[read-sidecar-file] 文件为空', { filePath });
        return null;
      }
      
      // 验证第一个字节是否是有效的标记（0x00 或 0x01）
      const firstByte = buffer[0];
      if (firstByte !== 0x00 && firstByte !== 0x01) {
        logger.warn('[read-sidecar-file] 文件格式无效（第一个字节不是有效标记）', { 
          filePath, 
          firstByte, 
          firstByteHex: '0x' + firstByte.toString(16).padStart(2, '0')
        });
        // 不返回null，让渲染进程尝试处理（可能是旧格式）
      }
      
      logger.info('[read-sidecar-file] 文件读取成功', { 
        filePath, 
        bufferLength: buffer.length,
        firstByte: buffer[0],
        firstByteHex: '0x' + buffer[0].toString(16).padStart(2, '0')
      });
      
      // Electron IPC会自动将Buffer转换为ArrayBuffer/Uint8Array
      // 直接返回Buffer即可，渲染进程会收到Uint8Array
      return buffer;
    } catch (error) {
      logger.error('[read-sidecar-file] 读取Sidecar文件失败', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        filePath: payload?.path
      });
      return null;
    }
  });

  ipcMain.handle('write-file-content', async (event: IpcMainInvokeEvent, payload: { filePath: string; content: string; encoding?: 'utf8' | 'base64' }): Promise<void> => {
    try {
      const { filePath, content, encoding = 'utf8' } = payload;
      if (!filePath || !content) {
        throw new Error('文件路径和内容不能为空');
      }
      
      // 确保目录存在
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // 根据编码类型写入文件
      if (encoding === 'base64') {
        // base64 编码：将 base64 字符串转换为 Buffer 后写入
        const buffer = Buffer.from(content, 'base64');
        fs.writeFileSync(filePath, buffer);
      } else {
        // UTF-8 编码：直接写入文本
        fs.writeFileSync(filePath, content, 'utf-8');
      }
    } catch (error) {
      logger.error('写入文件失败:', error);
      throw error;
    }
  });

  // 保存引用文件到userData/reference目录
  ipcMain.handle('save-reference-file', async (event: IpcMainInvokeEvent, payload: { filename: string; content: string }): Promise<string> => {
    try {
      const { filename, content } = payload;
      if (!filename || !content) {
        throw new Error('文件名和内容不能为空');
      }
      
      // 获取userData目录下的reference文件夹
      const userDataPath = app.getPath('userData');
      const referenceDir = path.join(userDataPath, 'reference');
      
      // 确保目录存在
      if (!fs.existsSync(referenceDir)) {
        fs.mkdirSync(referenceDir, { recursive: true });
      }
      
      // 生成唯一文件名（避免冲突）
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substr(2, 9);
      const ext = path.extname(filename);
      const baseName = path.basename(filename, ext);
      const uniqueFilename = `${baseName}-${timestamp}-${randomStr}${ext}`;
      const filePath = path.join(referenceDir, uniqueFilename);
      
      // 将base64内容转换为Buffer并写入文件
      const buffer = Buffer.from(content, 'base64');
      fs.writeFileSync(filePath, buffer);
      
      logger.info(`引用文件已保存到: ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error('保存引用文件失败:', error);
      throw error;
    }
  });

  // 获取reference目录路径
  ipcMain.handle('get-reference-dir-path', async (): Promise<string> => {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'reference');
  });

  // 获取reference目录大小
  ipcMain.handle('get-reference-dir-size', async (): Promise<number> => {
    const userDataPath = app.getPath('userData');
    const referenceDir = path.join(userDataPath, 'reference');
    
    if (!fs.existsSync(referenceDir)) {
      return 0;
    }
    
    let totalSize = 0;
    const calculateSize = (dir: string): void => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          calculateSize(filePath);
        } else {
          totalSize += stats.size;
        }
      }
    };
    
    calculateSize(referenceDir);
    return totalSize;
  });

  // 清空reference目录
  ipcMain.handle('clear-reference-dir', async (): Promise<void> => {
    const userDataPath = app.getPath('userData');
    const referenceDir = path.join(userDataPath, 'reference');
    
    if (!fs.existsSync(referenceDir)) {
      return;
    }
    
    const deleteDir = (dir: string): void => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          deleteDir(filePath);
          fs.rmdirSync(filePath);
        } else {
          fs.unlinkSync(filePath);
        }
      }
    };
    
    deleteDir(referenceDir);
    logger.info('Reference目录已清空');
  });

  // 打开reference目录
  ipcMain.handle('open-reference-dir', async (): Promise<void> => {
    const userDataPath = app.getPath('userData');
    const referenceDir = path.join(userDataPath, 'reference');
    
    // 确保目录存在
    if (!fs.existsSync(referenceDir)) {
      fs.mkdirSync(referenceDir, { recursive: true });
    }
    
    const { shell } = require('electron');
    shell.openPath(referenceDir);
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

  // 读取剪切板图片
  ipcMain.handle('read-clipboard-image', async (event: IpcMainInvokeEvent): Promise<string | null> => {
    try {
      const { clipboard, nativeImage } = require('electron');
      const image = clipboard.readImage();
      if (image.isEmpty()) {
        return null;
      }
      return image.toDataURL();
    } catch (error) {
      logger.error('读取剪切板图片失败:', error);
      return null;
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

  // 监听目录变化
  ipcMain.on('watch-directory', (event: IpcMainEvent, directoryPath: string) => {
    try {
      if (!directoryPath) {
        logger.warn('目录路径为空，无法启动监听');
        return;
      }
      directoryWatcherService.watchDirectory(directoryPath, event.sender);
    } catch (error) {
      logger.error('启动目录监听失败', { directoryPath, error });
    }
  });

  // 停止监听目录变化
  ipcMain.on('unwatch-directory', (event: IpcMainEvent, directoryPath: string) => {
    try {
      if (!directoryPath) {
        return;
      }
      directoryWatcherService.unwatchDirectory(directoryPath);
    } catch (error) {
      logger.error('停止目录监听失败', { directoryPath, error });
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

  // ============ 通用文件选择服务 ============
  
  /**
   * 根据文件类型类别生成文件过滤器
   */
  function getFileFiltersByCategory(category: string, i18nT: (key: string, defaultValue?: string) => string): Electron.FileFilter[] {
    const filters: Electron.FileFilter[] = []
    
    switch (category) {
      case 'all':
        // 所有支持的格式，按类别分组显示
        filters.push(
          { name: i18nT('agent.reference.fileTypeCategory.all', 'All Supported Formats'), extensions: ['txt', 'md', 'json', 'xml', 'pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'csv', 'html', 'htm', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] },
          { name: i18nT('agent.reference.fileTypeCategory.text', 'Text Files'), extensions: ['txt', 'md', 'json', 'xml'] },
          { name: i18nT('agent.reference.fileTypeCategory.document', 'Document Files'), extensions: ['pdf', 'docx', 'doc', 'pptx', 'ppt'] },
          { name: i18nT('agent.reference.fileTypeCategory.data', 'Data Files'), extensions: ['csv', 'xlsx', 'xls'] },
          { name: i18nT('agent.reference.fileTypeCategory.image', 'Image Files'), extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] },
          { name: i18nT('agent.reference.fileTypeCategory.web', 'Web Files'), extensions: ['html', 'htm', 'xml'] },
          { name: i18nT('main.dialogs.filters.all', 'All Files'), extensions: ['*'] }
        )
        break
      case 'text':
        filters.push(
          { name: i18nT('agent.reference.fileTypeCategory.text', 'Text Files'), extensions: ['txt', 'md', 'json', 'xml'] },
          { name: i18nT('main.dialogs.filters.all', 'All Files'), extensions: ['*'] }
        )
        break
      case 'document':
        filters.push(
          { name: i18nT('agent.reference.fileTypeCategory.document', 'Document Files'), extensions: ['pdf', 'docx', 'pptx'] },
          { name: i18nT('main.dialogs.filters.all', 'All Files'), extensions: ['*'] }
        )
        break
      case 'data':
        filters.push(
          { name: i18nT('agent.reference.fileTypeCategory.data', 'Data Files'), extensions: ['csv', 'xlsx', 'xls'] },
          { name: i18nT('main.dialogs.filters.all', 'All Files'), extensions: ['*'] }
        )
        break
      case 'image':
        filters.push(
          { name: i18nT('agent.reference.fileTypeCategory.image', 'Image Files'), extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] },
          { name: i18nT('main.dialogs.filters.all', 'All Files'), extensions: ['*'] }
        )
        break
      case 'web':
        filters.push(
          { name: i18nT('agent.reference.fileTypeCategory.web', 'Web Files'), extensions: ['html', 'htm', 'xml'] },
          { name: i18nT('main.dialogs.filters.all', 'All Files'), extensions: ['*'] }
        )
        break
      default:
        filters.push({ name: i18nT('main.dialogs.filters.all', 'All Files'), extensions: ['*'] })
    }
    
    return filters
  }

  /**
   * 通用文件选择服务
   * @param options 文件选择选项
   * @returns 选中的文件路径数组
   */
  ipcMain.handle('select-reference-files', async (
    event: IpcMainInvokeEvent,
    options: {
      category?: string
      multiple?: boolean
      title?: string
    }
  ): Promise<{ canceled: boolean; filePaths: string[] }> => {
    try {
      const category = options.category || 'all'
      const multiple = options.multiple ?? false
      const title = options.title || t('agent.reference.selectFile', 'Select File')
      
      const filters = getFileFiltersByCategory(category, t)
      
      const result: OpenDialogReturnValue = await dialog.showOpenDialog(mainWindow!, {
        title,
        filters,
        properties: multiple ? ['openFile', 'multiSelections'] : ['openFile']
      })
      
      return {
        canceled: result.canceled,
        filePaths: result.filePaths || []
      }
    } catch (error) {
      logger.error('文件选择失败:', error)
      throw error
    }
  })

  /**
   * 读取文件内容并转换为 base64
   * 用于在渲染进程中创建 File 对象
   */
  ipcMain.handle('read-file-for-upload', async (
    event: IpcMainInvokeEvent,
    filePath: string
  ): Promise<{ name: string; data: string; mimeType: string }> => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('文件不存在')
      }
      
      const fileBuffer = fs.readFileSync(filePath)
      const fileName = path.basename(filePath)
      const ext = path.extname(filePath).toLowerCase()
      
      // 根据扩展名推断 MIME 类型
      const mimeTypes: Record<string, string> = {
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.json': 'application/json',
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
        '.csv': 'text/csv',
        '.html': 'text/html',
        '.htm': 'text/html',
        '.xml': 'text/xml',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.webp': 'image/webp'
      }
      
      const mimeType = mimeTypes[ext] || 'application/octet-stream'
      const base64 = fileBuffer.toString('base64')
      
      return {
        name: fileName,
        data: base64,
        mimeType
      }
    } catch (error) {
      logger.error('读取文件失败:', error)
      throw error
    }
  })
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

/**
 * 绑定拼写检查处理器
 */
function bindSpellCheckHandlers(): void {
  ipcMain.handle('spell-check', async (
    _event: IpcMainInvokeEvent,
    params: SpellCheckParams
  ) => {
    try {
      logger.info('[spell-check] 收到拼写检查请求，文本长度:', params.text?.length || 0)
      const result = await performSpellCheck(params)
      logger.info('[spell-check] 拼写检查完成，发现', result.issues.length, '个问题')
      return result
    } catch (error) {
      logger.error('[spell-check] 拼写检查失败:', error)
      throw error
    }
  })
  
  // 添加单词到词典
  ipcMain.handle('spell-check-add-word', async (
    _event: IpcMainInvokeEvent,
    word: string
  ) => {
    try {
      logger.info('[spell-check-add-word] 添加单词到词典:', word)
      addWordToDictionary(word)
      return { success: true }
    } catch (error) {
      logger.error('[spell-check-add-word] 添加单词失败:', error)
      throw error
    }
  })
  
  // 批量添加单词到词典
  ipcMain.handle('spell-check-add-words', async (
    _event: IpcMainInvokeEvent,
    words: string[]
  ) => {
    try {
      logger.info('[spell-check-add-words] 批量添加单词到词典，数量:', words.length)
      addWordsToDictionary(words)
      return { success: true }
    } catch (error) {
      logger.error('[spell-check-add-words] 批量添加单词失败:', error)
      throw error
    }
  })
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
  
  ipcMain.handle('remove-recent-doc', async (event: IpcMainInvokeEvent, data: RemoveRecentDocData): Promise<void> => {
    return await removeRecentDoc(data);
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

  // 获取系统字体列表
  ipcMain.handle('get-system-fonts', async (event: IpcMainInvokeEvent): Promise<SystemFont[]> => {
    return await getSystemFonts();
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
  // scale: 缩放因子，用于生成高分辨率位图，默认 2.0（相当于 192 DPI）
  ipcMain.handle('convert-svg-string-to-png', async (event: IpcMainInvokeEvent, svgContent: string, scale: number = 2.0): Promise<{ success: boolean; url?: string; error?: string }> => {
    const logger = createMainLogger('SvgToPng');
    try {
      const url = await convertSvgStringToPngFile(svgContent, scale);
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
      const url = await convertSvgStringToPdfFile(svgContent);
      // 从URL中提取文件路径（用于返回）
      const fileName = url.replace('http://localhost:52521/images/', '');
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
 * 根据平台和终端设置解码Buffer为字符串
 * @param data 要解码的 Buffer
 * @param consoleKey 终端标识符（可选，用于获取该终端的字符集设置）
 */
function decodeBuffer(data: Buffer, consoleKey?: string): string {
  // 如果有 consoleKey，尝试使用该终端的字符集设置
  if (consoleKey && terminalEncodings.has(consoleKey)) {
    const encoding = terminalEncodings.get(consoleKey)!;
    try {
      if (encoding === 'utf8' || encoding === 'utf-8') {
        return data.toString('utf8');
      } else {
        return iconv.decode(data, encoding);
      }
    } catch (error) {
      // 如果解码失败，回退到平台默认编码
      console.warn(`使用编码 ${encoding} 解码失败，回退到平台默认编码:`, error);
    }
  }
  
  // 回退到平台默认编码
  if (process.platform === 'win32') {
    // Windows上使用GBK编码解码
    return iconv.decode(data, 'gbk');
  } else {
    // 其他平台使用UTF-8
    return data.toString('utf8');
  }
}

/**
 * 绑定终端命令执行处理器
 */
// 维护活动的终端进程映射（invocationId -> process）
const terminalProcesses = new Map<string, ReturnType<typeof spawn>>();
// 维护每个终端的当前工作目录（consoleKey -> cwd）
const terminalCwds = new Map<string, string>();
// 维护每个终端的字符集编码（consoleKey -> encoding）
const terminalEncodings = new Map<string, string>();

function bindTerminalHandlers(): void {
  // 获取或设置终端的当前工作目录
  ipcMain.handle('terminal-get-cwd', async (
    event: IpcMainInvokeEvent,
    options: { consoleKey: string; initialCwd?: string }
  ): Promise<string> => {
    const { consoleKey, initialCwd } = options;
    if (terminalCwds.has(consoleKey)) {
      return terminalCwds.get(consoleKey)!;
    }
    const cwd = initialCwd || process.cwd();
    terminalCwds.set(consoleKey, cwd);
    return cwd;
  });

  // 设置终端的字符集编码
  ipcMain.handle('terminal-set-encoding', async (
    event: IpcMainInvokeEvent,
    options: { consoleKey: string; encoding: string }
  ): Promise<{ success: boolean; error?: string }> => {
    const { consoleKey, encoding } = options;
    const logger = createMainLogger('TerminalCommand');
    try {
      // 验证编码是否有效
      const validEncodings = [
        'utf8', 'utf-8',
        'gbk', 'gb2312',
        'big5',
        'shift_jis', 'shift-jis',
        'euc-kr', 'euckr',
        'iso-8859-1', 'latin1',
        'windows-1252', 'cp1252',
        'iso-8859-2', 'latin2',
        'iso-8859-5',
        'iso-8859-7',
        'windows-1251', 'cp1251',
        'koi8-r',
        'windows-1250', 'cp1250',
        'iso-8859-15'
      ];
      
      const normalizedEncoding = encoding.toLowerCase().replace(/_/g, '-');
      if (!validEncodings.includes(normalizedEncoding)) {
        return { success: false, error: `不支持的字符集: ${encoding}` };
      }
      
      terminalEncodings.set(consoleKey, normalizedEncoding);
      logger.info(`终端 ${consoleKey} 字符集已设置为: ${normalizedEncoding}`);
      return { success: true };
    } catch (error) {
      logger.error('设置终端字符集失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 设置终端的当前工作目录（用于cd命令）
  ipcMain.handle('terminal-set-cwd', async (
    event: IpcMainInvokeEvent,
    options: { consoleKey: string; cwd: string }
  ): Promise<{ success: boolean; error?: string; resolvedPath?: string }> => {
    const { consoleKey, cwd } = options;
    const logger = createMainLogger('TerminalCommand');
    try {
      // 获取当前终端的 cwd（如果不存在，使用 process.cwd()）
      const currentCwd = terminalCwds.get(consoleKey) || process.cwd();
      
      // 解析路径：相对路径基于当前 cwd，绝对路径直接使用
      const resolvedPath = path.isAbsolute(cwd) ? cwd : path.resolve(currentCwd, cwd);
      
      // 验证路径是否存在且是目录
      const fs = require('fs');
      if (!fs.existsSync(resolvedPath)) {
        return { success: false, error: '路径不存在' };
      }
      const stat = fs.statSync(resolvedPath);
      if (!stat.isDirectory()) {
        return { success: false, error: '不是一个目录' };
      }
      
      // 更新 cwd
      terminalCwds.set(consoleKey, resolvedPath);
      logger.info(`终端 ${consoleKey} 工作目录已更新为: ${resolvedPath}`);
      return { success: true, resolvedPath };
    } catch (error) {
      logger.error('设置终端工作目录失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 执行终端命令（不等待完成，支持交互式输入）
  ipcMain.handle('execute-terminal-command', async (
    event: IpcMainInvokeEvent,
    options: { command: string; cwd?: string; invocationId?: string; consoleKey?: string }
  ): Promise<{ success: boolean; invocationId: string; error?: string }> => {
    const logger = createMainLogger('TerminalCommand');
    const { command, cwd, consoleKey } = options;
    const invocationId = options.invocationId || `terminal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // 确定工作目录：优先使用传入的cwd，否则使用该终端维护的cwd，最后使用进程cwd
      let workingDir = cwd;
      if (!workingDir && consoleKey) {
        workingDir = terminalCwds.get(consoleKey);
      }
      if (!workingDir) {
        workingDir = process.cwd();
      }

      logger.info(`执行命令: ${command} (cwd: ${workingDir}, invocationId: ${invocationId}, consoleKey: ${consoleKey || 'none'})`);

      // 根据平台选择shell
      const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
      const shellArgs = process.platform === 'win32' ? ['/c'] : ['-c'];

      // 创建子进程（不设置 timeout，支持长时间运行）
      const childProcess = spawn(shell, [...shellArgs, command], {
        cwd: workingDir,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // 保存进程到映射中
      terminalProcesses.set(invocationId, childProcess);

      // 实时发送 stdout 到渲染进程
      childProcess.stdout?.on('data', (data: Buffer) => {
        const text = decodeBuffer(data, consoleKey);
        event.sender.send('terminal-stdout-stream', {
          invocationId,
          data: text
        });
      });

      // 实时发送 stderr 到渲染进程
      childProcess.stderr?.on('data', (data: Buffer) => {
        const text = decodeBuffer(data, consoleKey);
        event.sender.send('terminal-stderr-stream', {
          invocationId,
          data: text
        });
      });

      // 进程关闭时清理
      childProcess.on('close', (code: number | null) => {
        terminalProcesses.delete(invocationId);
        const exitCode = code ?? 1;
        logger.info(`命令执行完成: exitCode=${exitCode}, invocationId: ${invocationId}`);
        
        event.sender.send('terminal-close', {
          invocationId,
          exitCode,
          command
        });
      });

      // 进程错误时清理
      childProcess.on('error', (error: Error) => {
        terminalProcesses.delete(invocationId);
        logger.error('命令执行错误:', error);
        event.sender.send('terminal-error', {
          invocationId,
          error: error.message
        });
      });

      return { success: true, invocationId };
    } catch (error) {
      logger.error('启动命令失败:', error);
      return { 
        success: false, 
        invocationId,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 发送输入到终端进程（stdin）
  ipcMain.handle('terminal-send-input', async (
    event: IpcMainInvokeEvent,
    options: { invocationId: string; input: string }
  ): Promise<{ success: boolean; error?: string }> => {
    const logger = createMainLogger('TerminalCommand');
    const { invocationId, input } = options;

    try {
      const childProcess = terminalProcesses.get(invocationId);
      if (!childProcess || childProcess.killed) {
        return { success: false, error: '进程不存在或已终止' };
      }

      // 发送输入到进程的 stdin
      if (childProcess.stdin && !childProcess.stdin.destroyed) {
        // Windows 使用 GBK 编码，其他平台使用 UTF-8
        const buffer = process.platform === 'win32' 
          ? iconv.encode(input, 'gbk')
          : Buffer.from(input, 'utf8');
        
        childProcess.stdin.write(buffer);
        logger.debug(`发送输入到进程 ${invocationId}: ${input.substring(0, 50)}`);
        return { success: true };
      } else {
        return { success: false, error: '进程 stdin 不可用' };
      }
    } catch (error) {
      logger.error('发送输入失败:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 发送中断信号到终端进程（Ctrl+C）
  ipcMain.handle('terminal-send-interrupt', async (
    event: IpcMainInvokeEvent,
    options: { invocationId: string }
  ): Promise<{ success: boolean; error?: string }> => {
    const logger = createMainLogger('TerminalCommand');
    const { invocationId } = options;

    try {
      const childProcess = terminalProcesses.get(invocationId);
      if (!childProcess || childProcess.killed) {
        return { success: false, error: '进程不存在或已终止' };
      }

      // 发送 SIGINT 信号（Ctrl+C）
      if (process.platform === 'win32') {
        // Windows 上使用 SIGTERM，因为 Windows 不支持 SIGINT
        childProcess.kill('SIGTERM');
      } else {
        childProcess.kill('SIGINT');
      }
      
      logger.info(`发送中断信号到进程 ${invocationId}`);
      return { success: true };
    } catch (error) {
      logger.error('发送中断信号失败:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
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

  // 获取应用版本号
  ipcMain.handle('get-app-version', async (event: IpcMainInvokeEvent): Promise<string> => {
    return getAppVersion();
  });

  // 获取版本详细信息（包含发布日期）
  ipcMain.handle('get-version-info', async (event: IpcMainInvokeEvent): Promise<any> => {
    try {
      let versionFilePath: string;
      if (app.isPackaged) {
        versionFilePath = path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'version.json');
      } else {
        versionFilePath = path.resolve(__dirname, '../../version.json');
      }
      
      if (fs.existsSync(versionFilePath)) {
        const versionData = JSON.parse(fs.readFileSync(versionFilePath, 'utf-8'));
        return versionData;
      }
      return null;
    } catch (error) {
      logger.error('获取版本信息失败:', error);
      return null;
    }
  });

  // 获取资源路径
  ipcMain.handle('get-resources-path', async (event: IpcMainInvokeEvent): Promise<string> => {
    return getResourcesPath();
  });

  // 检查更新
  ipcMain.handle('check-for-updates', async (event: IpcMainInvokeEvent, channel: UpdateChannel = 'release'): Promise<any> => {
    try {
      return await checkForUpdates(channel);
    } catch (error) {
      logger.error('检查更新失败:', error);
      return {
        checking: false,
        updateAvailable: false,
        updateNotAvailable: false,
        error: error instanceof Error ? error.message : String(error),
        updateInfo: null
      };
    }
  });

  // 获取更新状态
  ipcMain.handle('get-update-status', async (event: IpcMainInvokeEvent): Promise<any> => {
    return getUpdateStatus();
  });

  // 下载更新
  ipcMain.handle('download-update', async (event: IpcMainInvokeEvent): Promise<{ success: boolean; error?: string }> => {
    try {
      // 监听下载进度并发送到渲染进程
      const { autoUpdater } = require('electron-updater');
      const progressHandler = (progressObj: { percent: number }) => {
        event.sender.send('update-download-progress', { percent: progressObj.percent });
      };
      
      autoUpdater.on('download-progress', progressHandler);
      
      try {
        await downloadUpdate();
        autoUpdater.removeListener('download-progress', progressHandler);
        return { success: true };
      } catch (error) {
        autoUpdater.removeListener('download-progress', progressHandler);
        throw error;
      }
    } catch (error) {
      logger.error('下载更新失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 安装更新并退出
  ipcMain.handle('quit-and-install', async (event: IpcMainInvokeEvent): Promise<void> => {
    try {
      quitAndInstall();
    } catch (error) {
      logger.error('安装更新失败:', error);
      throw error;
    }
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
 * 获取应用版本号
 */
function getAppVersion(): string {
  try {
    // 在开发环境中，从项目根目录读取版本文件
    // 在打包后，从 resources 目录读取（resources 目录会被 asarUnpack 解包）
    let versionFilePath: string;
    if (app.isPackaged) {
      // 打包后：从 resources 目录加载（resources 目录会被 asarUnpack 解包）
      versionFilePath = path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'version.json');
    } else {
      // 开发环境：从项目根目录加载
      // electron-vite 在开发环境中，__dirname 指向 out/main
      // 所以需要向上两级到达项目根目录：out/main -> out -> 项目根目录
      // 与 index.ts 中加载 .env 文件的路径保持一致
      versionFilePath = path.resolve(__dirname, '../../version.json');
    }
    
    logger.debug('尝试读取版本文件:', versionFilePath, '存在:', fs.existsSync(versionFilePath));
    
    if (fs.existsSync(versionFilePath)) {
      const versionData = JSON.parse(fs.readFileSync(versionFilePath, 'utf-8'));
      logger.debug('从版本文件读取版本号:', versionData.version);
      return versionData.version || 'Beta0.0.1';
    }
    
    logger.warn('版本文件不存在，尝试从 package.json 读取:', versionFilePath);
    
    // 如果版本文件不存在，尝试从 package.json 读取
    let packageJsonPath: string;
    if (app.isPackaged) {
      packageJsonPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'package.json');
    } else {
      // 开发环境：从项目根目录加载 package.json
      packageJsonPath = path.resolve(__dirname, '../../package.json');
    }
    
    logger.debug('尝试读取 package.json:', packageJsonPath, '存在:', fs.existsSync(packageJsonPath));
    
    if (fs.existsSync(packageJsonPath)) {
      const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const version = packageData.version || '1.0.0';
      logger.debug('从 package.json 读取版本号:', version);
      // 如果 package.json 中的版本没有 Beta 前缀，添加它
      return version.startsWith('Beta') ? version : `Beta${version}`;
    }
    
    logger.warn('无法找到版本文件或 package.json，使用默认版本');
    return 'Beta0.0.1';
  } catch (error) {
    logger.warn('读取版本号失败，使用默认版本:', error);
    return 'Beta0.0.1';
  }
}

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
 * 删除最近文档
 */
const removeRecentDoc = async (data: RemoveRecentDocData): Promise<void> => {
  const json = store.get('recent-docs') as string | null;
  let recentDocs: string[] = json ? JSON.parse(json) : [];
  
  // 从列表中移除指定路径
  recentDocs = recentDocs.filter((item) => item !== data.path);
  
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

  if (key === 'loggingFilter') {
    updateLoggerConfig({ filter: typeof value === 'string' ? value : undefined });
  }

  if (key === 'logRetentionPeriod') {
    // 当保留期限改变时，立即执行清理
    cleanupOldLogs();
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

  // 对于 plaintext 格式（txt），如果文件路径已经有扩展名，保留原始扩展名
  // 因为 plaintext 格式包括多种文件类型（.js, .json, .py 等），应该保留原始扩展名
  if (format === 'txt') {
    const existingExt = path.extname(filePath);
    // 如果文件路径已经有扩展名，保留它（不强制改为 .txt）
    if (existingExt && existingExt.length > 1) {
      // 保持原始扩展名，不调用 ensureFileNameExtension
      // 这样 .js 文件保存后仍然是 .js，而不是 .txt
    } else {
      // 如果没有扩展名，才使用默认的 .txt 扩展名
      filePath = ensureFileNameExtension(filePath, format);
    }
  } else {
    // 对于其他格式（md, tex 等），确保扩展名正确
    filePath = ensureFileNameExtension(filePath, format);
  }

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
    case 'txt':
      // 纯文本格式使用 md 字段存储（与渲染进程一致）
      content = data.md || '';
      break;
    default:
      // 未知格式，尝试使用 md 字段（向后兼容）
      content = data.md || '';
  }

  // 标记文件正在保存，避免触发文件监听
  const normalizedPath = path.normalize(filePath);
  fileWatcherService.markFileAsSaving(normalizedPath, 2000); // 2秒内忽略文件变化

  // 写入文件
  fs.writeFileSync(filePath, content);
  
  // 如果存在Sidecar元信息，写入Sidecar文件
  if (data.sidecarMetadata && (format === 'md' || format === 'tex')) {
    try {
      const sidecarPath = getSidecarPath(filePath);
      // 将渲染进程传递的Uint8Array转换为Buffer
      let buffer: Buffer;
      if (Buffer.isBuffer(data.sidecarMetadata)) {
        buffer = data.sidecarMetadata;
      } else if (data.sidecarMetadata instanceof Uint8Array) {
        buffer = Buffer.from(data.sidecarMetadata);
      } else if (Array.isArray(data.sidecarMetadata)) {
        buffer = Buffer.from(data.sidecarMetadata);
      } else {
        throw new Error('不支持的sidecarMetadata类型');
      }
      
      // 如果文件已存在，先删除（避免权限问题）
      if (fs.existsSync(sidecarPath)) {
        try {
          // 先尝试移除隐藏属性（如果存在），以便删除
          if (process.platform === 'win32') {
            const { execSync } = require('child_process');
            try {
              execSync(`attrib -h "${sidecarPath}"`, { stdio: 'ignore' });
            } catch (err) {
              // 忽略移除隐藏属性失败的错误
            }
          }
          fs.unlinkSync(sidecarPath);
        } catch (unlinkError) {
          logger.warn('删除旧Sidecar文件失败，尝试直接覆盖:', unlinkError);
          // 如果删除失败，尝试直接覆盖（某些情况下可能成功）
        }
      }
      
      // 写入二进制文件（同步写入，确保数据完全写入）
      fs.writeFileSync(sidecarPath, buffer, { flag: 'w' }); // 明确指定写入模式
      
      // 同步刷新文件系统缓存，确保数据写入磁盘
      const fd = fs.openSync(sidecarPath, 'r+');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      
      // 在Windows上设置隐藏属性
      if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        try {
          execSync(`attrib +h "${sidecarPath}"`, { stdio: 'ignore' });
        } catch (err) {
          // 忽略设置隐藏属性失败的错误
          logger.warn('设置Sidecar文件隐藏属性失败:', err);
        }
      }
      
      logger.debug('[saveInternal] Sidecar文件写入成功', { 
        sidecarPath, 
        bufferLength: buffer.length,
        firstByte: buffer[0],
        firstByteHex: '0x' + buffer[0].toString(16).padStart(2, '0')
      });
    } catch (error) {
      logger.error('写入Sidecar文件失败:', error);
      // 不抛出错误，避免影响主文件的保存，但记录错误
    }
  }
  
  return {
    path: filePath,
    format,
  };
};

/**
 * 生成Sidecar文件路径
 * 使用path模块（主进程环境）
 * @param filePath 原始文件路径
 * @returns Sidecar文件路径
 */
function getSidecarPath(filePath: string): string {
  const dir = path.dirname(filePath);
  const basename = path.basename(filePath);
  return path.join(dir, `.${basename}.meta`);
}

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
      { name: supportedFilterName, extensions: ['md', 'tex', 'txt', 'json', 'pdf', 'js', 'ts', 'py', 'java', 'cpp', 'c', 'h', 'html', 'css', 'xml', 'yaml', 'yml'] },
      { name: t('main.dialogs.filters.markdown'), extensions: ['md'] },
      { name: t('main.dialogs.filters.latex'), extensions: ['tex'] },
      { name: t('main.dialogs.filters.json'), extensions: ['json'] },
      { name: t('main.dialogs.filters.pdf'), extensions: ['pdf'] },
      { name: 'Text Files', extensions: ['txt', 'text'] },
      { name: 'Code Files', extensions: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'hpp', 'cs', 'go', 'rs'] },
      { name: t('main.dialogs.filters.all'), extensions: ['*'] },
    ],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];
    const format = path.extname(selectedPath).slice(1).toLowerCase();
    
    // PDF文件是二进制文件，不需要读取内容，让渲染进程处理
    if (format === 'pdf') {
      const payload = {
        content: '', // PDF文件不在这里读取内容
        format: 'pdf',
        path: selectedPath,
        fileName: path.basename(selectedPath),
      };
      
      mainWindow?.webContents.send('open-doc-success', payload);
      mainWindow?.webContents.send('update-current-path', selectedPath);
    } else {
      // 其他文本文件正常读取
      const content = fs.readFileSync(selectedPath, 'utf-8');
      
      const payload = {
        content,
        format,
        path: selectedPath,
        fileName: path.basename(selectedPath),
      };
      
      mainWindow?.webContents.send('open-doc-success', payload);
      mainWindow?.webContents.send('update-current-path', selectedPath);
    }
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
    case 'txt':
      return { name: 'Text Files', extensions: ['txt'] };
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

  // 对于 plaintext 格式（txt），如果已经有其他扩展名，保留它
  // 因为 plaintext 格式包括多种文件类型（.js, .json, .py 等）
  if (format === 'txt' && existingExt && existingExt.length > 1) {
    // 保留原始扩展名，不强制改为 .txt
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
    
    if (format === 'md' || format === 'txt') {
      // 纯文本格式也使用 md 字段存储
      content = data.md || '';
    } else if (format === 'tex') {
      content = data.tex || '';
    }
    
    if (!content) {
      return null;
    }
    
    // 纯文本格式不提取标题，返回 null
    if (format === 'txt') {
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
    .toLocaleString()
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
 * 使用 node-plantuml-2 渲染 PlantUML 代码为本地图片
 * node-plantuml-2 基于 WebAssembly，无需 Java 环境，自动处理 UTF-8 编码和 !theme 指令
 * 注意：已关闭自动语法检查，避免阻塞 UI
 * @param plantumlCode PlantUML 源代码
 * @param format 输出格式：'svg' 或 'png'，默认为 'svg'
 * @returns 本地图片的 HTTP URL
 */
async function renderPlantUMLToLocalImage(plantumlCode: string, format: string = 'svg'): Promise<string> {
  const logger = createMainLogger('PlantUML');
  const crypto = require('crypto');
  
  // 加载 node-plantuml-2 模块（无需任何环境配置）
  // @ts-ignore
  const plantuml = require('node-plantuml-2');
  
  try {
    // 清理代码：移除 BOM，保留 !theme 指令（node-plantuml-2 会自动处理）
    let cleanCode = plantumlCode.replace(/^\uFEFF/, '').trim();
    
    if (!cleanCode) {
      throw new Error('PlantUML 代码为空');
    }
    
    logger.info('开始渲染 PlantUML，代码长度:', cleanCode.length, '格式:', format);
    
    // 让出控制权，避免阻塞 UI
    await new Promise(resolve => setImmediate(resolve));
    
    // 对于 PNG 格式，先生成 SVG，然后转换为高分辨率 PNG
    // 这样可以与其他图表类型保持一致的高分辨率设置
    const outputFormat = format === 'png' ? 'svg' : format;
    const targetFormat = format; // 保留原始目标格式，用于后续判断
    
    // 创建 PlantUML 生成器
    // node-plantuml-2 的 API：使用流式 API
    let gen;
    try {
      gen = plantuml.generate({
        format: outputFormat,
      });
      logger.debug('PlantUML 生成器已创建');
    } catch (genError) {
      logger.error('创建 PlantUML 生成器失败:', genError);
      throw new Error(`无法创建 PlantUML 生成器: ${genError instanceof Error ? genError.message : String(genError)}`);
    }
    
    // 让出控制权
    await new Promise(resolve => setImmediate(resolve));
    
    // 将 PlantUML 代码写入生成器
    try {
      const codeBuffer = Buffer.from(cleanCode, 'utf-8');
      gen.in.write(codeBuffer);
      gen.in.end();
      logger.debug('PlantUML 代码已写入生成器，大小:', codeBuffer.length, 'bytes');
    } catch (writeError) {
      logger.error('写入 PlantUML 代码失败:', writeError);
      throw new Error(`无法写入 PlantUML 代码: ${writeError instanceof Error ? writeError.message : String(writeError)}`);
    }
    
    // 收集生成的图片数据
    const chunks: Buffer[] = [];
    gen.out.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    
    // 收集错误输出（如果存在 stderr），但不阻塞渲染
    const errorChunks: Buffer[] = [];
    if (gen.err) {
      gen.err.on('data', (chunk: Buffer) => {
        errorChunks.push(chunk);
        logger.debug('收到 stderr 数据，大小:', chunk.length, 'bytes');
      });
    }
    
    // 等待生成完成，使用非阻塞方式
    await new Promise<void>((resolve, reject) => {
      let outEnded = false;
      let errEnded = !gen.err;
      let pollCount = 0;
      const maxPolls = 300; // 最多轮询 30 秒（每 100ms 一次）
      
      const checkComplete = () => {
        if (outEnded && errEnded) {
          resolve();
        }
      };
      
      // 监听子进程事件（如果存在）
      if (gen && typeof gen.on === 'function') {
        gen.on('error', (err: Error) => {
          logger.error('PlantUML 生成器错误:', err);
          reject(err);
        });
      }
      
      gen.out.on('end', () => {
        outEnded = true;
        logger.debug('PlantUML stdout 流已结束');
        checkComplete();
      });
      
      gen.out.on('error', (err: Error) => {
        logger.error('PlantUML stdout 错误:', err);
        reject(err);
      });
      
      if (gen.err) {
        gen.err.on('end', () => {
          errEnded = true;
          logger.debug('PlantUML stderr 流已结束');
          checkComplete();
        });
        
        gen.err.on('error', (err: Error) => {
          logger.warn('PlantUML stderr 错误:', err.message);
          errEnded = true;
          checkComplete();
        });
      }
      
      // 使用轮询方式检查完成状态，定期让出控制权
      const pollInterval = setInterval(() => {
        pollCount++;
        if (outEnded && errEnded) {
          clearInterval(pollInterval);
          resolve();
        } else if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          logger.warn('PlantUML 渲染超时', {
            outEnded,
            errEnded,
            chunksCount: chunks.length
          });
          resolve(); // 继续处理，即使超时
        }
      }, 100); // 每 100ms 检查一次
    });
    
    // 让出控制权，允许 UI 更新
    await new Promise(resolve => setImmediate(resolve));
    
    // 注意：已关闭自动语法检查，不会抛出语法错误，即使有 stderr 也继续处理
    // 这样可以避免阻塞 UI，让渲染过程更加流畅
    if (errorChunks.length > 0) {
      // 分批处理，避免阻塞
      await new Promise(resolve => setImmediate(resolve));
      const errorOutput = Buffer.concat(errorChunks).toString('utf-8');
      if (errorOutput.trim()) {
        logger.debug('PlantUML stderr 输出（已忽略，不阻塞）:', errorOutput.substring(0, 200));
        // 不再抛出错误，继续处理
      }
    }
    
    // 分批处理大量数据，避免阻塞 UI
    await new Promise(resolve => setImmediate(resolve));
    const imageBuffer = Buffer.concat(chunks);
    logger.info('PlantUML 渲染完成，大小:', imageBuffer.length, 'bytes');
    
    if (imageBuffer.length === 0) {
      logger.error('PlantUML 渲染输出为空');
      throw new Error(`生成的 ${outputFormat.toUpperCase()} 为空`);
    }
    
    // 让出控制权
    await new Promise(resolve => setImmediate(resolve));
    
    // 将 imageBuffer 转换为字符串，供后续使用（包括 PNG 转换）
    // 对于大文件，toString 可能耗时，但这里 SVG 通常不大，影响较小
    const imageContent = imageBuffer.toString('utf-8');
    
    // 简化验证：只做最基本的格式检查，不进行语法错误检查
    if (outputFormat === 'svg' && !imageContent.includes('<svg')) {
      const errorMsg = imageContent.substring(0, 200).trim();
      logger.error('PlantUML 渲染返回非 SVG 内容:', errorMsg);
      throw new Error(`PlantUML 渲染失败: 未返回有效的 SVG`);
    }
    
    // 如果目标格式是 PNG，将 SVG 转换为高分辨率 PNG
    let finalFormat = targetFormat;
    if (targetFormat === 'png') {
      try {
        // 让出控制权，避免 PNG 转换阻塞
        await new Promise(resolve => setImmediate(resolve));
        
        const pngUrl = await convertSvgStringToPngFile(imageContent, 2.0);
        logger.info('PlantUML SVG 已转换为高分辨率 PNG:', pngUrl);
        return pngUrl;
      } catch (conversionError) {
        logger.error('PlantUML SVG 转 PNG 失败，使用 SVG 格式:', conversionError);
        finalFormat = 'svg';
      }
    }
    
    // 让出控制权
    await new Promise(resolve => setImmediate(resolve));
    
    // 保存到本地图片目录（使用基于源码+格式的稳定哈希文件名，避免重复生成）
    const fileExt = finalFormat === 'png' ? 'png' : 'svg';
    const hash = crypto.createHash('sha256').update(String(plantumlCode) + ':' + finalFormat).digest('hex').slice(0, 16);
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
    
    // 写入文件
    await fs.promises.writeFile(filePath, imageBuffer);
    logger.info(`${finalFormat.toUpperCase()} 已保存到:`, filePath);
    
    // 返回本地 HTTP URL
    const localUrl = `http://localhost:52521/images/${fileName}`;
    logger.info('返回本地 URL:', localUrl);
    
    return localUrl;
  } catch (error) {
    logger.error('PlantUML 渲染失败:', error);
    throw error;
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

/**
 * 绑定数据库测试处理器
 */
function bindDatabaseTestHandlers(): void {
  // 测试数据库连接
  ipcMain.handle('test-database-connection', async () => {
    try {
      const dbPath = getDatabasePath();
      const db = getDatabase();
      
      // 验证连接是否正常
      const result = db.prepare('SELECT 1 as test').get();
      
      return {
        success: true,
        message: '数据库连接成功',
        dbPath: dbPath,
        sqliteVecAvailable: isSqliteVecAvailable()
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '数据库连接失败'
      };
    }
  });

  // 测试创建表
  ipcMain.handle('test-database-create-tables', async () => {
    try {
      ensureInitialized();
      const tables = ['knowledge_files', 'data_chunks', 'vectors'];
      const existingTables = tables.filter(t => tableExists(t));
      
      return {
        success: true,
        message: '表检查完成',
        tablesCreated: existingTables,
        allTablesExist: existingTables.length === tables.length
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '表创建测试失败'
      };
    }
  });

  // 测试创建知识库文件
  ipcMain.handle('test-database-create-file', async (_event, params: {
    filename: string;
    originalPath: string;
    format?: string;
    origin?: string;
  }) => {
    try {
      ensureInitialized();
      const fileId = createKnowledgeFile(
        params.filename,
        params.originalPath,
        params.format,
        params.origin || 'test'
      );
      
      return {
        success: true,
        message: '文件创建成功',
        fileId: fileId
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '文件创建失败'
      };
    }
  });

  // 测试读取知识库文件
  ipcMain.handle('test-database-read-file', async (_event, params: {
    filename: string;
  }) => {
    try {
      ensureInitialized();
      const file = getKnowledgeFileByFilename(params.filename);
      
      return {
        success: true,
        file: file || null,
        message: file ? '文件读取成功' : '文件不存在'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '文件读取失败'
      };
    }
  });

  // 测试更新知识库文件
  ipcMain.handle('test-database-update-file', async (_event, params: {
    fileId: number;
    updates: {
      chunks?: number;
      vector_dim?: number;
      vector_count?: number;
      enabled?: number;
    };
  }) => {
    try {
      ensureInitialized();
      updateKnowledgeFile(params.fileId, params.updates);
      
      return {
        success: true,
        message: '文件更新成功'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '文件更新失败'
      };
    }
  });

  // 测试删除知识库文件
  ipcMain.handle('test-database-delete-file', async (_event, params: {
    fileId: number;
  }) => {
    try {
      ensureInitialized();
      deleteKnowledgeFile(params.fileId);
      
      return {
        success: true,
        message: '文件删除成功'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '文件删除失败'
      };
    }
  });

  // 测试创建数据块
  ipcMain.handle('test-database-create-chunks', async (_event, params: {
    knowledgeFileId: number;
    chunks: Array<{ index: number; text: string; embedding_model?: string }>;
  }) => {
    try {
      ensureInitialized();
      const chunkIds = createDataChunks(params.knowledgeFileId, params.chunks);
      
      return {
        success: true,
        message: '数据块创建成功',
        chunkIds: chunkIds
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '数据块创建失败'
      };
    }
  });

  // 测试查询数据块
  ipcMain.handle('test-database-query-chunks', async (_event, params: {
    knowledgeFileId: number;
  }) => {
    try {
      ensureInitialized();
      const chunks = getDataChunksByFileId(params.knowledgeFileId);
      
      return {
        success: true,
        message: '数据块查询成功',
        chunks: chunks
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '数据块查询失败'
      };
    }
  });

  // 测试创建向量
  ipcMain.handle('test-database-create-vectors', async (_event, params: {
    vectors: Array<{ chunkId: number; embedding: number[] }>;
  }) => {
    try {
      ensureInitialized();
      const vectorIds = createVectors(params.vectors);
      
      return {
        success: true,
        message: '向量创建成功',
        vectorIds: vectorIds
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '向量创建失败'
      };
    }
  });

  // 测试查询向量
  ipcMain.handle('test-database-query-vectors', async (_event, params: {
    knowledgeFileId: number;
  }) => {
    try {
      ensureInitialized();
      const vectors = getVectorsByFileId(params.knowledgeFileId);
      
      return {
        success: true,
        message: '向量查询成功',
        vectors: vectors
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '向量查询失败'
      };
    }
  });

  // 测试向量搜索
  ipcMain.handle('test-database-search-vectors', async (_event, params: {
    queryVector: number[];
    topK?: number;
    threshold?: number;
    enabledOnly?: boolean;
  }) => {
    try {
      ensureInitialized();
      const results = searchSimilarVectors(
        params.queryVector,
        params.topK || 10,
        params.threshold || 0.5,
        params.enabledOnly !== false
      );
      
      return {
        success: true,
        message: '向量搜索成功',
        results: results,
        sqliteVecAvailable: isSqliteVecAvailable()
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '向量搜索失败',
        results: []
      };
    }
  });
}

/**
 * 绑定数据库查询处理器（用于工具会话CRUD）
 */
function bindDatabaseHandlers(): void {
  // 执行查询（SELECT）
  ipcMain.handle('db-query', async (_event: IpcMainInvokeEvent, params: {
    sql: string;
    params: any[];
  }) => {
    try {
      const results = query(params.sql, params.params);
      // 直接返回结果数组，与 tool-sessions-db.ts 中的类型断言兼容
      return results;
    } catch (error) {
      logger.error('数据库查询失败:', error as Error, { sql: params.sql, params: params.params });
      throw error;
    }
  });

  // 执行查询（SELECT）返回单行
  ipcMain.handle('db-query-one', async (_event: IpcMainInvokeEvent, params: {
    sql: string;
    params: any[];
  }) => {
    try {
      const result = queryOne(params.sql, params.params);
      return { success: true, data: result };
    } catch (error) {
      logger.error('数据库查询失败:', error as Error, { sql: params.sql, params: params.params });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // 执行更新（INSERT、UPDATE、DELETE）
  ipcMain.handle('db-execute', async (_event: IpcMainInvokeEvent, params: {
    sql: string;
    params: any[];
  }) => {
    try {
      const result = execute(params.sql, params.params);
      // 直接返回结果，与 tool-sessions-db.ts 中的使用方式兼容
      return result;
    } catch (error) {
      logger.error('数据库执行失败:', error as Error, { sql: params.sql, params: params.params });
      throw error;
    }
  });

  // 检查表是否存在
  ipcMain.handle('db-table-exists', async (_event: IpcMainInvokeEvent, tableName: string) => {
    try {
      const exists = tableExists(tableName);
      return { success: true, exists };
    } catch (error) {
      logger.error('检查表是否存在失败:', error as Error, { tableName });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // 执行事务
  ipcMain.handle('db-transaction', async (_event: IpcMainInvokeEvent, sqlStatements: Array<{
    sql: string;
    params: any[];
  }>) => {
    try {
      transaction(() => {
        for (const { sql, params } of sqlStatements) {
          execute(sql, params);
        }
      });
      return { success: true };
    } catch (error) {
      logger.error('数据库事务失败:', error as Error, { sqlStatements });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

/**
 * 绑定数学公式处理器
 */
function bindMathHandlers(): void {
  // LaTeX 到 OMML 转换（使用 latex-to-omml 包）
  ipcMain.handle('latex-to-omml', async (
    event: IpcMainInvokeEvent,
    latex: string,
    displayMode: boolean = false
  ): Promise<string | null> => {
    try {
      const { latexToOMML } = await import('latex-to-omml');
      const omml = await latexToOMML(latex, { displayMode });
      return omml;
    } catch (error) {
      logger.error('LaTeX 转 OMML 失败:', error);
      return null;
    }
  });
}

