import { describe, expect, it, vi } from 'vitest'
import type { MetaDocHost } from '../host-api'
import { PluginPermissionError } from './plugin-permissions'
import { createSandboxedHost } from './sandboxed-host'

function makeHost(): MetaDocHost {
  return {
    version: '1.0.0',
    documents: {
      getActiveTabId: vi.fn(() => 'tab-1'),
      getDocument: vi.fn(() => ({ tabId: 'tab-1', format: 'md', content: 'hi' })),
      getActiveDocument: vi.fn(() => ({ tabId: 'tab-1', format: 'md', content: 'hi' })),
      updateContent: vi.fn(),
      onActiveTabChanged: vi.fn(() => () => {}),
      onContentChanged: vi.fn(() => () => {})
    },
    outline: {
      getOutline: vi.fn(() => []),
      updateOutline: vi.fn()
    },
    editor: {
      registerOverlay: vi.fn(() => () => {}),
      getOverlays: vi.fn(() => []),
      registerAccessory: vi.fn(() => () => {}),
      getAccessories: vi.fn(() => [])
    },
    ui: {
      registerContextMenuItem: vi.fn(() => () => {}),
      registerLeftMenuItem: vi.fn(() => () => {}),
      registerDocumentView: vi.fn(() => () => {}),
      registerSettingsSection: vi.fn(() => () => {}),
      registerShellOverlay: vi.fn(() => () => {}),
      registerHomeSection: vi.fn(() => () => {})
    },
    events: {
      on: vi.fn(() => () => {}),
      emit: vi.fn()
    },
    settings: {
      get: vi.fn(async () => 'value'),
      set: vi.fn(async () => {}),
      isLlmEnabled: vi.fn(async () => false)
    },
    llm: {
      isAvailable: vi.fn(async () => true),
      createTask: vi.fn()
    }
  }
}

describe('createSandboxedHost', () => {
  it('allows declared document read permission', () => {
    const host = makeHost()
    const sandbox = createSandboxedHost(host, ['documents.read'])
    expect(sandbox.documents.getActiveDocument()?.content).toBe('hi')
    expect(() => sandbox.documents.updateContent('tab-1', 'x')).toThrow(PluginPermissionError)
  })

  it('allows declared settings read permission', async () => {
    const host = makeHost()
    const sandbox = createSandboxedHost(host, ['settings.read'])
    await expect(sandbox.settings.get('llmEnabled')).resolves.toBe('value')
    await expect(sandbox.settings.set('llmEnabled', true)).rejects.toThrow(PluginPermissionError)
  })

  it('hides llm host without llm permissions', () => {
    const host = makeHost()
    const sandbox = createSandboxedHost(host, ['settings.read'])
    expect(sandbox.llm).toBeUndefined()
  })

  it('keeps ui and events available without extra permissions', () => {
    const host = makeHost()
    const sandbox = createSandboxedHost(host, [])
    expect(() => sandbox.ui.registerLeftMenuItem({
      id: 'x',
      label: 'x',
      onClick: () => {}
    })).not.toThrow()
    expect(() => sandbox.events.emit('test')).not.toThrow()
  })
})
