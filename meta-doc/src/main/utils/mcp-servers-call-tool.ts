/**
 * 按当前磁盘上的 mcp-servers.json 连接指定服务并调用单个 MCP 工具（短时连接）。
 */

import { Client } from '@modelcontextprotocol/sdk/client'
import { connectClientForEntry } from './mcp-servers-sync'
import type { McpServersConfigFile } from './mcp-servers-config'

const CALL_TOOL_TIMEOUT_MS = 180_000

export type CallMcpToolOutcome = { ok: true; result: unknown } | { ok: false; error: string }

export async function callMcpToolWithConfig(
  config: McpServersConfigFile,
  serverName: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<CallMcpToolOutcome> {
  const entry = config.mcpServers?.[serverName]
  if (!entry) {
    return { ok: false, error: `Unknown MCP server "${serverName}"` }
  }

  const client = new Client({ name: 'metadoc-mcp-call', version: '1.0.0' })
  try {
    await connectClientForEntry(client, serverName, entry)
    const result = await client.callTool({ name: toolName, arguments: args }, undefined, {
      signal: AbortSignal.timeout(CALL_TOOL_TIMEOUT_MS)
    })
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    try {
      await client.close()
    } catch {
      /* ignore */
    }
  }
}
