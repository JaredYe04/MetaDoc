/**
 * 工作区级 Agent 会话磁盘布局（v2）：
 * - sessions-index.json：轻量索引（激活会话、打开 tab、composer 草稿、条目顺序与摘要）
 * - sessions/<id>.msess：单会话二进制，**仅 0x00 + msgpack**（不用 zstd；与文档 Sidecar 写入策略不同）
 *
 * 旧版单文件 sessions.json 在首次加载时自动迁移并改名为备份。
 */

import { encode } from '@msgpack/msgpack'
import messageBridge from '../bridge/message-bridge'
import { deserializeMetadataFromBuffer } from './metadata-sidecar'
import { createRendererLogger } from './logger'

const logger = createRendererLogger('AgentWorkspacePersistence')

export const REL_SESSION_INDEX = '.metadoc/agent/sessions-index.json'
export const REL_SESSIONS_DIR = '.metadoc/agent/sessions'
export const REL_LEGACY_SESSIONS_JSON = '.metadoc/agent/sessions.json'
export const SESSION_BLOB_EXT = '.msess'

export function joinUnderWorkspaceRoot(root: string, rel: string): string {
  const n = (root || '').replace(/\\/g, '/').replace(/\/$/, '')
  return `${n}/${rel.replace(/^\//, '')}`
}

/**
 * Agent 会话 blob：固定为 0x00 前缀 + msgpack（不经过 Sidecar 的 zstd 分支）
 */
export function serializeAgentSessionToBuffer(sessionPayload: unknown): Uint8Array {
  const packed = encode(sessionPayload)
  const result = new Uint8Array(packed.length + 1)
  result[0] = 0x00
  result.set(packed, 1)
  return result
}

export function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK)
    binary += String.fromCharCode.apply(null, slice as unknown as number[])
  }
  return btoa(binary)
}

export interface AgentSessionIndexEntryV2 {
  id: string
  title: string
  updatedAt: string
}

export interface AgentSessionIndexFileV2 {
  formatVersion: 2
  activeSessionId: string | null
  openTabIds?: string[]
  composerInputBySessionId?: Record<string, string>
  entries: AgentSessionIndexEntryV2[]
}

/** 旧版 sessions.json 顶层结构（迁移用） */
export interface LegacyAgentSessionsJson {
  activeSessionId: string | null
  sessions: unknown[]
  openTabIds?: string[]
  composerInputBySessionId?: Record<string, string>
}

export function sessionBlobRelativePath(sessionId: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(sessionId)) {
    throw new Error(`非法会话 id，无法安全映射为文件名: ${sessionId}`)
  }
  return `${REL_SESSIONS_DIR}/${sessionId}${SESSION_BLOB_EXT}`
}

async function readBinaryFileRaw(filePath: string): Promise<Uint8Array | null> {
  const buf = await messageBridge.invoke('read-file-buffer', filePath)
  if (buf == null) return null
  if (buf instanceof Uint8Array) return buf
  if (Array.isArray(buf)) return new Uint8Array(buf)
  return new Uint8Array(buf as ArrayBuffer)
}

export async function writeBinaryFile(filePath: string, data: Uint8Array): Promise<void> {
  const b64 = uint8ToBase64(data)
  await messageBridge.invoke('write-file-content', {
    filePath,
    content: b64,
    encoding: 'base64'
  })
}

export async function unlinkQuietIfExists(filePath: string): Promise<void> {
  await messageBridge.invoke('unlink-file-if-exists', filePath)
}

export async function fileExists(filePath: string): Promise<boolean> {
  return (await messageBridge.invoke('file-exists', filePath)) === true
}

export async function loadIndexV2(root: string): Promise<AgentSessionIndexFileV2 | null> {
  const path = joinUnderWorkspaceRoot(root, REL_SESSION_INDEX)
  const text = await messageBridge.invoke('read-file-content', path)
  if (!text || typeof text !== 'string') return null
  try {
    const data = JSON.parse(text) as AgentSessionIndexFileV2
    if (data?.formatVersion !== 2 || !Array.isArray(data.entries)) return null
    return data
  } catch {
    return null
  }
}

export async function loadLegacySessionsJson(
  root: string
): Promise<LegacyAgentSessionsJson | null> {
  const path = joinUnderWorkspaceRoot(root, REL_LEGACY_SESSIONS_JSON)
  const text = await messageBridge.invoke('read-file-content', path)
  if (!text || typeof text !== 'string') return null
  try {
    const data = JSON.parse(text) as LegacyAgentSessionsJson
    if (!data || typeof data !== 'object' || !Array.isArray(data.sessions)) return null
    return data
  } catch {
    return null
  }
}

/**
 * 从二进制文件反序列化单条会话对象（紧凑持久化形态，与旧 JSON 中单条结构一致）
 */
export async function deserializeSessionBlob(filePath: string): Promise<unknown | null> {
  const raw = await readBinaryFileRaw(filePath)
  if (!raw || raw.length === 0) return null
  try {
    return await deserializeMetadataFromBuffer(raw)
  } catch (e) {
    logger.warn('反序列化会话 blob 失败', { filePath, error: e })
    return null
  }
}

export async function writeSessionV2Layout(
  root: string,
  index: AgentSessionIndexFileV2,
  sessionBlobs: Array<{ sessionId: string; compact: unknown }>
): Promise<void> {
  const indexPath = joinUnderWorkspaceRoot(root, REL_SESSION_INDEX)
  await messageBridge.invoke('write-file-content', {
    filePath: indexPath,
    content: JSON.stringify(index, null, 2)
  })
  for (const { sessionId, compact } of sessionBlobs) {
    const rel = sessionBlobRelativePath(sessionId)
    const full = joinUnderWorkspaceRoot(root, rel)
    const buf = serializeAgentSessionToBuffer(compact)
    await writeBinaryFile(full, buf)
  }
}

/** 迁移完成后将旧 JSON 改名为备份，避免再次误读 */
export async function renameLegacySessionsJsonBackup(root: string): Promise<void> {
  const oldPath = joinUnderWorkspaceRoot(root, REL_LEGACY_SESSIONS_JSON)
  const exists = await fileExists(oldPath)
  if (!exists) return
  const stamp = Date.now()
  await messageBridge.invoke('rename-file-or-folder', {
    oldPath,
    newName: `sessions.json.legacy.${stamp}.bak`
  })
}

/**
 * 删除 sessions 目录下不再属于当前会话列表的 .msess 文件
 */
export async function pruneOrphanSessionBlobs(root: string, validIds: Set<string>): Promise<void> {
  const dir = joinUnderWorkspaceRoot(root, REL_SESSIONS_DIR)
  if (!(await fileExists(dir))) return
  let entries: Array<{ name: string; path: string; isDirectory: boolean }>
  try {
    entries = await messageBridge.invoke('read-directory', dir)
  } catch {
    return
  }
  for (const e of entries) {
    if (e.isDirectory) continue
    if (!e.name.endsWith(SESSION_BLOB_EXT)) continue
    const id = e.name.slice(0, -SESSION_BLOB_EXT.length)
    if (validIds.has(id)) continue
    try {
      await unlinkQuietIfExists(e.path)
    } catch (err) {
      logger.warn('清理孤儿会话文件失败', { path: e.path, err })
    }
  }
}
