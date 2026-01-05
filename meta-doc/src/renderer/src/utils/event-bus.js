
//事件总线

// 使用 Vue 实例作为事件总线

import mitt from 'mitt'
import { basename } from './path-utils.js'
import { getSetting, updateRecentDocs } from './settings.js'
import { ConvertMarkdownToHtmlManually } from './md-utils.js'
import localIpcRenderer from './web-adapter/local-ipc-renderer.ts'
import { useWorkspace } from '../stores/workspace'
import { serializeDocument } from '../services/document-serializer'
import { convertLatexToMarkdown } from './latex-utils'
import { NotImplementedExportError, prepareExportPayload } from '../services/export-manager.ts'
import { webMainCalls } from './web-adapter/web-main-calls.js'
import { createRendererLogger } from './logger.ts'
import { i18n } from '../i18n.js'
import { ElMessage } from 'element-plus'
import { ElMessageBox } from 'element-plus'


const eventBus = mitt()

export default eventBus

// 窗口类型管理（需要在 logger 之前定义）
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

let ipcRenderer = null
if (window && window.electron) {
  ipcRenderer = window.electron.ipcRenderer

} else {
  webMainCalls();
  ipcRenderer = localIpcRenderer
  //todo 说明当前环境不是electron环境，需要另外适配
}

// 懒加载logger，避免初始化顺序问题
let loggerInstance = null;

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('EventBus', {
      windowTypeProvider: () => getWindowType()
    });
  }
  return loggerInstance;
}

const workspace = useWorkspace();
const { activeTabId, ensureDocument, markDocumentSaved, updateDocumentDirty, tabs, saveDocument, removeTab } = workspace;

const cloneDeep = (value) => JSON.parse(JSON.stringify(value));

const extractFileName = (filePath, fallbackTitle) => {
  if (fallbackTitle && typeof fallbackTitle === 'string' && fallbackTitle.trim().length > 0) {
    return fallbackTitle.trim();
  }
  if (typeof filePath === 'string' && filePath.length > 0) {
    try {
      return basename(filePath);
    } catch (error) {
      getLogger().warn('解析文件名失败', error);
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
    getLogger().warn('获取文档失败', error);
    return null;
  }
};

const resolveTargetTabId = (tabId) =>
  typeof tabId === 'string' ? tabId : activeTabId.value;

const buildSavePayload = async (doc) => {
  // 在保存前，如果元信息标题为空，尝试从内容中提取标题
  // 这对于第一次保存（没有路径）特别重要，但即使有路径，如果标题为空也应该提取
  if (!doc.meta?.title || doc.meta.title.trim().length === 0) {
    const { extractTitleFromContent, sanitizeTitleForFilename } = await import('./title-extractor.ts');
    const content = doc.format === 'tex' ? doc.tex ?? '' : doc.markdown ?? '';
    const extractedTitle = extractTitleFromContent(content, doc.format);
    
    if (extractedTitle) {
      const sanitizedTitle = sanitizeTitleForFilename(extractedTitle);
      if (sanitizedTitle) {
        // 更新文档的元信息标题
        doc.meta = { ...doc.meta, title: sanitizedTitle };
        // 如果是第一次保存（没有路径），也更新标签页标题
        if (!doc.path) {
          const tab = workspace.tabs.find(t => t.id === doc.tabId);
          if (tab) {
            tab.subtitle = sanitizedTitle;
          }
        }
      }
    }
  }
  
  const serialized = await serializeDocument(doc);
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
// 响应主进程请求获取活动文档信息
ipcRenderer.on('request-active-document-info', () => {
  try {
    const doc = workspace.activeDocument.value;
    if (!doc) {
      ipcRenderer.send('active-document-info-response', null);
      return;
    }
    const path = doc.path || '';
    const title = doc.meta?.title?.trim() || '';
    // 优先使用标题，其次使用路径中的文件名，最后使用默认值
    let fileName = title;
    if (!fileName && path) {
      fileName = extractFileName(path, null);
    }
    if (!fileName) {
      fileName = 'Untitled';
    }
    ipcRenderer.send('active-document-info-response', { fileName, path });
  } catch (error) {
    getLogger().error('获取活动文档信息失败:', error);
    ipcRenderer.send('active-document-info-response', null);
  }
})

// 响应主进程请求获取所有未保存的tabs信息
ipcRenderer.on('request-unsaved-tabs-info', () => {
  try {
    const unsavedTabs = [];
    
    for (const tab of tabs) {
      if (tab.dirty) {
        const doc = ensureDocument(tab.id);
        const path = doc.path || '';
        const title = doc.meta?.title?.trim() || '';
        // 优先使用标题，其次使用路径中的文件名，最后使用默认值
        let fileName = title;
        if (!fileName && path) {
          fileName = extractFileName(path, null);
        }
        if (!fileName) {
          fileName = 'Untitled';
        }
        unsavedTabs.push({
          tabId: tab.id,
          fileName,
          path
        });
      }
    }
    
    ipcRenderer.send('unsaved-tabs-info-response', unsavedTabs);
  } catch (error) {
    getLogger().error('获取未保存tabs信息失败:', error);
    ipcRenderer.send('unsaved-tabs-info-response', []);
  }
})

// 响应主进程请求获取特定tab信息
ipcRenderer.on('request-tab-info', (_event, tabId) => {
  try {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) {
      ipcRenderer.send('tab-info-response', null);
      return;
    }
    
    const doc = ensureDocument(tabId);
    const path = doc.path || '';
    const title = doc.meta?.title?.trim() || '';
    // 优先使用标题，其次使用路径中的文件名，最后使用默认值
    let fileName = title;
    if (!fileName && path) {
      fileName = extractFileName(path, null);
    }
    if (!fileName) {
      fileName = 'Untitled';
    }
    
    ipcRenderer.send('tab-info-response', {
      fileName,
      path,
      dirty: tab.dirty || doc.dirty
    });
  } catch (error) {
    getLogger().error('获取tab信息失败:', error);
    ipcRenderer.send('tab-info-response', null);
  }
})

// 注意：close-triggered 现在由主进程直接处理，这里保留以防需要
ipcRenderer.on('close-triggered', () => {
  // 主进程现在直接处理关闭确认对话框，这里不再需要显示 web 对话框
  // 保留此处理以防需要，但通常不会执行到这里
})

ipcRenderer.on('sync-theme', (event) => {
  eventBus.emit('sync-theme')//同步主题
})

//监听主进程的事件，转发给事件总线，从而可以在Vue组件中使用
ipcRenderer.on('update-current-path', (_event, path) => {
  if (!path) return
  
  // 检查是否有标签页已经使用了这个路径
  const existingTab = tabs.find(tab => tab.path === path)
  if (existingTab) {
    // 如果已经有标签页使用了这个路径
    if (existingTab.id === activeTabId.value) {
      // 如果当前活动标签页就是这个标签页，更新它（可能是路径更新）
      const doc = getDocument()
      if (doc && doc.path !== path) {
        doc.path = path
        markDocumentSaved(doc.tabId, path)
      }
    }
    // 否则忽略这个事件，因为路径已经被其他标签页使用了
    // 这可以避免在打开新文档时，错误地更新其他标签页的路径和标题
    return
  }
  
  // 如果没有标签页使用这个路径，检查当前活动标签页
  const doc = getDocument()
  if (!doc) return
  
  // 只有当当前活动标签页是新建文档（路径为空）时，才更新
  // 这样可以避免在打开新文档时，错误地更新其他标签页的路径和标题
  if (!doc.path && path) {
    doc.path = path
    markDocumentSaved(doc.tabId, path)
  }
  // 否则忽略这个事件，因为当前活动标签页已经有路径了，可能是针对其他标签页的
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
  // 使用 eventBus.emit 显示错误（用户要求）
  eventBus.emit('show-error', message)
})

ipcRenderer.on('save-triggered', () => {
  eventBus.emit('save')
})
ipcRenderer.on('save-as-triggered', () => {
  eventBus.emit('save-as')
})
const searchReplaceSharedState = {
  isVisible: false,
  expandReplace: false,
};

ipcRenderer.on('search-replace-triggered', () => {
  searchReplaceSharedState.isVisible = true;
  eventBus.emit('search-replace')
})

ipcRenderer.on('search-replace-expand-triggered', () => {
  searchReplaceSharedState.isVisible = true;
  searchReplaceSharedState.expandReplace = true;
  eventBus.emit('search-replace', { expandReplace: true })
})

// 监听主进程发送的全局进度事件
ipcRenderer.on('global-progress', (_event, progressData) => {
  eventBus.emit('global-progress', progressData)
})

eventBus.on('search-replace', (payload) => {
  searchReplaceSharedState.isVisible = true;
  if (payload?.expandReplace) {
    searchReplaceSharedState.expandReplace = true;
  }
})

eventBus.on('search-replace-expand', () => {
  if (!searchReplaceSharedState.isVisible) return;
  searchReplaceSharedState.expandReplace = true;
})

eventBus.on('search-replace-closed', () => {
  searchReplaceSharedState.isVisible = false;
  searchReplaceSharedState.expandReplace = false;
})

// 移除 Tab 切换时重新打开菜单的逻辑
// 现在由 SearchReplaceMenu 组件自己处理：Tab 切换时关闭菜单
// eventBus.on('active-tab-changed', () => {
//   if (!searchReplaceSharedState.isVisible) return;
//   eventBus.emit('search-replace', {
//     expandReplace: searchReplaceSharedState.expandReplace,
//   });
// })

ipcRenderer.on('open-doc-success', (event, payload) => {
  const fileName = extractFileName(payload?.path, payload?.fileName)
  if (payload?.path) {
    updateRecentDocs(payload.path)
  }
  eventBus.emit('workspace-open-document', {
    ...payload,
    fileName
  })
})

// 监听文件变化事件（来自主进程的文件监听服务）
ipcRenderer.on('file-changed', (event, payload) => {
  const { filePath, tabId, content, modifiedTime, diff } = payload || {}
  if (!filePath) {
    getLogger().warn('文件变化事件缺少文件路径', payload)
    return
  }
  
  // 发送文件变化事件到 workspace
  eventBus.emit('external-file-changed', {
    filePath,
    tabId,
    content,
    modifiedTime,
    diff // 增量变化信息
  })
})

// 监听文件删除事件
ipcRenderer.on('file-deleted', (event, payload) => {
  const { filePath, tabId } = payload || {}
  if (!filePath) {
    return
  }
  
  // 发送文件删除事件到 workspace
  eventBus.emit('external-file-deleted', {
    filePath,
    tabId
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

// 响应主进程请求保存特定tab
ipcRenderer.on('save-tab', async (_event, tabId) => {
  try {
    const result = await saveDocument(tabId, { saveAs: false });
    ipcRenderer.send('save-tab-response', { tabId, success: result });
  } catch (error) {
    getLogger().error('保存tab失败:', error);
    ipcRenderer.send('save-tab-response', { tabId, success: false, error: error.message });
  }
});

// 响应主进程请求放弃特定tab的更改（直接关闭tab）
ipcRenderer.on('discard-tab', (_event, tabId) => {
  try {
    removeTab(tabId);
    ipcRenderer.send('discard-tab-response', { tabId, success: true });
  } catch (error) {
    getLogger().error('关闭tab失败:', error);
    ipcRenderer.send('discard-tab-response', { tabId, success: false, error: error.message });
  }
});

// 响应主进程请求关闭所有剩余的tabs
ipcRenderer.on('close-all-tabs', () => {
  try {
    // 获取所有tab的ID（需要先复制数组，因为removeTab会修改tabs数组）
    const tabIds = tabs.map(tab => tab.id);
    // 依次关闭所有tabs
    for (const tabId of tabIds) {
      removeTab(tabId);
    }
    ipcRenderer.send('close-all-tabs-response', { success: true });
  } catch (error) {
    getLogger().error('关闭所有tabs失败:', error);
    ipcRenderer.send('close-all-tabs-response', { success: false, error: error.message });
  }
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

eventBus.on('export', async ({ format, filename, options }) => {
  const doc = getDocument()
  if (!doc) return

  // 设置鼠标等待状态
  const setCursorWaiting = () => {
    document.body.style.cursor = 'wait';
    if (document.documentElement) {
      document.documentElement.style.cursor = 'wait';
    }
  };
  
  const restoreCursor = () => {
    document.body.style.cursor = '';
    if (document.documentElement) {
      document.documentElement.style.cursor = '';
    }
  };

  setCursorWaiting();

  // 监听主进程发送的对话框打开事件，恢复鼠标状态
  const handleDialogOpening = () => {
    restoreCursor();
  };
  ipcRenderer.on('export-dialog-opening', handleDialogOpening);

  try {
    const payload = await prepareExportPayload(doc, format, filename, options)
    const result = await ipcRenderer.invoke('perform-export', payload)
    
    // 如果用户取消了对话框（result.success === false 且没有 error），取消任务
    if (!result.success && !result.error) {
      // 用户取消了对话框，取消任务
      if (payload.requestId) {
        try {
          await ipcRenderer.invoke('cancel-export-task', payload.requestId)
        } catch (err) {
          // ignore
        }
      }
    }
    
    // 确保在完成后恢复鼠标状态（防止事件未触发）
    restoreCursor();
  } catch (error) {
    restoreCursor();
    if (error instanceof NotImplementedExportError) {
      const message =
        i18n?.global?.t?.('export.notImplemented', '该导出组合尚未实现') ??
        '该导出功能尚未实现'
      ElMessage.error(message)
      getLogger().warn(error.message)
    } else {
      const message =
        error instanceof Error ? error.message : i18n?.global?.t?.('export.unknownError', '导出失败')
      ElMessage.error(message)
      getLogger().error('导出失败', error)
    }
  } finally {
    // 清理事件监听器
    ipcRenderer.removeListener('export-dialog-opening', handleDialogOpening);
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
eventBus.on('data-analysis', () => {
  ipcRenderer.send('data-analysis')
})
eventBus.on('ocr', () => {
  ipcRenderer.send('ocr')
})
eventBus.on('attachment', () => {
  ipcRenderer.send('attachment')
})
eventBus.on('graph', () => {
  ipcRenderer.send('graph')
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




// 这些导入已经在文件顶部处理了，这里移除重复的导入


// window.electron.onMessageFromMain((event, message) => {
//     console.log('收到来自主进程的消息:', message);
//   });

// //监听所有事件，给所有事件添加日志
// eventBus.onAny((event, ...args) => {
//     console.log('event:', event, 'args:', args);
// });
