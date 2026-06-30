import { getSetting } from '../../utils/settings'
import { getPluginContextMenuItems } from '../../utils/plugin-contributions-ui'
import type { ContextMenuItem } from './types'

export interface ArticleContextMenuOptions {
  isLatexEditor?: boolean
  isPlainTextEditor?: boolean
  hasTextSelection?: boolean
}

function getShortcutText() {
  return 'Shift+Tab'
}

export async function getArticleContextMenuItems(
  options: ArticleContextMenuOptions = {}
): Promise<ContextMenuItem[]> {
  const { isLatexEditor = false, isPlainTextEditor = false, hasTextSelection = false } = options
  const autoCompletion = await getSetting('autoCompletion')
  const llmEnabled = (await getSetting('llmEnabled')) === true

  const autoCompletionToggle = autoCompletion
    ? { label: 'contextMenu.closeAutoCompletion', value: 'closeAutoCompletion' }
    : { label: 'contextMenu.openAutoCompletion', value: 'openAutoCompletion' }

  const items: ContextMenuItem[] = [
    { label: 'contextMenu.cut', value: 'cut' },
    { label: 'contextMenu.copy', value: 'copy' },
    { label: 'contextMenu.paste', value: 'paste' },
    { label: 'contextMenu.selectAll', value: 'selectAll' },
    ...(llmEnabled
      ? ([
          { type: 'divider' },
          autoCompletionToggle,
          { type: 'divider' },
          {
            label: 'contextMenu.triggerAutoCompletion',
            value: 'trigger-auto-completion',
            shortcut: getShortcutText()
          }
        ] satisfies ContextMenuItem[])
      : [])
  ]

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
