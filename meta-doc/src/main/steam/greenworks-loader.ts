/**
 * 可选加载 greenworks；未安装或加载失败时返回 null，应用仍可正常运行。
 *
 * 开发态（electron-vite）主进程运行在 out/main，默认 require 解析可能找不到 pnpm 下的包；
 * 使用 createRequire(项目根 package.json) 与 app.getAppPath() 显式从应用根加载。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createRequire } from 'module'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { createMainLogger } from '../logger'

export type GreenworksApi = any

let cached: GreenworksApi | null | undefined
let lastLoadError: string | undefined

function warnGreenworks(message: string, detail?: unknown) {
  try {
    createMainLogger('Greenworks').warn(message, detail)
  } catch {
    console.warn('[Greenworks]', message, detail)
  }
}

/** 最近一次加载失败原因（供 Steam 状态 reason 展示） */
export function getGreenworksLastLoadError(): string | undefined {
  return lastLoadError
}

function tryRequireFromPackageJson(packageJsonPath: string): GreenworksApi | null {
  try {
    const req = createRequire(packageJsonPath)
    const gw = req('greenworks') as GreenworksApi
    if (gw && typeof gw.init === 'function') {
      return gw
    }
    lastLoadError = 'greenworks 包已解析但缺少 init'
    warnGreenworks(lastLoadError, packageJsonPath)
  } catch (e) {
    lastLoadError = e instanceof Error ? e.message : String(e)
    warnGreenworks(`从 ${packageJsonPath} require('greenworks') 失败`, lastLoadError)
  }
  return null
}

export function loadGreenworks(): GreenworksApi | null {
  if (cached !== undefined) {
    return cached
  }
  lastLoadError = undefined

  const packageJsonCandidates: string[] = []
  try {
    if (app.isReady()) {
      packageJsonCandidates.push(join(app.getAppPath(), 'package.json'))
    }
  } catch {
    /* getAppPath 仅在 ready 后可靠 */
  }
  // out/main -> 项目根（与 electron.vite 输出 layout 一致）
  packageJsonCandidates.push(join(__dirname, '../../package.json'))
  packageJsonCandidates.push(join(process.cwd(), 'package.json'))

  const seen = new Set<string>()
  for (const pkgJson of packageJsonCandidates) {
    const key = pkgJson.split('\\').join('/').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (!existsSync(pkgJson)) {
      continue
    }
    const gw = tryRequireFromPackageJson(pkgJson)
    if (gw) {
      lastLoadError = undefined
      cached = gw
      return gw
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const gw = require('greenworks') as GreenworksApi
    if (gw && typeof gw.init === 'function') {
      lastLoadError = undefined
      cached = gw
      return gw
    }
    lastLoadError = 'greenworks 缺少 init'
  } catch (e) {
    lastLoadError = e instanceof Error ? e.message : String(e)
    warnGreenworks('require("greenworks") 失败', lastLoadError)
  }

  cached = null
  return null
}
