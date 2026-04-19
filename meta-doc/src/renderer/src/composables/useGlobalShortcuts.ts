/**
 * 全局快捷键统一管理（渲染进程）
 *
 * 快捷键由「按键方案」配置驱动（见 keyboard-scheme-manager），
 * 支持默认 Win/Linux/Mac 方案与用户自定义方案。方案切换后需触发 refreshShortcutBindings 或发送 'shortcut-scheme-updated' 以生效。
 *
 * 【主进程 before-input-event】Tab/文件类仍由主进程处理；
 * 本模块处理：打开用户手册、保存/另存为、查找/替换、工作区查找、复制/剪切/粘贴、撤销/重做。
 */

import eventBus from '../utils/event-bus'
import type { useWorkspace } from '../stores/workspace'
import { getEffectiveBindings } from '../utils/keyboard-scheme-manager'
import { parseShortcutString, matchShortcut } from '../utils/keyboard-scheme-parse'
import type { ShortcutBindings, ShortcutActionId } from '../utils/keyboard-scheme-types'
import { useFocusMode } from './useFocusMode'

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

/**
 * 焦点在普通输入控件且不在文档编辑器内时，不劫持快捷键（由浏览器处理复制/粘贴/剪切/撤销等）。
 * 与 find/replace 分支一致；否则在「文件标签激活 + Agent 侧 Textarea 聚焦」时仍会 dispatch 到 Monaco。
 */
function isNativeTextInputOutsideEditor(target: HTMLElement): boolean {
  const isInInput =
    target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
  if (!isInInput) return false
  return !target.closest('.vditor, .monaco-editor, .editor, [data-editor]')
}

const EDITABLE_DOC_SURFACE_SELECTORS = [
  '.monaco-editor',
  '.vditor-wysiwyg',
  '.vditor-ir',
  '.vditor-sv',
  '.editor',
  '[data-editor]',
  '.ql-editor',
  '.tox-edit-area',
  '.cm-editor',
  '.CodeMirror',
  '.ace_editor'
] as const

/**
 * 焦点是否在「可编辑文档正文」表面（Monaco / Vditor 编辑区等）。
 * 当前标签为文档但焦点在预览、Agent、侧栏等时，若仍转发 editor-command，会先 preventDefault，
 * 导致只读区 Ctrl+C / Ctrl+Z 等无法走浏览器默认或全局选区复制。
 * 使用 composedPath：Monaco 等在 Shadow DOM 内时 target.closest 打不到 .monaco-editor。
 */
function isFocusInEditableDocumentEditorSurface(
  target: HTMLElement,
  e?: KeyboardEvent | MouseEvent | WheelEvent
): boolean {
  const path = e && typeof e.composedPath === 'function' ? e.composedPath() : [target]
  for (const n of path) {
    if (n instanceof HTMLElement && n.closest('.vditor-preview')) return false
  }
  for (const n of path) {
    if (!(n instanceof Element)) continue
    for (const sel of EDITABLE_DOC_SURFACE_SELECTORS) {
      try {
        if (n.matches(sel)) return true
      } catch {
        /* ignore invalid selector in edge environments */
      }
    }
  }
  return false
}

export function useGlobalShortcuts(options: UseGlobalShortcutsOptions) {
  const { workspace, t } = options
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform)

  function dispatchAction(
    action: ShortcutActionId,
    target: HTMLElement,
    e: KeyboardEvent | MouseEvent | WheelEvent
  ): void {
    const inDialog = target.closest('[role="dialog"]')
    const activeId = workspace.activeTabId.value
    const activeTab = workspace.tabs.find((tab) => tab.id === activeId)
    const inEditor = activeTab && (activeTab.kind === 'file' || activeTab.kind === 'new')

    switch (action) {
      case 'openManual':
        e.preventDefault()
        ;(e as any).stopPropagation?.()
        eventBus.emit('open-system-tab', {
          route: '/user-manual',
          title: t('userManual.title') || '用户手册'
        })
        if (e instanceof KeyboardEvent && e.key === 'F1') {
          void import('../services/steam-client').then((m) =>
            m.tryUnlockSteamAchievementByApi('ACH_MANUAL_HOTKEY_F1')
          )
        }
        return

      case 'copy':
      case 'cut':
      case 'paste': {
        // 焦点在 Xterm 终端内时，不拦截：Ctrl+C 发 SIGINT，Ctrl+V 粘贴，Ctrl+Z 发 SIGTSTP
        const inTerminal = target.closest('.xterm, .xterm-instance')
        if (inTerminal) return
        if (isNativeTextInputOutsideEditor(target)) return
        if (!inDialog && inEditor && !isFocusInEditableDocumentEditorSurface(target, e)) return
        if (!inDialog && inEditor) {
          e.preventDefault()
          ;(e as any).stopPropagation?.()
          const command = action
          eventBus.emit('editor-command', { command, tabId: activeId })
        }
        return
      }

      case 'undo':
      case 'redo':
        if (target.closest('.xterm, .xterm-instance')) return
        if (isNativeTextInputOutsideEditor(target)) return
        if (!inDialog && inEditor && !isFocusInEditableDocumentEditorSurface(target, e)) return
        if (!inDialog && inEditor) {
          e.preventDefault()
          ;(e as any).stopPropagation?.()
          eventBus.emit('editor-command', { command: action, tabId: activeId })
        }
        return

      case 'save':
      case 'saveAs':
        if (!inDialog && inEditor) {
          e.preventDefault()
          ;(e as any).stopPropagation?.()
          if (action === 'saveAs') {
            eventBus.emit('save-as', { tabId: activeId })
          } else {
            eventBus.emit('save', { tabId: activeId })
          }
        }
        return

      case 'find': {
        if (isNativeTextInputOutsideEditor(target)) return
        e.preventDefault()
        ;(e as any).stopPropagation?.()
        eventBus.emit('search-replace')
        return
      }

      case 'replace': {
        if (isNativeTextInputOutsideEditor(target)) return
        e.preventDefault()
        ;(e as any).stopPropagation?.()
        eventBus.emit('search-replace', { expandReplace: true })
        return
      }

      case 'workspaceGrep': {
        e.preventDefault()
        ;(e as any).stopPropagation?.()
        eventBus.emit('focus-workspace-grep-sidebar')
        return
      }

      case 'zoomIn':
      case 'zoomOut':
      case 'zoomReset': {
        e.preventDefault()
        ;(e as any).stopPropagation?.()
        eventBus.emit('zoom-shortcut', { action })
        return
      }

      case 'toggleFocusMode': {
        e.preventDefault()
        ;(e as any).stopPropagation?.()
        const { toggleFocusMode } = useFocusMode()
        toggleFocusMode()
        return
      }

      default:
        return
    }
  }

  function handleGlobalKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement
    const action = getTargetAction(e, isMac)

    if (!action) return

    dispatchAction(action, target, e)
  }

  function handleGlobalMouseDown(e: MouseEvent): void {
    const target = e.target as HTMLElement
    // 将鼠标点击映射为伪 KeyboardEvent，主键为 LeftClick / RightClick / MiddleClick ...
    let key = ''
    if (e.button === 0) key = 'LeftClick'
    else if (e.button === 1) key = 'MiddleClick'
    else if (e.button === 2) key = 'RightClick'
    else if (e.button === 3) key = 'Button4'
    else if (e.button === 4) key = 'Button5'
    if (!key) return

    const pseudo = {
      key,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey
    } as unknown as KeyboardEvent
    const action = getTargetAction(pseudo, isMac)
    if (!action) return
    dispatchAction(action, target, e)
  }

  function handleGlobalDblClick(e: MouseEvent): void {
    const target = e.target as HTMLElement
    const pseudo = {
      key: 'DoubleClick',
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey
    } as unknown as KeyboardEvent
    const action = getTargetAction(pseudo, isMac)
    if (!action) return
    dispatchAction(action, target, e)
  }

  function handleGlobalWheel(e: WheelEvent): void {
    const target = e.target as HTMLElement
    const key = e.deltaY < 0 ? 'WheelUp' : e.deltaY > 0 ? 'WheelDown' : ''
    if (!key) return
    const pseudo = {
      key,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey
    } as unknown as KeyboardEvent
    const action = getTargetAction(pseudo, isMac)
    if (!action) return
    // 只有匹配到绑定时才拦截滚轮，避免破坏默认滚动
    dispatchAction(action, target, e)
  }

  async function register(): Promise<void> {
    await refreshShortcutBindings()
    eventBus.on('shortcut-scheme-updated', refreshShortcutBindings)
    window.addEventListener('keydown', handleGlobalKeyDown, true)
    window.addEventListener('mousedown', handleGlobalMouseDown, true)
    window.addEventListener('dblclick', handleGlobalDblClick, true)
    window.addEventListener('wheel', handleGlobalWheel, { capture: true, passive: false })
  }

  function unregister(): void {
    eventBus.off('shortcut-scheme-updated', refreshShortcutBindings)
    window.removeEventListener('keydown', handleGlobalKeyDown, true)
    window.removeEventListener('mousedown', handleGlobalMouseDown, true)
    window.removeEventListener('dblclick', handleGlobalDblClick, true)
    window.removeEventListener('wheel', handleGlobalWheel as any, true)
  }

  return { register, unregister, handleGlobalKeyDown }
}
