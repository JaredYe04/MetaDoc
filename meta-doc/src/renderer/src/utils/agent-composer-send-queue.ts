import type { AgentSession, ChatAgentMessage, ComposerSendQueueItem } from '../types/agent'
import { AIContextManager } from './agent-framework/ai-context-manager'
import { createRendererLogger } from './logger'

const composerQueueDrainLog = createRendererLogger('agent-composer-send-queue')
const composerQueueDrainRetries = new Map<string, number>()
const COMPOSER_QUEUE_DRAIN_MAX_RETRIES = 64

/**
 * 会话是否已满足「可安全发起下一轮 LLM」：无未收尾的 tool 行、无缺少 tool 消息的 tool_call_id。
 * 用于待发送队列仅在编排完整后再出队。
 */
export function isAgentSessionReadyForNextLlmTurn(session: AgentSession): boolean {
  const msgs = session.messages
  if (!Array.isArray(msgs) || msgs.length === 0) return true
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i] as {
      role?: string
      type?: string
      tool_calls?: Array<{ id?: string }>
    }
    if (m.role !== 'assistant' || m.type !== 'chat') continue
    const tcs = m.tool_calls
    if (!Array.isArray(tcs) || tcs.length === 0) continue
    const needed = new Set(
      tcs
        .map((tc) => tc?.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
    let j = i + 1
    while (j < msgs.length && msgs[j].role === 'tool') {
      const tm = msgs[j] as { tool_call_id?: string; status?: string }
      const tid = tm.tool_call_id
      if (tid && needed.has(tid)) {
        if (tm.status === 'running' || tm.status === 'pending') return false
        needed.delete(tid)
      }
      j++
    }
    if (needed.size > 0) return false
  }
  return true
}

export function clearComposerQueueDrainRetries(sessionId: string): void {
  composerQueueDrainRetries.delete(sessionId)
}

/** 会话尚未就绪时用 microtask 再试一次排空（不依赖 Vue/DOM 更新周期）；超限则打日志并放弃 */
export function retryComposerQueueDrainLater(
  sessionId: string,
  flush: (id: string) => void | Promise<void>
): void {
  const n = (composerQueueDrainRetries.get(sessionId) ?? 0) + 1
  if (n > COMPOSER_QUEUE_DRAIN_MAX_RETRIES) {
    composerQueueDrainRetries.delete(sessionId)
    composerQueueDrainLog.error('[composerSendQueue] 排空重试次数超限，已停止', { sessionId })
    return
  }
  composerQueueDrainRetries.set(sessionId, n)
  queueMicrotask(() => {
    void flush(sessionId)
  })
}

/**
 * 用户取消/中断后：补全 tool 协议占位并去掉仅空的尾部 assistant（无正文且无 tool_calls）。
 */
export function applyComposerInterruptCleanup(session: AgentSession, reason: string): void {
  AIContextManager.finalizeInterruptedToolRounds(session, reason)
  const messages = session.messages
  if (!messages?.length) return
  const last = messages[messages.length - 1]
  if (last.role !== 'assistant' || last.type !== 'chat') return
  const md = (last as ChatAgentMessage).markdown
  const hasToolCalls =
    Array.isArray((last as { tool_calls?: unknown[] }).tool_calls) &&
    (last as { tool_calls?: unknown[] }).tool_calls!.length > 0
  if ((!md || !String(md).trim()) && !hasToolCalls) {
    messages.pop()
  }
}

export function cloneReferenceStoreSnapshot(
  store: AgentSession['referenceStore'] | undefined
): ComposerSendQueueItem['referenceSnapshot'] {
  const list = store ?? []
  return JSON.parse(JSON.stringify(list)) as ComposerSendQueueItem['referenceSnapshot']
}

export function createComposerSendQueueItem(
  markdown: string,
  referenceSnapshot: ComposerSendQueueItem['referenceSnapshot']
): ComposerSendQueueItem {
  return {
    id: `csq-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    markdown,
    referenceSnapshot,
    createdAt: new Date().toISOString()
  }
}
