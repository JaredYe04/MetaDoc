import { getMetadocCloudApiBase } from '@common/build-env'
import { ensureMetadocSteamCloudJwt } from './metadoc-cloud-auth'
import { useMetadocCloudOpenAiRoute } from './dev-ai-pipeline'
import { getSetting, setSetting, settings } from './settings.js'
import { getMetaDocLlmConfig, verifyToken } from './web-utils.ts'

/**
 * Steam 官方云：未选模型时拉取 `/cloud/models` 并默认首项。
 * 供 adapter-factory、LlmAdapter 等与 ChatComposer 行为一致。
 */
export async function ensureDefaultMetadocCloudModelIfNeeded(): Promise<void> {
  if (!useMetadocCloudOpenAiRoute()) {
    return
  }
  let modelName = (await getSetting('metadocSelectedModel')) as string | undefined
  if (modelName?.trim()) {
    return
  }
  const base = getMetadocCloudApiBase()
  if (!base) {
    return
  }
  try {
    const jwt = await ensureMetadocSteamCloudJwt()
    const res = await fetch(`${base}/cloud/models`, {
      headers: { authorization: `Bearer ${jwt}` }
    })
    const j = (await res.json()) as { models?: Array<{ id: string }> }
    if (!res.ok || !Array.isArray(j.models) || j.models.length === 0 || !j.models[0]?.id) {
      return
    }
    const id = j.models[0].id
    if (typeof settings.metadoc !== 'object' || settings.metadoc === null) {
      settings.metadoc = { selectedModel: '', enableMaxTokens: false, maxTokens: 4096 }
    }
    settings.metadoc.selectedModel = id
    await setSetting('metadocSelectedModel', id)
  } catch {
    /* 留给后续 loadMetadocOpenAiStyleConfig / validate 报错 */
  }
}

/** 供 OpenAI 适配器：apiUrl / apiKey / 后缀等 */
export async function loadMetadocOpenAiStyleConfig(
  loginToken: string | null,
  modelName: string
): Promise<Record<string, unknown>> {
  if (useMetadocCloudOpenAiRoute()) {
    const base = getMetadocCloudApiBase()
    if (!base) {
      throw new Error('未配置 VITE_METADOC_CLOUD_API_URL')
    }
    const jwt = await ensureMetadocSteamCloudJwt()
    return {
      apiUrl: `${base}/v1`,
      apiKey: jwt,
      chatSuffix: '/chat/completions',
      completionSuffix: '/completions',
      selectedModel: modelName.trim()
    }
  }

  const ok = await verifyToken(loginToken || '')
  if (!ok) {
    throw new Error('请先登录 MetaDoc 账户')
  }
  const cfg = await getMetaDocLlmConfig(loginToken || '', modelName || '')
  if (!cfg) {
    throw new Error('获取 MetaDoc 模型配置失败')
  }
  return cfg as Record<string, unknown>
}
