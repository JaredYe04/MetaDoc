import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearViewRegistry,
  getViewMenuItems,
  registerView,
  type ViewWhenContext
} from './registry'

const StubView = defineComponent({
  name: 'StubView',
  setup() {
    return () => h('div')
  }
})

const baseCtx: ViewWhenContext = {
  tabId: 'tab-1',
  format: 'md',
  hasActiveDocument: true,
  isPlainTextFormat: false,
  isPdfPreviewTab: false,
  isImageTab: false,
  llmEnabled: true
}

describe('view registry', () => {
  beforeEach(() => {
    clearViewRegistry()
  })

  it('registers and sorts views by order', () => {
    registerView({ id: 'visualize', component: StubView, label: 'Visualize', order: 40 })
    registerView({ id: 'outline', component: StubView, label: 'Outline', order: 30 })
    const items = getViewMenuItems(baseCtx)
    expect(items.map((i) => i.id)).toEqual(['outline', 'visualize'])
  })

  it('hides requiresLlm views when llm is off', () => {
    registerView({
      id: 'proofread',
      component: StubView,
      label: 'Proofread',
      requiresLlm: true,
      showInViewMenu: true
    })
    registerView({
      id: 'outline',
      component: StubView,
      label: 'Outline',
      showInViewMenu: true
    })
    const off = getViewMenuItems({ ...baseCtx, llmEnabled: false })
    expect(off.map((i) => i.id)).toEqual(['outline'])
    const on = getViewMenuItems({ ...baseCtx, llmEnabled: true })
    expect(on.map((i) => i.id)).toEqual(['outline', 'proofread'])
  })

  it('respects viewMenuConfig visibility', () => {
    registerView({ id: 'outline', component: StubView, label: 'Outline', showInViewMenu: true })
    registerView({ id: 'visualize', component: StubView, label: 'Visualize', showInViewMenu: true })
    const items = getViewMenuItems(baseCtx, [{ id: 'visualize', visible: false }])
    expect(items.map((i) => i.id)).toEqual(['outline'])
  })

  it('keeps core items visible even when config says hidden', () => {
    registerView({
      id: 'home',
      component: StubView,
      label: 'Home',
      isCore: true,
      showInViewMenu: true
    })
    const items = getViewMenuItems(baseCtx, [{ id: 'home', visible: false }])
    expect(items.map((i) => i.id)).toEqual(['home'])
  })
})
