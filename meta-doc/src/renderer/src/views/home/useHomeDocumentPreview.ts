/**
 * Home 文档预览 - 共享逻辑 composable
 * 格式检测、文件统计、URL 编码等
 */

import { ref, computed, watch } from 'vue'
import { useActiveDocument } from '../../composables/useActiveDocument'
import { useWorkspace } from '../../stores/workspace'
import messageBridge from '../../bridge/message-bridge'
import { createRendererLogger } from '../../utils/common/logger'
import { formatRegistry } from '../../utils/editor/format-registry'
import {
  getFileDisplayType,
  isRenderableTextFormat,
  isImageFormat
} from '../../utils/common/file-display-utils'
import type { getWindowType } from '../../utils/event-bus'

export function useHomeDocumentPreview(options?: { windowTypeProvider?: () => string }) {
  const logger = createRendererLogger('Home', {
    windowTypeProvider: options?.windowTypeProvider ?? (() => '')
  })

  const { activeDocument, activeTab } = useActiveDocument()
  const workspace = useWorkspace()

  const currentFilePath = computed(() => activeDocument.value?.path ?? '')
  const metaTitle = computed(() => activeDocument.value?.meta?.title ?? '')
  const metaAuthor = computed(() => activeDocument.value?.meta?.author ?? '')
  const metaDescription = computed(() => activeDocument.value?.meta?.description ?? '')

  const fileName = computed(() => {
    if (!currentFilePath.value) return ''
    const parts = currentFilePath.value.split(/[/\\]/)
    return parts[parts.length - 1] || ''
  })

  const fileFormat = computed(() => {
    if (!currentFilePath.value) return ''
    const lastDotIndex = currentFilePath.value.lastIndexOf('.')
    const ext = lastDotIndex >= 0 ? currentFilePath.value.substring(lastDotIndex).toLowerCase() : ''
    const formatId =
      activeDocument.value?.format || formatRegistry.getFormatByExtension(ext) || 'txt'
    const formatConfig = formatRegistry.getFormat(formatId)
    if (formatConfig) {
      if (ext) return ext.toUpperCase().substring(1)
      return formatConfig.label || 'TXT'
    }
    if (ext) return ext.toUpperCase().substring(1)
    return 'TXT'
  })

  const fileStats = ref<{ birthtime: number; mtime: number; size: number } | null>(null)

  const creationDate = computed(() => {
    if (!fileStats.value) return ''
    try {
      return new Date(fileStats.value.birthtime).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (error) {
      logger.warn('格式化创建日期失败', error)
      return ''
    }
  })

  const modificationDate = computed(() => {
    if (!fileStats.value) return ''
    try {
      return new Date(fileStats.value.mtime).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (error) {
      logger.warn('格式化修改日期失败', error)
      return ''
    }
  })

  const isRenderableFormat = computed(() => {
    const path = currentFilePath.value
    if (!path) return false
    return isRenderableTextFormat(path) || isImageFormat(path)
  })

  const renderableDisplayType = computed(() => getFileDisplayType(currentFilePath.value))

  const isPlainTextFormat = computed(() => {
    const format = activeDocument.value?.format
    if (format !== 'txt') return false
    return !isRenderableFormat.value
  })

  const isPdfTab = computed(() => {
    const tab = activeTab.value
    if (!tab || (tab.kind !== 'file' && tab.kind !== 'new')) return false
    const path = currentFilePath.value
    const format = (tab.format || activeDocument.value?.format || '').toLowerCase()
    return format === 'pdf' || (path && path.toLowerCase().endsWith('.pdf'))
  })

  const showDocumentPreview = computed(() => {
    const tab = activeTab.value
    if (!tab) return false
    if (tab.kind === 'file' && currentFilePath.value) return true
    if (tab.kind === 'file' && !currentFilePath.value && activeDocument.value?.format) return true
    if (tab.kind === 'new' && activeDocument.value?.format) return true
    return false
  })

  const needsFormatSelection = computed(() => {
    const tab = activeTab.value
    return tab?.kind === 'new' && !activeDocument.value?.format
  })

  const currentLinkBase = computed(() => {
    const path = currentFilePath.value
    if (!path) return ''
    return workspace.getLinkBase(path)
  })

  function encodeFilePathToUrl(filePath: string): string {
    if (!filePath) return ''
    let path = filePath.replace(/^file:\/\/\//, '')
    path = path.replace(/\\/g, '/')
    const parts = path.split('/')
    const encodedParts = parts.map((part: string, index: number) => {
      if (index === 0 && part.endsWith(':')) return part
      return encodeURIComponent(part).replace(/%2F/g, '/')
    })
    return `file:///${encodedParts.join('/')}`
  }

  const loadFileStats = async () => {
    if ((!isPlainTextFormat.value && !isRenderableFormat.value) || !currentFilePath.value) {
      fileStats.value = null
      return
    }
    try {
      if (!messageBridge.getIpc()) {
        logger.warn('IPC renderer 不可用，无法获取文件统计信息')
        return
      }
      const stats = (await messageBridge.invoke('get-file-stats', currentFilePath.value)) as {
        birthtime: number
        mtime: number
        size: number
      } | null
      fileStats.value = stats
    } catch (error) {
      logger.error('获取文件统计信息失败', error)
      fileStats.value = null
    }
  }

  return {
    logger,
    activeDocument,
    activeTab,
    workspace,
    currentFilePath,
    metaTitle,
    metaAuthor,
    metaDescription,
    fileName,
    fileFormat,
    fileStats,
    creationDate,
    modificationDate,
    isRenderableFormat,
    renderableDisplayType,
    isPlainTextFormat,
    isPdfTab,
    showDocumentPreview,
    needsFormatSelection,
    currentLinkBase,
    encodeFilePathToUrl,
    loadFileStats,
    isImageFormat
  }
}
