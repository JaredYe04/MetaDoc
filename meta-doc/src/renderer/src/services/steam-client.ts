import messageBridge from '../bridge/message-bridge'
import { refreshUserTemplatesFromMain } from '../stores/user-templates'

export type SteamStatusPayload = {
  initialized: boolean
  available: boolean
  reason?: string
}

export type SteamUserPayload = {
  id: string
  name: string
  level: number
}

export type SteamProfileSummaryPayload = {
  user: SteamUserPayload
  avatarUrl: string | null
  level: number
  secondsPlayed: number
  aiRequests: number
  charsTyped: number
}

type SteamInvokeResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string }

async function invokeSteam<T>(channel: string, ...args: unknown[]): Promise<SteamInvokeResult<T>> {
  try {
    return (await messageBridge.invoke(channel, ...args)) as SteamInvokeResult<T>
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getSteamStatus(): Promise<SteamInvokeResult<SteamStatusPayload>> {
  return invokeSteam<SteamStatusPayload>('steam:get-status')
}

export async function getSteamUser(): Promise<SteamInvokeResult<SteamUserPayload>> {
  return invokeSteam<SteamUserPayload>('steam:user:get')
}

export async function getSteamAvatar(): Promise<SteamInvokeResult<{ avatarUrl: string | null }>> {
  return invokeSteam<{ avatarUrl: string | null }>('steam:user:avatar')
}

export async function getSteamProfileSummary(): Promise<
  SteamInvokeResult<SteamProfileSummaryPayload>
> {
  return invokeSteam<SteamProfileSummaryPayload>('steam:profile-summary')
}

export type SteamLocalAchievementRow = { id: string; achieved: boolean }

export async function listLocalSteamAchievements(): Promise<
  SteamInvokeResult<{ items: SteamLocalAchievementRow[] }>
> {
  return invokeSteam<{ items: SteamLocalAchievementRow[] }>('steam:achievement:list-local')
}

export async function openSteamOverlayToUser(
  dialog: 'steamid' | 'achievements'
): Promise<SteamInvokeResult> {
  return invokeSteam('steam:overlay:to-user', { dialog })
}

export async function unlockSteamAchievement(apiName: string): Promise<SteamInvokeResult> {
  return invokeSteam('steam:achievement:unlock', apiName)
}

/** 主进程去重后解锁（适合渲染进程埋点） */
export async function tryUnlockSteamAchievementByApi(apiName: string): Promise<SteamInvokeResult> {
  return invokeSteam('steam:achievement:try-unlock', apiName)
}

export async function steamSyncPullSettings(): Promise<SteamInvokeResult<{ applied: boolean }>> {
  return invokeSteam<{ applied: boolean }>('steam:sync:pull-settings')
}

export async function steamSyncPushSettings(): Promise<SteamInvokeResult> {
  return invokeSteam('steam:sync:push-settings')
}

export async function steamSyncPullHistory(): Promise<SteamInvokeResult<{ applied: boolean }>> {
  return invokeSteam<{ applied: boolean }>('steam:sync:pull-history')
}

export async function steamSyncPushHistory(): Promise<SteamInvokeResult> {
  return invokeSteam('steam:sync:push-history')
}

export async function steamSyncPushUserTemplates(): Promise<SteamInvokeResult> {
  return invokeSteam('steam:sync:push-user-templates')
}

export async function steamSyncPullUserTemplates(): Promise<
  SteamInvokeResult<{ applied: boolean }>
> {
  const r = await invokeSteam<{ applied: boolean }>('steam:sync:pull-user-templates')
  if (r.success) {
    try {
      await refreshUserTemplatesFromMain()
    } catch {
      /* ignore */
    }
  }
  return r
}

export async function steamSyncPushAgentPack(): Promise<SteamInvokeResult> {
  return invokeSteam('steam:sync:push-agent-pack')
}

export async function steamSyncPullAgentPack(): Promise<SteamInvokeResult<{ applied: boolean }>> {
  return invokeSteam<{ applied: boolean }>('steam:sync:pull-agent-pack')
}

export type SteamCloudDocItem = {
  id: string
  title: string
  path: string
  sizeBytes: number
  updatedAt: number
}

export async function steamCloudDocsList(): Promise<
  SteamInvokeResult<{ items: SteamCloudDocItem[] }>
> {
  return invokeSteam<{ items: SteamCloudDocItem[] }>('steam:cloud-docs:list')
}

export async function steamCloudDocsStats(): Promise<
  SteamInvokeResult<{ docsBytes: number; itemCount: number }>
> {
  return invokeSteam<{ docsBytes: number; itemCount: number }>('steam:cloud-docs:stats')
}

export async function steamCloudDocsGet(
  id: string
): Promise<SteamInvokeResult<{ title: string; body: string }>> {
  return invokeSteam<{ title: string; body: string }>('steam:cloud-docs:get', { id })
}

export async function steamCloudDocsPut(payload: {
  id?: string
  title: string
  body: string
}): Promise<SteamInvokeResult<{ id: string }>> {
  return invokeSteam<{ id: string }>('steam:cloud-docs:put', payload)
}

export async function steamCloudDocsDelete(id: string): Promise<SteamInvokeResult> {
  return invokeSteam('steam:cloud-docs:delete', { id })
}

export async function steamCloudDocsRename(id: string, title: string): Promise<SteamInvokeResult> {
  return invokeSteam('steam:cloud-docs:rename', { id, title })
}

/** 与主进程 listSubscribedWorkshopItems 一致 */
export type WorkshopSubscribedItem = {
  publishedFileId: string
  file: string
  title: string
  description: string
  fileName: string
  steamIDOwner: string
  tags: string
  timeCreated: number
  timeUpdated: number
  timeAddedToUserList: number
  fileType: number
  previewFile: string
}

export async function listSubscribedWorkshop(): Promise<
  SteamInvokeResult<{ items: WorkshopSubscribedItem[] }>
> {
  return invokeSteam('steam:workshop:list-subscribed')
}

/** 使用 SteamUGCDetails.file 句柄下载到目录，并尝试解压 zip 以得到 metadoc-ugc.json */
export async function downloadWorkshopItem(
  ugcFileHandle: string,
  targetDir: string
): Promise<SteamInvokeResult> {
  return invokeSteam('steam:workshop:download', { ugcFileHandle, targetDir })
}

/** 从 Steam 拉取已订阅物品内容并安装为本地用户模板（单按钮） */
export async function pullAndSyncWorkshopItem(payload: {
  publishedFileId: string
  ugcFileHandle: string
}): Promise<
  SteamInvokeResult<{
    templateId: string
    contentDir: string
    source: 'steam_install' | 'downloaded'
  }>
> {
  return invokeSteam('steam:workshop:pull-and-sync', payload)
}

export async function workshopDefaultInstallRoot(): Promise<SteamInvokeResult<{ path: string }>> {
  return invokeSteam<{ path: string }>('steam:workshop:default-install-root')
}

export async function workshopInstallFromDir(
  dir: string
): Promise<SteamInvokeResult<{ templateId: string }>> {
  return invokeSteam<{ templateId: string }>('steam:workshop:install-from-dir', { dir })
}

export async function workshopReadManifestFromDir(dir: string): Promise<
  SteamInvokeResult<{
    manifest: Record<string, unknown> | null
    resolvedDir: string | null
  }>
> {
  return invokeSteam<{
    manifest: Record<string, unknown> | null
    resolvedDir: string | null
  }>('steam:workshop:read-manifest-from-dir', { dir })
}

export async function workshopPublishDocumentTemplate(payload: {
  manifest: Record<string, unknown>
  thumbnailBase64?: string
}): Promise<SteamInvokeResult<{ publishedFileId: string }>> {
  return invokeSteam<{ publishedFileId: string }>(
    'steam:workshop:publish-document-template',
    payload
  )
}
