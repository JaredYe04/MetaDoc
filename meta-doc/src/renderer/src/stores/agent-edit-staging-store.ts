/**
 * Agent 编辑暂存：记录每次 AI 对文件的编辑，供用户逐条 review（接受/拒绝）或按消息回滚
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import messageBridge from '../bridge/message-bridge'

export type StagingEditType = 'edit' | 'create' | 'delete'

export interface StagingEditRecord {
  id: string
  sessionId: string
  /** 触发本轮编辑的用户消息 id，用于回滚「本次对话产生的所有编辑」 */
  userMessageId: string
  filePath: string
  type: StagingEditType
  /** 编辑前内容（delete 时为原内容，create 时为 undefined） */
  oldContent?: string
  /** 编辑后内容（create 时为新建内容，delete 时为 undefined） */
  newContent?: string
  addedLines: number
  removedLines: number
  /** 用户已接受/拒绝；未操作则为 pending */
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: number
}

function genId(): string {
  return `staging-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export const useAgentEditStagingStore = defineStore('agent-edit-staging', () => {
  const records = ref<StagingEditRecord[]>([])

  const bySession = computed(() => {
    const map = new Map<string, StagingEditRecord[]>()
    for (const r of records.value) {
      const list = map.get(r.sessionId) || []
      list.push(r)
      map.set(r.sessionId, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.createdAt - b.createdAt)
    }
    return map
  })

  function getEditsForSession(sessionId: string): StagingEditRecord[] {
    return bySession.value.get(sessionId) || []
  }

  function getEditsByUserMessage(sessionId: string, userMessageId: string): StagingEditRecord[] {
    return records.value.filter(
      (r) => r.sessionId === sessionId && r.userMessageId === userMessageId
    )
  }

  /** 由 edit-tool 或 executor 调用：记录一次应用成功的编辑 */
  function pushEdit(
    sessionId: string,
    userMessageId: string,
    payload: {
      filePath: string
      type: StagingEditType
      oldContent?: string
      newContent?: string
      addedLines: number
      removedLines: number
    }
  ): StagingEditRecord {
    const record: StagingEditRecord = {
      id: genId(),
      sessionId,
      userMessageId,
      filePath: payload.filePath,
      type: payload.type,
      oldContent: payload.oldContent,
      newContent: payload.newContent,
      addedLines: payload.addedLines ?? 0,
      removedLines: payload.removedLines ?? 0,
      status: 'pending',
      createdAt: Date.now()
    }
    records.value = [...records.value, record]
    return record
  }

  function setStatus(editId: string, status: 'accepted' | 'rejected') {
    const idx = records.value.findIndex((r) => r.id === editId)
    if (idx === -1) return
    const next = [...records.value]
    next[idx] = { ...next[idx], status }
    records.value = next
  }

  /** 拒绝单条：还原文件（写回 old / 删除新文件 / 恢复被删文件） */
  async function rejectEdit(record: StagingEditRecord): Promise<void> {
    if (record.status === 'rejected') return
    try {
      if (record.type === 'create') {
        await messageBridge.invoke('delete-file-or-folder', record.filePath)
      } else if (record.type === 'delete' && record.oldContent != null) {
        await messageBridge.invoke('write-file-content', {
          filePath: record.filePath,
          content: record.oldContent
        })
      } else if (record.type === 'edit' && record.oldContent != null) {
        await messageBridge.invoke('write-file-content', {
          filePath: record.filePath,
          content: record.oldContent
        })
      }
      setStatus(record.id, 'rejected')
    } catch (e) {
      console.error('[agent-edit-staging] reject failed', e)
      throw e
    }
  }

  /** 接受单条：仅标记为已接受 */
  function acceptEdit(editId: string) {
    setStatus(editId, 'accepted')
  }

  /** 回滚某条用户消息触发的所有编辑（还原所有未拒绝的记录） */
  async function rollbackByUserMessage(
    sessionId: string,
    userMessageId: string
  ): Promise<{ rolled: number }> {
    const list = getEditsByUserMessage(sessionId, userMessageId)
    let rolled = 0
    for (const r of list) {
      if (r.status === 'rejected') continue
      await rejectEdit(r)
      rolled++
    }
    return { rolled }
  }

  /** 接受全部 / 拒绝全部（针对某 session 的 pending） */
  function acceptAll(sessionId: string) {
    const list = getEditsForSession(sessionId).filter((r) => r.status === 'pending')
    list.forEach((r) => setStatus(r.id, 'accepted'))
  }

  async function rejectAll(sessionId: string): Promise<number> {
    const list = getEditsForSession(sessionId).filter((r) => r.status === 'pending')
    let count = 0
    for (const r of list) {
      await rejectEdit(r)
      count++
    }
    return count
  }

  /** 重新应用一条已拒绝的编辑（Redo） */
  async function redoEdit(record: StagingEditRecord): Promise<void> {
    if (record.status !== 'rejected') return
    try {
      if (record.type === 'create' && record.newContent != null) {
        const lastSep = Math.max(
          record.filePath.lastIndexOf('/'),
          record.filePath.lastIndexOf('\\')
        )
        const parentPath =
          lastSep <= 0 ? record.filePath : record.filePath.slice(0, lastSep)
        const fileName =
          lastSep < 0 ? record.filePath : record.filePath.slice(lastSep + 1)
        await messageBridge.invoke('create-file', {
          parentPath: parentPath || '.',
          fileName,
          content: record.newContent
        })
      } else if (record.type === 'delete') {
        await messageBridge.invoke('delete-file-or-folder', record.filePath)
      } else if (record.type === 'edit' && record.newContent != null) {
        await messageBridge.invoke('write-file-content', {
          filePath: record.filePath,
          content: record.newContent
        })
      }
      setStatus(record.id, 'accepted')
    } catch (e) {
      console.error('[agent-edit-staging] redo failed', e)
      throw e
    }
  }

  /** 对某条用户消息已回退的编辑全部 Redo */
  async function redoByUserMessage(
    sessionId: string,
    userMessageId: string
  ): Promise<{ redone: number }> {
    const list = getEditsByUserMessage(sessionId, userMessageId).filter(
      (r) => r.status === 'rejected'
    )
    let redone = 0
    for (const r of list) {
      await redoEdit(r)
      redone++
    }
    return { redone }
  }

  return {
    records,
    bySession,
    getEditsForSession,
    getEditsByUserMessage,
    pushEdit,
    setStatus,
    rejectEdit,
    acceptEdit,
    rollbackByUserMessage,
    redoByUserMessage,
    redoEdit,
    acceptAll,
    rejectAll
  }
})
