/**
 * LLM 统计服务
 * 管理 LLM API 的 token 用量和请求次数统计
 */

import messageBridge from '../bridge/message-bridge'
import { createRendererLogger } from './logger.ts'

let loggerInstance = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('LLM-Statistics')
  }
  return loggerInstance
}

/**
 * 获取统计文件路径（userData，打包不包含、用户安装后首次使用才生成）
 */
async function getStatisticsFilePath() {
  try {
    return await messageBridge.invoke('llm-statistics-path')
  } catch (error) {
    getLogger().error('获取统计文件路径失败:', error)
    throw error
  }
}

/**
 * 读取统计数据
 */
async function loadStatistics() {
  try {
    const filePath = await getStatisticsFilePath()

    // 读取文件内容，如果文件不存在则返回 null
    const content = await messageBridge.invoke('read-file-content', filePath)

    // 如果文件不存在或内容为空，返回默认值
    if (!content || content === null) {
      return {
        requests: [],
        totalRequests: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0
      }
    }

    const data = JSON.parse(content)

    // 确保数据结构正确
    return {
      requests: data.requests || [],
      totalRequests: data.totalRequests || 0,
      totalPromptTokens: data.totalPromptTokens || 0,
      totalCompletionTokens: data.totalCompletionTokens || 0,
      totalTokens: data.totalTokens || 0
    }
  } catch (error) {
    getLogger().error('读取统计数据失败:', error)
    // 返回默认值
    return {
      requests: [],
      totalRequests: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0
    }
  }
}

/**
 * 保存统计数据
 */
async function saveStatistics(data) {
  try {
    const filePath = await getStatisticsFilePath()
    const content = JSON.stringify(data, null, 2)
    await messageBridge.invoke('write-file-content', { filePath, content })
  } catch (error) {
    getLogger().error('保存统计数据失败:', error)
    throw error
  }
}

/**
 * 记录一次 LLM 请求
 * @param {Object} usage - token 使用量信息 { prompt_tokens, completion_tokens, total_tokens }
 * @param {string} model - 模型名称（可选）
 * @param {string} type - 请求类型：'chat' 或 'completion'（可选）
 */
export async function recordLlmRequest(usage, model = null, type = null) {
  try {
    if (!usage || typeof usage !== 'object') {
      getLogger().warn('记录 LLM 请求失败：usage 信息无效', usage)
      return
    }

    const stats = await loadStatistics()
    const now = new Date()

    const requestRecord = {
      timestamp: now.toISOString(),
      date: now.toISOString().split('T')[0], // YYYY-MM-DD
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
      model: model || 'unknown',
      type: type || 'unknown'
    }

    stats.requests.push(requestRecord)
    stats.totalRequests += 1
    stats.totalPromptTokens += requestRecord.prompt_tokens
    stats.totalCompletionTokens += requestRecord.completion_tokens
    stats.totalTokens += requestRecord.total_tokens

    await saveStatistics(stats)

    getLogger().debug('已记录 LLM 请求统计:', requestRecord)
  } catch (error) {
    getLogger().error('记录 LLM 请求失败:', error)
  }
}

/**
 * 获取统计数据
 * @param {Date} startDate - 开始日期（可选）
 * @param {Date} endDate - 结束日期（可选）
 * @returns {Promise<Object>} 统计数据
 */
export async function getStatistics(startDate = null, endDate = null) {
  try {
    const stats = await loadStatistics()

    if (!startDate && !endDate) {
      return stats
    }

    // 过滤指定时间范围内的请求
    const filteredRequests = stats.requests.filter((req) => {
      const reqDate = new Date(req.timestamp)
      if (startDate && reqDate < startDate) return false
      if (endDate && reqDate > endDate) return false
      return true
    })

    // 计算过滤后的统计
    const filteredStats = {
      requests: filteredRequests,
      totalRequests: filteredRequests.length,
      totalPromptTokens: filteredRequests.reduce((sum, req) => sum + (req.prompt_tokens || 0), 0),
      totalCompletionTokens: filteredRequests.reduce(
        (sum, req) => sum + (req.completion_tokens || 0),
        0
      ),
      totalTokens: filteredRequests.reduce((sum, req) => sum + (req.total_tokens || 0), 0)
    }

    return filteredStats
  } catch (error) {
    getLogger().error('获取统计数据失败:', error)
    throw error
  }
}

/**
 * 清空统计数据
 */
export async function clearStatistics() {
  try {
    const emptyStats = {
      requests: [],
      totalRequests: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0
    }
    await saveStatistics(emptyStats)
    getLogger().info('统计数据已清空')
  } catch (error) {
    getLogger().error('清空统计数据失败:', error)
    throw error
  }
}

/**
 * 导出统计数据为 JSON
 * @param {Date} startDate - 开始日期（可选）
 * @param {Date} endDate - 结束日期（可选）
 * @returns {Promise<string>} JSON 字符串
 */
export async function exportStatistics(startDate = null, endDate = null) {
  try {
    const stats = await getStatistics(startDate, endDate)
    return JSON.stringify(stats, null, 2)
  } catch (error) {
    getLogger().error('导出统计数据失败:', error)
    throw error
  }
}
