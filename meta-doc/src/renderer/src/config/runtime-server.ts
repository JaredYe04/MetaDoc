/**
 * 运行时服务器地址（渲染进程）
 * 通过消息桥从主进程获取，统一替换硬编码的 localhost:52521
 */

import messageBridge from '../bridge/message-bridge'

let cachedBaseUrl: string | null = null

/**
 * 获取运行时服务器 base URL（如 http://127.0.0.1:52521），带缓存
 */
export async function getRuntimeServerBaseUrl(): Promise<string> {
  if (cachedBaseUrl != null) return cachedBaseUrl
  try {
    cachedBaseUrl = (await messageBridge.invoke('get-runtime-server-base-url')) as string
    return cachedBaseUrl
  } catch (e) {
    const fallback = 'http://127.0.0.1:52521'
    if (typeof console !== 'undefined')
      console.warn('[runtime-server] 获取 baseUrl 失败，使用默认:', fallback, e)
    return fallback
  }
}

/**
 * 同步获取已缓存的 base URL（需先调用过 getRuntimeServerBaseUrl）
 * 若未初始化则返回默认值，便于同步代码使用
 */
export function getRuntimeServerBaseUrlSync(): string {
  if (cachedBaseUrl != null) return cachedBaseUrl
  return 'http://127.0.0.1:52521'
}

/**
 * 设置缓存的 base URL（用于测试或提前注入）
 */
export function setRuntimeServerBaseUrl(url: string): void {
  cachedBaseUrl = url
}
