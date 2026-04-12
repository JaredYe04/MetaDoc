/**
 * PTY 终端服务：基于 node-pty 的持久终端管理
 * 用于 PlainTextEditor 的交互式终端，支持 vim、python 等交互式程序
 */

import type { IPty } from 'node-pty'
import type { WebContents } from 'electron'
import { createMainLogger } from '../logger'

const logger = createMainLogger('TerminalPty')

export interface PtyEntry {
  pty: IPty
  webContents: WebContents
  cols: number
  rows: number
}

const ptyMap = new Map<string, PtyEntry>()

/** 获取可用的 Shell 列表（按平台） */
export function getAvailableShells(): Array<{ id: string; path: string; label: string }> {
  const platform = process.platform
  const shells: Array<{ id: string; path: string; label: string }> = []

  if (platform === 'win32') {
    shells.push({ id: 'cmd', path: 'cmd.exe', label: 'Command Prompt (cmd.exe)' })
    // PowerShell - 检测是否安装
    const psPath = process.env.SystemRoot
      ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
      : 'powershell.exe'
    shells.push({ id: 'powershell', path: psPath, label: 'PowerShell' })
    // PowerShell Core
    shells.push({ id: 'pwsh', path: 'pwsh.exe', label: 'PowerShell Core (pwsh)' })
  } else {
    const defaultShell = process.env.SHELL || '/bin/bash'
    const shellName = defaultShell.split('/').pop() || 'sh'
    shells.push({ id: shellName, path: defaultShell, label: `${shellName} (${defaultShell})` })
    if (defaultShell !== '/bin/bash') {
      shells.push({ id: 'bash', path: '/bin/bash', label: 'Bash (/bin/bash)' })
    }
    if (defaultShell !== '/bin/zsh') {
      shells.push({ id: 'zsh', path: '/bin/zsh', label: 'Zsh (/bin/zsh)' })
    }
  }
  return shells
}

/** 根据 shellId 解析实际 shell 路径 */
export function resolveShell(shellId?: string): { shell: string; args: string[] } {
  const shells = getAvailableShells()
  const platform = process.platform

  if (shellId && shells.some((s) => s.id === shellId)) {
    const found = shells.find((s) => s.id === shellId)
    if (found) {
      if (platform === 'win32') {
        return { shell: found.path, args: [] }
      }
      return { shell: found.path, args: [] }
    }
  }

  // 默认
  if (platform === 'win32') {
    return { shell: 'cmd.exe', args: [] }
  }
  return { shell: process.env.SHELL || '/bin/bash', args: [] }
}

/** 创建 PTY */
export async function createPty(
  consoleKey: string,
  webContents: WebContents,
  options: { cwd?: string; shell?: string; cols?: number; rows?: number }
): Promise<{ success: boolean; error?: string }> {
  if (ptyMap.has(consoleKey)) {
    killPty(consoleKey)
  }

  try {
    const pty = await import('node-pty')
    const { shell, args } = resolveShell(options.shell)
    const cols = options.cols ?? 80
    const rows = options.rows ?? 24
    const cwd = options.cwd || process.cwd()

    // Windows 下设置 UTF-8 环境，避免中文乱码
    const env = { ...process.env }
    if (process.platform === 'win32') {
      env.CHCP = '65001'
    }

    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env,
      encoding: 'utf8'
    }) as IPty

    ptyProcess.onData((data: string) => {
      const entry = ptyMap.get(consoleKey)
      if (entry && !entry.webContents.isDestroyed()) {
        entry.webContents.send('terminal-data', { consoleKey, data })
      }
    })

    ptyProcess.onExit(({ exitCode }) => {
      const entry = ptyMap.get(consoleKey)
      if (entry && !entry.webContents.isDestroyed()) {
        entry.webContents.send('terminal-exit', { consoleKey, exitCode })
      }
      ptyMap.delete(consoleKey)
      logger.info(`PTY ${consoleKey} 已退出, exitCode=${exitCode}`)
    })

    ptyMap.set(consoleKey, {
      pty: ptyProcess,
      webContents,
      cols,
      rows
    })

    logger.info(`PTY 已创建: consoleKey=${consoleKey}, shell=${shell}, cwd=${cwd}`)
    return { success: true }
  } catch (error) {
    logger.error('创建 PTY 失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/** 向 PTY 写入数据 */
export function writeToPty(consoleKey: string, data: string): { success: boolean; error?: string } {
  const entry = ptyMap.get(consoleKey)
  if (!entry) {
    return { success: false, error: 'PTY 不存在' }
  }
  try {
    entry.pty.write(data)
    return { success: true }
  } catch (error) {
    logger.error('写入 PTY 失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/** 调整 PTY 尺寸 */
export function resizePty(
  consoleKey: string,
  cols: number,
  rows: number
): { success: boolean; error?: string } {
  const entry = ptyMap.get(consoleKey)
  if (!entry) {
    return { success: false, error: 'PTY 不存在' }
  }
  try {
    entry.pty.resize(cols, rows)
    entry.cols = cols
    entry.rows = rows
    return { success: true }
  } catch (error) {
    logger.error('调整 PTY 尺寸失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/** 应用退出时终止全部 PTY，避免 shell/conhost 残留 */
export function killAllPtys(): void {
  const keys = Array.from(ptyMap.keys())
  for (const key of keys) {
    killPty(key)
  }
}

/** 终止 PTY */
export function killPty(consoleKey: string): { success: boolean; error?: string } {
  const entry = ptyMap.get(consoleKey)
  if (!entry) {
    return { success: false, error: 'PTY 不存在' }
  }
  try {
    entry.pty.kill()
    ptyMap.delete(consoleKey)
    logger.info(`PTY 已终止: consoleKey=${consoleKey}`)
    return { success: true }
  } catch (error) {
    ptyMap.delete(consoleKey)
    logger.error('终止 PTY 失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
