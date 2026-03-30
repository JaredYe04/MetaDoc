import type { AgentSession } from '../types/agent'

/** 取某会话在输入框中的草稿（当前激活会话读共享 composer，否则读持久化 map） */
export function getSessionComposerDraft(
  sessionId: string,
  activeSessionId: string | null,
  composerInput: string,
  composerInputBySessionId: Record<string, string>
): string {
  if (sessionId === activeSessionId) return composerInput
  return composerInputBySessionId[sessionId] ?? ''
}

/**
 * 是否仍为「未实质使用的新会话」：无用户消息、无 referenceStore 附件、输入无草稿、无排队/执行节点。
 * 仅有助手问候等初始消息视为未使用。
 */
export function isAgentSessionPristine(session: AgentSession, composerDraft: string): boolean {
  if ((composerDraft ?? '').trim().length > 0) return false
  if ((session.referenceStore?.length ?? 0) > 0) return false
  if (session.messages.some((m) => m.role === 'user')) return false
  if ((session.messageQueue?.length ?? 0) > 0) return false
  if ((session.composerSendQueue?.length ?? 0) > 0) return false
  if ((session.executionNodes?.length ?? 0) > 0) return false
  return true
}

/** 在已打开的 tab id 中选出 updatedAt（回退 createdAt）最新的一条会话 id */
export function pickLatestSessionIdAmongOpenTabs(
  openTabIds: string[],
  sessions: AgentSession[]
): string | null {
  if (openTabIds.length === 0) return null
  const set = new Set(openTabIds)
  let best: AgentSession | null = null
  let bestTs = -Infinity
  for (const s of sessions) {
    if (!set.has(s.id)) continue
    const ts = new Date(s.updatedAt || s.createdAt || 0).getTime()
    if (ts >= bestTs) {
      bestTs = ts
      best = s
    }
  }
  return best?.id ?? null
}
