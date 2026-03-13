/**
 * 全局快捷键统一管理（渲染进程）
 *
 * 所有「应用级」快捷键在此注册，使用单一 capture 阶段 keydown 监听，
 * 避免各组件各自监听导致的焦点/生命周期问题。
 *
 * === 快捷键清单（唯一总表）===
 *
 * 【主进程 before-input-event，发 channel 到渲染进程】
 * - Ctrl+S           → save-triggered        → 保存当前文档
 * - Ctrl+Shift+S     → save-as-triggered     → 另存为
 * - Ctrl+K, S        → save-all-triggered    → 保存全部
 * - Ctrl+Tab         → next-tab-triggered    → 下一 Tab
 * - Ctrl+Shift+Tab   → prev-tab-triggered    → 上一 Tab
 * - Ctrl+W           → close-tab-triggered   → 关闭当前 Tab
 * - Ctrl+Shift+T     → reopen-tab-triggered  → 重新打开关闭的 Tab
 * - Ctrl+T           → new-tab-triggered     → 新建 Tab
 * - Ctrl+N           → new-doc-triggered     → 新建文档
 * - Ctrl+O           → 主进程直接打开文件对话框
 *
 * 【本模块：渲染进程 capture keydown】
 * - F1               → 打开用户手册
 * - Ctrl+F           → search-replace        → 查找
 * - Ctrl+H           → search-replace(expandReplace) → 查找替换
 * - Ctrl+V           → editor-command(paste) → 粘贴到当前 Tab 编辑器
 * - Ctrl+C           → editor-command(copy)  → 复制（当前 Tab）
 * - Ctrl+X           → editor-command(cut)   → 剪切（当前 Tab）
 * - Ctrl+Z           → editor-command(undo) → 撤销（当前 Tab）
 * - Ctrl+Shift+Z / Y → editor-command(redo)  → 重做（当前 Tab）
 * - Ctrl+S           → save(当前 Tab)        → 渲染进程直接派发，保证 tabId 与当前 UI 一致
 * - Ctrl+Shift+S     → save-as(当前 Tab)     → 同上
 *
 * 【组件内局部监听（非全局），仅在有焦点/可见时生效】
 * - Tab / Escape     → AISuggestionGhost（补全）
 * - Escape           → ContextMenu 关闭、TabSwitcher 取消、拖拽取消等
 * - 终端/控制台内键位 → ConsoleTerminal 等
 */

import eventBus from '../utils/event-bus'
import type { useWorkspace } from '../stores/workspace'

export interface UseGlobalShortcutsOptions {
  workspace: ReturnType<typeof useWorkspace>
  t: (key: string, fallback?: string) => string
}

export function useGlobalShortcuts(options: UseGlobalShortcutsOptions) {
  const { workspace, t } = options
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform)

  function handleGlobalKeyDown(e: KeyboardEvent): void {
    const modifierKey = isMac ? e.metaKey : e.ctrlKey
    const target = e.target as HTMLElement

    // ---------- F1：用户手册 ----------
    if (e.key === 'F1') {
      e.preventDefault()
      eventBus.emit('open-system-tab', {
        route: '/user-manual',
        title: t('userManual.title') || '用户手册'
      })
      return
    }

    // ---------- 粘贴/复制/剪切：作用到当前文档 Tab ----------
    if (modifierKey && (e.key === 'v' || e.key === 'c' || e.key === 'x')) {
      if (!target.closest('[role="dialog"]')) {
        const activeId = workspace.activeTabId.value
        const activeTab = workspace.tabs.find((t) => t.id === activeId)
        if (activeTab && (activeTab.kind === 'file' || activeTab.kind === 'new')) {
          e.preventDefault()
          e.stopPropagation()
          const command = e.key === 'v' ? 'paste' : e.key === 'c' ? 'copy' : 'cut'
          eventBus.emit('editor-command', { command, tabId: activeId })
          return
        }
      }
    }

    // ---------- 撤销/重做：作用到当前文档 Tab ----------
    if (modifierKey && (e.key === 'z' || e.key === 'y')) {
      if (!target.closest('[role="dialog"]')) {
        const activeId = workspace.activeTabId.value
        const activeTab = workspace.tabs.find((t) => t.id === activeId)
        if (activeTab && (activeTab.kind === 'file' || activeTab.kind === 'new')) {
          e.preventDefault()
          e.stopPropagation()
          const command = e.key === 'z' && e.shiftKey ? 'redo' : e.key === 'y' ? 'redo' : 'undo'
          eventBus.emit('editor-command', { command, tabId: activeId })
          return
        }
      }
    }

    // ---------- Ctrl+S / Ctrl+Shift+S：保存 / 另存为（渲染进程派发，保证当前 Tab 一致）----------
    if (modifierKey && (e.key === 's' || e.key === 'S')) {
      if (!target.closest('[role="dialog"]')) {
        const activeId = workspace.activeTabId.value
        const activeTab = workspace.tabs.find((tab) => tab.id === activeId)
        if (activeTab && (activeTab.kind === 'file' || activeTab.kind === 'new')) {
          e.preventDefault()
          e.stopPropagation()
          if (e.shiftKey) {
            eventBus.emit('save-as', { tabId: activeId })
          } else {
            eventBus.emit('save', { tabId: activeId })
          }
          return
        }
      }
    }

    // ---------- Ctrl+F / Ctrl+H：查找替换 ----------
    if (modifierKey && (e.key === 'f' || e.key === 'F' || e.key === 'h' || e.key === 'H')) {
      const isInInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (isInInput && !target.closest('.vditor, .monaco-editor, .editor, [data-editor]')) {
        return
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        e.stopPropagation()
        eventBus.emit('search-replace')
        return
      }
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault()
        e.stopPropagation()
        eventBus.emit('search-replace', { expandReplace: true })
        return
      }
    }
  }

  function register(): void {
    window.addEventListener('keydown', handleGlobalKeyDown, true)
  }

  function unregister(): void {
    window.removeEventListener('keydown', handleGlobalKeyDown, true)
  }

  return { register, unregister, handleGlobalKeyDown }
}
