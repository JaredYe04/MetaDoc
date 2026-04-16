/**
 * 用户模板：Electron 下由主进程持久化（metadocUserTemplates + template-thumbs），
 * Web 占位仍用 localStorage。
 */

import { ref } from 'vue'
import type { DocumentTemplate } from '../types/formats'
import eventBus from '../utils/event-bus'
import messageBridge from '../bridge/message-bridge'

const STORAGE_KEY = 'metadoc_user_templates'

export interface UserTemplateRecord {
  id: string
  formatId: string
  locale: string
  title: string
  description: string
  content: string
  thumbnailSource?: 'none' | 'custom' | 'generated'
}

function useMainTemplates(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electron?.ipcRenderer
}

function generateId(): string {
  return 'user-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function loadFromStorage(): UserTemplateRecord[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (t: unknown) =>
        t &&
        typeof t === 'object' &&
        typeof (t as UserTemplateRecord).id === 'string' &&
        typeof (t as UserTemplateRecord).formatId === 'string' &&
        typeof (t as UserTemplateRecord).locale === 'string' &&
        typeof (t as UserTemplateRecord).title === 'string' &&
        typeof (t as UserTemplateRecord).content === 'string'
    )
  } catch {
    return []
  }
}

function saveToStorage(list: UserTemplateRecord[]) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // ignore
  }
}

const userTemplates = ref<UserTemplateRecord[]>([])

function mapMainToRecord(o: Record<string, unknown>): UserTemplateRecord {
  return {
    id: String(o.id),
    formatId: String(o.formatId),
    locale: String(o.locale),
    title: String(o.title ?? ''),
    description: String(o.description ?? ''),
    content: String(o.content ?? ''),
    thumbnailSource: o.thumbnailSource as UserTemplateRecord['thumbnailSource']
  }
}

/** 启动时调用：迁移 localStorage → 主进程并加载列表（须在 mount 前 await） */
export async function initUserTemplatesStore(): Promise<void> {
  if (useMainTemplates()) {
    try {
      const legacy = loadFromStorage()
      if (legacy.length) {
        const mig = await messageBridge.invoke('user-templates:migrate-from-renderer', {
          items: legacy
        })
        if (mig?.ok && (mig.data as { count?: number })?.count != null) {
          try {
            localStorage.removeItem(STORAGE_KEY)
          } catch {
            /* ignore */
          }
        }
      }
    } catch (e) {
      console.warn('[user-templates] migrate failed', e)
    }
    await refreshUserTemplatesFromMain()
    return
  }
  userTemplates.value = loadFromStorage()
}

export async function refreshUserTemplatesFromMain(): Promise<void> {
  if (!useMainTemplates()) return
  try {
    const r = await messageBridge.invoke('user-templates:list')
    if (r?.ok && Array.isArray(r.data)) {
      userTemplates.value = (r.data as Record<string, unknown>[]).map(mapMainToRecord)
      eventBus.emit('refresh-template-formats')
    }
  } catch (e) {
    console.warn('[user-templates] list failed', e)
  }
}

export async function addUserTemplate(payload: {
  formatId: string
  locale: string
  title: string
  description: string
  content: string
}): Promise<UserTemplateRecord> {
  if (useMainTemplates()) {
    const r = await messageBridge.invoke('user-templates:add', {
      formatId: payload.formatId,
      locale: payload.locale,
      title: payload.title.trim() || '未命名模板',
      description: (payload.description || '').trim(),
      content: payload.content
    })
    if (!r?.ok) {
      throw new Error((r as { error?: string })?.error || 'user-templates:add failed')
    }
    const rec = mapMainToRecord(r.data as Record<string, unknown>)
    userTemplates.value = [...userTemplates.value, rec]
    eventBus.emit('refresh-template-formats')
    return rec
  }
  const id = generateId()
  const record: UserTemplateRecord = {
    id,
    formatId: payload.formatId,
    locale: payload.locale,
    title: payload.title.trim() || '未命名模板',
    description: payload.description.trim() || '',
    content: payload.content,
    thumbnailSource: 'none'
  }
  userTemplates.value = [...userTemplates.value, record]
  saveToStorage(userTemplates.value)
  eventBus.emit('refresh-template-formats')
  return record
}

export async function removeUserTemplate(userTemplateId: string): Promise<void> {
  if (useMainTemplates()) {
    const r = await messageBridge.invoke('user-templates:remove', { id: userTemplateId })
    if (!r?.ok) {
      console.warn('[user-templates] remove failed', r)
    }
    userTemplates.value = userTemplates.value.filter((t) => t.id !== userTemplateId)
    eventBus.emit('refresh-template-formats')
    return
  }
  userTemplates.value = userTemplates.value.filter((t) => t.id !== userTemplateId)
  saveToStorage(userTemplates.value)
  eventBus.emit('refresh-template-formats')
}

export async function setUserTemplateThumbnailFromFilePath(
  id: string,
  filePath: string
): Promise<void> {
  if (!useMainTemplates()) return
  const r = await messageBridge.invoke('user-templates:set-thumbnail-from-path', {
    id,
    filePath
  })
  if (!r?.ok) {
    throw new Error((r as { error?: string })?.error || 'set thumbnail failed')
  }
  await refreshUserTemplatesFromMain()
}

export async function clearUserTemplateThumbnailRemote(id: string): Promise<void> {
  if (!useMainTemplates()) return
  const r = await messageBridge.invoke('user-templates:clear-thumbnail', { id })
  if (!r?.ok) {
    throw new Error((r as { error?: string })?.error || 'clear thumbnail failed')
  }
  await refreshUserTemplatesFromMain()
}

export function getUserTemplatesForLocaleFormat(
  locale: string,
  formatId: string
): DocumentTemplate[] {
  const normalized = locale.replace('-', '_')
  return userTemplates.value
    .filter((t) => t.locale === normalized && t.formatId === formatId)
    .map((t) => ({
      id: t.id,
      label: t.title,
      description: t.description,
      content: t.content,
      isUserTemplate: true as const,
      userTemplateId: t.id,
      userTemplateThumbnailSource: t.thumbnailSource
    }))
}

export function getUserTemplates() {
  return userTemplates
}

export function getUserTemplateById(id: string): UserTemplateRecord | undefined {
  return userTemplates.value.find((t) => t.id === id)
}
