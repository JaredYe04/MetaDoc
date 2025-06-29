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


import { mainWindow, openSettingDialog, openAiChatDialog, uploadDir, settingWindow, aichatWindow, openFomulaRecognitionDialog, fomulaRecognitionWindow, openAiGraphDialog, aiGraphWindow, initBroadcastChannel } from './index'
import { dirname } from './index'

//import eventBus from '../renderer/src/utils/event-bus'


export function mainCalls() {
  ipcMain.on('quit', quit)
  ipcMain.on('save', async (event, data) => {
    await save(data, false)
    is_need_save = false;
  })
  ipcMain.on('save-and-quit', async (event, data) => {
    await save(data, false)
    //is_need_save = false;
    quit()
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

  ipcMain.on('system-notification', (event, data) => {
    systemNotification(data.title, data.body);
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

  //////////////AI任务调度
  ipcMain.on('register-ai-task', (event, taskInfo) => {
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
  return uploadDir;
}
const systemNotification = (title, body) => {
  const notification = new Notification({
    title: title,
    body: body
  });
  // 显示通知
  notification.show();
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
    //console.log("文件路径为空");
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
    default:
      //eventBus.emit('show-error', '不支持的文件格式: ' + format)
      return;
  }
  if (path) {
    fs.writeFileSync(path, content)
    //console.log("保存成功");
    mainWindow.webContents.send('save-success', path)
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
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存文件',
    defaultPath: filename,
    filters: [
      { name: 'Markdown Files', extensions: ['md'] },
      { name: 'JSON Files', extensions: ['json'] },
      // { name: 'All Files', extensions: ['*'] }
    ]
  })

  //console.log(result); // 可以检查返回的 result 对象
  if (!result.canceled && result.filePath) {
    // 文件保存成功，发送文件路径给渲染进程
    mainWindow.webContents.send('save-file-path', result.filePath)
    //console.log(mainWindow.webContents);
    return result.filePath
  }
}

const exportFile = async (event, data) => {
  data = { ...JSON.parse(data.json), html: data.html, format: data.format }
  //console.log(win)
  const dateyyyyMMddhhmmss = new Date()
    .toISOString()
    .replace(/:/g, '-')
    .replace('T', '_')
    .split('.')[0]
  const title = data.current_article_meta_data.title
  const filename = title ? title : dateyyyyMMddhhmmss
  const format = data.format
  let filter = {}
  switch (format) {
    case 'docx':
      filter = { name: 'DOCX 文件', extensions: ['docx'] }
      break
    case 'md':
      filter = { name: 'Markdown 文件', extensions: ['md'] }
      break
    case 'html':
      filter = { name: 'HTML 文件', extensions: ['html'] }
      break
  }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出文档',
    defaultPath: filename + '.' + format,
    filters: [
      filter
    ]
  })
  //console.log(result); // 可以检查返回的 result 对象
  if (!result.canceled && result.filePath) {
    //后缀名
    const ext = path.extname(result.filePath).toLowerCase()
    switch (ext) {
      // case '.pdf':
      //   convertMarkdownTextToPDF(data.current_article, result.filePath)
      //   break
      case '.docx':
        convertMarkdownToDocx(data.html, result.filePath)
        break
      case '.md':
        directFileOutput(data.current_article, result.filePath)
        break
      case '.html':
        convertMarkdownToHTML(data.current_article_meta_data.title, data.html, result.filePath)
        break
    }
  }
}


const { mdToPdf } = require("md-to-pdf");
async function convertMarkdownTextToPDF(markdownText, outputPath) {
  // 直接传入 Markdown 文本
  const result = await mdToPdf({ content: markdownText });

  // 将生成的 PDF 写入文件
  fs.writeFileSync(outputPath, result.content);
  mainWindow.webContents.send('export-success', outputPath)
}





async function convertMarkdownToHTML(title, htmlContent, path) {
  try {
    // 使用 marked 将 Markdown 转换为 HTML
    htmlContent = `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>${title}</title></head><body>${htmlContent}</body></html>`;
    directFileOutput(htmlContent, path)
  } catch (error) {
    //eventBus.emit('show-error', '转换Markdown到HTML失败' + error)
    console.error('Error while converting markdown to HTML:', error);
  }
}
async function convertMarkdownToDocx(htmlContent, outputPath) {
  try {
    // 将 Markdown 转换为 HTML
    //let htmlContent = marked(markdownText);
    //console.log(markdownText);
    // let htmlContent=await md2html(markdownText);
    // 插入 UTF-8 编码声明，确保中文正确显示
    htmlContent = `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>Document</title></head><body>${htmlContent}</body></html>`;
    //console.log(htmlContent);
    // 使用 html-docx-js 将 HTML 转换为 DOCX，得到一个 Blob 对象
    const docxBlob = htmlDocx.asBlob(htmlContent);


    // 将 Blob 转换为 ArrayBuffer
    const arrayBuffer = await docxBlob.arrayBuffer();

    // 将 ArrayBuffer 转换为 Node.js Buffer
    const docxBuffer = Buffer.from(arrayBuffer);

    // 确保输出路径的文件夹存在
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 将生成的 DOCX 内容写入文件
    fs.writeFileSync(outputPath, docxBuffer);
    mainWindow.webContents.send('export-success', outputPath)
    //console.log(`DOCX file successfully created at ${outputPath}`);
  } catch (error) {
    //eventBus.emit('show-error', '转换Markdown到DOCX失败' + error)
    console.error('Error while converting markdown to DOCX:', error);
  }
}

function directFileOutput(content, outputPath) {
  fs.writeFileSync(outputPath, content);
  mainWindow.webContents.send('export-success', outputPath)
}
