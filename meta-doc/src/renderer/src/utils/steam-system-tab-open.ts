import { useWorkspace } from '../stores/workspace'

export function focusOrOpenSystemRoute(routePath: string, tabTitle: string): void {
  const workspace = useWorkspace()
  const existing = workspace.tabs.find((tab) => tab.kind === 'system' && tab.route === routePath)
  if (existing) {
    workspace.activateTab(existing.id)
    return
  }
  workspace.openSystemTab(routePath, tabTitle)
}
