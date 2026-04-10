/**
 * Agent 设置类对话框 UI：与 Agent 全页标签是否打开无关，由侧边栏等入口直接打开。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAgentWorkspaceStore } from './agent-workspace-store'
import { useWorkspace } from './workspace'
import { agentSessionManager } from '../utils/agent-framework/agent-session-manager'
import type { AgentSession } from '../types/agent'
import type { Reference } from '../types/agent-framework'
import { notifyError, notifySuccess } from '../utils/notify'
import { i18n } from '../i18n'

export type AgentManageDialogType =
  | 'tool-collection'
  | 'agent-config'
  | 'agent-engine'
  | 'agent-capabilities-rules'
  | 'agent-capabilities-skills'
  | 'agent-capabilities-mcp'
  | null

export interface PendingAgentDraft {
  draft: string
  sessionTitle: string
}

/** 主页 Agent 发送：正文 + 需在新建会话中注入的附件引用 */
export interface PendingHomeAgentPayload {
  content: string
  references: Reference[]
  /** 是否开启深度思考（与 ChatComposer 一致） */
  enableReasoning?: boolean
}

const ALLOWED_DIALOG_COMMANDS: Exclude<AgentManageDialogType, null>[] = [
  'tool-collection',
  'agent-config',
  'agent-engine',
  'agent-capabilities-rules',
  'agent-capabilities-skills',
  'agent-capabilities-mcp'
]

function ensureActiveSessionAfterListChange(
  agentStore: ReturnType<typeof useAgentWorkspaceStore>
): void {
  const list = agentStore.sessions
  if (!list.length) {
    agentStore.setActiveSessionId(null)
    return
  }
  if (!list.some((s) => s.id === agentStore.activeSessionId)) {
    agentStore.setActiveSessionId(list[0].id)
  }
}

function createImportedSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export const useAgentManageUiStore = defineStore('agent-manage-ui', () => {
  const showManageDialog = ref(false)
  const manageDialogType = ref<AgentManageDialogType>(null)
  const pendingAgentDraft = ref<PendingAgentDraft | null>(null)
  /** 主页 Agent 输入框发送：打开 Agent 标签后由 AgentView 消费并新建会话提交 */
  const pendingHomeAgentSubmit = ref<PendingHomeAgentPayload | null>(null)

  function closeManageDialog(): void {
    showManageDialog.value = false
  }

  function openManageDialog(command: Exclude<AgentManageDialogType, null>): void {
    manageDialogType.value = command
    showManageDialog.value = true
  }

  async function importSessionFile(): Promise<void> {
    const agentStore = useAgentWorkspaceStore()
    await agentStore.init()

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const data = JSON.parse(text)

        const session = agentSessionManager.deserializeSession(data, {
          importDependencies: true,
          overwriteDependencies: false
        })

        const existingIds = new Set(agentStore.sessions.map((s) => s.id))
        const importedSessionId = existingIds.has(session.id)
          ? createImportedSessionId()
          : session.id

        const legacySession: AgentSession = {
          id: importedSessionId,
          title: session.title,
          description: session.description,
          createdAt: new Date(session.createdAt).toISOString(),
          updatedAt: new Date(session.updatedAt).toISOString(),
          messages: session.messages,
          activeToolIds: [],
          agentConfigId: session.agentConfigId,
          messageQueue: session.messageQueue,
          referenceStore: session.referenceStore,
          publicContext: session.publicContext,
          executionNodes: session.executionNodes,
          status: session.status
        }

        agentStore.setSessions([legacySession, ...agentStore.sessions])
        ensureActiveSessionAfterListChange(agentStore)
        agentStore.setActiveSessionId(importedSessionId)
        agentStore.setOpenTabIds([
          importedSessionId,
          ...agentStore.openTabIds.filter((id) => id !== importedSessionId)
        ])
        agentStore.touchSession()
        notifySuccess(i18n.global.t('agent.sessions.importSuccess'))
      } catch (error) {
        notifyError(error instanceof Error ? error.message : String(error))
      }
    }
    input.click()
  }

  /** 与原先 AgentView 设置菜单一致：import-session 直接调文件选择，其余打开对话框 */
  function openManage(command: string): void {
    if (command === 'import-session') {
      void importSessionFile()
      return
    }
    if (!ALLOWED_DIALOG_COMMANDS.includes(command as Exclude<AgentManageDialogType, null>)) {
      return
    }
    openManageDialog(command as Exclude<AgentManageDialogType, null>)
  }

  /** 能力管理「AI 辅助创建」：关闭对话框，可选打开 Agent 标签，由 AgentView 挂载后消费 pending */
  function requestAgentDraftFromCapabilities(payload: {
    draft: string
    sessionTitle: string
    focusAgentTab: boolean
  }): void {
    closeManageDialog()
    pendingAgentDraft.value = {
      draft: payload.draft,
      sessionTitle: payload.sessionTitle
    }
    if (payload.focusAgentTab) {
      const workspace = useWorkspace()
      workspace.openSystemTab('/agent', i18n.global.t('headMenu.agent'))
    }
  }

  function takePendingAgentDraft(): PendingAgentDraft | null {
    const p = pendingAgentDraft.value
    pendingAgentDraft.value = null
    return p
  }

  function setPendingHomeAgentSubmit(payload: PendingHomeAgentPayload): void {
    const content = payload.content ?? ''
    const refs = Array.isArray(payload.references) ? payload.references : []
    const textOnly = content.replace(/@\[[^\]]*\]/g, '').trim()
    const hasAtTokens = /@\[[^\]]+\]/.test(content)
    if (!textOnly && !hasAtTokens && refs.length === 0) {
      pendingHomeAgentSubmit.value = null
      return
    }
    pendingHomeAgentSubmit.value = {
      content,
      references: refs,
      ...(payload.enableReasoning === true ? { enableReasoning: true } : {})
    }
  }

  function takePendingHomeAgentSubmit(): PendingHomeAgentPayload | null {
    const v = pendingHomeAgentSubmit.value
    pendingHomeAgentSubmit.value = null
    return v
  }

  return {
    showManageDialog,
    manageDialogType,
    pendingAgentDraft,
    pendingHomeAgentSubmit,
    openManage,
    closeManageDialog,
    importSessionFile,
    requestAgentDraftFromCapabilities,
    takePendingAgentDraft,
    setPendingHomeAgentSubmit,
    takePendingHomeAgentSubmit
  }
})
