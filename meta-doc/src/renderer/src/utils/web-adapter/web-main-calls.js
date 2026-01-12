//所有主进程的事件处理函数


// import { app, shell, BrowserWindow, globalShortcut, nativeTheme } from 'electron'


//import { mainWindow, openSettingDialog, openAiChatDialog, imageUploadDir, settingWindow, aichatWindow, openFomulaRecognitionDialog,fomulaRecognitionWindow, openAiGraphDialog, aiGraphWindow } from './index'

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
const systemNotification = (title, body, path = '') => {
  eventBus.emit('show-success', title + ' ' + body)
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
  //模拟双向栈，最新打开的文档在最前面，如果超过50个，删除最后一个；最新的文档可能已经在最前面，需要删除后再插入
  recentDocs = recentDocs.filter((item) => item != data.path)
  recentDocs.unshift(data.path)
  if (recentDocs.length > 50) {
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
    updateRecentDocs({path})
    const fileName = typeof path === 'string' && path.length > 0
      ? path.split(/[\\/]/).pop() || path
      : 'Untitled'
    eventBus.emit('save-success', {
      path,
      fileName,
      format: data?.format,
      saveAs
    })
    //mainWindow.webContents.send('save-success', path)
  }
}

export const openDoc = async (path) => {
}


export function webMainCalls() {
  const emitter = rendererEmitter
  localIpcMain.on('quit', async (event, data)=>{
    //关闭网页
    quit();
  })
  localIpcMain.on('save', async (event, data) => {
    await save(data, false)
    is_need_save = false;
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
    router.push('/single-page/graph')
    //openAiGraphDialog();
  })
  localIpcMain.on('smart-drawing-assistant', () => {
    router.push('/single-page/graph')
  })
  localIpcMain.on('fomula-recognition', () => {
    router.push('/single-page/fomula-recognition')
    //openFomulaRecognitionDialog();
  })
  
  localIpcMain.on('data-analysis', () => {
    router.push('/single-page/data-analysis')
  })
  
  localIpcMain.on('ocr', () => {
    router.push('/single-page/ocr')
  })
  
  localIpcMain.on('attachment', () => {
    router.push('/single-page/attachment')
  })
  
  localIpcMain.on('graph', () => {
    router.push('/single-page/graph')
  })



  
  localIpcMain.on('open-link', (event, url) => {
    //console.log(url)
    shell.openExternal(url)
  })

  localIpcMain.on('system-notification', (event, data) => {
    //console.log(data)
    systemNotification(data.title, data.body, data.path);
  })
  // localIpcMain.on('request-sync-theme', () => {//渲染进程请求同步主题，主进程需要通知所有窗口
  //   eventBus.emit('sync-theme')
  // })
  localIpcMain.handle('get-setting', async (event, data) => {
    return await getSetting(data.key)
  })
  localIpcMain.handle('set-setting', async (event, data) => {
    return await setSetting(data.key, data.value)
  })
  localIpcMain.handle('workspace-save-document', async (event, payload) => {
    if (payload?.data) {
      await save(payload.data, payload.saveAs);
    }
    return null;
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

  // 获取系统主题（亮暗色）
  localIpcMain.handle('get-os-theme', async (event, data) => {
    // Web 环境下，检测系统主题
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
    return 'light'
  })
  
  // 获取系统主题信息（包括亮暗色和主题色）
  localIpcMain.handle('get-os-theme-info', async (event, data) => {
    // Web 环境下，检测系统主题
    const mode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
    // Web 环境下无法获取系统主题色，返回 undefined
    return { mode, accentColor: undefined }
  })
  
  // 获取系统字体列表（Web 环境下返回默认字体列表）
  localIpcMain.handle('get-system-fonts', async (event, data) => {
    // Web 环境下无法获取系统字体，返回默认字体列表
    return [
      { name: 'Arial', family: 'Arial' },
      { name: 'Times New Roman', family: 'Times New Roman' },
      { name: 'Courier New', family: 'Courier New' },
      { name: 'Calibri', family: 'Calibri' },
      { name: 'Verdana', family: 'Verdana' },
      { name: 'Georgia', family: 'Georgia' },
      { name: 'Helvetica', family: 'Helvetica' },
      { name: 'Tahoma', family: 'Tahoma' },
      { name: 'Trebuchet MS', family: 'Trebuchet MS' },
      { name: 'Comic Sans MS', family: 'Comic Sans MS' },
      { name: 'Microsoft YaHei', family: 'Microsoft YaHei' },
      { name: 'SimSun', family: 'SimSun' },
      { name: 'SimHei', family: 'SimHei' },
      { name: 'KaiTi', family: 'KaiTi' },
      { name: 'FangSong', family: 'FangSong' },
    ]
  })
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

  // 保存 JSON 文件（web 环境后备方案）
  localIpcMain.handle('save-json-file', async (event, jsonContent, suggestedName) => {
    try {
      // 在 web 环境中，使用浏览器的文件下载 API
      const blob = new Blob([jsonContent], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = suggestedName.endsWith('.json') ? suggestedName : `${suggestedName}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  });

  // 拼写检查相关处理器（web 环境后备方案）
  // 注意：在 web 环境下，这些操作会保存到 localStorage
  localIpcMain.handle('spell-check-add-word', async (event, word) => {
    try {
      // 在 web 环境下，将单词保存到 localStorage
      const key = 'spell-check-dictionary'
      const existing = localStorage.getItem(key)
      const words = existing ? JSON.parse(existing) : []
      const wordLower = word.toLowerCase().trim()
      if (wordLower && !words.includes(wordLower)) {
        words.push(wordLower)
        words.sort()
        localStorage.setItem(key, JSON.stringify(words))
      }
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  });

  localIpcMain.handle('spell-check-add-words', async (event, words) => {
    try {
      // 在 web 环境下，将单词保存到 localStorage
      const key = 'spell-check-dictionary'
      const existing = localStorage.getItem(key)
      const existingWords = existing ? JSON.parse(existing) : []
      const newWords = words.map(w => w.toLowerCase().trim()).filter(w => w && !existingWords.includes(w))
      if (newWords.length > 0) {
        const allWords = [...existingWords, ...newWords].sort()
        localStorage.setItem(key, JSON.stringify(allWords))
      }
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  });

}
