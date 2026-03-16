/**
 * Agent 工作区 Store
 * 工作区级 Agent 会话的单一数据源，持久化到 .metadoc/agent/sessions.json
 */

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { AgentSession } from '../types/agent'
import messageBridge from '../bridge/message-bridge'
import { createRendererLogger } from '../utils/logger'
import { agentSessionManager } from '../utils/agent-framework/agent-session-manager'
import { agentConfigManager } from '../utils/agent-framework/agent-config-manager'

const logger = createRendererLogger('AgentWorkspaceStore')

const METADOC_AGENT_SESSIONS_FILE = '.metadoc/agent/sessions.json'

export interface AgentWorkspacePersisted {
  activeSessionId: string | null
  sessions: AgentSession[]
  /** Compact 视图：当前打开的 tab 会话 ID 列表，按顺序；不持久化则恢复时视为全部打开 */
  openTabIds?: string[]
  /** 各会话的提示词输入框内容（会话级隔离） */
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

  /** 共享 UI 状态：Full 与 Compact 视图同步（仅一个可见时由当前视图更新） */
  const isGenerating = ref(false)
  /** 正在执行引擎的会话 ID（切换 tab/视图时 loadFromMetadoc 不覆盖该会话，保证执行不中断） */
  const generatingSessionId = ref<string | null>(null)
  /** 当前会话的提示词输入（与 composerInputBySessionId 按 activeSessionId 同步） */
  const composerInput = ref('')
  /** 各会话的提示词输入框内容（会话级隔离，持久化） */
  const composerInputBySessionId = ref<Record<string, string>>({})
  const selectedEngineId = ref('default-autogpt-engine')
  /** 共享任务句柄：用于跨视图取消/解锁 */
  const currentAiTaskHandle = ref<string | null>(null)
  const aiTaskHandles = ref<Set<string>>(new Set())

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
      referenceStore: Array.isArray(s.referenceStore) ? s.referenceStore : [],
      publicContext:
        s.publicContext && typeof s.publicContext === 'object'
          ? (s.publicContext as any)
          : undefined,
      executionNodes: Array.isArray(s.executionNodes) ? s.executionNodes : [],
      status: typeof s.status === 'string' ? s.status : 'idle'
    } as AgentSession
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

  /** 持久化文件路径（主进程 fs 接受 / 或 \\） */
  function getSessionsFilePath(): string {
    const root = workspaceRoot.value
    if (!root) return ''
    const normalized = root.replace(/\\/g, '/').replace(/\/$/, '')
    return `${normalized}/${METADOC_AGENT_SESSIONS_FILE}`
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

    const filePath = getSessionsFilePath()
    if (!filePath) return

    try {
      const content = await messageBridge.invoke('read-file-content', filePath)
      if (!content || typeof content !== 'string') {
        sessions.value = []
        activeSessionId.value = null
        ensureDefaultSession()
        return
      }

      const data = JSON.parse(content) as AgentWorkspacePersisted
      const list = Array.isArray(data.sessions) ? data.sessions : []
      const normalized = list.map(normalizeSession).filter((s): s is AgentSession => s !== null)
      // 从磁盘加载的会话一律视为空闲，避免残留 thinking 导致“正在分析用户意图”一直显示
      normalized.forEach((s) => {
        s.status = 'idle'
      })
      // 若正在生成中，保留“正在执行”的会话的同一对象引用，避免替换后执行中的任务写错对象导致中断或不同步
      const genId = generatingSessionId.value
      if (isGenerating.value && genId && sessions.value.length > 0) {
        const generatingSession = sessions.value.find((s) => s.id === genId)
        if (generatingSession) {
          const idx = normalized.findIndex((s) => s.id === genId)
          if (idx >= 0) {
            // 使用内存中的同一引用，不创建新对象，保证执行中的引擎/队列仍写入 store 中的会话
            normalized[idx] = generatingSession
          }
        }
      } else if (isGenerating.value && sessions.value.length > 0) {
        // 兼容：未设置 generatingSessionId 时按当前激活会话保留消息与 status
        const currentId = activeSessionId.value
        const currentSession = currentId ? sessions.value.find((s) => s.id === currentId) : null
        if (currentSession) {
          const idx = normalized.findIndex((s) => s.id === currentSession.id)
          if (idx >= 0) {
            normalized[idx] = {
              ...normalized[idx],
              messages: currentSession.messages,
              status: currentSession.status
            }
          }
        }
      }
      sessions.value = normalized.length > 0 ? normalized : []
      activeSessionId.value =
        typeof data.activeSessionId === 'string' &&
        normalized.some((s) => s.id === data.activeSessionId)
          ? data.activeSessionId
          : (normalized[0]?.id ?? null)

      const sessionIds = new Set(normalized.map((s) => s.id))
      const savedOpen = Array.isArray(data.openTabIds) ? data.openTabIds : []
      openTabIds.value = savedOpen.filter((id) => sessionIds.has(id))
      if (openTabIds.value.length === 0 && normalized.length > 0) {
        const fallback = activeSessionId.value ?? normalized[0].id
        openTabIds.value = [fallback]
      }

      const savedComposer =
        data.composerInputBySessionId && typeof data.composerInputBySessionId === 'object'
          ? data.composerInputBySessionId
          : {}
      composerInputBySessionId.value = savedComposer
      composerInput.value = (activeSessionId.value && savedComposer[activeSessionId.value]) ?? ''

      if (sessions.value.length === 0) {
        ensureDefaultSession()
        composerInput.value =
          (activeSessionId.value && composerInputBySessionId.value[activeSessionId.value]) ?? ''
      }
    } catch (e) {
      logger.warn('加载 Agent 会话失败', e)
      sessions.value = []
      activeSessionId.value = null
      openTabIds.value = []
      ensureDefaultSession()
    }
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

  /** 写入 .metadoc（保存前先把当前会话的 composer 输入同步进 map，避免丢失；会话以紧凑形式持久化以控制文件体积） */
  async function saveToMetadoc(): Promise<void> {
    const root = workspaceRoot.value
    if (!root) return
    const filePath = getSessionsFilePath()
    if (!filePath) return
    const aid = activeSessionId.value
    if (aid) {
      composerInputBySessionId.value[aid] = composerInput.value
    }
    try {
      const compactSessions = sessions.value.map((s) =>
        agentSessionManager.compactSessionForPersistence(s, {
          keepFullOutputForExternalTools: true
        })
      )
      const payload: AgentWorkspacePersisted = {
        activeSessionId: activeSessionId.value,
        sessions: compactSessions,
        openTabIds: openTabIds.value,
        composerInputBySessionId: composerInputBySessionId.value
      }
      await messageBridge.invoke('write-file-content', {
        filePath,
        content: JSON.stringify(payload, null, 2)
      })
    } catch (e) {
      logger.error('保存 Agent 会话失败', e)
    }
  }

  /** 初始化：刷新工作区根并加载（生成中不重载，避免覆盖正在执行的会话） */
  async function init(): Promise<void> {
    await refreshWorkspaceRoot()
    if (isGenerating.value) return
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
    isGenerating,
    generatingSessionId,
    composerInput,
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
