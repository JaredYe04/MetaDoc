/**
 * 解析用于导出的 WorkspaceDocument：优先使用已打开且未保存的内存内容，否则从磁盘读取。
 */
import messageBridge from '../bridge/message-bridge'
import type { WorkspaceDocument } from '../stores/workspace'
import { useWorkspace } from '../stores/workspace'
import { formatRegistry } from '../utils/editor/format-registry'
import { extname, basename } from '../utils/path-utils'
import type { DocumentFormat } from '../../../types'
import type { DocumentOutlineNode } from '../../../types'
import { isExportImagePath, loadImageFileAsMarkdownImage } from './export-path-utils'

const EMPTY_OUTLINE: DocumentOutlineNode = {
  path: 'dummy',
  title: '',
  text: '',
  title_level: 0,
  children: []
}

const emptyMeta = () => ({
  title: '',
  author: '',
  description: '',
  keywords: [] as string[]
})

/** 根据路径得到导出用的源格式（与 LeftMenu / export-rules 一致） */
export function getExportSourceFormatForPath(filePath: string): DocumentFormat | null {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.md' || ext === '.markdown' || ext === '.mdown') return 'md'
  if (ext === '.tex' || ext === '.latex') return 'tex'
  const id = formatRegistry.getFormatByExtension(ext)
  if (id === 'md') return 'md'
  if (id === 'tex') return 'tex'
  // 其余在编辑器中按纯文本处理的（含代码、json、html 等）走 txt 导出链
  return 'txt'
}

function buildEphemeralDocument(
  filePath: string,
  format: DocumentFormat,
  content: string
): WorkspaceDocument {
  const isTex = format === 'tex'
  const baseName = basename(filePath)
  return {
    id: `export-ephemeral-${filePath}`,
    tabId: `export-ephemeral-${filePath}`,
    path: filePath,
    format,
    markdown: isTex ? '' : content,
    tex: isTex ? content : '',
    outline: EMPTY_OUTLINE,
    meta: { ...emptyMeta(), title: baseName },
    aiDialogs: [],
    agentSessions: [],
    lastView: 'editor',
    renderedHtml: '',
    dirty: false,
    savedMarkdown: isTex ? '' : content,
    savedTex: isTex ? content : '',
    savedOutline: EMPTY_OUTLINE,
    savedMeta: { ...emptyMeta(), title: baseName },
    savedAiDialogs: [],
    savedAgentSessions: []
  }
}

/**
 * @param sourcePath 若提供则从该文件解析；否则使用当前活动标签文档
 */
export async function resolveDocumentForExport(sourcePath?: string | null): Promise<WorkspaceDocument | null> {
  const workspace = useWorkspace()

  if (sourcePath && sourcePath.trim()) {
    const pathNorm = sourcePath.trim()
    const tab = workspace.tabs.find((t) => t.kind === 'file' && t.path && t.path === pathNorm)
    if (tab) {
      try {
        return workspace.ensureDocument(tab.id)
      } catch {
        // fall through to disk
      }
    }

    const format = getExportSourceFormatForPath(pathNorm)
    if (!format) return null

    if (isExportImagePath(pathNorm)) {
      const md = await loadImageFileAsMarkdownImage(pathNorm, (p) =>
        messageBridge.invoke('read-file-for-upload', p)
      )
      if (md == null) return null
      return buildEphemeralDocument(pathNorm, 'txt', md)
    }

    const raw = (await messageBridge.invoke('read-file-content', pathNorm)) as string | null
    if (raw == null) return null
    return buildEphemeralDocument(pathNorm, format, raw)
  }

  const activeId = workspace.activeTabId.value
  if (!activeId) return null
  try {
    const doc = workspace.ensureDocument(activeId)
    const p = doc.path
    // 与路径扩展名一致即可：活动标签可能登记为非 txt，仍应按图片读二进制而非当文本解码
    if (p && isExportImagePath(p)) {
      const md = await loadImageFileAsMarkdownImage(p, (path) =>
        messageBridge.invoke('read-file-for-upload', path)
      )
      if (md != null) {
        return buildEphemeralDocument(p, 'txt', md)
      }
    }
    return doc
  } catch {
    return null
  }
}
