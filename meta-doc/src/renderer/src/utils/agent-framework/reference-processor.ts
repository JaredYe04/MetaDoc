/**
 * Reference处理器
 * 处理文件上传、URL下载和内容解析
 */

import { createRendererLogger } from '../logger'
import localIpcRenderer from '../web-adapter/local-ipc-renderer'
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

// 获取IPC渲染器
let ipcRenderer: typeof localIpcRenderer | null = null
if (typeof window !== 'undefined') {
  if ((window as any).electron?.ipcRenderer) {
    ipcRenderer = (window as any).electron.ipcRenderer
  } else {
    webMainCalls()
    ipcRenderer = localIpcRenderer
  }
}

/**
 * 生成唯一的requestId
 */
function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 处理文件上传
 * @param file 文件对象
 * @param abortSignal 可选的AbortSignal，用于取消操作
 * @param requestId 可选的requestId，用于取消主进程任务
 */
export async function processFileUpload(file: File, abortSignal?: AbortSignal, requestId?: string): Promise<Reference> {
  const filename = file.name
  const format = referenceAdapterManager.inferFormatFromFilename(filename)
  
  // 使用任务管理器注册任务，确保有明确的结束逻辑
  const { handle, promise } = registerTask(async (handle) => {
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
      if (format === 'txt' || format === 'md' || format === 'json' || format === 'text' || format === 'markdown' || format === 'csv') {
        handle.mark(30, {
          message: 'agent.reference.progress.parsingFile',
          subMessage: 'agent.reference.progress.extractingText',
          params: { filename }
        })
        if (format === 'csv') {
          getLogger().info(`[processFileUpload] 开始解析CSV文件: ${filename}`)
          const text = await withCancellation(file.text())
          parsedContent = await withCancellation(referenceAdapterManager.parse(text, format))
        } else {
          parsedContent = await withCancellation(file.text())
        }
      } else if (format === 'jpg' || format === 'jpeg' || format === 'png' || format === 'gif' || format === 'bmp' || format === 'webp' || format === 'image') {
        getLogger().info(`[processFileUpload] 开始OCR识别图片: ${filename}`)
        handle.setSegment(80, {
          message: 'agent.reference.progress.parsingImage',
          subMessage: 'agent.reference.progress.ocrRecognizing',
          params: { filename }
        })
        
        if (ipcRenderer) {
          // 如果已取消，立即中断，不执行后续操作
          throwIfCancelled()
          filePath = await withCancellation(ipcRenderer.invoke('save-reference-file', {
            filename,
            content: arrayBufferToBase64(arrayBuffer)
          }) as Promise<string>)
          handle.updateSegmentProgress(1, 2, {
            message: 'agent.reference.progress.parsingImage',
            subMessage: 'agent.reference.progress.ocrRecognizing',
            params: { filename }
          })
          throwIfCancelled()
          parsedContent = await withCancellation(referenceAdapterManager.parse(filePath, format))
        } else {
          throwIfCancelled()
          parsedContent = await withCancellation(referenceAdapterManager.parse(arrayBuffer, format))
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
        
        if (ipcRenderer) {
          try {
            throwIfCancelled()
            filePath = await withCancellation(ipcRenderer.invoke('save-reference-file', {
              filename,
              content: arrayBufferToBase64(arrayBuffer)
            }) as Promise<string>)
            handle.mark(40, {
              message: 'agent.reference.progress.parsingFile',
              subMessage: 'agent.reference.progress.extractingText',
              params: { filename }
            })
            throwIfCancelled()
            parsedContent = await withCancellation(referenceAdapterManager.parse(filePath, format))
          } catch (error) {
            getLogger().error('保存文件失败:', error)
            throw new Error(`保存文件失败: ${error instanceof Error ? error.message : String(error)}`)
          }
        } else {
          if (format === 'pdf' || format === 'docx' || format === 'pptx') {
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
    
    getLogger().info(`[processFileUpload] Reference对象创建完成`, {
      id: reference.id,
      name: reference.name,
      format: reference.format,
      hasParsedContent: !!reference.parsedContent,
      parsedContentLength: reference.parsedContent?.length || 0,
      parsedContentPreview: reference.parsedContent?.substring(0, 200) || '无内容'
    })
    
    return reference
  }, {
    name: `处理文件上传: ${filename}`,
    requestId,
    onCancel: async (reqId) => {
      // 通知主进程取消文件转换任务
      if (ipcRenderer && requestId) {
        try {
          await ipcRenderer.invoke('cancel-file-conversion', reqId)
        } catch (err) {
          getLogger().warn('取消主进程任务失败:', err)
        }
      }
    }
  })
  
  return promise
}

/**
 * 处理URL引用
 */
export async function processUrlReference(url: string, abortSignal?: AbortSignal): Promise<Reference> {
  // 使用任务管理器注册任务
  const { handle, promise } = registerTask(async (handle) => {
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
  
  let content: string
  let filePath: string | undefined
  
  try {
    if (isHtml) {
      handle.setSegment(50, {
        message: 'agent.reference.progress.downloadingWebpage',
        subMessage: '连接服务器...',
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
        subMessage: 'agent.reference.progress.downloading',
      })
      if (response.status >= 200 && response.status < 300) {
        content = response.data
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
    } else {
      handle.setSegment(70, {
        message: 'agent.reference.progress.downloadingFile',
        subMessage: '连接服务器...',
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
              subMessage: `已下载 ${percent}%`,
            })
          }
        }
      })
      
      if (response.status >= 200 && response.status < 300) {
        const arrayBuffer = response.data as ArrayBuffer
        if (ipcRenderer) {
          const pathname = urlObj.pathname
          const lastSlash = pathname.lastIndexOf('/')
          const filename = lastSlash >= 0 ? pathname.substring(lastSlash + 1) : `download-${Date.now()}`
          const finalFilename = filename || `download-${Date.now()}`
          
          throwIfCancelled()
          filePath = await withCancellation(ipcRenderer.invoke('save-reference-file', {
            filename: finalFilename,
            content: arrayBufferToBase64(arrayBuffer)
          }) as Promise<string>)
          
          getLogger().info(`URL文件已保存到临时目录: ${filePath}`)
        } else {
          content = new TextDecoder('utf-8').decode(arrayBuffer)
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
    }
  } catch (error) {
    if (signal.aborted || (error instanceof Error && (error.name === 'CanceledError' || error.message.includes('canceled')))) {
      throw new Error('操作已取消')
    }
    
    getLogger().error('下载URL内容失败:', error)
    throw new Error(`下载URL失败: ${error instanceof Error ? error.message : String(error)}`)
  }
  
  throwIfCancelled()
  
  handle.mark(85, {
    message: 'agent.reference.progress.parsingContent',
    subMessage: 'agent.reference.progress.extractingText',
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
  
  return reference
  }, {
    name: `处理URL引用: ${url}`,
    onCancel: async () => {
      // URL下载的取消由axios的signal处理，无需额外操作
    }
  })
  
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
    name: name || `文档引用${startLine !== undefined && endLine !== undefined ? ` (${startLine}-${endLine}行)` : ''}`,
    origin: name || '当前文档',
    format: 'txt',
    parsedContent: filteredContent,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

