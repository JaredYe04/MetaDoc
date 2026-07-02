import type { Component } from 'vue'
import type { DocumentView } from '../stores/workspace'
import type { WorkspaceTab } from '../stores/workspace'

export type DocumentViewId = DocumentView

export type DocumentViewRenderMode = 'component' | 'editor-slot'

export interface ViewWhenContext {
  tabId: string | null
  format: string | null
  hasActiveDocument: boolean
  isPlainTextFormat: boolean
  isPdfPreviewTab: boolean
  isImageTab: boolean
  llmEnabled: boolean
}

export interface DocumentViewRegistration {
  id: DocumentViewId
  component: Component
  label: string | (() => string)
  iconImage?: string | (() => string)
  order?: number
  /** home / editor — cannot be hidden in ViewMenu config */
  isCore?: boolean
  /** Hidden from ViewMenu when global LLM is off */
  requiresLlm?: boolean
  /** Shown in the document ViewMenu sidebar (default true) */
  showInViewMenu?: boolean
  when?: (ctx: ViewWhenContext) => boolean
  renderMode?: DocumentViewRenderMode
}

/** Persisted user preference for ViewMenu ordering / visibility */
export interface ViewMenuConfigEntry {
  id: string
  visible: boolean
}

/** @deprecated Use DocumentViewRegistration — kept for ui.registerDocumentView compat */
export interface LegacyDocumentViewContribution {
  view: DocumentView
  component: Component
  label?: string
}
