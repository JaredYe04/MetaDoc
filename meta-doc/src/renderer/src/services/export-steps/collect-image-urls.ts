/**
 * 收集 Markdown 中图片 URL（用于区分原始图片与预渲染生成的图片，供 main 进程清理）
 */

import { getRuntimeServerBaseUrlSync } from '../../config/runtime-server'

/**
 * 收集原始 Markdown 中的图片 URL 集合（用于后续排除预渲染图）
 */
export function collectOriginalImageUrls(markdown: string): Set<string> {
  const imagesPrefix = getRuntimeServerBaseUrlSync() + '/images/'
  const originalImageUrls = new Set<string>()
  const originalImageRegex = /!\[.*?\]\((.*?)\)/g
  let match
  while ((match = originalImageRegex.exec(markdown)) !== null) {
    const imagePath = match[1]
    if (imagePath.startsWith(imagesPrefix)) {
      originalImageUrls.add(imagePath)
    } else if (!imagePath.startsWith('data:image/')) {
      const fileName = imagePath.split(/[/\\]/).pop() || imagePath
      originalImageUrls.add(`${imagesPrefix}${fileName}`)
    }
  }
  return originalImageUrls
}

/**
 * 收集预渲染生成的图片 URL 列表（排除原始图片）
 */
export function collectRenderedImageUrls(
  markdown: string,
  originalImageUrls: Set<string>
): string[] {
  const imageUrls: string[] = []
  try {
    const imagesPrefix = getRuntimeServerBaseUrlSync() + '/images/'
    const imagesPrefixEscaped = imagesPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const imageRegex = new RegExp('!\\[.*?\\]\\(' + imagesPrefixEscaped + '([^)\\\\]+)\\)', 'g')
    let match
    const baseUrl = imagesPrefix
    while ((match = imageRegex.exec(markdown)) !== null) {
      const imageUrl = baseUrl + (match[1] || '')
      if (!originalImageUrls.has(imageUrl)) {
        imageUrls.push(imageUrl)
      }
    }
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[export-steps] 收集预渲染图片 URL 时出错:', err)
    }
  }
  return imageUrls
}
