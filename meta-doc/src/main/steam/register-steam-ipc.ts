import fs from 'fs'
import path from 'path'
import { app, BrowserWindow } from 'electron'
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

type SteamResult<T = unknown> = { success: true; data?: T } | { success: false; error: string }

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
    async (_e: IpcMainInvokeEvent, payload: { dialog?: string }): Promise<SteamResult> => {
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
   * Worker InitTxn 成功后调用：尽快泵 Steam 回调队列，便于客户端弹出 MicroTxn 授权覆盖层。
   * greenworks 通常已有 SteamLoop；若构建暴露了 runCallbacks 则额外调用一次。
   */
  ipcBridge.registerHandle('steam:mtx:after-init', (): SteamResult => {
    initSteam()
    const gw = getGreenworksOrNull() as Record<string, unknown> | null
    if (!gw) {
      return fail('greenworks_unavailable')
    }
    for (const name of ['runCallbacks', 'runSteamAPI', 'RunCallbacks']) {
      const fn = gw[name]
      if (typeof fn === 'function') {
        try {
          ;(fn as () => void).call(gw)
        } catch {
          /* ignore */
        }
      }
    }
    return ok()
  })

  trySubscribeSteamMicroTxnListener()
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
