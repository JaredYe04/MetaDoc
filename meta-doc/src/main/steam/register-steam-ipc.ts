import fs from 'fs'
import path from 'path'
import { app, BrowserWindow, shell } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { ipcBridge } from '../bridge/ipc-bridge'
import { assertAllowedSteamCloudPath, readTextFromCloud, saveTextToCloud } from './steam-cloud'
import { STEAM_ACHIEVEMENT_API_NAMES } from '../../common/steam-achievement-registry'
import { getSteamUserInfo } from './steam-user'
import { unlockSteamAchievement } from './steam-achievement'
import { tryUnlockSteamAchievement } from './steam-achievement-manager'
import {
  applySteamStatsReport,
  flushSteamStatsToSteam,
  getMergedSteamProfileStats
} from './steam-stats-sync'
import { resolveSteamProfileAvatarUrl } from './steam-avatar'
import { getAchievementUnlocked } from './steam-achievement-query'
import { activateGameOverlayToLocalUser } from './steam-overlay-action'
import { ugcPublish, ugcDownloadItem, listSubscribedWorkshopItems } from './steam-workshop'
import {
  deleteCloudDoc,
  estimateCloudDocsUsageBytes,
  getCloudDocBody,
  listCloudDocs,
  putCloudDoc,
  renameCloudDoc
} from './steam-cloud-docs-vault'
import { writeMetadocUgcZipToFile, readMetadocUgcManifestFromDir } from './metadoc-ugc-pack'
import type { MetadocUgcManifest } from './metadoc-ugc-types'
import { installDocumentTemplateFromUgcDir } from './steam-workshop-ugc-install'
import {
  ensureWorkshopDirHasManifest,
  resolveInstallContentDir,
  findDirWithMetadocManifest
} from './workshop-ugc-dir-prepare'
import { getSteamInitResult, initSteam, getGreenworksOrNull } from './steam-state'
import {
  getPendingSteamLocaleConflict,
  resolveSteamLocaleConflictChoice
} from './steam-startup-locale'
import {
  pullAgentPackBundleFromCloud,
  pullHistoryFromCloud,
  pullSettingsFromCloud,
  pullUserTemplatesFromCloud,
  pushAgentPackBundleToCloud,
  pushHistoryToCloud,
  pushSettingsToCloud,
  pushUserTemplatesToCloud,
  getSyncCoordinatorStatus
} from './sync-coordinator'
import { createMainLogger } from '../logger'

type SteamResult<T = unknown> = { success: true; data?: T } | { success: false; error: string }

// #region agent log (debug-68ece7)
function agentDebugLog(location: string, message: string, data: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== 'development') return
  try {
    const f = (globalThis as unknown as { fetch?: typeof fetch }).fetch
    if (typeof f !== 'function') return
    f('http://127.0.0.1:7420/ingest/f298dd8f-3d1a-44fd-852c-9a2266805594', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '68ece7'
      },
      body: JSON.stringify({
        sessionId: '68ece7',
        runId: 'overlay-debug',
        hypothesisId: 'H-main',
        location,
        message,
        data,
        timestamp: Date.now()
      })
    }).catch(() => {})
  } catch {
    /* ignore */
  }
}
// #endregion agent log (debug-68ece7)

function greenworksDiagnostics(): Record<string, unknown> {
  const st = getSteamInitResult()
  const gw = getGreenworksOrNull() as Record<string, unknown> | null
  const hasGw = Boolean(gw)
  const fn = (name: string) => (gw ? typeof gw[name] === 'function' : false)
  const diag: Record<string, unknown> = {
    steam_initialized: st.initialized,
    steam_available: st.available,
    steam_reason: st.reason,
    greenworks_loaded: hasGw,
    greenworks_has_on: fn('on'),
    greenworks_has_activateGameOverlay: fn('activateGameOverlay'),
    greenworks_has_activateGameOverlayToUser: fn('activateGameOverlayToUser'),
    greenworks_has_isGameOverlayEnabled: fn('isGameOverlayEnabled') || fn('IsGameOverlayEnabled'),
    greenworks_has_isOverlayEnabled: fn('isOverlayEnabled') || fn('IsOverlayEnabled')
  }
  if (gw) {
    try {
      const isEnabled =
        typeof gw.isGameOverlayEnabled === 'function'
          ? (gw.isGameOverlayEnabled as () => unknown)()
          : typeof gw.IsGameOverlayEnabled === 'function'
            ? (gw.IsGameOverlayEnabled as () => unknown)()
            : undefined
      if (typeof isEnabled === 'boolean') {
        diag.greenworks_game_overlay_enabled = isEnabled
      } else if (isEnabled !== undefined) {
        diag.greenworks_game_overlay_enabled = String(isEnabled)
      }
    } catch (e) {
      diag.greenworks_game_overlay_enabled = `throw:${e instanceof Error ? e.message : String(e)}`
    }
  }
  if (gw) {
    try {
      const keys = Object.keys(gw)
      diag.greenworks_key_count = keys.length
      diag.greenworks_keys_sample = keys.slice(0, 80)
    } catch {
      /* ignore */
    }
  }
  try {
    diag.process_arch = process.arch
    diag.exec_path = process.execPath
    diag.steam_env = {
      SteamAppId: process.env.SteamAppId,
      SteamGameId: process.env.SteamGameId
    }
  } catch {
    /* ignore */
  }
  return diag
}

/**
 * Steam Web 结账：InitTxn 的 ipaddress 必须与**打开 steam_url 的浏览器**出口 IP 一致。
 * Node 的 fetch 与 Electron Chromium 的出口可能不同（代理/双栈等），因此在**同一 BrowserWindow**
 * 内用 executeJavaScript 取 ip，并在该窗口内 loadURL(steam_url)。
 */
const MTX_CHECKOUT_PARTITION = 'persist:steam-mtx-checkout'

let mtxCheckoutBrowserWindow: BrowserWindow | null = null

/** 最近一次 Steam web 支付窗诊断（供渲染进程 toast / 排障） */
type MtxCheckoutDiagnostic = {
  updated_at_ms: number
  mode?: 'embedded' | 'external'
  steam_url?: string
  expected_ip?: string
  ip_before_load_url?: string | null
  ip_match?: boolean | null
  page_url?: string
  page_title?: string
  page_snippet?: string
  fail_load?: { errorCode: number; errorDescription: string; url: string }
  open_error?: string
}

let lastMtxCheckoutDiagnostic: MtxCheckoutDiagnostic | null = null

function mergeMtxCheckoutDiagnostic(patch: Partial<Omit<MtxCheckoutDiagnostic, 'updated_at_ms'>>): void {
  lastMtxCheckoutDiagnostic = {
    ...(lastMtxCheckoutDiagnostic ?? { updated_at_ms: Date.now() }),
    ...patch,
    updated_at_ms: Date.now()
  }
}

function ensureMtxCheckoutBrowserWindow(): BrowserWindow {
  if (mtxCheckoutBrowserWindow && !mtxCheckoutBrowserWindow.isDestroyed()) {
    return mtxCheckoutBrowserWindow
  }
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  mtxCheckoutBrowserWindow = new BrowserWindow({
    width: 960,
    height: 820,
    show: false,
    parent: parent ?? undefined,
    modal: false,
    autoHideMenuBar: true,
    title: 'Steam',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: MTX_CHECKOUT_PARTITION
    }
  })
  // #region agent log (debug-68ece7)
  try {
    mtxCheckoutBrowserWindow.webContents.on('did-start-navigation', (_e, url, _isInPlace, _isMainFrame) => {
      try {
        const u = new URL(url)
        agentDebugLog('register-steam-ipc.ts:mtxWindow', 'mtx:nav_start', {
          origin: u.origin,
          path: u.pathname
        })
      } catch {
        agentDebugLog('register-steam-ipc.ts:mtxWindow', 'mtx:nav_start', { url: String(url).slice(0, 120) })
      }
    })
    mtxCheckoutBrowserWindow.webContents.on('did-navigate', (_e, url) => {
      try {
        const u = new URL(url)
        agentDebugLog('register-steam-ipc.ts:mtxWindow', 'mtx:navigate', { origin: u.origin, path: u.pathname })
      } catch {
        agentDebugLog('register-steam-ipc.ts:mtxWindow', 'mtx:navigate', { url: String(url).slice(0, 120) })
      }
    })
    mtxCheckoutBrowserWindow.webContents.on('did-finish-load', async () => {
      try {
        const url = mtxCheckoutBrowserWindow?.webContents.getURL?.() || ''
        const title = mtxCheckoutBrowserWindow?.webContents.getTitle?.() || ''
        agentDebugLog('register-steam-ipc.ts:mtxWindow', 'mtx:finish_load', {
          title: String(title).slice(0, 120),
          url: String(url).slice(0, 180)
        })
        // 尽量读取页面可见文本，用于定位“交易授权错误”根因（不含 cookie / token）。
        try {
          const snippet = await mtxCheckoutBrowserWindow?.webContents.executeJavaScript(
            `
            (() => {
              try {
                const t = (document.body && (document.body.innerText || document.body.textContent)) || ''
                return String(t).replace(/\\s+/g, ' ').trim().slice(0, 600)
              } catch (e) {
                return ''
              }
            })()
            `
          )
          if (typeof snippet === 'string' && snippet.trim()) {
            agentDebugLog('register-steam-ipc.ts:mtxWindow', 'mtx:text_snippet', {
              snippet: snippet.slice(0, 600)
            })
          }
          mergeMtxCheckoutDiagnostic({
            page_url: String(url).slice(0, 400),
            page_title: String(title).slice(0, 200),
            page_snippet:
              typeof snippet === 'string' && snippet.trim() ? snippet.slice(0, 600) : undefined
          })
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }
    })
    mtxCheckoutBrowserWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
      agentDebugLog('register-steam-ipc.ts:mtxWindow', 'mtx:fail_load', {
        errorCode,
        errorDescription: String(errorDescription).slice(0, 160),
        url: String(validatedURL).slice(0, 180)
      })
      mergeMtxCheckoutDiagnostic({
        fail_load: {
          errorCode,
          errorDescription: String(errorDescription).slice(0, 240),
          url: String(validatedURL).slice(0, 400)
        }
      })
    })
    mtxCheckoutBrowserWindow.webContents.on('page-title-updated', (_e, title) => {
      agentDebugLog('register-steam-ipc.ts:mtxWindow', 'mtx:title', { title: String(title).slice(0, 120) })
    })
  } catch {
    /* ignore */
  }
  // #endregion agent log (debug-68ece7)
  mtxCheckoutBrowserWindow.on('closed', () => {
    mtxCheckoutBrowserWindow = null
  })
  return mtxCheckoutBrowserWindow
}

const mtxCheckoutLogger = createMainLogger('SteamMtxCheckout')

const IPV4_DOTTED = /^\d{1,3}(\.\d{1,3}){3}$/

function normalizeMtxIp(s: string): string {
  return s.trim().toLowerCase()
}

/** 与内嵌支付页同一 Chromium 网络栈上探测出口 IP（供 InitTxn）；优先 IPv4，与 Steam Web 结账校验一致 */
async function fetchPublicIpViaMtxChromiumWindow(): Promise<string | null> {
  const win = ensureMtxCheckoutBrowserWindow()
  try {
    await win.loadURL('about:blank')
    const ip = await win.webContents.executeJavaScript(
      `
      (async () => {
        const v4 = async () => {
          try {
            const r = await fetch('https://ipv4.icanhazip.com', { signal: AbortSignal.timeout(15000) })
            const t = (await r.text()).trim()
            return /^\\d{1,3}(\\.\\d{1,3}){3}$/.test(t) ? t : ''
          } catch (e) {
            return ''
          }
        }
        const v4_ipify_text = async () => {
          try {
            const r = await fetch('https://api64.ipify.org', { signal: AbortSignal.timeout(15000) })
            const t = (await r.text()).trim()
            return /^\\d{1,3}(\\.\\d{1,3}){3}$/.test(t) ? t : ''
          } catch (e) {
            return ''
          }
        }
        const cf_trace = async () => {
          try {
            const r = await fetch('https://www.cloudflare.com/cdn-cgi/trace', { signal: AbortSignal.timeout(15000) })
            const t = (await r.text()).trim()
            const m = t.match(/\\nip=([^\\n]+)\\n/)
            const ip = m ? m[1].trim() : ''
            return /^\\d{1,3}(\\.\\d{1,3}){3}$/.test(ip) ? ip : ''
          } catch (e) {
            return ''
          }
        }
        const fallback = async () => {
          try {
            const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(15000) })
            const j = await r.json()
            return typeof j.ip === 'string' ? j.ip : ''
          } catch (e) {
            return ''
          }
        }
        let s = await v4()
        if (!s) s = await v4_ipify_text()
        if (!s) s = await cf_trace()
        if (!s) s = await fallback()
        if (s && s.includes(':')) {
          await new Promise((r) => setTimeout(r, 400))
          const again = await v4()
          if (again) s = again
        }
        return s
      })()
      `
    )
    const s = typeof ip === 'string' ? ip.trim() : ''
    if (!s) return null
    if (IPV4_DOTTED.test(s)) return s
    if (s.includes(':')) return s
    return null
  } catch {
    return null
  }
}

function ok<T>(data?: T): SteamResult<T> {
  return data !== undefined ? { success: true, data } : { success: true }
}

function fail(err: string): SteamResult<never> {
  return { success: false, error: err }
}

function requireSteam():
  | { gw: NonNullable<ReturnType<typeof getGreenworksOrNull>> }
  | SteamResult<never> {
  initSteam()
  const gw = getGreenworksOrNull()
  if (!gw) {
    const st = getSteamInitResult()
    return fail(st.reason || 'steam_unavailable')
  }
  return { gw }
}

export function registerSteamIpc(): void {
  ipcBridge.registerHandle('steam:get-status', (): SteamResult => {
    const st = initSteam()
    const diagnostic = greenworksDiagnostics()
    agentDebugLog('register-steam-ipc.ts:steam:get-status', 'steam:get-status', {
      initialized: st.initialized,
      available: st.available,
      reason: st.reason || '',
      diagnostic
    })
    return ok({
      initialized: st.initialized,
      available: st.available,
      reason: st.reason,
      diagnostic
    })
  })

  ipcBridge.registerHandle('steam:overlay:is-enabled', (): SteamResult<{ enabled: boolean }> => {
    const r = requireSteam()
    if (!('gw' in r)) {
      agentDebugLog('register-steam-ipc.ts:steam:overlay:is-enabled', 'overlay:is-enabled:requireSteam_failed', {
        error: (r as { error?: string }).error || 'no_gw'
      })
      return r
    }
    const gwAny = r.gw as Record<string, unknown>
    let enabled = false
    try {
      const v =
        typeof gwAny.isGameOverlayEnabled === 'function'
          ? (gwAny.isGameOverlayEnabled as () => unknown)()
          : typeof gwAny.IsGameOverlayEnabled === 'function'
            ? (gwAny.IsGameOverlayEnabled as () => unknown)()
            : undefined
      enabled = v === true
    } catch {
      enabled = false
    }
    agentDebugLog('register-steam-ipc.ts:steam:overlay:is-enabled', 'overlay:is-enabled', { enabled })
    return ok({ enabled })
  })

  ipcBridge.registerHandle('steam:user:get', (): SteamResult => {
    const r = requireSteam()
    if (!('gw' in r)) {
      return r
    }
    const user = getSteamUserInfo(r.gw)
    if (!user) {
      return fail('steam_user_unavailable')
    }
    return ok(user)
  })

  /**
   * 供 MetaDoc 云鉴权：获取 hex 会话票据，配合 Worker ISteamUserAuth/AuthenticateUserTicket。
   * greenworks: getAuthSessionTicket(success, error)
   */
  /** Greenworks 可能返回十六进制字符串，也可能返回 Buffer / Uint8Array（须转 hex 供 Worker 校验） */
  function sessionTicketToHex(raw: unknown): string | null {
    if (raw == null) {
      return null
    }
    if (typeof raw === 'string' && raw.length > 0) {
      return raw
    }
    if (Buffer.isBuffer(raw) && raw.length > 0) {
      return raw.toString('hex')
    }
    if (raw instanceof Uint8Array && raw.length > 0) {
      return Buffer.from(raw).toString('hex')
    }
    return null
  }

  ipcBridge.registerHandle(
    'steam:auth:get-session-ticket',
    (): Promise<SteamResult<{ ticket: string }>> => {
      const r = requireSteam()
      if (!('gw' in r)) {
        return Promise.resolve(r)
      }
      const gw = r.gw as Record<string, unknown>
      const fn = gw.getAuthSessionTicket
      if (typeof fn !== 'function') {
        return Promise.resolve(fail('getAuthSessionTicket_unavailable'))
      }
      return new Promise((resolve) => {
        try {
          ;(
            fn as (
              this: unknown,
              success: (t: { ticket?: string; handle?: number }) => void,
              err?: (e: Error) => void
            ) => void
          ).call(
            gw,
            (ticketObj: { ticket?: unknown }) => {
              const hex = sessionTicketToHex(ticketObj?.ticket)
              if (hex) {
                resolve(ok({ ticket: hex }))
              } else {
                resolve(fail('empty_ticket'))
              }
            },
            (err: Error) => {
              resolve(fail(err?.message || 'ticket_error'))
            }
          )
        } catch (e) {
          resolve(fail(e instanceof Error ? e.message : String(e)))
        }
      })
    }
  )

  ipcBridge.registerHandle('steam:profile-summary', async (): Promise<SteamResult> => {
    const r = requireSteam()
    if (!('gw' in r)) {
      return r
    }
    const user = getSteamUserInfo(r.gw)
    if (!user) {
      return fail('steam_user_unavailable')
    }
    const avatarUrl = await resolveSteamProfileAvatarUrl(user.id)
    const stats = getMergedSteamProfileStats(r.gw)
    return ok({
      user,
      avatarUrl: avatarUrl ?? null,
      level: user.level,
      secondsPlayed: stats.secondsPlayed,
      aiRequests: stats.aiRequests,
      charsTyped: stats.charsTyped,
      focusSeconds: stats.focusSeconds
    })
  })

  ipcBridge.registerHandle(
    'steam:stats:report',
    (_e: IpcMainInvokeEvent, payload: unknown): SteamResult => {
      initSteam()
      const gw = getGreenworksOrNull()
      const p = (payload && typeof payload === 'object' ? payload : {}) as {
        sessionSecondsDelta?: number
        focusSecondsDelta?: number
        charsDelta?: number
        aiRequestsTotal?: number
      }
      applySteamStatsReport(gw, {
        sessionSecondsDelta: p.sessionSecondsDelta,
        focusSecondsDelta: p.focusSecondsDelta,
        charsDelta: p.charsDelta,
        aiRequestsTotal: p.aiRequestsTotal
      })
      if (gw && typeof p.aiRequestsTotal === 'number') {
        void flushSteamStatsToSteam(gw)
      }
      return ok()
    }
  )

  ipcBridge.registerHandle('steam:user:avatar', async (): Promise<SteamResult> => {
    const r = requireSteam()
    if (!('gw' in r)) {
      return r
    }
    const user = getSteamUserInfo(r.gw)
    if (!user) {
      return fail('steam_user_unavailable')
    }
    const avatarUrl = await resolveSteamProfileAvatarUrl(user.id)
    return ok({ avatarUrl: avatarUrl ?? null })
  })

  ipcBridge.registerHandle('steam:achievement:list-local', async (): Promise<SteamResult> => {
    const r = requireSteam()
    if (!('gw' in r)) {
      return r
    }
    const ids = [...STEAM_ACHIEVEMENT_API_NAMES]
    const items: { id: string; achieved: boolean }[] = []
    for (const id of ids) {
      const ar = await getAchievementUnlocked(r.gw, id)
      items.push({ id, achieved: ar.ok ? ar.achieved : false })
    }
    return ok({ items })
  })

  ipcBridge.registerHandle(
    'steam:overlay:to-user',
    async (_e: IpcMainInvokeEvent, payload: { dialog?: string }): Promise<SteamResult> => {
      const r = requireSteam()
      if (!('gw' in r)) {
        agentDebugLog('register-steam-ipc.ts:steam:overlay:to-user', 'overlay:requireSteam_failed', {
          error: (r as { error?: string }).error || 'no_gw'
        })
        return r
      }
      const user = getSteamUserInfo(r.gw)
      if (!user) {
        agentDebugLog('register-steam-ipc.ts:steam:overlay:to-user', 'overlay:no_user', {})
        return fail('steam_user_unavailable')
      }
      const dialog = payload?.dialog === 'achievements' ? 'achievements' : 'steamid'
      const or = activateGameOverlayToLocalUser(r.gw, dialog, user.id)
      agentDebugLog('register-steam-ipc.ts:steam:overlay:to-user', 'overlay:activate', {
        dialog,
        ok: or.ok,
        error: or.ok ? '' : (or as { error?: string }).error || ''
      })
      return or.ok ? ok() : fail(or.error)
    }
  )

  ipcBridge.registerHandle(
    'steam:cloud:save',
    async (_e: IpcMainInvokeEvent, relPath: string, content: string): Promise<SteamResult> => {
      const r = requireSteam()
      if (!('gw' in r)) {
        return r
      }
      try {
        assertAllowedSteamCloudPath(relPath)
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
      const wr = await saveTextToCloud(r.gw, relPath, content)
      return wr.success ? ok() : fail(wr.error)
    }
  )

  ipcBridge.registerHandle(
    'steam:cloud:read',
    async (_e: IpcMainInvokeEvent, relPath: string): Promise<SteamResult<{ content: string }>> => {
      const r = requireSteam()
      if (!('gw' in r)) {
        return r
      }
      try {
        assertAllowedSteamCloudPath(relPath)
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
      const rr = await readTextFromCloud(r.gw, relPath)
      return rr.success ? ok({ content: rr.content }) : fail(rr.error)
    }
  )

  ipcBridge.registerHandle(
    'steam:achievement:unlock',
    async (_e: IpcMainInvokeEvent, apiName: string): Promise<SteamResult> => {
      const r = requireSteam()
      if (!('gw' in r)) {
        return r
      }
      if (!apiName || typeof apiName !== 'string') {
        return fail('invalid_achievement_id')
      }
      const ar = await unlockSteamAchievement(r.gw, apiName)
      return ar.success ? ok() : fail(ar.error)
    }
  )

  ipcBridge.registerHandle(
    'steam:achievement:try-unlock',
    (_e: IpcMainInvokeEvent, apiName: string): SteamResult => {
      const r = requireSteam()
      if (!('gw' in r)) {
        return r
      }
      if (!apiName || typeof apiName !== 'string') {
        return fail('invalid_achievement_id')
      }
      tryUnlockSteamAchievement(r.gw, apiName)
      return ok()
    }
  )

  ipcBridge.registerHandle('steam:sync:push-settings', async (): Promise<SteamResult> => {
    const r = requireSteam()
    if (!('gw' in r)) {
      return r
    }
    const pr = await pushSettingsToCloud(r.gw)
    return pr.success ? ok() : fail(pr.error)
  })

  ipcBridge.registerHandle('steam:sync:pull-settings', async (): Promise<SteamResult> => {
    const r = requireSteam()
    if (!('gw' in r)) {
      return r
    }
    const pr = await pullSettingsFromCloud(r.gw)
    return pr.success ? ok({ applied: pr.applied }) : fail(pr.error)
  })

  ipcBridge.registerHandle('steam:sync:push-history', async (): Promise<SteamResult> => {
    const r = requireSteam()
    if (!('gw' in r)) {
      return r
    }
    const pr = await pushHistoryToCloud(r.gw)
    return pr.success ? ok() : fail(pr.error)
  })

  ipcBridge.registerHandle('steam:sync:pull-history', async (): Promise<SteamResult> => {
    const r = requireSteam()
    if (!('gw' in r)) {
      return r
    }
    const pr = await pullHistoryFromCloud(r.gw)
    return pr.success ? ok({ applied: pr.applied }) : fail(pr.error)
  })

  ipcBridge.registerHandle('steam:sync:meta', (): SteamResult => {
    return ok(getSyncCoordinatorStatus())
  })

  ipcBridge.registerHandle('steam:sync:push-user-templates', async (): Promise<SteamResult> => {
    const r = requireSteam()
    if (!('gw' in r)) {
      return r
    }
    const pr = await pushUserTemplatesToCloud(r.gw)
    return pr.success ? ok() : fail(pr.error)
  })

  ipcBridge.registerHandle('steam:sync:pull-user-templates', async (): Promise<SteamResult> => {
    const r = requireSteam()
    if (!('gw' in r)) {
      return r
    }
    const pr = await pullUserTemplatesFromCloud(r.gw)
    return pr.success ? ok({ applied: pr.applied }) : fail(pr.error)
  })

  ipcBridge.registerHandle('steam:sync:push-agent-pack', async (): Promise<SteamResult> => {
    const r = requireSteam()
    if (!('gw' in r)) {
      return r
    }
    const pr = await pushAgentPackBundleToCloud(r.gw)
    return pr.success ? ok() : fail(pr.error)
  })

  ipcBridge.registerHandle('steam:sync:pull-agent-pack', async (): Promise<SteamResult> => {
    const r = requireSteam()
    if (!('gw' in r)) {
      return r
    }
    const pr = await pullAgentPackBundleFromCloud(r.gw)
    return pr.success ? ok({ applied: pr.applied }) : fail(pr.error)
  })

  ipcBridge.registerHandle('steam:cloud-docs:list', async (): Promise<SteamResult> => {
    const r = requireSteam()
    if (!('gw' in r)) {
      return r
    }
    const lr = await listCloudDocs(r.gw)
    return lr.success ? ok({ items: lr.items }) : fail(lr.error)
  })

  ipcBridge.registerHandle(
    'steam:cloud-docs:stats',
    async (): Promise<SteamResult<{ docsBytes: number; itemCount: number }>> => {
      const r = requireSteam()
      if (!('gw' in r)) {
        return r
      }
      const sr = await estimateCloudDocsUsageBytes(r.gw)
      return sr.success ? ok({ docsBytes: sr.docsBytes, itemCount: sr.itemCount }) : fail(sr.error)
    }
  )

  ipcBridge.registerHandle(
    'steam:cloud-docs:get',
    async (_e: IpcMainInvokeEvent, payload: { id?: string }): Promise<SteamResult> => {
      const r = requireSteam()
      if (!('gw' in r)) {
        return r
      }
      const id = payload?.id
      if (!id) {
        return fail('invalid_id')
      }
      const gr = await getCloudDocBody(r.gw, id)
      return gr.success ? ok({ title: gr.title, body: gr.body }) : fail(gr.error)
    }
  )

  ipcBridge.registerHandle(
    'steam:cloud-docs:put',
    async (
      _e: IpcMainInvokeEvent,
      payload: { id?: string; title?: string; body?: string }
    ): Promise<SteamResult<{ id: string }>> => {
      const r = requireSteam()
      if (!('gw' in r)) {
        return r
      }
      const p = payload || {}
      const pr = await putCloudDoc(r.gw, {
        id: typeof p.id === 'string' ? p.id : undefined,
        title: typeof p.title === 'string' ? p.title : '',
        body: typeof p.body === 'string' ? p.body : ''
      })
      if (pr.success) {
        tryUnlockSteamAchievement(r.gw, 'ACH_CLOUD_DOC_SAVE')
        return ok({ id: pr.id })
      }
      return fail(pr.error)
    }
  )

  ipcBridge.registerHandle(
    'steam:cloud-docs:delete',
    async (_e: IpcMainInvokeEvent, payload: { id?: string }): Promise<SteamResult> => {
      const r = requireSteam()
      if (!('gw' in r)) {
        return r
      }
      const id = payload?.id
      if (!id) {
        return fail('invalid_id')
      }
      const dr = await deleteCloudDoc(r.gw, id)
      return dr.success ? ok() : fail(dr.error)
    }
  )

  ipcBridge.registerHandle(
    'steam:cloud-docs:rename',
    async (
      _e: IpcMainInvokeEvent,
      payload: { id?: string; title?: string }
    ): Promise<SteamResult> => {
      const r = requireSteam()
      if (!('gw' in r)) {
        return r
      }
      const id = payload?.id
      const title = typeof payload?.title === 'string' ? payload.title : ''
      if (!id) {
        return fail('invalid_id')
      }
      const rr = await renameCloudDoc(r.gw, id, title)
      return rr.success ? ok() : fail(rr.error)
    }
  )

  ipcBridge.registerHandle(
    'steam:workshop:publish',
    async (
      _e: IpcMainInvokeEvent,
      payload: { fileName: string; title: string; description: string; imageName: string }
    ): Promise<SteamResult<{ publishedFileId: string }>> => {
      const r = requireSteam()
      if (!('gw' in r)) {
        return r
      }
      const { fileName, title, description, imageName } = payload || ({} as typeof payload)
      if (!fileName || !title) {
        return fail('invalid_publish_payload')
      }
      const pr = await ugcPublish(r.gw, fileName, title, description, imageName || '')
      return pr.success ? ok({ publishedFileId: pr.publishedFileId }) : fail(pr.error)
    }
  )

  ipcBridge.registerHandle(
    'steam:workshop:download',
    async (
      _e: IpcMainInvokeEvent,
      payload: { ugcFileHandle?: string; targetDir?: string }
    ): Promise<SteamResult> => {
      const r = requireSteam()
      if (!('gw' in r)) {
        return r
      }
      const { ugcFileHandle, targetDir } = payload || ({} as typeof payload)
      if (!ugcFileHandle || !targetDir) {
        return fail('invalid_download_payload')
      }
      try {
        fs.mkdirSync(targetDir, { recursive: true })
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
      const dr = await ugcDownloadItem(r.gw, ugcFileHandle, targetDir)
      if (!dr.success) {
        return fail(dr.error)
      }
      try {
        await ensureWorkshopDirHasManifest(targetDir)
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
      return ok()
    }
  )

  ipcBridge.registerHandle(
    'steam:workshop:pull-and-sync',
    async (
      _e: IpcMainInvokeEvent,
      payload: { publishedFileId?: string; ugcFileHandle?: string }
    ): Promise<
      SteamResult<{
        templateId: string
        contentDir: string
        source: 'steam_install' | 'downloaded'
      }>
    > => {
      const r = requireSteam()
      if (!('gw' in r)) {
        return r
      }
      const publishedFileId =
        payload && typeof payload.publishedFileId === 'string' ? payload.publishedFileId.trim() : ''
      const ugcFileHandle =
        payload && typeof payload.ugcFileHandle === 'string' ? payload.ugcFileHandle.trim() : ''
      if (!publishedFileId || !ugcFileHandle) {
        return fail('invalid_pull_payload')
      }
      const root = path.join(app.getPath('userData'), 'workshop', 'installed')
      try {
        fs.mkdirSync(root, { recursive: true })
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
      const targetDir = path.join(root, publishedFileId)
      try {
        fs.mkdirSync(targetDir, { recursive: true })
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }

      const gwAny = r.gw as Record<string, unknown>
      const getInfo = gwAny.ugcGetItemInstallInfo as
        | ((id: string) => { folder?: string } | undefined)
        | undefined
      if (typeof getInfo === 'function') {
        const info = getInfo(publishedFileId)
        if (info?.folder && fs.existsSync(info.folder)) {
          try {
            await ensureWorkshopDirHasManifest(info.folder)
            const contentDir = resolveInstallContentDir(info.folder)
            const manifest = readMetadocUgcManifestFromDir(contentDir)
            if (manifest?.kind === 'document_template') {
              const ins = installDocumentTemplateFromUgcDir(contentDir, manifest)
              tryUnlockSteamAchievement(r.gw, 'ACH_WORKSHOP_SUBSCRIBE_ITEM')
              return ok({
                templateId: ins.templateId,
                contentDir,
                source: 'steam_install' as const
              })
            }
          } catch {
            /* 继续走下载 */
          }
        }
      }

      const dr = await ugcDownloadItem(r.gw, ugcFileHandle, targetDir)
      if (!dr.success) {
        return fail(dr.error)
      }
      try {
        await ensureWorkshopDirHasManifest(targetDir)
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
      const contentDir = resolveInstallContentDir(targetDir)
      const manifest = readMetadocUgcManifestFromDir(contentDir)
      if (!manifest) {
        return fail('no_manifest')
      }
      if (manifest.kind !== 'document_template') {
        return fail('unsupported_kind')
      }
      const ins = installDocumentTemplateFromUgcDir(contentDir, manifest)
      tryUnlockSteamAchievement(r.gw, 'ACH_WORKSHOP_SUBSCRIBE_ITEM')
      return ok({
        templateId: ins.templateId,
        contentDir,
        source: 'downloaded' as const
      })
    }
  )

  ipcBridge.registerHandle('steam:workshop:list-subscribed', async (): Promise<SteamResult> => {
    const r = requireSteam()
    if (!('gw' in r)) {
      return r
    }
    const lr = await listSubscribedWorkshopItems(r.gw)
    return lr.success ? ok({ items: lr.items }) : fail(lr.error)
  })

  ipcBridge.registerHandle(
    'steam:workshop:default-install-root',
    (): SteamResult<{ path: string }> => {
      const root = path.join(app.getPath('userData'), 'workshop', 'installed')
      try {
        fs.mkdirSync(root, { recursive: true })
      } catch {
        /* ignore */
      }
      return ok({ path: root })
    }
  )

  ipcBridge.registerHandle(
    'steam:workshop:read-manifest-from-dir',
    (
      _e: IpcMainInvokeEvent,
      payload: { dir?: string }
    ): SteamResult<{ manifest: MetadocUgcManifest | null; resolvedDir: string | null }> => {
      const dir = payload?.dir
      if (!dir || typeof dir !== 'string') {
        return fail('invalid_dir')
      }
      try {
        let resolvedDir: string | null = dir
        let manifest = readMetadocUgcManifestFromDir(dir)
        if (!manifest) {
          const sub = findDirWithMetadocManifest(dir)
          if (sub) {
            resolvedDir = sub
            manifest = readMetadocUgcManifestFromDir(sub)
          } else {
            resolvedDir = null
          }
        }
        return ok({ manifest, resolvedDir })
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    }
  )

  ipcBridge.registerHandle(
    'steam:workshop:install-from-dir',
    async (
      _e: IpcMainInvokeEvent,
      payload: { dir?: string }
    ): Promise<SteamResult<{ templateId: string }>> => {
      const dir = payload?.dir
      if (!dir || typeof dir !== 'string') {
        return fail('invalid_dir')
      }
      try {
        await ensureWorkshopDirHasManifest(dir)
        const contentDir = resolveInstallContentDir(dir)
        const manifest = readMetadocUgcManifestFromDir(contentDir)
        if (!manifest) {
          return fail('no_manifest')
        }
        if (manifest.kind === 'document_template') {
          const ins = installDocumentTemplateFromUgcDir(contentDir, manifest)
          const sr = requireSteam()
          if ('gw' in sr) {
            tryUnlockSteamAchievement(sr.gw, 'ACH_WORKSHOP_SUBSCRIBE_ITEM')
          }
          return ok(ins)
        }
        return fail('unsupported_kind')
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    }
  )

  ipcBridge.registerHandle(
    'steam:workshop:publish-document-template',
    async (
      _e: IpcMainInvokeEvent,
      payload: { manifest?: MetadocUgcManifest; thumbnailBase64?: string }
    ): Promise<SteamResult<{ publishedFileId: string }>> => {
      const r = requireSteam()
      if (!('gw' in r)) {
        return r
      }
      const manifest = payload?.manifest
      if (!manifest || manifest.kind !== 'document_template') {
        return fail('invalid_manifest')
      }
      const defKey = String(manifest.defaultLocale || '')
        .replace(/-/g, '_')
        .toLowerCase()
      const block = manifest.locales?.[defKey]
      if (!block) {
        return fail('invalid_locales')
      }
      const tmp = path.join(app.getPath('temp'), `metadoc-ugc-${Date.now()}.zip`)
      const files: Record<string, Buffer> = {}
      const thumbFile = manifest.thumbnail?.file || 'thumbnail.png'
      if (payload?.thumbnailBase64) {
        const b64 = payload.thumbnailBase64.replace(/^data:image\/\w+;base64,/i, '')
        try {
          files[thumbFile] = Buffer.from(b64, 'base64')
        } catch {
          return fail('invalid_thumbnail')
        }
      }
      try {
        await writeMetadocUgcZipToFile(tmp, manifest, files)
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
      const imgTmp = path.join(app.getPath('temp'), `metadoc-ugc-preview-${Date.now()}.png`)
      const previewBuf =
        files[thumbFile] ||
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          'base64'
        )
      try {
        fs.writeFileSync(imgTmp, previewBuf)
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
      const title = (block.title || 'MetaDoc').slice(0, 128)
      const desc = (block.description || '').slice(0, 8000)
      const pr = await ugcPublish(r.gw, tmp, title, desc, imgTmp)
      try {
        fs.unlinkSync(tmp)
      } catch {
        /* ignore */
      }
      try {
        fs.unlinkSync(imgTmp)
      } catch {
        /* ignore */
      }
      if (pr.success) {
        tryUnlockSteamAchievement(r.gw, 'ACH_WORKSHOP_PUBLISH_TEMPLATE')
        return ok({ publishedFileId: pr.publishedFileId })
      }
      return fail(pr.error)
    }
  )

  ipcBridge.registerHandle('steam:startup-locale:get-pending', () => ({
    pending: getPendingSteamLocaleConflict()
  }))

  ipcBridge.registerHandle(
    'steam:startup-locale:choose',
    (_e: IpcMainInvokeEvent, payload: unknown) => {
      const loc =
        payload &&
        typeof payload === 'object' &&
        payload !== null &&
        'locale' in payload &&
        typeof (payload as { locale: unknown }).locale === 'string'
          ? (payload as { locale: string }).locale
          : ''
      return resolveSteamLocaleConflictChoice(loc)
    }
  )

  /**
   * Worker InitTxn 成功后调用：尽快泵 Steam 回调队列（网页支付时 Greenworks 可能不可用，仍返回成功）。
   */
  ipcBridge.registerHandle('steam:mtx:after-init', async (): Promise<SteamResult> => {
    initSteam()
    const gw = getGreenworksOrNull() as Record<string, unknown> | null
    if (!gw) {
      return ok()
    }

    const fns = ['runCallbacks', 'runSteamAPI', 'RunCallbacks']
      .map((name) => gw[name])
      .filter((fn): fn is () => void => typeof fn === 'function')
    if (fns.length === 0) {
      return ok()
    }

    /**
     * 覆盖层弹窗/授权结果依赖回调队列被及时泵出。
     * 单次调用在部分环境下不稳定，因此在短时间内多次泵（不阻塞 UI，次数与间隔保守）。
     */
    for (let i = 0; i < 30; i++) {
      for (const fn of fns) {
        try {
          fn.call(gw)
        } catch {
          /* ignore */
        }
      }
      await new Promise((r) => setTimeout(r, 100))
    }

    return ok()
  })

  /** 在与内嵌支付页相同的 Chromium 会话中取出口 IP，供 InitTxn ipaddress */
  ipcBridge.registerHandle(
    'steam:mtx:get-public-ip',
    async (): Promise<SteamResult<{ ip: string }>> => {
      const ip = await fetchPublicIpViaMtxChromiumWindow()
      if (!ip) {
        agentDebugLog('register-steam-ipc.ts:steam:mtx:get-public-ip', 'mtx:get-public-ip:fail', {})
        return fail('ip_unavailable')
      }
      agentDebugLog('register-steam-ipc.ts:steam:mtx:get-public-ip', 'mtx:get-public-ip:ok', {
        ipKind: ip.includes(':') ? 'v6' : 'v4'
      })
      return ok({ ip })
    }
  )

  /** 供渲染进程 toast：最近一次内嵌/外部支付窗的诊断快照 */
  ipcBridge.registerHandle(
    'steam:mtx:get-last-checkout-diagnostic',
    async (): Promise<SteamResult<MtxCheckoutDiagnostic | null>> => {
      return ok(lastMtxCheckoutDiagnostic)
    }
  )

  /** 在同一内嵌窗口中加载 Steam 支付页（须与 get-public-ip 为同一窗口，避免 IP 不一致） */
  ipcBridge.registerHandle(
    'steam:mtx:open-checkout-url',
    async (_e, payload: unknown): Promise<SteamResult> => {
      const url =
        payload &&
        typeof payload === 'object' &&
        payload !== null &&
        'url' in payload &&
        typeof (payload as { url: unknown }).url === 'string'
          ? (payload as { url: string }).url.trim()
          : ''
      const expectedIp =
        payload &&
        typeof payload === 'object' &&
        payload !== null &&
        'expected_ip' in payload &&
        typeof (payload as { expected_ip: unknown }).expected_ip === 'string'
          ? (payload as { expected_ip: string }).expected_ip.trim()
          : ''
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        agentDebugLog('register-steam-ipc.ts:steam:mtx:open-checkout-url', 'mtx:open:bad_url', {
          url: url.slice(0, 120)
        })
        return fail('bad_url')
      }
      lastMtxCheckoutDiagnostic = {
        updated_at_ms: Date.now(),
        mode: 'embedded',
        steam_url: url.slice(0, 800),
        expected_ip: expectedIp || undefined
      }
      try {
        const ipNow = await fetchPublicIpViaMtxChromiumWindow()
        if (lastMtxCheckoutDiagnostic) {
          lastMtxCheckoutDiagnostic.ip_before_load_url = ipNow ?? null
          lastMtxCheckoutDiagnostic.ip_match =
            expectedIp.length > 0 && ipNow
              ? normalizeMtxIp(expectedIp) === normalizeMtxIp(ipNow)
              : null
        }
        agentDebugLog('register-steam-ipc.ts:steam:mtx:open-checkout-url', 'mtx:open:ip_probe', {
          expectedIp: expectedIp ? normalizeMtxIp(expectedIp) : '',
          nowIp: ipNow ? normalizeMtxIp(ipNow) : '',
          nowKind: ipNow ? (ipNow.includes(':') ? 'v6' : 'v4') : 'none'
        })
        if (expectedIp.length > 0 && ipNow) {
          const a = normalizeMtxIp(expectedIp)
          const b = normalizeMtxIp(ipNow)
          mtxCheckoutLogger.info('MTX checkout IP check', {
            expected: a,
            now: b,
            match: a === b
          })
          if (a !== b) {
            mtxCheckoutLogger.warn('MTX checkout IP mismatch — renderer should retry InitTxn', {
              expected: a,
              now: b
            })
            agentDebugLog('register-steam-ipc.ts:steam:mtx:open-checkout-url', 'mtx:open:ip_mismatch', {
              expected: a,
              now: b
            })
            return fail('mtx_ip_mismatch')
          }
        } else if (expectedIp.length > 0 && !ipNow) {
          mtxCheckoutLogger.warn('MTX checkout: could not re-probe IP before loadURL')
          agentDebugLog('register-steam-ipc.ts:steam:mtx:open-checkout-url', 'mtx:open:ip_reprobe_failed', {
            expected: normalizeMtxIp(expectedIp)
          })
        }
        const win = ensureMtxCheckoutBrowserWindow()
        // 先展示窗口再加载，避免用户长时间只看到任务栏闪烁
        try {
          win.show()
          win.focus()
        } catch {
          /* ignore */
        }
        await win.loadURL(url)
        // 检测是否未登录（页面头部出现“登录/Sign in”，常导致授权阶段直接失败）
        try {
          const snippet = await win.webContents.executeJavaScript(
            `
            (() => {
              try {
                const u = String(location.href || '')
                const t = (document.body && (document.body.innerText || document.body.textContent)) || ''
                const s = String(t).replace(/\\s+/g, ' ').trim()
                return { url: u.slice(0, 200), text: s.slice(0, 600) }
              } catch (e) {
                return { url: '', text: '' }
              }
            })()
            `
          )
          const obj =
            snippet && typeof snippet === 'object' && snippet !== null
              ? (snippet as { url?: unknown; text?: unknown })
              : {}
          const text = typeof obj.text === 'string' ? obj.text : ''
          const pageUrl = typeof obj.url === 'string' ? obj.url : ''
          if (text) {
            agentDebugLog('register-steam-ipc.ts:steam:mtx:open-checkout-url', 'mtx:open:text_probe', {
              url: pageUrl,
              snippet: text
            })
          }
          mergeMtxCheckoutDiagnostic({
            page_url: pageUrl.slice(0, 400),
            page_title: String(win.webContents.getTitle?.() || '').slice(0, 200),
            page_snippet: text ? text.slice(0, 600) : undefined
          })
          const low = text.toLowerCase()
          const looksLoggedOut =
            pageUrl.toLowerCase().includes('/login') ||
            low.includes('用帐户名称登录') ||
            // Strong login-page signals
            low.includes('request help, i can\'t sign in') ||
            low.includes('qr code') ||
            low.includes('remember me') ||
            // "Sign in" alone is too weak (Steam header may include it in some locales);
            // require it to co-occur with other login-specific phrases.
            (low.includes('sign in') && (low.includes('qr code') || low.includes('account name'))) ||
            (low.includes('登录') && (low.includes('qr code') || low.includes('用帐户名称登录'))) ||
            low.includes('request help, i can\'t sign in') ||
            low.includes('qr code') ||
            low.includes('remember me')
          if (looksLoggedOut) {
            agentDebugLog(
              'register-steam-ipc.ts:steam:mtx:open-checkout-url',
              'mtx:open:likely_logged_out',
              { url: pageUrl }
            )
            // 不阻止显示窗口，但让渲染进程提示用户先登录再重试
            return fail('steam_checkout_logged_out')
          }
        } catch {
          /* ignore */
        }
        agentDebugLog('register-steam-ipc.ts:steam:mtx:open-checkout-url', 'mtx:open:loadURL_ok', {})
        return ok()
      } catch (e) {
        mergeMtxCheckoutDiagnostic({
          open_error: (e instanceof Error ? e.message : String(e)).slice(0, 400)
        })
        agentDebugLog('register-steam-ipc.ts:steam:mtx:open-checkout-url', 'mtx:open:loadURL_throw', {
          message: e instanceof Error ? e.message : String(e)
        })
        return fail(e instanceof Error ? e.message : String(e))
      }
    }
  )

  /** 用系统默认浏览器打开 Steam 结账页（用于对比内嵌窗口链路） */
  ipcBridge.registerHandle(
    'steam:mtx:open-checkout-url-external',
    async (_e, payload: unknown): Promise<SteamResult> => {
      const url =
        payload &&
        typeof payload === 'object' &&
        payload !== null &&
        'url' in payload &&
        typeof (payload as { url: unknown }).url === 'string'
          ? (payload as { url: string }).url.trim()
          : ''
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return fail('bad_url')
      }
      lastMtxCheckoutDiagnostic = {
        updated_at_ms: Date.now(),
        mode: 'external',
        steam_url: url.slice(0, 800)
      }
      try {
        await shell.openExternal(url)
        return ok()
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    }
  )

  trySubscribeSteamMicroTxnListener()
  trySubscribeSteamOverlayListener()
}

/**
 * Steam 覆盖层内购授权结果：转发到各窗口，由渲染进程调用 Worker `/steam/mtx/finalize`。
 * 依赖 greenworks 的 `micro-txn-authorization-response` 事件（见 greenworks docs/events.md）。
 */
function trySubscribeSteamMicroTxnListener(): void {
  initSteam()
  const gw = getGreenworksOrNull() as Record<string, unknown> | null
  if (!gw || typeof gw.on !== 'function') {
    return
  }
  try {
    ;(gw.on as (ev: string, cb: (...args: unknown[]) => void) => void).call(
      gw,
      'micro-txn-authorization-response',
      (appId: unknown, orderId: unknown, authorized: unknown) => {
        const payload = {
          appId: typeof appId === 'number' ? appId : Number(appId),
          orderId: orderId != null ? String(orderId) : '',
          authorized: authorized === true
        }
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed()) {
            w.webContents.send('steam:micro-txn-response', payload)
          }
        }
      }
    )
  } catch {
    /* 部分 greenworks 构建可能未暴露该事件 */
  }
}

/**
 * Steam Overlay 激活事件：用于排查 Shift+Tab / activateGameOverlay* 是否真的触发了覆盖层。
 * 不同 greenworks 构建事件名可能不同，因此做多路订阅（失败不影响主流程）。
 */
function trySubscribeSteamOverlayListener(): void {
  initSteam()
  const gw = getGreenworksOrNull() as Record<string, unknown> | null
  if (!gw || typeof gw.on !== 'function') {
    return
  }
  const on = gw.on as (ev: string, cb: (...args: unknown[]) => void) => void
  for (const ev of ['game-overlay-activated', 'gameOverlayActivated', 'overlay-activated']) {
    try {
      on.call(gw, ev, (...args: unknown[]) => {
        agentDebugLog('register-steam-ipc.ts:overlay:event', 'overlay:event', {
          ev,
          args: args.map((a) => (a == null ? null : typeof a === 'object' ? '[object]' : a))
        })
      })
    } catch {
      /* ignore */
    }
  }
}
