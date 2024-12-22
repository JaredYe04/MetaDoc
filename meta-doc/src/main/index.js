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
const os = require('os');
const fs = require('fs');
const multer = require('multer');
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
      webSecurity: false,
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
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']+'/#/home')
  } else {
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

/////////////////////////////////////上传图片API/////////////////////////////////////
// 设置上传目录
// 获取系统图片目录路径
const uploadDir = path.join(os.homedir(), 'Pictures', 'meta-doc-imgs');

// 如果目录不存在，则创建
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true }); // 递归创建目录
}

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // 图片保存到系统图片目录下的 meta-doc-imgs 文件夹
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now(); // 时间戳命名
    cb(null, `${timestamp}_${file.originalname}`);
  },
});

const upload = multer({ storage });
// 配置静态文件服务
expressApp.use('/images', express.static(uploadDir));
// 创建上传接口
expressApp.post('/upload', upload.array('file[]'), (req, res) => {
  const errFiles = [];
  const succMap = {};

  // 处理上传的文件
  if (req.files && req.files.length > 0) {
    req.files.forEach((file) => {



      const filePath = path.join('images', file.filename); // 相对路径
      //返回绝对路径
      //const filePath = path.join(uploadDir, file.filename);
      succMap[file.filename] = filePath; // 文件路径映射
    });

    // 如果没有任何上传成功的文件，返回错误
    if (Object.keys(succMap).length === 0) {
      errFiles.push('没有上传任何文件');
    }
  } else {
    errFiles.push('上传失败');
  }

  // 返回 Vditor 需要的格式
  res.json({
    msg: '',
    code: 0,
    data: {
      errFiles: errFiles, // 失败的文件
      succMap: succMap, // 成功的文件路径映射
    },
  });
});


// expressApp.use('/images', express.static(path.join(__dirname, 'images')));

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
  electronApp.setAppUserModelId('com.jaredye.meta-doc')

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
