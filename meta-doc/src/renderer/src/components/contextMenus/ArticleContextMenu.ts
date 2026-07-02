import { getSetting } from '../../utils/settings'
import { getPluginContextMenuItems } from '../../utils/plugin-contributions-ui'
import type { ContextMenuItem } from './types'
import type { MarkdownEditorSurface, VditorSubMode } from '../../utils/markdown-editor-mode'

export interface ArticleContextMenuOptions {
  isLatexEditor?: boolean
  isPlainTextEditor?: boolean
  hasTextSelection?: boolean
  isMarkdownEditor?: boolean
  markdownEditorSurface?: MarkdownEditorSurface
  vditorMode?: VditorSubMode
}

function getShortcutText() {
  return 'Shift+Tab'
}

function buildMarkdownEditorModeSubmenu(
  surface: MarkdownEditorSurface,
  vditorMode: VditorSubMode
): ContextMenuItem {
  return {
    type: 'submenu',
    label: 'contextMenu.editorMode',
    children: [
      {
        label: 'setting.editorModeWysiwyg',
        value: 'editor-vditor-mode-wysiwyg',
        checked: surface === 'visual' && vditorMode === 'wysiwyg'
      },
      {
        label: 'setting.editorModeIr',
        value: 'editor-vditor-mode-ir',
        checked: surface === 'visual' && vditorMode === 'ir'
      },
      {
        label: 'setting.editorModeSv',
        value: 'editor-vditor-mode-sv',
        checked: surface === 'visual' && vditorMode === 'sv'
      },
      { type: 'divider' },
      {
        label: 'contextMenu.editorModeCode',
        value: 'editor-surface-code',
        checked: surface === 'code'
      }
    ]
  }
}

export async function getArticleContextMenuItems(
  options: ArticleContextMenuOptions = {}
): Promise<ContextMenuItem[]> {
  const {
    isLatexEditor = false,
    isPlainTextEditor = false,
    hasTextSelection = false,
    isMarkdownEditor = false,
    markdownEditorSurface = 'visual',
    vditorMode = 'ir'
  } = options
  const autoCompletion = await getSetting('autoCompletion')
  const llmEnabled = (await getSetting('llmEnabled')) === true

  const autoCompletionToggle = autoCompletion
    ? { label: 'contextMenu.closeAutoCompletion', value: 'closeAutoCompletion' }
    : { label: 'contextMenu.openAutoCompletion', value: 'openAutoCompletion' }

  const items: ContextMenuItem[] = [
    { label: 'contextMenu.cut', value: 'cut' },
    { label: 'contextMenu.copy', value: 'copy' },
    { label: 'contextMenu.paste', value: 'paste' },
    { label: 'contextMenu.selectAll', value: 'selectAll' }
  ]

  if (isMarkdownEditor) {
    items.push({ type: 'divider' }, buildMarkdownEditorModeSubmenu(markdownEditorSurface, vditorMode))
  }

  if (llmEnabled) {
    items.push(
      { type: 'divider' },
      autoCompletionToggle,
      { type: 'divider' },
      {
        label: 'contextMenu.triggerAutoCompletion',
        value: 'trigger-auto-completion',
        shortcut: getShortcutText()
      }
    )
  }

  if (!isPlainTextEditor && llmEnabled) {
    items.push({ type: 'divider' }, { label: 'contextMenu.aiAnalysis', value: 'ai-assistant' })

    const pluginItems = getPluginContextMenuItems({ hasTextSelection, isPlainTextEditor })
    for (const pluginItem of pluginItems) {
      items.push(pluginItem)
    }

    if (hasTextSelection) {
      items.push(
        { type: 'divider' },
        {
          label: 'contextMenu.generateIllustrationFromSelection',
          value: 'quick-graph-from-selection'
        }
      )
    } else {
      items.push({ type: 'divider' }, { label: 'contextMenu.insertGraph', value: 'insert-graph' })
    }
  }

  if (isLatexEditor) {
    items.push({ type: 'divider' }, { label: 'contextMenu.locateToPdf', value: 'locate-to-pdf' })
  }

  return items
}
