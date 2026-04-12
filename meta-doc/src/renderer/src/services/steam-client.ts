import messageBridge from '../bridge/message-bridge'

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

export async function getSteamAvatar(): Promise<
  SteamInvokeResult<{ avatarUrl: string | null }>
> {
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

export async function listSubscribedWorkshop(): Promise<
  SteamInvokeResult<{ items: { publishedFileId: string; title: string; description: string }[] }>
> {
  return invokeSteam('steam:workshop:list-subscribed')
}

export async function downloadWorkshopItem(
  publishedFileId: string,
  targetDir: string
): Promise<SteamInvokeResult> {
  return invokeSteam('steam:workshop:download', { publishedFileId, targetDir })
}
