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
  IpcMainEvent
} from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
// import icon from '../../resources/icon.png?asset';
const icon = undefined; // 暂时禁用icon导入
import { mainCalls } from './main-calls';
import { runExpressServer } from './express-server';
import { initializeUtils } from './utils';
import { initLogger, shutdownLogger, createMainLogger } from './logger';
import { broadcastServiceStatus } from './service-status';

const url = require('url');
const path = require('path');

initLogger();
const logger = createMainLogger('MainProcess');

// ============ 全局变量 ============

export let mainWindow: BrowserWindow | null = null;
export let settingWindow: BrowserWindow | null = null;
export let aichatWindow: BrowserWindow | null = null;
export let fomulaRecognitionWindow: BrowserWindow | null = null;
export let aiGraphWindow: BrowserWindow | null = null;
export let dirname: string;
export let is_need_save: boolean = false;

// 窗口状态管理
let aiChatWindowOpened: boolean = false;
let settingWindowOpened: boolean = false;
let fomulaRecognitionWindowOpened: boolean = false;
let aiGraphWindowOpened: boolean = false;
let isShortcutPressed: boolean = false;

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

  // 窗口准备好显示时
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    bindShortcuts();
    broadcastServiceStatus();
    
    // 初始化工具服务
    (async () => {
      try {
        logger.info('🚀 正在后台初始化工具服务...');
        await initializeUtils();
        logger.info('✅ 工具服务初始化完成');
      } catch (error) {
        logger.error('❌ 工具服务初始化失败:', error);
      }
    })();
  });

  // 处理窗口关闭
  mainWindow.on('close', (e) => {
    if (is_need_save) {
      e.preventDefault();
      mainWindow?.webContents.send('close-triggered');
    }
  });

  // 处理新窗口打开
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // 处理命令行参数
  handleCommandLineArgs();
  
  // 设置为全局变量
  (global as any).mainWindow = mainWindow;
  
  // 启动Express服务器
  runExpressServer();
}

/**
 * 处理命令行参数
 */
function handleCommandLineArgs(): void {
  const args = process.argv;
  const supportedExtensions = ['.md', '.json', '.txt'];
  
  const filePath = args.find(arg => {
    const ext = path.extname(arg).toLowerCase();
    return supportedExtensions.includes(ext);
  });

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
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.jaredye.meta-doc');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();
  mainCalls();

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

  // 监听窗口失去焦点
  mainWindow?.on('blur', () => {
    unregisterShortcuts();
  });
}

/**
 * 注册快捷键
 */
function registerShortcuts(): void {
  globalShortcut.register('CommandOrControl+S', async () => {
    if (!isShortcutPressed) {
      isShortcutPressed = true;
      mainWindow?.webContents.send('save-triggered');
      setTimeout(() => (isShortcutPressed = false), 1000);
    }
  });

  globalShortcut.register('CommandOrControl+Shift+S', async () => {
    if (!isShortcutPressed) {
      isShortcutPressed = true;
      mainWindow?.webContents.send('save-as-triggered');
      setTimeout(() => (isShortcutPressed = false), 1000);
    }
  });

  globalShortcut.register('CommandOrControl+F', async () => {
    if (!isShortcutPressed) {
      isShortcutPressed = true;
      mainWindow?.webContents.send('search-replace-triggered');
      setTimeout(() => (isShortcutPressed = false), 1000);
    }
  });

  globalShortcut.register('CommandOrControl+H', async () => {
    if (!isShortcutPressed) {
      isShortcutPressed = true;
      mainWindow?.webContents.send('search-replace-triggered');
      setTimeout(() => (isShortcutPressed = false), 1000);
    }
  });
}

/**
 * 注销快捷键
 */
function unregisterShortcuts(): void {
  globalShortcut.unregister('CommandOrControl+S');
  globalShortcut.unregister('CommandOrControl+Shift+S');
  globalShortcut.unregister('CommandOrControl+F');
  globalShortcut.unregister('CommandOrControl+H');
}

// ============ 子窗口管理 ============

/**
 * 打开设置对话框
 */
export const openSettingDialog = async (): Promise<void> => {
  if (settingWindowOpened) {
    settingWindow?.focus();
    return;
  }

  settingWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 600,
    parent: mainWindow || undefined,
    modal: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  settingWindow.on('ready-to-show', () => {
    settingWindow?.show();
    settingWindowOpened = true;
  });

  settingWindow.on('close', () => {
    settingWindowOpened = false;
    settingWindow = null;
  });

  settingWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  const settingUrl = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL']}/index.html#/setting?windowType=setting`
    : `file://${path.join(__dirname, '../renderer/index.html')}#/setting?windowType=setting`;

  await settingWindow.loadURL(settingUrl);
  settingWindow.setTitle('设置面板');
};

/**
 * 打开AI对话框
 */
export const openAiChatDialog = async (payload: any = null): Promise<void> => {
  if (aiChatWindowOpened) {
    aichatWindow?.focus();
    return;
  }

  aichatWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    parent: mainWindow || undefined,
    modal: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  aichatWindow.on('ready-to-show', () => {
    aichatWindow?.show();
    aiChatWindowOpened = true;
  });

  aichatWindow.on('close', () => {
    aiChatWindowOpened = false;
    aichatWindow = null;
  });

  aichatWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  const chatUrl = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL']}/index.html#/ai-chat?windowType=ai-chat`
    : `file://${path.join(__dirname, '../renderer/index.html')}#/ai-chat?windowType=ai-chat`;

  await aichatWindow.loadURL(chatUrl);
  aichatWindow.setTitle('与AI对话');
};

/**
 * 打开公式识别对话框
 */
export const openFomulaRecognitionDialog = async (): Promise<void> => {
  if (fomulaRecognitionWindowOpened) {
    fomulaRecognitionWindow?.focus();
    return;
  }

  fomulaRecognitionWindow = new BrowserWindow({
    width: 1280,
    height: 550,
    parent: mainWindow || undefined,
    modal: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  fomulaRecognitionWindow.on('ready-to-show', () => {
    fomulaRecognitionWindow?.show();
    fomulaRecognitionWindowOpened = true;
  });

  fomulaRecognitionWindow.on('close', () => {
    fomulaRecognitionWindowOpened = false;
    fomulaRecognitionWindow = null;
  });

  fomulaRecognitionWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  const formulaUrl = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL']}/index.html#/fomula-recognition?windowType=fomula-recognition`
    : `file://${path.join(__dirname, '../renderer/index.html')}#/fomula-recognition?windowType=fomula-recognition`;

  await fomulaRecognitionWindow.loadURL(formulaUrl);
  fomulaRecognitionWindow.setTitle('手写公式识别助手');
};

/**
 * 打开AI绘图对话框
 */
export const openAiGraphDialog = async (): Promise<void> => {
  if (aiGraphWindowOpened) {
    aiGraphWindow?.focus();
    return;
  }

  aiGraphWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    parent: mainWindow || undefined,
    modal: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  aiGraphWindow.on('ready-to-show', () => {
    aiGraphWindow?.show();
    aiGraphWindowOpened = true;
  });

  aiGraphWindow.on('close', () => {
    aiGraphWindowOpened = false;
    aiGraphWindow = null;
  });

  aiGraphWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  const graphUrl = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL']}/index.html#/ai-graph?windowType=ai-graph`
    : `file://${path.join(__dirname, '../renderer/index.html')}#/ai-graph?windowType=ai-graph`;

  await aiGraphWindow.loadURL(graphUrl);
  aiGraphWindow.setTitle('智能绘图助手');
};

// ============ 广播频道管理 ============

/**
 * 初始化广播频道
 */
export const initBroadcastChannel = (): void => {
  ipcMain.on('send-broadcast', (event: IpcMainEvent, message: any) => {
    // 向所有窗口广播消息
    const windows = [
      mainWindow,
      aichatWindow,
      settingWindow,
      fomulaRecognitionWindow,
      aiGraphWindow
    ].filter(win => win !== null);

    windows.forEach(win => {
      win?.webContents.send('receive-broadcast', message);
    });
  });
};
