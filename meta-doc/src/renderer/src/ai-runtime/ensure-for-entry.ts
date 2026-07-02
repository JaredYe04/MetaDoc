import type { AiCapabilityId } from './capabilities'
import { ensureAiCapability, isAiCapabilityLoaded, isAiCapabilityLoading } from './loader'
import eventBus from '../utils/event-bus'

const loadingUi = new Set<AiCapabilityId>()

export function isCapabilityLoadingForUi(id: AiCapabilityId): boolean {
  return loadingUi.has(id) || isAiCapabilityLoading(id)
}

export async function ensureAiCapabilityWithFeedback(id: AiCapabilityId): Promise<void> {
  if (isAiCapabilityLoaded(id)) return
  if (loadingUi.has(id)) {
    await waitForCapability(id)
    return
  }
  loadingUi.add(id)
  eventBus.emit('ai-capability-loading', id)
  try {
    await ensureAiCapability(id)
  } finally {
    loadingUi.delete(id)
    eventBus.emit('ai-capability-loading-done', id)
  }
}

function waitForCapability(id: AiCapabilityId): Promise<void> {
  return new Promise((resolve) => {
    const onLoaded = (loadedId: unknown) => {
      if (loadedId === id) {
        eventBus.off('ai-capability-loaded', onLoaded)
        resolve()
      }
    }
    eventBus.on('ai-capability-loaded', onLoaded)
  })
}

const TOOL_WINDOW_EVENTS = new Set([
  'fomula-recognition',
  'data-analysis',
  'ocr',
  'attachment',
  'aigc-detection',
  'smart-drawing-assistant',
  'ai-graph',
  'graph'
])

const VIEW_CAPABILITY: Record<string, AiCapabilityId> = {
  proofread: 'editor-ai',
  agent: 'agent'
}

export function capabilityForDocumentView(viewId: string): AiCapabilityId | null {
  return VIEW_CAPABILITY[viewId] ?? null
}

export async function ensureCapabilityForDocumentView(viewId: string): Promise<void> {
  const cap = capabilityForDocumentView(viewId)
  if (cap) await ensureAiCapabilityWithFeedback(cap)
}

export async function ensureCapabilityForToolEvent(eventName: string): Promise<void> {
  if (eventName === 'ai-chat') {
    await ensureAiCapabilityWithFeedback('editor-ai')
    return
  }
  if (TOOL_WINDOW_EVENTS.has(eventName)) {
    await ensureAiCapabilityWithFeedback('tool-windows')
  }
}

export async function ensureCompletionCapability(): Promise<void> {
  await ensureAiCapabilityWithFeedback('completion')
}

export async function ensureEditorAiCapability(): Promise<void> {
  await ensureAiCapabilityWithFeedback('editor-ai')
}
