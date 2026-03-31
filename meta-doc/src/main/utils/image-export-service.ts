/**
 * 图片导出服务（Main 进程）
 * 负责将图片和 PDF 文件保存到导出文件夹
 * 注意：虽然名称是 image-export-service，但实际上可以处理任何文件类型，包括 PDF
 */

import fs from 'fs'
import path from 'path'
import http from 'http'
import { createMainLogger } from '../logger'
import { imageUploadDir } from '../express-server'
import { getRuntimeServerBaseUrl } from '../runtime-server-config'

const logger = createMainLogger('ImageExportService')

export interface ImageExportResult {
  originalUrl: string
  savedPath: string
  relativePath: string
}

export interface SaveImageToFolderOptions {
  /** 将冷门格式（avif/webp）转为 PNG 的回调，用于 LaTeX/DOCX 等只支持常见格式的场景 */
  convertToPng?: (buffer: Buffer, mime: string) => Promise<Buffer>
}

/**
 * 将图片或 PDF 文件保存到指定文件夹
 * @param imageUrl - 图片或 PDF 文件 URL（运行时服务器 /images/filename 或本地路径）
 * @param targetFolder - 目标文件夹路径
 * @param imageName - 文件名（可选，如果不提供则从 URL 提取）
 * @param options - 可选，如 convertToPng 用于将 avif/webp 转为 PNG
 * @returns 保存结果
 */
export async function saveImageToFolder(
  imageUrl: string,
  targetFolder: string,
  imageName?: string,
  options?: SaveImageToFolderOptions
): Promise<ImageExportResult> {
  try {
    // 首先清理路径：移除任何 LaTeX 命令（如 \detokenize）
    // 这必须在函数开始时就处理，确保后续所有操作都使用清理后的路径
    let cleanedImageUrl = imageUrl
    if (cleanedImageUrl.includes('\\detokenize')) {
      // 方式1：标准匹配（完整格式）
      cleanedImageUrl = cleanedImageUrl.replace(/\\detokenize\{([^}]+)\}/g, '$1')
      // 方式2：处理不完整的情况（缺少闭合括号）
      cleanedImageUrl = cleanedImageUrl.replace(/\\detokenize\{([^}]*)/g, '$1')
      // 方式3：移除任何残留的 \detokenize 关键字
      if (cleanedImageUrl.includes('\\detokenize')) {
        cleanedImageUrl = cleanedImageUrl.replace(/\\detokenize/g, '')
        // 移除可能残留的大括号
        cleanedImageUrl = cleanedImageUrl.replace(/^\{+/, '').replace(/\}+$/, '')
      }
      logger.debug(`清理 imageUrl: ${imageUrl} -> ${cleanedImageUrl}`)
    }
    imageUrl = cleanedImageUrl // 使用清理后的路径

    // 确保目标文件夹存在
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true })
    }

    // 从 URL 提取文件名
    let fileName = imageName
    if (!fileName) {
      const imagesPrefix = getRuntimeServerBaseUrl() + '/images/'
      if (imageUrl.startsWith(imagesPrefix)) {
        fileName = imageUrl.replace(imagesPrefix, '')
      } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        // 网络图片：从URL路径中提取文件名
        try {
          const urlObj = new URL(imageUrl)
          fileName = path.basename(urlObj.pathname)
          // 如果没有扩展名，尝试从Content-Type推断
          if (!path.extname(fileName)) {
            // 这里我们会在下载时处理扩展名
            fileName = `image_${Date.now()}`
          }
        } catch {
          fileName = `image_${Date.now()}`
        }
      } else if (imageUrl.startsWith('file://')) {
        // file:// 协议：提取路径并获取文件名
        let filePath = imageUrl.replace(/^file:\/\//, '')
        // Windows 路径处理：file:///C:/path -> C:/path
        if (filePath.startsWith('/') && /^\/[A-Za-z]:/.test(filePath)) {
          filePath = filePath.substring(1)
        }
        // 解码 URL 编码的路径
        try {
          filePath = decodeURIComponent(filePath)
        } catch {
          // 如果解码失败，使用原始路径
        }
        fileName = path.basename(filePath)
      } else {
        fileName = path.basename(imageUrl)
      }
    }

    // 清理文件名（移除非法字符）
    fileName = sanitizeFileName(fileName)

    // 尝试从本地文件系统读取或下载
    let imageBuffer: Buffer | null = null

    // 首先尝试从本地文件系统读取
    const imagesPrefix = getRuntimeServerBaseUrl() + '/images/'
    if (imageUrl.startsWith(imagesPrefix)) {
      // 运行时服务器 images URL：从 imageUploadDir 读取
      const localFileName = imageUrl.replace(imagesPrefix, '')
      const localPath = path.join(imageUploadDir, localFileName)

      if (fs.existsSync(localPath)) {
        imageBuffer = fs.readFileSync(localPath)
        logger.debug(`从本地文件系统读取图片: ${localPath}`)
      }
    } else if (imageUrl.startsWith('file://')) {
      // file:// 协议：直接读取文件
      try {
        let filePath = imageUrl.replace(/^file:\/\//, '')
        // Windows 路径处理：file:///C:/path -> C:/path
        // Unix 路径处理：file:///path -> /path
        if (filePath.startsWith('/') && /^\/[A-Za-z]:/.test(filePath)) {
          // Windows: file:///C:/path -> C:/path
          filePath = filePath.substring(1)
        }
        // 解码 URL 编码的路径
        try {
          filePath = decodeURIComponent(filePath)
        } catch {
          // 如果解码失败，使用原始路径
        }
        if (fs.existsSync(filePath)) {
          imageBuffer = fs.readFileSync(filePath)
          logger.debug(`从文件系统读取图片: ${filePath}`)
        }
      } catch (error) {
        logger.warn(`读取 file:// 图片失败: ${imageUrl}`, error)
      }
    } else if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      // 本地路径（不是 URL）：直接读取文件
      // 首先清理路径：移除任何 LaTeX 命令（如 \detokenize）
      let cleanedUrl = imageUrl
      if (cleanedUrl.includes('\\detokenize')) {
        const detokenizeMatch = cleanedUrl.match(/\\detokenize\{([^}]+)\}/)
        if (detokenizeMatch) {
          cleanedUrl = detokenizeMatch[1]
        } else {
          // 如果匹配失败，尝试全局替换
          cleanedUrl = cleanedUrl.replace(/\\detokenize\{([^}]+)\}/g, '$1')
        }
      }

      try {
        // 尝试解码 URL 编码的路径
        let filePath = cleanedUrl
        try {
          filePath = decodeURIComponent(filePath)
        } catch {
          // 如果解码失败，使用原始路径
        }

        // 规范化路径（处理 Windows 路径分隔符等）
        filePath = path.normalize(filePath)

        if (fs.existsSync(filePath)) {
          imageBuffer = fs.readFileSync(filePath)
          logger.debug(`从本地路径读取图片: ${filePath}`)
        } else {
          logger.warn(`本地图片文件不存在: ${filePath}`)
        }
      } catch (error) {
        logger.warn(`读取本地路径图片失败: ${imageUrl}`, error)
      }
    }

    // 如果本地文件不存在，尝试通过 HTTP/HTTPS 下载（包括网络图片和运行时服务器 URL）
    if (!imageBuffer) {
      // 只对 HTTP/HTTPS URL 进行下载
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        try {
          imageBuffer = await downloadImage(imageUrl)
          logger.debug(`通过 HTTP/HTTPS 下载图片: ${imageUrl}`)
        } catch (error) {
          logger.error(`下载图片失败: ${imageUrl}`, error)
          throw new Error(`无法获取图片: ${imageUrl}`)
        }
      } else {
        // 如果不是 HTTP/HTTPS URL 且本地文件不存在，抛出错误
        throw new Error(`无法找到图片文件: ${imageUrl}`)
      }
    }

    // 冷门格式（avif/webp）转为 PNG，便于 LaTeX/html-to-docx 等使用
    let targetPath = path.join(targetFolder, fileName)
    const mime = inferImageMimeType(imageUrl, undefined)
    if (options?.convertToPng && (mime === 'image/avif' || mime === 'image/webp')) {
      try {
        imageBuffer = await options.convertToPng(imageBuffer, mime)
        fileName = fileName.replace(/\.[^.]+$/, '') + '.png'
        targetPath = path.join(targetFolder, fileName)
      } catch (e) {
        logger.warn(`avif/webp 转 PNG 失败，按原格式保存: ${imageUrl}`, e)
      }
    }

    // 保存文件
    fs.writeFileSync(targetPath, imageBuffer)
    logger.info(`图片已保存到: ${targetPath}`)

    // 返回绝对路径
    const absolutePath = path.resolve(targetPath)

    return {
      originalUrl: imageUrl,
      savedPath: targetPath,
      relativePath: absolutePath // 使用绝对路径
    }
  } catch (error) {
    logger.error(`保存图片失败: ${imageUrl}`, error)
    throw error
  }
}

/**
 * 批量保存图片到文件夹
 * @param options.convertToPng - 可选，将 avif/webp 转为 PNG（需由调用方传入依赖 renderer 的转换器）
 */
export async function saveImagesToFolder(
  imageUrls: string[],
  targetFolder: string,
  options?: SaveImageToFolderOptions
): Promise<ImageExportResult[]> {
  const results: ImageExportResult[] = []

  for (const url of imageUrls) {
    try {
      const result = await saveImageToFolder(url, targetFolder, undefined, options)
      results.push(result)
    } catch (error) {
      logger.error(`保存图片失败: ${url}`, error)
      // 继续处理其他图片，不抛出错误
      // 这样即使某些图片保存失败，其他图片仍然可以保存
    }
  }

  return results
}

/**
 * 通过 HTTP/HTTPS 下载图片
 */
function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const https = require('https')
    const protocol = url.startsWith('https') ? https : http

    protocol
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`))
          return
        }

        const chunks: Buffer[] = []
        response.on('data', (chunk) => {
          chunks.push(chunk)
        })
        response.on('end', () => {
          resolve(Buffer.concat(chunks))
        })
        response.on('error', (error) => {
          reject(error)
        })
      })
      .on('error', (error) => {
        reject(error)
      })
  })
}

/** 根据 URL 路径或 Content-Type 推断图片 MIME 类型 */
function inferImageMimeType(url: string, contentTypeHeader: string | undefined): string {
  if (contentTypeHeader) {
    const main = contentTypeHeader.split(';')[0].trim().toLowerCase()
    if (main.startsWith('image/')) return main
  }
  const lower = url.split('?')[0].toLowerCase()
  if (lower.endsWith('.avif')) return 'image/avif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return 'image/png'
}

/**
 * 通过 HTTP/HTTPS 下载网络图片并返回 data URL（用于 DOCX 等导出内嵌）
 * 主进程无 CORS 限制，可可靠下载渲染进程 fetch 可能失败的远程图片
 */
export function downloadImageAsDataUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const https = require('https') as typeof import('https')
    const protocol = url.startsWith('https') ? https : http

    protocol
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`))
          return
        }
        const contentType = response.headers['content-type']
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          const buffer = Buffer.concat(chunks)
          const mime = inferImageMimeType(url, contentType)
          const base64 = buffer.toString('base64')
          resolve(`data:${mime};base64,${base64}`)
        })
        response.on('error', (error) => reject(error))
      })
      .on('error', (error) => reject(error))
  })
}

/**
 * 清理文件名，移除非法字符
 */
function sanitizeFileName(fileName: string): string {
  // 移除 Windows 不允许的字符
  return fileName
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .trim()
}

/**
 * 更新 Markdown 中的图片链接
 * @param markdown - 原始 Markdown
 * @param imageMappings - 图片 URL 到绝对路径的映射
 * @returns 更新后的 Markdown
 */
export function updateMarkdownImageLinks(
  markdown: string,
  imageMappings: Map<string, string>
): string {
  let updated = markdown
  const regex = /!\[.*?\]\((.*?)\)/g

  updated = updated.replace(regex, (match, imageUrl) => {
    const absolutePath = imageMappings.get(imageUrl)
    if (absolutePath) {
      // 使用绝对路径，转换为 file:// 协议格式
      // Windows: file:///C:/path/to/file
      // Unix: file:///path/to/file
      const normalizedPath = path.resolve(absolutePath).replace(/\\/g, '/')
      // 确保路径以 / 开头（Windows 的 C: 会被转换为 /C:）
      const fileUrl = normalizedPath.startsWith('/')
        ? `file://${normalizedPath}`
        : `file:///${normalizedPath}`
      return match.replace(imageUrl, fileUrl)
    }
    return match
  })

  return updated
}

/**
 * 更新 HTML 中的图片链接
 * @param html - 原始 HTML
 * @param imageMappings - 图片 URL 到路径的映射（可以是绝对路径或相对路径）
 * @returns 更新后的 HTML
 */
export function updateHtmlImageLinks(html: string, imageMappings: Map<string, string>): string {
  let updated = html
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi

  updated = updated.replace(imgRegex, (match, src) => {
    const imagePath = imageMappings.get(src)
    if (imagePath) {
      // 检查是否是相对路径（不以 / 开头，且不是 file:// 或 http:// 开头）
      if (
        !imagePath.startsWith('/') &&
        !imagePath.startsWith('file://') &&
        !imagePath.startsWith('http://') &&
        !imagePath.startsWith('https://') &&
        !imagePath.startsWith('data:')
      ) {
        // 相对路径：直接使用
        return match.replace(src, imagePath)
      } else {
        // 绝对路径：转换为 file:// 协议格式
        // Windows: file:///C:/path/to/file
        // Unix: file:///path/to/file
        const normalizedPath = path.resolve(imagePath).replace(/\\/g, '/')
        // 确保路径以 / 开头（Windows 的 C: 会被转换为 /C:）
        const fileUrl = normalizedPath.startsWith('/')
          ? `file://${normalizedPath}`
          : `file:///${normalizedPath}`
        return match.replace(src, fileUrl)
      }
    }
    return match
  })

  return updated
}

/**
 * 更新 LaTeX 中的图片链接
 * @param latex - 原始 LaTeX
 * @param imageMappings - 图片 URL 到路径的映射（可以是绝对路径或相对路径）
 * @returns 更新后的 LaTeX
 */
export function updateLatexImageLinks(latex: string, imageMappings: Map<string, string>): string {
  let updated = latex

  // LaTeX 中的图片通常使用 \includegraphics{path} 或 \includegraphics{\detokenize{path}}
  // 需要处理两种情况：
  // 1. \includegraphics{path}
  // 2. \includegraphics{\detokenize{path}}
  // 注意：正则表达式需要能够匹配嵌套的大括号（\detokenize{...}）
  // 使用递归匹配来正确处理嵌套的大括号
  // 匹配 \includegraphics[...]{...}，其中 {...} 内可能包含 \detokenize{...}
  const graphicsRegex = /\\includegraphics(?:\[[^\]]*\])?\{((?:[^{}]|\\detokenize\{[^}]+\})*)\}/g

  updated = updated.replace(graphicsRegex, (match, imagePath) => {
    // 检查是否使用了 \detokenize{...}
    let actualPath = imagePath
    const detokenizeMatch = imagePath.match(/\\detokenize\{([^}]+)\}/)
    if (detokenizeMatch) {
      actualPath = detokenizeMatch[1]
    }

    // 调试日志
    logger.debug(
      `updateLatexImageLinks - match: ${match}, imagePath: ${imagePath}, actualPath: ${actualPath}`
    )
    logger.debug(
      `映射表大小: ${imageMappings.size}, 映射键示例: ${Array.from(imageMappings.keys()).slice(0, 3).join(', ')}`
    )

    // 尝试从映射中查找对应的路径
    // 首先尝试使用完整的 imagePath（可能包含 \detokenize{...}）进行匹配
    // 因为映射的键可能是完整的 \detokenize{...} 格式
    let mappedPath = imageMappings.get(imagePath)
    if (mappedPath) {
      logger.debug(`通过完整 imagePath 找到映射: ${imagePath} -> ${mappedPath}`)
    }

    // 如果没找到，尝试使用 actualPath（提取出的路径）进行匹配
    if (!mappedPath) {
      mappedPath = imageMappings.get(actualPath)
      if (mappedPath) {
        logger.debug(`通过 actualPath 找到映射: ${actualPath} -> ${mappedPath}`)
      }
    }

    // 如果没找到，尝试规范化路径后再匹配（处理路径分隔符不一致的问题）
    if (
      !mappedPath &&
      !actualPath.startsWith('http://') &&
      !actualPath.startsWith('https://') &&
      !actualPath.startsWith('file://')
    ) {
      // 规范化路径：统一使用正斜杠
      const normalizedPath = actualPath.replace(/\\/g, '/')
      if (normalizedPath !== actualPath) {
        mappedPath = imageMappings.get(normalizedPath)
      }

      // 如果还是没找到，尝试还原转义字符后再查找
      if (!mappedPath) {
        const unescapedPath = actualPath.replace(/\\([#%&{}_$])/g, '$1')
        if (unescapedPath !== actualPath) {
          mappedPath = imageMappings.get(unescapedPath)
          // 也尝试规范化后的转义路径
          if (!mappedPath) {
            const normalizedUnescapedPath = unescapedPath.replace(/\\/g, '/')
            if (normalizedUnescapedPath !== unescapedPath) {
              mappedPath = imageMappings.get(normalizedUnescapedPath)
            }
          }
        }
      }
    }

    // 如果还是没找到，尝试带 \detokenize 的格式
    if (!mappedPath && detokenizeMatch) {
      mappedPath = imageMappings.get(detokenizeMatch[1])
      if (!mappedPath) {
        // 规范化 detokenize 内的路径
        const normalizedDetokenize = detokenizeMatch[1].replace(/\\/g, '/')
        if (normalizedDetokenize !== detokenizeMatch[1]) {
          mappedPath = imageMappings.get(normalizedDetokenize)
        }
        // 也尝试还原转义字符
        if (!mappedPath) {
          const unescapedDetokenize = detokenizeMatch[1].replace(/\\([#%&{}_$])/g, '$1')
          if (unescapedDetokenize !== detokenizeMatch[1]) {
            mappedPath = imageMappings.get(unescapedDetokenize)
            // 也尝试规范化后的转义路径
            if (!mappedPath) {
              const normalizedUnescapedDetokenize = unescapedDetokenize.replace(/\\/g, '/')
              if (normalizedUnescapedDetokenize !== unescapedDetokenize) {
                mappedPath = imageMappings.get(normalizedUnescapedDetokenize)
              }
            }
          }
        }
      }
    }

    if (mappedPath) {
      // LaTeX 路径使用正斜杠
      let latexPath = mappedPath.replace(/\\/g, '/')

      // 移除文件名的扩展名（LaTeX 会自动添加）
      // 只移除最后一个斜杠后的文件名扩展名，而不是整个路径的扩展名
      // 例如：./xxx.tex.images/filename.png -> ./xxx.tex.images/filename
      const lastSlashIndex = latexPath.lastIndexOf('/')
      if (lastSlashIndex >= 0) {
        const dirPart = latexPath.substring(0, lastSlashIndex + 1)
        const fileName = latexPath.substring(lastSlashIndex + 1)
        const fileNameWithoutExt = fileName.replace(/\.[^.]+$/, '')
        latexPath = dirPart + fileNameWithoutExt
      } else {
        // 如果没有斜杠，直接移除扩展名
        latexPath = latexPath.replace(/\.[^.]+$/, '')
      }

      // 替换逻辑：需要正确替换 imagePath 部分，保持正确的括号结构
      // match 的格式是：\includegraphics[...]{imagePath}
      // 我们需要替换 {imagePath} 中的 imagePath 部分
      // 如果原路径使用了 \detokenize{...}，imagePath 就是 \detokenize{...}，需要替换为 latexPath
      // 如果原路径没有使用 \detokenize，imagePath 就是路径本身，也需要替换为 latexPath
      // 无论哪种情况，都不需要再添加 \detokenize，因为相对路径不需要它
      // 使用字符串拼接来确保正确的括号结构
      const prefix = match.substring(0, match.indexOf('{') + 1) // \includegraphics[...]{
      const suffix = '}' // 结束的 }
      const newMatch = prefix + latexPath + suffix
      logger.debug(`替换路径: ${match} -> ${newMatch}`)
      return newMatch
    }

    // 如果没有找到映射，但路径是 HTTP URL，尝试直接查找
    const runtimeImagesPrefix = getRuntimeServerBaseUrl() + '/images/'
    if (
      actualPath.startsWith(runtimeImagesPrefix) ||
      actualPath.startsWith('http://') ||
      actualPath.startsWith('https://')
    ) {
      // 再次尝试查找（可能路径格式略有不同）
      for (const [key, value] of imageMappings.entries()) {
        if (key.includes(actualPath) || actualPath.includes(key)) {
          let latexPath = value.replace(/\\/g, '/')
          // 移除文件名的扩展名
          const lastSlashIndex = latexPath.lastIndexOf('/')
          if (lastSlashIndex >= 0) {
            const dirPart = latexPath.substring(0, lastSlashIndex + 1)
            const fileName = latexPath.substring(lastSlashIndex + 1)
            const fileNameWithoutExt = fileName.replace(/\.[^.]+$/, '')
            latexPath = dirPart + fileNameWithoutExt
          } else {
            latexPath = latexPath.replace(/\.[^.]+$/, '')
          }
          // 无论原路径是否使用了 \detokenize，都直接替换为相对路径（不需要 \detokenize）
          // 使用字符串拼接来确保正确的括号结构
          const prefix = match.substring(0, match.indexOf('{') + 1) // \includegraphics[...]{
          const suffix = '}' // 结束的 }
          return prefix + latexPath + suffix
        }
      }
    }

    return match
  })

  return updated
}
