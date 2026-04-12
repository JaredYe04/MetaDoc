/**
 * 记录已向系统登记 shell 元数据时的指纹，避免每次启动重复写注册表 / .desktop / lsregister。
 * 逻辑或模板变更时递增 REGISTRATION_SCHEMA_VERSION。
 */
import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'

export const REGISTRATION_SCHEMA_VERSION = 1

export type ShellMetadataCacheRecord = {
  schema: number
  platform: NodeJS.Platform
  appVersion: string
  /** 可执行文件或 .app / AppImage 的稳定路径指纹 */
  fingerprint: string
  updatedAt: number
}

function cacheFilePath(): string {
  return path.join(app.getPath('userData'), 'shell-metadata-registration.json')
}

export type ShellMetadataFingerprint = {
  schema: number
  platform: NodeJS.Platform
  appVersion: string
  fingerprint: string
}

export function buildShellMetadataFingerprint(): ShellMetadataFingerprint {
  const exe = app.getPath('exe')
  const platform = process.platform
  let fingerprint = path.resolve(exe)
  if (platform === 'darwin') {
    fingerprint = path.resolve(path.dirname(exe), '..', '..')
  } else if (platform === 'linux') {
    fingerprint = path.resolve(process.env.APPIMAGE || exe)
  }
  return {
    schema: REGISTRATION_SCHEMA_VERSION,
    platform,
    appVersion: app.getVersion(),
    fingerprint
  }
}

export function fingerprintMatchesCache(
  fp: ShellMetadataFingerprint,
  cached: ShellMetadataCacheRecord | null
): boolean {
  if (!cached) return false
  return (
    cached.schema === fp.schema &&
    cached.platform === fp.platform &&
    cached.appVersion === fp.appVersion &&
    cached.fingerprint === fp.fingerprint
  )
}

export async function readShellMetadataCache(): Promise<ShellMetadataCacheRecord | null> {
  try {
    const raw = await fs.readFile(cacheFilePath(), 'utf8')
    const j = JSON.parse(raw) as ShellMetadataCacheRecord
    if (
      typeof j.schema === 'number' &&
      typeof j.platform === 'string' &&
      typeof j.appVersion === 'string' &&
      typeof j.fingerprint === 'string'
    ) {
      return j
    }
    return null
  } catch {
    return null
  }
}

export async function writeShellMetadataCache(fp: ShellMetadataFingerprint): Promise<void> {
  const rec: ShellMetadataCacheRecord = {
    ...fp,
    updatedAt: Date.now()
  }
  await fs.writeFile(cacheFilePath(), JSON.stringify(rec, null, 0), 'utf8')
}
