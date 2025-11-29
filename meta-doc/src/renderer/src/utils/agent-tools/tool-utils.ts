/**
 * Agent Tool 通用工具函数
 * 提供JSON清理、解析、重试等通用功能
 */

import { extractOuterJsonString } from '../regex-utils'

/**
 * 清理JSON字符串，处理常见的格式问题
 * - 移除markdown代码块标记
 * - 替换中文标点为英文标点
 * - 移除注释
 * - 修复常见的格式错误
 * - 提取JSON部分（即使前面有中文文本）
 */
export function cleanJsonString(jsonStr: string): string {
  let cleaned = jsonStr.trim()
  
  // 首先尝试提取JSON部分（查找第一个 { 或 [）
  const jsonStartIndex = Math.min(
    cleaned.indexOf('{') !== -1 ? cleaned.indexOf('{') : Infinity,
    cleaned.indexOf('[') !== -1 ? cleaned.indexOf('[') : Infinity
  )
  
  if (jsonStartIndex !== Infinity && jsonStartIndex > 0) {
    // 如果JSON不在开头，提取JSON部分
    cleaned = cleaned.substring(jsonStartIndex)
  }
  
  // 移除markdown代码块标记
  cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  
  // 移除可能的变量声明
  cleaned = cleaned.replace(/^(const|let|var)\s+\w+\s*=\s*/, '')
  
  // 移除末尾的分号
  cleaned = cleaned.replace(/;?\s*$/, '')
  
  // 移除单行注释（// ...），保留空行以维持JSON结构
  cleaned = cleaned.split('\n')
    .map(line => line.replace(/\/\/.*$/, ''))
    .join('\n')
  
  // 移除多行注释（/* ... */）
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '')
  
  // 替换中文标点为英文标点（JSON要求英文标点）
  cleaned = cleaned
    .replace(/，/g, ',')  // 中文逗号 -> 英文逗号
    .replace(/：/g, ':')   // 中文冒号 -> 英文冒号
    .replace(/；/g, ';')   // 中文分号 -> 英文分号
    .replace(/"/g, '"')    // 中文左双引号 -> 英文双引号
    .replace(/"/g, '"')   // 中文右双引号 -> 英文双引号
    .replace(/'/g, "'")    // 中文左单引号 -> 英文单引号
    .replace(/'/g, "'")    // 中文右单引号 -> 英文单引号
    .replace(/。/g, '.')   // 中文句号 -> 英文句号（虽然JSON中不应该有，但以防万一）
    .replace(/、/g, ',')   // 中文顿号 -> 英文逗号
  
  // 修复常见的引号问题：将单引号字符串键和值替换为双引号
  // 注意：这个操作需要小心，避免破坏字符串内容中的单引号
  // 只替换对象键和值的单引号（在冒号前后的）
  cleaned = cleaned.replace(/'(\w+)'\s*:/g, '"$1":') // 键名
  cleaned = cleaned.replace(/:\s*'([^']*)'/g, ': "$1"') // 字符串值（简单情况）
  
  // 移除多余的空白字符（但保留换行，因为JSON可能需要格式化）
  cleaned = cleaned.replace(/[ \t]+/g, ' ').trim()
  
  // 移除JSON末尾可能的中文文本（查找最后一个 } 或 ]）
  const lastBraceIndex = cleaned.lastIndexOf('}')
  const lastBracketIndex = cleaned.lastIndexOf(']')
  const lastJsonEndIndex = Math.max(lastBraceIndex, lastBracketIndex)
  
  if (lastJsonEndIndex !== -1 && lastJsonEndIndex < cleaned.length - 1) {
    // 如果JSON后面还有内容，只保留到JSON结束
    cleaned = cleaned.substring(0, lastJsonEndIndex + 1)
  }
  
  return cleaned
}

/**
 * 尝试解析JSON，如果失败则尝试清理后解析
 * 首先使用 extractOuterJsonString 提取JSON部分，避免LLM返回的文本中包含其他文字
 */
export function parseJsonWithClean<T = any>(jsonStr: string): { success: boolean; data?: T; error?: string } {
  // 首先尝试提取JSON字符串（处理LLM返回的文本中包含其他文字的情况）
  let extractedJson = extractOuterJsonString(jsonStr)
  
  // 如果提取失败，使用原始字符串
  if (!extractedJson) {
    extractedJson = jsonStr
  }
  
  // 首先尝试直接解析提取的JSON
  try {
    const data = JSON.parse(extractedJson) as T
    return { success: true, data }
  } catch (error) {
    // 如果失败，尝试清理后解析
    try {
      const cleaned = cleanJsonString(extractedJson)
      // 清理后再次尝试提取（因为清理可能改变了结构）
      const cleanedExtracted = extractOuterJsonString(cleaned) || cleaned
      const data = JSON.parse(cleanedExtracted) as T
      return { success: true, data }
    } catch (cleanError) {
      const errorMessage = cleanError instanceof Error ? cleanError.message : String(cleanError)
      return { success: false, error: errorMessage }
    }
  }
}

/**
 * 重试配置选项
 */
export interface RetryOptions {
  maxRetries?: number        // 最大重试次数，默认2
  initialDelay?: number      // 初始延迟（毫秒），默认1000
  maxDelay?: number         // 最大延迟（毫秒），默认5000
  backoffFactor?: number    // 退避因子，默认2
  retryable?: (error: any) => boolean  // 判断错误是否可重试的函数
}

/**
 * 带指数退避的重试机制
 * @param fn 要执行的异步函数
 * @param options 重试选项
 * @returns 函数执行结果
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 2,
    initialDelay = 1000,
    maxDelay = 5000,
    backoffFactor = 2,
    retryable = () => true  // 默认所有错误都可重试
  } = options

  let lastError: any
  let delay = initialDelay

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      
      // 如果不可重试，直接抛出
      if (!retryable(error)) {
        throw error
      }
      
      // 如果已经达到最大重试次数，抛出错误
      if (attempt >= maxRetries) {
        throw error
      }
      
      // 等待后重试（指数退避）
      await new Promise(resolve => setTimeout(resolve, delay))
      delay = Math.min(delay * backoffFactor, maxDelay)
    }
  }

  throw lastError
}

/**
 * 判断错误是否为JSON解析错误
 */
export function isJsonParseError(error: any): boolean {
  if (!error) return false
  const errorMessage = error instanceof Error ? error.message : String(error)
  return errorMessage.includes('JSON') || 
         errorMessage.includes('Unexpected token') ||
         errorMessage.includes('parse') ||
         errorMessage.includes('SyntaxError')
}

/**
 * 判断错误是否为网络错误（可重试）
 */
export function isNetworkError(error: any): boolean {
  if (!error) return false
  const errorMessage = error instanceof Error ? error.message : String(error)
  return errorMessage.includes('network') ||
         errorMessage.includes('timeout') ||
         errorMessage.includes('ECONNRESET') ||
         errorMessage.includes('ENOTFOUND') ||
         errorMessage.includes('ETIMEDOUT')
}

/**
 * 通用的可重试错误判断函数
 * 网络错误和JSON解析错误通常可以重试
 */
export function isRetryableError(error: any): boolean {
  return isJsonParseError(error) || isNetworkError(error)
}

/**
 * 生成带示例和扩展用法的详细错误提示
 * 用于Agent Tools，帮助AI更好地理解如何正确使用工具
 * 
 * @param error - 错误描述
 * @param examples - 正确示例数组（JSON字符串格式）
 * @param tips - 扩展用法提示数组（可选）
 * @returns 格式化的错误消息
 */
export function createDetailedError(error: string, examples: string[] = [], tips: string[] = []): string {
  let message = `❌ ${error}\n\n`
  
  if (examples.length > 0) {
    message += `📝 正确示例：\n`
    examples.forEach((example, index) => {
      message += `${index + 1}. ${example}\n`
    })
    message += `\n`
  }
  
  if (tips.length > 0) {
    message += `💡 扩展用法：\n`
    tips.forEach((tip, index) => {
      message += `${index + 1}. ${tip}\n`
    })
  }
  
  return message
}

