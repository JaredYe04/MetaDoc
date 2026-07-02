import { computed, onBeforeUnmount, type MaybeRefOrGetter, toValue } from 'vue'
import type { DocumentOutlineNode, ArticleMetaData } from '../../../types'
import { getHost } from '../core/host-runtime'
import { useWorkspace, type WorkspaceDocument, type WorkspaceTab } from '../stores/workspace'

/**
 * Standard data context for document views (Outline, Visualize, plugin views).
 * Views should prefer this over direct workspace store access.
 */
export function useDocumentViewContext(tabId?: MaybeRefOrGetter<string | undefined>) {
  const workspace = useWorkspace()
  const host = getHost()

  const effectiveTabId = computed(() => {
    const tid = tabId != null ? toValue(tabId) : undefined
    return tid ?? workspace.activeTabId.value
  })

  const activeTab = computed((): WorkspaceTab | null => {
    const id = effectiveTabId.value
    if (!id) return null
    return workspace.tabs.find((t) => t.id === id) ?? null
  })

  const activeDocument = computed((): WorkspaceDocument | null => {
    const tab = activeTab.value
    if (!tab || tab.kind === 'tool' || tab.kind === 'system') return null
    try {
      return workspace.ensureDocument(tab.id)
    } catch {
      return null
    }
  })

  const snapshot = computed(() => {
    const id = effectiveTabId.value
    if (!id) return null
    return host.documents.getDocument(id)
  })

  const format = computed(() => activeDocument.value?.format ?? snapshot.value?.format ?? 'md')

  const content = computed(() => {
    const doc = activeDocument.value
    if (!doc) return snapshot.value?.content ?? ''
    if (doc.format === 'tex') return doc.tex ?? ''
    if (doc.format === 'txt') return doc.plainText ?? ''
    return doc.markdown ?? ''
  })

  const outline = computed((): DocumentOutlineNode | null => {
    const doc = activeDocument.value
    if (doc?.outline) return doc.outline
    const snap = snapshot.value?.outline
    return (snap as DocumentOutlineNode | undefined) ?? null
  })

  const meta = computed((): ArticleMetaData | Record<string, unknown> | undefined => {
    return activeDocument.value?.meta ?? snapshot.value?.meta
  })

  const lastView = computed(() => activeDocument.value?.lastView ?? 'editor')

  function updateContent(next: string): void {
    const id = effectiveTabId.value
    if (!id) return
    host.documents.updateContent(id, next)
  }

  function updateOutline(next: unknown): void {
    const id = effectiveTabId.value
    if (!id) return
    host.outline.updateOutline(id, next)
  }

  function updateMarkdown(next: string): void {
    const id = effectiveTabId.value
    if (!id) return
    workspace.updateDocumentMarkdown(id, next)
  }

  function updateTex(next: string): void {
    const id = effectiveTabId.value
    if (!id) return
    workspace.updateDocumentTex(id, next)
  }

  function lockUI(): void {
    workspace.lockUI?.()
  }

  function unlockUI(): void {
    workspace.unlockUI?.()
  }

  function updateLastView(view: WorkspaceDocument['lastView']): void {
    const id = effectiveTabId.value
    if (!id) return
    workspace.updateDocumentLastView(id, view)
  }

  const contentDisposers: Array<() => void> = []
  const activeTabDisposers: Array<() => void> = []

  function onContentChanged(cb: (tabId: string) => void): () => void {
    const dispose = host.documents.onContentChanged(cb)
    contentDisposers.push(dispose)
    return dispose
  }

  function onActiveTabChanged(cb: (tabId: string | null) => void): () => void {
    const dispose = host.documents.onActiveTabChanged(cb)
    activeTabDisposers.push(dispose)
    return dispose
  }

  onBeforeUnmount(() => {
    for (const d of contentDisposers) d()
    for (const d of activeTabDisposers) d()
  })

  return {
    workspace,
    host,
    effectiveTabId,
    activeTab,
    activeDocument,
    snapshot,
    format,
    content,
    outline,
    meta,
    lastView,
    updateContent,
    updateOutline,
    updateMarkdown,
    updateTex,
    updateLastView,
    lockUI,
    unlockUI,
    onContentChanged,
    onActiveTabChanged
  }
}
