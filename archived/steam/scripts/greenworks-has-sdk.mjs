/**
 * 检测 Steamworks SDK 是否已按 greenworks 要求就绪：
 * - node_modules/greenworks/deps/steamworks_sdk
 * - 或环境变量 STEAMWORKS_SDK_PATH 指向 steamworks_sdk 目录
 * @see https://github.com/greenheartgames/greenworks/blob/master/docs/get-steamworks-sdk.md
 */
import { existsSync, statSync } from 'fs'
import { join } from 'path'

export function getGreenworksRoot(cwd = process.cwd()) {
  return join(cwd, 'node_modules', 'greenworks')
}

function isDir(p) {
  try {
    return existsSync(p) && statSync(p).isDirectory()
  } catch {
    return false
  }
}

function isFile(p) {
  try {
    return existsSync(p) && statSync(p).isFile()
  } catch {
    return false
  }
}

/** greenworks 编译所需的 deps 路径是否已有 SDK（postinstall prepare 之后会存在） */
export function hasSteamworksSdk(cwd = process.cwd()) {
  const fromEnv = process.env.STEAMWORKS_SDK_PATH
  if (fromEnv && isDir(fromEnv)) {
    return true
  }
  const nested = join(getGreenworksRoot(cwd), 'deps', 'steamworks_sdk')
  return isDir(nested)
}

const REPO_ZIP_NAMES = ['SteamworksSDK.zip', 'steamworks_sdk.zip', 'steamworks.zip']

export function hasRepoSteamworksZip(cwd = process.cwd()) {
  for (const name of REPO_ZIP_NAMES) {
    const p = join(cwd, 'third-party', 'steamworks-sdk', name)
    if (isFile(p)) {
      return true
    }
  }
  return false
}

/** 是否存在任一可自动链入的 SDK 来源（用于提示文案） */
export function hasSteamworksSdkSourceHint(cwd = process.cwd()) {
  if (hasRepoSteamworksZip(cwd)) {
    return true
  }
  if (process.env.STEAMWORKS_SDK_PATH && isDir(process.env.STEAMWORKS_SDK_PATH)) {
    return true
  }
  if (isDir(join(cwd, 'steamworks_sdk'))) {
    return true
  }
  if (isDir(join(cwd, '.steamworks', 'steamworks_sdk'))) {
    return true
  }
  const zip = process.env.STEAMWORKS_SDK_ZIP?.trim()
  if (zip && isFile(zip)) {
    return true
  }
  if (process.env.STEAMWORKS_SDK_ARCHIVE_URL?.trim()) {
    return true
  }
  return false
}
