/**
 * 根据 mcp-servers.json 连接各 MCP 服务、列举工具并写入注册表 + 向量。
 */

import { Client } from '@modelcontextprotocol/sdk/client'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import ragService from './rag-service'
import {
  registerMcpTools,
  getMcpRegistryId,
  setMcpToolEmbedding,
  deleteMcpToolsByServerName,
  deleteMcpToolsNotMatchingServerNames,
  type McpPermissionLevel
} from '../database/agent-capabilities-db'
import type { McpServerEntry, McpServersConfigFile } from './mcp-servers-config'

const LIST_TOOLS_TIMEOUT_MS = 120_000

function inferPermission(toolName: string, description?: string): McpPermissionLevel {
  const blob = `${toolName} ${description || ''}`.toLowerCase()
  if (
    /\b(delete|remove|drop|exec|shell|bash|sh\b|powershell|format|rm\s|mv\s|chmod|curl\s|wget\s)/i.test(
      blob
    )
  ) {
    return 'dangerous'
  }
  if (/\b(write|update|patch|post|put|send|publish|install)\b/i.test(blob)) {
    return 'restricted'
  }
  return 'safe'
}

async function registerToolsWithEmbeddings(
  tools: Array<{
    serverName: string
    toolName: string
    description?: string
    inputSchema?: unknown
    permissionLevel: McpPermissionLevel
  }>
): Promise<void> {
  if (!tools.length) return
  registerMcpTools(tools)
  for (const t of tools) {
    const id = getMcpRegistryId(t.serverName || '', t.toolName)
    if (id != null) {
      const embedText = `${t.toolName}\n${t.description || ''}`
      const { vector } = await ragService.embedForAgentCapabilities(embedText)
      setMcpToolEmbedding(id, vector)
    }
  }
}

/** 供同步与运行时 callTool 复用：按单条配置建立 MCP 传输并连接 */
export async function connectClientForEntry(
  client: Client,
  serverName: string,
  entry: McpServerEntry
): Promise<void> {
  const urlStr = entry.url?.trim()
  if (urlStr) {
    const u = new URL(urlStr)
    const transport = new StreamableHTTPClientTransport(u)
    await client.connect(transport)
    return
  }

  const command = entry.command?.trim()
  if (!command) {
    throw new Error(`Server "${serverName}": missing command or url`)
  }

  const transport = new StdioClientTransport({
    command,
    args: entry.args ?? [],
    env: entry.env,
    cwd: entry.cwd,
    stderr: 'pipe'
  })
  await client.connect(transport)
}

export interface McpServerProbeResult {
  server: string
  ok: boolean
  toolCount?: number
  message?: string
}

export async function probeMcpServersFromConfig(
  config: McpServersConfigFile
): Promise<McpServerProbeResult[]> {
  const names = Object.keys(config.mcpServers || {})
  const results: McpServerProbeResult[] = []

  for (const name of names) {
    const entry = config.mcpServers[name]
    const client = new Client({ name: 'metadoc-mcp-probe', version: '1.0.0' })
    try {
      await connectClientForEntry(client, name, entry)
      const lt = await client.listTools({}, { signal: AbortSignal.timeout(LIST_TOOLS_TIMEOUT_MS) })
      const tools = lt?.tools ?? []
      results.push({ server: name, ok: true, toolCount: tools.length })
    } catch (e) {
      results.push({
        server: name,
        ok: false,
        message: e instanceof Error ? e.message : String(e)
      })
    } finally {
      try {
        await client.close()
      } catch {
        /* ignore */
      }
    }
  }

  return results
}

export interface McpSyncSummary {
  servers: McpServerProbeResult[]
  registeredTotal: number
}

/**
 * 同步：移除配置中已删除的服务工具；对每个服务连接成功后替换该服务在库中的工具列表。
 */
export async function syncMcpToolsFromConfig(
  config: McpServersConfigFile
): Promise<McpSyncSummary> {
  const names = Object.keys(config.mcpServers || {})
  deleteMcpToolsNotMatchingServerNames(names)

  const servers: McpServerProbeResult[] = []
  let registeredTotal = 0

  for (const name of names) {
    const entry = config.mcpServers[name]
    const client = new Client({ name: 'metadoc-mcp-sync', version: '1.0.0' })
    try {
      await connectClientForEntry(client, name, entry)
      const lt = await client.listTools({}, { signal: AbortSignal.timeout(LIST_TOOLS_TIMEOUT_MS) })
      const tools = lt?.tools ?? []

      deleteMcpToolsByServerName(name)

      const batch = tools.map((tool) => ({
        serverName: name,
        toolName: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        permissionLevel: inferPermission(tool.name, tool.description)
      }))

      await registerToolsWithEmbeddings(batch)
      registeredTotal += batch.length
      servers.push({ server: name, ok: true, toolCount: batch.length })
    } catch (e) {
      servers.push({
        server: name,
        ok: false,
        message: e instanceof Error ? e.message : String(e)
      })
    } finally {
      try {
        await client.close()
      } catch {
        /* ignore */
      }
    }
  }

  return { servers, registeredTotal }
}
