/**
 * Markdown 正文内本地/相对链接：在工作区内打开或聚焦已有标签页
 */
import messageBridge from '../bridge/message-bridge'
import eventBus from './event-bus'
import { i18n } from '../i18n'
import { extname } from './path-utils.js'
import { formatRegistry } from './format-registry'
import { resolvePathWithLinkBase, isAbsolutePath } from './path-resolver'
import { notifyWarning } from './notify'
import type { DocumentView } from '../stores/workspace'

const WORKSPACE_FOLDERS_STORAGE_KEY = 'workspaceFolders'

export function normalizeWorkspacePathCompare(p: string): string {
  return (p || '').replace(/\\/g, '/')
}

function getWorkspaceRootsFromStorage(): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(WORKSPACE_FOLDERS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0)
  } catch {
    return []
  }
}

/** 已配置工作区文件夹时，仅允许打开位于这些根之下的路径；未配置时不限制 */
export function isPathUnderConfiguredWorkspaceRoots(absolutePath: string): boolean {
  const roots = getWorkspaceRootsFromStorage()
  if (roots.length === 0) return true
  const norm = normalizeWorkspacePathCompare(absolutePath).toLowerCase().replace(/\/+$/, '')
  for (const root of roots) {
    const r = normalizeWorkspacePathCompare(root).toLowerCase().replace(/\/+$/, '')
    if (!r) continue
    if (norm === r || norm.startsWith(`${r}/`)) return true
  }
  return false
}

function stripQuery(pathPart: string): string {
  const q = pathPart.indexOf('?')
  return q >= 0 ? pathPart.slice(0, q) : pathPart
}

function tryDecodeUri(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

function fileUrlToFsPath(raw: string): string {
  let s = raw.replace(/^file:\/\//i, '')
  if (s.startsWith('/') && /^\/[A-Za-z]:/.test(s)) {
    s = s.slice(1)
  }
  return tryDecodeUri(s).replace(/\\/g, '/')
}

export function parseMarkdownLinkHref(rawHref: string): { pathPart: string; hash: string } {
  const decoded = tryDecodeUri(rawHref.trim())
  const hashIdx = decoded.indexOf('#')
  const withPossibleQuery = hashIdx >= 0 ? decoded.slice(0, hashIdx) : decoded
  const hash = hashIdx >= 0 ? decoded.slice(hashIdx + 1) : ''
  return { pathPart: stripQuery(withPossibleQuery).trim(), hash }
}

/** 是否应由工作区接管（非 http(s)/mailto 等外链） */
export function shouldDelegateMarkdownWorkspaceLink(hrefAttr: string): boolean {
  const h = hrefAttr.trim()
  if (!h) return false
  const lower = h.toLowerCase()
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:')
  ) {
    return false
  }
  if (lower.startsWith('mailto:') || lower.startsWith('tel:')) return false
  if (lower.startsWith('http://') || lower.startsWith('https://')) return false
  // 协议相对 URL 交给浏览器默认行为
  if (h.startsWith('//')) return false
  return true
}

function resolveHrefToAbsolutePath(pathPart: string, linkBase: string): string | null {
  if (!pathPart) return null

  if (/^file:\/\//i.test(pathPart)) {
    return fileUrlToFsPath(pathPart)
  }

  if (isAbsolutePath(pathPart)) {
    return pathPart
  }

  const base = linkBase || ''
  if (!base) {
    notifyWarning(i18n.global.t('markdownEditor.workspaceLink.needsSavedDoc'))
    return null
  }

  return resolvePathWithLinkBase(pathPart, base)
}

export type MarkdownWorkspaceLinkResult = 'handled' | 'skipped'

export async function openMarkdownWorkspaceLink(options: {
  rawHref: string
  linkBase: string
  tabs: readonly { id: string; path?: string; kind?: string; preview?: boolean }[]
  activateTab: (id: string) => void
  /** 目标已在预览 Tab 中打开时，升为正式 Tab */
  pinTab?: (tabId: string) => void
  updateDocumentLastView?: (tabId: string, view: DocumentView) => void
}): Promise<MarkdownWorkspaceLinkResult> {
  const { rawHref, linkBase, tabs, activateTab, pinTab, updateDocumentLastView } = options

  if (!shouldDelegateMarkdownWorkspaceLink(rawHref)) {
    return 'skipped'
  }

  const { pathPart } = parseMarkdownLinkHref(rawHref)
  if (!pathPart) {
    return 'skipped'
  }

  const absolute = resolveHrefToAbsolutePath(pathPart, linkBase)
  if (absolute === null) {
    return 'handled'
  }

  if (!isPathUnderConfiguredWorkspaceRoots(absolute)) {
    return 'skipped'
  }

  const normalizedTarget = normalizeWorkspacePathCompare(absolute)

  const existing = tabs.find(
    (tab) =>
      (tab.kind === 'file' || tab.kind === 'new') &&
      tab.path &&
      normalizeWorkspacePathCompare(tab.path) === normalizedTarget
  )

  if (existing) {
    activateTab(existing.id)
    if (existing.preview) {
      pinTab?.(existing.id)
    }
    updateDocumentLastView?.(existing.id, 'editor')
    return 'handled'
  }

  const ipc = messageBridge.getIpc()
  if (!ipc?.invoke) {
    return 'skipped'
  }

  const exists = (await messageBridge.invoke('file-exists', absolute)) === true
  if (!exists) {
    return 'handled'
  }

  const isDir = (await messageBridge.invoke('check-path-is-directory', absolute)) === true
  if (isDir) {
    return 'handled'
  }

  const ext = extname(absolute)
  const formatId = formatRegistry.getFormatByExtension(ext) || 'txt'

  eventBus.emit('workspace-open-document', {
    path: absolute,
    format: formatId,
    preview: false,
    workspacePlacement: 'top'
  })

  return 'handled'
}
