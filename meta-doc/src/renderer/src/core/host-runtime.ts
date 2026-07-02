import type {
  ContextMenuItemContribution,
  DocumentHost,
  DocumentSnapshot,
  DocumentViewContribution,
  EditorHost,
  EditorOverlayRegistration,
  EditorAccessoryRegistration,
  EventHost,
  LeftMenuItemContribution,
  LlmHost,
  MetaDocHost,
  OutlineHost,
  SettingsHost,
  UIHost
} from '../host-api'
import { HOST_API_VERSION } from '../host-api'
import {
  createViewHost,
  getAllViews,
  legacyContributionToRegistration,
  registerView,
  viewRegistryMap
} from '../view-api'
import eventBus from '../utils/event-bus.js'
import { getSetting, setSetting } from '../utils/settings.js'
import { useWorkspace } from '../stores/workspace'

const editorOverlays: EditorOverlayRegistration[] = []
const editorAccessories: EditorAccessoryRegistration[] = []
const contextMenuItems: ContextMenuItemContribution[] = []
const leftMenuItems: LeftMenuItemContribution[] = []
/** @deprecated Use viewRegistryMap from view-api — kept for backward-compatible imports */
const documentViews = viewRegistryMap as unknown as Map<string, DocumentViewContribution>
const settingsSections: import('../host-api').SettingsSectionContribution[] = []
const shellOverlays: import('../host-api').ShellOverlayContribution[] = []
const homeSections: import('../host-api').HomeSectionContribution[] = []

let llmHost: LlmHost | undefined

export const pluginRegistry = {
  contextMenuItems,
  leftMenuItems,
  documentViews,
  settingsSections,
  shellOverlays,
  editorOverlays,
  editorAccessories,
  homeSections
}

function buildDocumentHost(): DocumentHost {
  return {
    getActiveTabId() {
      const ws = useWorkspace()
      return ws.activeTabId ?? null
    },
    getDocument(tabId: string): DocumentSnapshot | null {
      const ws = useWorkspace()
      const tab = ws.tabs.find((t) => t.id === tabId)
      if (!tab) return null
      const doc = ws.documents[tabId]
      if (!doc) return null
      return {
        tabId,
        format: tab.format || doc.format || 'md',
        content: doc.markdown || doc.tex || doc.plainText || '',
        outline: doc.outline,
        meta: doc.meta as Record<string, unknown> | undefined
      }
    },
    getActiveDocument() {
      const tabId = this.getActiveTabId()
      return tabId ? this.getDocument(tabId) : null
    },
    updateContent(tabId: string, content: string) {
      const ws = useWorkspace()
      const tab = ws.tabs.find((t) => t.id === tabId)
      if (!tab) return
      const fmt = tab.format || ws.documents[tabId]?.format
      if (fmt === 'tex') {
        ws.updateDocumentTex(tabId, content)
      } else {
        ws.updateDocumentMarkdown(tabId, content)
      }
    },
    onActiveTabChanged(cb) {
      const handler = (tabId: string) => cb(tabId)
      eventBus.on('active-tab-changed', handler)
      return () => eventBus.off('active-tab-changed', handler)
    },
    onContentChanged(cb) {
      const handler = (payload: { tabId?: string }) => {
        if (payload?.tabId) cb(payload.tabId)
      }
      eventBus.on('document-content-updated', handler)
      return () => eventBus.off('document-content-updated', handler)
    }
  }
}

function buildOutlineHost(): OutlineHost {
  return {
    getOutline(tabId: string) {
      return useWorkspace().documents[tabId]?.outline
    },
    updateOutline(tabId: string, outline: unknown) {
      useWorkspace().updateDocumentOutline(tabId, outline)
    }
  }
}

function buildEditorHost(): EditorHost {
  return {
    registerOverlay(reg) {
      editorOverlays.push(reg)
      return () => {
        const i = editorOverlays.findIndex((o) => o.id === reg.id)
        if (i >= 0) editorOverlays.splice(i, 1)
      }
    },
    getOverlays(format?: string) {
      if (!format) return [...editorOverlays]
      return editorOverlays.filter((o) => !o.formats?.length || o.formats.includes(format))
    },
    registerAccessory(reg) {
      editorAccessories.push(reg)
      return () => {
        const i = editorAccessories.findIndex((a) => a.id === reg.id)
        if (i >= 0) editorAccessories.splice(i, 1)
      }
    },
    getAccessories(format?: string) {
      const list = !format
        ? [...editorAccessories]
        : editorAccessories.filter((a) => !a.formats?.length || a.formats.includes(format))
      return list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }
  }
}

function buildUIHost(): UIHost {
  return {
    registerContextMenuItem(item) {
      contextMenuItems.push(item)
      return () => {
        const i = contextMenuItems.findIndex((x) => x.id === item.id)
        if (i >= 0) contextMenuItems.splice(i, 1)
      }
    },
    registerLeftMenuItem(item) {
      leftMenuItems.push(item)
      return () => {
        const i = leftMenuItems.findIndex((x) => x.id === item.id)
        if (i >= 0) leftMenuItems.splice(i, 1)
      }
    },
    registerDocumentView(view) {
      return registerView(legacyContributionToRegistration(view))
    },
    registerSettingsSection(section) {
      settingsSections.push(section)
      return () => {
        const i = settingsSections.findIndex((s) => s.id === section.id)
        if (i >= 0) settingsSections.splice(i, 1)
      }
    },
    registerShellOverlay(overlay) {
      shellOverlays.push(overlay)
      return () => {
        const i = shellOverlays.findIndex((o) => o.id === overlay.id)
        if (i >= 0) shellOverlays.splice(i, 1)
      }
    },
    registerHomeSection(section) {
      homeSections.push(section)
      return () => {
        const i = homeSections.findIndex((s) => s.id === section.id)
        if (i >= 0) homeSections.splice(i, 1)
      }
    }
  }
}

function buildEventHost(): EventHost {
  return {
    on(event, handler) {
      eventBus.on(event, handler)
      return () => eventBus.off(event, handler)
    },
    emit(event, ...args) {
      eventBus.emit(event, ...args)
    }
  }
}

function buildSettingsHost(): SettingsHost {
  return {
    get: getSetting,
    set: setSetting,
    async isLlmEnabled() {
      return (await getSetting('llmEnabled')) === true
    }
  }
}

let hostInstance: MetaDocHost | null = null

export function getHost(): MetaDocHost {
  if (!hostInstance) {
    hostInstance = {
      version: HOST_API_VERSION,
      documents: buildDocumentHost(),
      outline: buildOutlineHost(),
      editor: buildEditorHost(),
      views: createViewHost(),
      ui: buildUIHost(),
      events: buildEventHost(),
      settings: buildSettingsHost(),
      llm: llmHost
    }
  }
  return hostInstance
}

export function attachLlmHost(llm: LlmHost | undefined): void {
  llmHost = llm
  if (hostInstance) {
    hostInstance.llm = llm
  }
}

export function clearPluginContributions(): void {
  editorOverlays.length = 0
  editorAccessories.length = 0
  contextMenuItems.length = 0
  leftMenuItems.length = 0
  for (const reg of getAllViews()) {
    if (reg.requiresLlm) {
      viewRegistryMap.delete(reg.id)
    }
  }
  settingsSections.length = 0
  shellOverlays.length = 0
  homeSections.length = 0
}

export function isAiRuntimeActive(): boolean {
  return llmHost != null
}
