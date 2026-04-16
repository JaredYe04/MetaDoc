import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { appStore } from '../app-store'
import { createMainLogger } from '../logger'

const logger = createMainLogger('UserTemplatesStore')

const STORE_KEY = 'metadocUserTemplates'

export type UserTemplateThumbnailSource = 'none' | 'custom' | 'generated'

export interface UserTemplateStoredRecord {
  id: string
  formatId: string
  locale: string
  title: string
  description: string
  content: string
  /** 相对 userData/template-thumbs 的文件名，如 abc.png */
  thumbnailFile?: string
  thumbnailSource?: UserTemplateThumbnailSource
}

function thumbsDir(): string {
  return path.join(app.getPath('userData'), 'template-thumbs')
}

function ensureThumbsDir(): void {
  try {
    fs.mkdirSync(thumbsDir(), { recursive: true })
  } catch (e) {
    logger.warn('ensureThumbsDir failed', e)
  }
}

function readList(): UserTemplateStoredRecord[] {
  const raw = appStore.get(STORE_KEY) as unknown
  if (!Array.isArray(raw)) return []
  return raw.filter(isValidRecord)
}

function writeList(list: UserTemplateStoredRecord[]): void {
  appStore.set(STORE_KEY, list)
}

function isValidRecord(t: unknown): t is UserTemplateStoredRecord {
  if (!t || typeof t !== 'object') return false
  const o = t as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.formatId === 'string' &&
    typeof o.locale === 'string' &&
    typeof o.title === 'string' &&
    typeof o.description === 'string' &&
    typeof o.content === 'string'
  )
}

export function listUserTemplates(): UserTemplateStoredRecord[] {
  return readList()
}

export function addUserTemplate(
  rec: Omit<UserTemplateStoredRecord, 'id'> & { id?: string }
): UserTemplateStoredRecord {
  const id =
    rec.id && rec.id.length > 0
      ? rec.id
      : 'user-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
  const full: UserTemplateStoredRecord = {
    id,
    formatId: rec.formatId,
    locale: rec.locale,
    title: rec.title.trim() || '未命名模板',
    description: (rec.description || '').trim(),
    content: rec.content,
    thumbnailFile: rec.thumbnailFile,
    thumbnailSource: rec.thumbnailSource ?? 'none'
  }
  const list = readList()
  writeList([...list, full])
  return full
}

export function removeUserTemplate(id: string): void {
  const list = readList()
  const rec = list.find((t) => t.id === id)
  if (rec?.thumbnailFile) {
    const p = path.join(thumbsDir(), path.basename(rec.thumbnailFile))
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p)
    } catch {
      /* ignore */
    }
  }
  writeList(list.filter((t) => t.id !== id))
}

export function updateUserTemplate(
  id: string,
  partial: Partial<
    Pick<
      UserTemplateStoredRecord,
      | 'title'
      | 'description'
      | 'content'
      | 'formatId'
      | 'locale'
      | 'thumbnailFile'
      | 'thumbnailSource'
    >
  >
): UserTemplateStoredRecord | null {
  const list = readList()
  const i = list.findIndex((t) => t.id === id)
  if (i < 0) return null
  const cur = { ...list[i], ...partial }
  if (typeof partial.title === 'string') {
    cur.title = partial.title.trim() || cur.title
  }
  const next = [...list]
  next[i] = cur
  writeList(next)
  return cur
}

const MAX_THUMB_BYTES = 2 * 1024 * 1024

function detectImageFormat(buffer: Buffer): { ext: string; mime: string } {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' }
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' }
  }
  if (buffer.length >= 6 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return { ext: 'gif', mime: 'image/gif' }
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { ext: 'png', mime: 'image/png' }
  }
  return { ext: 'png', mime: 'image/png' }
}

/** 将自定义缩略图写入磁盘并更新记录（buffer 为常见位图原始字节） */
export function setUserTemplateThumbnailCustom(
  id: string,
  buffer: Buffer
): UserTemplateStoredRecord | null {
  if (!readList().find((t) => t.id === id)) {
    logger.warn('setUserTemplateThumbnailCustom: unknown template id', id)
    return null
  }
  if (buffer.length > MAX_THUMB_BYTES) {
    logger.warn('thumbnail too large', buffer.length)
    return null
  }
  ensureThumbsDir()
  const { ext } = detectImageFormat(buffer)
  const file = `${id}.${ext}`
  const dest = path.join(thumbsDir(), file)
  try {
    fs.writeFileSync(dest, buffer)
  } catch (e) {
    logger.warn('write thumbnail failed', e)
    return null
  }
  return updateUserTemplate(id, {
    thumbnailFile: file,
    thumbnailSource: 'custom'
  })
}

/** 生成占位缩略图：写入简单 PNG（1x1 扩展为后续可接预览管线） */
export function setUserTemplateThumbnailGenerated(
  id: string,
  buffer: Buffer
): UserTemplateStoredRecord | null {
  ensureThumbsDir()
  const file = `${id}-gen.png`
  const dest = path.join(thumbsDir(), file)
  try {
    fs.writeFileSync(dest, buffer.length ? buffer : minimalPng())
  } catch (e) {
    logger.warn('write generated thumb failed', e)
    return null
  }
  return updateUserTemplate(id, {
    thumbnailFile: file,
    thumbnailSource: 'generated'
  })
}

function minimalPng(): Buffer {
  /** 1x1 透明 PNG */
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
}

export function readThumbnailFile(rel: string): Buffer | null {
  const safe = path.basename(rel)
  const p = path.join(thumbsDir(), safe)
  try {
    if (!fs.existsSync(p)) return null
    return fs.readFileSync(p)
  } catch {
    return null
  }
}

export function mimeForImageBuffer(buf: Buffer): string {
  return detectImageFormat(buf).mime
}

export function getUserTemplateById(id: string): UserTemplateStoredRecord | undefined {
  return readList().find((t) => t.id === id)
}

export function clearUserTemplateThumbnail(id: string): UserTemplateStoredRecord | null {
  const rec = getUserTemplateById(id)
  if (!rec) return null
  if (rec.thumbnailFile) {
    const p = path.join(thumbsDir(), path.basename(rec.thumbnailFile))
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p)
    } catch {
      /* ignore */
    }
  }
  return updateUserTemplate(id, { thumbnailFile: undefined, thumbnailSource: 'none' })
}

export function replaceAllUserTemplatesFromCloud(list: UserTemplateStoredRecord[]): void {
  writeList(
    list.map((t) => ({
      ...t,
      thumbnailFile: t.thumbnailFile ? path.basename(t.thumbnailFile) : undefined
    }))
  )
}

export type UserTemplateCloudExport = UserTemplateStoredRecord & {
  thumbnailBase64?: string
  thumbnailMime?: string
}

/** 从 Steam 云拉取的条目写入 store（可选内联 base64 缩略图） */
export function importUserTemplatesFromCloudPayload(templates: UserTemplateCloudExport[]): void {
  const list: UserTemplateStoredRecord[] = []
  for (const t of templates) {
    const { thumbnailBase64, thumbnailMime, ...rest } = t
    let thumbnailFile = rest.thumbnailFile ? path.basename(rest.thumbnailFile) : undefined
    if (thumbnailBase64 && typeof thumbnailBase64 === 'string') {
      try {
        const buf = Buffer.from(thumbnailBase64, 'base64')
        if (buf.length > 0 && buf.length <= MAX_THUMB_BYTES) {
          ensureThumbsDir()
          const ext =
            typeof thumbnailMime === 'string' && thumbnailMime.includes('jpeg') ? 'jpg' : 'png'
          const file = `${rest.id}-cloud.${ext}`
          fs.writeFileSync(path.join(thumbsDir(), file), buf)
          thumbnailFile = file
        }
      } catch (e) {
        logger.warn('import thumb from cloud failed', e)
      }
    }
    list.push({
      id: rest.id,
      formatId: rest.formatId,
      locale: rest.locale,
      title: rest.title,
      description: rest.description,
      content: rest.content,
      thumbnailFile,
      thumbnailSource: thumbnailFile ? (rest.thumbnailSource ?? 'custom') : 'none'
    })
  }
  writeList(list)
}

export function exportUserTemplatesForCloud(): UserTemplateCloudExport[] {
  const out: UserTemplateCloudExport[] = []
  for (const t of readList()) {
    const { thumbnailFile, ...rest } = t
    const row: UserTemplateCloudExport = { ...rest }
    if (thumbnailFile) {
      const buf = readThumbnailFile(thumbnailFile)
      if (buf && buf.length > 0 && buf.length <= MAX_THUMB_BYTES) {
        row.thumbnailBase64 = buf.toString('base64')
        row.thumbnailMime = buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : 'image/png'
      }
    }
    out.push(row)
  }
  return out
}
