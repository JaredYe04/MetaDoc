/**
 * 可选文字右键菜单（只读）：复制 / 全选
 * 通过 CustomEvent 通知 SelectionContextMenu 组件显示菜单
 */
const EXCLUDE_SELECTORS =
  '.monaco-editor, .vditor-toolbar, [data-editor], .ql-editor, .tox-edit-area, .cm-editor, .CodeMirror, .ace_editor, .xterm, .xterm-instance, .context-menu, .input-context-menu'

function isEditableTarget(target) {
  if (!target || typeof target.closest !== 'function') return false
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return true
  if (target.closest('[contenteditable="true"], [contenteditable=""], [role="textbox"]')) return true
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
  if (target.closest('.vditor-preview, .vditor-reset, .markdown-body, .manual-content')) return true
  // 通用可复制区域标记
  if (target.closest('.copyable, .selectable, .text-selectable, [data-selectable="true"]')) return true
  // 兜底：右键落在有文本的节点上
  const el = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement
  if (!el) return false
  const text = (el.textContent || '').trim()
  return text.length > 0
}

export function initSelectionContextMenuHandler() {
  const handler = (e) => {
    const target = e.target
    if (!target || typeof target.closest !== 'function') return
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

