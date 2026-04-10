/**
 * 输入框右键菜单 - 在 main.js 中尽早注册，确保优先于其他 contextmenu 处理
 * 通过 CustomEvent 通知 InputContextMenu 组件显示菜单
 */

const EXCLUDE_SELECTORS =
  '.monaco-editor, .vditor, .vditor-toolbar, [data-editor], .ql-editor, .tox-edit-area, .cm-editor, .CodeMirror, .ace_editor, .xterm, .xterm-instance'

function getEditableElement(target) {
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
    return target
  }
  // contenteditable / role=textbox
  const editableRoot = target.closest?.(
    '[contenteditable="true"], [contenteditable=""], [role="textbox"]'
  )
  if (editableRoot && !editableRoot.closest(EXCLUDE_SELECTORS)) {
    return editableRoot
  }
  // Support both Element Plus and shadcn/radix number fields
  const container = target.closest(
    '.el-input, .el-textarea, .el-input-number, [data-radix-number-field-input]'
  )
  if (!container) return null
  // For shadcn NumberField, the container itself is the input
  if (container.hasAttribute('data-radix-number-field-input')) {
    return container
  }
  return container.querySelector('input, textarea')
}

function shouldShowInputMenu(target) {
  if (!target || typeof target.closest !== 'function') return false
  if (target.closest(EXCLUDE_SELECTORS)) return false
  if (target.closest('[contenteditable="true"], [contenteditable=""], [role="textbox"]'))
    return true
  // Support both Element Plus and shadcn/radix components
  if (
    target.closest('.el-input') ||
    target.closest('.el-textarea') ||
    target.closest('.el-input-number') ||
    target.closest('[data-radix-number-field-input]')
  )
    return true
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return true
  return false
}

export function initInputContextMenuHandler() {
  const handler = (e) => {
    if (!shouldShowInputMenu(e.target)) return
    const editable = getEditableElement(e.target)
    if (!editable) return

    e.preventDefault()
    e.stopPropagation()

    window.dispatchEvent(
      new CustomEvent('input-context-menu-show', {
        detail: {
          target: editable,
          x: e.clientX,
          y: e.clientY
        }
      })
    )
  }

  // 尽早注册，使用 capture 阶段
  document.addEventListener('contextmenu', handler, { capture: true, passive: false })
  return () => document.removeEventListener('contextmenu', handler, true)
}
