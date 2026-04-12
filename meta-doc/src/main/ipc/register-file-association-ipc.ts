/**
 * 系统级文件关联引导：
 * - Windows：打开「设置 → 默认应用」；可选调用 shell32 OpenAs_RunDLL 弹出经典「打开方式」对话框（便于选「始终」）。
 * - NSIS 安装：由 installer.nsh 写 HKLM。
 * - Steam / win-unpacked：无安装脚本时，可由用户点击「写入当前用户关联」写 HKCU（本模块 IPC）。
 */
import { app, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { execFile as execFileCb, spawn } from 'child_process'
import { promisify } from 'util'
import { ipcBridge } from '../bridge/ipc-bridge'
import { createMainLogger } from '../logger'
import { isLikelySteamLaunch } from '../windows/user-file-associations-win'
import {
  queueWindowsUserFileAssociationsWrite,
  registerShellMetadataOnLaunch
} from '../system-integration/register-shell-metadata'

const execFileAsync = promisify(execFileCb)

function spawnDetached(cmd: string, args: string[]): void {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
  child.on('error', () => {})
  child.unref()
}

async function resolveLinuxDefaultAppsPanel(): Promise<[string, string[]] | null> {
  const inPath = async (name: string): Promise<boolean> => {
    try {
      await execFileAsync('which', [name], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }
  if (await inPath('gnome-control-center')) return ['gnome-control-center', ['default-apps']]
  if (await inPath('systemsettings5')) return ['systemsettings5', ['kcm_filetypes']]
  if (await inPath('kcmshell5')) return ['kcmshell5', ['kcm_filetypes']]
  return null
}

/** Windows：系统「打开方式」；其他平台：在文件管理器中定位示例文件，由用户选用何种程序打开。 */
async function openFileAssociationSample(
  ext: 'md' | 'tex'
): Promise<{ ok: boolean; error?: string }> {
  try {
    const dir = app.getPath('temp')
    const filePath = path.join(dir, `metadoc-openwith-sample.${ext}`)
    const body = ext === 'md' ? '# MetaDoc\n\n.\n' : '% MetaDoc\n% .\n'
    await fs.promises.writeFile(filePath, body, 'utf8')
    if (process.platform === 'win32') {
      const sysRoot = process.env.SystemRoot || 'C:\\Windows'
      const rundll = path.join(sysRoot, 'System32', 'rundll32.exe')
      spawnDetached(rundll, ['shell32.dll,OpenAs_RunDLL', filePath])
      return { ok: true }
    }
    shell.showItemInFolder(filePath)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export type FileAssociationContext = {
  platform: NodeJS.Platform
  isPackaged: boolean
  execPath: string
  name: string
  /** Steam 客户端启动时通常会注入 SteamAppId 等环境变量 */
  steamLikely: boolean
}

export function registerFileAssociationIpc(): void {
  const logger = createMainLogger('FileAssociationIpc')

  ipcBridge.registerHandle('get-runtime-platform', async (): Promise<NodeJS.Platform> => {
    return process.platform
  })

  ipcBridge.registerHandle(
    'get-file-association-context',
    async (): Promise<FileAssociationContext> => {
      return {
        platform: process.platform,
        isPackaged: app.isPackaged,
        execPath: app.getPath('exe'),
        name: app.getName(),
        steamLikely: isLikelySteamLaunch()
      }
    }
  )

  ipcBridge.registerHandle(
    'windows-write-user-file-associations',
    async (): Promise<{ ok: boolean; error?: string }> => {
      return queueWindowsUserFileAssociationsWrite()
    }
  )

  ipcBridge.registerHandle(
    'refresh-shell-file-metadata',
    async (_e, payload?: { force?: boolean }) => {
      return registerShellMetadataOnLaunch({ force: payload?.force === true })
    }
  )

  ipcBridge.registerHandle(
    'open-system-file-association-settings',
    async (): Promise<{ ok: boolean; error?: string }> => {
      try {
        if (process.platform === 'win32') {
          await shell.openExternal('ms-settings:defaultapps')
          return { ok: true }
        }
        if (process.platform === 'darwin') {
          spawnDetached('open', ['-b', 'com.apple.systempreferences'])
          return { ok: true }
        }
        if (process.platform === 'linux') {
          const resolved = await resolveLinuxDefaultAppsPanel()
          if (resolved) {
            spawnDetached(resolved[0], resolved[1])
            return { ok: true }
          }
          return { ok: false, error: 'linux_no_control_panel' }
        }
        return { ok: false, error: 'unsupported_platform' }
      } catch (e) {
        logger.warn('open-system-file-association-settings failed', e)
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    }
  )

  ipcBridge.registerHandle(
    'open-file-association-sample',
    async (_e, payload: { ext?: string }): Promise<{ ok: boolean; error?: string }> => {
      const raw = payload?.ext === 'tex' ? 'tex' : 'md'
      return openFileAssociationSample(raw)
    }
  )
}
