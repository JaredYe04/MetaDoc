/**
 * Agent CLI 单轮执行：与 GUI 同链路，真实调用 executor + 真实工具。
 * 供 main 通过 IPC agent-cli-run 驱动，用于调试/测试。
 * 使用 singleStep：每轮只执行一步（一次 LLM 或一次工具调用后即停），便于终端逐步观察。
 */

import { useAgentWorkspaceStore } from '../stores/agent-workspace-store'
import { agentSessionManager } from './agent-framework/agent-session-manager'
import { agentConfigManager } from './agent-framework/agent-config-manager'
import { agentEngineManager } from './agent-framework/agent-engine-manager'
import type { AgentSession } from '../types/agent'
import type { ChatAgentMessage } from '../types/agent'
import { createRendererLogger } from './logger'
import messageBridge from '../bridge/message-bridge'

const logger = createRendererLogger('AgentCliRunner')

const DEFAULT_ENGINE_ID = 'default-autogpt-engine'
const CLI_SESSION_TITLE = 'CLI'

function createUserMessage(content: string): ChatAgentMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    role: 'user',
    type: 'chat',
    markdown: content,
    referenceIds: []
  }
}

/**
 * 执行一轮 agent：确保有 session，追加用户消息，跑 executor，返回最后一条 assistant 的 markdown。
 */
export async function runAgentCliTurn(userContent: string): Promise<string> {
  const store = useAgentWorkspaceStore()

  // 确保有工作区并加载过会话（CLI 可能先于界面加载）
  if (!store.workspaceRoot) {
    await store.refreshWorkspaceRoot()
  }
  if (store.sessions.length === 0) {
    await store.loadFromMetadoc()
  }

  const defaultConfigId = agentConfigManager.getDefaultConfigId()
  let session: AgentSession | null = store.activeSession ?? null
  if (!session || session.agentConfigId !== defaultConfigId) {
    const existing = store.sessions.find((s) => s.agentConfigId === defaultConfigId)
    if (existing) {
      session = existing
      store.setActiveSessionId(existing.id)
    } else {
      session = agentSessionManager.createSession(defaultConfigId, CLI_SESSION_TITLE)
      store.sessions.push(session)
      store.setActiveSessionId(session.id)
    }
  }

  const engineId = store.selectedEngineId || DEFAULT_ENGINE_ID
  const engine = agentEngineManager.getEngine(engineId)
  if (!engine) {
    throw new Error(`Agent CLI: engine not found: ${engineId}`)
  }

  const agentConfig = agentConfigManager.getConfig(session.agentConfigId!)
  if (!agentConfig) {
    throw new Error(`Agent CLI: agent config not found: ${session.agentConfigId}`)
  }

  const userMessage = createUserMessage(userContent)
  session.messages.push(userMessage)
  store.touchSession()

  const { AgentEngineExecutorFactory } = await import('./agent-framework/agent-engine-executor')
  const executor = AgentEngineExecutorFactory.create(engine, session, agentConfig, {
    singleStep: true,
    onProgress: (p) => {
      messageBridge.send('agent-cli-progress', `${p.stage}: ${p.message || ''}`)
    }
  })

  await executor.execute(userContent)

  session.status = 'idle'
  store.touchSession()

  const messages = session.messages
  const lastAssistantIdx =
    messages
      .map((m, i) => (m.role === 'assistant' ? i : -1))
      .filter((i) => i >= 0)
      .pop() ?? -1
  const lastAssistant =
    lastAssistantIdx >= 0 ? (messages[lastAssistantIdx] as ChatAgentMessage) : undefined
  let text = lastAssistant?.markdown ?? ''

  // 单步模式下若有工具消息在最后一条 assistant 之后，附上工具结果摘要便于终端查看
  if (lastAssistantIdx >= 0) {
    const toolLines: string[] = []
    for (let i = lastAssistantIdx + 1; i < messages.length; i++) {
      const m = messages[i] as any
      if (m.role === 'tool' && m.type === 'tool') {
        const name = m.tool?.name ?? m.toolId ?? 'tool'
        const status = m.status === 'succeeded' ? '成功' : '失败'
        const summary =
          m.summary ||
          (m.outputs?.[0]?.data != null ? String(m.outputs[0].data).slice(0, 200) : '') ||
          m.error ||
          ''
        toolLines.push(`[${name}] ${status} ${summary}`)
      }
    }
    if (toolLines.length > 0) {
      text += '\n\n--- 工具执行结果 ---\n' + toolLines.join('\n')
    }
  }

  logger.debug('[Agent CLI] turn done, last assistant length:', text.length)
  return text
}
