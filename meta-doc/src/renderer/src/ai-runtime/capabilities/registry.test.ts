import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/agent-tools', () => ({
  initializeAgentTools: vi.fn(async () => undefined)
}))

vi.mock('../../utils/ai_tasks', () => ({
  createAiTask: vi.fn(),
  clearAiTasks: vi.fn()
}))

vi.mock('../../services/AIService', () => ({
  AIService: { isLLMAvailable: () => false }
}))

vi.mock('../../core/plugin-loader', () => ({
  activatePluginById: vi.fn(async () => true),
  deactivatePlugin: vi.fn(async () => undefined)
}))

vi.mock('../../core/host-runtime', () => ({
  attachLlmHost: vi.fn(),
  clearPluginContributions: vi.fn()
}))

vi.mock('../../core/community-plugin-loader', () => ({
  loadCommunityPlugins: vi.fn(async () => undefined)
}))

vi.mock('../../bridge/message-bridge', () => ({
  default: { getIpc: () => null }
}))

vi.mock('../../utils/event-bus.js', () => ({
  default: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}))

describe('ai-runtime capabilities registry', () => {
  beforeEach(async () => {
    const { unloadAllAiCapabilities } = await import('./registry')
    await unloadAllAiCapabilities()
    vi.clearAllMocks()
  })

  it('loads llm-core without agent plugins', async () => {
    const { ensureAiCapability, isAiCapabilityLoaded } = await import('./registry')
    const { activatePluginById } = await import('../../core/plugin-loader')

    await ensureAiCapability('llm-core')

    expect(isAiCapabilityLoaded('llm-core')).toBe(true)
    expect(isAiCapabilityLoaded('agent')).toBe(false)
    expect(activatePluginById).not.toHaveBeenCalled()
  })

  it('loads agent capability after llm-core dependency', async () => {
    const { ensureAiCapability, isAiCapabilityLoaded, getLoadedAiCapabilities } = await import(
      './registry'
    )
    const { activatePluginById } = await import('../../core/plugin-loader')

    await ensureAiCapability('agent')

    expect(isAiCapabilityLoaded('llm-core')).toBe(true)
    expect(isAiCapabilityLoaded('agent')).toBe(true)
    expect(getLoadedAiCapabilities()).toEqual(expect.arrayContaining(['llm-core', 'agent']))
    expect(activatePluginById).toHaveBeenCalledWith('metadoc.builtin.agent')
    expect(activatePluginById).toHaveBeenCalledWith('metadoc.builtin.shell-overlays')
  })

  it('ensureAiCapability is idempotent', async () => {
    const { ensureAiCapability } = await import('./registry')
    const { attachLlmHost } = await import('../../core/host-runtime')

    await ensureAiCapability('llm-core')
    await ensureAiCapability('llm-core')

    expect(attachLlmHost).toHaveBeenCalledTimes(1)
  })

  it('unloads capabilities in reverse order', async () => {
    const { ensureAiCapability, unloadAllAiCapabilities, isAiCapabilityLoaded } = await import(
      './registry'
    )
    const { deactivatePlugin } = await import('../../core/plugin-loader')

    await ensureAiCapability('agent')
    await unloadAllAiCapabilities()

    expect(isAiCapabilityLoaded('llm-core')).toBe(false)
    expect(isAiCapabilityLoaded('agent')).toBe(false)
    expect(deactivatePlugin).toHaveBeenCalled()
  })
})
