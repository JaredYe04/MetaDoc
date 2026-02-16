/** File Registry Module - Centralized file open state management */

import { BrowserWindow } from 'electron'
import { createMainLogger } from './logger'
import { getVisibleMainWindows } from './index'

const logger = createMainLogger('FileRegistry')

type FileState = 'opening' | 'open' | 'transferring' | 'closing'

interface FileEntry {
  filePath: string
  windowId: number
  tabId: string
  state: FileState
}

const globalFileRegistry = new Map<string, FileEntry>()
const closingTimeouts = new Map<string, NodeJS.Timeout>()
let cleanupInterval: NodeJS.Timeout | null = null

/** Preclaim file before opening to prevent concurrent duplicates */
export function claimFileOpen(
  filePath: string,
  windowId: number,
  tabId: string
): {
  success: boolean
  existingWindowId?: number
  existingTabId?: string
  existingState?: FileState
} {
  if (!filePath) {
    return { success: true }
  }

  // Clear any existing closing timeout for this path
  const existingTimeout = closingTimeouts.get(filePath)
  if (existingTimeout) {
    clearTimeout(existingTimeout)
    closingTimeouts.delete(filePath)
  }

  // Check registry
  const existing = globalFileRegistry.get(filePath)
  if (existing) {
    // If state is 'closing', allow override (user closed and immediately reopened)
    if (existing.state === 'closing') {
      globalFileRegistry.set(filePath, { filePath, windowId, tabId, state: 'opening' })
      return { success: true }
    }
    // If state is 'opening', 'open', or 'transferring', reject
    if (
      existing.state === 'opening' ||
      existing.state === 'open' ||
      existing.state === 'transferring'
    ) {
      return {
        success: false,
        existingWindowId: existing.windowId,
        existingTabId: existing.tabId,
        existingState: existing.state
      }
    }
  }

  globalFileRegistry.set(filePath, { filePath, windowId, tabId, state: 'opening' })
  return { success: true }
}

/** Confirm file open after successful load */
export function confirmFileOpen(filePath: string): void {
  if (!filePath) return
  const entry = globalFileRegistry.get(filePath)
  if (entry && entry.state === 'opening') {
    entry.state = 'open'
  } else if (!entry) {
    logger.warn(`Cannot confirm file open - entry not found for: ${filePath}`)
  }
}

/** Release claim if open failed */
export function releaseFileClaim(filePath: string): void {
  if (!filePath) return
  const entry = globalFileRegistry.get(filePath)
  if (entry && entry.state === 'opening') {
    globalFileRegistry.delete(filePath)
  }
}

/** Mark file as transferring between windows */
export function markFileTransferring(filePath: string): boolean {
  if (!filePath) return false
  const entry = globalFileRegistry.get(filePath)
  if (entry) {
    entry.state = 'transferring'
    return true
  }
  return false
}

/** Transfer ownership to new window */
export function transferFileOwnership(
  filePath: string,
  newWindowId: number,
  newTabId: string
): boolean {
  if (!filePath) return false
  const entry = globalFileRegistry.get(filePath)
  if (entry) {
    entry.windowId = newWindowId
    entry.tabId = newTabId
    entry.state = 'open'
    return true
  }
  return false
}

/** Mark file as closing (with 5-second delay before removal) */
export function markFileClosing(filePath: string): void {
  if (!filePath) return

  // Clear any existing timeout
  const existingTimeout = closingTimeouts.get(filePath)
  if (existingTimeout) {
    clearTimeout(existingTimeout)
  }

  const entry = globalFileRegistry.get(filePath)
  if (entry) {
    entry.state = 'closing'

    // 5-second delay before removing entry
    const timeout = setTimeout(() => {
      const currentEntry = globalFileRegistry.get(filePath)
      if (currentEntry && currentEntry.state === 'closing') {
        globalFileRegistry.delete(filePath)
      }
      closingTimeouts.delete(filePath)
    }, 5000)

    closingTimeouts.set(filePath, timeout)
  }
}

/** Find window containing a specific file */
export function findWindowWithFile(filePath: string): {
  windowId: number | null
  tabId: string | null
  state: FileState | null
} {
  if (!filePath) {
    return { windowId: null, tabId: null, state: null }
  }

  const entry = globalFileRegistry.get(filePath)
  if (!entry) {
    return { windowId: null, tabId: null, state: null }
  }

  // Check if the window still exists
  const visibleWindows = getVisibleMainWindows()
  const windowExists = visibleWindows.some((win) => win.webContents.id === entry.windowId)

  if (windowExists) {
    return {
      windowId: entry.windowId,
      tabId: entry.tabId,
      state: entry.state
    }
  } else {
    // Window is closed - clean up orphan entry
    globalFileRegistry.delete(filePath)
    return { windowId: null, tabId: null, state: null }
  }
}

/** Clean up orphan entries (windows that no longer exist) */
function cleanupOrphanEntries(): void {
  const visibleWindows = getVisibleMainWindows()
  const aliveWindowIds = new Set(visibleWindows.map((win) => win.webContents.id))

  const toDelete: string[] = []
  for (const [filePath, entry] of globalFileRegistry.entries()) {
    if (!aliveWindowIds.has(entry.windowId)) {
      toDelete.push(filePath)
    }
  }

  for (const filePath of toDelete) {
    globalFileRegistry.delete(filePath)
    logger.debug(`Cleaned up orphan entry: ${filePath}`)
  }
}

/** Start the file registry cleanup interval */
export function startFileRegistry(): void {
  if (cleanupInterval) {
    return // Already running
  }

  cleanupInterval = setInterval(
    () => {
      cleanupOrphanEntries()
    },
    5 * 60 * 1000
  ) // Every 5 minutes

  logger.info('File registry started')
}

/** Stop the file registry and clean up */
export function stopFileRegistry(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
  }

  // Clear all closing timeouts
  for (const [filePath, timeout] of closingTimeouts.entries()) {
    clearTimeout(timeout)
  }
  closingTimeouts.clear()

  logger.info('File registry stopped')
}
