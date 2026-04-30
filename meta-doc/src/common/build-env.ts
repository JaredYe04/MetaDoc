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

/** Steam 审核阶段锁定：隐藏 BYOK/实验性入口，强制仅官方云链路。 */
export function isSteamReviewLockEnabled(): boolean {
  try {
    return import.meta.env.VITE_STEAM_REVIEW_LOCK === 'true'
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

/**
 * Steam 微交易结账方式：`auto`（默认，有公网 IP 则 Web）、`web`（强制网页）、`client`（仅 Steam 客户端覆盖层，不打开 checkout.steampowered.com）。
 * 网页授权反复「站点错误 / Site Error」时可设 `client` 绕过浏览器支付页（需从 Steam 启动且 Greenworks 支持覆盖层内购）。
 */
export type MetadocSteamMtxCheckoutPref = 'auto' | 'web' | 'client'

export function getMetadocSteamMtxCheckoutPref(): MetadocSteamMtxCheckoutPref {
  try {
    const v = (import.meta.env.VITE_METADOC_STEAM_MTX_CHECKOUT as string | undefined)
      ?.trim()
      .toLowerCase()
    if (v === 'client' || v === 'web' || v === 'auto') return v
  } catch {
    /* ignore */
  }
  return 'auto'
}

/**
 * Web 结账打开方式：`embedded`（默认，Electron 内嵌窗口）或 `external`（系统默认浏览器）。
 * 当内嵌窗口长期停留在 Init / 授权页异常时，可先切到 external 做链路排查。
 */
export type MetadocSteamMtxWebOpenMode = 'embedded' | 'external'

export function getMetadocSteamMtxWebOpenMode(): MetadocSteamMtxWebOpenMode {
  try {
    const v = (import.meta.env.VITE_METADOC_STEAM_MTX_WEB_OPEN as string | undefined)
      ?.trim()
      .toLowerCase()
    if (v === 'external' || v === 'embedded') return v
  } catch {
    /* ignore */
  }
  return 'embedded'
}
