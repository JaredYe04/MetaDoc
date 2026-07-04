import { onBeforeUnmount, type Ref } from 'vue'
import { debounce } from 'lodash'
import type * as monaco from 'monaco-editor'
import { syncPreviewSelectionFromEditor } from '../utils/monaco-preview-sync'

export interface PreviewSyncExpose {
  getScrollElement: () => HTMLElement | null
  getContentElement: () => HTMLElement | null
  clearSyncHighlight?: () => void
  clearPreviewTextSelection?: () => void
}

/** Monaco 选区 → 预览 DOM 文字选中（不含滚动位置同步） */
export function useMonacoPreviewScrollSync(options: {
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null | undefined
  previewRef: Ref<PreviewSyncExpose | null | undefined>
  enabled?: () => boolean
}) {
  const disposables: monaco.IDisposable[] = []

  const syncFromEditor = (query?: string) => {
    if (options.enabled && !options.enabled()) return
    const editor = options.getEditor()
    const preview = options.previewRef.value
    if (!editor || !preview) return

    const scrollRoot = preview.getScrollElement()
    const contentRoot = preview.getContentElement()
    if (!scrollRoot || !contentRoot) return

    syncPreviewSelectionFromEditor(
      editor,
      { scrollRoot, contentRoot },
      query ? { query } : {}
    )
  }

  const debouncedSelectionSync = debounce(() => syncFromEditor(), 64)

  const teardown = () => {
    debouncedSelectionSync.cancel()
    for (const d of disposables) {
      try {
        d.dispose()
      } catch {
        /* ignore */
      }
    }
    disposables.length = 0
    const preview = options.previewRef.value
    preview?.clearPreviewTextSelection?.()
    preview?.clearSyncHighlight?.()
  }

  const setup = (editor: monaco.editor.IStandaloneCodeEditor) => {
    teardown()

    disposables.push(
      editor.onDidChangeCursorSelection(() => {
        debouncedSelectionSync()
      })
    )
  }

  const notifyPreviewRendered = () => {
    debouncedSelectionSync()
  }

  onBeforeUnmount(() => {
    teardown()
  })

  return {
    setup,
    teardown,
    notifyPreviewRendered,
    syncFromEditor
  }
}
