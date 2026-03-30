/**
 * Agent 工作区 Store
 * 工作区级 Agent 会话的单一数据源，持久化到 .metadoc/agent/：
 * - v2：sessions-index.json（索引）+ sessions/<id>.msess（与 Sidecar 相同的二进制序列化）
 * - 首次启动若仅有旧版 sessions.json，则自动迁移并备份原文件
 */

import { defineStore } from 'pinia'
import { ref, computed, watch, shallowRef } from 'vue'
import type { AgentSession } from '../types/agent'
import messageBridge from '../bridge/message-bridge'
import { createRendererLogger } from '../utils/logger'
import { agentSessionManager } from '../utils/agent-framework/agent-session-manager'
import { agentConfigManager } from '../utils/agent-framework/agent-config-manager'
import {
  REL_SESSION_INDEX,
  joinUnderWorkspaceRoot,
  loadIndexV2,
  loadLegacySessionsJson,
  deserializeSessionBlob,
  writeSessionV2Layout,
  renameLegacySessionsJsonBackup,
  pruneOrphanSessionBlobs,
  sessionBlobRelativePath,
  type AgentSessionIndexFileV2
} from '../utils/agent-workspace-persistence'

const logger = createRendererLogger('AgentWorkspaceStore')

/** 与旧版 sessions.json 顶层结构一致（导入/文档用类型） */
export interface AgentWorkspacePersisted {
  activeSessionId: string | null
  sessions: AgentSession[]
  openTabIds?: string[]
  composerInputBySessionId?: Record<string, string>
}

function getWorkspaceFolders(): string[] {
  try {
    const saved = localStorage.getItem('workspaceFolders')
    if (!saved) return []
    const arr = JSON.parse(saved)
    if (!Array.isArray(arr)) return []
    return arr.filter((p) => typeof p === 'string' && p.length > 0)
  } catch {
    return []
  }
}

export const useAgentWorkspaceStore = defineStore('agent-workspace', () => {
  const workspaceRoot = ref<string>('')
  const sessions = ref<AgentSession[]>([])
  const activeSessionId = ref<string | null>(null)
  /** Compact 视图：当前打开的 tab 会话 ID 列表（持久化） */
  const openTabIds = ref<string[]>([])
  const _saveTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const SAVE_DEBOUNCE_MS = 500

  /** 正在执行引擎的会话 ID 集合（支持多会话并行；切换 tab 不中断后台会话） */
  const generatingSessionIds = shallowRef<Set<string>>(new Set())
  /** 是否有任一会话在生成（用于全局判断；各 UI 控件请用 isSessionGenerating(activeId)） */
  const isGenerating = computed(() => generatingSessionIds.value.size > 0)

  function addGeneratingSession(sessionId: string): void {
    const next = new Set(generatingSessionIds.value)
    next.add(sessionId)
    generatingSessionIds.value = next
  }

  function removeGeneratingSession(sessionId: string): void {
    const next = new Set(generatingSessionIds.value)
    next.delete(sessionId)
    generatingSessionIds.value = next
  }

  function isSessionGenerating(sessionId: string | null | undefined): boolean {
    if (!sessionId) return false
    return generatingSessionIds.value.has(sessionId)
  }

  /** 当前会话的提示词输入（与 composerInputBySessionId 按 activeSessionId 同步） */
  const composerInput = ref('')
  /** 各会话的提示词输入框内容（会话级隔离，持久化） */
  const composerInputBySessionId = ref<Record<string, string>>({})
  const selectedEngineId = ref('default-autogpt-engine')
  /** 共享任务句柄：用于跨视图取消/解锁 */
  const currentAiTaskHandle = ref<string | null>(null)
  const aiTaskHandles = ref<Set<string>>(new Set())

  /** 本轮 Agent 执行注册的 AI 任务 handle（按会话隔离，避免多会话并行时互相清理 handle） */
  const agentRunHandlesBySession = ref<Record<string, string[]>>({})

  function registerAgentRunHandle(sessionId: string, handle: string): void {
    const cur = agentRunHandlesBySession.value[sessionId] ?? []
    if (cur.includes(handle)) {
      aiTaskHandles.value.add(handle)
      currentAiTaskHandle.value = handle
      return
    }
    agentRunHandlesBySession.value = {
      ...agentRunHandlesBySession.value,
      [sessionId]: [...cur, handle]
    }
    aiTaskHandles.value.add(handle)
    currentAiTaskHandle.value = handle
  }

  function unregisterAgentRunSession(sessionId: string): void {
    const handles = agentRunHandlesBySession.value[sessionId] ?? []
    if (handles.length === 0) {
      if (currentAiTaskHandle.value) {
        const anyLeft = Object.values(agentRunHandlesBySession.value).some((arr) =>
          arr.includes(currentAiTaskHandle.value!)
        )
        if (!anyLeft) currentAiTaskHandle.value = null
      }
      return
    }
    const rest = { ...agentRunHandlesBySession.value }
    delete rest[sessionId]
    agentRunHandlesBySession.value = rest
    for (const h of handles) {
      aiTaskHandles.value.delete(h)
    }
    if (currentAiTaskHandle.value && handles.includes(currentAiTaskHandle.value)) {
      currentAiTaskHandle.value = null
    }
  }

  function getAgentRunHandlesForSession(sessionId: string): string[] {
    return [...(agentRunHandlesBySession.value[sessionId] ?? [])]
  }

  const activeSession = computed(() => {
    const id = activeSessionId.value
    if (!id) return null
    return sessions.value.find((s) => s.id === id) ?? null
  })

  /** 解析并规范化会话（确保必要字段存在） */
  function normalizeSession(raw: unknown): AgentSession | null {
    if (!raw || typeof raw !== 'object') return null
    const s = raw as Record<string, unknown>
    if (typeof s.id !== 'string' || typeof s.title !== 'string') return null
    const createdAt = s.createdAt
    const updatedAt = s.updatedAt
    return {
      ...s,
      id: s.id,
      title: s.title,
      description: typeof s.description === 'string' ? s.description : undefined,
      createdAt:
        typeof createdAt === 'string' ? createdAt : new Date(Number(createdAt) || 0).toISOString(),
      updatedAt:
        typeof updatedAt === 'string' ? updatedAt : new Date(Number(updatedAt) || 0).toISOString(),
      messages: Array.isArray(s.messages) ? s.messages : [],
      activeToolIds: Array.isArray(s.activeToolIds) ? s.activeToolIds : [],
      agentConfigId: typeof s.agentConfigId === 'string' ? s.agentConfigId : undefined,
      messageQueue: Array.isArray(s.messageQueue) ? s.messageQueue : [],
      composerSendQueue: Array.isArray(s.composerSendQueue) ? s.composerSendQueue : [],
      referenceStore: Array.isArray(s.referenceStore) ? s.referenceStore : [],
      publicContext:
        s.publicContext && typeof s.publicContext === 'object'
          ? (s.publicContext as any)
          : undefined,
      executionNodes: Array.isArray(s.executionNodes) ? s.executionNodes : [],
      status: typeof s.status === 'string' ? s.status : 'idle'
    } as AgentSession
  }

  function applyIdleAndMergeGenerating(normalized: AgentSession[]): void {
    normalized.forEach((s) => {
      s.status = 'idle'
    })
    if (generatingSessionIds.value.size === 0 || sessions.value.length === 0) return
    for (const genId of generatingSessionIds.value) {
      const generatingSession = sessions.value.find((s) => s.id === genId)
      if (!generatingSession) continue
      const idx = normalized.findIndex((s) => s.id === genId)
      if (idx >= 0) {
        normalized[idx] = generatingSession
      }
    }
  }

  /** 获取当前 Agent 工作区根（并确保 .metadoc/agent 存在） */
  async function refreshWorkspaceRoot(): Promise<string> {
    const folders = getWorkspaceFolders()
    if (!messageBridge.getIpc()?.invoke) {
      logger.warn('IPC 不可用，无法获取 Agent 工作区根')
      return ''
    }
    const root = await messageBridge.invoke('get-agent-workspace-root', folders)
    workspaceRoot.value = root
    return root
  }

  /** v2 索引文件路径（主进程 fs 接受 / 或 \\） */
  function getSessionsFilePath(): string {
    const root = workspaceRoot.value
    if (!root) return ''
    return joinUnderWorkspaceRoot(root, REL_SESSION_INDEX)
  }

  async function loadSessionsFromIndexV2(root: string): Promise<{
    sessions: AgentSession[]
    activeSessionId: string | null
    openTabIds: string[]
    composerInputBySessionId: Record<string, string>
  } | null> {
    const index = await loadIndexV2(root)
    if (!index) return null

    const loaded = await Promise.all(
      index.entries.map(async (entry) => {
        const rel = sessionBlobRelativePath(entry.id)
        const full = joinUnderWorkspaceRoot(root, rel)
        const raw = await deserializeSessionBlob(full)
        const normalized = normalizeSession(raw)
        if (!normalized) {
          logger.warn('跳过缺失或损坏的会话文件', { id: entry.id, path: full })
        }
        return normalized
      })
    )
    const results = loaded.filter((s): s is AgentSession => s !== null)

    const sessionIds = new Set(results.map((s) => s.id))
    const active =
      typeof index.activeSessionId === 'string' && sessionIds.has(index.activeSessionId)
        ? index.activeSessionId
        : (results[0]?.id ?? null)

    const savedOpen = Array.isArray(index.openTabIds) ? index.openTabIds : []
    let tabs = savedOpen.filter((id) => sessionIds.has(id))
    if (tabs.length === 0 && results.length > 0) {
      tabs = [active ?? results[0]!.id]
    }

    const savedComposer =
      index.composerInputBySessionId && typeof index.composerInputBySessionId === 'object'
        ? index.composerInputBySessionId
        : {}

    return {
      sessions: results,
      activeSessionId: active,
      openTabIds: tabs,
      composerInputBySessionId: savedComposer
    }
  }

  /** 从 .metadoc 加载会话 */
  async function loadFromMetadoc(): Promise<void> {
    const root = workspaceRoot.value || (await refreshWorkspaceRoot())
    if (!root) {
      sessions.value = []
      activeSessionId.value = null
      openTabIds.value = []
      return
    }

    try {
      const fromV2 = await loadSessionsFromIndexV2(root)
      if (fromV2) {
        const normalized = fromV2.sessions
        applyIdleAndMergeGenerating(normalized)
        sessions.value = normalized.length > 0 ? normalized : []
        activeSessionId.value =
          fromV2.activeSessionId && normalized.some((s) => s.id === fromV2.activeSessionId)
            ? fromV2.activeSessionId
            : (normalized[0]?.id ?? null)

        const sessionIds = new Set(normalized.map((s) => s.id))
        openTabIds.value = fromV2.openTabIds.filter((id) => sessionIds.has(id))
        if (openTabIds.value.length === 0 && normalized.length > 0) {
          const fb = activeSessionId.value ?? normalized[0].id
          openTabIds.value = [fb]
        }

        composerInputBySessionId.value = fromV2.composerInputBySessionId
        composerInput.value =
          (activeSessionId.value && fromV2.composerInputBySessionId[activeSessionId.value]) ?? ''

        if (sessions.value.length === 0) {
          ensureDefaultSession()
          composerInput.value =
            (activeSessionId.value && composerInputBySessionId.value[activeSessionId.value]) ?? ''
        }
        return
      }

      const legacy = await loadLegacySessionsJson(root)
      if (legacy) {
        const list = Array.isArray(legacy.sessions) ? legacy.sessions : []
        const normalized = list.map(normalizeSession).filter((s): s is AgentSession => s !== null)
        normalized.forEach((s) => {
          s.status = 'idle'
        })
        applyIdleAndMergeGenerating(normalized)
        sessions.value = normalized.length > 0 ? normalized : []
        activeSessionId.value =
          typeof legacy.activeSessionId === 'string' &&
          normalized.some((s) => s.id === legacy.activeSessionId)
            ? legacy.activeSessionId
            : (normalized[0]?.id ?? null)

        const sessionIds = new Set(normalized.map((s) => s.id))
        const savedOpen = Array.isArray(legacy.openTabIds) ? legacy.openTabIds : []
        openTabIds.value = savedOpen.filter((id) => sessionIds.has(id))
        if (openTabIds.value.length === 0 && normalized.length > 0) {
          openTabIds.value = [activeSessionId.value ?? normalized[0].id]
        }

        const savedComposer =
          legacy.composerInputBySessionId && typeof legacy.composerInputBySessionId === 'object'
            ? legacy.composerInputBySessionId
            : {}
        composerInputBySessionId.value = savedComposer
        composerInput.value =
          (activeSessionId.value && savedComposer[activeSessionId.value]) ?? ''

        try {
          await persistV2FromCurrentState(root)
          await renameLegacySessionsJsonBackup(root)
        } catch (migErr) {
          logger.error('迁移旧版 sessions.json 到 v2 失败', migErr)
        }

        if (sessions.value.length === 0) {
          ensureDefaultSession()
          composerInput.value =
            (activeSessionId.value && composerInputBySessionId.value[activeSessionId.value]) ?? ''
        }
        return
      }

      sessions.value = []
      activeSessionId.value = null
      openTabIds.value = []
      ensureDefaultSession()
    } catch (e) {
      logger.warn('加载 Agent 会话失败', e)
      sessions.value = []
      activeSessionId.value = null
      openTabIds.value = []
      ensureDefaultSession()
    }
  }

  async function persistV2FromCurrentState(root: string): Promise<void> {
    const index: AgentSessionIndexFileV2 = {
      formatVersion: 2,
      activeSessionId: activeSessionId.value,
      openTabIds: openTabIds.value,
      composerInputBySessionId: composerInputBySessionId.value,
      entries: sessions.value.map((s) => ({
        id: s.id,
        title: s.title,
        updatedAt: s.updatedAt
      }))
    }
    const blobs = sessions.value.map((s) => ({
      sessionId: s.id,
      compact: agentSessionManager.compactSessionForPersistence(s as any, {
        keepFullOutputForExternalTools: true
      }) as unknown
    }))
    await writeSessionV2Layout(root, index, blobs)
    await pruneOrphanSessionBlobs(root, new Set(sessions.value.map((s) => s.id)))
  }

  /** 若无会话则创建默认会话 */
  function ensureDefaultSession(): void {
    if (sessions.value.length > 0) return
    const defaultConfigId = agentConfigManager.getDefaultConfigId()
    if (!defaultConfigId) {
      logger.warn('无可用 Agent 配置，无法创建默认会话')
      return
    }
    const raw = agentSessionManager.createSession(defaultConfigId, '默认会话', undefined)
    const session = normalizeSession(raw as unknown as Record<string, unknown>)
    if (!session) return
    session.publicContext = session.publicContext || {}
    sessions.value = [session]
    activeSessionId.value = session.id
    openTabIds.value = [session.id]
    scheduleSave()
  }

  /** 延迟保存 */
  function scheduleSave(): void {
    if (_saveTimer.value) clearTimeout(_saveTimer.value)
    _saveTimer.value = setTimeout(() => {
      _saveTimer.value = null
      saveToMetadoc()
    }, SAVE_DEBOUNCE_MS)
  }

  /** 立即保存（用于关闭前 flush，保证提示词等完整持久化） */
  function flushSave(): void {
    if (_saveTimer.value) {
      clearTimeout(_saveTimer.value)
      _saveTimer.value = null
    }
    saveToMetadoc()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flushSave)
    window.addEventListener('pagehide', flushSave)
  }

  /** 写入 .metadoc v2（索引 + 每会话二进制） */
  async function saveToMetadoc(): Promise<void> {
    const root = workspaceRoot.value
    if (!root) return
    const aid = activeSessionId.value
    if (aid) {
      composerInputBySessionId.value[aid] = composerInput.value
    }
    try {
      await persistV2FromCurrentState(root)
    } catch (e) {
      logger.error('保存 Agent 会话失败', e)
    }
  }

  /** 初始化：刷新工作区根并加载（生成中不重载，避免覆盖正在执行的会话） */
  async function init(): Promise<void> {
    await refreshWorkspaceRoot()
    if (generatingSessionIds.value.size > 0) return
    await loadFromMetadoc()
  }

  /** 设置当前选中的会话（会同步保存/恢复该会话的 composer 输入） */
  function setActiveSessionId(id: string | null): void {
    const prevId = activeSessionId.value
    if (prevId) {
      composerInputBySessionId.value[prevId] = composerInput.value
    }
    activeSessionId.value = id
    composerInput.value = (id && composerInputBySessionId.value[id]) ?? ''
    scheduleSave()
  }

  /** 用户编辑 composer 时更新当前会话的输入并写入 map（会触发持久化） */
  function setComposerInput(value: string): void {
    composerInput.value = value
    if (activeSessionId.value) {
      composerInputBySessionId.value[activeSessionId.value] = value
      scheduleSave()
    }
  }

  watch(composerInput, (val) => {
    if (activeSessionId.value) {
      composerInputBySessionId.value[activeSessionId.value] = val
      scheduleSave()
    }
  })

  /** 更新会话列表（替换/追加/删除后调用 scheduleSave） */
  function setSessions(list: AgentSession[]): void {
    sessions.value = list
    if (activeSessionId.value && !list.some((s) => s.id === activeSessionId.value)) {
      activeSessionId.value = list[0]?.id ?? null
    }
    scheduleSave()
  }

  /** 单会话更新后标记需要保存 */
  function touchSession(): void {
    scheduleSave()
  }

  /** 设置 Compact 视图打开的 tab 列表（会持久化） */
  function setOpenTabIds(ids: string[]): void {
    openTabIds.value = ids
    scheduleSave()
  }

  return {
    workspaceRoot,
    sessions,
    activeSessionId,
    openTabIds,
    activeSession,
    generatingSessionIds,
    isGenerating,
    addGeneratingSession,
    removeGeneratingSession,
    isSessionGenerating,
    registerAgentRunHandle,
    unregisterAgentRunSession,
    getAgentRunHandlesForSession,
    composerInput,
    composerInputBySessionId,
    selectedEngineId,
    currentAiTaskHandle,
    aiTaskHandles,
    refreshWorkspaceRoot,
    loadFromMetadoc,
    saveToMetadoc,
    flushSave,
    init,
    setActiveSessionId,
    setSessions,
    touchSession,
    setOpenTabIds,
    setComposerInput,
    ensureDefaultSession,
    getSessionsFilePath
  }
})
