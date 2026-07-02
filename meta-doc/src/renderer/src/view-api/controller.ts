import type { DocumentView } from '../stores/workspace'
import { useWorkspace } from '../stores/workspace'

let switchListenerInstalled = false
let disposeSwitchListener: (() => void) | null = null

export async function switchDocumentView(tabId: string, viewId: DocumentView | string): Promise<void> {
  const { ensureCapabilityForDocumentView } = await import('../ai-runtime/ensure-for-entry')
  await ensureCapabilityForDocumentView(viewId)

  const workspace = useWorkspace()
  const tab = workspace.tabs.find((t) => t.id === tabId)
  if (!tab || (tab.kind !== 'file' && tab.kind !== 'new')) return
  workspace.updateDocumentLastView(tabId, viewId as DocumentView)
}

export function installViewSwitchListener(): void {
  if (switchListenerInstalled) return
  switchListenerInstalled = true

  // Lazy import avoids pulling host-runtime (and workspace/router) into unit tests of switchDocumentView
  void import('../core/host-runtime').then(({ getHost }) => {
    const host = getHost()
    disposeSwitchListener = host.events.on('switch-document-view', (...args: unknown[]) => {
      const payload = args[0] as { tabId?: string; view?: string } | undefined
      if (!payload?.tabId || !payload?.view) return
      void switchDocumentView(payload.tabId, payload.view)
    })
  })
}

export function uninstallViewSwitchListener(): void {
  disposeSwitchListener?.()
  disposeSwitchListener = null
  switchListenerInstalled = false
}
