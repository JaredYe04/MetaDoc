/**
 * MCP 服务列表：单一 JSON 配置文件（userData/mcp-servers.json），与 Cursor / Claude Desktop 风格对齐。
 */

import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export const MCP_SERVERS_CONFIG_FILENAME = 'mcp-servers.json'

export interface McpServerEntry {
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  /** Streamable HTTP / MCP URL */
  url?: string
}

export interface McpServersConfigFile {
  mcpServers: Record<string, McpServerEntry>
}

export const DEFAULT_MCP_SERVERS_JSON = `{
  "mcpServers": {}
}
`

export function getMcpServersConfigPath(): string {
  return path.join(app.getPath('userData'), MCP_SERVERS_CONFIG_FILENAME)
}

export function readMcpServersConfigRaw(): {
  content: string
  path: string
  createdDefault: boolean
} {
  const cfgPath = getMcpServersConfigPath()
  if (!fs.existsSync(cfgPath)) {
    const initial = DEFAULT_MCP_SERVERS_JSON
    try {
      fs.writeFileSync(cfgPath, initial, 'utf-8')
    } catch {
      // 若不可写，仍返回默认内容供编辑器展示
      return { content: initial, path: cfgPath, createdDefault: true }
    }
    return { content: initial, path: cfgPath, createdDefault: true }
  }
  const content = fs.readFileSync(cfgPath, 'utf-8')
  return { content, path: cfgPath, createdDefault: false }
}

export function writeMcpServersConfigRaw(content: string): void {
  const cfgPath = getMcpServersConfigPath()
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true })
  fs.writeFileSync(cfgPath, content, 'utf-8')
}

export interface McpConfigValidationResult {
  ok: boolean
  errors: string[]
  parsed?: McpServersConfigFile
}

export function validateMcpServersConfigText(text: string): McpConfigValidationResult {
  const errors: string[] = []
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (e) {
    errors.push(e instanceof SyntaxError ? `JSON: ${e.message}` : 'JSON parse failed')
    return { ok: false, errors }
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push('Root must be a JSON object')
    return { ok: false, errors }
  }

  const root = data as Record<string, unknown>
  const mcpServers = root.mcpServers
  if (!mcpServers || typeof mcpServers !== 'object' || Array.isArray(mcpServers)) {
    errors.push('Missing or invalid "mcpServers" object')
    return { ok: false, errors }
  }

  const servers = mcpServers as Record<string, unknown>
  for (const name of Object.keys(servers)) {
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      errors.push(`Invalid server key "${name}" (use letters, digits, ._- only)`)
    }
    const entry = servers[name]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`Server "${name}" must be an object`)
      continue
    }
    const o = entry as Record<string, unknown>
    const cmd = typeof o.command === 'string' ? o.command.trim() : ''
    const url = typeof o.url === 'string' ? o.url.trim() : ''
    if (cmd && url) {
      errors.push(`Server "${name}": specify either "command" (stdio) or "url" (HTTP), not both`)
    } else if (!cmd && !url) {
      errors.push(`Server "${name}": need "command" for stdio or "url" for HTTP transport`)
    }
    if (o.args !== undefined && !Array.isArray(o.args)) {
      errors.push(`Server "${name}": "args" must be an array of strings`)
    } else if (Array.isArray(o.args) && o.args.some((a) => typeof a !== 'string')) {
      errors.push(`Server "${name}": "args" must contain only strings`)
    }
    if (
      o.env !== undefined &&
      (typeof o.env !== 'object' || o.env === null || Array.isArray(o.env))
    ) {
      errors.push(`Server "${name}": "env" must be an object of string values`)
    } else if (o.env && typeof o.env === 'object' && !Array.isArray(o.env)) {
      for (const [ek, ev] of Object.entries(o.env as Record<string, unknown>)) {
        if (typeof ev !== 'string') {
          errors.push(`Server "${name}": env.${ek} must be a string`)
        }
      }
    }
    if (o.cwd !== undefined && typeof o.cwd !== 'string') {
      errors.push(`Server "${name}": "cwd" must be a string`)
    }
  }

  if (errors.length) {
    return { ok: false, errors }
  }

  const parsed: McpServersConfigFile = { mcpServers: {} as Record<string, McpServerEntry> }
  for (const name of Object.keys(servers)) {
    const o = servers[name] as Record<string, unknown>
    const entry: McpServerEntry = {}
    if (typeof o.command === 'string' && o.command.trim()) entry.command = o.command.trim()
    if (typeof o.url === 'string' && o.url.trim()) entry.url = o.url.trim()
    if (Array.isArray(o.args)) entry.args = o.args.filter((a): a is string => typeof a === 'string')
    if (o.env && typeof o.env === 'object' && !Array.isArray(o.env)) {
      const env: Record<string, string> = {}
      for (const [k, v] of Object.entries(o.env as Record<string, unknown>)) {
        if (typeof v === 'string') env[k] = v
      }
      if (Object.keys(env).length) entry.env = env
    }
    if (typeof o.cwd === 'string' && o.cwd.trim()) entry.cwd = o.cwd.trim()
    parsed.mcpServers[name] = entry
  }

  return { ok: true, errors: [], parsed }
}
