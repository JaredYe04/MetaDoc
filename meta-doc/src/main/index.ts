/**
 * 主进程入口文件 - TypeScript 重构版本
 * 负责应用初始化、窗口管理和生命周期控制
 */

import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  IpcMainEvent,
  dialog
} from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
// import icon from '../../resources/icon.png?asset';
const icon = undefined; // 暂时禁用icon导入
import fs from 'fs';
import http from 'http';
import { mainCalls, refreshMainWindowTitle, openDoc } from './main-calls';
import { initUpdateService } from './utils/update-service';
import { registerExternalOpenHandler, registerFocusRequestHandler, runExpressServer, refreshKnowledgeItems } from './express-server';
import { initializeUtils } from './utils';
import { initLogger, shutdownLogger, createMainLogger } from './logger';
import { broadcastServiceStatus } from './service-status';
import { initI18n, t, dispatchLanguageToWindow, setLocale, broadcastLanguage } from './i18n';
import { initWindowManager, preloadAuxiliaryWindows, openAuxiliaryWindow, refreshAuxiliaryWindowTitles, dispatchLanguageToAuxWindows } from './window-manager';

const url = require('url');
const path = require('path');

// 加载环境变量
import dotenv from 'dotenv';

// 加载 .env 文件
// 在开发环境中，从项目根目录加载；在打包后，从 resources 目录加载
let envPath: string;
if (app.isPackaged) {
  // 打包后：从 resources 目录加载（resources 目录会被 asarUnpack 解包）
  envPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', '.env');
} else {
  // 开发环境：从项目根目录加载
  envPath = path.resolve(__dirname, '../../.env');
}
dotenv.config({ path: envPath });

// 关键修复：在应用启动时设置 Java 环境变量，确保 PlantUML 使用 UTF-8 编码
// 这必须在所有其他初始化之前设置，确保全局生效
if (!process.env.JAVA_OPTS || !process.env.JAVA_OPTS.includes('-Dfile.encoding')) {
  process.env.JAVA_OPTS = (process.env.JAVA_OPTS || '') + ' -Dfile.encoding=UTF-8';
}
if (!process.env._JAVA_OPTIONS || !process.env._JAVA_OPTIONS.includes('-Dfile.encoding')) {
  process.env._JAVA_OPTIONS = (process.env._JAVA_OPTIONS || '') + ' -Dfile.encoding=UTF-8';
}

initLogger();
initI18n();
const logger = createMainLogger('MainProcess');

const SUPPORTED_FILE_EXTENSIONS = new Set(['.md', '.json', '.txt', '.tex']);
const RUNTIME_API_HOST = '127.0.0.1';
const RUNTIME_API_PORT = 52521;

const startupFileArgument = findSupportedFileArgument(process.argv);
const prelaunchDelegationPromise = attemptDelegationToRunningInstance(startupFileArgument);

// ============ 全局变量 ============

export let mainWindow: BrowserWindow | null = null;
export let dirname: string;
export let is_need_save: boolean = false;

let isShortcutPressed: boolean = false;
let isAppQuitting = false;
const SHORTCUT_CONFIG = [
  { accelerator: 'CommandOrControl+S', channel: 'save-triggered' as const },
  { accelerator: 'CommandOrControl+Shift+S', channel: 'save-as-triggered' as const },
  { accelerator: 'CommandOrControl+F', channel: 'search-replace-triggered' as const },
  { accelerator: 'CommandOrControl+H', channel: 'search-replace-expand-triggered' as const },
] as const;

function focusMainApplicationWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

// ============ 主窗口创建和管理 ============

/**
 * 创建主窗口
 */
function createWindow(): void {
  dirname = __dirname;
  
  // 启用日志输出
  app.commandLine.appendSwitch('enable-logging');
  app.commandLine.appendSwitch('v', '1');
  
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: true,
      webSecurity: false,
    }
  });

  initWindowManager(() => mainWindow);

  mainWindow.webContents.on('did-finish-load', () => {
    dispatchLanguageToWindow(mainWindow);
  });

  // 窗口准备好显示时
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    bindShortcuts();
    broadcastServiceStatus();
    
    // 初始化工具服务（包括知识库服务）
    (async () => {
      try {
        logger.info('🚀 正在后台初始化工具服务（包括知识库服务）...');
        await initializeUtils();
        // 工具服务初始化完成后，刷新知识库列表
        refreshKnowledgeItems();
        logger.info('✅ 工具服务初始化完成，知识库列表已刷新');
      } catch (error) {
        logger.error('❌ 工具服务初始化失败:', error);
      }
    })();
    
    // 在后台串行预加载辅助窗口，不阻塞主窗口显示
    (async () => {
      try {
        logger.info('🚀 开始串行预加载辅助窗口...');
        await preloadAuxiliaryWindows();
        logger.info('✅ 所有辅助窗口预加载完成');
      } catch (error) {
        logger.error('❌ 预加载辅助窗口失败:', error);
      }
    })();
  });

  // 处理窗口关闭
  mainWindow.on('close', async (e) => {
    if (is_need_save) {
      e.preventDefault();
      
      // 通过 IPC 调用获取所有未保存的tabs信息
      let unsavedTabs: Array<{ tabId: string; fileName: string; path: string }> = [];
      try {
        // 发送请求获取所有未保存的tabs信息
        mainWindow?.webContents.send('request-unsaved-tabs-info');
        
        // 等待响应
        unsavedTabs = await new Promise<Array<{ tabId: string; fileName: string; path: string }>>((resolve) => {
          const handler = (_event: IpcMainEvent, tabs: Array<{ tabId: string; fileName: string; path: string }>) => {
            ipcMain.removeListener('unsaved-tabs-info-response', handler);
            resolve(tabs || []);
          };
          ipcMain.once('unsaved-tabs-info-response', handler);
          // 设置超时，避免无限等待
          setTimeout(() => {
            ipcMain.removeListener('unsaved-tabs-info-response', handler);
            resolve([]);
          }, 1000);
        });
      } catch (error) {
        logger.error('获取未保存tabs信息失败:', error);
      }
      
      // 如果没有未保存的tabs，直接关闭
      if (unsavedTabs.length === 0) {
        is_need_save = false;
        mainWindow?.close();
        return;
      }
      
      // 依次处理每个未保存的tab
      for (let i = 0; i < unsavedTabs.length; i++) {
        const tab = unsavedTabs[i];
        const fileName = tab.fileName || t('main.dialogs.unsavedDocument', '未保存的文档');
        const isLastTab = i === unsavedTabs.length - 1;
        
        // 显示系统级对话框
        const result = await dialog.showMessageBox(mainWindow!, {
          type: 'question',
          buttons: [
            t('leftMenu.save', '保存'),
            t('leftMenu.discard', '放弃'),
            t('common.cancel', '取消')
          ],
          defaultId: 0,
          cancelId: 2,
          title: t('main.dialogs.closeWindowTitle', '关闭窗口'),
          message: t('main.dialogs.askSaveWithFileName', '是否保存 {fileName}？', { fileName }),
          detail: isLastTab 
            ? t('main.dialogs.unsavedChangesDetail', '您的更改尚未保存。')
            : t('main.dialogs.unsavedChangesDetail', '您的更改尚未保存。') + ` (${i + 1}/${unsavedTabs.length})`
        });
        
        if (result.response === 0) {
          // 用户选择保存
          try {
            // 发送保存请求
            mainWindow?.webContents.send('save-tab', tab.tabId);
            
            // 等待保存响应
            const saveResult = await new Promise<{ tabId: string; success: boolean; error?: string }>((resolve) => {
              const handler = (_event: IpcMainEvent, result: { tabId: string; success: boolean; error?: string }) => {
                if (result.tabId === tab.tabId) {
                  ipcMain.removeListener('save-tab-response', handler);
                  resolve(result);
                }
              };
              ipcMain.on('save-tab-response', handler);
              // 设置超时，避免无限等待
              setTimeout(() => {
                ipcMain.removeListener('save-tab-response', handler);
                resolve({ tabId: tab.tabId, success: false, error: '保存超时' });
              }, 10000);
            });
            
            if (!saveResult.success) {
              // 保存失败，询问用户是否继续
              const continueResult = await dialog.showMessageBox(mainWindow!, {
                type: 'error',
                buttons: [
                  t('common.continue', '继续'),
                  t('common.cancel', '取消')
                ],
                defaultId: 0,
                cancelId: 1,
                title: t('main.dialogs.saveFailed', '保存失败'),
                message: t('main.dialogs.saveFailedMessage', '保存 {fileName} 失败', { fileName }),
                detail: saveResult.error || t('main.dialogs.saveFailedDetail', '是否继续关闭其他文档？')
              });
              
              if (continueResult.response === 1) {
                // 用户选择取消，停止处理
                return;
              }
            }
          } catch (error) {
            logger.error('保存tab失败:', error);
            // 保存出错，询问用户是否继续
            const continueResult = await dialog.showMessageBox(mainWindow!, {
              type: 'error',
              buttons: [
                t('common.continue', '继续'),
                t('common.cancel', '取消')
              ],
              defaultId: 0,
              cancelId: 1,
              title: t('main.dialogs.saveFailed', '保存失败'),
              message: t('main.dialogs.saveFailedMessage', '保存 {fileName} 失败', { fileName }),
              detail: t('main.dialogs.saveFailedDetail', '是否继续关闭其他文档？')
            });
            
            if (continueResult.response === 1) {
              // 用户选择取消，停止处理
              return;
            }
          }
        } else if (result.response === 1) {
          // 用户选择放弃
          try {
            // 发送放弃请求
            mainWindow?.webContents.send('discard-tab', tab.tabId);
            
            // 等待放弃响应（通常很快，但我们也设置超时）
            await new Promise<void>((resolve) => {
              const handler = (_event: IpcMainEvent, result: { tabId: string; success: boolean }) => {
                if (result.tabId === tab.tabId) {
                  ipcMain.removeListener('discard-tab-response', handler);
                  resolve();
                }
              };
              ipcMain.on('discard-tab-response', handler);
              // 设置超时，避免无限等待
              setTimeout(() => {
                ipcMain.removeListener('discard-tab-response', handler);
                resolve();
              }, 1000);
            });
          } catch (error) {
            logger.error('放弃tab更改失败:', error);
          }
        } else {
          // 用户选择取消（response === 2），停止处理，窗口保持打开
          return;
        }
      }
      
      // 所有未保存的tabs都已处理完毕，关闭所有剩余的tabs（没有脏标记的tabs）
      try {
        // 发送请求关闭所有剩余的tabs
        mainWindow?.webContents.send('close-all-tabs');
        
        // 等待响应（通常很快，但我们也设置超时）
        await new Promise<void>((resolve) => {
          const handler = (_event: IpcMainEvent, result: { success: boolean }) => {
            ipcMain.removeListener('close-all-tabs-response', handler);
            resolve();
          };
          ipcMain.once('close-all-tabs-response', handler);
          // 设置超时，避免无限等待
          setTimeout(() => {
            ipcMain.removeListener('close-all-tabs-response', handler);
            resolve();
          }, 2000);
        });
      } catch (error) {
        logger.error('关闭所有tabs失败:', error);
      }
      
      // 更新标志并关闭窗口
      is_need_save = false;
      mainWindow?.close();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (!isAppQuitting) {
      app.quit();
    }
  });

  // 处理关闭单个tab的请求
  ipcMain.on('request-close-tab', async (event, tabId: string) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    
    try {
      // 发送请求获取tab信息
      mainWindow.webContents.send('request-tab-info', tabId);
      
      // 等待响应
      const tabInfo = await new Promise<{ fileName: string; path: string; dirty: boolean } | null>((resolve) => {
        const handler = (_event: IpcMainEvent, info: { fileName: string; path: string; dirty: boolean } | null) => {
          ipcMain.removeListener('tab-info-response', handler);
          resolve(info);
        };
        ipcMain.once('tab-info-response', handler);
        // 设置超时，避免无限等待
        setTimeout(() => {
          ipcMain.removeListener('tab-info-response', handler);
          resolve(null);
        }, 1000);
      });
      
      if (!tabInfo) {
        // 如果获取tab信息失败，直接关闭tab
        mainWindow.webContents.send('close-tab-response', { tabId, action: 'discard' });
        return;
      }
      
      // 如果tab没有脏标记，直接关闭
      if (!tabInfo.dirty) {
        mainWindow.webContents.send('close-tab-response', { tabId, action: 'discard' });
        return;
      }
      
      // 如果有脏标记，显示系统对话框
      const fileName = tabInfo.fileName || t('main.dialogs.unsavedDocument', '未保存的文档');
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: [
          t('leftMenu.save', '保存'),
          t('leftMenu.discard', '放弃'),
          t('common.cancel', '取消')
        ],
        defaultId: 0,
        cancelId: 2,
        title: t('main.dialogs.closeTabTitle', '未保存的更改'),
        message: t('main.dialogs.askSaveWithFileName', '是否保存 {fileName}？', { fileName }),
        detail: t('main.dialogs.unsavedChangesDetail', '您的更改尚未保存。')
      });
      
      if (result.response === 0) {
        // 用户选择保存
        mainWindow.webContents.send('close-tab-response', { tabId, action: 'save' });
      } else if (result.response === 1) {
        // 用户选择放弃
        mainWindow.webContents.send('close-tab-response', { tabId, action: 'discard' });
      } else {
        // 用户选择取消
        mainWindow.webContents.send('close-tab-response', { tabId, action: 'cancel' });
      }
    } catch (error) {
      logger.error('处理关闭tab请求失败:', error);
      mainWindow.webContents.send('close-tab-response', { tabId, action: 'cancel' });
    }
  });

  // 处理新窗口打开
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // 处理命令行参数
  handleCommandLineArgs(startupFileArgument);
  
  // 设置为全局变量
  (global as any).mainWindow = mainWindow;

  registerExternalOpenHandler(async ({ path }) => {
    try {
      if (!path) return;
      focusMainApplicationWindow();
      await openDoc(path);
    } catch (error) {
      logger.error('处理外部打开文件请求失败', error as Error);
    }
  });

  registerFocusRequestHandler(async () => {
    focusMainApplicationWindow();
  });
  
  // 启动Express服务器
  runExpressServer();
}

/**
 * 处理命令行参数
 */
function handleCommandLineArgs(initialFilePath?: string | null): void {
  const filePath = initialFilePath || findSupportedFileArgument(process.argv);
  const queryParams = filePath ? `&file=${encodeURIComponent(filePath)}` : '';
  
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow?.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/#/home?windowType=home' + queryParams);
  } else {
    const indexPath = path.join(__dirname, '../renderer/index.html');
    const fileURL = url.pathToFileURL(indexPath).toString();
    mainWindow?.loadURL(`${fileURL}#/home?windowType=home${queryParams}`);
  }
}

// ============ 应用生命周期管理 ============

/**
 * 应用准备就绪时
 */
app.whenReady().then(async () => {
  // 使用与 electron-builder.yml 中一致的 appId
  electronApp.setAppUserModelId('com.byte-light.metadoc');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  if (await prelaunchDelegationPromise) {
    const delegationAction = startupFileArgument ? '转发文件打开请求' : '发送聚焦请求';
    logger.info(`检测到已有 MetaDoc 实例，已${delegationAction}，本实例即将退出`);
    app.quit();
    return;
  }

  // 在创建窗口之前执行数据库迁移，确保表已创建
  try {
    logger.info('🚀 正在执行数据库迁移...');
    const { ensureInitialized } = await import('./database/knowledge-db');
    ensureInitialized();
    logger.info('✅ 数据库迁移完成');
  } catch (error) {
    logger.error('❌ 数据库迁移失败:', error);
  }

  createWindow();
  mainCalls();
  
  // 初始化更新服务
  initUpdateService();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // 错误处理（通过process监听）
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception:', error);
  });
});

/**
 * 监听保存状态
 */
ipcMain.on('is-need-save', (event: IpcMainEvent, arg: boolean) => {
  is_need_save = arg;
});

/**
 * 所有窗口关闭时
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isAppQuitting = true;
  shutdownLogger();
});

// ============ 快捷键绑定 ============

/**
 * 绑定全局快捷键
 */
function bindShortcuts(): void {
  // 监听窗口焦点
  mainWindow?.on('focus', () => {
    registerShortcuts();
  });

  mainWindow?.on('show', () => {
    registerShortcuts();
  });

  // 监听窗口失去焦点
  mainWindow?.on('blur', () => {
    unregisterShortcuts();
  });
}

/**
 * 注册快捷键
 */
function registerShortcuts(): void {
  if (!mainWindow || !mainWindow.isVisible() || !mainWindow.isFocused()) {
    return;
  }

  SHORTCUT_CONFIG.forEach(({ accelerator, channel }) => {
    if (globalShortcut.isRegistered(accelerator)) {
      return;
    }

    const success = globalShortcut.register(accelerator, () => {
      if (isShortcutPressed) return;
      isShortcutPressed = true;
      mainWindow?.webContents.send(channel);
      setTimeout(() => {
        isShortcutPressed = false;
      }, 1000);
    });

    if (!success) {
      logger.warn(`全局快捷键注册失败: ${accelerator}`);
    }
  });
}

/**
 * 注销快捷键
 */
function unregisterShortcuts(): void {
  SHORTCUT_CONFIG.forEach(({ accelerator }) => {
    if (globalShortcut.isRegistered(accelerator)) {
      globalShortcut.unregister(accelerator);
    }
  });
}

// ============ 子窗口管理 ============

const WINDOW_IDS = {
  setting: 'setting',
  aiChat: 'aiChat',
  formulaRecognition: 'formulaRecognition',
  aiGraph: 'aiGraph'
} as const;

export const openSettingDialog = async (): Promise<void> => {
  openAuxiliaryWindow(WINDOW_IDS.setting);
};

export const openAiChatDialog = async (): Promise<void> => {
  openAuxiliaryWindow(WINDOW_IDS.aiChat);
};

export const openFomulaRecognitionDialog = async (): Promise<void> => {
  openAuxiliaryWindow(WINDOW_IDS.formulaRecognition);
};

export const openDataAnalysisDialog = async (): Promise<void> => {
  const { openAuxiliaryWindow } = await import('./window-manager');
  openAuxiliaryWindow('dataAnalysis');
};

export const openOcrDialog = async (): Promise<void> => {
  const { openAuxiliaryWindow } = await import('./window-manager');
  openAuxiliaryWindow('ocr');
};

export const openAttachmentDialog = async (): Promise<void> => {
  const { openAuxiliaryWindow } = await import('./window-manager');
  openAuxiliaryWindow('attachment');
};

export const openGraphDialog = async (): Promise<void> => {
  const { openAuxiliaryWindow } = await import('./window-manager');
  openAuxiliaryWindow('graph');
};

export const openAiGraphDialog = async (): Promise<void> => {
  openAuxiliaryWindow(WINDOW_IDS.aiGraph);
};

// ============ 广播频道管理 ============

interface HttpRequestResult {
  ok: boolean;
  statusCode?: number;
  body: string;
}

function findSupportedFileArgument(args: string[]): string | null {
  for (const arg of args) {
    if (!arg || arg.startsWith('--')) continue;
    const ext = path.extname(arg).toLowerCase();
    if (SUPPORTED_FILE_EXTENSIONS.has(ext) && fs.existsSync(arg)) {
      return path.resolve(arg);
    }
  }
  return null;
}

async function attemptDelegationToRunningInstance(filePath?: string | null): Promise<boolean> {
  const statusResponse = await performHttpRequest({
    host: RUNTIME_API_HOST,
    port: RUNTIME_API_PORT,
    path: '/api/runtime/status',
    method: 'GET',
  });

  if (!statusResponse.ok) {
    return false;
  }
  
  if (filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        logger.warn(`启动参数指定的文件不存在: ${filePath}`);
        return false;
      }
    } catch (error) {
      logger.warn('检测启动文件是否存在时出错', error as Error);
      return false;
    }

    const payload = JSON.stringify({ path: path.resolve(filePath) });
    const openResponse = await performHttpRequest({
      host: RUNTIME_API_HOST,
      port: RUNTIME_API_PORT,
      path: '/api/runtime/open-document',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload).toString(),
      },
    }, payload);
  
    if (!openResponse.ok) {
      logger.warn(`向已有实例发送打开文件请求失败，状态码: ${openResponse.statusCode}`);
      return false;
    }
  
    return true;
  }

  const focusResponse = await performHttpRequest({
    host: RUNTIME_API_HOST,
    port: RUNTIME_API_PORT,
    path: '/api/runtime/focus-window',
    method: 'POST',
    headers: {
      'Content-Length': '0',
    },
  });

  if (!focusResponse.ok) {
    logger.warn(`向已有实例发送聚焦请求失败，状态码: ${focusResponse.statusCode}`);
    return false;
  }

  return true;
}

function performHttpRequest(options: http.RequestOptions, body?: string): Promise<HttpRequestResult> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: RUNTIME_API_HOST,
        port: RUNTIME_API_PORT,
        timeout: 500,
        ...options,
        headers: {
          Connection: 'close',
          ...(options.headers ?? {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const bodyBuffer = Buffer.concat(chunks);
          const text = bodyBuffer.toString('utf-8');
          resolve({
            ok: res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            body: text,
          });
        });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, statusCode: 0, body: '' });
    });

    req.on('error', (error) => {
      logger.debug('检测已有实例时请求失败', error);
      resolve({ ok: false, statusCode: 0, body: '' });
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

/**
 * 初始化广播频道
 */
export const initBroadcastChannel = (): void => {
  ipcMain.on('send-broadcast', (event: IpcMainEvent, message: any) => {
    if (message && typeof message === 'object' && message.eventName === 'lang-changed' && typeof message.data === 'string') {
      setLocale(message.data, { notifyRenderer: false });

      refreshMainWindowTitle();
      refreshAuxiliaryWindowTitles();
      dispatchLanguageToAuxWindows();
      broadcastLanguage();
    }

    // 向所有窗口广播消息
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('receive-broadcast', message);
    });
  });
};
