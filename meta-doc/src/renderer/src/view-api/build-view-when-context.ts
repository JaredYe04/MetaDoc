import type { ViewWhenContext } from './types'
import type { WorkspaceDocument, WorkspaceTab } from '../stores/workspace'
import { IMAGE_EXTENSIONS } from '../utils/file-display-utils'
import { extname } from '../utils/path-utils'

export function buildViewWhenContext(options: {
  tabId: string | null
  tab: WorkspaceTab | null
  document: WorkspaceDocument | null
  llmEnabled: boolean
}): ViewWhenContext {
  const { tabId, tab, document, llmEnabled } = options
  const format = document?.format ?? tab?.format ?? null
  const path = (tab?.path || document?.path || '').toLowerCase()
  const tabFormat = (tab?.format || document?.format || '').toLowerCase()
  const isPdfPreviewTab =
    !!tab &&
    tab.kind === 'file' &&
    tab.preview === true &&
    path.endsWith('.pdf') &&
    tabFormat === 'pdf'
  const rawPath = tab?.path || document?.path || ''
  const ext = extname(rawPath).toLowerCase()
  const isImageTab =
    !!tab && tab.kind === 'file' && !!rawPath && IMAGE_EXTENSIONS.has(ext)

  return {
    tabId,
    format,
    hasActiveDocument: !!document,
    isPlainTextFormat: format === 'txt',
    isPdfPreviewTab,
    isImageTab,
    llmEnabled
  }
}
