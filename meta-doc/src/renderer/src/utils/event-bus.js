
//事件总线

// 使用 Vue 实例作为事件总线

import mitt from 'mitt'
import {
  current_file_path,
  current_outline_tree,
  current_article,
  current_article_meta_data,
  dump2json,
  init,
  sync,
  current_ai_dialogs,
  load_from_json,
  load_from_md,
  dump2md,
  current_format,
  current_tex_article,
  load_from_tex
} from './common-data.js'
import { getSetting, updateRecentDocs } from './settings.js'
import { ConvertHtmlForPdf, image2base64, image2local, local2image, ConvertMarkdownToHtmlManually, ConvertMarkdownToHtmlVditor, filterMetaDataFromMd } from './md-utils.js'
import localIpcRenderer from './web-adapter/local-ipc-renderer.ts'


const eventBus = mitt()

export default eventBus


let ipcRenderer = null
if (window && window.electron) {
  ipcRenderer = window.electron.ipcRenderer

} else {
  webMainCalls();
  ipcRenderer = localIpcRenderer
  //todo 说明当前环境不是electron环境，需要另外适配
}


export const isElectronEnv = () => {//判断是否在electron环境中
  return navigator.userAgent.toLowerCase().includes('electron');
}

eventBus.on('sync-ai-dialogs', (dialogs) => {//ai-chat -> home，一般来说只有home窗口会监听这个事件
  //console.log('主界面收到了AI对话更新请求')
  current_ai_dialogs.value = dialogs
})

eventBus.on('request-ai-dialogs', (event) => {//home -> ai-chat，主窗口请求AICHAT组件获取对话数据
  //console.log('我是' + getWindowType() + '窗口，我向AICHAT组件发送对话数据')
  sendBroadcast('ai-chat', 'response-ai-dialogs', JSON.parse(JSON.stringify(current_ai_dialogs.value)))
})

eventBus.on('response-ai-dialogs', (dialogs) => {//主进程发送给AICHAT组件对话数据
  //console.log('我收到了对话数据', dialogs)
  current_ai_dialogs.value = dialogs
  //console.log(dialogs)
  eventBus.emit('ai-dialogs-loaded')
})

eventBus.on('shell-open', (filePath) => {
  ipcRenderer.send('shell-open', filePath)
})

ipcRenderer.on('os-theme-changed', (event) => {
  eventBus.emit('theme-changed')
  eventBus.emit('sync-theme')

})
ipcRenderer.on('close-triggered', () => {
  //询问是否保存，有保存，放弃三个按钮
  ElMessageBox.confirm(
    '是否要保存当前文档？',
    '提示',
    {
      confirmButtonText: '保存',
      cancelButtonText: '放弃',
      showCancelButton: true,
      distinguishCancelAndClose: true,
      type: 'info',
    }
  )
    .then(() => {
      eventBus.emit('is-need-save', false)
      eventBus.emit('save-and-quit')
    })
    .catch((action) => {
      // eventBus.emit('is-need-save',false)
      // eventBus.emit('quit')
      if (action === 'cancel') {
        eventBus.emit('is-need-save', false)
        eventBus.emit('quit')
      }
      else {
        eventBus.emit('is-need-save', true)
      }
    })
})

ipcRenderer.on('sync-theme', (event) => {
  eventBus.emit('sync-theme')//同步主题
})

//监听主进程的事件，转发给事件总线，从而可以在Vue组件中使用
ipcRenderer.on('update-current-path', (event, path) => {
  //console.log('update-current-path', path)
  current_file_path.value = path
})

ipcRenderer.on('save-success', (event, data) => {
  updateRecentDocs(data.path)

  eventBus.emit('save-success')
  if(data.saveAs){
    eventBus.emit('open-doc',data.path);//对于另存为的文件，需要重新打开
  }
})

ipcRenderer.on('save-file-path', (event, path) => {
  eventBus.emit('save-file-path', path)
  current_file_path.value = path
  //路径改变，需要重新保存
})
ipcRenderer.on('export-success', (event, data) => {
  //console.log(data)
  eventBus.emit('export-success', data)
})

ipcRenderer.on('save-triggered', () => {
  eventBus.emit('save')
})
ipcRenderer.on('save-as-triggered', () => {
  eventBus.emit('save-as')
})
ipcRenderer.on('search-replace-triggered', () => {

  eventBus.emit('search-replace')
})

ipcRenderer.on('open-doc-success', (event, payload) => {
  //console.log(payload)
  switch (payload.format) {
    case 'json':
      load_from_json(payload.content)
      eventBus.emit('refresh')//加载完之后进行刷新
      eventBus.emit('open-doc-success')
      break;
    case 'md':
      load_from_md(payload.content)
      eventBus.emit('refresh')//加载完之后进行刷新
      eventBus.emit('open-doc-success')
      break;
    case 'tex':
      load_from_tex(payload.content)
      eventBus.emit('refresh')//加载完之后进行刷新
      eventBus.emit('open-doc-success')
      break;
    default:
      eventBus.emit('show-error', '不支持的文件格式: ' + payload.format)
  }

})





const save = async (mode = 'save',args) => await ipcRenderer.send(mode,
  {
    json: dump2json(),
    md: dump2md(),
    path: current_file_path.value,
    html: await ConvertMarkdownToHtmlManually(current_article.value),
    tex: (current_format.value == "tex" ?
      current_tex_article.value :
      convertMarkdownToLatex(filterMetaDataFromMd(dump2md()), current_article_meta_data.value.title)),
    args
  });
//监听save事件
eventBus.on('save', async (msg,args) => {
  //console.log(window.electron)
  if (msg === 'auto-save') {
    if (current_file_path.value === '') {
      return//如果尝试自动保存时，没有文件路径，则不进行自动保存
    }
  }
  sync();
  await save('save',args);
  eventBus.emit('is-need-save', false)
})

eventBus.on('is-need-save', (msg) => {
  //console.log('is-need-save',msg)
  ipcRenderer.send('is-need-save', msg)
})

eventBus.on('save-and-quit', async () => {
  sync();
  eventBus.emit('is-need-save', false)
  await save('save');
  ipcRenderer.send('quit')
});

eventBus.on('open-doc', async (path) => {
  //await init()
  eventBus.emit('is-need-save', false)
  ipcRenderer.send('open-doc', path)
  updateRecentDocs(path)
})
eventBus.on('open-link', async (url) => {
  ipcRenderer.send('open-link', url)
})
eventBus.on('quit', () => {
  ipcRenderer.send('quit')
})

eventBus.on('save-as', async (args) => {
  sync();
  //eventBus.emit('nav-to', '/article');
  eventBus.emit('is-need-save', false)
  await save('save-as',args);
  //
})

eventBus.on('new-doc', async () => {
  await init()
})

eventBus.on('close-doc', async () => {
  await init()
})

eventBus.on('export', async (args) => {
  const { format, filename } = args;
  sync();
  //鼠标指针变为等待状态
  args = {};
  args.md = current_article.value;
  console.log(args.md)
  switch (current_format.value) {
    case "md":
      if (format === 'html' || format === 'docx' || format === 'pdf' || format === 'md') {
        args.md = await local2image(args.md)//将本地图片转换为服务器图片，以防止导出时图片丢失
      }

      if (format === 'html' || format === 'docx') {
        args.md = await image2base64(args.md)//将图片进一步从本地链接，转换为base64
      }

      if (format === 'docx') {
        args.html = await ConvertMarkdownToHtmlVditor(args.md)
      } else if (format === 'pdf') {
        args.html = await ConvertHtmlForPdf(args.md);
        //转换为pdf需要的html
      }
      else {
        args.html = await ConvertMarkdownToHtmlManually(args.md);
      }

      if (format === 'tex') {
        args.tex = convertMarkdownToLatex(args.md, current_article_meta_data.value.title)
      }
      args.json = dump2json(args.md)
      break;
    case "tex":
      args.tex = current_tex_article.value
      break;
  }
  args.format = format;
  ipcRenderer.send('export', args)
})
// eventBus.on('export-to-pdf', async (args) => {
//   //console.log('export-to-pdf', htmlContent)
//   const saveResult = await ipcRenderer.invoke('export-to-pdf', args)
//   if (saveResult !== '') {
//     eventBus.emit('export-success', saveResult)
//   }
// })
eventBus.on('setting', () => {
  ipcRenderer.send('setting')
})
eventBus.on('ai-chat', () => {
  ipcRenderer.send('ai-chat')
})
eventBus.on('ai-graph', () => {
  ipcRenderer.send('ai-graph')
})
eventBus.on('fomula-recognition', () => {
  ipcRenderer.send('fomula-recognition')
})

eventBus.on('system-notification', (data) => {
  //console.log(data)
  ipcRenderer.send('system-notification', data)

})

eventBus.on('theme-changed', () => {
  sendBroadcast('all', 'sync-theme', {});
})
eventBus.on('send-broadcast', (message) => {
  //console.log('发送广播消息:', message)
  ipcRenderer.send('send-broadcast', message)//公共的广播信道
  //示例：
  //   eventBus.emit('send-broadcast', {
  //   to: 'all', // 或者指定窗口类型，如 'home' 或 'ai-chat'
  //   eventName: 'xxx', // 事件名称
  //   data: { key: 'value' } // 传递的数据
  // });
})
export function sendBroadcast(to, eventName, data) {
  eventBus.emit('send-broadcast', { to, eventName, data });
}


ipcRenderer.on('receive-broadcast', (event, message) => {
  //console.log('接收到广播消息:', message)
  eventBus.emit('receive-broadcast', message)//接收到广播消息
})

eventBus.on('update-window-title', (title) => {
  ipcRenderer.send('update-window-title', title)
})



//处理广播逻辑
eventBus.on('receive-broadcast', (message) => {
  const windowType = getWindowType()
  if (message.to === 'all' || message.to === windowType) {
    //console.log('触发事件:', message.eventName, '数据:', message.data)
    eventBus.emit(message.eventName, message.data)//如果是给所有窗口的广播，或者是给当前窗口类型的广播，就触发对应的事件
  }
})




let cachedWindowType = 'home'

export function initWindowType(type) {
  //console.log('initWindowType', type)
  cachedWindowType = type
}
export function getWindowType() {
  return cachedWindowType
}
export function isMainWindow() {
  return cachedWindowType === 'home'
}

import { lightTheme, darkTheme, themeState } from './themes.js'

import { ElMessage } from 'element-plus'
import { ElMessageBox } from 'element-plus'
import { webMainCalls } from './web-adapter/web-main-calls.js'
import { convertMarkdownToLatex } from './latex-utils.js'
import { useI18n } from 'vue-i18n'


// window.electron.onMessageFromMain((event, message) => {
//     console.log('收到来自主进程的消息:', message);
//   });

// //监听所有事件，给所有事件添加日志
// eventBus.onAny((event, ...args) => {
//     console.log('event:', event, 'args:', args);
// });
