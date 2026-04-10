/**
 * 可选文字右键菜单（只读）：复制 / 全选
 * 通过 CustomEvent 通知 SelectionContextMenu 组件显示菜单
 *
 * 注意：必须在捕获阶段放行「已有自定义右键菜单」的 UI，否则 stopPropagation 会阻止
 * WorkspaceExplorer / SessionList / MainTabs 等组件的 @contextmenu。
 */
const EXCLUDE_SELECTORS =
  '.monaco-editor, .vditor-toolbar, [data-editor], .ql-editor, .tox-edit-area, .cm-editor, .CodeMirror, .ace_editor, .xterm, .xterm-instance, .context-menu, .input-context-menu'

/** 这些区域由业务组件自行处理 contextmenu，全局只读菜单不得拦截 */
const CUSTOM_CONTEXT_MENU_ROOTS = [
  '[data-no-global-selection-context-menu]',
  '.workspace-explorer',
  '.workspace-tree-node',
  // 注意：勿使用 .session-list-root —— 它会包住 SessionList 的 #main 主内容区，
  // 导致 DataAnalysisWindow / AIChat 右侧报告与消息区无法使用全局复制菜单。
  '.session-list-wrapper',
  '.collapsed-list',
  '.collapsed-item',
  '.main-tabs-wrapper',
  // Agent 紧凑视图：仅排除自带「会话 Tab / 历史」右键菜单的区域，不要整页 .agent-compact
  '.agent-compact-tabs',
  '.agent-compact-tab-wrap',
  '.agent-compact-tab-context',
  '.agent-compact-history-dropdown',
  '.agent-compact-history-item',
  '.outline-viewport-tree',
  '.material-basket-panel',
  '.config-card-container'
].join(', ')

function isEditableTarget(target) {
  if (!target || typeof target.closest !== 'function') return false
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return true
  if (target.closest('[contenteditable="true"], [contenteditable=""], [role="textbox"]'))
    return true
  if (target.closest('.el-input, .el-textarea, .el-input-number, [data-radix-number-field-input]'))
    return true
  return false
}

function hasNonEmptySelection() {
  const sel = window.getSelection?.()
  if (!sel || sel.rangeCount === 0) return false
  const txt = sel.toString()
  return !!txt && txt.trim().length > 0
}

function isLikelyTextRegion(target) {
  if (!target || typeof target.closest !== 'function') return false
  if (target.closest(EXCLUDE_SELECTORS)) return false
  // 常见的 markdown / 预览区域
  if (
    target.closest(
      [
        '.vditor-preview',
        '.vditor-reset',
        '.vditor-preview-container',
        '.vditor-preview-wrapper',
        '.markdown-body',
        '.manual-content',
        '.report-section',
        '.report-markdown-container',
        '.agent-message',
        '.agent-message__content',
        '.agent-message__body',
        '.md-editor-preview',
        '.md-editor-preview-wrapper'
      ].join(', ')
    )
  )
    return true
  // 通用可复制区域标记
  if (target.closest('.copyable, .selectable, .text-selectable, [data-selectable="true"]'))
    return true
  // 不再使用「任意含文字即弹出」的兜底：会误判侧栏树、会话列表、标签栏等带文案的控件，
  // 并因捕获阶段拦截而覆盖组件自有右键菜单。
  return false
}

export function initSelectionContextMenuHandler() {
  const handler = (e) => {
    const target = e.target
    if (!target || typeof target.closest !== 'function') return
    if (target.closest(CUSTOM_CONTEXT_MENU_ROOTS)) return
    if (isEditableTarget(target)) return
    if (target.closest(EXCLUDE_SELECTORS)) return

    const selected = hasNonEmptySelection()
    if (!selected && !isLikelyTextRegion(target)) return

    e.preventDefault()
    e.stopPropagation()

    window.dispatchEvent(
      new CustomEvent('selection-context-menu-show', {
        detail: {
          x: e.clientX,
          y: e.clientY,
          hasSelection: selected
        }
      })
    )
  }

  document.addEventListener('contextmenu', handler, { capture: true, passive: false })
  return () => document.removeEventListener('contextmenu', handler, true)
}
