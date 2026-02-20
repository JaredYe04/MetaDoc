/**
 * 版本号工具函数
 */

import messageBridge from '../bridge/message-bridge'
import { isDevEnvironment } from './dev-env'

/**
 * 获取应用版本号
 * @returns {Promise<string>} 版本号字符串，如 "Beta0.0.1" 或 "Beta0.0.1-dev"
 */
export async function getAppVersion(): Promise<string> {
  try {
    if (!messageBridge.getIpc()?.invoke) {
      throw new Error('IPC 不可用')
    }
    let version = await messageBridge.invoke('get-app-version')

    // 如果是开发环境，在版本号后面添加 "-dev"
    const isDev = await isDevEnvironment()
    if (isDev) {
      version = `${version}-dev`
    }

    return version
  } catch (error) {
    console.warn('获取版本号失败:', error)
    const isDev = await isDevEnvironment()
    return isDev ? 'Beta0.0.1-dev' : 'Beta0.0.1'
  }
}

/**
 * 同步获取应用版本号（使用缓存）
 * 注意：首次调用前应该先调用异步版本以确保缓存已设置
 */
let versionCache: string | null = null

export async function getAppVersionCached(): Promise<string> {
  if (versionCache !== null) {
    return versionCache
  }

  versionCache = await getAppVersion()
  return versionCache
}
