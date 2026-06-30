/**
 * 开源构建：Steam 官方云管线已归档，恒走 BYOK/本地 LLM。
 */
import eventBus from './event-bus.js'

export type DevAiPipelineMode = 'legacy' | 'steam_cloud'

export function getDevAiPipelineMode(): DevAiPipelineMode {
  return 'legacy'
}

export function setDevAiPipelineMode(_mode: DevAiPipelineMode): void {
  if (import.meta.env.DEV) {
    eventBus.emit('metadoc-dev-ai-pipeline-changed')
  }
}

/** 开源版不使用 MetaDoc Cloud Worker 路由 */
export function useMetadocCloudOpenAiRoute(): boolean {
  return false
}
