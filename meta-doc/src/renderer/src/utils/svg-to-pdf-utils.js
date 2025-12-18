/**
 * SVG 转 PDF 统一工具函数
 * 支持多种输入格式：HTTP URL、本地文件路径、SVG 字符串
 * 自动选择最优的转换方式，确保最大的兼容性和最好的效果
 */

import { createRendererLogger } from './logger.ts'

// 懒加载logger，避免初始化顺序问题
let loggerInstance = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('SvgToPdfUtils')
  }
  return loggerInstance
}

/**
 * 获取 IPC 渲染器（统一方法）
 */
async function getIpcRenderer() {
  if (window && window.electron) {
    return window.electron.ipcRenderer
  } else {
    const localIpcRenderer = (await import('./web-adapter/local-ipc-renderer.ts')).default
    return localIpcRenderer
  }
}

/**
 * 将 HTTP URL 转换为本地文件路径
 * @param {string} imageUrl - HTTP URL (http://localhost:52521/images/...)
 * @returns {Promise<string>} 本地文件路径
 */
async function convertUrlToLocalPath(imageUrl) {
  try {
    const { image2local } = await import('./md-utils.js')
    const markdownWithImage = `![chart](${imageUrl})`
    const convertedMarkdown = await image2local(markdownWithImage)
    const imageMatch = convertedMarkdown.match(/!\[.*?\]\((.+?)\)/)
    if (imageMatch && imageMatch[1]) {
      return imageMatch[1]
    }
    throw new Error('无法从 URL 提取本地路径')
  } catch (error) {
    getLogger().error('URL 转本地路径失败:', error)
    throw error
  }
}

/**
 * 统一的 SVG 转 PDF 函数
 * 支持多种输入格式，自动选择最优转换方式
 * 
 * @param {string} input - SVG 输入，可以是：
 *   - HTTP URL: "http://localhost:52521/images/xxx.svg"
 *   - 本地文件路径: "C:/path/to/file.svg" 或 "/path/to/file.svg"
 *   - SVG 字符串: "<svg>...</svg>"
 * @param {Object} options - 可选配置
 *   - returnUrl: boolean - 是否返回 HTTP URL（默认 false，返回本地路径）
 *   - returnPath: boolean - 是否返回本地路径（默认 true）
 * @returns {Promise<string>} PDF 路径或 URL
 * 
 * @example
 * // 从 HTTP URL 转换
 * const pdfPath = await convertSvgToPdf('http://localhost:52521/images/chart.svg')
 * 
 * // 从本地路径转换
 * const pdfPath = await convertSvgToPdf('C:/images/chart.svg')
 * 
 * // 从 SVG 字符串转换
 * const pdfPath = await convertSvgToPdf('<svg>...</svg>')
 * 
 * // 返回 HTTP URL
 * const pdfUrl = await convertSvgToPdf('http://localhost:52521/images/chart.svg', { returnUrl: true })
 */
export async function convertSvgToPdf(input, options = {}) {
  const { returnUrl = false, returnPath = true } = options
  
  try {
    // 获取 IPC 渲染器
    const ipcRenderer = await getIpcRenderer()
    if (!ipcRenderer) {
      throw new Error('无法获取 IPC 渲染器')
    }
    
    // 检测输入类型
    let svgPath = null
    let svgContent = null
    let useStringMethod = false
    
    if (input.startsWith('http://') || input.startsWith('https://')) {
      // HTTP URL：优先使用字符串方法（更可靠，兼容浏览器环境）
      try {
        // 下载 SVG 内容
        const response = await fetch(input)
        if (!response.ok) {
          throw new Error(`下载 SVG 失败: ${response.statusText}`)
        }
        svgContent = await response.text()
        useStringMethod = true
        getLogger().debug('从 HTTP URL 下载 SVG 内容，使用字符串方法转换')
      } catch (fetchError) {
        // 如果下载失败，回退到路径方法
        getLogger().warn('从 HTTP URL 下载失败，尝试使用路径方法:', fetchError)
        svgPath = await convertUrlToLocalPath(input)
        useStringMethod = false
      }
    } else if (input.trim().startsWith('<svg') || input.trim().startsWith('<?xml')) {
      // SVG 字符串
      svgContent = input
      useStringMethod = true
      getLogger().debug('检测到 SVG 字符串，使用字符串方法转换')
    } else {
      // 本地文件路径
      svgPath = input.replace(/\\/g, '/') // 统一使用正斜杠
      useStringMethod = false
      getLogger().debug('检测到本地文件路径，使用路径方法转换')
    }
    
    // 执行转换
    let result
    
    if (useStringMethod && svgContent) {
      // 方法1: 使用字符串方法（推荐，兼容性最好）
      result = await ipcRenderer.invoke('convert-svg-string-to-pdf', svgContent)
    } else if (svgPath) {
      // 方法2: 使用路径方法（适用于已有本地文件的情况）
      result = await ipcRenderer.invoke('convert-svg-to-pdf', svgPath)
    } else {
      throw new Error('无法确定输入类型或获取 SVG 内容')
    }
    
    if (!result.success || !result.pdfPath) {
      throw new Error(result.error || 'SVG 转 PDF 失败')
    }
    
    const pdfPath = result.pdfPath.replace(/\\/g, '/') // 统一使用正斜杠
    
    // 根据选项返回路径或 URL
    if (returnUrl) {
      // 从路径中提取文件名
      const fileName = pdfPath.split(/[/\\]/).pop() || pdfPath
      return `http://localhost:52521/images/${fileName}`
    } else {
      return pdfPath
    }
  } catch (error) {
    getLogger().error('SVG 转 PDF 失败:', error)
    throw error
  }
}

/**
 * 批量转换多个 SVG 为 PDF
 * @param {string[]} inputs - SVG 输入数组
 * @param {Object} options - 可选配置
 * @returns {Promise<string[]>} PDF 路径或 URL 数组
 */
export async function convertSvgsToPdf(inputs, options = {}) {
  const results = await Promise.all(
    inputs.map(input => convertSvgToPdf(input, options))
  )
  return results
}

