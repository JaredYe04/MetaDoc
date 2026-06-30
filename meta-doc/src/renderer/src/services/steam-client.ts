/**
 * 开源构建：Steam 客户端已归档至 archived/steam/，此处为 no-op stub。
 */
import { isSteamEnabled } from '@common/build-env'

export type SteamStatusPayload = {
  initialized: boolean
  available: boolean
  reason?: string
}

export type SteamUserPayload = { id: string; name: string; level: number }
export type SteamProfileSummaryPayload = {
  user: SteamUserPayload
  avatarUrl: string | null
  level: number
  secondsPlayed: number
  aiRequests: number
  charsTyped: number
  focusSeconds: number
}
export type SteamLocalAchievementRow = { id: string; achieved: boolean }
export type SteamCloudDocItem = { id: string; title: string; updatedAt?: string }
export type WorkshopSubscribedItem = { publishedFileId: string; title?: string }

type SteamInvokeResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string }

const disabled = (): SteamInvokeResult => ({
  success: false,
  error: isSteamEnabled() ? 'steam_archived' : 'steam_disabled'
})

export async function getSteamStatus(): Promise<SteamInvokeResult<SteamStatusPayload>> {
  return disabled()
}
export async function getSteamUser(): Promise<SteamInvokeResult<SteamUserPayload>> {
  return disabled()
}
export async function getSteamAvatar(): Promise<SteamInvokeResult<{ avatarUrl: string | null }>> {
  return disabled()
}
export async function getSteamProfileSummary(): Promise<
  SteamInvokeResult<SteamProfileSummaryPayload>
> {
  return disabled()
}
export async function listLocalSteamAchievements(): Promise<
  SteamInvokeResult<{ items: SteamLocalAchievementRow[] }>
> {
  return disabled()
}
export async function openSteamOverlayToUser(): Promise<SteamInvokeResult> {
  return disabled()
}
export async function isSteamOverlayEnabled(): Promise<SteamInvokeResult<{ enabled: boolean }>> {
  return disabled()
}
export async function unlockSteamAchievement(): Promise<SteamInvokeResult> {
  return disabled()
}
export async function tryUnlockSteamAchievementByApi(): Promise<SteamInvokeResult> {
  return disabled()
}
export async function steamSyncPullSettings(): Promise<SteamInvokeResult<{ applied: boolean }>> {
  return disabled()
}
export async function steamSyncPushSettings(): Promise<SteamInvokeResult> {
  return disabled()
}
export async function steamSyncPullHistory(): Promise<SteamInvokeResult<{ applied: boolean }>> {
  return disabled()
}
export async function steamSyncPushHistory(): Promise<SteamInvokeResult> {
  return disabled()
}
export async function steamSyncPushUserTemplates(): Promise<SteamInvokeResult> {
  return disabled()
}
export async function steamSyncPullUserTemplates(): Promise<
  SteamInvokeResult<{ applied: boolean }>
> {
  return disabled()
}
export async function steamSyncPushAgentPack(): Promise<SteamInvokeResult> {
  return disabled()
}
export async function steamSyncPullAgentPack(): Promise<SteamInvokeResult<{ applied: boolean }>> {
  return disabled()
}
export async function steamCloudDocsList(): Promise<
  SteamInvokeResult<{ items: SteamCloudDocItem[] }>
> {
  return disabled()
}
export async function steamCloudDocsStats(): Promise<SteamInvokeResult<Record<string, unknown>>> {
  return disabled()
}
export async function steamCloudDocsGet(): Promise<SteamInvokeResult<{ content: string }>> {
  return disabled()
}
export async function steamCloudDocsPut(): Promise<SteamInvokeResult> {
  return disabled()
}
export async function steamCloudDocsDelete(): Promise<SteamInvokeResult> {
  return disabled()
}
export async function steamCloudDocsRename(): Promise<SteamInvokeResult> {
  return disabled()
}
export async function listSubscribedWorkshop(): Promise<
  SteamInvokeResult<{ items: WorkshopSubscribedItem[] }>
> {
  return disabled()
}
export async function downloadWorkshopItem(): Promise<SteamInvokeResult> {
  return disabled()
}
export async function pullAndSyncWorkshopItem(): Promise<SteamInvokeResult> {
  return disabled()
}
export async function workshopDefaultInstallRoot(): Promise<SteamInvokeResult<{ path: string }>> {
  return disabled()
}
export async function workshopInstallFromDir(): Promise<SteamInvokeResult> {
  return disabled()
}
export async function workshopReadManifestFromDir(): Promise<SteamInvokeResult> {
  return disabled()
}
export async function workshopPublishDocumentTemplate(): Promise<SteamInvokeResult> {
  return disabled()
}
