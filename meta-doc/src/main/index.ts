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
import { mainCalls, refreshMainWindowTitle } from './main-calls';
import { runExpressServer } from './express-server';
import { initializeUtils } from './utils';
import { initLogger, shutdownLogger, createMainLogger } from './logger';
import { broadcastServiceStatus } from './service-status';
import { initI18n, t, dispatchLanguageToWindow, setLocale, broadcastLanguage } from './i18n';
import { initWindowManager, preloadAuxiliaryWindows, openAuxiliaryWindow, refreshAuxiliaryWindowTitles, dispatchLanguageToAuxWindows } from './window-manager';

const url = require('url');
const path = require('path');

initLogger();
initI18n();
const logger = createMainLogger('MainProcess');

// ============ 全局变量 ============

export let mainWindow: BrowserWindow | null = null;
export let dirname: string;
export let is_need_save: boolean = false;

let isShortcutPressed: boolean = false;
let isAppQuitting = false;

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
    setTimeout(() => preloadAuxiliaryWindows(), 0);
  });

  // 处理窗口关闭
  mainWindow.on('close', (e) => {
    if (is_need_save) {
      e.preventDefault();
      mainWindow?.webContents.send('close-triggered');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (!isAppQuitting) {
      app.quit();
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

export const openAiGraphDialog = async (): Promise<void> => {
  openAuxiliaryWindow(WINDOW_IDS.aiGraph);
};

// ============ 广播频道管理 ============

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
