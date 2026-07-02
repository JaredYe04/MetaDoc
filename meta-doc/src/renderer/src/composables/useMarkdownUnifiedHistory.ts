import { ref } from 'vue'

interface MarkdownHistoryStack {
  past: string[]
  future: string[]
}

const stacks = new Map<string, MarkdownHistoryStack>()
const applyingHistoryTabs = new Set<string>()

function normalizeSnapshot(value: string): string {
  return (value ?? '').replace(/\r\n/g, '\n')
}

function getStack(tabId: string): MarkdownHistoryStack | undefined {
  return stacks.get(tabId)
}

function ensureStack(tabId: string, initialMarkdown: string): MarkdownHistoryStack {
  let stack = stacks.get(tabId)
  const normalized = normalizeSnapshot(initialMarkdown)
  if (!stack) {
    stack = { past: [normalized], future: [] }
    stacks.set(tabId, stack)
  }
  return stack
}

export function isApplyingMarkdownHistory(tabId: string): boolean {
  return applyingHistoryTabs.has(tabId)
}

export function resetMarkdownUnifiedHistory(tabId: string, markdown: string): void {
  const normalized = normalizeSnapshot(markdown)
  stacks.set(tabId, { past: [normalized], future: [] })
}

export function clearMarkdownUnifiedHistory(tabId: string): void {
  stacks.delete(tabId)
  applyingHistoryTabs.delete(tabId)
}

export function pushMarkdownHistorySnapshot(tabId: string, markdown: string): void {
  if (applyingHistoryTabs.has(tabId)) return
  const normalized = normalizeSnapshot(markdown)
  const stack = ensureStack(tabId, normalized)
  const top = stack.past[stack.past.length - 1]
  if (top === normalized) return
  stack.past.push(normalized)
  if (stack.past.length > 200) {
    stack.past.splice(0, stack.past.length - 200)
  }
  stack.future = []
}

export function canMarkdownUndo(tabId: string): boolean {
  const stack = getStack(tabId)
  return !!stack && stack.past.length > 1
}

export function canMarkdownRedo(tabId: string): boolean {
  const stack = getStack(tabId)
  return !!stack && stack.future.length > 0
}

export function markdownHistoryUndo(
  tabId: string,
  currentMarkdown: string
): string | null {
  const stack = getStack(tabId)
  if (!stack || stack.past.length <= 1) return null
  const current = normalizeSnapshot(currentMarkdown)
  stack.future.unshift(current)
  stack.past.pop()
  return stack.past[stack.past.length - 1] ?? null
}

export function markdownHistoryRedo(tabId: string): string | null {
  const stack = getStack(tabId)
  if (!stack || stack.future.length === 0) return null
  const next = stack.future.shift()
  if (next == null) return null
  stack.past.push(next)
  return next
}

export function runWithMarkdownHistoryApply<T>(tabId: string, fn: () => T): T {
  applyingHistoryTabs.add(tabId)
  try {
    return fn()
  } finally {
    queueMicrotask(() => {
      applyingHistoryTabs.delete(tabId)
    })
  }
}

export function useMarkdownUnifiedHistory(tabId: () => string) {
  const canUndo = ref(false)
  const canRedo = ref(false)

  const refreshFlags = () => {
    const id = tabId()
    canUndo.value = canMarkdownUndo(id)
    canRedo.value = canMarkdownRedo(id)
  }

  return {
    canUndo,
    canRedo,
    refreshFlags,
    reset: (markdown: string) => {
      resetMarkdownUnifiedHistory(tabId(), markdown)
      refreshFlags()
    },
    pushSnapshot: (markdown: string) => {
      pushMarkdownHistorySnapshot(tabId(), markdown)
      refreshFlags()
    },
    undo: (currentMarkdown: string) => {
      const snapshot = markdownHistoryUndo(tabId(), currentMarkdown)
      refreshFlags()
      return snapshot
    },
    redo: () => {
      const snapshot = markdownHistoryRedo(tabId())
      refreshFlags()
      return snapshot
    },
    applySnapshot: <T>(fn: () => T) => runWithMarkdownHistoryApply(tabId(), fn)
  }
}
