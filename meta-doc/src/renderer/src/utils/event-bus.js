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
import { toast } from '../utils/notification/toast'

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

// 懒加载 workspace，避免与 stores/workspace 的循环依赖（workspace 会 import 本模块）
function getWorkspace() {
  return useWorkspace()
}

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
  const ws = getWorkspace()
  const targetId = typeof tabId === 'string' ? tabId : ws.activeTabId.value
  if (!targetId) return null
  try {
    return ws.ensureDocument(targetId)
  } catch (error) {
    getLogger().warn('获取文档失败', error)
    return null
  }
}

const resolveTargetTabId = (tabId) => {
  const ws = getWorkspace()
  return typeof tabId === 'string' ? tabId : ws.activeTabId.value
}

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
          const tab = getWorkspace().tabs.find((t) => t.id === doc.tabId)
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
  const ws = getWorkspace()
  const doc = getDocument()
  if (!doc) return
  doc.aiDialogs = cloneDeep(dialogs)
  ws.updateDocumentDirty(doc.tabId)
})

eventBus.on('request-ai-dialogs', () => {
  //home -> ai-chat，主窗口请求AICHAT组件获取对话数据
  const doc = getDocument()
  if (!doc) return
  // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
  eventBus.emit('response-ai-dialogs', cloneDeep(doc.aiDialogs))
})

eventBus.on('response-ai-dialogs', (dialogs) => {
  const ws = getWorkspace()
  const doc = getDocument()
  if (!doc) return
  doc.aiDialogs = cloneDeep(dialogs)
  ws.updateDocumentDirty(doc.tabId)
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
    const doc = getWorkspace().activeDocument.value
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
    const ws = getWorkspace()
    const unsavedTabs = []

    for (const tab of ws.tabs) {
      if (tab.dirty) {
        const doc = ws.ensureDocument(tab.id)
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
    const ws = getWorkspace()
    const tab = ws.tabs.find((t) => t.id === tabId)
    if (!tab) {
      messageBridge.send('tab-info-response', null)
      return
    }

    const doc = ws.ensureDocument(tabId)
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
    const tab = getWorkspace().tabs.find(
      (t) => t.path === filePath && (t.kind === 'file' || t.kind === 'new')
    )
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
    const tab = getWorkspace().tabs.find((t) => {
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
    const ws = getWorkspace()
    const tab = ws.tabs.find((t) => t.id === tabId)
    if (tab) {
      ws.activateTab(tabId)
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

  const ws = getWorkspace()
  const existingTab = ws.tabs.find((tab) => tab.path === path)
  if (!existingTab) {
    return
  }
  if (existingTab.id === ws.activeTabId.value) {
    const doc = getDocument(existingTab.id)
    if (doc && doc.path !== path) {
      doc.path = path
      ws.markDocumentSaved(existingTab.id, path)
    }
  }
})

messageBridge.on('save-success', (_event, data = {}) => {
  const ws = getWorkspace()
  const doc = getDocument()
  if (doc) {
    ws.markDocumentSaved(doc.tabId, data.path ?? doc.path)
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
  const ws = getWorkspace()
  eventBus.emit('save-file-path', path)
  const doc = getDocument()
  if (!doc) return
  doc.path = path || ''
  ws.markDocumentSaved(doc.tabId, doc.path)
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
  eventBus.emit('save', { tabId: getWorkspace().activeTabId.value })
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
  try {
    const resolvedTabId = resolveTargetTabId(targetTabId)
    const doc = resolvedTabId ? getDocument(resolvedTabId) : null
    if (!doc) return
    // 不再在此路径中调用 sync-active-editor，与「保存全部」一致使用 workspace 内数据，避免单 tab 保存卡死

    // 在保存前标记为不脏（乐观更新），立即消除脏标记
    // 如果保存失败，会在后续流程中重新标记为脏（通过 updateDocumentDirty）
    // 但是，为了确保立即消除脏标记，我们在保存前就更新 savedMarkdown 等（但使用当前路径）
    // 这样脏标记会立即消除，markDocumentSaved 会在保存成功后再次确认（更新路径等）
    // 使用 markDocumentSaved 可以确保逻辑一致，但会立即消除脏标记
    const currentPath = doc.path
    getWorkspace().markDocumentSaved(resolvedTabId, currentPath)

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
// 监听 save 事件：优先使用 payload.tabId（调用方显式传入），否则用当前 activeTabId
// 与「保存全部」一致：对 file tab 直接走 workspace.saveDocument + invoke('workspace-save-document')，不经过 sync-active-editor 和 send('save')，避免单 tab 保存卡死
eventBus.on('save', async (payload) => {
  const ws = getWorkspace()
  const explicitTabId =
    payload && typeof payload === 'object' && typeof payload.tabId === 'string'
      ? payload.tabId
      : null
  const targetTabId = explicitTabId ?? ws.activeTabId.value
  const { mode, args } = normalizeSavePayload(payload)

  if (mode === 'auto-save') {
    const doc = getDocument(targetTabId)
    if (!doc || !doc.path) {
      return //如果尝试自动保存时，没有文件路径，则不进行自动保存
    }
  }

  const tab = ws.tabs.find((t) => t.id === targetTabId)
  if (tab && tab.kind === 'file') {
    const doc = getDocument(targetTabId)
    if (!doc) return
    try {
      await ws.saveDocument(targetTabId, { saveAs: !doc.path })
    } catch (err) {
      getLogger().warn('保存当前文档失败', err)
    }
    return
  }

  // new tab 或其它：走原有 save()（可能打开另存为对话框）
  await save('save', args, targetTabId)
})

eventBus.on('is-need-save', (msg) => {
  //console.log('is-need-save',msg)
  messageBridge.send('is-need-save', msg)
})

eventBus.on('save-and-quit', async () => {
  eventBus.emit('is-need-save', false)
  await save('save', undefined, getWorkspace().activeTabId.value)
  messageBridge.send('quit')
})

// 响应主进程请求保存特定tab
messageBridge.on('save-tab', async (_event, tabId) => {
  try {
    const result = await getWorkspace().saveDocument(tabId, { saveAs: false })
    messageBridge.send('save-tab-response', { tabId, success: result })
  } catch (error) {
    getLogger().error('保存tab失败:', error)
    messageBridge.send('save-tab-response', { tabId, success: false, error: error.message })
  }
})

// 响应主进程请求放弃特定tab的更改（直接关闭tab）
messageBridge.on('discard-tab', (_event, tabId) => {
  try {
    getWorkspace().removeTab(tabId)
    messageBridge.send('discard-tab-response', { tabId, success: true })
  } catch (error) {
    getLogger().error('关闭tab失败:', error)
    messageBridge.send('discard-tab-response', { tabId, success: false, error: error.message })
  }
})

// 响应主进程请求关闭所有剩余的tabs
messageBridge.on('close-all-tabs', () => {
  try {
    const ws = getWorkspace()
    const tabIds = ws.tabs.map((tab) => tab.id)
    for (const tabId of tabIds) {
      ws.removeTab(tabId)
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
    toast.success(
      i18n?.global?.t?.('leftMenu.exportAsTemplateSuccess', '已添加为模板，可在新建文档时选择') ??
        '已添加为模板'
    )
  } catch (e) {
    getLogger().error('export-as-template failed', e)
    toast.error(i18n?.global?.t?.('export.unknownError', '导出失败') ?? '导出失败')
  }
})

// 导出并发上限（无全局锁时允许多个任务同时进行，仅限制峰值）
let exportActiveCount = 0
const MAX_CONCURRENT_EXPORTS = 3

function isExportUserAbortError(error) {
  if (!error || typeof error !== 'object') return false
  if (error.name === 'AbortError') return true
  const msg = typeof error.message === 'string' ? error.message : ''
  return msg.includes('已取消') || msg.includes('操作已取消')
}

async function acquireExportSlot() {
  while (exportActiveCount >= MAX_CONCURRENT_EXPORTS) {
    await new Promise((r) => setTimeout(r, 80))
  }
  exportActiveCount += 1
}

function releaseExportSlot() {
  exportActiveCount = Math.max(0, exportActiveCount - 1)
}

eventBus.on('export', async (payload) => {
  const { format, filename, options, sourcePath: sourcePathArg } = payload || {}
  if (!format) return

  const opt = options || {}
  const presetTargetPath = opt.targetPath
  const sourcePath = sourcePathArg ?? opt.sourcePath
  const { targetPath: _tp, sourcePath: _sp, ...restOptions } = opt
  const exportOptions =
    restOptions && Object.keys(restOptions).length > 0 ? restOptions : undefined

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

  if (!presetTargetPath) setCursorWaiting()

  const handleDialogOpening = () => {
    restoreCursor()
  }
  messageBridge.on('export-dialog-opening', handleDialogOpening)

  await acquireExportSlot()

  const requestId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let notifId = null
  let notifStore = null

  try {
    const { resolveDocumentForExport } = await import('../services/export-document-resolver')
    const { useNotificationStore } = await import('../stores/notification')
    notifStore = useNotificationStore()

    const doc = await resolveDocumentForExport(sourcePath ?? null)
    if (!doc) {
      restoreCursor()
      messageBridge.removeListener('export-dialog-opening', handleDialogOpening)
      releaseExportSlot()
      return
    }

    const pathLabel = doc.path ? basename(doc.path) : filename || 'Untitled'
    const tg = i18n?.global?.t
    const taskTitle = tg ? tg('export.taskTitle') : '导出任务'
    const phasePick = tg ? tg('export.taskPhasePickPath') : '选择保存位置…'
    const phasePrep = tg ? tg('export.taskPhasePreparing') : '正在预处理…'
    const phaseDone = tg ? tg('export.taskPhaseDone') : '已完成'
    const phaseFail = tg ? tg('export.taskPhaseFailed') : '失败'

    notifId = notifStore.notify({
      title: taskTitle,
      message: presetTargetPath ? `${pathLabel} — ${phasePrep}` : `${pathLabel} — ${phasePick}`,
      type: 'info',
      showToast: false,
      duration: 86400000,
      metadata: {
        kind: 'export-task',
        requestId,
        targetFormat: format,
        fileLabel: pathLabel,
        phase: presetTargetPath ? 'prepare' : 'pick',
        canCancel: Boolean(presetTargetPath)
      }
    })
    // 导出任务通知已入队：显式露出通知堆叠（不依赖对数组原地 unshift 的 watch 是否触发）
    eventBus.emit('show-notification-stack-export')

    let targetPath = presetTargetPath
    if (!targetPath) {
      const pick = await messageBridge.invoke('pick-export-save-path', {
        suggestedName: filename || pathLabel || 'Untitled',
        targetFormat: format
      })
      if (pick.canceled || !pick.path) {
        if (notifId) notifStore.remove(notifId)
        restoreCursor()
        messageBridge.removeListener('export-dialog-opening', handleDialogOpening)
        releaseExportSlot()
        return
      }
      targetPath = pick.path
    }

    if (notifId) {
      notifStore.updateNotification(notifId, {
        message: `${pathLabel} — ${phasePrep}`,
        metadata: { phase: 'prepare', canCancel: true }
      })
    }

    const payloadPrepared = await prepareExportPayload(
      doc,
      format,
      filename,
      exportOptions,
      { requestId }
    )
    const result = await messageBridge.invoke('perform-export-to-path', payloadPrepared, targetPath)

    if (!result.success && !result.error) {
      if (payloadPrepared.requestId) {
        try {
          await messageBridge.invoke('cancel-export-task', payloadPrepared.requestId)
        } catch (err) {
          // ignore
        }
      }
    }

    if (notifId) {
      if (result.success) {
        notifStore.updateNotification(notifId, {
          type: 'success',
          message: `${pathLabel} — ${phaseDone}`,
          metadata: { phase: 'done', canCancel: false }
        })
        setTimeout(() => notifStore.remove(notifId), 6000)
      } else if (result.error) {
        notifStore.updateNotification(notifId, {
          type: 'error',
          message: `${pathLabel} — ${phaseFail}: ${result.error}`,
          metadata: { phase: 'error', canCancel: false }
        })
      } else {
        notifStore.remove(notifId)
      }
    }

    restoreCursor()
  } catch (error) {
    restoreCursor()
    if (isExportUserAbortError(error)) {
      if (notifId && notifStore) {
        notifStore.remove(notifId)
      }
      getLogger().debug('导出已由用户中断')
    } else {
      if (notifId && notifStore) {
        const pathLabel = filename || 'Untitled'
        const phaseFail = i18n?.global?.t?.('export.taskPhaseFailed', '失败') ?? '失败'
        const msg =
          error instanceof Error
            ? error.message
            : i18n?.global?.t?.('export.unknownError', '导出失败') ?? '导出失败'
        notifStore.updateNotification(notifId, {
          type: 'error',
          message: `${pathLabel} — ${phaseFail}: ${msg}`,
          metadata: { phase: 'error', canCancel: false }
        })
      }
      if (error instanceof NotImplementedExportError) {
        const message =
          i18n?.global?.t?.('export.notImplemented', '该导出组合尚未实现') ?? '该导出功能尚未实现'
        toast.error(message)
        getLogger().warn(error.message)
      } else {
        const message =
          error instanceof Error
            ? error.message
            : i18n?.global?.t?.('export.unknownError', '导出失败')
        toast.error(message)
        getLogger().error('导出失败', error)
      }
    }
  } finally {
    messageBridge.removeListener('export-dialog-opening', handleDialogOpening)
    releaseExportSlot()
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
