import { app, shell, BrowserWindow, ipcMain, globalShortcut, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { mainCalls, openDoc } from './main_calls'
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
    bindShortcuts();//绑定快捷键
    mainWindow.show()

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
  console.log(args)
  if (args.length > 1) {
    //弹窗
    filePath = args.find(arg => {
      const ext = path.extname(arg).toLowerCase();
      return supportedExtensions.includes(ext);
    });
    console.log('filePath:', filePath);
  }
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/#/home' + (filePath ? `?file=${encodeURIComponent(filePath)}` : ''))
  } else {
    // 生产环境：用 file:// 协议 + loadURL + query
    const indexPath = path.join(__dirname, '../renderer/index.html');
    const fileURL = url.pathToFileURL(indexPath).toString(); // 转为 file:// 协议

    mainWindow.loadURL(
      `${fileURL}#/home${filePath ? `?file=${encodeURIComponent(filePath)}` : ''}`
    );
    // mainWindow.loadFile(join(__dirname, '../renderer/index.html'+ (filePath ? `?file=${encodeURIComponent(filePath)}` : '')))
  }
  global.mainWindow = mainWindow;
}

const expressApp = express();
const projectRoot = path.resolve(path.resolve(__dirname, '../'), '../');  // 根据 out/main 路径上一级即为根目录
const dir = path.join(projectRoot, 'node_modules/vditor')
// 将 node_modules/vditor 作为静态资源暴露
expressApp.use(cors());
expressApp.use('/vditor', express.static(dir));
expressApp.get('/vditor/*', (req, res) => {
  console.log('Request for Vditor file:', req.path); // 输出请求的文件路径
});

/////////////////////////////////////上传图片API/////////////////////////////////////
// 设置上传目录
// 获取系统图片目录路径
export const uploadDir = path.join(os.homedir(), 'Pictures', 'meta-doc-imgs');

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
  //console.log(req)
  const errFiles = [];
  const succMap = {};

  // 处理上传的文件
  if (req.files && req.files.length > 0) {
    req.files.forEach((file) => {



      //const filePath = path.join('images', file.filename); // 相对路径

      //返回绝对路径
      const filePath = path.join(uploadDir, file.filename);
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

// 为了防止站外图片失效，linkToImgUrl 可将剪贴板中的站外图片地址传到服务器端进行保存处理，其数据结构如下：
// // POST data
// xhr.send(JSON.stringify({url: src})); // src 为站外图片地址
// // return data
// {
//  msg: '',
//  code: 0,
//  data : {
//    originalURL: '',
//    url: ''
//  }
// }
const bodyParser = require('body-parser');
expressApp.use(bodyParser.json()); // 解析 JSON 格式的请求体
expressApp.use(bodyParser.urlencoded({ extended: true })); // 解析 URL 编码的请求体
expressApp.post('/url-upload', (req, res) => {
  //   // POST data
  // xhr.send(JSON.stringify({url: src})); // src 为站外图片地址
  //req中没有body，需要使用body-parser中间件来解析请求体
  //console.log(req)

  const { url } = req.body; // 从请求体中获取 URL
  if (!url) {
    return res.status(400).json({ error: 'No URL provided' });
  }
  //下载到本地，与/upload接口一致，然后返回本地的图片链接
  const fileName = `${Date.now()}_${path.basename(url)}`; // 使用时间戳和原始文件名
  const filePath = path.join(uploadDir, fileName); // 保存路径
  const fileStream = fs.createWriteStream(filePath);
  const https = require('https');
  const http = require('http');
  const protocol = url.startsWith('https') ? https : http;
  protocol.get(url, (response) => {
    if (response.statusCode === 200) {
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(() => {
          // 返回成功的图片链接，此处为文件的绝对路径
          res.json({
            msg: '',
            code: 0,
            data: {
              originalURL: url,
              url: `${filePath}`, // 返回本地文件的绝对路径
            },
          });
        });
      });
    } else {
      res.status(500).json({ error: 'Failed to download image' });
    }
  }).on('error', (err) => {
    console.error('Error downloading image:', err);
    res.status(500).json({ error: 'Failed to download image' });
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
    await fomulaRecognitionWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html#/fomula-recognition`)

  }
  else {

    //settingWindow.loadFile(path.join(__dirname, '../renderer/index.html/#/setting'))
    await fomulaRecognitionWindow.loadURL(`file://${path.join(__dirname, '../renderer/index.html')}#/fomula-recognition`);

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
    await aiGraphWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html#/ai-graph`)

  }
  else {
    //settingWindow.loadFile(path.join(__dirname, '../renderer/index.html/#/setting'))
    await aiGraphWindow.loadURL(`file://${path.join(__dirname, '../renderer/index.html')}#/ai-graph`);
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
    await aichatWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html#/ai-chat`)

  }
  else {

    //settingWindow.loadFile(path.join(__dirname, '../renderer/index.html/#/setting'))
    await aichatWindow.loadURL(`file://${path.join(__dirname, '../renderer/index.html')}#/ai-chat`);

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
    await settingWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html#/setting`)

  }
  else {

    //settingWindow.loadFile(path.join(__dirname, '../renderer/index.html/#/setting'))
    await settingWindow.loadURL(`file://${path.join(__dirname, '../renderer/index.html')}#/setting`);

  }
  settingWindow.setTitle('设置面板')
  // console.log(path.join(dirname, '../renderer/setting.html'));
  // settingWindow.loadURL(path.join(dirname, '../renderer/setting.html'))
}