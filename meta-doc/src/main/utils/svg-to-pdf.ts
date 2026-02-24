/**
 * SVG 转 PDF 工具
 * 使用 pdf-lib 将 SVG 转换为 PDF
 */

import fs from 'fs'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import { createMainLogger } from '../logger'
import { imageUploadDir } from '../express-server'
import { getRuntimeServerBaseUrl } from '../runtime-server-config'
// 仅保留 resvg-js 渲染链路，不再引入 BrowserWindow 或 sharp 回退

const logger = createMainLogger('SvgToPdf')

/**
 * 将 SVG 文件转换为 PDF 文件
 * @param svgPath - SVG 文件路径
 * @returns PDF 文件路径
 */
export async function convertSvgToPdf(svgPath: string): Promise<string> {
  try {
    // 检查 SVG 文件是否存在
    if (!fs.existsSync(svgPath)) {
      throw new Error(`SVG 文件不存在: ${svgPath}`)
    }

    // 读取 SVG 内容
    let svgContent = fs.readFileSync(svgPath, 'utf-8')

    // 生成 PDF 文件路径（在同一目录下，扩展名改为 .pdf）
    const pdfPath = svgPath.replace(/\.svg$/i, '.pdf')

    // 如果 PDF 已存在，直接返回
    if (fs.existsSync(pdfPath)) {
      logger.debug(`PDF 文件已存在，跳过转换: ${pdfPath}`)
      return pdfPath
    }

    // 仅使用 @resvg/resvg-js 将 SVG 渲染为 PNG，再嵌入 PDF
    // 同时尽可能加载系统字体，必要时附加常见字体文件，避免 Mermaid 字体缺失
    // 创建新的 PDF 文档
    const pdfDoc = await PDFDocument.create()

    // 动态导入 resvg
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Resvg } = require('@resvg/resvg-js')

    // 收集可能存在的系统字体文件（Windows 常见字体，存在才加入）
    const candidateFontFiles = [
      'C:/Windows/Fonts/arial.ttf',
      'C:/Windows/Fonts/arialuni.ttf',
      'C:/Windows/Fonts/msyh.ttc', // 微软雅黑
      'C:/Windows/Fonts/simhei.ttf', // 黑体
      'C:/Windows/Fonts/simsun.ttc', // 宋体
      'C:/Windows/Fonts/segoeui.ttf', // Segoe UI
      'C:/Windows/Fonts/calibri.ttf',
      'C:/Windows/Fonts/trebuc.ttf', // Trebuchet MS
      'C:/Windows/Fonts/tahoma.ttf',
      'C:/Windows/Fonts/verdana.ttf'
    ].filter((p) => {
      try {
        return fs.existsSync(p)
      } catch {
        return false
      }
    })

    // 推断尺寸
    const widthHeight = (() => {
      const viewBoxMatch = svgContent.match(
        /viewBox="\s*[\d.-]+\s+[\d.-]+\s+([\d.-]+)\s+([\d.-]+)\s*"/i
      )
      const widthMatch = svgContent.match(/width="([\d.-]+)"/i)
      const heightMatch = svgContent.match(/height="([\d.-]+)"/i)
      const width = widthMatch
        ? parseFloat(widthMatch[1])
        : viewBoxMatch
          ? parseFloat(viewBoxMatch[1])
          : 1920
      const height = heightMatch
        ? parseFloat(heightMatch[1])
        : viewBoxMatch
          ? parseFloat(viewBoxMatch[2])
          : 1080
      return { width: Math.max(1, width), height: Math.max(1, height) }
    })()

    // 针对 Mermaid 等使用 foreignObject 的 SVG 进行规范化，避免 resvg 丢字
    svgContent = normalizeSvgForResvg(svgContent)

    // 使用 2.0 倍缩放生成高分辨率位图，确保 PDF 中图表清晰度与矢量图相当
    const scale = 2.0
    const targetWidth = Math.max(1400, Math.round(widthHeight.width * scale))

    const resvg = new Resvg(svgContent, {
      fitTo: {
        mode: 'width',
        value: targetWidth
      },
      font: {
        loadSystemFonts: true,
        fontFiles: candidateFontFiles, // 显式注入常见系统字体
        // 设置常用族的默认映射，覆盖 Mermaid 里常见的无衬线用法
        sansSerifFamily: 'Arial',
        serifFamily: 'Times New Roman',
        monospaceFamily: 'Consolas',
        cursiveFamily: 'Arial',
        fantasyFamily: 'Arial',
        defaultFontFamily: 'Arial'
      },
      logLevel: 'off'
    })

    const pngData = resvg.render()
    logger.debug(`高分辨率 PNG 已生成用于 PDF（缩放因子: ${scale}x，宽度: ${targetWidth}px）`)
    const renderedPngBuffer = Buffer.from(pngData.asPng())

    const pngImage = await pdfDoc.embedPng(renderedPngBuffer)
    const page = pdfDoc.addPage([pngImage.width, pngImage.height])
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pngImage.width,
      height: pngImage.height
    })

    const pdfBytes = await pdfDoc.save()
    fs.writeFileSync(pdfPath, pdfBytes)
    logger.debug(`SVG 已转换为 PDF（resvg-only）: ${pdfPath}`)
    return pdfPath
  } catch (error) {
    logger.error('SVG 转 PDF 失败:', error)
    throw error
  }
}

/**
 * 使用 resvg 将 SVG 字符串渲染为 PDF 文件，并保存到本地图片目录
 * 返回本地 HTTP URL（运行时服务器 /images/xxx.pdf）
 * @param scale - 缩放因子，用于生成高分辨率位图。默认 2.0（相当于 192 DPI），与矢量图清晰度相当
 */
export async function convertSvgStringToPdfFile(
  svgContent: string,
  scale: number = 2.0
): Promise<string> {
  try {
    const crypto = require('crypto')
    // 在哈希中包含 scale，确保不同分辨率有不同的缓存文件
    const hash = crypto
      .createHash('sha256')
      .update(String(svgContent) + ':pdf_scale:' + scale)
      .digest('hex')
      .slice(0, 16)
    const fileName = `${hash}_mermaid.pdf`
    const filePath = path.join(imageUploadDir, fileName)
    if (fs.existsSync(filePath)) {
      return `${getRuntimeServerBaseUrl()}/images/${fileName}`
    }

    // 规范化 SVG
    const normalized = normalizeSvgForResvg(svgContent)

    // 动态导入 resvg
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Resvg } = require('@resvg/resvg-js')

    // 推断尺寸
    const widthHeight = (() => {
      const viewBoxMatch = normalized.match(
        /viewBox="\s*[\d.-]+\s+[\d.-]+\s+([\d.-]+)\s+([\d.-]+)\s*"/i
      )
      const widthMatch = normalized.match(/width="([\d.-]+)"/i)
      const heightMatch = normalized.match(/height="([\d.-]+)"/i)
      const width = widthMatch
        ? parseFloat(widthMatch[1])
        : viewBoxMatch
          ? parseFloat(viewBoxMatch[1])
          : 1920
      const height = heightMatch
        ? parseFloat(heightMatch[1])
        : viewBoxMatch
          ? parseFloat(viewBoxMatch[2])
          : 1080
      return { width: Math.max(1, width), height: Math.max(1, height) }
    })()

    // 收集可能存在的系统字体文件（Windows 常见字体，存在才加入）
    const candidateFontFiles = [
      'C:/Windows/Fonts/arial.ttf',
      'C:/Windows/Fonts/arialuni.ttf',
      'C:/Windows/Fonts/msyh.ttc',
      'C:/Windows/Fonts/simhei.ttf',
      'C:/Windows/Fonts/simsun.ttc',
      'C:/Windows/Fonts/segoeui.ttf',
      'C:/Windows/Fonts/calibri.ttf',
      'C:/Windows/Fonts/trebuc.ttf',
      'C:/Windows/Fonts/tahoma.ttf',
      'C:/Windows/Fonts/verdana.ttf'
    ].filter((p) => {
      try {
        return fs.existsSync(p)
      } catch {
        return false
      }
    })

    // 使用 scale 倍缩放生成高分辨率位图，确保 PDF 中图表清晰度与矢量图相当
    const targetWidth = Math.max(1400, Math.round(widthHeight.width * scale))

    const resvg = new Resvg(normalized, {
      fitTo: {
        mode: 'width',
        value: targetWidth
      },
      font: {
        loadSystemFonts: true,
        fontFiles: candidateFontFiles,
        sansSerifFamily: 'Arial',
        serifFamily: 'Times New Roman',
        monospaceFamily: 'Consolas',
        cursiveFamily: 'Arial',
        fantasyFamily: 'Arial',
        defaultFontFamily: 'Arial'
      },
      logLevel: 'off'
    })

    const pngData = resvg.render()
    const renderedPngBuffer = Buffer.from(pngData.asPng())
    logger.debug(`高分辨率 PNG 已生成用于 PDF（缩放因子: ${scale}x）`)

    // 创建 PDF 并嵌入 PNG
    const pdfDoc = await PDFDocument.create()
    const pngImage = await pdfDoc.embedPng(renderedPngBuffer)
    const page = pdfDoc.addPage([pngImage.width, pngImage.height])
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pngImage.width,
      height: pngImage.height
    })

    const pdfBytes = await pdfDoc.save()
    fs.writeFileSync(filePath, pdfBytes)
    logger.debug(`SVG 字符串已转换为 PDF: ${filePath}`)
    return `${getRuntimeServerBaseUrl()}/images/${fileName}`
  } catch (error) {
    logger.error('SVG 字符串转 PDF 失败:', error)
    throw error
  }
}

/**
 * 使用 resvg 将 SVG 字符串渲染为 PNG 文件，并保存到本地图片目录
 * 返回本地 HTTP URL（运行时服务器 /images/xxx.png）
 * @param scale - 缩放因子，用于生成高分辨率位图。默认 2.0（相当于 192 DPI），与矢量图清晰度相当
 */
export async function convertSvgStringToPngFile(
  svgContent: string,
  scale: number = 2.0
): Promise<string> {
  try {
    const crypto = require('crypto')
    // 在哈希中包含 scale，确保不同分辨率有不同的缓存文件
    const hash = crypto
      .createHash('sha256')
      .update(String(svgContent) + ':scale:' + scale)
      .digest('hex')
      .slice(0, 16)
    const fileName = `${hash}_mermaid.png`
    const filePath = path.join(imageUploadDir, fileName)
    if (fs.existsSync(filePath)) {
      return `${getRuntimeServerBaseUrl()}/images/${fileName}`
    }

    // 规范化 SVG
    const normalized = normalizeSvgForResvg(svgContent)

    // 动态导入 resvg
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Resvg } = require('@resvg/resvg-js')

    // 推断尺寸
    const widthHeight = (() => {
      const viewBoxMatch = normalized.match(
        /viewBox="\s*[\d.-]+\s+[\d.-]+\s+([\d.-]+)\s+([\d.-]+)\s*"/i
      )
      const widthMatch = normalized.match(/width="([\d.-]+)"/i)
      const heightMatch = normalized.match(/height="([\d.-]+)"/i)
      const width = widthMatch
        ? parseFloat(widthMatch[1])
        : viewBoxMatch
          ? parseFloat(viewBoxMatch[1])
          : 1920
      const height = heightMatch
        ? parseFloat(heightMatch[1])
        : viewBoxMatch
          ? parseFloat(viewBoxMatch[2])
          : 1080
      return { width: Math.max(1, width), height: Math.max(1, height) }
    })()

    // 收集可能存在的系统字体文件（Windows 常见字体，存在才加入）
    const candidateFontFiles = [
      'C:/Windows/Fonts/arial.ttf',
      'C:/Windows/Fonts/arialuni.ttf',
      'C:/Windows/Fonts/msyh.ttc',
      'C:/Windows/Fonts/simhei.ttf',
      'C:/Windows/Fonts/simsun.ttc',
      'C:/Windows/Fonts/segoeui.ttf',
      'C:/Windows/Fonts/calibri.ttf',
      'C:/Windows/Fonts/trebuc.ttf',
      'C:/Windows/Fonts/tahoma.ttf',
      'C:/Windows/Fonts/verdana.ttf'
    ].filter((p) => {
      try {
        return fs.existsSync(p)
      } catch {
        return false
      }
    })

    // 使用 scale 倍缩放生成高分辨率位图，确保 PDF 中图表清晰度与矢量图相当
    const targetWidth = Math.max(1400, Math.round(widthHeight.width * scale))

    const resvg = new Resvg(normalized, {
      fitTo: {
        mode: 'width',
        value: targetWidth
      },
      font: {
        loadSystemFonts: true,
        fontFiles: candidateFontFiles,
        sansSerifFamily: 'Arial',
        serifFamily: 'Times New Roman',
        monospaceFamily: 'Consolas',
        cursiveFamily: 'Arial',
        fantasyFamily: 'Arial',
        defaultFontFamily: 'Arial'
      },
      logLevel: 'off'
    })

    const pngData = resvg.render()
    const renderedPngBuffer = Buffer.from(pngData.asPng())
    logger.debug(`高分辨率 PNG 已生成（缩放因子: ${scale}x）`)

    fs.writeFileSync(filePath, renderedPngBuffer)
    logger.debug(`SVG 字符串已转换为 PNG: ${filePath}`)
    return `${getRuntimeServerBaseUrl()}/images/${fileName}`
  } catch (error) {
    logger.error('SVG 字符串转 PNG 失败:', error)
    throw error
  }
}

/**
 * 针对 Mermaid 等使用 foreignObject 的 SVG 进行规范化，避免 resvg 丢字
 * 将 foreignObject 中的内容转换为 SVG text 元素
 */
function normalizeSvgForResvg(svgContent: string): string {
  // 检查是否包含 foreignObject（Mermaid 常用）
  if (!svgContent.includes('foreignObject')) {
    return svgContent
  }

  // 简单的规范化处理：移除 foreignObject，保留其内部文本
  // 注意：这是一个基础实现，将 foreignObject 替换为简单占位
  let normalized = svgContent

  // 移除 foreignObject 标签，保留内容（resvg 可能无法渲染复杂 HTML）
  normalized = normalized.replace(/<foreignObject[^>]*>[\s\S]*?<\/foreignObject>/gi, (match) => {
    // 尝试提取文本内容
    const textMatch = match.match(/>([^<]+)</)
    if (textMatch) {
      const text = textMatch[1].trim()
      if (text) {
        // 返回一个简单的 text 元素作为占位
        return `<text>${escapeXml(text)}</text>`
      }
    }
    return ''
  })

  return normalized
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
