import { app, shell, BrowserWindow, ipcMain, globalShortcut, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { mainCalls, openDoc } from './main_calls'
import { runExpressServer } from './express_server'
const url = require('url');
const path = require('path');

let mainWindow;
export var dirname;


let is_need_save = false;
ipcMain.on('is-need-save', (event, arg) => {
  //console.log('is-need-save:', arg)
  is_need_save = arg;
});

function createWindow() {
  dirname = __dirname;
  // Create the browser window.
  mainWindow = new BrowserWindow({
    //默认最大化展示
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
  })

  mainWindow.on('ready-to-show', async () => {
    mainWindow.show()
    bindShortcuts();//绑定快捷键
  })
  // mainWindow.webContents.on('will-navigate', (event, url) => {
  //   event.preventDefault(); // 阻止导航
  //   // 可以在这里根据 url 决定是否打开，或用 shell.openExternal(url)
  // });
  mainWindow.on('close', (e) => {
    //console.log('close event:', is_need_save)
    if (is_need_save) {
      e.preventDefault();
      mainWindow.webContents.send('close-triggered');
    }
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
 
  const args = process.argv;
  //console.log('args:', args);
  //获取第一个参数作为文件路径，如果没有就不打开文件
  let filePath = '';
  const supportedExtensions = ['.md', '.json', '.txt'];
  //console.log(args)
  if (args.length > 1) {
    //弹窗
    filePath = args.find(arg => {
      const ext = path.extname(arg).toLowerCase();
      return supportedExtensions.includes(ext);
    });
    console.log('filePath:', filePath);
  }
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/#/home?windowType=home' + (filePath ? `&file=${encodeURIComponent(filePath)}` : ''))
  } else {
    // 生产环境：用 file:// 协议 + loadURL + query
    const indexPath = path.join(__dirname, '../renderer/index.html');
    const fileURL = url.pathToFileURL(indexPath).toString(); // 转为 file:// 协议

    mainWindow.loadURL(
      `${fileURL}#/home?windowType=home${filePath ? `&file=${encodeURIComponent(filePath)}` : ''}`
    );
    // mainWindow.loadFile(join(__dirname, '../renderer/index.html'+ (filePath ? `?file=${encodeURIComponent(filePath)}` : '')))
  }
  global.mainWindow = mainWindow;
  runExpressServer(); // 启动本地CDN服务器

}
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.

app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.jaredye.meta-doc')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  createWindow();
  mainCalls();//绑定主进程的事件处理函数

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
//当electron出error时要用console.log
  app.on('error', (error) => {
    console.log('Electron error:', error);
  });
})
let isShortcutPressed = false; // 锁变量，防止重复触发

// 监听before-quit事件




function bindShortcuts() {
  // 监听窗口焦点
  mainWindow.on('focus', () => {
    // 注册快捷键
    globalShortcut.register('CommandOrControl+S', async () => {
      if (!isShortcutPressed) {
        isShortcutPressed = true; // 设置锁
        mainWindow.webContents.send('save-triggered');
        setTimeout(() => (isShortcutPressed = false), 1000); // 短时间后释放锁
      }
    });

    globalShortcut.register('CommandOrControl+Shift+S', async () => {
      if (!isShortcutPressed) {
        isShortcutPressed = true; // 设置锁
        mainWindow.webContents.send('save-as-triggered');
        setTimeout(() => (isShortcutPressed = false), 1000); // 短时间后释放锁
      }
    });
    globalShortcut.register('CommandOrControl+F', async () => {
      if (!isShortcutPressed) {
        isShortcutPressed = true; // 设置锁
        mainWindow.webContents.send('search-replace-triggered');
        setTimeout(() => (isShortcutPressed = false), 1000); // 短时间后释放锁
      }
    });
    globalShortcut.register('CommandOrControl+H', async () => {
      if (!isShortcutPressed) {
        isShortcutPressed = true; // 设置锁
        mainWindow.webContents.send('search-replace-triggered');
        setTimeout(() => (isShortcutPressed = false), 1000); // 短时间后释放锁
      }
    });
  });

  // 监听窗口失去焦点
  mainWindow.on('blur', () => {
    // 注销快捷键
    globalShortcut.unregister('CommandOrControl+S');
    globalShortcut.unregister('CommandOrControl+Shift+S');
    globalShortcut.unregister('CommandOrControl+F');
    globalShortcut.unregister('CommandOrControl+H');
  });
}
// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
let settingWindow = null;//设置窗口
let aichatWindow = null;//AI对话窗口
let fomulaRecognitionWindow = null;//公式识别窗口
let aiGraphWindow = null;//AI图形窗口

export { mainWindow, settingWindow, aichatWindow, is_need_save, fomulaRecognitionWindow, aiGraphWindow }//添加完窗口应该暴露

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.



let aiChatWindowOpened = false;
let settingWindowOpened = false;
let fomulaRecognitionWindowOpened = false;
let aiGraphWindowOpened = false;
export const initBroadcastChannel = () => {
  //console.log('initBroadcastChannel')
  ipcMain.on('send-broadcast', (event, message) => {
    //console.log('Received broadcast message:', message);
    mainWindow.webContents.send('receive-broadcast', message);
    if (aichatWindow) {
      aichatWindow.webContents.send('receive-broadcast', message);
    }
    if (settingWindow) {
      settingWindow.webContents.send('receive-broadcast', message);
    }
    if (fomulaRecognitionWindow) {
      fomulaRecognitionWindow.webContents.send('receive-broadcast', message);
    }
    if (aiGraphWindow) {
      aiGraphWindow.webContents.send('receive-broadcast', message);
    }
  });
}


export const openFomulaRecognitionDialog = async () => {
  if (fomulaRecognitionWindowOpened) {
    fomulaRecognition.focus();
    return;
  }
  fomulaRecognitionWindow = new BrowserWindow({
    width: 1280,
    height: 550,
    parent: mainWindow, // 将子窗口与主窗口关联
    modal: false, // 是否为模态窗口
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  fomulaRecognitionWindow.on('ready-to-show', () => {
    fomulaRecognitionWindow.show()
    fomulaRecognitionWindowOpened = true;
  })
  fomulaRecognitionWindow.on('close', () => {
    fomulaRecognitionWindowOpened = false;
    fomulaRecognitionWindow = null;
  }
  )


  fomulaRecognitionWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    //console.log(`${process.env['ELECTRON_RENDERER_URL']}/index.html#/ai-chat`);
    await fomulaRecognitionWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html#/fomula-recognition?windowType=fomula-recognition`)

  }
  else {

    //settingWindow.loadFile(path.join(__dirname, '../renderer/index.html/#/setting'))
    await fomulaRecognitionWindow.loadURL(`file://${path.join(__dirname, '../renderer/index.html')}#/fomula-recognition?windowType=fomula-recognition`);

  }
  fomulaRecognitionWindow.setTitle('手写公式识别助手')
}
export const openAiGraphDialog = async () => {
  if (aiGraphWindowOpened) {
    aiGraphWindow.focus();
    return;
  }
  aiGraphWindow = new BrowserWindow({
    width: 1280,
    height: 720,
        minWidth: 800,
    minHeight: 600,
    parent: mainWindow, // 将子窗口与主窗口关联
    modal: false, // 是否为模态窗口
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });
  aiGraphWindow.on('ready-to-show', () => {
    aiGraphWindow.show()
    aiGraphWindowOpened = true;
  }
  )
  aiGraphWindow.on('close', () => {
    aiGraphWindowOpened = false;
    aiGraphWindow = null;
  }
  )
  aiGraphWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  }
  )
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    //console.log(`${process.env['ELECTRON_RENDERER_URL']}/index.html#/ai-chat`);
    await aiGraphWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html#/ai-graph?windowType=ai-graph`)

  }
  else {
    //settingWindow.loadFile(path.join(__dirname, '../renderer/index.html/#/setting'))
    await aiGraphWindow.loadURL(`file://${path.join(__dirname, '../renderer/index.html')}#/ai-graph?windowType=ai-graph`);
  }
  aiGraphWindow.setTitle('智能绘图助手')
  // console.log(path.join(dirname, '../renderer/setting.html'));
  // settingWindow.loadURL(path.join(dirname, '../renderer/setting.html'))  
}
export const openAiChatDialog = async (payload = null) => {
  if (aiChatWindowOpened) {
    aichatWindow.focus();
    return;
  }
  aichatWindow = new BrowserWindow({
    width: 1280,
    height: 720,
        minWidth: 800,
    minHeight: 600,
    parent: mainWindow, // 将子窗口与主窗口关联
    modal: false, // 是否为模态窗口
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  aichatWindow.on('ready-to-show', () => {
    aichatWindow.show()
    aiChatWindowOpened = true;
  })
  aichatWindow.on('close', () => {
    aiChatWindowOpened = false;
    aichatWindow = null;
  }

  )


  aichatWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })



  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    //console.log(`${process.env['ELECTRON_RENDERER_URL']}/index.html#/ai-chat`);
    await aichatWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html#/ai-chat?windowType=ai-chat`)

  }
  else {

    //settingWindow.loadFile(path.join(__dirname, '../renderer/index.html/#/setting'))
    await aichatWindow.loadURL(`file://${path.join(__dirname, '../renderer/index.html')}#/ai-chat?windowType=ai-chat`);

  }
  aichatWindow.setTitle('与AI对话')
  // console.log(path.join(dirname, '../renderer/setting.html'));
  // settingWindow.loadURL(path.join(dirname, '../renderer/setting.html'))
}

export const openSettingDialog = async () => {
  if (settingWindowOpened) {
    settingWindow.focus();
    return
  }
  settingWindow = new BrowserWindow({
    width: 800,
    height: 600,
        minWidth: 800,
    minHeight: 600,
    parent: mainWindow, // 将子窗口与主窗口关联
    modal: false, // 是否为模态窗口
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  settingWindow.on('ready-to-show', () => {
    settingWindow.show()
    settingWindowOpened = true;
  })
  settingWindow.on('close', () => {
    settingWindowOpened = false;
    settingWindow = null;
  }
  )

  settingWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })



  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    //console.log(`${process.env['ELECTRON_RENDERER_URL']}/index.html#/setting`);
    await settingWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html#/setting?windowType=setting`)

  }
  else {

    //settingWindow.loadFile(path.join(__dirname, '../renderer/index.html/#/setting'))
    await settingWindow.loadURL(`file://${path.join(__dirname, '../renderer/index.html')}#/setting?windowType=setting`);

  }
  settingWindow.setTitle('设置面板')
  // console.log(path.join(dirname, '../renderer/setting.html'));
  // settingWindow.loadURL(path.join(dirname, '../renderer/setting.html'))
}