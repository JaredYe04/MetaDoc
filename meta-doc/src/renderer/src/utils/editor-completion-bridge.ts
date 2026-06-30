import eventBus from './event-bus.js'
import type { EditorAdapter } from './ai-completion-service'

export type EditorCompletionTriggerReason = 'input' | 'manual' | 'key'

export function setEditorCompletionAdapter(
  adapter: EditorAdapter,
  tabId?: string
): void {
  eventBus.emit('editor-completion-set-adapter', { adapter, tabId })
}

export function removeEditorCompletionAdapter(): void {
  eventBus.emit('editor-completion-remove-adapter')
}

export function triggerEditorCompletion(
  reason: EditorCompletionTriggerReason,
  options?: { key?: string; setupAdapter?: EditorAdapter }
): void {
  eventBus.emit('editor-completion-trigger', {
    reason,
    key: options?.key,
    setupAdapter: options?.setupAdapter
  })
}

export function cancelEditorCompletion(): void {
  eventBus.emit('editor-completion-cancel-current')
}

export function handleEditorCompletionMouseClick(): void {
  eventBus.emit('editor-completion-mouse-click')
}
