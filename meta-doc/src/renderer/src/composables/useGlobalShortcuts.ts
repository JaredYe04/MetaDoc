/**
 * 全局快捷键统一管理（渲染进程）
 *
 * 快捷键由「按键方案」配置驱动（见 keyboard-scheme-manager），
 * 支持默认 Win/Linux/Mac 方案与用户自定义方案。方案切换后需触发 refreshShortcutBindings 或发送 'shortcut-scheme-updated' 以生效。
 *
 * 【主进程 before-input-event】Tab/文件类仍由主进程处理；
 * 本模块处理：打开用户手册、保存/另存为、查找/替换、复制/剪切/粘贴、撤销/重做。
 */

import eventBus from '../utils/event-bus'
import type { useWorkspace } from '../stores/workspace'
import { getEffectiveBindings } from '../utils/keyboard-scheme-manager'
import { parseShortcutString, matchShortcut } from '../utils/keyboard-scheme-parse'
import type { ShortcutBindings, ShortcutActionId } from '../utils/keyboard-scheme-types'

export interface UseGlobalShortcutsOptions {
  workspace: ReturnType<typeof useWorkspace>
  t: (key: string, fallback?: string) => string
}

/** 当前生效的绑定（在 register 时加载，scheme 更新后需调用 refreshShortcutBindings） */
let currentBindings: ShortcutBindings = {}

/** 刷新当前绑定（设置页保存方案后调用或监听 shortcut-scheme-updated） */
export async function refreshShortcutBindings(): Promise<void> {
  currentBindings = await getEffectiveBindings()
}

function getTargetAction(e: KeyboardEvent, isMac: boolean): ShortcutActionId | null {
  for (const [actionId, shortcuts] of Object.entries(currentBindings)) {
    const list = Array.isArray(shortcuts) ? shortcuts : shortcuts ? [shortcuts] : []
    for (const shortcut of list) {
      const parsed = parseShortcutString(shortcut)
      if (parsed && matchShortcut(e, parsed, isMac)) return actionId as ShortcutActionId
    }
  }
  return null
}

export function useGlobalShortcuts(options: UseGlobalShortcutsOptions) {
  const { workspace, t } = options
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform)

  function handleGlobalKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement
    const action = getTargetAction(e, isMac)

    if (!action) return

    const inDialog = target.closest('[role="dialog"]')
    const activeId = workspace.activeTabId.value
    const activeTab = workspace.tabs.find((tab) => tab.id === activeId)
    const inEditor = activeTab && (activeTab.kind === 'file' || activeTab.kind === 'new')

    switch (action) {
      case 'openManual':
        e.preventDefault()
        eventBus.emit('open-system-tab', {
          route: '/user-manual',
          title: t('userManual.title') || '用户手册'
        })
        return

      case 'copy':
      case 'cut':
      case 'paste':
        if (!inDialog && inEditor) {
          e.preventDefault()
          e.stopPropagation()
          const command = action
          eventBus.emit('editor-command', { command, tabId: activeId })
        }
        return

      case 'undo':
      case 'redo':
        if (!inDialog && inEditor) {
          e.preventDefault()
          e.stopPropagation()
          eventBus.emit('editor-command', { command: action, tabId: activeId })
        }
        return

      case 'save':
      case 'saveAs':
        if (!inDialog && inEditor) {
          e.preventDefault()
          e.stopPropagation()
          if (action === 'saveAs') {
            eventBus.emit('save-as', { tabId: activeId })
          } else {
            eventBus.emit('save', { tabId: activeId })
          }
        }
        return

      case 'find': {
        const isInInput =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        if (isInInput && !target.closest('.vditor, .monaco-editor, .editor, [data-editor]'))
          return
        e.preventDefault()
        e.stopPropagation()
        eventBus.emit('search-replace')
        return
      }

      case 'replace': {
        const isInInput =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        if (isInInput && !target.closest('.vditor, .monaco-editor, .editor, [data-editor]'))
          return
        e.preventDefault()
        e.stopPropagation()
        eventBus.emit('search-replace', { expandReplace: true })
        return
      }

      default:
        return
    }
  }

  async function register(): Promise<void> {
    await refreshShortcutBindings()
    eventBus.on('shortcut-scheme-updated', refreshShortcutBindings)
    window.addEventListener('keydown', handleGlobalKeyDown, true)
  }

  function unregister(): void {
    eventBus.off('shortcut-scheme-updated', refreshShortcutBindings)
    window.removeEventListener('keydown', handleGlobalKeyDown, true)
  }

  return { register, unregister, handleGlobalKeyDown }
}
