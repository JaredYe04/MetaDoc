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
 * 处理文件上传
 */
export async function processFileUpload(file: File): Promise<Reference> {
  const fileId = `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const filename = file.name
  const format = referenceAdapterManager.inferFormatFromFilename(filename)
  
  // 读取文件内容并立即解析
  const arrayBuffer = await file.arrayBuffer()
  let parsedContent: string
  let filePath: string | undefined
  
  try {
    // 先解析内容（在上传时就解析）
    // 纯文本格式（包括CSV），直接读取并解析
    if (format === 'txt' || format === 'md' || format === 'json' || format === 'text' || format === 'markdown' || format === 'csv') {
      // 纯文本格式，直接读取
      if (format === 'csv') {
        // CSV需要数据分析，使用适配器解析
        getLogger().info(`[processFileUpload] 开始解析CSV文件: ${filename}`)
        const text = await file.text()
        getLogger().info(`[processFileUpload] CSV文件读取完成，长度: ${text.length}`)
        parsedContent = await referenceAdapterManager.parse(text, format)
        getLogger().info(`[processFileUpload] CSV文件解析完成，parsedContent长度: ${parsedContent?.length || 0}`)
      } else {
        // 其他纯文本格式，直接读取
        parsedContent = await file.text()
      }
    } else {
      // 其他格式（PDF、Word、PPTX等），需要适配器解析
      // 如果是Electron环境，先保存到临时目录再解析
      if (ipcRenderer) {
        try {
          // 通过主进程保存到临时目录
          filePath = await ipcRenderer.invoke('save-reference-file', {
            filename,
            content: arrayBufferToBase64(arrayBuffer)
          }) as string
          
          getLogger().info(`文件已保存到临时目录: ${filePath}`)
          
          // 从文件路径解析
          parsedContent = await referenceAdapterManager.parse(filePath, format)
        } catch (error) {
          getLogger().error('保存文件失败:', error)
          throw new Error(`保存文件失败: ${error instanceof Error ? error.message : String(error)}`)
        }
      } else {
        // Web环境，直接解析ArrayBuffer
        // 对于需要文件路径的格式（如PDF、Word），在Web环境中无法解析
        if (format === 'pdf' || format === 'docx' || format === 'pptx') {
          throw new Error(`格式 ${format} 在Web环境中需要Electron环境支持`)
        }
        
        // 对于其他格式，尝试直接解析
        const text = new TextDecoder('utf-8').decode(arrayBuffer)
        parsedContent = await referenceAdapterManager.parse(text, format)
      }
    }
  } catch (error) {
    getLogger().error('解析文件内容失败:', error)
    throw new Error(`解析文件失败: ${error instanceof Error ? error.message : String(error)}`)
  }
  
  // 过滤无意义文本和meta-info标记
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
}

/**
 * 处理URL引用
 */
export async function processUrlReference(url: string): Promise<Reference> {
  const refId = `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  // 验证URL格式
  let urlObj: URL
  try {
    urlObj = new URL(url)
  } catch {
    throw new Error('无效的URL格式')
  }
  
  // 判断是否为普通网页（HTML）
  const format = referenceAdapterManager.inferFormatFromUrl(url)
  const isHtml = format === 'html' || format === 'htm'
  
  let content: string
  let filePath: string | undefined
  
  try {
    // 下载内容
    if (isHtml) {
      // HTML内容，使用web-crawler-tool的逻辑
      const response = await axios.get(url, {
        timeout: 30000,
        responseType: 'text',
        validateStatus: () => true
      })
      
      if (response.status >= 200 && response.status < 300) {
        content = response.data
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
    } else {
      // 其他格式，下载文件
      const response = await axios.get(url, {
        timeout: 60000,
        responseType: 'arraybuffer',
        validateStatus: () => true
      })
      
      if (response.status >= 200 && response.status < 300) {
        const arrayBuffer = response.data as ArrayBuffer
        
        // 保存到临时目录
        if (ipcRenderer) {
          // 从URL路径提取文件名
          const pathname = urlObj.pathname
          const lastSlash = pathname.lastIndexOf('/')
          const filename = lastSlash >= 0 ? pathname.substring(lastSlash + 1) : `download-${Date.now()}`
          const finalFilename = filename || `download-${Date.now()}`
          
          filePath = await ipcRenderer.invoke('save-reference-file', {
            filename: finalFilename,
            content: arrayBufferToBase64(arrayBuffer)
          }) as string
          
          getLogger().info(`URL文件已保存到临时目录: ${filePath}`)
        } else {
          // Web环境，无法保存文件，直接转换为文本
          content = new TextDecoder('utf-8').decode(arrayBuffer)
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
    }
  } catch (error) {
    getLogger().error('下载URL内容失败:', error)
    throw new Error(`下载URL失败: ${error instanceof Error ? error.message : String(error)}`)
  }
  
  // 解析内容
  let parsedContent: string
  try {
    if (isHtml) {
      // HTML内容，使用HTML适配器解析
      parsedContent = await referenceAdapterManager.parse(content!, 'html')
    } else if (filePath) {
      // 从文件路径解析
      parsedContent = await referenceAdapterManager.parse(filePath, format)
    } else {
      // Web环境，直接解析内容
      parsedContent = await referenceAdapterManager.parse(content!, format)
    }
  } catch (error) {
    getLogger().error('解析URL内容失败:', error)
    throw new Error(`解析内容失败: ${error instanceof Error ? error.message : String(error)}`)
  }
  
  // 过滤无意义文本和meta-info标记
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

