/**
 * 文档元数据（文章 meta + Agent 会话等）落盘路径：`<storageRoot>/.metadoc/doc-meta/<sha256>.meta`
 * storageRoot 为包含文档的最长 workspace 根，否则为 userData。
 */

import path from 'node:path'
import { createHash } from 'node:crypto'
import { app } from 'electron'

/** 相对 workspace 根目录的元数据目录 */
export const DOCUMENT_META_DIR_SEGMENTS = ['.metadoc', 'doc-meta'] as const

/** 文档不在任何 workspace 根下时，使用 userData 下子目录 */
export const FALLBACK_DOCUMENT_META_DIR = 'document-metadata'

export function normalizeComparablePath(p: string): string {
  return path
    .normalize(p || '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
}

/**
 * 返回包含 docPath 的 workspace 根（绝对路径），取最长前缀匹配；无则 null。
 */
export function longestWorkspaceRootContainingDoc(
  docPath: string,
  workspaceFolders: string[]
): string | null {
  const normDoc = normalizeComparablePath(path.resolve(docPath))
  let best: string | null = null
  let bestLen = -1
  for (const raw of workspaceFolders) {
    if (!raw || typeof raw !== 'string') continue
    const absRoot = path.resolve(raw.trim())
    const normRoot = normalizeComparablePath(absRoot)
    const under = normDoc === normRoot || normDoc.startsWith(`${normRoot}/`)
    if (under && normRoot.length > bestLen) {
      bestLen = normRoot.length
      best = absRoot
    }
  }
  return best
}

export function hashDocPathForMetaKey(docPath: string): string {
  const key = normalizeComparablePath(path.resolve(docPath))
  return createHash('sha256').update(key, 'utf8').digest('hex')
}

export type DocumentMetadataStorageKind = 'workspace' | 'userData'

/**
 * 解析文档元数据文件的绝对路径；若使用 userData 则 storage 为 userData。
 */
export function resolveDocumentMetadataAbsolutePath(
  docPath: string,
  workspaceFolders: string[] | undefined
): { absolutePath: string; storage: DocumentMetadataStorageKind } {
  const folders = Array.isArray(workspaceFolders) ? workspaceFolders : []
  const hex = hashDocPathForMetaKey(docPath)
  const fileName = `${hex}.meta`
  const root = longestWorkspaceRootContainingDoc(docPath, folders)
  if (root) {
    return {
      absolutePath: path.join(root, ...DOCUMENT_META_DIR_SEGMENTS, fileName),
      storage: 'workspace'
    }
  }
  return {
    absolutePath: path.join(app.getPath('userData'), FALLBACK_DOCUMENT_META_DIR, fileName),
    storage: 'userData'
  }
}
