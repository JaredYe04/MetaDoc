import { describe, it, expect } from 'vitest'
import { resolveEffectiveLlmInternal } from './steam-cloud-route'

describe('resolveEffectiveLlmInternal', () => {
  it('passes through when not on MetaDoc cloud route', () => {
    expect(resolveEffectiveLlmInternal(false, 'openai')).toBe('openai')
    expect(resolveEffectiveLlmInternal(false, 'metadoc')).toBe('metadoc')
    expect(resolveEffectiveLlmInternal(false, null)).toBe('')
  })

  it('forces metadoc for Steam cloud route except manual', () => {
    expect(resolveEffectiveLlmInternal(true, 'openai')).toBe('metadoc')
    expect(resolveEffectiveLlmInternal(true, 'deepseek')).toBe('metadoc')
    expect(resolveEffectiveLlmInternal(true, 'manual')).toBe('manual')
    expect(resolveEffectiveLlmInternal(true, '')).toBe('metadoc')
  })
})
