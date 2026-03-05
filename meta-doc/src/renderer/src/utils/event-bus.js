//事件总线

// 使用 Vue 实例作为事件总线

import mitt from 'mitt'
import { basename } from './path-utils.js'
import { getSetting, updateRecentDocs } from './settings.js'
import { ConvertMarkdownToHtmlManually } from './md-utils.js'
import { webMainCalls } from './web-adapter/web-main-calls.js'
import messageBridge from '../bridge/message-bridge'
import { useWorkspace } from '../stores/workspace'
import { addUserTemplate } from '../stores/user-templates'
import { serializeDocument } from '../services/document-serializer'
import { convertLatexToMarkdown } from './latex-utils'
import { NotImplementedExportError, prepareExportPayload } from '../services/export-manager.ts'
import { createRendererLogger } from './logger.ts'
import { i18n } from '../i18n.js'
import { ElMessage } from 'element-plus'
import { ElMessageBox } from 'element-plus'

const eventBus = mitt()
if (typeof window !== 'undefined') {
  window.__eventBus = eventBus
}

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

if (typeof window !== 'undefined' && !window.electron) {
  webMainCalls()
}

// 懒加载logger，避免初始化顺序问题
let loggerInstance = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('EventBus', {
      windowTypeProvider: () => getWindowType()
    })
  }
  return loggerInstance
}

const workspace = useWorkspace()
const {
  activeTabId,
  activateTab,
  ensureDocument,
  markDocumentSaved,
  updateDocumentDirty,
  tabs,
  saveDocument,
  removeTab
} = workspace

const cloneDeep = (value) => JSON.parse(JSON.stringify(value))

const extractFileName = (filePath, fallbackTitle) => {
  if (fallbackTitle && typeof fallbackTitle === 'string' && fallbackTitle.trim().length > 0) {
    return fallbackTitle.trim()
  }
  if (typeof filePath === 'string' && filePath.length > 0) {
    try {
      return basename(filePath)
    } catch (error) {
      getLogger().warn('解析文件名失败', error)
      const parts = filePath.split(/[\\/]/)
      return parts[parts.length - 1] || filePath
    }
  }
  return i18n?.global?.t?.('workspace.untitledDocument') ?? 'Untitled'
}

const getDocument = (tabId) => {
  const targetId = typeof tabId === 'string' ? tabId : activeTabId.value
  if (!targetId) return null
  try {
    return ensureDocument(targetId)
  } catch (error) {
    getLogger().warn('获取文档失败', error)
    return null
  }
}

const resolveTargetTabId = (tabId) => (typeof tabId === 'string' ? tabId : activeTabId.value)

const buildSavePayload = async (doc) => {
  // 在保存前，如果元信息标题为空，尝试从内容中提取标题
  // 这对于第一次保存（没有路径）特别重要，但即使有路径，如果标题为空也应该提取
  if (!doc.meta?.title || doc.meta.title.trim().length === 0) {
    const { extractTitleFromContent, sanitizeTitleForFilename } = await import(
      './title-extractor.ts'
    )
    const content = doc.format === 'tex' ? (doc.tex ?? '') : (doc.markdown ?? '')
    const extractedTitle = extractTitleFromContent(content, doc.format)

    if (extractedTitle) {
      const sanitizedTitle = sanitizeTitleForFilename(extractedTitle)
      if (sanitizedTitle) {
        // 更新文档的元信息标题
        doc.meta = { ...doc.meta, title: sanitizedTitle }
        // 如果是第一次保存（没有路径），也更新标签页标题
        if (!doc.path) {
          const tab = workspace.tabs.find((t) => t.id === doc.tabId)
          if (tab) {
            tab.subtitle = sanitizedTitle
          }
        }
      }
    }
  }

  const serialized = await serializeDocument(doc)
  const markdownSource =
    doc.format === 'tex' ? convertLatexToMarkdown(doc.tex ?? '') : (doc.markdown ?? '')
  const html = await ConvertMarkdownToHtmlManually(markdownSource, true, doc.path || '')
  return {
    json: serialized.json,
    md: serialized.md,
    path: doc.path,
    html,
    tex: serialized.tex,
    format: doc.format,
    sidecarMetadata: serialized.sidecarMetadata // 传递Sidecar元信息
  }
}

export const isElectronEnv = () => {
  //判断是否在electron环境中
  return navigator.userAgent.toLowerCase().includes('electron')
}

eventBus.on('sync-ai-dialogs', (dialogs) => {
  //ai-chat -> home，一般来说只有home窗口会监听这个事件
  const doc = getDocument()
  if (!doc) return
  doc.aiDialogs = cloneDeep(dialogs)
  updateDocumentDirty(doc.tabId)
})

eventBus.on('request-ai-dialogs', () => {
  //home -> ai-chat，主窗口请求AICHAT组件获取对话数据
  const doc = getDocument()
  if (!doc) return
  // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
  eventBus.emit('response-ai-dialogs', cloneDeep(doc.aiDialogs))
})

eventBus.on('response-ai-dialogs', (dialogs) => {
  //主进程发送给AICHAT组件对话数据
  const doc = getDocument()
  if (!doc) return
  doc.aiDialogs = cloneDeep(dialogs)
  updateDocumentDirty(doc.tabId)
  eventBus.emit('ai-dialogs-loaded')
})

eventBus.on('shell-open', (filePath) => {
  messageBridge.send('shell-open', filePath)
})

messageBridge.on('os-theme-changed', (event) => {
  eventBus.emit('theme-changed')
  eventBus.emit('sync-theme')
})
// 响应主进程请求获取活动文档信息
messageBridge.on('request-active-document-info', () => {
  try {
    const doc = workspace.activeDocument.value
    if (!doc) {
      messageBridge.send('active-document-info-response', null)
      return
    }
    const path = doc.path || ''
    const title = doc.meta?.title?.trim() || ''
    // 优先使用标题，其次使用路径中的文件名，最后使用默认值
    let fileName = title
    if (!fileName && path) {
      fileName = extractFileName(path, null)
    }
    if (!fileName) {
      fileName = 'Untitled'
    }
    messageBridge.send('active-document-info-response', { fileName, path })
  } catch (error) {
    getLogger().error('获取活动文档信息失败:', error)
    messageBridge.send('active-document-info-response', null)
  }
})

// 响应主进程请求获取所有未保存的tabs信息
messageBridge.on('request-unsaved-tabs-info', () => {
  try {
    const unsavedTabs = []

    for (const tab of tabs) {
      if (tab.dirty) {
        const doc = ensureDocument(tab.id)
        const path = doc.path || ''
        const title = doc.meta?.title?.trim() || ''
        // 优先使用标题，其次使用路径中的文件名，最后使用默认值
        let fileName = title
        if (!fileName && path) {
          fileName = extractFileName(path, null)
        }
        if (!fileName) {
          fileName = 'Untitled'
        }
        unsavedTabs.push({
          tabId: tab.id,
          fileName,
          path
        })
      }
    }

    messageBridge.send('unsaved-tabs-info-response', unsavedTabs)
  } catch (error) {
    getLogger().error('获取未保存tabs信息失败:', error)
    messageBridge.send('unsaved-tabs-info-response', [])
  }
})

// 响应主进程请求获取特定tab信息
messageBridge.on('request-tab-info', (_event, tabId) => {
  try {
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) {
      messageBridge.send('tab-info-response', null)
      return
    }

    const doc = ensureDocument(tabId)
    const path = doc.path || ''
    const title = doc.meta?.title?.trim() || ''
    // 优先使用标题，其次使用路径中的文件名，最后使用默认值
    let fileName = title
    if (!fileName && path) {
      fileName = extractFileName(path, null)
    }
    if (!fileName) {
      fileName = 'Untitled'
    }

    messageBridge.send('tab-info-response', {
      fileName,
      path,
      dirty: tab.dirty || doc.dirty
    })
  } catch (error) {
    getLogger().error('获取tab信息失败:', error)
    messageBridge.send('tab-info-response', null)
  }
})

// Agent CLI：主进程 TCP 收到一行后发来 agent-cli-run，执行真实 agent 并回写结果
// 设置全局标记，终端工具等可据此自动批准（无 UI 时不会卡在等待批准）
messageBridge.on('agent-cli-run', async (_event, userContent) => {
  if (typeof window !== 'undefined') window.__agentCliActive = true
  try {
    const { runAgentCliTurn } = await import('./agent-cli-runner')
    const result = await runAgentCliTurn(
      typeof userContent === 'string' ? userContent : String(userContent)
    )
    await messageBridge.invoke('agent-cli-submit-response', result)
  } catch (e) {
    await messageBridge.invoke(
      'agent-cli-submit-response',
      JSON.stringify({ error: String(e && (e.message || e)) })
    )
  } finally {
    if (typeof window !== 'undefined') window.__agentCliActive = false
  }
})

// 检查文件是否在当前窗口打开
messageBridge.on('check-file-exists-in-window', (_event, filePath) => {
  try {
    const tab = tabs.find((t) => t.path === filePath && (t.kind === 'file' || t.kind === 'new'))
    if (tab) {
      messageBridge.send('file-exists-in-window-response', { tabId: tab.id })
    } else {
      messageBridge.send('file-exists-in-window-response', { tabId: null })
    }
  } catch (error) {
    getLogger().error('检查文件是否在当前窗口打开失败:', error)
    messageBridge.send('file-exists-in-window-response', { tabId: null })
  }
})

// 检查工具/系统 Tab 是否在当前窗口打开（toolType 或 route）
messageBridge.on('check-tool-tab-in-window', (_event, payload) => {
  try {
    const { toolType, route } = payload || {}
    const tab = tabs.find((t) => {
      if (toolType && t.kind === 'tool' && t.toolType === toolType) return true
      if (route && t.kind === 'system' && t.route === route) return true
      return false
    })
    if (tab) {
      messageBridge.send('tool-tab-exists-in-window-response', { tabId: tab.id })
    } else {
      messageBridge.send('tool-tab-exists-in-window-response', { tabId: null })
    }
  } catch (error) {
    getLogger().error('检查工具Tab是否在当前窗口打开失败:', error)
    messageBridge.send('tool-tab-exists-in-window-response', { tabId: null })
  }
})

// 激活指定的Tab
messageBridge.on('activate-tab-by-id', (_event, tabId) => {
  try {
    const tab = tabs.find((t) => t.id === tabId)
    if (tab) {
      activateTab(tabId)
    }
  } catch (error) {
    getLogger().error('激活Tab失败:', error)
  }
})

// 注意：close-triggered 现在由主进程直接处理，这里保留以防需要
messageBridge.on('close-triggered', () => {
  // 主进程现在直接处理关闭确认对话框，这里不再需要显示 web 对话框
  // 保留此处理以防需要，但通常不会执行到这里
})

messageBridge.on('sync-theme', (event) => {
  eventBus.emit('sync-theme') //同步主题
})

// 监听主进程的事件，转发给事件总线，从而可以在Vue组件中使用
// 多 Tab 模式：主进程在 openDoc 后会发送 update-current-path，且可能与 open-doc-success 几乎同时到达。
// 若先处理 update-current-path，此时新 Tab 尚未创建，getDocument() 会拿到未初始化的 Tab，错误地给它写入 path，导致该 Tab 标题被改成打开的文件名。
// 因此：仅当已有 Tab 使用该 path 时才做同步；若尚无任何 Tab 使用该 path，不做任何更新（由 workspace-open-document 创建新 Tab 并设置 path）。
messageBridge.on('update-current-path', (_event, path) => {
  if (!path) return

  const existingTab = tabs.find((tab) => tab.path === path)
  if (!existingTab) {
    // 尚无任何 Tab 使用该 path，说明可能是「打开文档」流程，新 Tab 将由 workspace-open-document 创建，此处不更新当前 Tab
    return
  }
  if (existingTab.id === activeTabId.value) {
    const doc = getDocument(existingTab.id)
    if (doc && doc.path !== path) {
      doc.path = path
      markDocumentSaved(existingTab.id, path)
    }
  }
})

messageBridge.on('save-success', (_event, data = {}) => {
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
    eventBus.emit('open-doc', data.path) //对于另存为的文件，需要重新打开
  }
})

messageBridge.on('save-file-path', (_event, path) => {
  eventBus.emit('save-file-path', path)
  const doc = getDocument()
  if (!doc) return
  doc.path = path || ''
  markDocumentSaved(doc.tabId, doc.path)
})
messageBridge.on('export-success', (event, data) => {
  //console.log(data)
  eventBus.emit('export-success', data)
})

messageBridge.on('export-error', (event, data) => {
  const message =
    typeof data === 'string'
      ? data
      : data?.message || i18n?.global?.t?.('export.unknownError', '导出失败')
  // 使用 eventBus.emit 显示错误（用户要求）
  eventBus.emit('show-error', message)
})

messageBridge.on('save-triggered', () => {
  eventBus.emit('save')
})
messageBridge.on('save-as-triggered', () => {
  eventBus.emit('save-as')
})
const searchReplaceSharedState = {
  isVisible: false,
  expandReplace: false
}

messageBridge.on('search-replace-triggered', () => {
  searchReplaceSharedState.isVisible = true
  eventBus.emit('search-replace')
})

messageBridge.on('search-replace-expand-triggered', () => {
  searchReplaceSharedState.isVisible = true
  searchReplaceSharedState.expandReplace = true
  eventBus.emit('search-replace', { expandReplace: true })
})

// 标签页快捷键
messageBridge.on('next-tab-triggered', () => {
  eventBus.emit('tab-next')
})
messageBridge.on('prev-tab-triggered', () => {
  eventBus.emit('tab-prev')
})
messageBridge.on('close-tab-triggered', () => {
  eventBus.emit('tab-close')
})
messageBridge.on('reopen-tab-triggered', () => {
  eventBus.emit('tab-reopen')
})
messageBridge.on('new-tab-triggered', () => {
  eventBus.emit('tab-new')
})
messageBridge.on('new-doc-triggered', () => {
  eventBus.emit('new-doc')
})
messageBridge.on('save-all-triggered', () => {
  eventBus.emit('save-all')
})

// 监听主进程发送的全局进度事件
messageBridge.on('global-progress', (_event, progressData) => {
  eventBus.emit('global-progress', progressData)
})

eventBus.on('search-replace', (payload) => {
  searchReplaceSharedState.isVisible = true
  if (payload?.expandReplace) {
    searchReplaceSharedState.expandReplace = true
  }
})

eventBus.on('search-replace-expand', () => {
  if (!searchReplaceSharedState.isVisible) return
  searchReplaceSharedState.expandReplace = true
})

eventBus.on('search-replace-closed', () => {
  searchReplaceSharedState.isVisible = false
  searchReplaceSharedState.expandReplace = false
})

// 移除 Tab 切换时重新打开菜单的逻辑
// 现在由 SearchReplaceMenu 组件自己处理：Tab 切换时关闭菜单
// eventBus.on('active-tab-changed', () => {
//   if (!searchReplaceSharedState.isVisible) return;
//   eventBus.emit('search-replace', {
//     expandReplace: searchReplaceSharedState.expandReplace,
//   });
// })

messageBridge.on('open-doc-success', (event, payload) => {
  const fileName = extractFileName(payload?.path, payload?.fileName)
  // recent-docs 更新现在统一在 Main.vue 的 handleOpenDocSuccess 中处理
  eventBus.emit('workspace-open-document', {
    ...payload,
    fileName
  })
})

// 监听文件变化事件（来自主进程的文件监听服务）
messageBridge.on('file-changed', (event, payload) => {
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
messageBridge.on('file-deleted', (event, payload) => {
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
  const { isSaveInProgress } = await import('./save-guard')
  isSaveInProgress.value = true
  // 保存触发时立即同步编辑器主题，并等待同步完成后再继续，避免保存流程中主题变浅
  await new Promise((resolve) => {
    eventBus.emit('sync-editor-theme', { resolve })
  })
  try {
    const resolvedTabId = resolveTargetTabId(targetTabId)
    if (resolvedTabId) {
      // 关键修复：同步执行 sync-active-editor，确保内容同步完成后再保存
      // 使用 Promise 确保同步完成（等待下一个 tick）
      await new Promise((resolve) => {
        eventBus.emit('sync-active-editor', { tabId: resolvedTabId })
        // 等待下一个 tick，确保 sync-active-editor 处理完成
        setTimeout(() => {
          resolve()
        }, 0)
      })
    }
    const doc = getDocument(resolvedTabId)
    if (!doc) return

    // 关键修复：在保存前就标记为不脏（乐观更新），立即消除脏标记，提升用户体验
    // 注意：这里在 sync-active-editor 完成后更新，确保内容已经同步
    // 如果保存失败，会在后续流程中重新标记为脏（通过 updateDocumentDirty）
    // 但是，为了确保立即消除脏标记，我们在保存前就更新 savedMarkdown 等（但使用当前路径）
    // 这样脏标记会立即消除，markDocumentSaved 会在保存成功后再次确认（更新路径等）
    // 使用 markDocumentSaved 可以确保逻辑一致，但会立即消除脏标记
    const currentPath = doc.path
    // 关键修复：提前标记为已保存（乐观更新），立即消除脏标记
    // 这样用户可以看到脏标记立即消除，提升用户体验
    // 如果保存失败，会在后续流程中重新标记为脏
    markDocumentSaved(resolvedTabId, currentPath)

    const payload = await buildSavePayload(doc)
    messageBridge.send(mode, {
      ...payload,
      args
    })
  } finally {
    isSaveInProgress.value = false
    // 保存完成后显式同步编辑器主题，恢复因保存流程可能导致的主题错误
    eventBus.emit('sync-editor-theme')
  }
}
//监听save事件
eventBus.on('save', async (payload) => {
  const { mode, args } = normalizeSavePayload(payload)

  if (mode === 'auto-save') {
    const doc = getDocument()
    if (!doc || !doc.path) {
      return //如果尝试自动保存时，没有文件路径，则不进行自动保存
    }
  }
  await save('save', args)
})

eventBus.on('is-need-save', (msg) => {
  //console.log('is-need-save',msg)
  messageBridge.send('is-need-save', msg)
})

eventBus.on('save-and-quit', async () => {
  eventBus.emit('is-need-save', false)
  await save('save')
  messageBridge.send('quit')
})

// 响应主进程请求保存特定tab
messageBridge.on('save-tab', async (_event, tabId) => {
  try {
    const result = await saveDocument(tabId, { saveAs: false })
    messageBridge.send('save-tab-response', { tabId, success: result })
  } catch (error) {
    getLogger().error('保存tab失败:', error)
    messageBridge.send('save-tab-response', { tabId, success: false, error: error.message })
  }
})

// 响应主进程请求放弃特定tab的更改（直接关闭tab）
messageBridge.on('discard-tab', (_event, tabId) => {
  try {
    removeTab(tabId)
    messageBridge.send('discard-tab-response', { tabId, success: true })
  } catch (error) {
    getLogger().error('关闭tab失败:', error)
    messageBridge.send('discard-tab-response', { tabId, success: false, error: error.message })
  }
})

// 响应主进程请求关闭所有剩余的tabs
messageBridge.on('close-all-tabs', () => {
  try {
    // 获取所有tab的ID（需要先复制数组，因为removeTab会修改tabs数组）
    const tabIds = tabs.map((tab) => tab.id)
    // 依次关闭所有tabs
    for (const tabId of tabIds) {
      removeTab(tabId)
    }
    messageBridge.send('close-all-tabs-response', { success: true })
  } catch (error) {
    getLogger().error('关闭所有tabs失败:', error)
    messageBridge.send('close-all-tabs-response', { success: false, error: error.message })
  }
})

eventBus.on('open-doc', async (path) => {
  //await init()
  eventBus.emit('is-need-save', false)
  messageBridge.send('open-doc', path)
  // recent-docs 更新现在统一在 Main.vue 的 handleOpenDocSuccess 中处理
})
eventBus.on('open-link', async (url) => {
  messageBridge.send('open-link', url)
})
eventBus.on('quit', () => {
  messageBridge.send('quit')
})

eventBus.on('save-as', async (args) => {
  //eventBus.emit('nav-to', '/article');
  eventBus.emit('is-need-save', false)
  await save('save-as', args)
  //
})

eventBus.on('close-doc', () => {
  eventBus.emit('close-active-tab')
})

eventBus.on('export-as-template', (payload) => {
  const { title, description, format, content, locale: localeFromPayload } = payload || {}
  if (!content || (format !== 'md' && format !== 'tex')) return
  const locale = (localeFromPayload || i18n?.global?.locale?.value || 'zh_CN').replace('-', '_')
  try {
    addUserTemplate({
      formatId: format,
      locale,
      title: title || '未命名模板',
      description: description || '',
      content
    })
    ElMessage.success(
      i18n?.global?.t?.('leftMenu.exportAsTemplateSuccess', '已添加为模板，可在新建文档时选择') ??
        '已添加为模板'
    )
  } catch (e) {
    getLogger().error('export-as-template failed', e)
    ElMessage.error(i18n?.global?.t?.('export.unknownError', '导出失败') ?? '导出失败')
  }
})

eventBus.on('export', async ({ format, filename, options }) => {
  const doc = getDocument()
  if (!doc) return

  const targetPath = options?.targetPath

  // 设置鼠标等待状态（无 targetPath 时显示等待，有 targetPath 时多为脚本驱动可不改光标）
  const setCursorWaiting = () => {
    document.body.style.cursor = 'wait'
    if (document.documentElement) {
      document.documentElement.style.cursor = 'wait'
    }
  }

  const restoreCursor = () => {
    document.body.style.cursor = ''
    if (document.documentElement) {
      document.documentElement.style.cursor = ''
    }
  }

  if (!targetPath) setCursorWaiting()

  // 监听主进程发送的对话框打开事件，恢复鼠标状态（仅走对话框时有效）
  const handleDialogOpening = () => {
    restoreCursor()
  }
  messageBridge.on('export-dialog-opening', handleDialogOpening)

  try {
    // 与程序内导出完全同一套准备流程：预渲染图表、公式、图片处理等
    const payload = await prepareExportPayload(doc, format, filename, options)
    const result = targetPath
      ? await messageBridge.invoke('perform-export-to-path', payload, targetPath)
      : await messageBridge.invoke('perform-export', payload)

    // 如果用户取消了对话框（result.success === false 且没有 error），取消任务
    if (!result.success && !result.error) {
      // 用户取消了对话框，取消任务
      if (payload.requestId) {
        try {
          await messageBridge.invoke('cancel-export-task', payload.requestId)
        } catch (err) {
          // ignore
        }
      }
    }

    // 确保在完成后恢复鼠标状态（防止事件未触发）
    restoreCursor()
  } catch (error) {
    restoreCursor()
    if (error instanceof NotImplementedExportError) {
      const message =
        i18n?.global?.t?.('export.notImplemented', '该导出组合尚未实现') ?? '该导出功能尚未实现'
      ElMessage.error(message)
      getLogger().warn(error.message)
    } else {
      const message =
        error instanceof Error
          ? error.message
          : i18n?.global?.t?.('export.unknownError', '导出失败')
      ElMessage.error(message)
      getLogger().error('导出失败', error)
    }
  } finally {
    // 清理事件监听器
    messageBridge.removeListener('export-dialog-opening', handleDialogOpening)
  }
})
// eventBus.on('export-to-pdf', async (args) => {
//   //console.log('export-to-pdf', htmlContent)
//   const saveResult = await messageBridge.invoke('export-to-pdf', args)
//   if (saveResult !== '') {
//     eventBus.emit('export-success', saveResult)
//   }
// })
eventBus.on('setting', () => {
  messageBridge.send('setting')
})
eventBus.on('ai-chat', () => {
  messageBridge.send('ai-chat')
})
eventBus.on('ai-graph', () => {
  messageBridge.send('ai-graph')
})
eventBus.on('smart-drawing-assistant', () => {
  messageBridge.send('smart-drawing-assistant')
})
eventBus.on('fomula-recognition', () => {
  messageBridge.send('fomula-recognition')
})
eventBus.on('data-analysis', () => {
  messageBridge.send('data-analysis')
})
eventBus.on('ocr', () => {
  messageBridge.send('ocr')
})
eventBus.on('attachment', () => {
  messageBridge.send('attachment')
})
eventBus.on('graph', () => {
  messageBridge.send('graph')
})
eventBus.on('aigc-detection', () => {
  const workspace = useWorkspace()
  workspace.openToolTab('aigcDetection')
})

eventBus.on('system-notification', (data) => {
  //console.log(data)
  messageBridge.send('system-notification', data)
})

eventBus.on('open-log-file', () => {
  messageBridge.send('open-log-file')
})

eventBus.on('open-log-directory', () => {
  messageBridge.send('open-log-directory')
})

eventBus.on('theme-changed', () => {
  // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
  eventBus.emit('sync-theme', {})
})
eventBus.on('send-broadcast', (message) => {
  //console.log('发送广播消息:', message)
  messageBridge.send('send-broadcast', message) //公共的广播信道
  //示例：
  //   eventBus.emit('send-broadcast', {
  //   to: 'all', // 或者指定窗口类型，如 'home' 或 'ai-chat'
  //   eventName: 'xxx', // 事件名称
  //   data: { key: 'value' } // 传递的数据
  // });
})
/**
 * 发送广播消息（单窗口多Tab架构下，直接使用eventBus）
 * @param {string} to - 目标窗口类型（'home', 'ai-chat', 'setting', 'all'），单窗口下已不再需要
 * @param {string} eventName - 事件名称
 * @param {*} data - 事件数据
 */
export function sendBroadcast(to, eventName, data) {
  // 单窗口多Tab架构：直接使用 eventBus，不再通过 IPC
  // 如果将来需要支持多窗口，可以在这里添加条件判断
  eventBus.emit(eventName, data)

  // 可选：如果 to 不是 'all'，可以记录日志以便调试
  if (to !== 'all') {
    getLogger().debug(`[Broadcast] ${to} -> ${eventName}`, data)
  }
}

messageBridge.on('receive-broadcast', (event, message) => {
  //console.log('接收到广播消息:', message)
  eventBus.emit('receive-broadcast', message) //接收到广播消息
})

eventBus.on('update-window-title', (title) => {
  messageBridge.send('update-window-title', title)
})

//处理广播逻辑
eventBus.on('receive-broadcast', (message) => {
  const windowType = getWindowType()
  if (message.to === 'all' || message.to === windowType) {
    //console.log('触发事件:', message.eventName, '数据:', message.data)
    eventBus.emit(message.eventName, message.data) //如果是给所有窗口的广播，或者是给当前窗口类型的广播，就触发对应的事件
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

// 已在文件顶部挂载 window.__eventBus，此处保留注释供参考
