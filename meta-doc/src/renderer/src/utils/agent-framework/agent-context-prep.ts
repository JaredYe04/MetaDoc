/**
 * 每轮 Agent _turn 前准备：规则注入块、Skills 索引同步（节流）
 */

import messageBridge from '../../bridge/message-bridge'
import { createRendererLogger } from '../logger'
import { AGENT_SYSTEM_RULES_FALLBACK } from './system-rules-fallback'

const logger = createRendererLogger('AgentContextPrep')

const SKILL_SYNC_INTERVAL_MS = 60_000

function getWorkspaceRootsFromStorage(): string[] {
  try {
    const raw = localStorage.getItem('workspaceFolders')
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((p: unknown) => typeof p === 'string' && p.length > 0) : []
  } catch {
    return []
  }
}

/**
 * 将规则 Markdown 块写入 session，供 AIContextManager.buildSystemPrompt 同步拼接
 */
export async function prepareAgentTurnContext(session: unknown, _userMessage?: string): Promise<void> {
  const s = session as Record<string, unknown>
  try {
    const res = await messageBridge.invoke('agent-capabilities-get-rules-prompt')
    const text =
      res && typeof res === 'object' && (res as { success?: boolean; text?: string }).success
        ? String((res as { text?: string }).text || '').trim()
        : ''
    s.__agentRulesPromptBlock = text || AGENT_SYSTEM_RULES_FALLBACK
  } catch (e) {
    logger.warn('[prepareAgentTurnContext] rules IPC failed, using fallback', e)
    s.__agentRulesPromptBlock = AGENT_SYSTEM_RULES_FALLBACK
  }

  const now = Date.now()
  const last = typeof s.__lastSkillSyncAt === 'number' ? (s.__lastSkillSyncAt as number) : 0
  if (now - last < SKILL_SYNC_INTERVAL_MS) {
    return
  }
  const roots = getWorkspaceRootsFromStorage()
  if (roots.length === 0) {
    s.__lastSkillSyncAt = now
    return
  }
  try {
    await messageBridge.invoke('agent-capabilities-sync-skills', { workspaceRoots: roots })
  } catch (e) {
    logger.debug('[prepareAgentTurnContext] skill sync skipped', e)
  }
  s.__lastSkillSyncAt = now
}
