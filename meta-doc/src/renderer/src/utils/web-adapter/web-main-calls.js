//所有主进程的事件处理函数


// import { app, shell, BrowserWindow, globalShortcut, nativeTheme } from 'electron'


//import { mainWindow, openSettingDialog, openAiChatDialog, uploadDir, settingWindow, aichatWindow, openFomulaRecognitionDialog,fomulaRecognitionWindow, openAiGraphDialog, aiGraphWindow } from './index'

import eventBus from '../event-bus';
import {  useRouter } from 'vue-router'
import localIpcMain from './local-ipc-main';
import { calc_md5 } from '../md5';
import router from '../../router/router';
import { local } from 'd3';


// const Vditor = require("vditor");

// const getVditor = (elementId) => {
//   return new Vditor(elementId, {
//     height: 300,
//     mode: 'sv', // 默认 Markdown 模式
//     value: '# 标题\n这是一个初始化内容',
//   });
// };




const getImagePath = async () => {
  return './';
  //todo
}
const systemNotification = (title, body) => {
eventBus.emit('show-success',title+' '+body)
//   const notification = new Notification({
//     title: title,
//     body: body
//   });
//   // 显示通知
//   notification.show();
}


// import { Segment } from 'segment';
// var segment = new Segment();
// segment.useDefault();
const cut_words = async (text) => {
  //console.log(text);
  // return await segment.doSegment(text, {
  //   simple: true
  // });
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
    // if (fs.existsSync(filePath)) {
    //   result.push(filePath)
    // }
  }
  return result;
}



function getSetting(key) {
  //如果没有设置，则设置为默认值
  if (!localStorage.getItem(key)) {
    localStorage.setItem(key, '')
  }
  return localStorage.getItem(key)
}
function setSetting(key, value) {
  return localStorage.setItem(key, value)
}



const save = async (data, saveAs) => {
  //console.log(data);
  //console.log(data);
  let json = data.json
  let path = data.path
  //console.log(path);
  const obj = JSON.parse(json)
  if (path === '' || saveAs) {
    //console.log("文件路径为空");
    path = await chooseSaveFile(data)
    //console.log(obj.current_file_path);
  }
  json = JSON.stringify(obj)
  if (path) {
    //fs.writeFileSync(path, json)
    //console.log("保存成功");
    updateRecentDocs(path)
    eventBus.emit('save-success')
    //mainWindow.webContents.send('save-success', path)
  }
}

export const openDoc = async (path) => {
//   if (path) {//如果传入了路径，则直接打开，否则弹出对话框
//     //const json = fs.readFileSync(path, 'utf-8')
//     const json="{title:'todo'}"
//     load_from_json(data)
//     eventBus.emit('refresh')//加载完之后进行刷新
//     eventBus.emit('open-doc-success', data)
//     current_file_path.value = path
//     return;
//   }
//   const result = await dialog.showOpenDialog(mainWindow, {
//     title: '打开文件',
//     filters: [
//       { name: 'JSON Files', extensions: ['json'] },
//       { name: 'All Files', extensions: ['*'] }
//     ]
//   })
//   if (!result.canceled && result.filePaths.length > 0) {
//     const filePath = result.filePaths[0]
//     //console.log(filePath);
//     const json = fs.readFileSync(filePath, 'utf-8')
//     mainWindow.webContents.send('open-doc-success', json)
//     mainWindow.webContents.send('update-current-path', result.filePaths[0])

//   }
}
// const chooseSaveFile = async (data) => {
//   //console.log(win)
//   const dateyyyyMMddhhmmss = new Date()
//     .toISOString()
//     .replace(/:/g, '-')
//     .replace('T', '_')
//     .split('.')[0]
//   const title = JSON.parse(data.json).current_article_meta_data.title
//   const filename = title ? title : dateyyyyMMddhhmmss
//   const result = await dialog.showSaveDialog(mainWindow, {
//     title: '保存文件',
//     defaultPath: filename + '.json',
//     filters: [
//       { name: 'JSON Files', extensions: ['json'] },
//       // { name: 'All Files', extensions: ['*'] }
//     ]
//   })

//   //console.log(result); // 可以检查返回的 result 对象
//   if (!result.canceled && result.filePath) {
//     // 文件保存成功，发送文件路径给渲染进程
//     mainWindow.webContents.send('save-file-path', result.filePath)
//     //console.log(mainWindow.webContents);
//     return result.filePath
//   }
// }

// const exportFile = async (event, data) => {
//   data = { ...JSON.parse(data.json), html: data.html, format: data.format }
//   //console.log(win)
//   const dateyyyyMMddhhmmss = new Date()
//     .toISOString()
//     .replace(/:/g, '-')
//     .replace('T', '_')
//     .split('.')[0]
//   const title = data.current_article_meta_data.title
//   const filename = title ? title : dateyyyyMMddhhmmss
//   const format = data.format
//   let filter = {}
//   switch (format) {
//     case 'docx':
//       filter = { name: 'DOCX 文件', extensions: ['docx'] }
//       break
//     case 'md':
//       filter = { name: 'Markdown 文件', extensions: ['md'] }
//       break
//     case 'html':
//       filter = { name: 'HTML 文件', extensions: ['html'] }
//       break
//   }
//   const result = await dialog.showSaveDialog(mainWindow, {
//     title: '导出文档',
//     defaultPath: filename + '.' + format,
//     filters: [
//       filter
//     ]
//   })
//   //console.log(result); // 可以检查返回的 result 对象
//   if (!result.canceled && result.filePath) {
//     //后缀名
//     const ext = path.extname(result.filePath).toLowerCase()
//     switch (ext) {
//       // case '.pdf':
//       //   convertMarkdownTextToPDF(data.current_article, result.filePath)
//       //   break
//       case '.docx':
//         convertMarkdownToDocx(data.html, result.filePath)
//         break
//       case '.md':
//         directFileOutput(data.current_article, result.filePath)
//         break
//       case '.html':
//         convertMarkdownToHTML(data.current_article_meta_data.title, data.html, result.filePath)
//         break
//     }
//   }
// }

export function webMainCalls() {
  console.log('webMainCalls')
  localIpcMain.on('quit', async (event, data)=>{
    //关闭网页
    quit();
  })
  localIpcMain.on('save', async (event, data) => {
    await save(data, false)
    is_need_save = false;
  })
  localIpcMain.on('save-and-quit', async (event, data) => {
    await save(data, false)
    //is_need_save = false;
    quit()
  })
  localIpcMain.on('save-as', async (event, data) => {

    await save(data, true)
    //is_need_save = false;
  })
  localIpcMain.on('open-doc', async (event, path) => {
    await openDoc(path)
    //is_need_save = false;
  })
  localIpcMain.on('export', async (event, data) => {
    await exportFile(event, data)
  })


  localIpcMain.on('setting', () => {
    //console.log('setting')  
    router.push('/single-page/setting')
    //openSettingDialog();
    //
  })
  localIpcMain.on('ai-chat', () => {
    router.push('/single-page/ai-chat')
    //openAiChatDialog();
  })
  localIpcMain.on('ai-graph',() => {
    router.push('/single-page/ai-graph')
    //openAiGraphDialog();
  })
  localIpcMain.on('fomula-recognition', () => {
    router.push('/single-page/fomula-recognition')
    //openFomulaRecognitionDialog();
  })



  
  localIpcMain.on('open-link', (event, url) => {
    //console.log(url)
    shell.openExternal(url)
  })

  localIpcMain.on('system-notification', (event, data) => {
    //console.log(data)
    systemNotification(data.title, data.body);
  })
  localIpcMain.on('request-sync-theme', () => {//渲染进程请求同步主题，主进程需要通知所有窗口
    eventBus.emit('sync-theme')
  })
  localIpcMain.handle('get-setting', async (event, data) => {
    return await getSetting(data.key)
  })
  localIpcMain.handle('set-setting', async (event, data) => {
    return await setSetting(data.key, data.value)
  })
  localIpcMain.handle('update-recent-docs', async (event, data) => {
    return await updateRecentDocs(data)
  })
  localIpcMain.handle('get-recent-docs', async (event, data) => {
    return await getRecentDocs()
  })
  localIpcMain.handle('cut-words', async (event, data) => {
    return await cut_words(data.text)
  })
  localIpcMain.handle('get-image-path', async (event, data) => {
    return await getImagePath()
  })

//   localIpcMain.handle('get-os-theme', async (event, data) => {
//     return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
//   })
  localIpcMain.handle('simpletex-ocr', async (event, { fileName, fileType, fileBuffer, reqData, header }) => {
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

  localIpcMain.handle('compute-md5', async (event, data) => {
    return calc_md5(data)
  });
  localIpcMain.on('sync-ai-dialogs', async (event, data) => {
    eventBus.emit('sync-ai-dialogs', data)//通知渲染进程，AI对话数据已经更新
    is_need_save = true;
  })
  localIpcMain.on('fetch-ai-dialogs', async (event, data) => {
    eventBus.emit('request-ai-dialogs', data)//通知渲染进程，AI对话数据已经更新
  })
  localIpcMain.on('response-ai-dialogs', async (event, data) => {
    
    eventBus.emit('response-ai-dialogs', data)//通知渲染进程，AI对话数据已经更新
  })

//   nativeTheme.on('updated', () => {
//       eventBus.emit('theme-changed')
//         eventBus.emit('sync-theme')
    
//     //如果系统主题发生变化，需要通知渲染进程
//   });

  // localIpcMain.handle('get-vditor', async (event, data) => {
  //   return await getVditor(data)
  // })
}
