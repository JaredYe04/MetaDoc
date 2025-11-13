
//事件总线

// 使用 Vue 实例作为事件总线

import mitt from 'mitt'
import path from 'path'
import { getSetting, updateRecentDocs } from './settings.js'
import { ConvertMarkdownToHtmlManually } from './md-utils.js'
import localIpcRenderer from './web-adapter/local-ipc-renderer.ts'
import { useWorkspace } from '../stores/workspace'
import { serializeDocument } from '../services/document-serializer'
import { convertLatexToMarkdown } from './latex-utils'
import { NotImplementedExportError, prepareExportPayload } from '../services/export-manager.ts'


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

const extractFileName = (filePath, fallbackTitle) => {
  if (fallbackTitle && typeof fallbackTitle === 'string' && fallbackTitle.trim().length > 0) {
    return fallbackTitle.trim();
  }
  if (typeof filePath === 'string' && filePath.length > 0) {
    try {
      return path.basename(filePath);
    } catch (error) {
      logger.warn('解析文件名失败', error);
      const parts = filePath.split(/[\\/]/);
      return parts[parts.length - 1] || filePath;
    }
  }
  return i18n?.global?.t?.('workspace.untitledDocument') ?? 'Untitled';
};

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

const resolveTargetTabId = (tabId) =>
  typeof tabId === 'string' ? tabId : activeTabId.value;

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
    format: doc.format,
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

  const effectivePath = data.path ?? doc?.path ?? ''
  const payload = {
    path: effectivePath,
    fileName: extractFileName(effectivePath, doc?.meta?.title),
    format: data.format ?? doc?.format,
    tabId: doc?.tabId ?? resolveTargetTabId(data.tabId),
    saveAs: Boolean(data.saveAs)
  }

  eventBus.emit('save-success', payload)
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

ipcRenderer.on('export-error', (event, data) => {
  const message =
    typeof data === 'string'
      ? data
      : data?.message || i18n?.global?.t?.('export.unknownError', '导出失败')
  ElMessage.error(message)
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
  const fileName = extractFileName(payload?.path, payload?.fileName)
  eventBus.emit('workspace-open-document', {
    ...payload,
    fileName
  })
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
  const resolvedTabId = resolveTargetTabId(targetTabId);
  if (resolvedTabId) {
    eventBus.emit('sync-active-editor', { tabId: resolvedTabId });
  }
  const doc = getDocument(resolvedTabId)
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

  try {
    const payload = await prepareExportPayload(doc, format, filename)
    await ipcRenderer.invoke('perform-export', payload)
  } catch (error) {
    if (error instanceof NotImplementedExportError) {
      const message =
        i18n?.global?.t?.('export.notImplemented', '该导出组合尚未实现') ??
        '该导出功能尚未实现'
      ElMessage.error(message)
      logger.warn(error.message)
    } else {
      const message =
        error instanceof Error ? error.message : i18n?.global?.t?.('export.unknownError', '导出失败')
      ElMessage.error(message)
      logger.error('导出失败', error)
    }
  }
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
