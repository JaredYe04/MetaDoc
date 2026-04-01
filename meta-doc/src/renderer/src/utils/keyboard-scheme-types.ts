/**
 * 快捷键方案类型定义
 * 将「按键事件」配置化，支持多套默认方案（Win/Linux/Mac）与用户自定义方案
 */

/** 可配置的快捷键动作 ID（与 event-bus / 编辑器命令对应） */
export type ShortcutActionId =
  | 'openManual'
  | 'save'
  | 'saveAs'
  | 'saveAll'
  | 'find'
  | 'replace'
  /** 侧栏工作区全局查找/替换（WorkspaceGrepPanel） */
  | 'workspaceGrep'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'undo'
  | 'redo'
  /** 通用缩放：用于编辑器 / 预览 / 大纲等 */
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'

/** 所有可配置动作的列表（用于遍历与默认值） */
export const SHORTCUT_ACTION_IDS: ShortcutActionId[] = [
  'openManual',
  'save',
  'saveAs',
  'saveAll',
  'find',
  'replace',
  'workspaceGrep',
  'copy',
  'cut',
  'paste',
  'undo',
  'redo',
  'zoomIn',
  'zoomOut',
  'zoomReset'
]

/** 单个快捷键的存储格式：修饰键 + 主键，如 "Ctrl+Shift+S"、"F1" */
export type ShortcutBinding = string

/** 方案内各动作的绑定表；每个动作可对应多个快捷键 */
export type ShortcutBindings = Partial<Record<ShortcutActionId, string[]>>

/** 将存储中的 string 或 string[] 规范为 string[]（兼容旧数据） */
export function normalizeBindingValue(v: string | string[] | undefined): string[] {
  if (v == null) return []
  return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [v]
}

/** 将整个 bindings 对象规范为每项均为 string[] */
export function normalizeBindings(b: ShortcutBindings | undefined): ShortcutBindings {
  if (!b) return {}
  const out: ShortcutBindings = {}
  for (const [actionId, val] of Object.entries(b)) {
    const arr = normalizeBindingValue(val as string | string[])
    if (arr.length) out[actionId as ShortcutActionId] = arr
  }
  return out
}

/** 比较两个 bindings 是否一致（用于未保存变更检测） */
export function bindingsEqual(
  a: ShortcutBindings | undefined,
  b: ShortcutBindings | undefined
): boolean {
  const na = normalizeBindings(a)
  const nb = normalizeBindings(b)
  const keys = new Set([...Object.keys(na), ...Object.keys(nb)])
  for (const k of keys) {
    const va = (na[k as ShortcutActionId] ?? []).slice().sort().join(',')
    const vb = (nb[k as ShortcutActionId] ?? []).slice().sort().join(',')
    if (va !== vb) return false
  }
  return true
}

/** 平台标识：用于内置默认方案 */
export type PlatformKind = 'win' | 'linux' | 'mac'

/** 快捷键方案 */
export interface KeyScheme {
  id: string
  name: string
  /** 是否为内置方案（default_win / default_linux / default_mac），不可删除 */
  isBuiltin: boolean
  /** 所属平台（仅内置方案有；自定义方案可为空，表示通用） */
  platform?: PlatformKind
  bindings: ShortcutBindings
  createdAt?: number
  updatedAt?: number
}

/** 解析后的按键（用于匹配 keydown 事件） */
export interface ParsedShortcut {
  key: string
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
}
