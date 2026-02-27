/**
 * 统一所有 Monaco 编辑器的字体为「设置 - 编辑器字体」。
 * 通过包装 monaco.editor.create 在创建时注入 fontFamily，
 * 并在 font-settings-changed 时更新所有已存在的编辑器。
 */
import * as monaco from 'monaco-editor'
import eventBus from './event-bus'

const EDITOR_FONT_FALLBACK = "'Fira Code', 'OPPO Sans 4.0', sans-serif"

function getEditorFontFamily() {
  if (typeof document === 'undefined') return EDITOR_FONT_FALLBACK
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--font-family-editor')
    .trim()
  return v || EDITOR_FONT_FALLBACK
}

const originalCreate = monaco.editor.create.bind(monaco.editor)
monaco.editor.create = function (domElement, options = {}) {
  const fontFamily = getEditorFontFamily()
  const merged = { ...options, fontFamily }
  return originalCreate(domElement, merged)
}

eventBus.on('font-settings-changed', () => {
  const fontFamily = getEditorFontFamily()
  try {
    const editors = monaco.editor.getEditors()
    editors.forEach((ed) => {
      try {
        ed.updateOptions({ fontFamily })
      } catch (_) {}
    })
  } catch (_) {}
})

export { getEditorFontFamily }
