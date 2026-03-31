/**
 * 快捷键字符串解析与 keydown 匹配
 * 格式：Ctrl+Shift+Alt+Meta+Key 或 F1、Enter 等
 */

import type { ParsedShortcut } from './keyboard-scheme-types'

const MODS = ['Ctrl', 'Shift', 'Alt', 'Meta'] as const

function normalizeKeyName(key: string): string {
  const k = (key ?? '').trim()
  if (!k) return ''

  // Mouse / wheel pseudo keys (keep as-is for exact match)
  if (
    k === 'WheelUp' ||
    k === 'WheelDown' ||
    k === 'LeftClick' ||
    k === 'RightClick' ||
    k === 'MiddleClick' ||
    k === 'DoubleClick' ||
    k === 'Button4' ||
    k === 'Button5'
  ) {
    return k
  }

  // Common aliases for zoom keys
  if (k === '+' || k.toLowerCase() === 'plus') return 'Plus'
  if (k === '-' || k.toLowerCase() === 'minus') return 'Minus'
  if (k === '=') return '='

  // Space naming
  if (k === ' ') return 'Space'

  // Single character: store lower for stable match
  if (k.length === 1) return k.toLowerCase()
  return k
}

/**
 * 将 "Ctrl+Shift+S" 解析为 { key: 's', ctrl: true, shift: true, alt: false, meta: false }
 * 大小写：修饰键不区分；主键保留原样用于比较时 toLowerCase（除 F1 等）
 */
export function parseShortcutString(shortcut: string): ParsedShortcut | null {
  if (!shortcut || typeof shortcut !== 'string') return null
  const parts = shortcut
    .trim()
    .split(/\s*\+\s*/)
    .filter(Boolean)
  if (parts.length === 0) return null

  const res: ParsedShortcut = {
    key: '',
    ctrl: false,
    shift: false,
    alt: false,
    meta: false
  }

  for (const p of parts) {
    const lower = p.toLowerCase()
    if (lower === 'ctrl') res.ctrl = true
    else if (lower === 'shift') res.shift = true
    else if (lower === 'alt') res.alt = true
    else if (lower === 'meta') res.meta = true
    else {
      // 主键：F1、Enter、S 等；统一用 res.key 存，比较时再规范
      res.key = normalizeKeyName(p)
    }
  }

  if (!res.key) return null
  return res
}

/**
 * 判断 KeyboardEvent 是否匹配已解析的快捷键
 * isMac: 为 true 时，将 Meta 视为 Cmd；匹配时 e.metaKey 对应 Meta
 */
export function matchShortcut(e: KeyboardEvent, parsed: ParsedShortcut, isMac: boolean): boolean {
  const ek = (e.key ?? '').toString()
  const ekLower = ek.toLowerCase()
  const pk = parsed.key

  // zoom-in: support Ctrl+='=' and Ctrl+'+' (main + numpad)
  const isPlusKey =
    pk === 'Plus' &&
    (ek === '+' || ek === '=' || ekLower === 'plus' || e.code === 'NumpadAdd')

  // zoom-out: support Ctrl+'-' (main + numpad)
  const isMinusKey =
    pk === 'Minus' &&
    (ek === '-' || ekLower === 'minus' || e.code === 'NumpadSubtract')

  const keyMatch =
    isPlusKey ||
    isMinusKey ||
    ek === pk ||
    (pk.length === 1 && ekLower === pk.toLowerCase())

  if (!keyMatch) return false

  if (parsed.ctrl && !e.ctrlKey) return false
  if (!parsed.ctrl && e.ctrlKey) return false
  if (parsed.shift && !e.shiftKey) return false
  if (!parsed.shift && e.shiftKey) return false
  if (parsed.alt && !e.altKey) return false
  if (!parsed.alt && e.altKey) return false
  if (parsed.meta && !e.metaKey) return false
  if (!parsed.meta && e.metaKey) return false

  return true
}

/**
 * 和弦键：如 "Ctrl+K S" 表示先按 Ctrl+K，再按 S
 * 当前仅做单键匹配；saveAll 等和弦由主进程或单独逻辑处理，这里可先不解析 "K S"
 */
export function isChordShortcut(shortcut: string): boolean {
  return /\s+S\s*$/.test(shortcut) || shortcut.includes(' S ')
}
