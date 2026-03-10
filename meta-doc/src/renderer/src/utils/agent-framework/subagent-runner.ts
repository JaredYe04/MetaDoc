/**
 * Subagent 执行器
 * 在父会话上下文中以独立会话运行 Subagent，返回消息列表与最终结果文本
 * 若传入 parentInvocationId，会通过 tool-update 事件向父级 Tool 消息推送子会话进度，供 SubagentDisplay 流式展示
 */

import type { AgentSession, AgentConfig } from '../../types/agent-framework'
import type { AgentMessage } from '../../types/agent'
import { agentConfigManager } from './agent-config-manager'
import { agentEngineManager } from './agent-engine-manager'
import { AgentEngineExecutorFactory } from './agent-engine-executor'
import { createRendererLogger } from '../logger'
import { emitToolUpdate, emitToolComplete } from '../agent-tools/tool-display-communication'

const logger = createRendererLogger('SubagentRunner')

export interface SubagentRunResult {
  /** Subagent 会话中的全部消息（用于 SubagentDisplay 套娃展示） */
  subagentMessages: AgentMessage[]
  /** 给主 Agent 的文本结果（最后一条 assistant 的 markdown 或汇总） */
  resultText: string
  /** 是否执行成功 */
  status: 'succeeded' | 'failed'
  /** 失败时的错误信息 */
  error?: string
}

const SUBAGENT_POLL_INTERVAL_MS = 400

/**
 * 运行 Subagent：创建临时会话，执行引擎，收集消息与结果
 * @param parentInvocationId 父级 tool 消息的 invocationId（tool_call_id），传入时会周期性发送 tool-update 便于 SubagentDisplay 流式显示
 */
export async function runSubagent(
  subagentConfigId: string,
  params: { prompt: string; [key: string]: unknown },
  parentSession: AgentSession,
  signal?: AbortSignal,
  parentInvocationId?: string
): Promise<SubagentRunResult> {
  const config = agentConfigManager.getConfig(subagentConfigId)
  if (!config || !(config as any).isSubagent) {
    const err = `Subagent 配置不存在或不是 Subagent: ${subagentConfigId}`
    logger.warn(err)
    return {
      subagentMessages: [],
      resultText: err,
      status: 'failed',
      error: err
    }
  }

  const userPrompt = typeof params.prompt === 'string' ? params.prompt : String(params.prompt || '')
  if (!userPrompt.trim()) {
    const err = 'Subagent 调用缺少有效 prompt'
    return { subagentMessages: [], resultText: err, status: 'failed', error: err }
  }

  const sessionId = `subagent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const now = Date.now()

  // 深拷贝 publicContext，避免与父 session 共享引用；视图切换时若改写父 session.publicContext.document 不会影响已启动的 subagent
  let publicContext: AgentSession['publicContext']
  if (parentSession.publicContext && typeof parentSession.publicContext === 'object') {
    try {
      publicContext = JSON.parse(JSON.stringify(parentSession.publicContext)) as AgentSession['publicContext']
    } catch {
      publicContext = { ...parentSession.publicContext, currentTime: new Date().toISOString() }
    }
  } else {
    publicContext = { currentTime: new Date().toISOString() }
  }

  const tempSession: AgentSession = {
    entityType: 'agent-session',
    id: sessionId,
    title: `Subagent: ${subagentConfigId}`,
    agentConfigId: subagentConfigId,
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: `subagent-user-${now}`,
        role: 'user',
        type: 'chat',
        timestamp: new Date(now).toISOString(),
        markdown: userPrompt
      } as AgentMessage
    ],
    messageQueue: [],
    referenceStore: parentSession.referenceStore ? [...parentSession.referenceStore] : [],
    publicContext,
    executionNodes: [],
    status: 'idle',
    enableBuiltInDocumentReference: parentSession.enableBuiltInDocumentReference ?? true
  }

  const engine = agentEngineManager.getEngine('default-autogpt-engine') || agentEngineManager.getDefaultEngine()
  if (!engine) {
    const err = '未找到可用的 Agent 引擎'
    return { subagentMessages: [], resultText: err, status: 'failed', error: err }
  }

  const executor = AgentEngineExecutorFactory.create(
    engine,
    tempSession,
    config as AgentConfig,
    { signal }
  )

  let pollTimer: ReturnType<typeof setInterval> | null = null
  if (parentInvocationId) {
    pollTimer = setInterval(() => {
      emitToolUpdate(parentInvocationId, {
        subagentMessages: tempSession.messages.slice(),
        result: ''
      })
    }, SUBAGENT_POLL_INTERVAL_MS)
  }

  try {
    await executor.execute(userPrompt)
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    logger.error('[runSubagent] 执行异常', err)
    if (pollTimer) clearInterval(pollTimer)
    if (parentInvocationId) {
      emitToolComplete(parentInvocationId, {
        status: 'failed',
        data: { subagentMessages: tempSession.messages, result: '' },
        error: err
      })
    }
    return {
      subagentMessages: tempSession.messages,
      resultText: `Subagent 执行异常: ${err}`,
      status: 'failed',
      error: err
    }
  }

  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }

  // 取最后一条 assistant 的 markdown 作为给主 Agent 的结果
  let resultText = ''
  for (let i = tempSession.messages.length - 1; i >= 0; i--) {
    const m = tempSession.messages[i]
    if (m.role === 'assistant' && m.type === 'chat' && (m as any).markdown) {
      resultText = (m as any).markdown.trim()
      break
    }
  }
  if (!resultText) {
    resultText = '(Subagent 未返回文本结果)'
  }

  if (parentInvocationId) {
    emitToolComplete(parentInvocationId, {
      status: 'succeeded',
      data: { subagentMessages: tempSession.messages, result: resultText }
    })
  }

  return {
    subagentMessages: tempSession.messages,
    resultText,
    status: 'succeeded'
  }
}
