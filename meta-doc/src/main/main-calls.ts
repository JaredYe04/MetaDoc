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
import { queryKnowledgeBase, getResourcesPath, compileLatexToPDF } from './utils';
import type { LaTeXCompileResult } from '../types/utils';
import type { DocumentFormat } from '../types';
import { performExportRequest, type RendererExportPayload } from './export/export-manager';
import { createMainLogger, handleRendererLog, getLoggerConfig, getLoggerHistory, openCurrentLogFile, openLogDirectory, updateLoggerConfig } from './logger';
import { getServiceStatus } from './service-status';
import type { LogPayload, LogLevel } from '../common/logger-constants';
import { t } from './i18n';

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
  ipcMain.handle('read-file-content', async (event: IpcMainInvokeEvent, filePath: string): Promise<string> => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`文件不存在: ${filePath}`);
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return content;
    } catch (error) {
      logger.error('读取文件失败:', error);
      throw error;
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
  
  try {
    logger.info('开始渲染 PlantUML，代码长度:', plantumlCode.length, '格式:', format);
    
    // 根据格式选择输出类型
    const outputFormat = format === 'png' ? 'png' : 'svg';
    const gen = plantuml.generate({
      format: outputFormat,
    });
    
    // 将 PlantUML 代码写入生成器
    gen.in.write(plantumlCode);
    gen.in.end();
    
    // 收集生成的 SVG 数据
    const chunks: Buffer[] = [];
    gen.out.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    
    // 等待生成完成
    await new Promise<void>((resolve, reject) => {
      gen.out.on('end', () => {
        resolve();
      });
      gen.out.on('error', (err: Error) => {
        reject(err);
      });
    });
    
    const imageBuffer = Buffer.concat(chunks);
    logger.info('PlantUML 渲染完成，大小:', imageBuffer.length, 'bytes');
    
    if (imageBuffer.length === 0) {
      throw new Error(`生成的 ${outputFormat.toUpperCase()} 为空`);
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
