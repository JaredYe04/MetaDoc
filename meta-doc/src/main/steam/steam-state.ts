import { app } from 'electron'
import { createMainLogger } from '../logger'
import {
  loadGreenworks,
  getGreenworksLastLoadError,
  type GreenworksApi
} from './greenworks-loader'

const logger = createMainLogger('Steam')

export type SteamInitResult = {
  available: boolean
  initialized: boolean
  reason?: string
}

let lastInit: SteamInitResult = {
  available: false,
  initialized: false,
  reason: 'not_attempted'
}

export function getSteamInitResult(): SteamInitResult {
  return { ...lastInit }
}

function tryInitInternal(): SteamInitResult {
  const gw = loadGreenworks() as GreenworksApi | null
  if (!gw) {
    const detail = getGreenworksLastLoadError()
    return {
      available: false,
      initialized: false,
      reason: detail ? `greenworks_not_loaded: ${detail}` : 'greenworks_not_loaded'
    }
  }
  /**
   * greenworks 在 init 内用相对路径读取 steam_appid.txt（依赖 process.cwd）。
   * pnpm dev / 从其它目录启动时 cwd 可能不是项目根，临时切换到 app.getAppPath()。
   */
  let appPath: string | undefined
  try {
    if (app.isReady()) {
      appPath = app.getAppPath()
    }
  } catch {
    appPath = undefined
  }
  const prevCwd = process.cwd()
  const shouldChdir = Boolean(appPath && appPath !== prevCwd)
  if (shouldChdir && appPath) {
    try {
      process.chdir(appPath)
    } catch (e) {
      logger.warn('Steam: 无法 chdir 到应用目录，steam_appid.txt 可能读不到', e)
    }
  }
  try {
    const ok = gw.init() === true
    if (ok) {
      return { available: true, initialized: true }
    }
    return { available: true, initialized: false, reason: 'init_returned_false' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn('Steam init failed', msg)
    return { available: true, initialized: false, reason: msg }
  } finally {
    if (shouldChdir) {
      try {
        process.chdir(prevCwd)
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * 幂等：首次成功则保持；失败可再次调用（例如用户稍后从 Steam 重启）。
 */
export function initSteam(): SteamInitResult {
  if (lastInit.initialized) {
    return getSteamInitResult()
  }
  lastInit = tryInitInternal()
  if (lastInit.initialized) {
    logger.info('Steam API initialized')
  }
  return getSteamInitResult()
}

export function getGreenworksOrNull(): GreenworksApi | null {
  if (!lastInit.initialized) {
    return null
  }
  return loadGreenworks()
}

/**
 * 应用退出时释放 Steam API（若 greenworks 提供 shutdown 类方法则调用）。
 */
export function shutdownSteam(): void {
  if (!lastInit.initialized) {
    return
  }
  const gw = loadGreenworks()
  if (!gw) {
    lastInit = { ...lastInit, initialized: false }
    return
  }
  try {
    const fn = gw.shutdown ?? gw.Shutdown
    if (typeof fn === 'function') {
      fn.call(gw)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn('Steam shutdown failed', msg)
  }
  lastInit = { ...lastInit, initialized: false }
}
