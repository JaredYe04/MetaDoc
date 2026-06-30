/**
 * 仅 DEV：在 localStorage 中切换 legacy BYOK 与 Steam 官方云（Worker→n1n）。
 * 生产构建应死代码剔除 import.meta.env.DEV 分支。
 * Steam 生产：默认走官方云；用户可在设置中开启「开发人员模式」退回 BYOK（settings.steamDeveloperBypassByok）。
 */
import { isSteamEnabled } from '@common/build-env'
import eventBus from './event-bus.js'
import { settings } from './settings.js'
import { steamOfficialCloudEligible } from './steam-official-cloud-eligible'

const STORAGE_KEY = 'metadoc_dev_ai_pipeline'

export type DevAiPipelineMode = 'legacy' | 'steam_cloud'

export function getDevAiPipelineMode(): DevAiPipelineMode {
  if (import.meta.env.PROD) {
    return 'legacy'
  }
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'steam_cloud' || v === 'legacy') {
      return v
    }
  } catch {
    /* ignore */
  }
  return 'legacy'
}

export function setDevAiPipelineMode(mode: DevAiPipelineMode): void {
  if (import.meta.env.PROD) {
    return
  }
  try {
    localStorage.setItem(STORAGE_KEY, mode)
    eventBus.emit('metadoc-dev-ai-pipeline-changed')
  } catch {
    /* ignore */
  }
}

/**
 * Steam 官方云（Worker + Steam 票据 JWT）：仅 **VITE_METADOC_STEAM** 编入的包在 PROD 下可走此路；
 * GitHub Releases 等非 Steam 构建必须为 false，否则 resolveEffectiveLlmInternal 会锁死为 metadoc、BYOK 失效。
 * DEV 下仍可用 localStorage 切 steam_cloud 连 staging Worker。
 */
export function useMetadocCloudOpenAiRoute(): boolean {
  void steamOfficialCloudEligible.value
  if (settings.steamDeveloperBypassByok === true) {
    return false
  }
  if (import.meta.env.PROD && !isSteamEnabled()) {
    return false
  }
  if (steamOfficialCloudEligible.value) {
    return true
  }
  return import.meta.env.DEV && getDevAiPipelineMode() === 'steam_cloud'
}
