import type { Component } from 'vue'
import type { DocumentView } from '../stores/workspace'
import type { ViewHost } from '../view-api'
import type { DocumentViewRegistration } from '../view-api'

export const HOST_API_VERSION = '1.0.0' as const

export type PluginPermission =
  | 'documents.read'
  | 'documents.write'
  | 'outline.read'
  | 'outline.write'
  | 'llm.completion'
  | 'llm.chat'
  | 'settings.read'
  | 'settings.write'
  | 'main.rag'
  | 'main.terminal'

export interface DocumentSnapshot {
  tabId: string
  format: string
  content: string
  outline?: unknown
  meta?: Record<string, unknown>
}

export interface DocumentHost {
  getActiveTabId(): string | null
  getDocument(tabId: string): DocumentSnapshot | null
  getActiveDocument(): DocumentSnapshot | null
  updateContent(tabId: string, content: string): void
  onActiveTabChanged(cb: (tabId: string | null) => void): () => void
  onContentChanged(cb: (tabId: string) => void): () => void
}

export interface OutlineHost {
  getOutline(tabId: string): unknown
  updateOutline(tabId: string, outline: unknown): void
}

export interface EditorOverlayRegistration {
  id: string
  component: Component
  formats?: string[]
}

export interface EditorAccessoryRegistration {
  id: string
  component: Component
  formats?: string[]
  order?: number
}

export interface EditorHost {
  registerOverlay(reg: EditorOverlayRegistration): () => void
  getOverlays(format?: string): EditorOverlayRegistration[]
  registerAccessory(reg: EditorAccessoryRegistration): () => void
  getAccessories(format?: string): EditorAccessoryRegistration[]
}

export interface ContextMenuItemContribution {
  id: string
  label: string | (() => string)
  group?: string
  order?: number
  when?: () => boolean
  onClick: (ctx: { tabId: string }) => void | Promise<void>
}

export interface LeftMenuItemContribution {
  id: string
  label: string | (() => string)
  icon?: Component
  parentId?: string
  order?: number
  when?: () => boolean
  onClick: () => void | Promise<void>
}

/** @deprecated Prefer host.views.registerView — see view-api */
export interface DocumentViewContribution {
  view: DocumentView
  component: Component
  label?: string
}

export type { DocumentViewRegistration, ViewHost } from '../view-api'

export interface SettingsSectionContribution {
  id: string
  label: string
  component: Component
  order?: number
}

export interface ShellOverlayContribution {
  id: string
  component: Component
  position: 'main' | 'app'
}

export interface HomeSectionContribution {
  id: string
  component: Component
  order?: number
}

export interface UIHost {
  registerContextMenuItem(item: ContextMenuItemContribution): () => void
  registerLeftMenuItem(item: LeftMenuItemContribution): () => void
  registerDocumentView(view: DocumentViewContribution): () => void
  registerSettingsSection(section: SettingsSectionContribution): () => void
  registerShellOverlay(overlay: ShellOverlayContribution): () => void
  registerHomeSection(section: HomeSectionContribution): () => void
}

export interface EventHost {
  on(event: string, handler: (...args: unknown[]) => void): () => void
  emit(event: string, ...args: unknown[]): void
}

export interface SettingsHost {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  isLlmEnabled(): Promise<boolean>
}

export interface LlmHost {
  isAvailable(): Promise<boolean>
  createTask: typeof import('../utils/ai_tasks').createAiTask
}

export interface MetaDocHost {
  readonly version: typeof HOST_API_VERSION
  documents: DocumentHost
  outline: OutlineHost
  editor: EditorHost
  views: ViewHost
  ui: UIHost
  events: EventHost
  settings: SettingsHost
  llm?: LlmHost
}

export interface PluginManifest {
  id: string
  name: string
  version: string
  entry: string
  permissions?: PluginPermission[]
  activationEvents?: string[]
}

export interface PluginContext {
  host: MetaDocHost
  manifest: PluginManifest
}

export interface MetaDocPlugin {
  manifest: PluginManifest
  activate(ctx: PluginContext): void | Promise<void>
  deactivate?(): void | Promise<void>
}

export function createMetaDocPlugin(
  manifest: PluginManifest,
  activate: (ctx: PluginContext) => void | Promise<void>,
  deactivate?: () => void | Promise<void>
): MetaDocPlugin {
  return { manifest, activate, deactivate }
}
