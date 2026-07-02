export type {
  DocumentViewId,
  DocumentViewRegistration,
  DocumentViewRenderMode,
  LegacyDocumentViewContribution,
  ViewMenuConfigEntry,
  ViewWhenContext
} from './types'

export {
  clearViewRegistry,
  getAllViews,
  getRegisteredViewsForRender,
  getView,
  getViewMenuConfigDialogItems,
  getViewMenuConfigItems,
  getViewMenuConfigurableRegistrations,
  getViewMenuItems,
  legacyContributionToRegistration,
  registerView,
  unregisterView,
  viewRegistryMap,
  type ViewMenuItemDescriptor
} from './registry'

export { buildViewWhenContext } from './build-view-when-context'

export {
  installViewSwitchListener,
  switchDocumentView,
  uninstallViewSwitchListener
} from './controller'

export { useDocumentViewContext } from './useDocumentViewContext'

import type { DocumentViewRegistration } from './types'
import { registerView, unregisterView, getAllViews, getView } from './registry'

export interface ViewHost {
  registerView(reg: DocumentViewRegistration): () => void
  unregisterView(id: string): void
  getView(id: string): DocumentViewRegistration | undefined
  getAllViews(): DocumentViewRegistration[]
}

export function createViewHost(): ViewHost {
  return {
    registerView,
    unregisterView,
    getAllViews,
    getView
  }
}
