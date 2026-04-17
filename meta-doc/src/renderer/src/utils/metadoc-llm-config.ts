import { getMetadocCloudApiBase } from '@common/build-env'
import { ensureMetadocSteamCloudJwt } from './metadoc-cloud-auth'
import { useMetadocCloudOpenAiRoute } from './dev-ai-pipeline'
import { getMetaDocLlmConfig, verifyToken } from './web-utils.ts'

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
      completionSuffix: '/completions'
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
