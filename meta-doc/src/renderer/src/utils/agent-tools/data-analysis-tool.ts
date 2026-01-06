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
import type { AIDialogMessage } from '@/types'
import { createRendererLogger } from '../logger'
import { extractOuterJsonString } from '../regex-utils'
import { i18n } from '../../i18n'
import { createAiTask } from '../ai_tasks'
import { cancelAiTask } from '../ai_tasks'
import { ref } from 'vue'
import DataAnalysisDisplay from './components/DataAnalysisDisplay.vue'
import localIpcRenderer from '../web-adapter/local-ipc-renderer'
import { webMainCalls } from '../web-adapter/web-main-calls'
import axios from 'axios'

// 懒加载logger，避免初始化顺序问题
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('DataAnalysisTool')
  }
  return loggerInstance
}

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

/**
 * 字段分类类型
 */
type FieldCategory = 
  | 'categorical'      // 分类字段：唯一值少，适合直接分组（如：类型、标签、状态）
  | 'numeric'          // 数值字段：用于聚合计算
  | 'numeric-low-cardinality'  // 低基数数值字段：唯一值少，可以直接按值分组（如：等级、评分）
  | 'numeric-high-cardinality' // 高基数数值字段：唯一值多，需要分桶（如：价格、金额）
  | 'date'             // 日期字段：可以按时间粒度分组
  | 'boolean'          // 布尔字段：适合直接分组
  | 'unsuitable'       // 不适合聚合的字段：唯一值太多或全是唯一值

interface FieldCategoryInfo {
  category: FieldCategory
  groupByStrategy?: 'direct' | 'bucket' | 'date-granularity'
  bucketCount?: number
  dateGranularity?: 'year' | 'month' | 'day' | 'week'
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
  aggregations: Record<string, any>  // 键为分组值，值为该组的统计信息
  // 每个组的统计信息结构：
  // {
  //   count: number,  // 该组的行数
  //   numericFields?: Record<string, { sum, avg, count, min, max }>,  // 数值字段统计
  //   stringFields?: Record<string, { uniqueValues, valueCounts, valueRatios }>,  // 字符串字段统计
  //   booleanFields?: Record<string, { trueCount, falseCount, trueRatio, falseRatio }>,  // 布尔字段统计
  //   dateFields?: Record<string, { min, max, uniqueCount }>  // 日期字段统计
  // }
}

interface DataAnalysisResult {
  fields: FieldInfo[]
  rowCount: number
  columnCount: number
  descriptiveStats: Record<string, DescriptiveStats>
  aggregations?: AggregationResult[]
  summary?: string
  reportMarkdown?: string
}

const dataAnalysisToolLocales: ToolLocales = {
  zh_cn: {
    name: '数据分析',
    description: '自动分析CSV、JSON等数据，提取字段信息、描述统计、聚合分析等',
    instruction: `
# 数据分析工具

## 功能描述
自动分析结构化数据（CSV、JSON、XLS、XLSX等），提供：
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
  "format": "csv|json|xls|xlsx", // 必需，数据格式（支持csv、json、xls、xlsx）
  "dataSource": "inline|file|url", // 可选，数据来源类型，默认"inline"（内联数据）
  "analysisRequest": "string", // 可选，自然语言描述的分析需求
  "groupByFields": ["string"], // 可选，指定要groupby的字段
  "autoGroupBy": true, // 可选，是否自动对所有字段进行groupby，默认true
  "headerRowIndex": 0 // 可选，CSV表头行索引（从0开始）。如果不指定，将自动智能检测表头位置
}
\`\`\`

## 数据来源说明
- **inline（默认）**：data字段直接包含数据内容（CSV字符串、JSON字符串或对象）
  - ⚠️ **仅适用于小数据**：仅当数据量很小（几KB以内）时使用，不推荐用于大文件
- **file（推荐）**：data字段为文件路径（相对路径或绝对路径），工具会读取文件内容
  - ✅ **推荐使用**：对于用户上传的数据文件（CSV、XLSX、XLS等），优先使用此方式
  - ✅ **从引用素材获取路径**：如果用户在引用素材中上传了数据文件，从引用素材的 \`origin\` 字段获取文件路径
- **url（推荐）**：data字段为URL地址，工具会通过HTTP请求获取数据
  - ✅ **推荐使用**：对于网络数据源，优先使用此方式

## ⚠️ 重要使用原则

**优先使用文件路径或URL，不要直接输入数据内容！**

1. **推荐方式**：
   - ✅ 如果用户上传了数据文件，使用 \`dataSource: "file"\`，在 \`data\` 字段中传入文件路径
   - ✅ 如果数据来自网络，使用 \`dataSource: "url"\`，在 \`data\` 字段中传入URL地址
   - ✅ 如果用户在引用素材中上传了数据文件，从引用素材的 \`origin\` 字段获取文件路径

2. **避免的方式**：
   - ❌ **不要将读取到的reference内容全部输出一遍作为参数**：这样容易出错、效率低下、浪费token
   - ❌ **不要使用inline模式处理大文件**：对于大文件（超过几KB），绝对不要使用 \`dataSource: "inline"\` 直接输入数据内容

3. **使用示例**：
   \`\`\`json
   {
     "data": "/path/to/data.csv",
     "format": "csv",
     "dataSource": "file",
     "analysisRequest": "分析销售趋势"
   }
   \`\`\`
   或
   \`\`\`json
   {
     "data": "https://example.com/data.json",
     "format": "json",
     "dataSource": "url",
     "analysisRequest": "分析用户行为"
   }
   \`\`\`

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
  "data": "string|array|object", // Required: data content (CSV/JSON string/object), file path, or URL
  "format": "csv|json|xls|xlsx", // Required: data format (supports csv, json, xls, xlsx)
  "dataSource": "inline|file|url", // Optional: data source type, default "inline"
  "analysisRequest": "string", // Optional: natural language analysis request
  "groupByFields": ["string"], // Optional: fields to group by
  "autoGroupBy": true, // Optional: auto groupby for all fields, default true
  "headerRowIndex": 0 // Optional: CSV header row index (0-based). If not specified, will auto-detect header position intelligently
}
\`\`\`

## ⚠️ Important Usage Principles

**Prefer file paths or URLs, do NOT directly input data content!**

1. **Recommended approaches**:
   - ✅ If user uploaded a data file, use \`dataSource: "file"\` with file path in \`data\` field
   - ✅ If data is from network, use \`dataSource: "url"\` with URL in \`data\` field
   - ✅ If user uploaded data file in references, get file path from reference's \`origin\` field

2. **Avoid**:
   - ❌ **Do NOT output all reference content as parameters**: This is error-prone, inefficient, and wastes tokens
   - ❌ **Do NOT use inline mode for large files**: For large files (over a few KB), never use \`dataSource: "inline"\` to directly input data content

3. **Usage examples**:
   \`\`\`json
   {
     "data": "/path/to/data.csv",
     "format": "csv",
     "dataSource": "file",
     "analysisRequest": "Analyze sales trends"
   }
   \`\`\`
   or
   \`\`\`json
   {
     "data": "https://example.com/data.json",
     "format": "json",
     "dataSource": "url",
     "analysisRequest": "Analyze user behavior"
   }
   \`\`\`
`
  }
}

/**
 * 检测分隔符类型（逗号或制表符）
 */
function detectDelimiter(line: string): { delimiter: string; columns: string[] } {
  // 尝试制表符分隔
  const tabColumns = line.split('\t').map(c => c.trim())
  // 尝试逗号分隔
  const commaColumns = line.split(',').map(c => c.trim())
  
  // 如果制表符分隔的列数明显多于逗号分隔，使用制表符
  // 或者如果制表符分隔的列数 >= 3 且多于逗号分隔，使用制表符
  if (tabColumns.length >= 3 && tabColumns.length > commaColumns.length) {
    return { delimiter: '\t', columns: tabColumns }
  }
  
  // 默认使用逗号
  return { delimiter: ',', columns: commaColumns }
}

/**
 * 检测是否是标题行（通常只有一列或很少列，且内容较长）
 */
function isTitleRow(columns: string[]): boolean {
  if (columns.length === 0) return false
  // 如果只有1-2列，且内容较长，可能是标题行
  if (columns.length <= 2) {
    const totalLength = columns.reduce((sum, col) => sum + col.length, 0)
    if (totalLength > 20) {
      return true
    }
  }
  // 如果包含"统计"、"报告"等标题关键词
  const titleKeywords = ['统计', '报告', '汇总', '数据', '报表', '清单', '表']
  const content = columns.join('')
  if (titleKeywords.some(keyword => content.includes(keyword))) {
    return true
  }
  return false
}

/**
 * 检测是否是元数据行（通常列数较少，且包含"："等元数据标记）
 */
function isMetadataRow(columns: string[]): boolean {
  if (columns.length === 0) return false
  // 如果列数较少（1-5列），且包含"："等元数据标记
  if (columns.length <= 5) {
    const content = columns.join('')
    if (content.includes('：') || content.includes(':') || content.includes('填报') || content.includes('时间')) {
      return true
    }
  }
  return false
}

/**
 * 智能检测CSV表头行
 * 通过分析前几行，找出最可能是表头的行
 */
function detectHeaderRow(lines: string[], maxCheckRows: number = 10): number {
  if (lines.length === 0) return 0
  
  const checkRows = Math.min(maxCheckRows, lines.length)
  
  // 首先检测分隔符类型（使用前几行来判断）
  let detectedDelimiter = ','
  for (let i = 0; i < Math.min(3, lines.length); i++) {
    const { delimiter } = detectDelimiter(lines[i])
    if (delimiter === '\t') {
      detectedDelimiter = '\t'
      break
    }
  }
  
  let bestHeaderIndex = 0
  let bestScore = -1
  
  // 计算每行作为表头的得分
  for (let i = 0; i < checkRows; i++) {
    const line = lines[i]
    const { columns } = detectDelimiter(line)
    
    if (columns.length === 0) continue
    
    let score = 0
    const columnCount = columns.length
    
    // 0. 排除标题行和元数据行（重要！）
    if (isTitleRow(columns)) {
      score -= 100 // 大幅惩罚标题行
      if (score > bestScore) {
        bestScore = score
        bestHeaderIndex = i
      }
      continue
    }
    if (isMetadataRow(columns)) {
      score -= 80 // 大幅惩罚元数据行
      if (score > bestScore) {
        bestScore = score
        bestHeaderIndex = i
      }
      continue
    }
    
    // 1. 列数一致性：检查后续几行是否有相同的列数（最重要的指标）
    let consistentCount = 0
    const checkNextRows = Math.min(10, lines.length - i - 1)
    for (let j = 1; j <= checkNextRows && (i + j) < lines.length; j++) {
      const nextLine = lines[i + j]
      const { columns: nextColumns } = detectDelimiter(nextLine)
      // 排除后续的标题行和元数据行
      if (isTitleRow(nextColumns) || isMetadataRow(nextColumns)) {
        continue
      }
      if (nextColumns.length === columnCount && columnCount >= 3) {
        consistentCount++
      }
    }
    score += consistentCount * 25 // 列数一致性权重（进一步提高）
    
    // 如果后续行列数一致的行数 >= 3，说明这很可能是表头
    if (consistentCount >= 3 && columnCount >= 3) {
      score += 60 // 大幅加分（提高）
    }
    
    // 2. 列数突然增加：如果这一行的列数明显多于前面的行，可能是表头
    if (i > 0) {
      const prevLine = lines[i - 1]
      const { columns: prevColumns } = detectDelimiter(prevLine)
      // 如果前一行是标题或元数据，跳过这个检查
      if (!isTitleRow(prevColumns) && !isMetadataRow(prevColumns)) {
        if (columnCount > prevColumns.length * 1.5 && columnCount >= 3) {
          score += 40 // 列数突然增加加分（提高）
        }
      }
    }
    
    // 3. 表头特征：检查是否包含常见的表头关键词（中英文）
    const headerKeywords = [
      'id', 'name', 'type', 'date', 'time', 'value', 'price', 'amount',
      'count', 'total', 'sum', 'avg', 'min', 'max', 'status', 'state',
      '编号', '名称', '类型', '日期', '时间', '值', '价格', '金额',
      '数量', '总计', '状态', '说明', '描述', '备注', '序号', '姓名',
      '班级', '性别', '学校', '成绩', '分数', '排名', '位次', '联系',
      '电话', '地址', '邮箱', '年龄', '性别', '职业', '部门', '职位',
      '报名', '考生', '是否', '复读', '语文', '数学', '外语', '政治',
      '历史', '地理', '物理', '化学', '生物', '技术', '总分'
    ]
    const lowerColumns = columns.map(c => c.toLowerCase())
    const keywordMatches = lowerColumns.filter(col => 
      headerKeywords.some(keyword => col.includes(keyword) || keyword.includes(col))
    ).length
    score += keywordMatches * 10 // 关键词匹配权重（进一步提高）
    
    // 4. 数据类型多样性：表头通常都是字符串，数据行会有数字等
    // 如果这一行大部分是字符串（非数字），更可能是表头
    let stringCount = 0
    let numberCount = 0
    columns.forEach(col => {
      if (!col || col === '') return
      // 检查是否是纯数字
      if (/^-?\d+(\.\d+)?$/.test(col) || /^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(col)) {
        numberCount++
      } else {
        stringCount++
      }
    })
    const stringRatio = stringCount / columns.length
    // 如果字符串比例高，更可能是表头
    if (stringRatio > 0.7) {
      score += stringRatio * 25 // 字符串比例权重（进一步提高）
    }
    // 如果数字比例高，更可能是数据行
    if (numberCount / columns.length > 0.5) {
      score -= 30 // 数字比例高惩罚（提高）
    }
    
    // 5. 空值比例：表头通常不会有太多空值
    const emptyCount = columns.filter(c => !c || c === '').length
    const emptyRatio = emptyCount / columns.length
    if (emptyRatio > 0.3) {
      score -= emptyRatio * 20 // 空值惩罚（提高）
    }
    
    // 6. 长度一致性：表头各列长度通常比较均匀（但不要过于严格）
    const lengths = columns.filter(c => c).map(c => c.length)
    if (lengths.length > 0) {
      const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length
      const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length
      // 如果长度方差不太大，可能是表头
      if (variance < 100) {
        score += 5
      }
    }
    
    // 7. 列数要求：表头通常至少有3列
    if (columnCount < 3) {
      score -= 40 // 列数太少惩罚（提高）
    } else if (columnCount >= 5) {
      score += 15 // 列数多加分（提高）
    }
    
    // 8. 位置权重：越靠前越可能是表头（但权重较小，且不能是第一行）
    if (i === 0) {
      score -= 10 // 第一行通常是标题，轻微惩罚
    } else {
      score += (checkRows - i) * 1
    }
    
    if (score > bestScore) {
      bestScore = score
      bestHeaderIndex = i
    }
  }
  
  return bestHeaderIndex
}

/**
 * 解析CSV数据（智能识别表头，支持逗号和制表符分隔）
 * @param csvString CSV字符串
 * @param headerRowIndex 可选，手动指定表头行索引（从0开始）。如果不指定，将自动检测
 */
export function parseCSV(csvString: string, headerRowIndex?: number): any[] {
  const lines = csvString.trim().split('\n').filter(line => line.trim())
  if (lines.length === 0) return []

  // 如果指定了表头行索引，直接使用；否则智能检测
  let finalHeaderRowIndex: number
  if (headerRowIndex !== undefined && headerRowIndex >= 0 && headerRowIndex < lines.length) {
    finalHeaderRowIndex = headerRowIndex
  } else {
    // 智能检测表头行（增加检查行数到10行）
    finalHeaderRowIndex = detectHeaderRow(lines, 10)
  }
  
  const headerLine = lines[finalHeaderRowIndex]
  
  // 检测分隔符
  const { delimiter: headerDelimiter, columns: headers } = detectDelimiter(headerLine)
  
  // 如果表头有空值，使用默认名称
  const processedHeaders = headers.map((h, i) => h || `列${i + 1}`)
  
  const rows: any[] = []

  // 从表头行的下一行开始解析数据
  for (let i = finalHeaderRowIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    // 使用与表头相同的分隔符
    const { delimiter, columns: values } = detectDelimiter(line)
    // 优先使用表头的分隔符，如果当前行分隔符不同，尝试使用表头分隔符
    const finalValues = headerDelimiter === delimiter ? values : line.split(headerDelimiter).map(v => v.trim())
    
    const row: any = {}
    processedHeaders.forEach((header, index) => {
      row[header] = finalValues[index] || null
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
 * 自动剔除全为null或空的列
 */
export function extractFields(data: any[]): FieldInfo[] {
  if (data.length === 0) return []

  const fieldNames = Object.keys(data[0])
  const fields: FieldInfo[] = []

  fieldNames.forEach(name => {
    const values = data.map(row => row[name])
    
    // 过滤掉null、undefined和空字符串，检查是否有有效值
    const validValues = values.filter(v => v !== null && v !== undefined && v !== '')
    
    // 如果该列全为null或空，则跳过（不包含在字段列表中）
    if (validValues.length === 0) {
      return
    }
    
    const types = values.map(v => inferType(v))
    const type = types.find(t => t !== 'null') || 'null'
    const nullable = types.includes('null')
    const uniqueValues = new Set(validValues)
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
export function calculateDescriptiveStats(data: any[], fieldName: string, fieldType: string): DescriptiveStats | null {
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
 * 对字段进行分类，确定聚合策略
 * 智能判断字段是否适合分组聚合，避免对编号类字段（如手机号、身份证号、学号）和唯一值占主导的字段进行分组
 * @param field 字段信息
 * @param totalRows 总行数
 * @returns 字段分类信息
 */
function categorizeField(field: FieldInfo, totalRows: number): FieldCategoryInfo {
  const uniqueRatio = field.uniqueCount / totalRows
  
  const UNIQUE_COUNT_THRESHOLD = 10
  const UNIQUE_RATIO_THRESHOLD = 0.5 // 50%
  
  // 数值字段：对于数值类型，不管什么情况，均进行分组聚合（跳过通用规则）
  if (field.type === 'number') {
    // 如果唯一值数量 <= 1，不适合分组（没有分组意义）
    if (field.uniqueCount <= 1) {
      return {
        category: 'unsuitable'
      }
    }
    
    // 如果唯一值比例 <= 20%，直接按值分组（每个组对应每个分数值）
    // 例如：50人的班级，语文有10个不同分数（比例20%），直接按这10个分数值分组
    if (uniqueRatio <= 0.2) {
      return {
        category: 'numeric-low-cardinality',
        groupByStrategy: 'direct'
      }
    }
    
    // 如果唯一值比例 > 20%，进行分桶（分区间）
    // 分桶数根据唯一值数量来确定：唯一值越多，说明数据越精细，需要使用更多的桶
    let bucketCount = 10
    
    // 根据唯一值数量确定分桶数
    if (field.uniqueCount > 500) {
      bucketCount = 25
    } else if (field.uniqueCount > 200) {
      bucketCount = 20
    } else if (field.uniqueCount > 100) {
      bucketCount = 15
    } else if (field.uniqueCount > 50) {
      bucketCount = 12
    } else if (field.uniqueCount > 30) {
      bucketCount = 10
    } else {
      // 唯一值数量较少（<= 30），使用较少分桶数
      bucketCount = 8
    }
    
    return {
      category: 'numeric-high-cardinality',
      groupByStrategy: 'bucket',
      bucketCount
    }
  }
  
  // 对于非数值字段，应用通用规则
  // 规则1：如果唯一值数量 <= 1，不适合分组（没有分组意义）
  if (field.uniqueCount <= 1) {
    return {
      category: 'unsuitable'
    }
  }
  
  // 规则2：如果唯一值数量 > 阈值（10）且唯一值数量 >= 总行数的一半，则不适合分组
  // 这可以识别编号类字段（手机号、身份证号、学号等）和唯一值占主导的字段（如姓名）
  // 注意：这个规则不适用于数值字段，数值字段已经在上面处理了
  if (field.uniqueCount > UNIQUE_COUNT_THRESHOLD && uniqueRatio >= UNIQUE_RATIO_THRESHOLD) {
    return {
      category: 'unsuitable'
    }
  }
  
  // 布尔字段：直接分组（但需要满足上面的通用规则）
  if (field.type === 'boolean') {
    // 布尔字段通常只有2个唯一值，不会触发上面的规则
    return {
      category: 'boolean',
      groupByStrategy: 'direct'
    }
  }
  
  // 日期字段：按时间粒度分组
  if (field.type === 'date') {
    // 如果唯一值比例太高，可能是时间戳类数据，不适合分组
    if (uniqueRatio >= UNIQUE_RATIO_THRESHOLD) {
      return {
        category: 'unsuitable'
      }
    }
    // 根据数据量选择合适的时间粒度
    if (totalRows < 100) {
      return {
        category: 'date',
        groupByStrategy: 'date-granularity',
        dateGranularity: 'day'
      }
    } else if (totalRows < 1000) {
      return {
        category: 'date',
        groupByStrategy: 'date-granularity',
        dateGranularity: 'week'
      }
    } else if (totalRows < 10000) {
      return {
        category: 'date',
        groupByStrategy: 'date-granularity',
        dateGranularity: 'month'
      }
    } else {
      return {
        category: 'date',
        groupByStrategy: 'date-granularity',
        dateGranularity: 'year'
      }
    }
  }
  
  // 字符串字段
  if (field.type === 'string') {
    // 如果唯一值比例 >= 50%，可能是姓名等唯一值占主导的字段，不适合分组
    if (uniqueRatio >= UNIQUE_RATIO_THRESHOLD) {
      return {
        category: 'unsuitable'
      }
    }
    
    // 如果唯一值比例 < 30% 且唯一值数量 <= 100，视为分类字段，适合分组
    if (uniqueRatio < 0.3 && field.uniqueCount <= 100) {
      return {
        category: 'categorical',
        groupByStrategy: 'direct'
      }
    }
    
    // 如果唯一值比例在 30% - 50% 之间，且唯一值数量 <= 200，可以尝试分组
    if (uniqueRatio >= 0.3 && uniqueRatio < UNIQUE_RATIO_THRESHOLD && field.uniqueCount <= 200) {
      return {
        category: 'categorical',
        groupByStrategy: 'direct'
      }
    }
    
    // 其他情况不适合分组
    return {
      category: 'unsuitable'
    }
  }
  
  // 其他类型或null类型
  return {
    category: 'unsuitable'
  }
}

/**
 * 对数值进行分桶
 * @param value 数值
 * @param min 最小值
 * @param max 最大值
 * @param bucketCount 分桶数量
 * @returns 分桶标签
 */
function bucketNumericValue(value: number, min: number, max: number, bucketCount: number): string {
  if (min === max) {
    return `${min}`
  }
  
  const bucketSize = (max - min) / bucketCount
  const bucketIndex = Math.min(Math.floor((value - min) / bucketSize), bucketCount - 1)
  const bucketMin = min + bucketIndex * bucketSize
  const bucketMax = bucketIndex === bucketCount - 1 ? max : min + (bucketIndex + 1) * bucketSize
  
  // 格式化范围标签
  if (bucketIndex === bucketCount - 1) {
    return `[${bucketMin.toFixed(2)}, ${bucketMax.toFixed(2)}]`
  } else {
    return `[${bucketMin.toFixed(2)}, ${bucketMax.toFixed(2)})`
  }
}

/**
 * 对日期进行分组（按时间粒度）
 * @param dateValue 日期值
 * @param granularity 时间粒度
 * @returns 分组标签
 */
function groupDateValue(dateValue: any, granularity: 'year' | 'month' | 'day' | 'week'): string {
  try {
    const date = new Date(dateValue)
    if (isNaN(date.getTime())) {
      return 'invalid-date'
    }
    
    switch (granularity) {
      case 'year':
        return `${date.getFullYear()}年`
      case 'month':
        return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月`
      case 'week':
        // 计算是第几周
        const startOfYear = new Date(date.getFullYear(), 0, 1)
        const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
        const week = Math.ceil((days + startOfYear.getDay() + 1) / 7)
        return `${date.getFullYear()}年第${week}周`
      case 'day':
        return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日`
      default:
        return String(dateValue)
    }
  } catch {
    return 'invalid-date'
  }
}

/**
 * 执行聚合分析（改进版：智能选择分组策略，按组分别统计所有字段类型）
 * @param data 数据
 * @param groupByField 分组字段名
 * @param allFields 所有字段信息列表（用于统计所有字段类型）
 * @param groupByFieldInfo 分组字段的分类信息
 * @param totalRows 总行数
 * @returns 聚合结果
 */
export function performAggregation(
  data: any[], 
  groupByField: string, 
  allFields: FieldInfo[],
  groupByFieldInfo?: FieldCategoryInfo,
  totalRows?: number
): AggregationResult {
  const groups: Record<string, any[]> = {}
  
  // 根据字段类型和策略进行分组
  if (groupByFieldInfo?.groupByStrategy === 'bucket' && groupByFieldInfo.category === 'numeric-high-cardinality') {
    // 数值字段分桶
    const values = data.map(row => Number(row[groupByField])).filter(v => !isNaN(v))
    if (values.length > 0) {
      let min = values[0]
      let max = values[0]
      for (let i = 1; i < values.length; i++) {
        if (values[i] < min) min = values[i]
        if (values[i] > max) max = values[i]
      }
      
      const bucketCount = groupByFieldInfo.bucketCount || 10
      data.forEach(row => {
        const val = Number(row[groupByField])
        if (!isNaN(val)) {
          const bucketKey = bucketNumericValue(val, min, max, bucketCount)
          if (!groups[bucketKey]) {
            groups[bucketKey] = []
          }
          groups[bucketKey].push(row)
        } else {
          const nullKey = 'null'
          if (!groups[nullKey]) {
            groups[nullKey] = []
          }
          groups[nullKey].push(row)
        }
      })
    }
  } else if (groupByFieldInfo?.groupByStrategy === 'date-granularity' && groupByFieldInfo.dateGranularity) {
    // 日期字段按时间粒度分组
    data.forEach(row => {
      const dateValue = row[groupByField]
      const key = dateValue ? groupDateValue(dateValue, groupByFieldInfo.dateGranularity!) : 'null'
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(row)
    })
  } else {
    // 直接按值分组（分类字段、低基数数值字段、布尔字段等）
    data.forEach(row => {
      const key = String(row[groupByField] || 'null')
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(row)
    })
  }

  // 按组分别统计所有字段
  const aggregations: Record<string, any> = {}

  // 对每个分组进行统计
  Object.entries(groups).forEach(([groupKey, groupData]) => {
    const groupStats: any = {
      count: groupData.length
    }

    // 获取除分组字段外的所有字段
    const fieldsToAnalyze = allFields.filter(f => f.name !== groupByField)

    // 按字段类型分别统计
    const numericFields: Record<string, any> = {}
    const stringFields: Record<string, any> = {}
    const booleanFields: Record<string, any> = {}
    const dateFields: Record<string, any> = {}

    fieldsToAnalyze.forEach(field => {
      if (field.type === 'number') {
        // 数值字段：计算 sum, avg, count, min, max（只使用有效数据）
        // 注意：count 是有效数据的数量，不是总行数
        const values = groupData
          .map(row => row[field.name])
          .filter(v => v !== null && v !== undefined && v !== '')
          .map(v => Number(v))
          .filter(v => !isNaN(v))

        if (values.length > 0) {
          let min = values[0]
          let max = values[0]
          for (let i = 1; i < values.length; i++) {
            if (values[i] < min) min = values[i]
            if (values[i] > max) max = values[i]
          }

          numericFields[field.name] = {
            sum: values.reduce((sum, v) => sum + v, 0),
            avg: values.reduce((sum, v) => sum + v, 0) / values.length,
            count: values.length, // 有效数据的数量
            min: min,
            max: max
          }
        }
      } else if (field.type === 'string') {
        // 字符串字段：只统计分组信息（唯一值、每个值的数量、比例），不进行数值聚合
        // 对于姓名、城市等字符串字段，只需要保留不同分组集合包含的数据
        const values = groupData
          .map(row => row[field.name])
          .filter(v => v !== null && v !== undefined && v !== '')
        
        if (values.length > 0) {
          const valueCounts: Record<string, number> = {}
          values.forEach(v => {
            const strValue = String(v)
            valueCounts[strValue] = (valueCounts[strValue] || 0) + 1
          })

          const uniqueValues = Object.keys(valueCounts)
          const valueRatios: Record<string, number> = {}
          uniqueValues.forEach(v => {
            valueRatios[v] = valueCounts[v] / values.length
          })

          // 按数量排序，获取前10个最常见的值
          const topValues = uniqueValues
            .map(v => ({ value: v, count: valueCounts[v], ratio: valueRatios[v] }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)

          stringFields[field.name] = {
            uniqueValues: uniqueValues,
            uniqueCount: uniqueValues.length,
            valueCounts: valueCounts,
            valueRatios: valueRatios,
            topValues: topValues,
            totalCount: values.length // 有效数据的数量
          }
        }
      } else if (field.type === 'boolean') {
        // 布尔字段：统计 true/false 的数量和比例（只使用有效数据）
        const values = groupData
          .map(row => row[field.name])
          .filter(v => v !== null && v !== undefined)
        
        if (values.length > 0) {
          let trueCount = 0
          let falseCount = 0
          values.forEach(v => {
            if (v === true || v === 'true' || v === 1 || v === '1') {
              trueCount++
            } else {
              falseCount++
            }
          })

          booleanFields[field.name] = {
            trueCount: trueCount,
            falseCount: falseCount,
            trueRatio: trueCount / values.length,
            falseRatio: falseCount / values.length,
            totalCount: values.length // 有效数据的数量
          }
        }
      } else if (field.type === 'date') {
        // 日期字段：可以进行聚合统计（min/max日期），也可以统计唯一值数量
        // 注意：count 是有效数据的数量，不是总行数
        const values = groupData
          .map(row => row[field.name])
          .filter(v => v !== null && v !== undefined && v !== '')
        
        if (values.length > 0) {
          const dates = values
            .map(v => {
              try {
                const date = new Date(v)
                return isNaN(date.getTime()) ? null : date
              } catch {
                return null
              }
            })
            .filter(d => d !== null) as Date[]
          
          if (dates.length > 0) {
            let minDate = dates[0]
            let maxDate = dates[0]
            for (let i = 1; i < dates.length; i++) {
              if (dates[i] < minDate) minDate = dates[i]
              if (dates[i] > maxDate) maxDate = dates[i]
            }

            const uniqueDates = new Set(dates.map(d => d.toISOString().split('T')[0]))
            
            dateFields[field.name] = {
              min: minDate.toISOString().split('T')[0],
              max: maxDate.toISOString().split('T')[0],
              uniqueCount: uniqueDates.size,
              totalCount: dates.length // 有效数据的数量
            }
          }
        }
      }
      // 注意：其他类型（如null类型）不进行统计
    })

    // 只添加非空的统计信息
    if (Object.keys(numericFields).length > 0) {
      groupStats.numericFields = numericFields
    }
    if (Object.keys(stringFields).length > 0) {
      groupStats.stringFields = stringFields
    }
    if (Object.keys(booleanFields).length > 0) {
      groupStats.booleanFields = booleanFields
    }
    if (Object.keys(dateFields).length > 0) {
      groupStats.dateFields = dateFields
    }

    aggregations[groupKey] = groupStats
  })

  return {
    groupBy: groupByField,
    aggregations
  }
}

/**
 * 生成固定模板的分析报告（不调用LLM）
 */
function generateTemplateReport(
  result: DataAnalysisResult,
  analysisRequest?: string
): string {
  const locale = (i18n.global.locale as any).value || i18n.global.locale || 'zh_CN'
  const isZh = String(locale) === 'zh_CN'
  
  let report = ''
  
  // 标题
  report += `# ${isZh ? '数据分析报告' : 'Data Analysis Report'}\n\n`
  
  // 数据概况
  report += `## ${isZh ? '数据概况' : 'Data Overview'}\n\n`
  report += `- ${isZh ? '总行数' : 'Total Rows'}: ${result.rowCount}\n`
  report += `- ${isZh ? '总列数' : 'Total Columns'}: ${result.columnCount}\n\n`
  
  // 字段信息
  report += `## ${isZh ? '字段信息' : 'Field Information'}\n\n`
  result.fields.forEach(field => {
    report += `### ${field.name}\n`
    report += `- ${isZh ? '类型' : 'Type'}: ${field.type}\n`
    report += `- ${isZh ? '可空' : 'Nullable'}: ${field.nullable ? (isZh ? '是' : 'Yes') : (isZh ? '否' : 'No')}\n`
    report += `- ${isZh ? '唯一值数量' : 'Unique Values'}: ${field.uniqueCount}\n`
    if (field.sampleValues.length > 0) {
      report += `- ${isZh ? '示例值' : 'Sample Values'}: ${field.sampleValues.slice(0, 3).join(', ')}\n`
    }
    report += `\n`
  })
  
  // 描述统计
  if (Object.keys(result.descriptiveStats).length > 0) {
    report += `## ${isZh ? '描述统计' : 'Descriptive Statistics'}\n\n`
    Object.entries(result.descriptiveStats).forEach(([fieldName, stats]) => {
      report += `### ${fieldName}\n`
      if (stats.count !== undefined) report += `- ${isZh ? '数量' : 'Count'}: ${stats.count}\n`
      if (stats.mean !== undefined) report += `- ${isZh ? '均值' : 'Mean'}: ${stats.mean.toFixed(2)}\n`
      if (stats.median !== undefined) report += `- ${isZh ? '中位数' : 'Median'}: ${stats.median.toFixed(2)}\n`
      if (stats.min !== undefined) report += `- ${isZh ? '最小值' : 'Min'}: ${stats.min}\n`
      if (stats.max !== undefined) report += `- ${isZh ? '最大值' : 'Max'}: ${stats.max}\n`
      if (stats.std !== undefined) report += `- ${isZh ? '标准差' : 'Std Dev'}: ${stats.std.toFixed(2)}\n`
      report += `\n`
    })
  }
  
  // 聚合分析
  if (result.aggregations && result.aggregations.length > 0) {
    report += `## ${isZh ? '聚合分析' : 'Aggregation Analysis'}\n\n`
    result.aggregations.forEach(agg => {
      report += `### ${isZh ? '按' : 'Group By'} ${agg.groupBy}\n\n`
      Object.entries(agg.aggregations).forEach(([fieldName, aggData]: [string, any]) => {
        report += `**${fieldName}**:\n`
        if (aggData.sum !== undefined) report += `- ${isZh ? '总和' : 'Sum'}: ${aggData.sum}\n`
        if (aggData.avg !== undefined) report += `- ${isZh ? '平均值' : 'Average'}: ${aggData.avg.toFixed(2)}\n`
        if (aggData.count !== undefined) report += `- ${isZh ? '数量' : 'Count'}: ${aggData.count}\n`
        if (aggData.min !== undefined) report += `- ${isZh ? '最小值' : 'Min'}: ${aggData.min}\n`
        if (aggData.max !== undefined) report += `- ${isZh ? '最大值' : 'Max'}: ${aggData.max}\n`
        report += `\n`
      })
    })
  }
  
  // 用户分析需求
  if (analysisRequest) {
    report += `## ${isZh ? '用户分析需求' : 'User Analysis Request'}\n\n`
    report += `${analysisRequest}\n\n`
  }
  
  return report
}

/**
 * 使用LLM生成分析摘要（文本摘要或Markdown报告混合版）
 * @returns 返回包含targetRef和donePromise的对象，调用者需要await donePromise后再读取targetRef.value获取summary
 */
function generateAnalysisSummary(
  result: DataAnalysisResult,
  analysisRequest?: string,
  generateReport: boolean = false
): {
  summary: string
  targetRef?: Ref<string>
  donePromise?: Promise<any>
} {
  // 如果未启用报告生成，生成固定模板（不调用LLM）
  if (!generateReport) {
    return {
      summary: generateTemplateReport(result, analysisRequest)
    }
  }
  
  // 如果启用了报告生成，调用LLM生成文本摘要（可以混合markdown报告）
  // 调整提示词，生成文本摘要和markdown报告的混合版
  const prompt = `${analysisRequest ? `## 用户分析需求（请优先关注并重点分析）

${analysisRequest}

---

## 数据分析结果

` : `## 数据分析结果

`}字段信息：
${JSON.stringify(result.fields)}

描述统计：
${JSON.stringify(result.descriptiveStats)}

${result.aggregations ? `聚合分析：\n${JSON.stringify(result.aggregations)}` : ''}

---

## 分析要求

${analysisRequest ? `**请根据上述用户分析需求，重点分析和回答用户提出的问题。**\n\n` : ''}请提供详细的数据分析摘要，包括：
1. 数据概况（总行数、总列数等）
2. 关键发现和洞察${analysisRequest ? '（特别关注用户提出的分析需求）' : ''}
3. 异常值或数据质量问题
4. 建议的可视化图表类型${analysisRequest ? '\n5. 针对用户分析需求的具体回答和建议' : ''}

${analysisRequest ? `\n**重要提示：请确保报告内容直接回答和满足用户的分析需求："${analysisRequest}"**` : ''}

使用Markdown格式。`

  const target = ref('')
  const originKey = `data-analysis-summary-${Date.now()}-${Math.random().toString(36).slice(2)}`
  // 温度配置将在llm-api.js中从全局配置读取
  const messages: AIDialogMessage[] = [{
    role: 'user',
    content: prompt,
  }]
  const { handle, done } = createAiTask(
    '生成数据分析摘要',
    messages,
    target,
    'chat',
    originKey,
    { stream: true }
  )

  // 立即返回target和done，不等待done完成
  // 调用者需要await donePromise后再读取targetRef.value获取summary
  return {
    summary: '', // 初始为空，需要等待donePromise完成后再读取targetRef.value
    targetRef: target,
    donePromise: done
  }
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
    getLogger().info(`读取文件: ${resolvedPath}`)
    const content = await ipcRenderer.invoke('read-file-content', resolvedPath) as string
    return content
  } catch (error) {
    getLogger().error('读取文件失败:', error, '原始路径:', filePath, '解析后路径:', resolvedPath)
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

    getLogger().info(`从URL获取数据: ${url}`)

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
      getLogger().warn('fetch 失败，尝试使用 axios:', fetchError)
      
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
    getLogger().error('从URL获取数据失败:', error)
    throw error
  }
}

/**
 * 数据分析Tool回调函数
 */
export const dataAnalysisToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const data = params.data
  const format = params.format as string
  const dataSource = (params.dataSource as 'inline' | 'file' | 'url') || 'inline'
  const analysisRequest = params.analysisRequest as string | undefined
  const groupByFields = (params.groupByFields as string[]) || []
  const autoGroupBy = params.autoGroupBy !== false // 默认true
  const generateReport = params.generateReport === true // 默认false，只有明确为true时才生成
  const headerRowIndex = params.headerRowIndex !== undefined ? (params.headerRowIndex as number) : undefined

  if (!data) {
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.dataAnalysis.error.missingData', '缺少必需参数: data')
    }
  }

  // 根据文件路径自动推断format（如果未指定或为file模式）
  let inferredFormat = format
  if (dataSource === 'file' && typeof data === 'string' && (!format || format === 'auto')) {
    const ext = data.toLowerCase().match(/\.([^.]+)$/)?.[1]
    if (ext === 'xlsx' || ext === 'xls') {
      inferredFormat = ext
    } else if (ext === 'csv') {
      inferredFormat = 'csv'
    } else if (ext === 'json') {
      inferredFormat = 'json'
    }
  }

  // 支持csv、json、xls、xlsx格式
  const supportedFormats = ['csv', 'json', 'xls', 'xlsx']
  if (!inferredFormat || !supportedFormats.includes(inferredFormat)) {
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.dataAnalysis.error.invalidFormat', `无效的格式，支持: ${supportedFormats.join(', ')}`)
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
        format: inferredFormat,
        dataSize: rawData.length
      },
      format: 'json'
    }, {
      percentage: 10,
      message: i18n.global.t('agent.tool.dataAnalysis.progress.parsing', '正在解析数据...')
    })

    // 解析数据
    let parsedData: any[]
    if (inferredFormat === 'csv') {
      parsedData = parseCSV(rawData, headerRowIndex)
    } else if (inferredFormat === 'xls' || inferredFormat === 'xlsx') {
      // Excel文件需要特殊处理：通过主进程转换为CSV格式
      if (dataSource === 'file' && typeof data === 'string') {
        try {
          if (!ipcRenderer) {
            throw new Error('IPC渲染器不可用，无法解析Excel文件')
          }
          
          // 调用主进程转换Excel文件
          const excelText = await ipcRenderer.invoke('convert-excel-to-text', data) as string
          
          // Excel转换后的文本格式是：工作表名称 + 行数据（制表符分隔）
          // 需要转换为CSV格式的数组
          const lines = excelText.split('\n').filter(line => line.trim())
          const dataRows: any[] = []
          let currentSheet: string | null = null
          let headers: string[] | null = null
          let dataRowIndex = 0 // 数据行索引（不包括工作表标题）
          
          for (const line of lines) {
            // 检测工作表标题
            if (line.startsWith('工作表')) {
              currentSheet = line
              headers = null
              dataRowIndex = 0 // 重置数据行索引
              continue
            }
            
            // 检测行数据（格式：行 X: 数据）
            const rowMatch = line.match(/^行 \d+:\s*(.+)$/)
            if (rowMatch) {
              const rowData = rowMatch[1].split('\t')
              
              // 根据 headerRowIndex 确定表头行
              // 如果指定了 headerRowIndex，使用指定的行；否则使用第一行（dataRowIndex === 0）
              const isHeaderRow = headerRowIndex !== undefined 
                ? (dataRowIndex === headerRowIndex)
                : (dataRowIndex === 0)
              
              if (isHeaderRow) {
                headers = rowData.map((h, i) => h || `列${i + 1}`)
                dataRowIndex++
                continue
              }
              
              // 如果还没有表头，跳过（这种情况不应该发生，但为了安全）
              if (!headers) {
                dataRowIndex++
                continue
              }
              
              // 构建行对象
              const row: any = {}
              headers.forEach((header, index) => {
                row[header] = rowData[index] || null
              })
              dataRows.push(row)
              dataRowIndex++
            }
          }
          
          parsedData = dataRows
          
          if (parsedData.length === 0) {
            // 如果解析失败，尝试直接解析为CSV
            getLogger().warn('Excel解析后无数据，尝试CSV解析')
            parsedData = parseCSV(excelText.replace(/工作表 \d+: .+\n/g, '').replace(/行 \d+:\s*/g, ''), headerRowIndex)
          }
        } catch (error) {
          getLogger().error('Excel解析失败:', error)
          return {
            status: 'failed',
            error: `Excel解析失败: ${error instanceof Error ? error.message : String(error)}`
          }
        }
      } else {
        return {
          status: 'failed',
          error: 'Excel文件必须使用file模式，并提供文件路径'
        }
      }
    } else {
      // JSON格式
      try {
        // 先提取JSON字符串（处理LLM返回的文本中包含其他文字的情况）
        const jsonString = extractOuterJsonString(rawData) || rawData
        parsedData = JSON.parse(jsonString)
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

      const totalRows = parsedData.length
      
      // 如果手动指定了分组字段，使用指定的字段，即使它们可能不太适合
      let fieldsToGroupBy: Array<{ name: string; categoryInfo: FieldCategoryInfo }> = []
      
      if (groupByFields.length > 0) {
        // 手动指定：使用指定的字段
        fieldsToGroupBy = groupByFields.map(fieldName => {
          const field = fields.find(f => f.name === fieldName)
          if (field) {
            return {
              name: fieldName,
              categoryInfo: categorizeField(field, totalRows)
            }
          }
          return null
        }).filter((item): item is { name: string; categoryInfo: FieldCategoryInfo } => item !== null)
      } else if (autoGroupBy) {
        // 自动模式：智能选择适合分组的字段
        fieldsToGroupBy = fields
          .map(field => ({
            name: field.name,
            categoryInfo: categorizeField(field, totalRows)
          }))
          .filter(item => {
            // 只选择适合作为分组字段的字段
            const cat = item.categoryInfo.category
            return cat === 'categorical' || 
                   cat === 'boolean' || 
                   cat === 'numeric-low-cardinality' ||
                   cat === 'numeric-high-cardinality' ||
                   cat === 'date'
          })
      }

      // 对每个选定的分组字段执行聚合
      fieldsToGroupBy.forEach(({ name: fieldName, categoryInfo }) => {
        // 如果字段不适合分组，跳过
        if (categoryInfo.category === 'unsuitable') {
          return
        }
        
        // 执行聚合分析，传入所有字段信息（函数内部会排除分组字段本身）
          const agg = performAggregation(
            parsedData, 
            fieldName, 
          fields,  // 传入所有字段信息
            categoryInfo,
            totalRows
          )
          aggregations.push(agg)
      })
    }

    const result: DataAnalysisResult = {
      fields,
      rowCount: parsedData.length,
      columnCount: fields.length,
      descriptiveStats,
      aggregations: aggregations.length > 0 ? aggregations : undefined
    }

    // 生成摘要或报告
    // 如果启用了报告生成（generateReport === true），调用LLM生成文本摘要
    // 如果未启用（generateReport === false），生成固定模板的markdown（不调用LLM）
    if (analysisRequest || true) { // 默认生成摘要
      if (generateReport) {
        // 启用报告生成，调用LLM
        // 先准备prompt和创建target ref
        const prompt = `${analysisRequest ? `## 用户分析需求（请优先关注并重点分析）

${analysisRequest}

---

## 数据分析结果

` : `## 数据分析结果

`}字段信息：
${JSON.stringify(result.fields)}

描述统计：
${JSON.stringify(result.descriptiveStats)}

${result.aggregations ? `聚合分析：\n${JSON.stringify(result.aggregations)}` : ''}

---

## 分析要求

${analysisRequest ? `**请根据上述用户分析需求，重点分析和回答用户提出的问题。**\n\n` : ''}请提供详细的数据分析摘要，包括：
1. 数据概况（总行数、总列数等）
2. 关键发现和洞察${analysisRequest ? '（特别关注用户提出的分析需求）' : ''}
3. 异常值或数据质量问题
4. 建议的可视化图表类型${analysisRequest ? '\n5. 针对用户分析需求的具体回答和建议' : ''}

${analysisRequest ? `\n**重要提示：请确保报告内容直接回答和满足用户的分析需求："${analysisRequest}"**` : ''}

使用Markdown格式。`

        try {
          const summaryResult = generateAnalysisSummary(result, analysisRequest, true)
          
          // 如果返回了targetRef和donePromise，在onUpdate中传递（用于流式显示）
          if (summaryResult.targetRef && summaryResult.donePromise) {
            // 通过onUpdate传递targetRef和donePromise（存储在content中）
            onUpdate({
              content: {
                stage: 'summarizing-streaming',
                result,
                reportTargetRef: summaryResult.targetRef,
                reportDonePromise: summaryResult.donePromise
              },
              format: 'json'
            }, {
              percentage: 85,
              message: i18n.global.t('agent.tool.dataAnalysis.progress.summarizing', '正在生成分析摘要...')
            })
            
            // 等待done完成
            try {
              await summaryResult.donePromise
            } catch (error) {
              // 如果是取消错误，保留已生成的内容，当作完成处理
              const isCancelled = error instanceof Error && (
                error.message === '任务已取消' || 
                error.message.includes('任务已取消') ||
                (error as any).name === 'AbortError'
              )
              
              if (!isCancelled) {
                // 非取消错误，重新抛出
                throw error
              }
              // 取消时继续执行，使用已生成的内容
            }
            
            // 无论是否取消，都使用当前targetRef中的内容
            const currentContent = summaryResult.targetRef.value.trim()
            if (currentContent) {
              result.summary = currentContent
              result.reportMarkdown = currentContent // 同时保存到reportMarkdown
            }
          } else {
            // 没有流式输出，直接获取summary
            const finalResult = await summaryResult
            result.summary = finalResult.summary
            result.reportMarkdown = finalResult.summary
          }
        } catch (error) {
          // 检查是否是取消错误
          const isCancelled = error instanceof Error && (
            error.message === '任务已取消' || 
            error.message.includes('任务已取消') ||
            (error as any).name === 'AbortError'
          )
          
          if (!isCancelled) {
            // 只有非取消错误才记录警告
            getLogger().warn('生成分析摘要失败:', error)
          }
          // 取消时静默处理，保留已生成的内容
        }
      } else {
        // 未启用报告生成，生成固定模板（不调用LLM，快速完成）
        onUpdate({
          content: {
            stage: 'generating-template',
            result
          },
          format: 'json'
        }, {
          percentage: 90,
          message: i18n.global.t('agent.tool.dataAnalysis.progress.generatingTemplate', '正在生成分析报告模板...')
        })

        // 生成固定模板，不调用LLM
        const templateReport = generateTemplateReport(result, analysisRequest)
        result.summary = templateReport
        result.reportMarkdown = templateReport
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
    getLogger().error('数据分析失败:', error)
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.dataAnalysis.error.failed', { error: errorMessage }, `数据分析失败: ${errorMessage}`)
    }
  }
}

export const dataAnalysisToolConfig: AgentToolConfig = {
  id: 'data-analysis',
  name: dataAnalysisToolLocales,
  description: dataAnalysisToolLocales,
  origin: 'internal',
  spec: {
    name: 'data-analysis',
    brief: 'Automatically analyze structured data (CSV, JSON) providing field extraction, descriptive statistics, and aggregations.',
    fullSpec: `# Data Analysis Tool

## Description
Automatically analyzes structured data (CSV, JSON) providing:
- Automatic field and data type extraction
- Descriptive statistics (mean, median, mode, variance, std dev)
- Automatic groupby aggregation for all fields
- Support for natural language analysis requests

## Usage Scenarios
- Analyze CSV/JSON data files
- Extract data insights
- Generate statistical summaries
- Perform data aggregations

## Input Format
\`\`\`json
{
  "data": "string|array|object", // Required: data content (CSV/JSON string/object), file path, or URL
  "format": "csv|json|xls|xlsx", // Required: data format
  "dataSource": "inline|file|url", // Optional: data source type, default "inline"
  "analysisRequest": "string", // Optional: natural language analysis request
  "groupByFields": ["string"], // Optional: fields to group by
  "autoGroupBy": true, // Optional: auto groupby for all fields, default true
  "headerRowIndex": 0 // Optional: CSV header row index (0-based). Auto-detects if not specified
}
\`\`\`

## ⚠️ Important Usage Principles

**Prefer file paths or URLs, do NOT directly input data content!**

1. **Recommended approaches**:
   - ✅ If user uploaded a data file, use \`dataSource: "file"\` with file path in \`data\` field
   - ✅ If data is from network, use \`dataSource: "url"\` with URL in \`data\` field
   - ✅ If user uploaded data file in references, get file path from reference's \`origin\` field

2. **Avoid**:
   - ❌ **Do NOT output all reference content as parameters**: This is error-prone, inefficient, and wastes tokens
   - ❌ **Do NOT use inline mode for large files**: For large files (over a few KB), never use \`dataSource: "inline"\` to directly input data content

## Output Format
Returns analysis results including field information, descriptive statistics, and aggregations.`
  },
  instruction: dataAnalysisToolLocales,
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
        enum: ['csv', 'json', 'xls', 'xlsx'],
        description: '数据格式（支持csv、json、xls、xlsx）。如果使用file模式且未指定format，将根据文件扩展名自动推断'
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
      },
      generateReport: {
        type: 'boolean',
        description: '是否生成AI分析报告',
        default: false
      },
      headerRowIndex: {
        type: 'number',
        description: '表头行索引（从0开始），支持CSV、XLS、XLSX格式。如果不指定，将自动智能检测表头位置',
        minimum: 0
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

