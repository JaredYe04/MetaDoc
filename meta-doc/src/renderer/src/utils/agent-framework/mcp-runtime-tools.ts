/**
 * 将 SQLite 中已同步的 MCP 工具注册为 Agent 可调用工具，并在主进程执行 callTool。
 */

import type { AgentToolConfig, MCPToolConfig, ToolCallback } from '../../types/agent-tool'
import messageBridge from '../../bridge/message-bridge'
import { agentToolManager } from '../agent-tool-manager'

export const MCP_AGENT_TOOL_ID_PREFIX = 'mcp__'

function sanitizeSegment(s: string): string {
  return (
    s
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'x'
  )
}

/** 稳定、可复现的 Agent 工具 ID（与 server/tool 名对应） */
export function makeMcpAgentToolId(serverName: string, toolName: string): string {
  const a = sanitizeSegment(serverName)
  const b = sanitizeSegment(toolName)
  return `${MCP_AGENT_TOOL_ID_PREFIX}${a}__${b}`.slice(0, 120)
}

function mcpCallResultToText(result: unknown): string {
  if (result == null) {
    return ''
  }
  if (typeof result === 'string') {
    return result
  }
  if (typeof result !== 'object') {
    return String(result)
  }
  const o = result as { content?: unknown }
  const content = o.content
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (const block of content) {
      if (block && typeof block === 'object') {
        const b = block as { type?: string; text?: string }
        if (b.type === 'text' && typeof b.text === 'string') {
          parts.push(b.text)
        } else {
          parts.push(JSON.stringify(block))
        }
      } else {
        parts.push(String(block))
      }
    }
    const joined = parts.join('\n\n').trim()
    return joined || JSON.stringify(result, null, 2)
  }
  return JSON.stringify(result, null, 2)
}

const INTERNAL_PARAM_KEYS = new Set([
  '_mcpExecutionConfirmed',
  '_sessionId',
  '_session',
  '_userMessageId'
])

function stripInternalParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    if (!INTERNAL_PARAM_KEYS.has(k)) {
      out[k] = v
    }
  }
  return out
}

type ListMcpRow = {
  server_name: string
  tool_name: string
  description: string | null
  input_schema_json: string | null
  permission_level: MCPToolConfig['permissionLevel']
  enabled: number
}

/**
 * 从主进程拉取 MCP 注册表并重建 `mcp__*` 动态工具（覆盖旧列表）。
 */
export async function refreshMcpToolsInAgentToolManager(): Promise<void> {
  const res = await messageBridge.invoke('agent-capabilities-list-mcp-tools')
  if (!res?.success) {
    return
  }

  const rows = (Array.isArray(res.tools) ? res.tools : []) as ListMcpRow[]
  agentToolManager.removeToolsByIdPrefix(MCP_AGENT_TOOL_ID_PREFIX)

  const usedIds = new Set<string>()

  for (const row of rows) {
    if (row.enabled !== 1) {
      continue
    }
    let baseId = makeMcpAgentToolId(row.server_name, row.tool_name)
    let id = baseId
    let n = 0
    while (usedIds.has(id)) {
      n += 1
      id = `${baseId}_${n}`.slice(0, 128)
    }
    usedIds.add(id)

    let inputSchema: unknown
    if (row.input_schema_json) {
      try {
        inputSchema = JSON.parse(row.input_schema_json) as unknown
      } catch {
        inputSchema = undefined
      }
    }

    const permissionLevel = row.permission_level ?? 'safe'
    const mcpConfig: MCPToolConfig = {
      serverName: row.server_name,
      toolName: row.tool_name,
      permissionLevel,
      inputSchema
    }

    const displayName = `[MCP:${row.server_name}] ${row.tool_name}`
    const desc =
      row.description?.trim() || `MCP tool "${row.tool_name}" on server "${row.server_name}"`

    const serverName = row.server_name
    const toolName = row.tool_name

    const callback: ToolCallback = async (params, _signal, _onUpdate) => {
      const args = stripInternalParams(params)
      const r = await messageBridge.invoke('agent-mcp-call-tool', {
        serverName,
        toolName,
        arguments: args
      })
      if (!r?.success) {
        return { status: 'failed', error: r?.message || 'agent-mcp-call-tool failed' }
      }
      const text = mcpCallResultToText(r.result)
      return {
        status: 'succeeded',
        result: text,
        data: { content: { raw: r.result, text }, format: 'json' }
      }
    }

    const config: AgentToolConfig = {
      id,
      name: displayName,
      description: desc,
      origin: 'mcp',
      instruction: desc,
      mcpConfig,
      inputSchema,
      callback,
      editable: false,
      enabled: true
    }

    agentToolManager.registerTool(config)
  }
}
