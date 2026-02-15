// articleContextMenuItems.js
import { getSetting } from '../../utils/settings'

/**
 * 检测是否为 Mac 系统
 */
function isMac() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
}

/**
 * 获取快捷键显示文本
 */
function getShortcutText() {
  return 'Shift+Tab'
}

/**
 * @param {Object} options
 * @param {boolean} [options.isLatexEditor] - 是否为LaTeX编辑器
 * @param {boolean} [options.isPlainTextEditor] - 是否为纯文本编辑器
 * @returns {Promise<import("./types").ContextMenuItem[]>}
 */
export async function getArticleContextMenuItems(options = {}) {
  const { isLatexEditor = false, isPlainTextEditor = false } = options
  const autoCompletion = await getSetting('autoCompletion')
  const knowledgeBase = await getSetting('enableKnowledgeBase')

  const autoCompletionToggle = autoCompletion
    ? { label: 'contextMenu.closeAutoCompletion', value: 'closeAutoCompletion' }
    : { label: 'contextMenu.openAutoCompletion', value: 'openAutoCompletion' }

  const knowledgeBaseToggle = knowledgeBase
    ? { label: 'contextMenu.closeKnowledgeBase', value: 'closeKnowledgeBase' }
    : { label: 'contextMenu.openKnowledgeBase', value: 'openKnowledgeBase' }

  const items = [
    { label: 'contextMenu.cut', value: 'cut' },
    { label: 'contextMenu.copy', value: 'copy' },
    { label: 'contextMenu.paste', value: 'paste' },
    { label: 'contextMenu.selectAll', value: 'selectAll' },
    { type: 'divider' },
    autoCompletionToggle,
    knowledgeBaseToggle,
    { type: 'divider' },
    {
      label: 'contextMenu.triggerAutoCompletion',
      value: 'trigger-auto-completion',
      shortcut: getShortcutText()
    }
  ]

  // 纯文本编辑器：只显示基本的文本操作和AI补全，不显示其他功能
  if (!isPlainTextEditor) {
    items.push(
      { type: 'divider' },
      { label: 'contextMenu.aiAnalysis', value: 'ai-assistant' },
      { label: 'contextMenu.sectionOptimizer', value: 'section-optimizer' },
      { type: 'divider' },
      { label: 'contextMenu.insertGraph', value: 'insert-graph' }
    )
  }

  // LaTeX编辑器特有：定位到PDF位置
  if (isLatexEditor) {
    items.push({ type: 'divider' }, { label: 'contextMenu.locateToPdf', value: 'locate-to-pdf' })
  }

  return items
}
