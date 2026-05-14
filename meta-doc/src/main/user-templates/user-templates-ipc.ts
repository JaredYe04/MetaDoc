import fs from 'fs'
import { ipcBridge } from '../bridge/ipc-bridge'
import type { IpcMainInvokeEvent } from 'electron'
import {
  addUserTemplate,
  clearUserTemplateThumbnail,
  getUserTemplateById,
  listUserTemplates,
  readThumbnailFile,
  removeUserTemplate,
  setUserTemplateThumbnailCustom,
  setUserTemplateThumbnailGenerated,
  type UserTemplateStoredRecord,
  updateUserTemplate,
  mimeForImageBuffer
} from './user-templates-store'
import { schedulePushUserTemplatesToCloudIfSteamReady } from '@metadoc/user-templates-steam-push'

type Ok<T = unknown> = { ok: true; data?: T }
type Fail = { ok: false; error: string }

function ok<T>(data?: T): Ok<T> {
  return data !== undefined ? { ok: true, data } : { ok: true }
}

function fail(msg: string): Fail {
  return { ok: false, error: msg }
}

function parseDataUrlOrBase64(s: string): Buffer | null {
  const m = /^data:image\/\w+;base64,(.+)$/i.exec(s.trim())
  const b64 = m ? m[1] : s.trim()
  try {
    return Buffer.from(b64, 'base64')
  } catch {
    return null
  }
}

export function registerUserTemplatesIpc(): void {
  ipcBridge.registerHandle('user-templates:list', (): Ok<UserTemplateStoredRecord[]> => {
    return ok(listUserTemplates())
  })

  ipcBridge.registerHandle(
    'user-templates:add',
    (_e: IpcMainInvokeEvent, payload: unknown): Ok<UserTemplateStoredRecord> | Fail => {
      const p = (
        payload && typeof payload === 'object' ? payload : {}
      ) as Partial<UserTemplateStoredRecord>
      if (!p.formatId || !p.locale || typeof p.content !== 'string') {
        return fail('invalid_payload')
      }
      const rec = addUserTemplate({
        formatId: String(p.formatId),
        locale: String(p.locale),
        title: typeof p.title === 'string' ? p.title : '',
        description: typeof p.description === 'string' ? p.description : '',
        content: p.content,
        id: typeof p.id === 'string' ? p.id : undefined
      })
      schedulePushUserTemplatesToCloudIfSteamReady()
      return ok(rec)
    }
  )

  ipcBridge.registerHandle(
    'user-templates:remove',
    (_e: IpcMainInvokeEvent, payload: { id?: string }): Ok | Fail => {
      const id = payload?.id
      if (!id) return fail('invalid_id')
      removeUserTemplate(id)
      schedulePushUserTemplatesToCloudIfSteamReady()
      return ok()
    }
  )

  ipcBridge.registerHandle(
    'user-templates:set-thumbnail-from-path',
    (
      _e: IpcMainInvokeEvent,
      payload: { id?: string; filePath?: string }
    ): Ok<UserTemplateStoredRecord> | Fail => {
      const id = payload?.id
      const filePath = payload?.filePath
      if (!id || !filePath || typeof filePath !== 'string') return fail('invalid_payload')
      if (!getUserTemplateById(id)) return fail('template_not_found')
      try {
        const buf = fs.readFileSync(filePath)
        if (buf.length > 2 * 1024 * 1024) return fail('thumbnail_too_large')
        const rec = setUserTemplateThumbnailCustom(id, buf)
        if (!rec) return fail('thumbnail_write_failed')
        schedulePushUserTemplatesToCloudIfSteamReady()
        return ok(rec)
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    }
  )

  ipcBridge.registerHandle(
    'user-templates:set-thumbnail-custom',
    (
      _e: IpcMainInvokeEvent,
      payload: { id?: string; dataBase64?: string }
    ): Ok<UserTemplateStoredRecord> | Fail => {
      const id = payload?.id
      const raw = payload?.dataBase64
      if (!id || !raw) return fail('invalid_payload')
      const buf = parseDataUrlOrBase64(raw)
      if (!buf?.length) return fail('invalid_base64')
      if (!getUserTemplateById(id)) return fail('template_not_found')
      const rec = setUserTemplateThumbnailCustom(id, buf)
      if (!rec) return fail('thumbnail_write_failed')
      schedulePushUserTemplatesToCloudIfSteamReady()
      return ok(rec)
    }
  )

  ipcBridge.registerHandle(
    'user-templates:set-thumbnail-generated',
    (
      _e: IpcMainInvokeEvent,
      payload: { id?: string; dataBase64?: string }
    ): Ok<UserTemplateStoredRecord> | Fail => {
      const id = payload?.id
      if (!id) return fail('invalid_id')
      const raw = payload?.dataBase64
      const buf = raw ? parseDataUrlOrBase64(raw) : null
      const rec = setUserTemplateThumbnailGenerated(id, buf ?? Buffer.alloc(0))
      if (!rec) return fail('thumbnail_write_failed')
      schedulePushUserTemplatesToCloudIfSteamReady()
      return ok(rec)
    }
  )

  ipcBridge.registerHandle(
    'user-templates:clear-thumbnail',
    (_e: IpcMainInvokeEvent, payload: { id?: string }): Ok<UserTemplateStoredRecord> | Fail => {
      const id = payload?.id
      if (!id) return fail('invalid_id')
      const upd = clearUserTemplateThumbnail(id)
      if (!upd) return fail('not_found')
      schedulePushUserTemplatesToCloudIfSteamReady()
      return ok(upd)
    }
  )

  ipcBridge.registerHandle(
    'user-templates:get-thumb-data-url',
    (_e: IpcMainInvokeEvent, payload: { id?: string }): Ok<string | null> | Fail => {
      const id = payload?.id
      if (!id) return fail('invalid_id')
      const rec = getUserTemplateById(id)
      if (!rec?.thumbnailFile) return ok(null)
      const buf = readThumbnailFile(rec.thumbnailFile)
      if (!buf?.length) return ok(null)
      const mime = mimeForImageBuffer(buf)
      return ok(`data:${mime};base64,${buf.toString('base64')}`)
    }
  )

  ipcBridge.registerHandle(
    'user-templates:migrate-from-renderer',
    (_e: IpcMainInvokeEvent, payload: unknown): Ok<{ count: number }> | Fail => {
      const p = payload as { items?: unknown[] }
      const items = Array.isArray(p?.items) ? p.items : []
      let count = 0
      const existing = listUserTemplates()
      const ids = new Set(existing.map((t) => t.id))
      for (const raw of items) {
        if (!raw || typeof raw !== 'object') continue
        const o = raw as Record<string, unknown>
        if (typeof o.id !== 'string' || typeof o.formatId !== 'string') continue
        if (ids.has(o.id)) continue
        addUserTemplate({
          id: o.id,
          formatId: String(o.formatId),
          locale: typeof o.locale === 'string' ? o.locale : 'zh_cn',
          title: typeof o.title === 'string' ? o.title : '',
          description: typeof o.description === 'string' ? o.description : '',
          content: typeof o.content === 'string' ? o.content : ''
        })
        ids.add(o.id)
        count++
      }
      if (count > 0) {
        schedulePushUserTemplatesToCloudIfSteamReady()
      }
      return ok({ count })
    }
  )
}
