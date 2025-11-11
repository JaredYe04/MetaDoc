
//事件总线

// 使用 Vue 实例作为事件总线

import mitt from 'mitt'
import { getSetting, updateRecentDocs } from './settings.js'
import { ConvertHtmlForPdf, image2base64, image2local, local2image, ConvertMarkdownToHtmlManually, ConvertMarkdownToHtmlVditor, filterMetaDataFromMd } from './md-utils.js'
import localIpcRenderer from './web-adapter/local-ipc-renderer.ts'
import { useWorkspace } from '../stores/workspace'
import { serializeDocument } from '../services/document-serializer'
import { convertLatexToMarkdown } from './latex-utils'


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


const logger = createRendererLogger('EventBus', {
  windowTypeProvider: () => getWindowType()
});

const workspace = useWorkspace();
const { activeTabId, ensureDocument, markDocumentSaved, updateDocumentDirty } = workspace;

const cloneDeep = (value) => JSON.parse(JSON.stringify(value));

const getDocument = (tabId) => {
  const targetId = typeof tabId === 'string' ? tabId : activeTabId.value;
  if (!targetId) return null;
  try {
    return ensureDocument(targetId);
  } catch (error) {
    logger.warn('获取文档失败', error);
    return null;
  }
};

const buildSavePayload = async (doc) => {
  const serialized = serializeDocument(doc);
  const markdownSource =
    doc.format === 'tex' ? convertLatexToMarkdown(doc.tex ?? '') : doc.markdown ?? '';
  const html = await ConvertMarkdownToHtmlManually(markdownSource);
  return {
    json: serialized.json,
    md: serialized.md,
    path: doc.path,
    html,
    tex: serialized.tex,
  };
};


export const isElectronEnv = () => {//判断是否在electron环境中
  return navigator.userAgent.toLowerCase().includes('electron');
}

eventBus.on('sync-ai-dialogs', (dialogs) => {//ai-chat -> home，一般来说只有home窗口会监听这个事件
  const doc = getDocument()
  if (!doc) return
  doc.aiDialogs = cloneDeep(dialogs)
  updateDocumentDirty(doc.tabId)
})

eventBus.on('request-ai-dialogs', () => {//home -> ai-chat，主窗口请求AICHAT组件获取对话数据
  const doc = getDocument()
  if (!doc) return
  sendBroadcast('ai-chat', 'response-ai-dialogs', cloneDeep(doc.aiDialogs))
})

eventBus.on('response-ai-dialogs', (dialogs) => {//主进程发送给AICHAT组件对话数据
  const doc = getDocument()
  if (!doc) return
  doc.aiDialogs = cloneDeep(dialogs)
  updateDocumentDirty(doc.tabId)
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
    i18n.global.t('leftMenu.askSave'),
    i18n.global.t('leftMenu.tip'),
    {
      confirmButtonText: i18n.global.t('leftMenu.save'),
      cancelButtonText: i18n.global.t('leftMenu.discard'),
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
ipcRenderer.on('update-current-path', (_event, path) => {
  const doc = getDocument()
  if (!doc) return
  doc.path = path || ''
  markDocumentSaved(doc.tabId, doc.path)
})

ipcRenderer.on('save-success', (_event, data = {}) => {
  const doc = getDocument()
  if (doc) {
    markDocumentSaved(doc.tabId, data.path ?? doc.path)
  }

  if (data.path) {
    updateRecentDocs(data.path)
  }

  eventBus.emit('save-success')
  if (data.saveAs && data.path) {
    eventBus.emit('open-doc', data.path)//对于另存为的文件，需要重新打开
  }
})

ipcRenderer.on('save-file-path', (_event, path) => {
  eventBus.emit('save-file-path', path)
  const doc = getDocument()
  if (!doc) return
  doc.path = path || ''
  markDocumentSaved(doc.tabId, doc.path)
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
  eventBus.emit('workspace-open-document', payload)
})





const normalizeSavePayload = (payload) => {
  if (typeof payload === 'string') {
    return { mode: payload, args: undefined }
  }

  if (payload && typeof payload === 'object') {
    if ('mode' in payload || 'args' in payload) {
      const { mode = 'manual', args } = payload
      return { mode, args }
    }
    return { mode: 'manual', args: payload }
  }

  return { mode: 'manual', args: undefined }
}

const save = async (mode = 'save', args, targetTabId) => {
  const doc = getDocument(targetTabId)
  if (!doc) return
  const payload = await buildSavePayload(doc)
  ipcRenderer.send(mode, {
    ...payload,
    args,
  })
}
//监听save事件
eventBus.on('save', async (payload) => {
  const { mode, args } = normalizeSavePayload(payload)

  if (mode === 'auto-save') {
    const doc = getDocument()
    if (!doc || !doc.path) {
      return//如果尝试自动保存时，没有文件路径，则不进行自动保存
    }
  }
  await save('save', args);
})

eventBus.on('is-need-save', (msg) => {
  //console.log('is-need-save',msg)
  ipcRenderer.send('is-need-save', msg)
})

eventBus.on('save-and-quit', async () => {
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
  //eventBus.emit('nav-to', '/article');
  eventBus.emit('is-need-save', false)
  await save('save-as', args);
  //
})

eventBus.on('close-doc', () => {
  eventBus.emit('close-active-tab');
});

eventBus.on('export', async ({ format, filename }) => {
  const doc = getDocument()
  if (!doc) return

  const serialized = serializeDocument(doc)
  const exportArgs = { format, filename }

  let markdown =
    doc.format === 'tex'
      ? convertLatexToMarkdown(doc.tex ?? '')
      : filterMetaDataFromMd(serialized.md)

  if (['html', 'docx', 'pdf', 'md'].includes(format)) {
    markdown = await local2image(markdown)
  }

  if (['html', 'docx'].includes(format)) {
    markdown = await image2base64(markdown)
  }

  if (format === 'docx') {
    exportArgs.html = await ConvertMarkdownToHtmlVditor(markdown)
  } else if (format === 'pdf') {
    exportArgs.html = await ConvertHtmlForPdf(markdown)
  } else if (format === 'html') {
    exportArgs.html = await ConvertMarkdownToHtmlManually(markdown)
  } else {
    exportArgs.html = await ConvertMarkdownToHtmlManually(markdown)
  }

  exportArgs.md = serialized.md
  exportArgs.json = serialized.json
  exportArgs.tex = serialized.tex

  ipcRenderer.send('export', exportArgs)
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

eventBus.on('open-log-file', () => {
  ipcRenderer.send('open-log-file')
})

eventBus.on('open-log-directory', () => {
  ipcRenderer.send('open-log-directory')
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
import { createRendererLogger } from './logger.ts'
import { i18n } from '../main.js'


// window.electron.onMessageFromMain((event, message) => {
//     console.log('收到来自主进程的消息:', message);
//   });

// //监听所有事件，给所有事件添加日志
// eventBus.onAny((event, ...args) => {
//     console.log('event:', event, 'args:', args);
// });
