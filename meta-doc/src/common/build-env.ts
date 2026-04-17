/**
 * 构建时环境（Vite `import.meta.env`）。
 * Steam 分发包设置 `VITE_STEAM_DISTRIBUTION=true` 与 `VITE_METADOC_CLOUD_API_URL`。
 */

export function isSteamDistribution(): boolean {
  try {
    return import.meta.env.VITE_STEAM_DISTRIBUTION === 'true'
  } catch {
    return false
  }
}

/** Cloudflare Worker 根 URL，无尾部斜杠，例如 https://metadoc-api.example.workers.dev */
export function getMetadocCloudApiBase(): string {
  try {
    const u = import.meta.env.VITE_METADOC_CLOUD_API_URL as string | undefined
    return (u || '').replace(/\/$/, '')
  } catch {
    return ''
  }
}
