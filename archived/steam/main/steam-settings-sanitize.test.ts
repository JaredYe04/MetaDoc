import { describe, expect, it } from 'vitest'
import {
  mergeSettingsFromCloudPull,
  sanitizeSettingsForCloud,
  STEAM_CLOUD_EXCLUDED_TOP_LEVEL_KEYS
} from './steam-settings-sanitize'

describe('sanitizeSettingsForCloud', () => {
  it('removes apiKey at any depth', () => {
    const input = {
      openai: { apiKey: 'secret', apiUrl: 'https://x' },
      nested: { a: { apiKey: 'k2' }, b: 1 }
    }
    const out = sanitizeSettingsForCloud(input as Record<string, unknown>)
    expect(out.openai).toEqual({ apiUrl: 'https://x' })
    expect((out.nested as Record<string, unknown>).a).toEqual({})
    expect((out.nested as Record<string, unknown>).b).toBe(1)
  })

  it('does not mutate input', () => {
    const input = { x: { apiKey: 'y' } }
    sanitizeSettingsForCloud(input as Record<string, unknown>)
    expect((input.x as { apiKey: string }).apiKey).toBe('y')
  })
})

describe('mergeSettingsFromCloudPull', () => {
  it('preserves local apiKey when remote omits it', () => {
    const local = { openai: { apiKey: 'local-secret', selectedModel: 'gpt' } }
    const remote = { openai: { selectedModel: 'gpt-4' } }
    const merged = mergeSettingsFromCloudPull(local, remote) as Record<string, unknown>
    expect((merged.openai as Record<string, unknown>).apiKey).toBe('local-secret')
    expect((merged.openai as Record<string, unknown>).selectedModel).toBe('gpt-4')
  })

  it('preserves local apiKey when remote sends empty string', () => {
    const local = { qwen: { apiKey: 'abc' } }
    const remote = { qwen: { apiKey: '' } }
    const merged = mergeSettingsFromCloudPull(local, remote) as Record<string, unknown>
    expect((merged.qwen as Record<string, unknown>).apiKey).toBe('abc')
  })

  it('merges nested objects', () => {
    const local = { imageUpload: { action: 'upload', customUploadApiUrl: 'http://old' } }
    const remote = { imageUpload: { action: 'saveToDocumentDir' } }
    const merged = mergeSettingsFromCloudPull(local, remote) as Record<string, unknown>
    expect(merged.imageUpload).toEqual({
      action: 'saveToDocumentDir',
      customUploadApiUrl: 'http://old'
    })
  })
})

describe('STEAM_CLOUD_EXCLUDED_TOP_LEVEL_KEYS', () => {
  it('contains steamSyncMeta and metadocUserTemplates', () => {
    expect(STEAM_CLOUD_EXCLUDED_TOP_LEVEL_KEYS.has('steamSyncMeta')).toBe(true)
    expect(STEAM_CLOUD_EXCLUDED_TOP_LEVEL_KEYS.has('metadocUserTemplates')).toBe(true)
  })
})
