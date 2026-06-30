import { useWorkspace } from '../stores/workspace'

/** 若已存在同路由系统 Tab 则聚焦，否则新开系统 Tab（与资料卡/关于页行为一致）。 */
export function focusOrOpenSystemRoute(routePath: string, tabTitle: string): void {
  const workspace = useWorkspace()
  const existing = workspace.tabs.find((tab) => tab.kind === 'system' && tab.route === routePath)
  if (existing) {
    workspace.activateTab(existing.id)
    return
  }
  workspace.openSystemTab(routePath, tabTitle)
}
