import { app, shell, BrowserWindow, ipcMain, globalShortcut  } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { mainCalls } from './main_calls'
const express = require('express');
const http = require('http');
const url = require('url');
const cors = require('cors');
const path = require('path');
let mainWindow;
export var dirname;
function createWindow() {
  dirname = __dirname;
  // Create the browser window.
  mainWindow = new BrowserWindow({
    //默认最大化展示
    width: 1600,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: true,
    }
  })
  

  mainWindow.on('ready-to-show', () => {
    bindShortcuts();//绑定快捷键
    mainWindow.show()
  })
 

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })


  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    console.log('loadURL1:', process.env['ELECTRON_RENDERER_URL'])
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    console.log('loadURL2:', join(__dirname, '../renderer/index.html'))
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  global.mainWindow = mainWindow;
}

const expressApp = express();
const projectRoot = path.resolve(path.resolve(__dirname, '../'),'../');  // 根据 out/main 路径上一级即为根目录
const dir=path.join(projectRoot, 'node_modules/vditor')
// 将 node_modules/vditor 作为静态资源暴露
expressApp.use(cors());
expressApp.use('/vditor', express.static(dir));
expressApp.get('/vditor/*', (req, res) => {
  console.log('Request for Vditor file:', req.path); // 输出请求的文件路径
});
const server = http.createServer(expressApp);

// 在本地运行 HTTP 服务器
server.listen(3000, () => {
  console.log('Local CDN server running at http://localhost:3000');
  console.log(dir)
});


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.

app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  mainCalls();//绑定主进程的事件处理函数
  




  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
let isShortcutPressed = false; // 锁变量，防止重复触发

function bindShortcuts() {
  // 监听窗口焦点
  mainWindow.on('focus', () => {
    // 注册快捷键
    globalShortcut.register('CommandOrControl+S', () => {
      if (!isShortcutPressed) {
        isShortcutPressed = true; // 设置锁
        mainWindow.webContents.send('save-triggered');
        setTimeout(() => (isShortcutPressed = false), 500); // 短时间后释放锁
      }
    });

    globalShortcut.register('CommandOrControl+Shift+S', () => {
      if (!isShortcutPressed) {
        isShortcutPressed = true; // 设置锁
        mainWindow.webContents.send('save-as-triggered');
        setTimeout(() => (isShortcutPressed = false), 500); // 短时间后释放锁
      }
    });
  });

  // 监听窗口失去焦点
  mainWindow.on('blur', () => {
    // 注销快捷键
    globalShortcut.unregister('CommandOrControl+S');
    globalShortcut.unregister('CommandOrControl+Shift+S');
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





export { mainWindow }

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
