import type { ContextMenuItemContribution, LeftMenuItemContribution } from '../host-api'
import type { ContextMenuItem } from '../components/contextMenus/types'
import { isAiRuntimeActive, pluginRegistry } from '../core/host-runtime'

export function getPluginLeftMenuItems(parentId?: string | null): LeftMenuItemContribution[] {
  return pluginRegistry.leftMenuItems
    .filter((item) => {
      if (parentId != null) return item.parentId === parentId
      return item.parentId == null || item.parentId === ''
    })
    .filter((item) => !item.when || item.when())
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export function findPluginLeftMenuItem(id: string): LeftMenuItemContribution | undefined {
  return pluginRegistry.leftMenuItems.find((i) => i.id === id)
}

export interface ArticleContextPluginCtx {
  hasTextSelection?: boolean
  isPlainTextEditor?: boolean
}

export function getPluginContextMenuItems(ctx: ArticleContextPluginCtx): ContextMenuItem[] {
  if (!isAiRuntimeActive() || ctx.isPlainTextEditor) return []

  return pluginRegistry.contextMenuItems
    .filter((item) => {
      if (item.id === 'translate-selection' && !ctx.hasTextSelection) return false
      return !item.when || item.when()
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((item) => ({
      label: typeof item.label === 'function' ? item.label() : item.label,
      value: item.id
    }))
}

export function findPluginContextMenuItem(id: string): ContextMenuItemContribution | undefined {
  return pluginRegistry.contextMenuItems.find((i) => i.id === id)
}
