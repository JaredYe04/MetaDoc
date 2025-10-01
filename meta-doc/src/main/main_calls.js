//所有主进程的事件处理函数

const { dialog, Notification } = require('electron')
import { app, shell, BrowserWindow, ipcMain, globalShortcut, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

const path = require('path')
const fs = require('fs')

const { marked } = require('marked');
const mammoth = require('mammoth');
const markdownIt = require("markdown-it");
const htmlDocx = require('html-docx-js');
const os = require('os');


import { mainWindow, openSettingDialog, openAiChatDialog, settingWindow, aichatWindow, openFomulaRecognitionDialog, fomulaRecognitionWindow, openAiGraphDialog, aiGraphWindow, initBroadcastChannel } from './index'
import { dirname } from './index'
import { imageUploadDir } from './express_server'
import { queryKnowledgeBase } from './utils/rag_utils'

//import eventBus from '../renderer/src/utils/event-bus'


export function mainCalls() {
  ipcMain.on('quit', quit)
  ipcMain.on('save', async (event, data) => {
    await save(data, false)
    is_need_save = false;
  })
  ipcMain.on('save-as', async (event, data) => {

    await save(data, true)
    //is_need_save = false;
  })
  ipcMain.on('open-doc', async (event, path) => {
    await openDoc(path)
    //is_need_save = false;
  })
  ipcMain.on('export', async (event, data) => {
    await exportFile(event, data)
  })

  ipcMain.on('setting', () => {
    openSettingDialog();
  })
  ipcMain.on('ai-chat', () => {
    openAiChatDialog();
  })
  ipcMain.on('ai-graph', () => {
    openAiGraphDialog();
  })
  ipcMain.on('fomula-recognition', () => {
    openFomulaRecognitionDialog();
  })

  ipcMain.on('open-link', (event, url) => {
    shell.openExternal(url)
  })
  ipcMain.on('shell-open', async (event, filePath) => {
    //console.log('打开文件:', filePath);
    await shell.openPath(filePath).catch((errMsg) => {
      console.error('打开文件失败:', errMsg);
    });
  })
  ipcMain.on('system-notification', (event, data) => {
    systemNotification(data.title, data.body,data.path);
  })
  ipcMain.on('update-window-title', (event, title) => {
    updateWindowTitle(title)
  })
  ipcMain.handle('get-setting', async (event, data) => {
    return await getSetting(data.key)
  })
  ipcMain.handle('set-setting', async (event, data) => {
    return await setSetting(data.key, data.value)
  })
  ipcMain.handle('update-recent-docs', async (event, data) => {
    return await updateRecentDocs(data)
  })
  ipcMain.handle('get-recent-docs', async (event, data) => {
    return await getRecentDocs()
  })
  ipcMain.handle('cut-words', async (event, data) => {
    return await cut_words(data.text)
  })
  ipcMain.handle('get-image-path', async (event, data) => {
    return await getImagePath()
  })

  ipcMain.handle('get-os-theme', async (event, data) => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })
  ipcMain.handle('simpletex-ocr', async (event, { fileName, fileType, fileBuffer, reqData, header }) => {
    // 重新构造 FormData
    // 重新构造 Buffer
    const buffer = Buffer.from(fileBuffer);

    // 创建 Blob 对象（适用于 FormData）
    const blob = new Blob([buffer], { type: fileType });

    const formData = new FormData();
    formData.append("file", blob, fileName); // 这里用 Blob

    // 将 reqData 里的参数也加进去
    for (const key in reqData) {
      formData.append(key, reqData[key]);
    }

    return await fetch("https://server.simpletex.cn/api/simpletex_ocr", {
      method: "POST",
      headers: header,
      body: formData
    })
      .then(res => res.json())
      .then(json => {
        return json;
      })
      .catch(err => {
        console.error(err);
        return 'error:' + err;
      });
  });
  const crypto = require('crypto');
  ipcMain.handle('compute-md5', async (event, data) => {
    return crypto.createHash('md5').update(data).digest('hex');
  });
  //////////////RAG请求查询
  ipcMain.handle('query-knowledge-base', async (event, { question, scoreThreshold }) => {
    return await queryKnowledgeBase(question, scoreThreshold);
  });

  //////////////AI任务调度
  ipcMain.on('register-ai-task', (event, taskInfo) => {
    //console.log("注册任务到主窗口",taskInfo)
    const mainWindow = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('#/home'))
    if (mainWindow) {
      mainWindow.webContents.send('register-ai-task', taskInfo)
    }
  })

  ipcMain.on('ai-task-done', (event, handle) => {
    const mainWindow = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('#/home'))
    if (mainWindow) {
      mainWindow.webContents.send('ai-task-done', handle)
    }
  })

  ipcMain.on('broadcast-cancel-ai-task', (event, handle) => {
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('cancel-task', handle)
    })
  })

  ipcMain.on('start-task', (event, handle) => {
    // 启动命令 → 所有窗口广播（每个窗口自己判断是否执行）
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('start-task', handle)
    })
  })
  //////////////AI任务调度


  nativeTheme.on('updated', () => {
    mainWindow.webContents.send('os-theme-changed')
    //如果系统主题发生变化，需要通知渲染进程
  });
  initBroadcastChannel() //重新初始化广播频道
  // ipcMain.handle('get-vditor', async (event, data) => {
  //   return await getVditor(data)
  // })
}

var Segment = require('segment');
var segment = new Segment();
segment.useDefault();

const getImagePath = async () => {
  return imageUploadDir;
}
const systemNotification = (title, body, path = '') => {
  //
  const notification = new Notification({
    title: title,
    body: body
  });
  notification.on('click', () => {
    if (path) {
      shell.openPath(path).then(() => {
        console.log(`已尝试打开: ${path}`)
      }).catch(err => {
        console.error(`打开文件失败: ${err}`)
      })
    }
  })

  // 显示通知
  notification.show();
}
const updateWindowTitle = (title) => {
  //console.log('updateWindowTitle', title)
  if (mainWindow) {
    if (title.length > 30) {
      title = title.substring(0, 30) + '...';
    }
    if (title.length === 0) {
      mainWindow.setTitle("MetaDoc");
    }
    else {
      mainWindow.setTitle(title + " - MetaDoc");
    }

  }
}

const cut_words = async (text) => {
  //console.log(text);
  return await segment.doSegment(text, {
    simple: true
  });
}
const updateRecentDocs = async (data) => {
  const json = store.get('recent-docs')
  //如果没有recent-docs，初始化一个空数组
  let recentDocs = json ? JSON.parse(json) : []
  //模拟双向栈，最新打开的文档在最前面，如果超过5个，删除最后一个；最新的文档可能已经在最前面，需要删除后再插入
  recentDocs = recentDocs.filter((item) => item != data.path)
  recentDocs.unshift(data.path)
  if (recentDocs.length > 5) {
    recentDocs.pop()
  }

  store.set('recent-docs', JSON.stringify(recentDocs))
}

const getRecentDocs = async () => {
  const json = store.get('recent-docs')
  //要判断原有的文件路径是否存在，如果不存在，需要删除
  let recentDocs = json ? JSON.parse(json) : []
  let result = []
  for (let i = 0; i < recentDocs.length; i++) {
    const filePath = recentDocs[i]
    if (fs.existsSync(filePath)) {
      result.push(filePath)
    }
  }
  return result;
}


const Store = require('electron-store');
const store = new Store();


function getSetting(key) {
  return store.get(key)
}
function setSetting(key, value) {
  return store.set(key, value)
}



const quit = () => {
  app.quit()
}

const save = async (data, saveAs) => {
  //console.log(data);
  //console.log(data);

  let path = data.path
  //console.log(path);

  let content = '';


  if (path === '' || saveAs) {
    path = await chooseSaveFile(data)
  }

  const format = path.split('.').pop().toLowerCase()
  switch (format) {
    case 'md':
      content = data.md
      break;
    case 'json':
      content = data.json
      break;
    case 'tex':
      content = data.tex
      break;
    default:
      //eventBus.emit('show-error', '不支持的文件格式: ' + format)
      return;
  }
  if (path) {
    fs.writeFileSync(path, content)
    //console.log("保存成功");
    mainWindow.webContents.send('save-success', {
      path,
      saveAs,
      format:format
    })
  }
}

export const openDoc = async (path) => {

  if (path) {//如果传入了路径，则直接打开，否则弹出对话框
    const content = fs.readFileSync(path, 'utf-8')
    const format = path.split('.').pop().toLowerCase()
    const payload = {
      content: content,
      format: format,
    }
    mainWindow.webContents.send('open-doc-success', payload)
    mainWindow.webContents.send('update-current-path', path)
    return;
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: '打开文件',
    filters: [
      { name: 'Markdown Files', extensions: ['md'] },
      { name: 'LaTeX Files', extensions: ['tex'] },
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0]
    //console.log(filePath);
    const content = fs.readFileSync(filePath, 'utf-8')
    const format = filePath.split('.').pop().toLowerCase()
    const payload = {
      content: content,
      format: format,
    }
    mainWindow.webContents.send('open-doc-success', payload)
    mainWindow.webContents.send('update-current-path', result.filePaths[0])

  }
}
const chooseSaveFile = async (data) => {
  //console.log(win)
  const dateyyyyMMddhhmmss = new Date()
    .toISOString()
    .replace(/:/g, '-')
    .replace('T', '_')
    .split('.')[0]
  const title = JSON.parse(data.json).current_article_meta_data.title
  const filename = title ? title : dateyyyyMMddhhmmss

  let result="";
  const args=data.args;
  
  if(args &&args.format!=""){
    // 根据指定的格式设置 filters
    let filters = [];
    switch (args.format.toLowerCase()) {
        case 'md':
        case 'markdown':
            filters = [{ name: 'Markdown Files', extensions: ['md'] }];
            break;
        case 'tex':
        case 'latex':
            filters = [{ name: 'LaTeX Files', extensions: ['tex'] }];
            break;
        case 'json':
            filters = [{ name: 'JSON Files', extensions: ['json'] }];
            break;
        default:
            filters = [{ name: 'All Files', extensions: ['*'] }];
    }

    result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save File',
        defaultPath: filename,
        filters
    });
  }else{
    result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save File',
      defaultPath: filename,
      filters: [
        { name: 'Markdown Files', extensions: ['md'] },
        { name: 'LaTeX Files', extensions: ['tex'] },
        { name: 'JSON Files', extensions: ['json'] },
        // { name: 'All Files', extensions: ['*'] }
      ]
    })
  }
  //console.log(result); // 可以检查返回的 result 对象
  if (!result.canceled && result.filePath) {
    // 文件保存成功，发送文件路径给渲染进程
    mainWindow.webContents.send('save-file-path', result.filePath)
    //console.log(mainWindow.webContents);
    return result.filePath
  }
}
const exportFile = async (event, data) => {
  data = { ...JSON.parse(data.json), html: data.html, format: data.format, tex: data.tex };

  const dateyyyyMMddhhmmss = new Date()
    .toISOString()
    .replace(/:/g, '-')
    .replace('T', '_')
    .split('.')[0];
  const title = data.current_article_meta_data.title;
  const filename = title ? title : dateyyyyMMddhhmmss;
  const format = data.format;

  let filter = {};
  switch (format) {
    case 'docx':
      filter = { name: 'DOCX File', extensions: ['docx'] };
      break;
    case 'md':
      filter = { name: 'Markdown File', extensions: ['md'] };
      break;
    case 'html':
      filter = { name: 'HTML File', extensions: ['html'] };
      break;
    case 'tex':
      filter = { name: 'LaTeX File', extensions: ['tex'] };
      break;
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出文档',
    defaultPath: filename + '.' + format,
    filters: [filter],
  });

  if (!result.canceled && result.filePath) {
    const ext = path.extname(result.filePath).toLowerCase();
    let buffer = null;

    try {
      switch (ext) {
        case '.pdf':
          buffer = await convertHtmlToPdfBuffer(data.html);
          break;
        case '.docx':
          buffer = await convertMarkdownToDocxBuffer(data.html);
          break;
        case '.md':
          buffer = Buffer.from(data.current_article, 'utf-8');
          break;
        case '.html':
          buffer = Buffer.from(
            wrapHtmlWithTemplate(data.current_article_meta_data.title, data.html),
            'utf-8'
          );
          break;
        case '.tex':
          const latex = data.tex;
          //console.log('导出 LaTeX:', latex);
          buffer = Buffer.from(latex, 'utf-8');
          break;
      }

      if (buffer) {
        await fs.promises.writeFile(result.filePath, buffer);
        mainWindow.webContents.send('export-success', result.filePath);
      }
    } catch (error) {
      console.error('导出失败:', error);
    }
  }
};


const convertHtmlToPdfBuffer = async (html) => {
  const waitForRenderComplete = async (
    win,
    timeout = 10000,
    interval = 500
  ) => {
    const maxTries = Math.ceil(timeout / interval);
    let lastHTML = '';
    let stableCount = 0;
    const requiredStableCount = 2;
    for (let i = 0; i < maxTries; i++) {
      try {
        const currentHTML = await win.webContents.executeJavaScript(
          'document.documentElement.innerHTML',
          true
        );

        if (currentHTML === lastHTML) {
          stableCount++;
          if (stableCount >= requiredStableCount) {
            return;
          }
        } else {
          stableCount = 0;
          lastHTML = currentHTML;
        }
      } catch (err) {
        // 忽略错误
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error('渲染超时：页面内容持续变动，未能稳定');
  };

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: false,
    }
  });

  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await waitForRenderComplete(win);
    const pdfBuffer = await win.webContents.printToPDF({});
    return pdfBuffer;
  } finally {
    win.close();
  }
};
async function convertMarkdownToDocxBuffer(htmlContent) {
  const htmlWrapped = `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>Document</title></head><body>${htmlContent}</body></html>`;
  const docxBlob = htmlDocx.asBlob(htmlWrapped);
  const arrayBuffer = await docxBlob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
function wrapHtmlWithTemplate(title, bodyContent) {
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>${title}</title></head><body>${bodyContent}</body></html>`;
}
