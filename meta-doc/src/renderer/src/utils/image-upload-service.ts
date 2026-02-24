/**
 * 图片上传服务
 * 统一处理图片上传逻辑，根据配置决定上传方式和路径处理
 */

import { getSetting } from './settings.js'
import { getImagePath } from './settings.js'
import { dirname, relative as pathRelative, join } from './path-utils.js'
import { createRendererLogger } from './logger'

// 懒加载logger，避免初始化顺序问题
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null
function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('ImageUploadService')
  }
  return loggerInstance
}

export interface ImageUploadResult {
  success: boolean
  imagePath?: string // 返回的图片路径（可能是相对路径或绝对路径）
  error?: string
}

export interface ImageUploadOptions {
  file?: File | Blob // 文件对象
  url?: string // 图片URL（用于网络图片或本地路径）
  documentPath?: string // 文档路径，用于计算相对路径
  fileName?: string // 文件名（可选）
}

/**
 * 判断路径是否为绝对路径
 */
function isAbsolutePath(url: string): boolean {
  // Windows路径: C:\... 或 D:\... 等
  // Unix路径: /... 或 ~/... 等
  return /^[A-Za-z]:\\|^\/|^~/.test(url)
}

/**
 * 判断路径是否为本地路径
 */
function isLocalPath(url: string): boolean {
  return isAbsolutePath(url) && !url.startsWith('http://') && !url.startsWith('https://')
}

/**
 * 判断路径是否为网络路径
 */
function isNetworkPath(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

/**
 * 转义URL中的特殊字符
 */
function escapeImageUrl(url: string): string {
  // 只转义路径部分，保留协议和域名
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const urlObj = new URL(url)
      const pathname = encodeURIComponent(urlObj.pathname).replace(/%2F/g, '/')
      return `${urlObj.protocol}//${urlObj.host}${pathname}${urlObj.search}${urlObj.hash}`
    } else {
      // 本地路径：转义特殊字符
      return url.replace(/([#%&{}_])/g, (match) => {
        return encodeURIComponent(match)
      })
    }
  } catch (e) {
    // 如果URL解析失败，直接转义整个字符串
    return encodeURIComponent(url)
  }
}

/**
 * 获取文档所在目录
 */
function getDocumentDir(documentPath?: string): string | null {
  if (!documentPath) return null
  try {
    return dirname(documentPath)
  } catch (e) {
    return null
  }
}

/**
 * 计算相对路径
 */
function getRelativePath(imagePath: string, documentPath?: string): string | null {
  if (!documentPath) return null
  try {
    const docDir = dirname(documentPath)

    // 检查是否跨盘符（Windows）
    const imageDrive = imagePath.match(/^([A-Za-z]):/)?.[1]
    const docDrive = docDir.match(/^([A-Za-z]):/)?.[1]
    if (imageDrive && docDrive && imageDrive !== docDrive) {
      // 跨盘符，无法计算相对路径
      return null
    }

    const relative = pathRelative(docDir, imagePath)
    // 统一使用正斜杠（跨平台兼容）
    // 如果 relative 包含盘符（说明计算失败），返回 null
    if (relative && /^[A-Za-z]:/.test(relative)) {
      return null
    }
    return relative ? relative.replace(/\\/g, '/') : null
  } catch (e) {
    return null
  }
}

/**
 * 规范化相对路径（确保格式正确）
 * 强制添加 ./ 前缀
 */
function normalizeRelativePath(relativePath: string): string {
  // 移除开头的 ./
  let normalized = relativePath.replace(/^\.\//, '')

  // 强制添加 ./ 前缀
  if (!normalized.startsWith('./')) {
    normalized = './' + normalized
  }

  // 统一使用正斜杠
  normalized = normalized.replace(/\\/g, '/')

  return normalized
}

/**
 * 使用本地服务上传图片
 */
async function uploadToLocalService(
  options: ImageUploadOptions,
  config: any
): Promise<ImageUploadResult> {
  try {
    const logger = getLogger()

    // 确定目标保存目录
    let targetDir: string | null = null
    let useRelativePath = false

    // 根据action决定保存位置
    // 如果 action 是 'none' 或未设置，fallback 到 'upload'
    const action = config.action === 'none' || !config.action ? 'upload' : config.action

    if (action === 'saveToDocumentDir' || action === 'saveToAssetsDir') {
      // 这两个选项必须保存到文档目录，且必须使用本地服务
      if (options.documentPath) {
        const docDir = getDocumentDir(options.documentPath)
        if (docDir && isAbsolutePath(docDir)) {
          if (action === 'saveToDocumentDir') {
            // 保存在文档同目录
            targetDir = docDir
            useRelativePath = true
          } else if (action === 'saveToAssetsDir') {
            // 保存在文档目录/assets/下
            targetDir = join(docDir, 'assets')
            useRelativePath = true
          }
        }
      }

      // 如果是新文档（未保存），回退到本地图片目录，使用绝对路径
      if (!targetDir) {
        targetDir = config.localImageDir || (await getImagePath())
        useRelativePath = false
      }
    } else {
      // action === 'upload'（默认行为），上传到本地图片目录，使用绝对路径
      targetDir = config.localImageDir || (await getImagePath())
      useRelativePath = false
    }

    // 确保目录是绝对路径（multer需要绝对路径）
    if (targetDir && !isAbsolutePath(targetDir)) {
      // 如果是相对路径，尝试解析为绝对路径
      // 这通常不应该发生，但保险起见
      logger.warn('目标目录是相对路径，尝试解析', { targetDir })
    }

    let imagePath: string

    if (options.file) {
      // 文件上传
      const formData = new FormData()
      const fileName =
        options.fileName ||
        `image-${Date.now()}.${(options.file as File).name?.split('.').pop() || 'png'}`
      formData.append('file[]', options.file, fileName)

      // 如果指定了目标目录，通过查询参数传递
      const baseUrl = await import('../config/runtime-server').then((m) =>
        m.getRuntimeServerBaseUrl()
      )
      const uploadUrl = targetDir
        ? `${baseUrl}/api/image/upload?targetDir=${encodeURIComponent(targetDir)}`
        : `${baseUrl}/api/image/upload`

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`)
      }

      const result = await response.json()
      if (result.code === 0 && result.data && result.data.succMap) {
        const filePaths = result.data.succMap
        imagePath = Object.values(filePaths)[0] as string
      } else {
        throw new Error(result.msg || 'Upload failed')
      }
    } else if (options.url) {
      // URL上传（网络图片或本地路径）
      const requestBody: any = { url: options.url }
      if (targetDir) {
        requestBody.targetDir = targetDir
      }

      const baseUrl = await import('../config/runtime-server').then((m) =>
        m.getRuntimeServerBaseUrl()
      )
      const response = await fetch(`${baseUrl}/api/image/url-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        if (response.status === 404) {
          // 文件不存在，返回原路径
          return {
            success: false,
            error: 'File not found',
            imagePath: options.url
          }
        }
        throw new Error(`Upload failed: ${response.status}`)
      }

      const result = await response.json()
      if (result.code === 0 && result.data && result.data.url) {
        imagePath = result.data.url
      } else {
        throw new Error(result.msg || 'Upload failed')
      }
    } else {
      throw new Error('No file or URL provided')
    }

    // 处理路径格式
    let finalPath = imagePath

    // 如果使用相对路径且文档路径存在，且 action 是 saveToDocumentDir 或 saveToAssetsDir
    if (
      useRelativePath &&
      options.documentPath &&
      (action === 'saveToDocumentDir' || action === 'saveToAssetsDir')
    ) {
      const relativePath = getRelativePath(imagePath, options.documentPath)
      if (relativePath) {
        // 规范化相对路径（强制添加./）
        finalPath = normalizeRelativePath(relativePath)
      } else {
        // 如果无法计算相对路径，使用绝对路径
        logger.warn('无法计算相对路径，使用绝对路径', {
          imagePath,
          documentPath: options.documentPath
        })
        // 统一使用正斜杠（跨平台兼容）
        finalPath = imagePath.replace(/\\/g, '/')
      }
    } else {
      // 使用绝对路径（新文档或未保存的文档，或 action === 'upload'）
      // 统一使用正斜杠（跨平台兼容）
      finalPath = imagePath.replace(/\\/g, '/')
    }

    // 如果启用"自动转义图片URL"（仅对非网络URL）
    if (config.autoEscapeImageUrl && !isNetworkPath(finalPath)) {
      finalPath = escapeImageUrl(finalPath)
    }

    return {
      success: true,
      imagePath: finalPath
    }
  } catch (error) {
    const logger = getLogger()
    logger.error('Local upload failed', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * 使用自定义API上传图片
 */
async function uploadToCustomAPI(
  options: ImageUploadOptions,
  config: any
): Promise<ImageUploadResult> {
  try {
    if (!config.customUploadApiUrl) {
      throw new Error('Custom upload API URL not configured')
    }

    if (!options.file) {
      throw new Error('Custom API only supports file upload')
    }

    const formData = new FormData()
    const fileName =
      options.fileName ||
      `image-${Date.now()}.${(options.file as File).name?.split('.').pop() || 'png'}`
    formData.append(config.customUploadApiFieldName || 'file', options.file, fileName)

    const response = await fetch(config.customUploadApiUrl, {
      method: config.customUploadApiMethod || 'POST',
      body: formData
    })

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`)
    }

    const result = await response.json()
    // 假设API返回格式为 { url: string } 或 { data: { url: string } }
    const imageUrl = result.url || result.data?.url || result.imageUrl || result.data?.imageUrl

    if (!imageUrl) {
      throw new Error('Invalid response format from upload API')
    }

    // 自定义API返回的通常是网络URL，直接使用
    let finalPath = imageUrl

    // 如果启用"自动转义图片URL"（仅对非网络URL）
    if (config.autoEscapeImageUrl && !isNetworkPath(finalPath)) {
      finalPath = escapeImageUrl(finalPath)
    }

    return {
      success: true,
      imagePath: finalPath
    }
  } catch (error) {
    const logger = getLogger()
    logger.error('Custom API upload failed', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * 处理图片上传
 * 根据配置决定是否上传、使用哪个服务、如何处理路径
 */
export async function uploadImage(options: ImageUploadOptions): Promise<ImageUploadResult> {
  const config = await getSetting('imageUpload')
  if (!config) {
    // 如果没有配置，使用默认行为（本地服务上传）
    return uploadToLocalService(options, {
      action: 'upload',
      uploadService: 'local',
      autoEscapeImageUrl: true,
      localImageDir: ''
    })
  }

  if (options.url && isNetworkPath(options.url)) {
    if (config.keepNetworkImageUrl) {
      // 保留网络图片URL，不下载，直接返回原URL
      return {
        success: true,
        imagePath: options.url
      }
    }
    // 继续处理，将网络图片下载并保存
  }

  // 根据action决定操作
  // 如果 action 是 'none' 或未设置，fallback 到 'upload'
  const action = config.action === 'none' || !config.action ? 'upload' : config.action

  // 根据上传服务选择处理方式
  // 注意：uploadService 只能是 'local' 或 'custom'，不再有 'none' 选项
  if (config.uploadService === 'custom') {
    return uploadToCustomAPI(options, config)
  }

  // 默认使用本地服务
  return uploadToLocalService(options, config)
}

/**
 * 处理图片路径（用于已存在的图片路径）
 * 根据配置决定是否转换路径格式（相对路径、URL转义等）
 */
export async function processImagePath(imagePath: string, documentPath?: string): Promise<string> {
  const config = await getSetting('imageUpload')
  if (!config) {
    return imagePath
  }

  // 如果是网络路径，不处理
  if (isNetworkPath(imagePath)) {
    return imagePath
  }

  let finalPath = imagePath

  // 如果 action 是 'none' 或未设置，fallback 到 'upload'
  const action = config.action === 'none' || !config.action ? 'upload' : config.action

  // 只有在 action === 'saveToDocumentDir' 或 'saveToAssetsDir' 时，才转换为相对路径
  // 因为这两个选项明确要求使用相对路径
  if ((action === 'saveToDocumentDir' || action === 'saveToAssetsDir') && documentPath) {
    const relativePath = getRelativePath(imagePath, documentPath)
    if (relativePath) {
      // 规范化相对路径（强制添加./）
      finalPath = normalizeRelativePath(relativePath)
    }
  } else {
    // 其他情况（action === 'upload'），统一使用正斜杠（跨平台兼容）
    finalPath = imagePath.replace(/\\/g, '/')
  }

  // 如果启用"自动转义图片URL"（仅对非网络URL）
  if (config.autoEscapeImageUrl && !isNetworkPath(finalPath)) {
    finalPath = escapeImageUrl(finalPath)
  }

  return finalPath
}
