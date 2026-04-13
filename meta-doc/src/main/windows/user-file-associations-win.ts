/**
 * 向当前用户 (HKCU) 写入应用与 ProgID 元数据（显示名、图标、SupportedTypes、Capabilities 等），
 * 使「打开方式」「默认应用」能识别 MetaDoc（无需管理员）。
 * 使用异步 execFile，避免阻塞主线程。
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'
import { createMainLogger } from '../logger'
import { t } from '../i18n'

const execFileAsync = promisify(execFileCb)

const logger = createMainLogger('WinUserAssoc')

const DISPLAY_NAME = 'MetaDoc'
const PROG_MD = 'MetaDoc.Markdown'
const PROG_TEX = 'MetaDoc.LaTeX'
const CAPABILITIES_VALUE = 'Software\\ByteLight\\MetaDoc\\Capabilities'

function regPath(): string {
  return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe')
}

async function regAsync(args: string[]): Promise<void> {
  await execFileAsync(regPath(), args, { windowsHide: true })
}

async function regAddVe(key: string, data: string): Promise<void> {
  await regAsync(['add', key, '/ve', '/t', 'REG_SZ', '/d', data, '/f'])
}

async function regAddV(key: string, name: string, data: string): Promise<void> {
  await regAsync(['add', key, '/v', name, '/t', 'REG_SZ', '/d', data, '/f'])
}

async function regEnsureKey(key: string): Promise<void> {
  try {
    await regAsync(['add', key, '/f'])
  } catch {
    // 已存在
  }
}

async function regDeleteKeyIfExists(key: string): Promise<void> {
  try {
    await regAsync(['delete', key, '/f'])
  } catch {
    // 不存在或已删除
  }
}

function firstExisting(paths: string[]): string | null {
  for (const p of paths) {
    if (p && fs.existsSync(p)) return p
  }
  return null
}

function resolveMdTexIcons(exePath: string): { md: string; tex: string; appIcon: string } {
  const exeDir = path.dirname(exePath)
  const res = process.resourcesPath || path.join(exeDir, 'resources')
  const md =
    firstExisting([
      path.join(res, 'md-icon.ico'),
      path.join(res, 'build', 'md-icon.ico'),
      path.join(exeDir, 'resources', 'md-icon.ico')
    ]) || null
  const tex =
    firstExisting([
      path.join(res, 'tex-icon.ico'),
      path.join(res, 'build', 'tex-icon.ico'),
      path.join(exeDir, 'resources', 'tex-icon.ico')
    ]) || null
  const fallback = `${exePath},0`
  return {
    md: md ? `${md},0` : fallback,
    tex: tex ? `${tex},0` : fallback,
    appIcon: fallback
  }
}

/**
 * 仅打包后的 Windows 进程应调用；开发模式 exe 为 Electron，不应写入。
 */
export async function writeWindowsCurrentUserFileAssociationsAsync(): Promise<{
  ok: boolean
  error?: string
}> {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'not_windows' }
  }
  if (!app.isPackaged) {
    return { ok: false, error: 'not_packaged' }
  }

  const exePath = app.getPath('exe')
  const exeBase = path.basename(exePath)
  const openCmd = `"${exePath}" "%1"`
  const icons = resolveMdTexIcons(exePath)

  const appRegKey = `HKCU\\Software\\Classes\\Applications\\${exeBase}`
  const appPathsKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeBase}`
  const capBase = 'HKCU\\Software\\ByteLight\\MetaDoc\\Capabilities'
  const capFa = `${capBase}\\FileAssociations`
  const progMdKey = `HKCU\\Software\\Classes\\${PROG_MD}`
  const progTexKey = `HKCU\\Software\\Classes\\${PROG_TEX}`

  const mdTypeName = t('windowsShell.markdownDocument', 'Markdown Document')
  const mdNewLabel = t('windowsShell.markdownNewMenu', 'Markdown')
  const texTypeName = t('windowsShell.latexDocument', 'LaTeX Document')
  const texNewLabel = t('windowsShell.latexNewMenu', 'LaTeX')

  try {
    // 与 NSIS 一致：去掉 SupportedTypes，避免与 ProgID 并列出现两条「MetaDoc」（一条为 exe 默认图标）
    await regDeleteKeyIfExists(`${appRegKey}\\SupportedTypes`)

    await regAddVe(appRegKey, DISPLAY_NAME)
    await regAddV(appRegKey, 'FriendlyAppName', DISPLAY_NAME)
    await regAddVe(`${appRegKey}\\DefaultIcon`, icons.appIcon)
    await regAddVe(`${appRegKey}\\shell\\open\\command`, openCmd)

    await regAddVe(appPathsKey, exePath)

    await regAddV('HKCU\\Software\\RegisteredApplications', 'MetaDoc', CAPABILITIES_VALUE)
    await regAddV(capBase, 'ApplicationName', DISPLAY_NAME)
    await regAddV(capBase, 'ApplicationDescription', DISPLAY_NAME)
    await regAddV(capBase, 'ApplicationIcon', icons.appIcon)
    await regAddV(capFa, '.md', PROG_MD)
    await regAddV(capFa, '.tex', PROG_TEX)

    await regAddVe(progMdKey, mdTypeName)
    await regAddVe(`${progMdKey}\\DefaultIcon`, icons.md)
    await regAddVe(`${progMdKey}\\shell\\open\\command`, openCmd)

    await regAddVe(progTexKey, texTypeName)
    await regAddVe(`${progTexKey}\\DefaultIcon`, icons.tex)
    await regAddVe(`${progTexKey}\\shell\\open\\command`, openCmd)

    // 当前用户「新建」菜单（Steam / 便携版无 NSIS 时使用 HKCU 登记）；文案与主进程 i18n 一致
    await regEnsureKey('HKCU\\Software\\Classes\\.md\\ShellNew')
    await regAddV('HKCU\\Software\\Classes\\.md\\ShellNew', 'NullFile', '')
    await regAddV('HKCU\\Software\\Classes\\.md\\ShellNew', 'ItemName', mdNewLabel)
    await regEnsureKey('HKCU\\Software\\Classes\\.tex\\ShellNew')
    await regAddV('HKCU\\Software\\Classes\\.tex\\ShellNew', 'NullFile', '')
    await regAddV('HKCU\\Software\\Classes\\.tex\\ShellNew', 'ItemName', texNewLabel)

    await regEnsureKey(`HKCU\\Software\\Classes\\.md\\OpenWithProgids\\${PROG_MD}`)
    await regEnsureKey(`HKCU\\Software\\Classes\\.tex\\OpenWithProgids\\${PROG_TEX}`)

    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn('writeWindowsCurrentUserFileAssociationsAsync failed', e)
    return { ok: false, error: msg }
  }
}

export function isLikelySteamLaunch(): boolean {
  return Boolean(process.env.SteamAppId || process.env.SteamGameId)
}
