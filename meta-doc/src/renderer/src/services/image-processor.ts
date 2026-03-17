/**
 * 图片处理服务
 * 支持三种图片处理模式：
 * 1. original - 保留原始链接
 * 2. base64 - Base64 嵌入（仅 HTML 和 Markdown）
 * 3. folder - 保存到文件夹并更新链接
 */

import { embedImagesInline, local2httpProtocol } from '../utils/md-utils'
import { createRendererLogger } from '../utils/logger'
import { getRuntimeServerBaseUrlSync } from '../config/runtime-server'

// 懒加载logger，避免初始化顺序问题
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('ImageProcessor')
  }
  return loggerInstance
}

export type ImageProcessingMode = 'original' | 'base64' | 'folder'

export interface ImageProcessingOptions {
  mode: ImageProcessingMode
  // 对于 folder 模式，需要提供目标文件夹路径（在 main 进程中处理）
  targetFolder?: string
}

/**
 * 处理 Markdown 中的图片
 * @param markdown - 原始 Markdown 内容
 * @param mode - 图片处理模式
 * @param targetFormat - 目标格式
 * @param docPath - 可选，文档路径，用于解析相对路径
 * @returns 处理后的 Markdown 内容
 */
export async function processMarkdownImages(
  markdown: string,
  mode: ImageProcessingMode,
  targetFormat: 'html' | 'md' | 'tex',
  docPath?: string
): Promise<string> {
  if (mode === 'original') {
    // 保留原始链接，不做处理
    // 但对于HTML导出，需要将系统路径和localhost:52521的URL转换为file协议，以便浏览器加载
    // 但保留http(s)网络链接
    if (targetFormat === 'html') {
      // 转换系统路径和localhost:52521的URL为file协议
      // 但保留http(s)网络链接、data URL等
      const { local2fileProtocolForHtml } = await import('../utils/md-utils')
      return await local2fileProtocolForHtml(markdown, docPath)
    }

    // 对于TEX导出，需要下载网络图片并上传到本地服务
    if (targetFormat === 'tex') {
      const { downloadAndUploadNetworkImages } = await import('../utils/md-utils')
      return await downloadAndUploadNetworkImages(markdown, docPath)
    }

    return markdown
  }

  if (mode === 'base64') {
    // Base64 嵌入（仅 HTML 和 Markdown 支持）
    if (targetFormat === 'tex') {
      getLogger().warn('LaTeX 格式不支持 Base64 嵌入，将使用原始链接')
      return markdown
    }

    // 检查是否已经是 HTTP URL 格式，避免重复转换
    // embedImagesInline 可以处理 HTTP URL、file:// URL 和本地路径
    // 但如果输入已经是 HTTP URL，就不需要先转换
    const imagesPrefix = getRuntimeServerBaseUrlSync() + '/images/'
    // 使用 includes 替代动态正则，避免 URL 中特殊字符导致 "Unterminated group" 等正则错误
    const hasHttpUrl = markdown.includes(imagesPrefix)
    const hasFileUrl = /!\[.*?\]\(file:\/\//.test(markdown)

    let processed = markdown
    // 只有在不是 HTTP URL 且不是 file:// URL 的情况下才需要转换
    // （file:// URL 也可以被 embedImagesInline 处理，但 HTTP URL 更统一）
    if (!hasHttpUrl && !hasFileUrl) {
      // 先确保图片是 HTTP URL 格式（传入文档路径以支持相对路径解析）
      processed = await local2httpProtocol(markdown, docPath)
    } else if (hasFileUrl && !hasHttpUrl) {
      // 如果有 file:// URL 但没有 HTTP URL，转换为 HTTP URL 以统一格式
      // 注意：embedImagesInline 可以处理 file://，但为了统一，我们转换为 HTTP URL
      processed = await local2httpProtocol(markdown, docPath)
    }
    // 然后转换为 Base64（embedImagesInline 可以处理 HTTP URL 和 file:// URL）
    // 对于 HTML 导出，SVG 不转换为位图；对于 DOCX 导出，SVG 需要转换为位图
    const convertSvgToBitmap = targetFormat !== 'html'
    processed = await embedImagesInline(processed, convertSvgToBitmap)
    return processed
  }

  if (mode === 'folder') {
    // 文件夹模式：在导出时由 main 进程处理
    // 这里只确保图片是 HTTP URL 格式，实际保存到文件夹的逻辑在 main 进程
    // 传入文档路径以支持相对路径解析
    // 注意：如果输入已经是 HTTP URL，local2httpProtocol 会保持原样，不会重复转换
    return await local2httpProtocol(markdown, docPath)
  }

  return markdown
}

/**
 * 处理 HTML 中的图片
 * @param html - 原始 HTML 内容
 * @param mode - 图片处理模式
 * @returns 处理后的 HTML 内容
 */
export async function processHtmlImages(html: string, mode: ImageProcessingMode): Promise<string> {
  if (mode === 'original') {
    // 对于 HTML 的 original 模式，需要将 localhost:52521 的 URL 转换为 file 协议
    // 但保留 http(s) 网络链接
    const { local2fileProtocolForHtmlInHtml } = await import('../utils/md-utils')
    return await local2fileProtocolForHtmlInHtml(html)
  }

  if (mode === 'base64') {
    // 将 HTML 中的图片 URL 转换为 Base64
    // 提取所有 img 标签的 src
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
    const matches = Array.from(html.matchAll(imgRegex))

    let processedHtml = html
    for (const match of matches) {
      const imgTag = match[0]
      const src = match[1]

      // 如果是 HTTP URL，转换为 Base64
      if (src.startsWith(getRuntimeServerBaseUrlSync() + '/images/')) {
        try {
          const response = await fetch(src)
          if (!response.ok) continue

          // 检查是否为 SVG（通过 URL 或 Content-Type）
          const contentType = response.headers.get('content-type') || ''
          const isSvg =
            src.toLowerCase().endsWith('.svg') ||
            contentType.includes('image/svg+xml') ||
            contentType.includes('image/svg')

          if (isSvg) {
            // HTML 导出保持 SVG 格式，不转换为位图
            const svgText = await response.text()
            const base64Svg = btoa(unescape(encodeURIComponent(svgText)))
            const dataUrl = `data:image/svg+xml;base64,${base64Svg}`
            processedHtml = processedHtml.replace(imgTag, imgTag.replace(src, dataUrl))
          } else {
            // 位图：转换为 base64
            const blob = await response.blob()
            const reader = new FileReader()
            const dataUrl = await new Promise<string>((resolve, reject) => {
              reader.onload = () => {
                if (reader.result && typeof reader.result === 'string') {
                  resolve(reader.result)
                } else {
                  reject(new Error('读取图片数据失败'))
                }
              }
              reader.onerror = () => reject(new Error('FileReader 错误'))
              reader.readAsDataURL(blob)
            })

            // 替换 src
            processedHtml = processedHtml.replace(imgTag, imgTag.replace(src, dataUrl))
          }
        } catch (error) {
          getLogger().warn(`转换图片失败: ${src}`, error)
        }
      }
    }

    return processedHtml
  }

  if (mode === 'folder') {
    // 文件夹模式：在导出时由 main 进程处理
    // 这里不做处理，保持 HTTP URL
    return html
  }

  return html
}

/**
 * 提取 Markdown 中的所有图片 URL
 */
export function extractImageUrls(markdown: string): string[] {
  const urls: string[] = []
  const regex = /!\[.*?\]\((.*?)\)/g
  let match

  while ((match = regex.exec(markdown)) !== null) {
    const url = match[1]
    if (url.startsWith(getRuntimeServerBaseUrlSync() + '/images/')) {
      urls.push(url)
    }
  }

  return urls
}

/**
 * 提取 HTML 中的所有图片 URL
 */
export function extractImageUrlsFromHtml(html: string): string[] {
  const urls: string[] = []
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
  const matches = Array.from(html.matchAll(imgRegex))

  for (const match of matches) {
    const src = match[1]
    if (src.startsWith(getRuntimeServerBaseUrlSync() + '/images/')) {
      urls.push(src)
    }
  }

  return urls
}
