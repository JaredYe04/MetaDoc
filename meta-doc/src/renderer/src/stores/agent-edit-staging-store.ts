/**
 * Agent 编辑暂存：按「文件」合并 checkpoint，支持按编辑块（hunk）接受/拒绝并重算磁盘内容
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import messageBridge from '../bridge/message-bridge'
import type { EditOperation } from '../utils/agent-tools/edit-engine/types'
import { applyEditSequenceRaw, postProcess } from '../utils/agent-tools/edit-engine'

export type StagingEditType = 'edit' | 'create' | 'delete'

export interface StagingEditHunk {
  id: string
  editId: string
  operation: EditOperation
  status: 'pending' | 'accepted' | 'rejected'
}

export interface StagingEditRecord {
  id: string
  sessionId: string
  /** 触发本轮编辑的用户消息 id，用于回滚「本次对话产生的所有编辑」 */
  userMessageId: string
  filePath: string
  type: StagingEditType
  /** 该 checkpoint 的基准内容（同一条用户消息内同一文件多次 edit 调用共用） */
  oldContent?: string
  /** 当前折叠后的内容（与磁盘一致，pending 时随 hunk 拒绝更新） */
  newContent?: string
  addedLines: number
  removedLines: number
  /** 可逐块审阅的编辑意图（顺序与引擎应用顺序一致） */
  hunkOperations?: StagingEditHunk[]
  /** 用户已接受/拒绝整条 checkpoint；未操作则为 pending */
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: number
}

function genId(): string {
  return `staging-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function genHunkId(): string {
  return `hunk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

function lineCountDelta(oldS: string, newS: string): { added: number; removed: number } {
  const ol = oldS ? oldS.split('\n').length : 0
  const nl = newS ? newS.split('\n').length : 0
  return {
    added: Math.max(0, nl - ol),
    removed: Math.max(0, ol - nl)
  }
}

/** 按 hunk 折叠：基准 + 所有未拒绝的 operation 顺序应用，再后处理 */
export function foldRecordContent(record: StagingEditRecord): string {
  if (!record.hunkOperations?.length) return record.newContent ?? ''
  const baseline = record.oldContent ?? ''
  const ops = record.hunkOperations.filter((h) => h.status !== 'rejected').map((h) => h.operation)
  if (ops.length === 0) return postProcess(baseline)
  return postProcess(applyEditSequenceRaw(baseline, ops))
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

  /**
   * 合并同一 session + 用户消息 + 文件路径的 pending「编辑」checkpoint；
   * create/delete 不合并。
   */
  function pushFileCheckpoint(
    sessionId: string,
    userMessageId: string,
    payload: {
      filePath: string
      type: StagingEditType
      oldContent?: string
      newContent?: string
      operations: EditOperation[]
    }
  ): StagingEditRecord {
    const fp = normalizePath(payload.filePath)

    if (payload.type === 'edit' && payload.oldContent !== undefined) {
      const existing = records.value.find(
        (r) =>
          r.sessionId === sessionId &&
          r.userMessageId === userMessageId &&
          normalizePath(r.filePath) === fp &&
          r.status === 'pending' &&
          r.type === 'edit'
      )
      if (existing) {
        const newHunks: StagingEditHunk[] = payload.operations.map((op) => ({
          id: genHunkId(),
          editId: op.id,
          operation: op,
          status: 'pending'
        }))
        const mergedHunks = [...(existing.hunkOperations ?? []), ...newHunks]
        const newContent = payload.newContent ?? existing.newContent ?? ''
        const base = existing.oldContent ?? payload.oldContent ?? ''
        const { added, removed } = lineCountDelta(base, newContent)
        const updated: StagingEditRecord = {
          ...existing,
          newContent,
          hunkOperations: mergedHunks,
          addedLines: added,
          removedLines: removed
        }
        records.value = records.value.map((r) => (r.id === existing.id ? updated : r))
        return updated
      }
    }

    const hunkOperations: StagingEditHunk[] | undefined =
      payload.operations.length > 0
        ? payload.operations.map((op) => ({
            id: genHunkId(),
            editId: op.id,
            operation: op,
            status: 'pending'
          }))
        : undefined

    const base = payload.oldContent ?? ''
    const nw = payload.newContent ?? ''
    const { added, removed } = lineCountDelta(base, nw)

    const record: StagingEditRecord = {
      id: genId(),
      sessionId,
      userMessageId,
      filePath: payload.filePath,
      type: payload.type,
      oldContent: payload.oldContent,
      newContent: payload.newContent,
      addedLines: added,
      removedLines: removed,
      hunkOperations,
      status: 'pending',
      createdAt: Date.now()
    }
    records.value = [...records.value, record]
    return record
  }

  /** @deprecated 请使用 pushFileCheckpoint；保留兼容旧调用 */
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
    return pushFileCheckpoint(sessionId, userMessageId, {
      filePath: payload.filePath,
      type: payload.type,
      oldContent: payload.oldContent,
      newContent: payload.newContent,
      operations: []
    })
  }

  function setStatus(editId: string, status: 'accepted' | 'rejected') {
    const idx = records.value.findIndex((r) => r.id === editId)
    if (idx === -1) return
    const next = [...records.value]
    next[idx] = { ...next[idx], status }
    records.value = next
  }

  async function writeFoldedContent(record: StagingEditRecord): Promise<void> {
    const text = foldRecordContent(record)
    await messageBridge.invoke('write-file-content', {
      filePath: record.filePath,
      content: text
    })
    const base = record.oldContent ?? ''
    const { added, removed } = lineCountDelta(base, text)
    records.value = records.value.map((r) =>
      r.id === record.id ? { ...r, newContent: text, addedLines: added, removedLines: removed } : r
    )
  }

  /** 单块 hunk 状态变更后重算并写回磁盘（仅 pending 的 edit） */
  async function setHunkStatus(
    recordId: string,
    hunkId: string,
    status: 'pending' | 'accepted' | 'rejected'
  ): Promise<void> {
    const idx = records.value.findIndex((r) => r.id === recordId)
    if (idx === -1) return
    const record = records.value[idx]
    if (!record.hunkOperations?.length) return

    const hunkOperations = record.hunkOperations.map((h) =>
      h.id === hunkId ? { ...h, status } : h
    )
    const nextRecord: StagingEditRecord = { ...record, hunkOperations }
    const next = [...records.value]
    next[idx] = nextRecord
    records.value = next

    if (nextRecord.status === 'pending' && nextRecord.type === 'edit') {
      await writeFoldedContent(nextRecord)
    }
  }

  /** 拒绝单条 checkpoint：整文件回退到基准 */
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

  function acceptEdit(editId: string) {
    setStatus(editId, 'accepted')
  }

  async function removeEdit(record: StagingEditRecord): Promise<void> {
    if (record.status === 'pending') {
      await rejectEdit(record)
    }
    records.value = records.value.filter((r) => r.id !== record.id)
  }

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

  async function redoEdit(record: StagingEditRecord): Promise<void> {
    if (record.status !== 'rejected') return
    try {
      if (record.type === 'create' && record.newContent != null) {
        const lastSep = Math.max(
          record.filePath.lastIndexOf('/'),
          record.filePath.lastIndexOf('\\')
        )
        const parentPath = lastSep <= 0 ? record.filePath : record.filePath.slice(0, lastSep)
        const fileName = lastSep < 0 ? record.filePath : record.filePath.slice(lastSep + 1)
        await messageBridge.invoke('create-file', {
          parentPath: parentPath || '.',
          fileName,
          content: record.newContent
        })
      } else if (record.type === 'delete') {
        await messageBridge.invoke('delete-file-or-folder', record.filePath)
      } else if (record.type === 'edit') {
        const content = record.hunkOperations?.length
          ? foldRecordContent(record)
          : (record.newContent ?? '')
        await messageBridge.invoke('write-file-content', {
          filePath: record.filePath,
          content
        })
      }
      setStatus(record.id, 'accepted')
    } catch (e) {
      console.error('[agent-edit-staging] redo failed', e)
      throw e
    }
  }

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
    pushFileCheckpoint,
    setHunkStatus,
    setStatus,
    rejectEdit,
    acceptEdit,
    removeEdit,
    rollbackByUserMessage,
    redoByUserMessage,
    redoEdit,
    acceptAll,
    rejectAll,
    foldRecordContent
  }
})
