import { beforeEach, describe, expect, it, vi } from 'vitest'
import { switchDocumentView } from './controller'

const updateDocumentLastView = vi.fn()

vi.mock('../stores/workspace', () => ({
  useWorkspace: () => ({
    tabs: [{ id: 'tab-1', kind: 'file', title: 'Doc' }],
    updateDocumentLastView
  })
}))

vi.mock('../ai-runtime/ensure-for-entry', () => ({
  ensureCapabilityForDocumentView: vi.fn(async () => undefined)
}))

describe('switchDocumentView', () => {
  beforeEach(() => {
    updateDocumentLastView.mockClear()
  })

  it('calls updateDocumentLastView for eligible tabs', async () => {
    await switchDocumentView('tab-1', 'outline')
    expect(updateDocumentLastView).toHaveBeenCalledWith('tab-1', 'outline')
  })

  it('ignores missing tabs', async () => {
    await switchDocumentView('missing', 'outline')
    expect(updateDocumentLastView).not.toHaveBeenCalled()
  })
})
