import { serializeDocument } from './document-serializer'
import type { WorkspaceDocument } from '../stores/workspace'
import messageBridge from '../bridge/message-bridge'
import { extractTitleFromContent, sanitizeTitleForFilename } from '../utils/title-extractor'
import { notifyWarning } from '../utils/notify'

type SaveResult = {
  path: string
  format: string
} | null

const USERDATA_META_WARN_KEY = 'metadoc-warned-metadata-userdata'

export const saveWorkspaceDocument = async (
  doc: WorkspaceDocument,
  options?: { saveAs?: boolean }
): Promise<SaveResult> => {
  if (!messageBridge.getIpc()?.invoke) {
    console.warn('[DocumentSave] IPC 不可用，跳过保存')
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
  const result = await messageBridge.invoke('workspace-save-document', {
    data: payload,
    saveAs: options?.saveAs ?? doc.path === ''
  })

  if (!result || typeof result !== 'object') {
    return null
  }

  const { path, format, metadataStorage } = result as {
    path?: string
    format?: string
    metadataStorage?: 'workspace' | 'userData'
  }
  if (!path) {
    return null
  }

  if (
    metadataStorage === 'userData' &&
    typeof sessionStorage !== 'undefined' &&
    !sessionStorage.getItem(USERDATA_META_WARN_KEY)
  ) {
    sessionStorage.setItem(USERDATA_META_WARN_KEY, '1')
    notifyWarning(
      '文档元数据已保存到应用数据目录（当前文件不在已添加的工作区文件夹内）。将文件所在文件夹加入侧栏工作区后，元数据会写入该项目下的 .metadoc 目录。',
      { duration: 8000 }
    )
  }

  return {
    path,
    format: format ?? doc.format
  }
}
