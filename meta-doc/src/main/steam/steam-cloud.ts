import type { GreenworksApi } from './greenworks-loader'

/** 允许写入 Steam 云的路径：根文件或 docs/ 下任意单层/嵌套（禁止 ..） */
export function assertAllowedSteamCloudPath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..')) {
    throw new Error('invalid_cloud_path')
  }
  if (normalized === 'settings.json' || normalized === 'history.json') {
    return normalized
  }
  if (normalized === 'docs/manifest.json' || normalized.startsWith('docs/')) {
    return normalized
  }
  throw new Error('path_not_whitelisted')
}

export function saveTextToCloud(
  gw: GreenworksApi,
  relPath: string,
  content: string
): Promise<{ success: true } | { success: false; error: string }> {
  const path = assertAllowedSteamCloudPath(relPath)
  return new Promise((resolve) => {
    gw.saveTextToFile(
      path,
      content,
      () => resolve({ success: true }),
      (err: Error | string) =>
        resolve({
          success: false,
          error: err instanceof Error ? err.message : String(err)
        })
    )
  })
}

export function readTextFromCloud(
  gw: GreenworksApi,
  relPath: string
): Promise<{ success: true; content: string } | { success: false; error: string }> {
  const path = assertAllowedSteamCloudPath(relPath)
  return new Promise((resolve) => {
    gw.readTextFromFile(
      path,
      (content: string) => resolve({ success: true, content: String(content ?? '') }),
      (err: Error | string) =>
        resolve({
          success: false,
          error: err instanceof Error ? err.message : String(err)
        })
    )
  })
}
