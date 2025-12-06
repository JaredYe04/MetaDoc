/**
 * Reference Adapter系统
 * 用于解析不同格式的文件和URL，提取parsedContent供AI参考
 */

import { createRendererLogger } from '../logger'
import localIpcRenderer from '../web-adapter/local-ipc-renderer'
import { webMainCalls } from '../web-adapter/web-main-calls'
import { extractOuterJsonString } from '../regex-utils'
import axios from 'axios'

// 懒加载logger，避免初始化顺序问题
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('ReferenceAdapters')
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
 * 从HTML/XML中提取纯文本（类似innerText）
 */
function extractPlainTextFromHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return ''
  }

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    
    // 移除script和style标签
    doc.querySelectorAll('script, style, noscript').forEach(el => el.remove())
    
    // 直接获取body的innerText
    const body = doc.body || doc.documentElement
    return body.innerText || body.textContent || ''
  } catch (error) {
    getLogger().warn('HTML解析失败:', error)
    return ''
  }
}

/**
 * Reference Adapter接口
 */
export interface ReferenceAdapter {
  /** 支持的格式列表 */
  supportedFormats: string[]
  /** 解析方法 */
  parse(content: string | ArrayBuffer, format: string, metadata?: Record<string, unknown>): Promise<string>
}

/**
 * 纯文本适配器（JSON/MD/TXT）
 */
class PlainTextAdapter implements ReferenceAdapter {
  supportedFormats = ['json', 'md', 'txt', 'text', 'markdown']

  async parse(content: string | ArrayBuffer, format: string): Promise<string> {
    const text = typeof content === 'string' ? content : new TextDecoder('utf-8').decode(content)
    
    // 对于JSON，尝试格式化
    if (format === 'json') {
      try {
        const jsonString = extractOuterJsonString(text) || text
        const parsed = JSON.parse(jsonString)
        return JSON.stringify(parsed, null, 2)
      } catch {
        return text
      }
    }
    
    return text
  }
}

/**
 * HTML/XML适配器
 */
class HtmlAdapter implements ReferenceAdapter {
  supportedFormats = ['html', 'xml', 'htm']

  async parse(content: string | ArrayBuffer): Promise<string> {
    const html = typeof content === 'string' ? content : new TextDecoder('utf-8').decode(content)
    return extractPlainTextFromHtml(html)
  }
}

/**
 * PDF适配器
 */
class PdfAdapter implements ReferenceAdapter {
  supportedFormats = ['pdf']

  async parse(content: string | ArrayBuffer, format: string, metadata?: Record<string, unknown>): Promise<string> {
    // 如果content是文件路径，通过主进程转换
    if (typeof content === 'string' && (content.startsWith('/') || /^[A-Za-z]:[\\/]/.test(content))) {
      if (!ipcRenderer) {
        throw new Error('IPC渲染器不可用，无法解析PDF文件')
      }
      
      try {
        const text = await ipcRenderer.invoke('convert-pdf-to-text', content) as string
        return text
      } catch (error) {
        getLogger().error('PDF转换失败:', error)
        throw new Error(`PDF解析失败: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    
    // 如果是ArrayBuffer，暂时不支持（需要先保存为文件）
    throw new Error('PDF解析需要文件路径，不支持ArrayBuffer输入')
  }
}

/**
 * Word适配器
 */
class WordAdapter implements ReferenceAdapter {
  supportedFormats = ['docx', 'doc']

  async parse(content: string | ArrayBuffer, format: string, metadata?: Record<string, unknown>): Promise<string> {
    // 如果content是文件路径，通过主进程转换
    if (typeof content === 'string' && (content.startsWith('/') || /^[A-Za-z]:[\\/]/.test(content))) {
      if (!ipcRenderer) {
        throw new Error('IPC渲染器不可用，无法解析Word文件')
      }
      
      try {
        const text = await ipcRenderer.invoke('convert-docx-to-text', content) as string
        return text
      } catch (error) {
        getLogger().error('Word转换失败:', error)
        throw new Error(`Word解析失败: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    
    throw new Error('Word解析需要文件路径，不支持ArrayBuffer输入')
  }
}

/**
 * Excel/CSV适配器（使用数据分析工具的逻辑）
 */
class ExcelAdapter implements ReferenceAdapter {
  supportedFormats = ['xlsx', 'xls', 'csv']

  async parse(content: string | ArrayBuffer, format: string, metadata?: Record<string, unknown>): Promise<string> {
    getLogger().info(`[ExcelAdapter] 开始解析${format}文件`)
    
    // 导入数据分析工具的逻辑
    const dataAnalysisTool = await import('../agent-tools/data-analysis-tool')
    const parseCSV = dataAnalysisTool.parseCSV
    const extractFields = dataAnalysisTool.extractFields
    const calculateDescriptiveStats = dataAnalysisTool.calculateDescriptiveStats
    const performAggregation = dataAnalysisTool.performAggregation
    
    let parsedData: any[]
    
    if (format === 'csv') {
      const csvString = typeof content === 'string' ? content : new TextDecoder('utf-8').decode(content)
      getLogger().info(`[ExcelAdapter] CSV字符串长度: ${csvString.length}`)
      parsedData = parseCSV(csvString)
      getLogger().info(`[ExcelAdapter] CSV解析完成，行数: ${parsedData.length}`)
    } else {
      // Excel文件需要先转换为CSV或JSON（这里简化处理，实际应该通过主进程转换）
      throw new Error('Excel文件解析需要先转换为CSV格式')
    }
    
    if (parsedData.length === 0) {
      getLogger().warn('[ExcelAdapter] 数据为空')
      return '数据为空'
    }
    
    // 提取字段信息
    getLogger().info('[ExcelAdapter] 开始提取字段信息')
    const fields = extractFields(parsedData)
    getLogger().info(`[ExcelAdapter] 字段提取完成，字段数: ${fields.length}`)
    
    // 计算描述统计
    getLogger().info('[ExcelAdapter] 开始计算描述统计')
    const descriptiveStats: Record<string, any> = {}
    fields.forEach(field => {
      const stats = calculateDescriptiveStats(parsedData, field.name, field.type)
      if (stats) {
        descriptiveStats[field.name] = stats
      }
    })
    getLogger().info(`[ExcelAdapter] 描述统计完成，统计字段数: ${Object.keys(descriptiveStats).length}`)
    
    // 执行聚合分析
    getLogger().info('[ExcelAdapter] 开始执行聚合分析')
    const aggregations: any[] = []
    const numericFields = fields.filter(f => f.type === 'number').map(f => f.name)
    if (numericFields.length > 0) {
      fields.forEach(field => {
        const agg = performAggregation(parsedData, field.name, numericFields)
        aggregations.push(agg)
      })
    }
    getLogger().info(`[ExcelAdapter] 聚合分析完成，聚合数: ${aggregations.length}`)
    
    // 返回JSON格式的分析结果
    const result = {
      fields,
      rowCount: parsedData.length,
      columnCount: fields.length,
      descriptiveStats,
      aggregations: aggregations.length > 0 ? aggregations : undefined
    }
    
    const resultJson = JSON.stringify(result, null, 2)
    getLogger().info(`[ExcelAdapter] 解析完成，结果JSON长度: ${resultJson.length}`)
    
    return resultJson
  }
}

/**
 * PPTX适配器
 */
class PptxAdapter implements ReferenceAdapter {
  supportedFormats = ['pptx', 'ppt']

  async parse(content: string | ArrayBuffer, format: string, metadata?: Record<string, unknown>): Promise<string> {
    // PPTX解析需要主进程支持（暂时返回提示）
    if (typeof content === 'string' && (content.startsWith('/') || /^[A-Za-z]:[\\/]/.test(content))) {
      // 可以通过主进程解析PPTX（需要实现）
      throw new Error('PPTX解析功能待实现')
    }
    
    throw new Error('PPTX解析需要文件路径，不支持ArrayBuffer输入')
  }
}

/**
 * Adapter管理器
 */
class ReferenceAdapterManager {
  private adapters: ReferenceAdapter[] = []

  constructor() {
    // 注册所有适配器
    this.adapters = [
      new PlainTextAdapter(),
      new HtmlAdapter(),
      new PdfAdapter(),
      new WordAdapter(),
      new ExcelAdapter(),
      new PptxAdapter()
    ]
  }

  /**
   * 根据格式获取适配器
   */
  getAdapter(format: string): ReferenceAdapter | null {
    const normalizedFormat = format.toLowerCase()
    
    for (const adapter of this.adapters) {
      if (adapter.supportedFormats.includes(normalizedFormat)) {
        return adapter
      }
    }
    
    return null
  }

  /**
   * 解析内容
   */
  async parse(content: string | ArrayBuffer, format: string, metadata?: Record<string, unknown>): Promise<string> {
    const adapter = this.getAdapter(format)
    
      if (!adapter) {
        // 如果没有适配器，尝试作为纯文本处理
        getLogger().warn(`未找到格式 ${format} 的适配器，使用纯文本处理`)
        return typeof content === 'string' ? content : new TextDecoder('utf-8').decode(content)
      }
    
    try {
      return await adapter.parse(content, format, metadata)
    } catch (error) {
      getLogger().error(`解析格式 ${format} 失败:`, error)
      throw error
    }
  }

  /**
   * 从文件扩展名推断格式
   */
  inferFormatFromFilename(filename: string): string {
    const match = filename.match(/\.([^.]+)$/)
    if (match) {
      return match[1].toLowerCase()
    }
    return 'txt'
  }

  /**
   * 从URL推断格式
   */
  inferFormatFromUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      const pathname = urlObj.pathname
      const match = pathname.match(/\.([^.]+)$/)
      if (match) {
        return match[1].toLowerCase()
      }
      
      // 检查Content-Type（需要先获取响应头）
      // 这里暂时返回html作为默认值
      return 'html'
    } catch {
      return 'html'
    }
  }
}

// 导出单例
export const referenceAdapterManager = new ReferenceAdapterManager()

