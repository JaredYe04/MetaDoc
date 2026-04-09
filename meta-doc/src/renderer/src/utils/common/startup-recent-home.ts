/**
 * 「启动时打开最近文档 + 自动打开主页」的确定性结算（无定时器）：
 * - App 在 emit open-doc 前 arm，并监听一次性 startup-recent-home-settled
 * - 主进程若未向发起窗口投递 open-doc-success，发 open-doc-not-delivered，此处 disarm 并结算失败
 * - Main.vue 在 workspace 打开流程中 take guard：成功 markSuccess，否则 finally 结算失败
 */

import messageBridge from '../bridge/message-bridge'
import eventBus from '../event-bus'

function normalizePathForStartupMatch(p: string): string {
  const isWin =
    (typeof window !== 'undefined' &&
      (window as Window & { electron?: { process?: { platform?: string } } }).electron?.process
        ?.platform === 'win32') ||
    (typeof navigator !== 'undefined' && /Win/i.test(navigator.userAgent || ''))
  let n = (p || '').replace(/\\/g, '/')
  if (isWin) n = n.toLowerCase()
  return n
}

let armedPathNorm: string | null = null

export function armAwaitingGlobalHomeAfterRecentOpen(rawPath: string): void {
  armedPathNorm = normalizePathForStartupMatch(rawPath)
}

export type StartupRecentHomeGuard = {
  markSuccess(): void
  /** 本窗口内该次打开流程结束时若尚未 markSuccess，则结算为不打开主页 */
  finalizeIfStillPending(): void
}

/**
 * 若已 arm 且路径一致，占用 arm 并返回 guard；否则返回 null。
 */
export function takeStartupRecentHomeGuardIfArmed(resolvedPath: string): StartupRecentHomeGuard | null {
  if (!armedPathNorm || !resolvedPath) return null
  const norm = normalizePathForStartupMatch(resolvedPath)
  if (norm !== armedPathNorm) return null
  armedPathNorm = null

  type Settled = 'pending' | 'done'
  let settled: Settled = 'pending'
  const settle = (openHome: boolean) => {
    if (settled !== 'pending') return
    settled = 'done'
    eventBus.emit('startup-recent-home-settled', { openHome })
  }
  return {
    markSuccess() {
      settle(true)
    },
    finalizeIfStillPending() {
      settle(false)
    }
  }
}

/** 主进程确认未向本窗口发送 open-doc-success 时调用 */
export function notifyOpenDocNotDeliveredForPath(rawPath: string): void {
  if (!armedPathNorm || !rawPath) return
  if (normalizePathForStartupMatch(rawPath) !== armedPathNorm) return
  armedPathNorm = null
  eventBus.emit('startup-recent-home-settled', { openHome: false })
}

let ipcRegistered = false

/** 在 App 入口注册一次即可 */
export function registerStartupRecentHomeMainBridge(): void {
  if (ipcRegistered) return
  ipcRegistered = true
  messageBridge.on('open-doc-not-delivered', (_e: unknown, payload: { path?: string }) => {
    const p = typeof payload?.path === 'string' ? payload.path : ''
    if (p) notifyOpenDocNotDeliveredForPath(p)
  })
}
