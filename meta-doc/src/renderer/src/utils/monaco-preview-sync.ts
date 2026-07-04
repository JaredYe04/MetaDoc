import * as monaco from 'monaco-editor'

export interface MonacoPreviewSyncTargets {
  scrollRoot: HTMLElement
  contentRoot: HTMLElement
}

/** 归一化空白，便于 Markdown 源与渲染 DOM 对齐比较 */
export function normalizePreviewSearchText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function clearPreviewTextSelection(contentRoot?: HTMLElement | null): void {
  const sel = typeof window !== 'undefined' ? window.getSelection() : null
  if (!sel || sel.rangeCount === 0) return
  const anchor = sel.anchorNode
  if (contentRoot && anchor && !contentRoot.contains(anchor)) return
  sel.removeAllRanges()
}

function findExactTextRange(contentRoot: HTMLElement, query: string): Range | null {
  const raw = query.trim()
  if (!raw) return null

  const walker = document.createTreeWalker(contentRoot, NodeFilter.SHOW_TEXT)
  let node: Text | null = walker.nextNode() as Text | null

  while (node) {
    const text = node.textContent ?? ''
    const idx = text.indexOf(raw)
    if (idx >= 0) {
      try {
        const range = document.createRange()
        range.setStart(node, idx)
        range.setEnd(node, Math.min(text.length, idx + raw.length))
        return range
      } catch {
        /* invalid range */
      }
    }
    node = walker.nextNode() as Text | null
  }

  return null
}

function scrollRangeIntoPreview(scrollRoot: HTMLElement, range: Range): void {
  const rootRect = scrollRoot.getBoundingClientRect()
  const rangeRect = range.getBoundingClientRect()
  const relativeTop = rangeRect.top - rootRect.top + scrollRoot.scrollTop
  const offset = relativeTop - scrollRoot.clientHeight * 0.35
  const max = scrollRoot.scrollHeight - scrollRoot.clientHeight
  scrollRoot.scrollTop = Math.max(0, Math.min(max, offset))
}

/**
 * 在预览 DOM 中精确选中 query 对应文字并滚动到可见区域。
 * 仅当能在 DOM 中找到匹配文字时返回 true；找不到时不滚动、不选中。
 */
export function selectTextInPreview(
  scrollRoot: HTMLElement,
  contentRoot: HTMLElement,
  query: string
): boolean {
  const range = findExactTextRange(contentRoot, query)
  if (!range) return false

  const sel = window.getSelection()
  if (!sel) return false

  try {
    sel.removeAllRanges()
    sel.addRange(range)
    scrollRangeIntoPreview(scrollRoot, range)
    return true
  } catch {
    return false
  }
}

export function getSelectionSearchHint(
  editor: monaco.editor.IStandaloneCodeEditor
): string {
  const model = editor.getModel()
  if (!model) return ''

  const selection = editor.getSelection()
  if (selection && !selection.isEmpty()) {
    const selected = normalizePreviewSearchText(model.getValueInRange(selection))
    if (selected.length >= 1) {
      return selected.length > 240 ? selected.slice(0, 240) : selected
    }
  }

  return ''
}

export interface SyncPreviewOptions {
  /** 显式指定要在预览中选中的文本 */
  query?: string
}

/** 将 Monaco 选区同步到右侧预览：仅在有精确文字匹配时选中并滚动 */
export function syncPreviewSelectionFromEditor(
  editor: monaco.editor.IStandaloneCodeEditor,
  targets: MonacoPreviewSyncTargets,
  options: SyncPreviewOptions = {}
): boolean {
  const { scrollRoot, contentRoot } = targets
  if (!scrollRoot || !contentRoot) return false

  clearPreviewTextSelection(contentRoot)

  const explicitQuery = options.query ? normalizePreviewSearchText(options.query) : ''
  const query = explicitQuery || getSelectionSearchHint(editor)
  if (!query) return false

  return selectTextInPreview(scrollRoot, contentRoot, query)
}

/** @deprecated 使用 clearPreviewTextSelection */
export function clearPreviewSyncHighlight(contentRoot: HTMLElement): void {
  clearPreviewTextSelection(contentRoot)
}
