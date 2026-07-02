import type {
  DocumentHost,
  DocumentSnapshot,
  EditorHost,
  EventHost,
  LlmHost,
  MetaDocHost,
  OutlineHost,
  PluginPermission,
  SettingsHost,
  UIHost
} from '../host-api'
import {
  assertPluginPermission,
  hasAnyLlmPermission,
  hasPluginPermission
} from './plugin-permissions'

function buildDocumentHost(host: DocumentHost, granted: ReadonlySet<PluginPermission>): DocumentHost {
  return {
    getActiveTabId() {
      assertPluginPermission(granted, 'documents.read')
      return host.getActiveTabId()
    },
    getDocument(tabId: string): DocumentSnapshot | null {
      assertPluginPermission(granted, 'documents.read')
      return host.getDocument(tabId)
    },
    getActiveDocument() {
      assertPluginPermission(granted, 'documents.read')
      return host.getActiveDocument()
    },
    updateContent(tabId: string, content: string) {
      assertPluginPermission(granted, 'documents.write')
      host.updateContent(tabId, content)
    },
    onActiveTabChanged(cb) {
      assertPluginPermission(granted, 'documents.read')
      return host.onActiveTabChanged(cb)
    },
    onContentChanged(cb) {
      assertPluginPermission(granted, 'documents.read')
      return host.onContentChanged(cb)
    }
  }
}

function buildOutlineHost(host: OutlineHost, granted: ReadonlySet<PluginPermission>): OutlineHost {
  return {
    getOutline(tabId: string) {
      assertPluginPermission(granted, 'outline.read')
      return host.getOutline(tabId)
    },
    updateOutline(tabId: string, outline: unknown) {
      assertPluginPermission(granted, 'outline.write')
      host.updateOutline(tabId, outline)
    }
  }
}

function buildSettingsHost(host: SettingsHost, granted: ReadonlySet<PluginPermission>): SettingsHost {
  return {
    async get<T>(key: string) {
      assertPluginPermission(granted, 'settings.read')
      return host.get<T>(key)
    },
    async set(key: string, value: unknown) {
      assertPluginPermission(granted, 'settings.write')
      return host.set(key, value)
    },
    async isLlmEnabled() {
      assertPluginPermission(granted, 'settings.read')
      return host.isLlmEnabled()
    }
  }
}

function buildLlmHost(host: LlmHost | undefined, granted: ReadonlySet<PluginPermission>): LlmHost | undefined {
  if (!host || !hasAnyLlmPermission(granted)) {
    return undefined
  }
  return {
    async isAvailable() {
      return host.isAvailable()
    },
    createTask: ((name, prompt, target, type, originKey, meta) => {
      if (type === 'answer') {
        assertPluginPermission(granted, 'llm.completion')
      } else {
        assertPluginPermission(granted, 'llm.chat')
      }
      return host.createTask(name, prompt, target, type, originKey, meta)
    }) as LlmHost['createTask']
  }
}

/**
 * Returns a Host view that enforces manifest permissions for community plugins.
 * UI, editor, and events remain available so plugins can register contributions.
 */
export function createSandboxedHost(
  host: MetaDocHost,
  permissions: PluginPermission[]
): MetaDocHost {
  const granted = new Set(permissions)
  return {
    version: host.version,
    documents: buildDocumentHost(host.documents, granted),
    outline: buildOutlineHost(host.outline, granted),
    views: host.views,
    editor: host.editor as EditorHost,
    ui: host.ui as UIHost,
    events: host.events as EventHost,
    settings: buildSettingsHost(host.settings, granted),
    llm: buildLlmHost(host.llm, granted)
  }
}

export function isSandboxedPermission(permission: PluginPermission): boolean {
  return (
    permission.startsWith('documents.') ||
    permission.startsWith('outline.') ||
    permission.startsWith('settings.') ||
    permission.startsWith('llm.')
  )
}

export function canAccessHostCapability(
  granted: ReadonlySet<PluginPermission>,
  capability: 'documents' | 'outline' | 'settings' | 'llm'
): boolean {
  switch (capability) {
    case 'documents':
      return hasPluginPermission(granted, 'documents.read') || hasPluginPermission(granted, 'documents.write')
    case 'outline':
      return hasPluginPermission(granted, 'outline.read') || hasPluginPermission(granted, 'outline.write')
    case 'settings':
      return hasPluginPermission(granted, 'settings.read') || hasPluginPermission(granted, 'settings.write')
    case 'llm':
      return hasAnyLlmPermission(granted)
    default:
      return false
  }
}
