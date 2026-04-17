/**
 * 仅 DEV：在 localStorage 中切换 legacy BYOK 与 Steam 官方云（Worker→n1n）。
 * 生产构建应死代码剔除 import.meta.env.DEV 分支。
 */
import { isSteamDistribution } from '@common/build-env'
import eventBus from './event-bus.js'

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

/** Steam 包走官方云；DEV 非 Steam 包可选 steam_cloud 以连 staging Worker */
export function useMetadocCloudOpenAiRoute(): boolean {
  if (isSteamDistribution()) {
    return true
  }
  return import.meta.env.DEV && getDevAiPipelineMode() === 'steam_cloud'
}
