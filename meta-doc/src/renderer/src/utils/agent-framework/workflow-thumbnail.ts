/**
 * 工作流缩略图生成工具
 * 生成工作流的SVG缩略图
 */

import type { Workflow } from '../../types/agent-framework'
import { createRendererLogger } from '../logger'
import { themeState } from '../themes'

// 懒加载logger，避免初始化顺序问题
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('WorkflowThumbnail')
  }
  return loggerInstance
}

/**
 * 生成工作流缩略图（简化版，使用SVG）
 * @param workflow 工作流对象
 * @param width 缩略图宽度（默认280）
 * @param height 缩略图高度（默认180）
 * @returns Promise<string> 返回base64图片数据URL
 */
export async function generateWorkflowThumbnail(
  workflow: Workflow,
  width: number = 280,
  height: number = 180
): Promise<string> {
  try {
    // 生成简化的SVG流程图
    return generateSimpleWorkflowSVG(workflow, width, height)
  } catch (error) {
    getLogger().error('生成工作流缩略图失败:', error)
    // 返回占位符图片
    return generatePlaceholderThumbnail(width, height)
  }
}

/**
 * 生成简化的工作流SVG图
 */
async function generateSimpleWorkflowSVG(workflow: Workflow, width: number, height: number): Promise<string> {
  const padding = 20
  const nodeWidth = 80
  const nodeHeight = 40
  const nodeSpacing = 30
  
  // 计算节点位置
  const nodes: Array<{ id: string; label: string; x: number; y: number; type: 'artifact' | 'control' }> = []
  
  // 添加工件节点
  workflow.artifactNodes.forEach((node, idx) => {
    const pos = node.position || { x: padding + idx * (nodeWidth + nodeSpacing), y: height / 2 }
    nodes.push({
      id: node.id,
      label: node.label || node.id,
      x: Math.min(pos.x * 0.5, width - nodeWidth - padding),
      y: Math.min(pos.y * 0.5, height - nodeHeight - padding),
      type: 'artifact'
    })
  })
  
  // 添加控制流节点
  workflow.controlFlowNodes.forEach((node, idx) => {
    const pos = node.position || { x: padding + idx * (nodeWidth + nodeSpacing), y: height / 2 }
    nodes.push({
      id: node.id,
      label: node.label || node.id,
      x: Math.min(pos.x * 0.5, width - nodeWidth - padding),
      y: Math.min(pos.y * 0.5, height - nodeHeight - padding),
      type: 'control'
    })
  })
  
  // 获取主题颜色
  const isDark = themeState.currentTheme.type === 'dark'
  const bgColor = themeState.currentTheme.background2nd || (isDark ? '#1e1e1e' : '#ffffff')
  const nodeBgColor = themeState.currentTheme.background || (isDark ? '#252525' : '#f5f5f5')
  const nodeTextColor = themeState.currentTheme.textColor || (isDark ? '#ffffff' : '#333333')
  const edgeColor = isDark ? '#64b5f6' : '#409eff'
  const nodeBorderColor = edgeColor
  
  // 构建SVG - 不设置背景色，让父容器控制
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" style="display: block; border-radius: 4px;">`
  
  // 添加边
  for (const edge of workflow.edges) {
    const sourceNode = nodes.find(n => n.id === edge.source)
    const targetNode = nodes.find(n => n.id === edge.target)
    if (sourceNode && targetNode) {
      const x1 = sourceNode.x + nodeWidth
      const y1 = sourceNode.y + nodeHeight / 2
      const x2 = targetNode.x
      const y2 = targetNode.y + nodeHeight / 2
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${edgeColor}" stroke-width="2" marker-end="url(#arrowhead)"/>`
    }
  }
  
  // 添加箭头标记
  svg += `<defs><marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><polygon points="0 0, 10 3, 0 6" fill="${edgeColor}"/></marker></defs>`
  
  // 添加节点
  nodes.forEach(node => {
    if (node.type === 'control') {
      // 菱形（条件节点）
      const x = node.x + nodeWidth / 2
      const y = node.y + nodeHeight / 2
      svg += `<polygon points="${x},${node.y} ${node.x + nodeWidth},${y} ${x},${node.y + nodeHeight} ${node.x},${y}" fill="${nodeBgColor}" stroke="${nodeBorderColor}" stroke-width="2"/>`
    } else {
      // 矩形
      svg += `<rect x="${node.x}" y="${node.y}" width="${nodeWidth}" height="${nodeHeight}" fill="${nodeBgColor}" stroke="${nodeBorderColor}" stroke-width="2" rx="4"/>`
    }
    
    // 添加文本
    const text = node.label.length > 8 ? node.label.substring(0, 8) + '...' : node.label
    svg += `<text x="${node.x + nodeWidth / 2}" y="${node.y + nodeHeight / 2}" font-size="10" fill="${nodeTextColor}" text-anchor="middle" dominant-baseline="middle">${escapeXml(text)}</text>`
  })
  
  svg += '</svg>'
  
  // 转换为data URL
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const reader = new FileReader()
  
  return new Promise<string>((resolve) => {
    reader.onload = () => {
      resolve(reader.result as string)
    }
    reader.readAsDataURL(svgBlob)
  })
}

/**
 * 转义XML特殊字符
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * 生成占位符缩略图
 */
function generatePlaceholderThumbnail(width: number, height: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  
  if (ctx) {
    // 获取主题颜色
    const isDark = themeState.currentTheme.type === 'dark'
    const bgColor = themeState.currentTheme.background2nd || (isDark ? '#1e1e1e' : '#f5f5f5')
    const textColor = themeState.currentTheme.textColor2 || (isDark ? '#888888' : '#999999')
    const borderColor = themeState.currentTheme.textColor2 || (isDark ? '#444444' : '#dddddd')
    
    // 填充背景
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, width, height)
    
    // 绘制边框
    ctx.strokeStyle = borderColor
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, width, height)
    
    // 绘制占位符文本
    ctx.fillStyle = textColor
    ctx.font = '14px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('工作流', width / 2, height / 2)
  }
  
  return canvas.toDataURL('image/png')
}

/**
 * 缓存缩略图
 */
const thumbnailCache = new Map<string, string>()

/**
 * 获取工作流缩略图（带缓存）
 */
export async function getWorkflowThumbnail(workflow: Workflow): Promise<string> {
  const cacheKey = `${workflow.id}-${workflow.updatedAt}`
  
  if (thumbnailCache.has(cacheKey)) {
    return thumbnailCache.get(cacheKey)!
  }
  
  const thumbnail = await generateWorkflowThumbnail(workflow)
  thumbnailCache.set(cacheKey, thumbnail)
  
  return thumbnail
}

/**
 * 清除缩略图缓存
 */
export function clearThumbnailCache(): void {
  thumbnailCache.clear()
}

