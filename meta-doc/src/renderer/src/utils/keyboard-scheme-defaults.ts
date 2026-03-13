/**
 * 默认快捷键方案：Win、Linux、Mac 三套
 * 首次启动时根据当前系统选择对应默认方案
 */

import type { KeyScheme, ShortcutBindings } from './keyboard-scheme-types'

const DEFAULT_WIN_LINUX: ShortcutBindings = {
  openManual: ['F1'],
  save: ['Ctrl+S'],
  saveAs: ['Ctrl+Shift+S'],
  saveAll: ['Ctrl+K S'],
  find: ['Ctrl+F'],
  replace: ['Ctrl+H'],
  copy: ['Ctrl+C'],
  cut: ['Ctrl+X'],
  paste: ['Ctrl+V'],
  undo: ['Ctrl+Z'],
  redo: ['Ctrl+Shift+Z']
}

const DEFAULT_MAC: ShortcutBindings = {
  openManual: ['F1'],
  save: ['Meta+S'],
  saveAs: ['Meta+Shift+S'],
  saveAll: ['Meta+K S'],
  find: ['Meta+F'],
  replace: ['Meta+H'],
  copy: ['Meta+C'],
  cut: ['Meta+X'],
  paste: ['Meta+V'],
  undo: ['Meta+Z'],
  redo: ['Meta+Shift+Z']
}

export const BUILTIN_SCHEME_IDS = {
  win: 'default_win',
  linux: 'default_linux',
  mac: 'default_mac'
} as const

export function getDefaultSchemes(): KeyScheme[] {
  return [
    {
      id: BUILTIN_SCHEME_IDS.win,
      name: 'Default (Windows)',
      isBuiltin: true,
      platform: 'win',
      bindings: { ...DEFAULT_WIN_LINUX }
    },
    {
      id: BUILTIN_SCHEME_IDS.linux,
      name: 'Default (Linux)',
      isBuiltin: true,
      platform: 'linux',
      bindings: { ...DEFAULT_WIN_LINUX }
    },
    {
      id: BUILTIN_SCHEME_IDS.mac,
      name: 'Default (macOS)',
      isBuiltin: true,
      platform: 'mac',
      bindings: { ...DEFAULT_MAC }
    }
  ]
}

/** 根据当前运行环境判断平台（渲染进程用） */
export function detectPlatform(): 'win' | 'linux' | 'mac' {
  if (typeof navigator === 'undefined') return 'win'
  const p = navigator.platform || (navigator as any).userAgentData?.platform || ''
  if (/Mac|iPhone|iPod|iPad/i.test(p)) return 'mac'
  if (/Linux/i.test(p)) return 'linux'
  return 'win'
}

/** 首次启动时推荐的默认方案 ID */
export function getDefaultSchemeIdForPlatform(): string {
  const platform = detectPlatform()
  if (platform === 'mac') return BUILTIN_SCHEME_IDS.mac
  if (platform === 'linux') return BUILTIN_SCHEME_IDS.linux
  return BUILTIN_SCHEME_IDS.win
}
