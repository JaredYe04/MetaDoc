/**
 * 终端会话上下文管理
 * 支持 Agent 在同一终端中连续工作（共享 cwd），或管理多个并行会话
 */

export interface SessionContext {
  sessionId: string
  cwd?: string
  lastExitCode?: number
  lastCommand?: string
  createdAt: number
}

const sessionMap = new Map<string, SessionContext>()

const MAX_SESSIONS = 50
const SESSION_TTL_MS = 30 * 60 * 1000 // 30 分钟无活动则清理

/** 获取会话的 cwd，若不存在返回 undefined */
export function getSessionCwd(sessionId: string): string | undefined {
  const ctx = sessionMap.get(sessionId)
  if (!ctx) return undefined
  return ctx.cwd
}

/** 更新会话的 cwd */
export function setSessionCwd(sessionId: string, cwd: string): void {
  let ctx = sessionMap.get(sessionId)
  if (!ctx) {
    ctx = { sessionId, cwd, createdAt: Date.now() }
    sessionMap.set(sessionId, ctx)
    pruneIfNeeded()
  } else {
    ctx.cwd = cwd
    ctx.createdAt = Date.now()
  }
}

/** 更新会话执行结果（用于后续命令继承 cwd） */
export function updateSessionAfterRun(
  sessionId: string,
  opts: { cwd?: string; exitCode?: number; command?: string }
): void {
  let ctx = sessionMap.get(sessionId)
  if (!ctx) {
    ctx = { sessionId, ...opts, createdAt: Date.now() }
    sessionMap.set(sessionId, ctx)
    pruneIfNeeded()
  } else {
    if (opts.cwd !== undefined) ctx.cwd = opts.cwd
    if (opts.exitCode !== undefined) ctx.lastExitCode = opts.exitCode
    if (opts.command !== undefined) ctx.lastCommand = opts.command
    ctx.createdAt = Date.now()
  }
}

/** 解析命令中的 cd，尝试提取目标路径（简单实现） */
export function tryParseCdTarget(command: string): string | undefined {
  const trimmed = command.trim()
  const lower = trimmed.toLowerCase()
  if (!lower.startsWith('cd')) return undefined
  const rest = trimmed.slice(2).trim()
  if (!rest) return undefined
  const match = rest.match(/^["']?([^"'\s]+)["']?$/) || rest.match(/^(\S+)/)
  return match ? match[1] : undefined
}

/** 获取或解析本次执行的 cwd，用于更新会话 */
export function resolveSessionCwd(
  sessionId: string,
  explicitCwd: string | undefined,
  command: string
): string | undefined {
  if (explicitCwd) return explicitCwd
  const cdTarget = tryParseCdTarget(command)
  if (cdTarget) {
    const current = getSessionCwd(sessionId)
    if (current) {
      // 简单处理：绝对路径直接返回，相对路径需要 resolve（这里简化，由主进程处理）
      return cdTarget
    }
  }
  return getSessionCwd(sessionId)
}

/** 清理过期会话 */
function pruneIfNeeded(): void {
  if (sessionMap.size <= MAX_SESSIONS) return
  const now = Date.now()
  const entries = Array.from(sessionMap.entries())
  entries.sort((a, b) => a[1].createdAt - b[1].createdAt)
  const toDelete = entries.slice(0, sessionMap.size - MAX_SESSIONS + 5)
  for (const [id] of toDelete) {
    if ((sessionMap.get(id)?.createdAt ?? 0) + SESSION_TTL_MS < now) {
      sessionMap.delete(id)
    }
  }
}

/** 清除指定会话（测试用） */
export function clearSession(sessionId: string): void {
  sessionMap.delete(sessionId)
}

/** 清除所有会话（测试用） */
export function clearAllSessions(): void {
  sessionMap.clear()
}

/** 获取所有会话 ID（测试用） */
export function getAllSessionIds(): string[] {
  return Array.from(sessionMap.keys())
}
