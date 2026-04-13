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
import { getSteamInitResult, initSteam, getGreenworksOrNull } from './steam-state'
import {
  getPendingSteamLocaleConflict,
  resolveSteamLocaleConflictChoice
} from './steam-startup-locale'
import {
  pullHistoryFromCloud,
  pullSettingsFromCloud,
  pushHistoryToCloud,
  pushSettingsToCloud,
  getSyncCoordinatorStatus
} from './sync-coordinator'

type SteamResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string }

function ok<T>(data?: T): SteamResult<T> {
  return data !== undefined ? { success: true, data } : { success: true }
}

function fail(err: string): SteamResult<never> {
  return { success: false, error: err }
}

function requireSteam(): { gw: NonNullable<ReturnType<typeof getGreenworksOrNull>> } | SteamResult<never> {
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
    return ok({
      initialized: st.initialized,
      available: st.available,
      reason: st.reason
    })
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
      charsTyped: stats.charsTyped
    })
  })

  ipcBridge.registerHandle(
    'steam:stats:report',
    (_e: IpcMainInvokeEvent, payload: unknown): SteamResult => {
      initSteam()
      const gw = getGreenworksOrNull()
      const p = (payload && typeof payload === 'object' ? payload : {}) as {
        sessionSecondsDelta?: number
        charsDelta?: number
        aiRequestsTotal?: number
      }
      applySteamStatsReport(gw, {
        sessionSecondsDelta: p.sessionSecondsDelta,
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
    async (
      _e: IpcMainInvokeEvent,
      payload: { dialog?: string }
    ): Promise<SteamResult> => {
      const r = requireSteam()
      if (!('gw' in r)) {
        return r
      }
      const user = getSteamUserInfo(r.gw)
      if (!user) {
        return fail('steam_user_unavailable')
      }
      const dialog = payload?.dialog === 'achievements' ? 'achievements' : 'steamid'
      const or = activateGameOverlayToLocalUser(r.gw, dialog, user.id)
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
      payload: { publishedFileId: string; targetDir: string }
    ): Promise<SteamResult> => {
      const r = requireSteam()
      if (!('gw' in r)) {
        return r
      }
      const { publishedFileId, targetDir } = payload || ({} as typeof payload)
      if (!publishedFileId || !targetDir) {
        return fail('invalid_download_payload')
      }
      const dr = await ugcDownloadItem(r.gw, publishedFileId, targetDir)
      return dr.success ? ok() : fail(dr.error)
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
}
