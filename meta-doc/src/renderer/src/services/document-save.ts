import { serializeDocument } from './document-serializer'
import type { WorkspaceDocument } from '../stores/workspace'
import localIpcRenderer from '../utils/web-adapter/local-ipc-renderer'
import { webMainCalls } from '../utils/web-adapter/web-main-calls.js'
import { extractTitleFromContent, sanitizeTitleForFilename } from '../utils/title-extractor'

type SaveResult = {
  path: string
  format: string
} | null

const resolveIpcRenderer = (): any => {
  if (typeof window !== 'undefined') {
    if (window.electron?.ipcRenderer) {
      return window.electron.ipcRenderer
    }
    try {
      webMainCalls()
    } catch (error) {
      console.warn('[DocumentSave] 初始化 webMainCalls 失败', error)
    }
    return localIpcRenderer
  }
  return null
}

export const saveWorkspaceDocument = async (
  doc: WorkspaceDocument,
  options?: { saveAs?: boolean }
): Promise<SaveResult> => {
  const ipcRenderer: any = resolveIpcRenderer()
  if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
    console.warn('[DocumentSave] ipcRenderer 不可用，跳过保存')
    return null
  }

  // 在保存前，如果元信息标题为空（特别是第一次保存时），尝试从内容中提取标题
  if (!doc.meta?.title || doc.meta.title.trim().length === 0) {
    const content = doc.format === 'tex' ? (doc.tex ?? '') : (doc.markdown ?? '')
    const extractedTitle = extractTitleFromContent(content, doc.format)

    if (extractedTitle) {
      const sanitizedTitle = sanitizeTitleForFilename(extractedTitle)
      if (sanitizedTitle) {
        // 更新文档的元信息标题
        doc.meta = { ...doc.meta, title: sanitizedTitle }
      }
    }
  }

  const payload = await serializeDocument(doc)

  // 确保保存操作完全完成（包括Sidecar文件写入）
  // workspace-save-document 是同步的，会等待所有文件写入完成（包括fsync）
  const result = await ipcRenderer.invoke('workspace-save-document', {
    data: payload,
    saveAs: options?.saveAs ?? doc.path === ''
  })

  if (!result || typeof result !== 'object') {
    return null
  }

  const { path, format } = result as { path?: string; format?: string }
  if (!path) {
    return null
  }

  // 保存操作已完成，包括Sidecar文件（如果使用sidecar模式）
  // fsync确保数据已写入磁盘
  return {
    path,
    format: format ?? doc.format
  }
}
