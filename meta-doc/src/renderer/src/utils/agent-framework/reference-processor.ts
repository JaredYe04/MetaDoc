/**
 * Reference处理器
 * 处理文件上传、URL下载和内容解析
 */

import { createRendererLogger } from '../logger'
import messageBridge from '../../bridge/message-bridge'
import { webMainCalls } from '../web-adapter/web-main-calls'
import { referenceAdapterManager } from './reference-adapters'
import type { Reference } from '../../types/agent-framework'
import { filterTextContent } from '../text-filter'
import axios from 'axios'
import { registerTask } from '../task-manager'

/**
 * 将ArrayBuffer转换为base64字符串（浏览器兼容）
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * 将base64字符串转换为ArrayBuffer（浏览器兼容）
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// 懒加载logger，避免初始化顺序问题
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('ReferenceProcessor')
  }
  return loggerInstance
}

if (typeof window !== 'undefined' && !(window as any).electron?.ipcRenderer) {
  webMainCalls()
}

/**
 * 生成唯一的requestId
 */
function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/** 主页 GlobalHome 上传时尚无 Agent 会话，附件暂存于 `.metadoc/attachments/_home_pending/`，打开 Agent 后迁移到真实 sessionId */
export const AGENT_HOME_PENDING_ATTACHMENT_SESSION_ID = '_home_pending'

function buildWorkspaceAttachmentMetadata(
  relativePath: string,
  sessionId: string
): Record<string, unknown> {
  return {
    attachmentStorage: 'workspace',
    workspaceRelativePath: relativePath,
    ...(sessionId === AGENT_HOME_PENDING_ATTACHMENT_SESSION_ID ? { homePending: true } : {})
  }
}

/** 解析后的文本落盘文件名（与源名区分，统一 .txt 便于 workspace 读取） */
function buildExtractedAttachmentFilename(originalName: string): string {
  const base =
    originalName
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\.[^./\\]+$/i, '')
      .trim()
      .slice(0, 80) || 'attachment'
  return `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-extracted.txt`
}

export interface ProcessFileUploadOptions {
  /**
   * 解析完成后将**提取/过滤后的纯文本**写入工作区 `.metadoc/attachments/<sessionId>/`（非原始二进制）。
   * LLM 通过 workspace 工具读该 .txt；会话内 `parsedContent` 置空以免重复占上下文。
   */
  workspaceAttachment?: { workspaceRoot: string; sessionId: string }
}

/**
 * 处理文件上传
 * @param file 文件对象
 * @param abortSignal 可选的AbortSignal，用于取消操作
 * @param requestId 可选的requestId，用于取消主进程任务
 * @param options 可选；若含 workspaceAttachment 则在完整解析（PDF/PPTX/OCR 等）后把提取文本写入工作区附件目录
 */
export async function processFileUpload(
  file: File,
  abortSignal?: AbortSignal,
  requestId?: string,
  options?: ProcessFileUploadOptions
): Promise<Reference> {
  const workspacePersist = options?.workspaceAttachment
  const filename = file.name
  const format = referenceAdapterManager.inferFormatFromFilename(filename)

  // 使用任务管理器注册任务，确保有明确的结束逻辑
  const { handle, promise } = registerTask(
    async (handle) => {
      const fileId = `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const signal = abortSignal ?? handle.signal

      // 检查取消状态并抛出错误的辅助函数
      const throwIfCancelled = () => {
        if (signal.aborted) {
          throw new Error('操作已取消')
        }
      }

      // 包装异步操作，确保能响应取消信号
      const withCancellation = async <T>(promise: Promise<T>): Promise<T> => {
        throwIfCancelled()
        const result = await promise
        throwIfCancelled()
        return result
      }

      handle.mark(0, {
        message: 'agent.reference.progress.parsingFile',
        params: { filename }
      })

      throwIfCancelled()
      const arrayBuffer = await withCancellation(file.arrayBuffer())

      let parsedContent: string
      let filePath: string | undefined

      try {
        if (
          format === 'txt' ||
          format === 'md' ||
          format === 'json' ||
          format === 'text' ||
          format === 'markdown' ||
          format === 'csv' ||
          format === 'html' ||
          format === 'htm' ||
          format === 'xml'
        ) {
          handle.mark(30, {
            message: 'agent.reference.progress.parsingFile',
            subMessage: 'agent.reference.progress.extractingText',
            params: { filename }
          })
          if (format === 'csv') {
            getLogger().info(`[processFileUpload] 开始解析CSV文件: ${filename}`)
            const text = await withCancellation(file.text())
            parsedContent = await withCancellation(referenceAdapterManager.parse(text, format))
          } else if (format === 'html' || format === 'htm' || format === 'xml') {
            // HTML/XML文件需要先读取内容，然后通过adapter解析提取纯文本
            getLogger().info(`[processFileUpload] 开始解析HTML/XML文件: ${filename}`)
            const text = await withCancellation(file.text())
            parsedContent = await withCancellation(referenceAdapterManager.parse(text, format))
          } else {
            parsedContent = await withCancellation(file.text())
          }
        } else if (
          format === 'jpg' ||
          format === 'jpeg' ||
          format === 'png' ||
          format === 'gif' ||
          format === 'bmp' ||
          format === 'webp' ||
          format === 'image'
        ) {
          getLogger().info(`[processFileUpload] 开始OCR识别图片: ${filename}`)
          handle.setSegment(80, {
            message: 'agent.reference.progress.parsingImage',
            subMessage: 'agent.reference.progress.ocrRecognizing',
            params: { filename }
          })

          if (messageBridge.getIpc()) {
            throwIfCancelled()
            filePath = await withCancellation(
              messageBridge.invoke('save-reference-file', {
                filename,
                content: arrayBufferToBase64(arrayBuffer)
              }) as Promise<string>
            )
            handle.updateSegmentProgress(1, 2, {
              message: 'agent.reference.progress.parsingImage',
              subMessage: 'agent.reference.progress.ocrRecognizing',
              params: { filename }
            })
            throwIfCancelled()
            parsedContent = await withCancellation(referenceAdapterManager.parse(filePath, format))
          } else {
            throwIfCancelled()
            parsedContent = await withCancellation(
              referenceAdapterManager.parse(arrayBuffer, format)
            )
          }
          handle.mark(80, {
            message: 'agent.reference.progress.parsingImage',
            subMessage: 'agent.reference.progress.ocrRecognizing',
            params: { filename }
          })
        } else {
          handle.mark(20, {
            message: 'agent.reference.progress.parsingFile',
            subMessage: 'agent.reference.progress.processingFormat',
            params: { filename, format: format.toUpperCase() }
          })

          if (messageBridge.getIpc()) {
            try {
              throwIfCancelled()
              filePath = await withCancellation(
                messageBridge.invoke('save-reference-file', {
                  filename,
                  content: arrayBufferToBase64(arrayBuffer)
                }) as Promise<string>
              )
              handle.mark(40, {
                message: 'agent.reference.progress.parsingFile',
                subMessage: 'agent.reference.progress.extractingText',
                params: { filename }
              })
              throwIfCancelled()
              parsedContent = await withCancellation(
                referenceAdapterManager.parse(filePath, format)
              )
            } catch (error) {
              getLogger().error('保存文件失败:', error)
              throw new Error(
                `保存文件失败: ${error instanceof Error ? error.message : String(error)}`
              )
            }
          } else {
            if (
              format === 'pdf' ||
              format === 'docx' ||
              format === 'doc' ||
              format === 'pptx' ||
              format === 'ppt'
            ) {
              throw new Error(`格式 ${format} 在Web环境中需要Electron环境支持`)
            }
            throwIfCancelled()
            const text = new TextDecoder('utf-8').decode(arrayBuffer)
            parsedContent = await withCancellation(referenceAdapterManager.parse(text, format))
          }
        }
      } catch (error) {
        getLogger().error('解析文件内容失败:', error)
        // 如果是取消错误，直接抛出，任务管理器会处理
        if (error instanceof Error && error.message === '操作已取消') {
          throw error
        }
        throw new Error(`解析文件失败: ${error instanceof Error ? error.message : String(error)}`)
      }

      handle.mark(90, {
        message: 'agent.reference.progress.parsingFile',
        subMessage: 'agent.reference.progress.cleaningText',
        params: { filename }
      })

      throwIfCancelled()
      const originalLength = parsedContent?.length || 0
      const filteredContent = filterTextContent(parsedContent || '')
      const filteredLength = filteredContent.length

      if (originalLength !== filteredLength) {
        getLogger().info(`[processFileUpload] 文本过滤完成`, {
          originalLength,
          filteredLength,
          removedLength: originalLength - filteredLength
        })
      }

      const reference: Reference = {
        id: fileId,
        name: filename,
        origin: filePath || filename,
        format,
        parsedContent: filteredContent,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      if (workspacePersist) {
        if (!messageBridge.getIpc()) {
          throw new Error('工作区附件需要 Electron IPC：无法将解析文本写入 .metadoc/attachments')
        }
        const outName = buildExtractedAttachmentFilename(filename)
        const saved = (await messageBridge.invoke('save-agent-session-attachment', {
          workspaceRoot: workspacePersist.workspaceRoot,
          sessionId: workspacePersist.sessionId,
          filename: outName,
          content: filteredContent,
          encoding: 'utf8'
        })) as { absolutePath: string; relativePath: string }
        reference.origin = saved.absolutePath
        reference.parsedContent = ''
        reference.metadata = buildWorkspaceAttachmentMetadata(
          saved.relativePath,
          workspacePersist.sessionId
        )
        getLogger().info(`[processFileUpload] 已写入工作区提取文本附件`, {
          name: filename,
          savedPath: saved.absolutePath,
          textLength: filteredContent.length
        })
      }

      getLogger().info(`[processFileUpload] Reference对象创建完成`, {
        id: reference.id,
        name: reference.name,
        format: reference.format,
        hasParsedContent: !!reference.parsedContent,
        parsedContentLength: reference.parsedContent?.length || 0,
        parsedContentPreview: reference.parsedContent?.substring(0, 200) || '无内容'
      })

      return reference
    },
    {
      name: `处理文件上传: ${filename}`,
      requestId,
      onCancel: async (reqId) => {
        // 通知主进程取消文件转换任务
        if (messageBridge.getIpc() && requestId) {
          try {
            await messageBridge.invoke('cancel-file-conversion', reqId)
          } catch (err) {
            getLogger().warn('取消主进程任务失败:', err)
          }
        }
      }
    }
  )

  return promise
}

export interface ProcessUrlReferenceOptions {
  workspaceAttachment?: { workspaceRoot: string; sessionId: string }
}

/**
 * 处理URL引用
 */
export async function processUrlReference(
  url: string,
  abortSignal?: AbortSignal,
  urlOptions?: ProcessUrlReferenceOptions
): Promise<Reference> {
  // 使用任务管理器注册任务
  const { handle, promise } = registerTask(
    async (handle) => {
      const refId = `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const signal = abortSignal ?? handle.signal

      const throwIfCancelled = () => {
        if (signal.aborted) {
          throw new Error('操作已取消')
        }
      }

      const withCancellation = async <T>(promise: Promise<T>): Promise<T> => {
        throwIfCancelled()
        const result = await promise
        throwIfCancelled()
        return result
      }

      throwIfCancelled()

      // 验证URL格式
      let urlObj: URL
      try {
        urlObj = new URL(url)
      } catch {
        throw new Error('无效的URL格式')
      }

      const format = referenceAdapterManager.inferFormatFromUrl(url)
      const isHtml = format === 'html' || format === 'htm'

      let content: string | undefined
      let filePath: string | undefined

      try {
        if (isHtml) {
          handle.setSegment(50, {
            message: 'agent.reference.progress.downloadingWebpage',
            subMessage: '连接服务器...'
          })
          throwIfCancelled()
          const response = await axios.get(url, {
            timeout: 30000,
            responseType: 'text',
            validateStatus: () => true,
            signal
          })
          handle.mark(50, {
            message: 'agent.reference.progress.downloadingWebpage',
            subMessage: 'agent.reference.progress.downloading'
          })
          if (response.status >= 200 && response.status < 300) {
            content = response.data
          } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
        } else {
          handle.setSegment(70, {
            message: 'agent.reference.progress.downloadingFile',
            subMessage: '连接服务器...'
          })
          throwIfCancelled()
          const response = await axios.get(url, {
            timeout: 60000,
            responseType: 'arraybuffer',
            validateStatus: () => true,
            signal,
            onDownloadProgress: (progressEvent) => {
              if (progressEvent.total && !signal.aborted) {
                const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100)
                handle.updateSegmentProgress(progressEvent.loaded, progressEvent.total, {
                  message: 'agent.reference.progress.downloadingFile',
                  subMessage: `已下载 ${percent}%`
                })
              }
            }
          })

          if (response.status >= 200 && response.status < 300) {
            const arrayBuffer = response.data as ArrayBuffer
            if (messageBridge.getIpc()) {
              const pathname = urlObj.pathname
              const lastSlash = pathname.lastIndexOf('/')
              const filename =
                lastSlash >= 0 ? pathname.substring(lastSlash + 1) : `download-${Date.now()}`
              const finalFilename = filename || `download-${Date.now()}`

              throwIfCancelled()
              filePath = await withCancellation(
                messageBridge.invoke('save-reference-file', {
                  filename: finalFilename,
                  content: arrayBufferToBase64(arrayBuffer)
                }) as Promise<string>
              )

              getLogger().info(`URL文件已保存到临时目录: ${filePath}`)
            } else {
              content = new TextDecoder('utf-8').decode(arrayBuffer)
            }
          } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
        }
      } catch (error) {
        if (
          signal.aborted ||
          (error instanceof Error &&
            (error.name === 'CanceledError' || error.message.includes('canceled')))
        ) {
          throw new Error('操作已取消')
        }

        getLogger().error('下载URL内容失败:', error)
        throw new Error(`下载URL失败: ${error instanceof Error ? error.message : String(error)}`)
      }

      throwIfCancelled()

      handle.mark(85, {
        message: 'agent.reference.progress.parsingContent',
        subMessage: 'agent.reference.progress.extractingText'
      })

      let parsedContent: string
      try {
        if (isHtml) {
          throwIfCancelled()
          parsedContent = await withCancellation(referenceAdapterManager.parse(content!, 'html'))
        } else if (filePath) {
          throwIfCancelled()
          parsedContent = await withCancellation(referenceAdapterManager.parse(filePath, format))
        } else {
          throwIfCancelled()
          parsedContent = await withCancellation(referenceAdapterManager.parse(content!, format))
        }
      } catch (error) {
        if (signal.aborted || (error instanceof Error && error.message === '操作已取消')) {
          throw new Error('操作已取消')
        }

        getLogger().error('解析URL内容失败:', error)
        throw new Error(`解析内容失败: ${error instanceof Error ? error.message : String(error)}`)
      }

      throwIfCancelled()

      const originalLength = parsedContent?.length || 0
      const filteredContent = filterTextContent(parsedContent || '')
      const filteredLength = filteredContent.length

      if (originalLength !== filteredLength) {
        getLogger().info(`[processUrlReference] 文本过滤完成`, {
          originalLength,
          filteredLength,
          removedLength: originalLength - filteredLength
        })
      }

      const reference: Reference = {
        id: refId,
        name: urlObj.hostname + urlObj.pathname,
        origin: url,
        format: isHtml ? 'html' : format,
        parsedContent: filteredContent,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      if (urlOptions?.workspaceAttachment && messageBridge.getIpc()) {
        const wa = urlOptions.workspaceAttachment
        const fn = buildExtractedAttachmentFilename(
          `url-${urlObj.hostname.replace(/[^a-zA-Z0-9.-]/g, '_')}`
        )
        const saved = (await messageBridge.invoke('save-agent-session-attachment', {
          workspaceRoot: wa.workspaceRoot,
          sessionId: wa.sessionId,
          filename: fn,
          content: filteredContent,
          encoding: 'utf8'
        })) as { absolutePath: string; relativePath: string }
        reference.origin = saved.absolutePath
        reference.parsedContent = ''
        reference.metadata = buildWorkspaceAttachmentMetadata(saved.relativePath, wa.sessionId)
      }

      return reference
    },
    {
      name: `处理URL引用: ${url}`,
      onCancel: async () => {
        // URL下载的取消由axios的signal处理，无需额外操作
      }
    }
  )

  return promise
}

/**
 * 处理纯文本引用
 */
export function processTextReference(text: string, name: string = '文本引用'): Reference {
  const refId = `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  // 过滤无意义文本和meta-info标记
  const filteredContent = filterTextContent(text)

  return {
    id: refId,
    name,
    origin: name,
    format: 'txt',
    parsedContent: filteredContent,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

/**
 * 处理文章段落引用（需要从当前文档中提取）
 */
export function processDocumentReference(
  content: string,
  startLine?: number,
  endLine?: number,
  name?: string
): Reference {
  const refId = `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  let extractedContent = content
  if (startLine !== undefined && endLine !== undefined) {
    const lines = content.split('\n')
    extractedContent = lines.slice(startLine - 1, endLine).join('\n')
  }

  // 过滤无意义文本和meta-info标记
  const filteredContent = filterTextContent(extractedContent)

  return {
    id: refId,
    name:
      name ||
      `文档引用${startLine !== undefined && endLine !== undefined ? ` (${startLine}-${endLine}行)` : ''}`,
    origin: name || '当前文档',
    format: 'txt',
    parsedContent: filteredContent,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

/**
 * 文件类型分组定义
 */
export type FileTypeCategory = 'all' | 'text' | 'document' | 'data' | 'image' | 'web'

/**
 * 格式到扩展名和 MIME 类型的映射
 */
const formatToAccept: Record<string, { extensions: string[]; mimeTypes: string[] }> = {
  txt: { extensions: ['.txt'], mimeTypes: ['text/plain'] },
  text: { extensions: ['.txt'], mimeTypes: ['text/plain'] },
  md: { extensions: ['.md'], mimeTypes: ['text/markdown'] },
  markdown: { extensions: ['.md'], mimeTypes: ['text/markdown'] },
  json: { extensions: ['.json'], mimeTypes: ['application/json'] },
  pdf: { extensions: ['.pdf'], mimeTypes: ['application/pdf'] },
  docx: {
    extensions: ['.docx'],
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  },
  doc: { extensions: ['.doc'], mimeTypes: ['application/msword'] },
  pptx: {
    extensions: ['.pptx'],
    mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation']
  },
  ppt: { extensions: ['.ppt'], mimeTypes: ['application/vnd.ms-powerpoint'] },
  xlsx: {
    extensions: ['.xlsx'],
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
  },
  xls: { extensions: ['.xls'], mimeTypes: ['application/vnd.ms-excel'] },
  csv: { extensions: ['.csv'], mimeTypes: ['text/csv'] },
  html: { extensions: ['.html', '.htm'], mimeTypes: ['text/html'] },
  htm: { extensions: ['.html', '.htm'], mimeTypes: ['text/html'] },
  xml: { extensions: ['.xml'], mimeTypes: ['text/xml', 'application/xml'] },
  jpg: { extensions: ['.jpg', '.jpeg'], mimeTypes: ['image/jpeg'] },
  jpeg: { extensions: ['.jpg', '.jpeg'], mimeTypes: ['image/jpeg'] },
  png: { extensions: ['.png'], mimeTypes: ['image/png'] },
  gif: { extensions: ['.gif'], mimeTypes: ['image/gif'] },
  bmp: { extensions: ['.bmp'], mimeTypes: ['image/bmp'] },
  webp: { extensions: ['.webp'], mimeTypes: ['image/webp'] },
  image: {
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp']
  }
}

/**
 * 文件类型分组配置
 */
const fileTypeCategories: Record<FileTypeCategory, string[]> = {
  all: [], // 所有格式，将在函数中动态填充
  text: ['txt', 'text', 'md', 'markdown', 'json', 'xml'],
  document: ['pdf', 'docx', 'doc', 'pptx', 'ppt'],
  data: ['csv', 'xlsx', 'xls'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'image'],
  web: ['html', 'htm', 'xml']
}

/**
 * 根据类别获取格式列表
 */
function getFormatsByCategory(category: FileTypeCategory): string[] {
  if (category === 'all') {
    return referenceAdapterManager.getAllSupportedFormats()
  }
  return fileTypeCategories[category] || []
}

/**
 * 将格式列表转换为 accept 字符串
 * 优先使用 MIME 类型，以获得更好的浏览器显示效果
 * @param includeExtensions 是否包含扩展名（默认 true，作为后备）
 */
function formatsToAcceptString(formats: string[], includeExtensions: boolean = true): string {
  const mimeTypes = new Set<string>()
  const extensions = new Set<string>()

  for (const format of formats) {
    const formatLower = format.toLowerCase()
    const acceptInfo = formatToAccept[formatLower]

    if (acceptInfo) {
      // 优先使用 MIME 类型（浏览器显示更友好）
      acceptInfo.mimeTypes.forEach((mime) => mimeTypes.add(mime))
      // 扩展名作为后备（某些浏览器可能不支持某些 MIME 类型）
      if (includeExtensions) {
        acceptInfo.extensions.forEach((ext) => extensions.add(ext))
      }
    } else {
      // 如果没有映射，直接使用格式作为扩展名
      if (includeExtensions) {
        extensions.add(`.${format}`)
      }
    }
  }

  // 组合：优先使用 MIME 类型，然后添加扩展名作为后备
  const acceptParts: string[] = []

  // 先添加 MIME 类型（浏览器会显示更友好的名称）
  mimeTypes.forEach((mime) => acceptParts.push(mime))

  // 然后添加扩展名（作为后备，确保兼容性）
  if (includeExtensions) {
    extensions.forEach((ext) => acceptParts.push(ext))
  }

  return acceptParts.join(',')
}

/**
 * 获取支持的文件格式的 accept 字符串（用于文件上传对话框）
 * @param category 文件类型类别，默认为 'all'（所有支持的格式）
 * @returns accept 字符串，例如 "image/*" 或 ".txt,.md,.pdf,..."
 */
export function getSupportedFileAcceptString(category: FileTypeCategory = 'all'): string {
  const formats = getFormatsByCategory(category)

  // 对于特定类别，使用更简洁的 MIME 类型通配符
  if (category === 'image') {
    return 'image/*'
  }

  // 对于"所有格式"，只使用 MIME 类型，不添加扩展名
  // 这样浏览器可能会显示第一个 MIME 类型的名称，而不是"自定义文件"
  if (category === 'all') {
    return formatsToAcceptString(formats, false)
  }

  // 对于其他类别，使用 MIME 类型和扩展名（确保兼容性）
  return formatsToAcceptString(formats, true)
}

/**
 * 获取所有文件类型类别
 */
export function getFileTypeCategories(): FileTypeCategory[] {
  return ['all', 'text', 'document', 'data', 'image', 'web']
}

/** 可作为目录引用内容读取的文本类扩展名 */
const TEXT_EXT_FOR_DIR = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'csv',
  'html',
  'htm',
  'xml',
  'yml',
  'yaml',
  'js',
  'ts',
  'mjs',
  'cjs',
  'vue',
  'css',
  'scss'
])

/**
 * 将目录解析为单个引用（递归读取目录内文本文件并合并）
 * @param dirPath 目录绝对路径
 * @param options maxFiles 最大文件数，maxTotalChars 最大总字符数
 * @returns Reference 的 id 为 "dir:" + dirPath，便于与输入中的 @[dir:path] 匹配
 */
export async function resolveDirectoryToReference(
  dirPath: string,
  options: { maxFiles?: number; maxTotalChars?: number } = {}
): Promise<Reference | null> {
  const { maxFiles = 50, maxTotalChars = 300000 } = options
  if (!messageBridge.getIpc()) return null

  const dirName = dirPath.replace(/[/\\]+$/, '').replace(/^.*[/\\]/, '') || dirPath
  const parts: string[] = []
  let totalChars = 0
  let fileCount = 0

  const queue: Array<{ path: string; depth: number }> = [{ path: dirPath, depth: 0 }]
  const maxDepth = 4

  while (queue.length > 0 && fileCount < maxFiles && totalChars < maxTotalChars) {
    const { path: currentDir, depth } = queue.shift()!
    if (depth >= maxDepth) continue

    try {
      const entries = (await messageBridge.invoke('read-directory', currentDir)) as Array<{
        name: string
        path: string
        isDirectory: boolean
      }>
      for (const e of entries) {
        if (fileCount >= maxFiles || totalChars >= maxTotalChars) break
        if (e.isDirectory) {
          if (!['.git', 'node_modules', '.metadoc'].includes(e.name)) {
            queue.push({ path: e.path, depth: depth + 1 })
          }
        } else {
          const ext = e.name.replace(/^.*\./, '').toLowerCase()
          if (!TEXT_EXT_FOR_DIR.has(ext)) continue
          try {
            const content = (await messageBridge.invoke('read-file-content', e.path)) as
              | string
              | null
            if (content && content.length > 0) {
              const take = Math.min(content.length, maxTotalChars - totalChars)
              parts.push(`### ${e.name}\n\n${content.slice(0, take)}`)
              totalChars += take
              fileCount++
            }
          } catch {
            // skip single file read errors
          }
        }
      }
    } catch {
      // skip single dir read errors
    }
  }

  if (parts.length === 0) return null

  const refId = `dir:${dirPath}`
  return {
    id: refId,
    name: dirName,
    origin: dirPath,
    format: 'txt',
    parsedContent: parts.join('\n\n'),
    description: `目录「${dirName}」下的 ${fileCount} 个文本文件`,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

/**
 * 将文件路径解析为单个引用（仅文本类文件，读取并过滤）
 * @returns Reference 的 id 为原始 filePath，便于与输入中的 @[path] 匹配
 */
export async function resolveFilePathToReference(
  filePath: string,
  options: { maxChars?: number } = {}
): Promise<Reference | null> {
  const { maxChars = 200000 } = options
  if (!messageBridge.getIpc()) return null
  try {
    const content = (await messageBridge.invoke('read-file-content', filePath)) as string | null
    if (!content) return null
    const sliced = content.slice(0, maxChars)
    const filtered = filterTextContent(sliced)
    const name = filePath.replace(/[/\\]+$/, '').replace(/^.*[/\\]/, '') || filePath
    return {
      id: filePath,
      name,
      origin: filePath,
      format: 'txt',
      parsedContent: filtered,
      description: `文件「${name}」内容（最多 ${maxChars} 字符）`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  } catch {
    return null
  }
}

/**
 * 使用主进程文件选择服务选择文件
 * @param category 文件类型类别
 * @param multiple 是否支持多选
 * @param title 对话框标题
 * @returns 选中的文件路径数组，如果取消则返回空数组
 */
export async function selectReferenceFiles(
  category: FileTypeCategory = 'all',
  multiple: boolean = false,
  title?: string
): Promise<string[]> {
  if (!messageBridge.getIpc()) {
    throw new Error('IPC渲染器不可用')
  }

  try {
    const result = (await messageBridge.invoke('select-reference-files', {
      category,
      multiple,
      title
    })) as { canceled: boolean; filePaths: string[] }

    if (result.canceled) {
      return []
    }

    return result.filePaths || []
  } catch (error) {
    getLogger().error('文件选择失败:', error)
    throw error
  }
}
