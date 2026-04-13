/**
 * 打包启动时向操作系统注册「应用身份」：显示名、图标、支持的类型（.md / .tex），
 * 使用户在系统「打开方式 / 默认应用」中可选到 MetaDoc。
 * 异步、非阻塞；与 userData 中缓存指纹比对，已登记且路径/版本未变则跳过。
 */
import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { execFile as execFileCb, spawn } from 'child_process'
import { promisify } from 'util'
import { createMainLogger } from '../logger'
import { writeWindowsCurrentUserFileAssociationsAsync } from '../windows/user-file-associations-win'
import {
  buildShellMetadataFingerprint,
  fingerprintMatchesCache,
  readShellMetadataCache,
  writeShellMetadataCache
} from './shell-metadata-cache'
import { ensureUserNewDocumentTemplatesInstalled } from './ensure-new-document-templates'

const logger = createMainLogger('ShellMetadata')

const execFileAsync = promisify(execFileCb)

const DISPLAY_NAME = 'MetaDoc'
const DESKTOP_FILE = 'com.byte-light.metadoc.desktop'

/** 串行执行，避免启动与手动刷新并发写系统 */
let shellMetadataQueue: Promise<unknown> = Promise.resolve()

async function firstExistingAsync(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    if (!p) continue
    try {
      await fs.access(p)
      return p
    } catch {
      continue
    }
  }
  return null
}

async function refreshMacLaunchServicesAsync(): Promise<{ ok: boolean; error?: string }> {
  const exe = app.getPath('exe')
  const bundle = path.resolve(path.dirname(exe), '..', '..')
  const plist = path.join(bundle, 'Contents', 'Info.plist')
  try {
    await fs.access(plist)
  } catch {
    return { ok: false, error: 'no_app_bundle' }
  }
  const lsregister =
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
  try {
    await fs.access(lsregister)
  } catch {
    return { ok: false, error: 'no_lsregister' }
  }
  try {
    await execFileAsync(lsregister, ['-f', bundle], { stdio: 'ignore' })
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn('lsregister failed', e)
    return { ok: false, error: msg }
  }
}

async function resolveLinuxIconAsync(): Promise<string | null> {
  const res = process.resourcesPath
  return firstExistingAsync([
    path.join(res, 'icon.png'),
    path.join(res, 'build', 'icon.png'),
    path.join(res, 'md-icon.png')
  ])
}

async function writeLinuxUserDesktopEntryAsync(): Promise<{ ok: boolean; error?: string }> {
  try {
    const home = app.getPath('home')
    const localApps = path.join(home, '.local', 'share', 'applications')
    await fs.mkdir(localApps, { recursive: true })

    const execTarget = process.env.APPIMAGE || app.getPath('exe')
    const execLine = execTarget.includes(' ') ? `"${execTarget}"` : execTarget
    const iconPath = await resolveLinuxIconAsync()

    const lines: string[] = [
      '[Desktop Entry]',
      'Type=Application',
      'Version=1.5',
      `Name=${DISPLAY_NAME}`,
      'GenericName=Document Editor',
      `Comment=${DISPLAY_NAME}`
    ]
    if (iconPath) {
      lines.push(`Icon=${iconPath}`)
    }
    lines.push(
      `Exec=${execLine} %F`,
      'Terminal=false',
      'Categories=Utility;TextEditor;',
      'MimeType=text/markdown;text/x-tex;',
      'StartupNotify=true',
      'StartupWMClass=meta-doc'
    )

    const dest = path.join(localApps, DESKTOP_FILE)
    await fs.writeFile(dest, `${lines.join('\n')}\n`, 'utf8')
    try {
      await fs.chmod(dest, 0o644)
    } catch {
      // ignore
    }

    try {
      await execFileAsync('update-desktop-database', [localApps], { stdio: 'ignore' })
    } catch {
      const child = spawn('update-desktop-database', [localApps], {
        detached: true,
        stdio: 'ignore'
      })
      child.on('error', () => {})
      child.unref()
    }

    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn('writeLinuxUserDesktopEntryAsync failed', e)
    return { ok: false, error: msg }
  }
}

export type ShellMetadataResult = {
  ok: boolean
  platform: string
  error?: string
  /** 与缓存一致，未重复写入 */
  skipped?: boolean
}

async function registerShellMetadataOnLaunchImpl(options?: {
  force?: boolean
}): Promise<ShellMetadataResult> {
  if (!app.isPackaged) {
    return { ok: false, platform: 'all', error: 'not_packaged' }
  }

  const fp = buildShellMetadataFingerprint()

  if (!options?.force) {
    const cached = await readShellMetadataCache()
    if (fingerprintMatchesCache(fp, cached)) {
      return { ok: true, platform: process.platform, skipped: true }
    }
  }

  let result: ShellMetadataResult

  if (process.platform === 'win32') {
    const r = await writeWindowsCurrentUserFileAssociationsAsync()
    if (!r.ok) {
      logger.info('Windows shell metadata', r.error || 'failed')
    }
    result = { ok: r.ok, platform: 'win32', error: r.error }
  } else if (process.platform === 'darwin') {
    const r = await refreshMacLaunchServicesAsync()
    if (!r.ok) {
      logger.info('macOS lsregister', r.error || 'failed')
    }
    result = { ok: r.ok, platform: 'darwin', error: r.error }
  } else if (process.platform === 'linux') {
    const r = await writeLinuxUserDesktopEntryAsync()
    if (!r.ok) {
      logger.info('Linux .desktop', r.error || 'failed')
    }
    result = { ok: r.ok, platform: 'linux', error: r.error }
  } else {
    result = { ok: true, platform: process.platform }
  }

  if (result.ok && !result.error) {
    try {
      await writeShellMetadataCache(fp)
    } catch (e) {
      logger.warn('writeShellMetadataCache failed', e)
    }
  }

  if (app.isPackaged && (process.platform === 'linux' || process.platform === 'darwin')) {
    void ensureUserNewDocumentTemplatesInstalled().catch((e) =>
      logger.warn('ensureUserNewDocumentTemplatesInstalled failed', e)
    )
  }

  return result
}

/**
 * @param force 为 true 时忽略缓存（设置页「重新注册」）；默认启动传 false，已登记则跳过。
 */
export function registerShellMetadataOnLaunch(options?: {
  force?: boolean
}): Promise<ShellMetadataResult> {
  const job = shellMetadataQueue.then(() => registerShellMetadataOnLaunchImpl(options))
  shellMetadataQueue = job.then(
    () => {},
    () => {}
  )
  return job
}

/** 与启动登记共用队列，避免与 registerShellMetadataOnLaunch 并发写 HKCU。 */
export function queueWindowsUserFileAssociationsWrite(): Promise<{
  ok: boolean
  error?: string
}> {
  const job = shellMetadataQueue.then(async () => {
    if (process.platform !== 'win32') {
      return { ok: false, error: 'not_windows' }
    }
    const r = await writeWindowsCurrentUserFileAssociationsAsync()
    if (r.ok) {
      try {
        await writeShellMetadataCache(buildShellMetadataFingerprint())
      } catch {
        // 忽略缓存失败
      }
    }
    return r
  })
  shellMetadataQueue = job.then(
    () => {},
    () => {}
  )
  return job
}
