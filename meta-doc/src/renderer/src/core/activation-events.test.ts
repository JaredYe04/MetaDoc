import { describe, expect, it } from 'vitest'
import { manifestMatchesActivation } from './activation-events'

describe('manifestMatchesActivation', () => {
  it('defaults to onLlmEnabled when activationEvents is empty', () => {
    expect(manifestMatchesActivation({ id: 'x', name: 'x', version: '1', entry: '.' }, 'onLlmEnabled')).toBe(
      true
    )
    expect(manifestMatchesActivation({ id: 'x', name: 'x', version: '1', entry: '.' }, 'onStartup')).toBe(
      false
    )
  })

  it('matches explicit activation events', () => {
    const manifest = {
      id: 'x',
      name: 'x',
      version: '1',
      entry: '.',
      activationEvents: ['onStartup']
    }
    expect(manifestMatchesActivation(manifest, 'onStartup')).toBe(true)
    expect(manifestMatchesActivation(manifest, 'onLlmEnabled')).toBe(false)
  })
})
