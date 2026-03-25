/**
 * 外部 MCP 工具适配层：描述 + 输入 schema + 权限分级；注册到主进程 SQLite 供 RAG 检索
 */

import messageBridge from '../../bridge/message-bridge'

export type McpPermissionLevel = 'safe' | 'restricted' | 'dangerous'

export interface McpToolDescriptor {
  serverName: string
  toolName: string
  description?: string
  inputSchema?: unknown
  /** 未给出时由调用方使用启发式或默认为 safe */
  permissionLevel?: McpPermissionLevel
}

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

/**
 * 将 MCP 工具元数据同步到主进程注册表并写入独立向量行（与知识库 vec 分离）
 */
export async function syncMcpToolsToRegistry(descriptors: McpToolDescriptor[]): Promise<{
  success: boolean
  message?: string
}> {
  if (!descriptors.length) return { success: true }
  const tools = descriptors.map((d) => ({
    serverName: d.serverName || '',
    toolName: d.toolName,
    description: d.description,
    inputSchema: d.inputSchema,
    permissionLevel: d.permissionLevel ?? inferPermission(d.toolName, d.description)
  }))
  const res = await messageBridge.invoke('agent-capabilities-register-mcp-tools', { tools })
  if (res && typeof res === 'object' && (res as { success?: boolean }).success === false) {
    return { success: false, message: (res as { message?: string }).message }
  }
  return { success: true }
}
