import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { useWorkspace, type WorkspaceDocument, type WorkspaceTab } from '../stores/workspace'

export const useActiveDocument = () => {
  const workspace = useWorkspace()
  const activeDocument = computed(() => workspace.activeDocument.value)
  const activeTab = computed(() => workspace.activeTab.value)

  return {
    workspace,
    activeDocument,
    activeTab
  }
}

/**
 * 分屏等场景：传入 `tabId` 时文档与 Tab 固定为该上下文；未传时与全局活动 Tab 一致。
 */
export function useScopedOrActiveDocument(tabId?: MaybeRefOrGetter<string | undefined>) {
  const workspace = useWorkspace()
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

  return {
    workspace,
    activeDocument,
    activeTab,
    effectiveTabId
  }
}
