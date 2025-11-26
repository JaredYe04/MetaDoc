/**
 * 数据分析Tool
 * 自动分析CSV、JSON等数据，提取字段、描述统计、聚合分析等
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress,
  ToolLocales
} from '../../types/agent-tool'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import { createAiTask } from '../ai_tasks'
import { cancelAiTask } from '../ai_tasks'
import { ref } from 'vue'
import DataAnalysisDisplay from './components/DataAnalysisDisplay.vue'
import localIpcRenderer from '../web-adapter/local-ipc-renderer'
import { webMainCalls } from '../web-adapter/web-main-calls'
import axios from 'axios'

const logger = createRendererLogger('DataAnalysisTool')

/**
 * 判断路径是否为绝对路径（不依赖 Node.js path 模块）
 */
function isAbsolutePath(filePath: string): boolean {
  // Windows 绝对路径：C:\ 或 D:\ 等
  if (/^[A-Za-z]:[\\/]/.test(filePath)) {
    return true
  }
  // Unix 绝对路径：以 / 开头
  if (filePath.startsWith('/')) {
    return true
  }
  return false
}

/**
 * 规范化路径分隔符（统一使用 /）
 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

/**
 * 拼接路径（不依赖 Node.js path 模块）
 */
function joinPath(...parts: string[]): string {
  const normalized = parts.map(p => normalizePath(p))
  const joined = normalized.join('/')
  // 移除重复的斜杠，但保留开头的斜杠
  return joined.replace(/([^:])\/+/g, '$1/')
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

interface FieldInfo {
  name: string
  type: 'number' | 'string' | 'boolean' | 'date' | 'null'
  nullable: boolean
  uniqueCount: number
  sampleValues: any[]
}

interface DescriptiveStats {
  count: number
  mean?: number
  median?: number
  mode?: any
  std?: number
  variance?: number
  min?: number
  max?: number
  q25?: number
  q75?: number
}

interface AggregationResult {
  groupBy: string
  aggregations: Record<string, any>
}

interface DataAnalysisResult {
  fields: FieldInfo[]
  rowCount: number
  columnCount: number
  descriptiveStats: Record<string, DescriptiveStats>
  aggregations?: AggregationResult[]
  summary?: string
}

const dataAnalysisToolLocales: ToolLocales = {
  zh_cn: {
    name: '数据分析',
    description: '自动分析CSV、JSON等数据，提取字段信息、描述统计、聚合分析等',
    instruction: `
# 数据分析工具

## 功能描述
自动分析结构化数据（CSV、JSON等），提供：
- 自动提取字段和数据类型
- 描述统计信息（均值、中位数、众数、方差、标准差等）
- 自动进行所有字段的groupby聚合分析
- 支持自然语言指定分析需求

## 使用场景
- 数据探索
- 统计分析
- 数据质量检查
- 报表生成

## 输入格式
\`\`\`json
{
  "data": "string|array|object", // 必需，数据内容（CSV字符串、JSON字符串或对象）、文件路径或URL
  "format": "csv|json", // 必需，数据格式
  "dataSource": "inline|file|url", // 可选，数据来源类型，默认"inline"（内联数据）
  "analysisRequest": "string", // 可选，自然语言描述的分析需求
  "groupByFields": ["string"], // 可选，指定要groupby的字段
  "autoGroupBy": true // 可选，是否自动对所有字段进行groupby，默认true
}
\`\`\`

## 数据来源说明
- **inline（默认）**：data字段直接包含数据内容（CSV字符串、JSON字符串或对象）
- **file**：data字段为文件路径（相对路径或绝对路径），工具会读取文件内容
- **url**：data字段为URL地址，工具会通过HTTP请求获取数据

## 输出格式
\`\`\`json
{
  "fields": [
    {
      "name": "string",
      "type": "number|string|boolean|date|null",
      "nullable": true,
      "uniqueCount": 10,
      "sampleValues": []
    }
  ],
  "rowCount": 100,
  "columnCount": 5,
  "descriptiveStats": {
    "fieldName": {
      "count": 100,
      "mean": 50.5,
      "median": 50,
      "mode": 45,
      "std": 15.2,
      "variance": 231.04,
      "min": 10,
      "max": 90,
      "q25": 35,
      "q75": 65
    }
  },
  "aggregations": [
    {
      "groupBy": "category",
      "aggregations": {
        "price": { "sum": 1000, "avg": 50, "count": 20 }
      }
    }
  ],
  "summary": "数据分析摘要"
}
\`\`\`
`
  },
  en_us: {
    name: 'Data Analysis',
    description: 'Automatically analyze CSV, JSON data, extract fields, descriptive statistics, aggregations, etc.',
    instruction: `
# Data Analysis Tool

## Description
Automatically analyzes structured data (CSV, JSON) providing:
- Automatic field and data type extraction
- Descriptive statistics (mean, median, mode, variance, std dev)
- Automatic groupby aggregation for all fields
- Support for natural language analysis requests

## Input Format
\`\`\`json
{
  "data": "string|array|object",
  "format": "csv|json",
  "analysisRequest": "string",
  "groupByFields": ["string"],
  "autoGroupBy": true
}
\`\`\`
`
  }
}

/**
 * 解析CSV数据
 */
function parseCSV(csvString: string): any[] {
  const lines = csvString.trim().split('\n')
  if (lines.length === 0) return []

  const headers = lines[0].split(',').map(h => h.trim())
  const rows: any[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim())
    const row: any = {}
    headers.forEach((header, index) => {
      row[header] = values[index] || null
    })
    rows.push(row)
  }

  return rows
}

/**
 * 推断字段类型
 */
function inferType(value: any): 'number' | 'string' | 'boolean' | 'date' | 'null' {
  if (value === null || value === undefined || value === '') return 'null'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') {
    // 尝试解析为数字
    if (!isNaN(Number(value)) && value.trim() !== '') return 'number'
    // 尝试解析为日期
    if (!isNaN(Date.parse(value))) return 'date'
    return 'string'
  }
  return 'string'
}

/**
 * 提取字段信息
 */
function extractFields(data: any[]): FieldInfo[] {
  if (data.length === 0) return []

  const fieldNames = Object.keys(data[0])
  const fields: FieldInfo[] = []

  fieldNames.forEach(name => {
    const values = data.map(row => row[name])
    const types = values.map(v => inferType(v))
    const type = types.find(t => t !== 'null') || 'null'
    const nullable = types.includes('null')
    const uniqueValues = new Set(values.filter(v => v !== null && v !== undefined && v !== ''))
    const sampleValues = Array.from(uniqueValues).slice(0, 5)

    fields.push({
      name,
      type: type as any,
      nullable,
      uniqueCount: uniqueValues.size,
      sampleValues
    })
  })

  return fields
}

/**
 * 计算描述统计
 */
function calculateDescriptiveStats(data: any[], fieldName: string, fieldType: string): DescriptiveStats | null {
  const values = data.map(row => row[fieldName]).filter(v => v !== null && v !== undefined && v !== '')

  if (values.length === 0) return { count: 0 }

  const stats: DescriptiveStats = { count: values.length }

  if (fieldType === 'number') {
    const nums = values.map(v => Number(v)).filter(n => !isNaN(n))
    if (nums.length === 0) return stats

    nums.sort((a, b) => a - b)
    stats.mean = nums.reduce((sum, n) => sum + n, 0) / nums.length
    stats.median = nums.length % 2 === 0
      ? (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2
      : nums[Math.floor(nums.length / 2)]
    stats.min = nums[0]
    stats.max = nums[nums.length - 1]
    stats.q25 = nums[Math.floor(nums.length * 0.25)]
    stats.q75 = nums[Math.floor(nums.length * 0.75)]

    const variance = nums.reduce((sum, n) => sum + Math.pow(n - stats.mean!, 2), 0) / nums.length
    stats.variance = variance
    stats.std = Math.sqrt(variance)

    // 计算众数
    const frequency: Record<number, number> = {}
    nums.forEach(n => {
      frequency[n] = (frequency[n] || 0) + 1
    })
    const maxFreq = Math.max(...Object.values(frequency))
    stats.mode = Number(Object.keys(frequency).find(k => frequency[Number(k)] === maxFreq))
  } else if (fieldType === 'string') {
    // 字符串类型的众数
    const frequency: Record<string, number> = {}
    values.forEach(v => {
      frequency[String(v)] = (frequency[String(v)] || 0) + 1
    })
    const maxFreq = Math.max(...Object.values(frequency))
    stats.mode = Object.keys(frequency).find(k => frequency[k] === maxFreq)
  }

  return stats
}

/**
 * 执行聚合分析
 */
function performAggregation(data: any[], groupByField: string, numericFields: string[]): AggregationResult {
  const groups: Record<string, any[]> = {}

  data.forEach(row => {
    const key = String(row[groupByField] || 'null')
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(row)
  })

  const aggregations: Record<string, any> = {}

  numericFields.forEach(field => {
    const allValues: number[] = []
    Object.values(groups).forEach(group => {
      group.forEach(row => {
        const val = Number(row[field])
        if (!isNaN(val)) {
          allValues.push(val)
        }
      })
    })

    if (allValues.length > 0) {
      // 使用循环计算 min/max，避免展开运算符导致栈溢出
      let min = allValues[0]
      let max = allValues[0]
      for (let i = 1; i < allValues.length; i++) {
        if (allValues[i] < min) min = allValues[i]
        if (allValues[i] > max) max = allValues[i]
      }

      aggregations[field] = {
        sum: allValues.reduce((sum, v) => sum + v, 0),
        avg: allValues.reduce((sum, v) => sum + v, 0) / allValues.length,
        count: allValues.length,
        min: min,
        max: max
      }
    }
  })

  return {
    groupBy: groupByField,
    aggregations
  }
}

/**
 * 使用LLM生成分析摘要
 */
async function generateAnalysisSummary(
  result: DataAnalysisResult,
  analysisRequest?: string
): Promise<string> {
  const prompt = `分析以下数据分析结果，生成详细的分析摘要：

字段信息：
${JSON.stringify(result.fields, null, 2)}

描述统计：
${JSON.stringify(result.descriptiveStats, null, 2)}

${result.aggregations ? `聚合分析：\n${JSON.stringify(result.aggregations, null, 2)}` : ''}

${analysisRequest ? `用户分析需求：${analysisRequest}` : ''}

请提供详细的数据分析摘要，包括数据概况、关键发现、异常值等。`

  const target = ref('')
  const originKey = `data-analysis-summary-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const { handle, done } = createAiTask(
    '生成数据分析摘要',
    prompt,
    target,
    'answer',
    originKey,
    { temperature: 0.5, stream: false }
  )

  await done
  return target.value.trim()
}

/**
 * 从文件读取数据
 */
async function loadDataFromFile(filePath: string, signal?: AbortSignal): Promise<string> {
  if (!ipcRenderer) {
    throw new Error('IPC渲染器不可用，无法读取文件')
  }

  // 处理相对路径和测试数据目录占位符
  let resolvedPath = filePath
  
  if (filePath.includes('__TEST_DATA_DIR__')) {
    // 替换测试数据目录占位符
    // 占位符应该在 SettingDebugSection.vue 中已经被替换为实际路径
    // 如果这里还有占位符，说明是从其他地方调用的，尝试解析
    try {
      // 尝试获取应用根目录
      const appRoot = typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
      if (appRoot) {
        // 构建测试数据目录路径
        // 注意：appRoot 可能是 D:/MetaDoc/MetaDoc，需要找到 meta-doc 目录
        const testDataDir = joinPath(appRoot, 'meta-doc', 'src', 'renderer', 'src', 'utils', 'agent-tools', 'test-data')
        resolvedPath = filePath.replace(/__TEST_DATA_DIR__/g, testDataDir)
      } else {
        resolvedPath = filePath.replace(/__TEST_DATA_DIR__/g, './test-data')
      }
    } catch {
      resolvedPath = filePath.replace(/__TEST_DATA_DIR__/g, './test-data')
    }
  } else if (!isAbsolutePath(filePath)) {
    // 相对路径，需要基于工具文件所在目录解析
    // 工具文件在: meta-doc/src/renderer/src/utils/agent-tools/data-analysis-tool.ts
    // 所以相对路径应该基于: meta-doc/src/renderer/src/utils/agent-tools/
    try {
      const appRoot = typeof process !== 'undefined' && process.cwd ? process.cwd() : ''
      if (appRoot) {
        // 清理路径：移除 ./ 前缀
        let cleanPath = filePath.startsWith('./') ? filePath.substring(2) : filePath
        
        // 检查 appRoot 是否已经包含 meta-doc
        const normalizedRoot = normalizePath(appRoot)
        const hasMetaDoc = normalizedRoot.includes('/meta-doc/') || normalizedRoot.endsWith('/meta-doc') || normalizedRoot.endsWith('\\meta-doc')
        
        // 构建完整路径
        if (hasMetaDoc) {
          // 如果 appRoot 已经包含 meta-doc，直接拼接后续路径
          // 例如: D:/MetaDoc/MetaDoc/meta-doc -> D:/MetaDoc/MetaDoc/meta-doc/src/renderer/src/utils/agent-tools/test-data/...
          resolvedPath = joinPath(appRoot, 'src', 'renderer', 'src', 'utils', 'agent-tools', cleanPath)
        } else {
          // 如果 appRoot 不包含 meta-doc，需要添加
          // 例如: D:/MetaDoc/MetaDoc -> D:/MetaDoc/MetaDoc/meta-doc/src/renderer/src/utils/agent-tools/test-data/...
          resolvedPath = joinPath(appRoot, 'meta-doc', 'src', 'renderer', 'src', 'utils', 'agent-tools', cleanPath)
        }
      } else {
        // 如果无法获取根目录，使用原始路径（让主进程尝试解析）
        resolvedPath = filePath
      }
    } catch {
      // 如果无法解析，使用原始路径
      resolvedPath = filePath
    }
  }
  // 绝对路径直接使用，不需要处理

  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

  try {
    logger.info(`读取文件: ${resolvedPath}`)
    const content = await ipcRenderer.invoke('read-file-content', resolvedPath)
    return content
  } catch (error) {
    logger.error('读取文件失败:', error, '原始路径:', filePath, '解析后路径:', resolvedPath)
    throw new Error(`读取文件失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 从URL获取数据
 */
async function loadDataFromUrl(url: string, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

  try {
    // 验证 URL 格式
    try {
      new URL(url)
    } catch {
      throw new Error(`无效的URL格式: ${url}`)
    }

    logger.info(`从URL获取数据: ${url}`)

    // 使用 fetch 而不是 axios，避免某些情况下 axios 的栈溢出问题
    // 对于大文件，fetch 通常更稳定
    const controller = new AbortController()
    if (signal) {
      signal.addEventListener('abort', () => controller.abort())
    }

    const timeoutId = setTimeout(() => {
      controller.abort()
    }, 60000) // 60秒超时

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        method: 'GET',
        headers: {
          'Accept': 'text/csv,text/plain,application/json,*/*'
        }
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // 检查内容大小
      const contentLength = response.headers.get('content-length')
      if (contentLength) {
        const sizeInMB = parseInt(contentLength, 10) / (1024 * 1024)
        if (sizeInMB > 50) {
          throw new Error(`文件过大 (${sizeInMB.toFixed(2)}MB)，超过50MB限制。请使用本地文件。`)
        }
      }

      // 读取响应文本
      const text = await response.text()
      
      // 检查实际大小
      const actualSizeInMB = new Blob([text]).size / (1024 * 1024)
      if (actualSizeInMB > 50) {
        throw new Error(`文件过大 (${actualSizeInMB.toFixed(2)}MB)，超过50MB限制。请使用本地文件。`)
      }

      return text
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      
      if (fetchError.name === 'AbortError') {
        throw new Error('请求已取消或超时')
      }
      
      // 如果 fetch 失败，回退到 axios（但限制更严格）
      logger.warn('fetch 失败，尝试使用 axios:', fetchError)
      
      const response = await axios.get(url, {
        timeout: 30000, // 减少超时时间
        signal,
        responseType: 'text',
        validateStatus: () => true,
        maxContentLength: 10 * 1024 * 1024, // 限制为10MB
        maxBodyLength: 10 * 1024 * 1024,
        transformResponse: [(data) => {
          // 直接返回字符串，避免 JSON 解析导致的问题
          return typeof data === 'string' ? data : String(data)
        }]
      })

      if (response.status >= 200 && response.status < 300) {
        if (typeof response.data === 'string') {
          return response.data
        } else {
          return String(response.data)
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Maximum call stack size exceeded')) {
        throw new Error('从URL获取数据失败: 响应数据过大，可能导致栈溢出。请尝试使用较小的数据文件或本地文件。')
      }
      if (error.message.includes('AbortError') || error.message.includes('已取消')) {
        throw new Error('请求已取消')
      }
      throw new Error(`从URL获取数据失败: ${error.message}`)
    }
    logger.error('从URL获取数据失败:', error)
    throw error
  }
}

/**
 * 数据分析Tool回调函数
 */
const dataAnalysisToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const data = params.data
  const format = params.format as string
  const dataSource = (params.dataSource as 'inline' | 'file' | 'url') || 'inline'
  const analysisRequest = params.analysisRequest as string | undefined
  const groupByFields = (params.groupByFields as string[]) || []
  const autoGroupBy = params.autoGroupBy !== false // 默认true

  if (!data) {
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.dataAnalysis.error.missingData', '缺少必需参数: data')
    }
  }

  if (!format || !['csv', 'json'].includes(format)) {
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.dataAnalysis.error.invalidFormat', '无效的格式，支持: csv, json')
    }
  }

  try {
    onUpdate({
      content: {
        stage: 'loading',
        dataSource,
        format
      },
      format: 'json'
    }, {
      percentage: 5,
      message: i18n.global.t('agent.tool.dataAnalysis.progress.loading', '正在加载数据...')
    })

    // 根据数据来源加载数据
    let rawData: string
    if (dataSource === 'file') {
      if (typeof data !== 'string') {
        return {
          status: 'failed',
          error: '文件路径必须是字符串'
        }
      }
      rawData = await loadDataFromFile(data, signal)
    } else if (dataSource === 'url') {
      if (typeof data !== 'string') {
        return {
          status: 'failed',
          error: 'URL必须是字符串'
        }
      }
      rawData = await loadDataFromUrl(data, signal)
    } else {
      // inline模式，直接使用data
      if (typeof data === 'string') {
        rawData = data
      } else {
        rawData = JSON.stringify(data)
      }
    }

    onUpdate({
      content: {
        stage: 'parsing',
        format,
        dataSize: rawData.length
      },
      format: 'json'
    }, {
      percentage: 10,
      message: i18n.global.t('agent.tool.dataAnalysis.progress.parsing', '正在解析数据...')
    })

    // 解析数据
    let parsedData: any[]
    if (format === 'csv') {
      parsedData = parseCSV(rawData)
    } else {
      try {
        parsedData = JSON.parse(rawData)
        if (!Array.isArray(parsedData)) {
          parsedData = [parsedData]
        }
      } catch (error) {
        return {
          status: 'failed',
          error: `JSON解析失败: ${error instanceof Error ? error.message : String(error)}`
        }
      }
    }

    if (parsedData.length === 0) {
      return {
        status: 'failed',
        error: i18n.global.t('agent.tool.dataAnalysis.error.emptyData', '数据为空')
      }
    }

    onUpdate({
      content: {
        stage: 'extracting',
        rowCount: parsedData.length
      },
      format: 'json'
    }, {
      percentage: 30,
      message: i18n.global.t('agent.tool.dataAnalysis.progress.extracting', '正在提取字段信息...')
    })

    // 提取字段信息
    const fields = extractFields(parsedData)

    onUpdate({
      content: {
        stage: 'calculating',
        fields: fields.length
      },
      format: 'json'
    }, {
      percentage: 50,
      message: i18n.global.t('agent.tool.dataAnalysis.progress.calculating', '正在计算描述统计...')
    })

    // 计算描述统计
    const descriptiveStats: Record<string, DescriptiveStats> = {}
    fields.forEach(field => {
      const stats = calculateDescriptiveStats(parsedData, field.name, field.type)
      if (stats) {
        descriptiveStats[field.name] = stats
      }
    })

    // 执行聚合分析
    let aggregations: AggregationResult[] = []
    if (autoGroupBy || groupByFields.length > 0) {
      onUpdate({
        content: {
          stage: 'aggregating',
          fields: fields.length
        },
        format: 'json'
      }, {
        percentage: 70,
        message: i18n.global.t('agent.tool.dataAnalysis.progress.aggregating', '正在执行聚合分析...')
      })

      const numericFields = fields.filter(f => f.type === 'number').map(f => f.name)
      const fieldsToGroupBy = groupByFields.length > 0
        ? groupByFields
        : (autoGroupBy ? fields.map(f => f.name) : [])

      fieldsToGroupBy.forEach(fieldName => {
        if (numericFields.length > 0) {
          const agg = performAggregation(parsedData, fieldName, numericFields)
          aggregations.push(agg)
        }
      })
    }

    const result: DataAnalysisResult = {
      fields,
      rowCount: parsedData.length,
      columnCount: fields.length,
      descriptiveStats,
      aggregations: aggregations.length > 0 ? aggregations : undefined
    }

    // 使用LLM生成摘要
    if (analysisRequest || true) { // 默认生成摘要
      onUpdate({
        content: {
          stage: 'summarizing',
          result
        },
        format: 'json'
      }, {
        percentage: 85,
        message: i18n.global.t('agent.tool.dataAnalysis.progress.summarizing', '正在生成分析摘要...')
      })

      try {
        result.summary = await generateAnalysisSummary(result, analysisRequest)
      } catch (error) {
        logger.warn('生成分析摘要失败:', error)
      }
    }

    onUpdate({
      content: {
        stage: 'completed',
        result
      },
      format: 'json',
      componentName: 'DataAnalysisDisplay'
    }, {
      percentage: 100,
      message: i18n.global.t('agent.tool.dataAnalysis.progress.completed', '数据分析完成')
    })

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          result
        },
        format: 'json',
        componentName: 'DataAnalysisDisplay'
      },
      result
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('数据分析失败:', error)
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.dataAnalysis.error.failed', { error: errorMessage }, `数据分析失败: ${errorMessage}`)
    }
  }
}

export const dataAnalysisToolConfig: AgentToolConfig = {
  id: 'data-analysis',
  name: {
    'zh_cn': { name: '数据分析' },
    'en_us': { name: 'Data Analysis' },
    'de_DE': { name: 'Datenanalyse' },
    'fr_FR': { name: 'Analyse de données' },
    'ja_JP': { name: 'データ分析' },
    'ko_KR': { name: '데이터 분석' }
  } as any,
  description: {
    'zh_cn': { description: '自动分析CSV、JSON等数据，提取字段信息、描述统计、聚合分析等' },
    'en_us': { description: 'Automatically analyze CSV, JSON data, extract fields, descriptive statistics, aggregations, etc.' },
    'de_DE': { description: 'Analysiert automatisch CSV- und JSON-Daten, extrahiert Felder, beschreibende Statistiken, Aggregationen usw.' },
    'fr_FR': { description: 'Analyse automatiquement les données CSV, JSON, extrait les champs, statistiques descriptives, agrégations, etc.' },
    'ja_JP': { description: 'CSV、JSONデータを自動分析し、フィールド情報、記述統計、集計分析などを抽出' },
    'ko_KR': { description: 'CSV, JSON 데이터를 자동으로 분석하고 필드 정보, 기술 통계, 집계 분석 등 추출' }
  } as any,
  instruction: dataAnalysisToolLocales,
  origin: 'internal',
  tags: ['data', 'analysis', 'statistics', 'csv', 'json'],
  running: false,
  enabled: true,
  requiresLLM: true, // 用于生成分析摘要
  displayComponent: DataAnalysisDisplay,
  callback: dataAnalysisToolCallback,
  inputSchema: {
    type: 'object',
    properties: {
      data: {
        description: '数据内容（CSV字符串、JSON字符串或对象）、文件路径或URL'
      },
      format: {
        type: 'string',
        enum: ['csv', 'json'],
        description: '数据格式'
      },
      dataSource: {
        type: 'string',
        enum: ['inline', 'file', 'url'],
        description: '数据来源类型，默认inline（内联数据）',
        default: 'inline'
      },
      analysisRequest: {
        type: 'string',
        description: '自然语言描述的分析需求'
      },
      groupByFields: {
        type: 'array',
        items: { type: 'string' },
        description: '指定要groupby的字段'
      },
      autoGroupBy: {
        type: 'boolean',
        description: '是否自动对所有字段进行groupby',
        default: true
      }
    },
    required: ['data', 'format']
  },
  outputSchema: {
    type: 'object',
    properties: {
      fields: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            nullable: { type: 'boolean' },
            uniqueCount: { type: 'number' },
            sampleValues: { type: 'array' }
          }
        }
      },
      rowCount: { type: 'number' },
      columnCount: { type: 'number' },
      descriptiveStats: { type: 'object' },
      aggregations: { type: 'array' },
      summary: { type: 'string' }
    }
  },
  locales: dataAnalysisToolLocales
}

