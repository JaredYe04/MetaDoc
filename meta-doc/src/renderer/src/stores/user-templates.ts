/**
 * 用户模板：导出为模板时加入的列表，程序内部持久化（localStorage），新建文档时可选、可删
 * 暂不考虑导入/导出文件
 */

import { ref } from 'vue'
import type { DocumentTemplate } from '../types/formats'
import eventBus from '../utils/event-bus'

const STORAGE_KEY = 'metadoc_user_templates'

export interface UserTemplateRecord {
  id: string
  formatId: string
  locale: string
  title: string
  description: string
  content: string
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

const userTemplates = ref<UserTemplateRecord[]>(loadFromStorage())

export function addUserTemplate(payload: {
  formatId: string
  locale: string
  title: string
  description: string
  content: string
}): UserTemplateRecord {
  const id = generateId()
  const record: UserTemplateRecord = {
    id,
    formatId: payload.formatId,
    locale: payload.locale,
    title: payload.title.trim() || '未命名模板',
    description: payload.description.trim() || '',
    content: payload.content
  }
  userTemplates.value = [...userTemplates.value, record]
  saveToStorage(userTemplates.value)
  eventBus.emit('refresh-template-formats')
  return record
}

export function removeUserTemplate(userTemplateId: string): void {
  userTemplates.value = userTemplates.value.filter((t) => t.id !== userTemplateId)
  saveToStorage(userTemplates.value)
  eventBus.emit('refresh-template-formats')
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
      userTemplateId: t.id
    }))
}

export function getUserTemplates() {
  return userTemplates
}
