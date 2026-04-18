/**
 * LLM 统计服务
 * 管理 LLM API 的 token 用量和请求次数统计
 * Steam 构建：官方云（metadoc）仅累加主文件 totalRequests；BYOK 明细写入 llm-statistics-byok.json
 * 非 Steam：沿用单一 llm-statistics.json，并在每条记录上带 source 便于以后筛选
 */

import messageBridge from '../bridge/message-bridge'
import { createRendererLogger } from './logger.ts'
import { isSteamDistribution } from '@common/build-env'

let loggerInstance = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('LLM-Statistics')
  }
  return loggerInstance
}

async function getStatisticsFilePath() {
  try {
    return await messageBridge.invoke('llm-statistics-path')
  } catch (error) {
    getLogger().error('获取统计文件路径失败:', error)
    throw error
  }
}

async function getByokStatisticsFilePath() {
  try {
    return await messageBridge.invoke('llm-statistics-byok-path')
  } catch (error) {
    getLogger().error('获取 BYOK 统计文件路径失败:', error)
    throw error
  }
}

function emptyStats() {
  return {
    requests: [],
    totalRequests: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0
  }
}

/**
 * 读取主统计文件（非 Steam 为完整明细；Steam 上为 totalRequests 聚合 + 可选历史遗留 requests）
 */
async function loadStatistics() {
  try {
    const filePath = await getStatisticsFilePath()
    const content = await messageBridge.invoke('read-file-content', filePath)

    if (!content || content === null) {
      return emptyStats()
    }

    const data = JSON.parse(content)

    return {
      requests: data.requests || [],
      totalRequests: data.totalRequests || 0,
      totalPromptTokens: data.totalPromptTokens || 0,
      totalCompletionTokens: data.totalCompletionTokens || 0,
      totalTokens: data.totalTokens || 0
    }
  } catch (error) {
    getLogger().error('读取统计数据失败:', error)
    return emptyStats()
  }
}

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

async function loadByokStatisticsRaw() {
  try {
    const filePath = await getByokStatisticsFilePath()
    const content = await messageBridge.invoke('read-file-content', filePath)
    if (!content || content === null) {
      return emptyStats()
    }
    const data = JSON.parse(content)
    return {
      requests: data.requests || [],
      totalRequests: data.totalRequests || 0,
      totalPromptTokens: data.totalPromptTokens || 0,
      totalCompletionTokens: data.totalCompletionTokens || 0,
      totalTokens: data.totalTokens || 0
    }
  } catch (error) {
    getLogger().error('读取 BYOK 统计数据失败:', error)
    return emptyStats()
  }
}

async function saveByokStatistics(data) {
  try {
    const filePath = await getByokStatisticsFilePath()
    const content = JSON.stringify(data, null, 2)
    await messageBridge.invoke('write-file-content', { filePath, content })
  } catch (error) {
    getLogger().error('保存 BYOK 统计数据失败:', error)
    throw error
  }
}

async function reportSteamAiCount(totalRequests) {
  try {
    await messageBridge.invoke('steam:stats:report', { aiRequestsTotal: totalRequests })
  } catch {
    /* Steam 未初始化或非 Steam 版时忽略 */
  }
}

/**
 * 记录一次 LLM 请求
 * @param {Object} usage
 * @param {string|null} model
 * @param {string|null} type
 * @param {{ source?: 'byok' | 'metadoc' }} [options]
 */
export async function recordLlmRequest(usage, model = null, type = null, options = {}) {
  try {
    if (!usage || typeof usage !== 'object') {
      getLogger().warn('记录 LLM 请求失败：usage 信息无效', usage)
      return
    }

    const source = options.source === 'metadoc' ? 'metadoc' : 'byok'
    const now = new Date()

    const requestRecord = {
      timestamp: now.toISOString(),
      date: now.toISOString().split('T')[0],
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
      model: model || 'unknown',
      type: type || 'unknown',
      source
    }

    if (!isSteamDistribution()) {
      const stats = await loadStatistics()
      stats.requests.push(requestRecord)
      stats.totalRequests += 1
      stats.totalPromptTokens += requestRecord.prompt_tokens
      stats.totalCompletionTokens += requestRecord.completion_tokens
      stats.totalTokens += requestRecord.total_tokens
      await saveStatistics(stats)
      await reportSteamAiCount(stats.totalRequests)
      getLogger().debug('已记录 LLM 请求统计:', requestRecord)
      return
    }

    // Steam 构建
    const main = await loadStatistics()
    main.totalRequests = (main.totalRequests || 0) + 1
    await saveStatistics(main)
    await reportSteamAiCount(main.totalRequests)

    if (source === 'metadoc') {
      getLogger().debug('已记录 Steam 官方云请求（仅聚合计数）:', requestRecord)
      return
    }

    const byok = await loadByokStatisticsRaw()
    byok.requests.push(requestRecord)
    byok.totalRequests = (byok.totalRequests || 0) + 1
    byok.totalPromptTokens += requestRecord.prompt_tokens
    byok.totalCompletionTokens += requestRecord.completion_tokens
    byok.totalTokens += requestRecord.total_tokens
    await saveByokStatistics(byok)
    getLogger().debug('已记录 Steam BYOK 请求统计:', requestRecord)
  } catch (error) {
    getLogger().error('记录 LLM 请求失败:', error)
  }
}

function filterByDateRange(stats, startDate, endDate) {
  if (!startDate && !endDate) {
    return stats
  }
  const filteredRequests = stats.requests.filter((req) => {
    const reqDate = new Date(req.timestamp)
    if (startDate && reqDate < startDate) return false
    if (endDate && reqDate > endDate) return false
    return true
  })
  return {
    requests: filteredRequests,
    totalRequests: filteredRequests.length,
    totalPromptTokens: filteredRequests.reduce((sum, req) => sum + (req.prompt_tokens || 0), 0),
    totalCompletionTokens: filteredRequests.reduce((sum, req) => sum + (req.completion_tokens || 0), 0),
    totalTokens: filteredRequests.reduce((sum, req) => sum + (req.total_tokens || 0), 0)
  }
}

/**
 * 获取统计数据（非 Steam 与历史行为一致：主文件）
 */
export async function getStatistics(startDate = null, endDate = null) {
  try {
    const stats = await loadStatistics()
    return filterByDateRange(stats, startDate, endDate)
  } catch (error) {
    getLogger().error('获取统计数据失败:', error)
    throw error
  }
}

/**
 * Steam 开发人员模式「本地统计」Tab：仅 BYOK 明细文件
 */
export async function getByokStatistics(startDate = null, endDate = null) {
  try {
    const stats = await loadByokStatisticsRaw()
    return filterByDateRange(stats, startDate, endDate)
  } catch (error) {
    getLogger().error('获取 BYOK 统计数据失败:', error)
    throw error
  }
}

/**
 * 清空统计：非 Steam 清空主文件；Steam 仅清空 BYOK 明细（保留主文件 totalRequests 供成就同步）
 */
export async function clearStatistics() {
  try {
    if (isSteamDistribution()) {
      await clearByokStatistics()
      return
    }
    await saveStatistics(emptyStats())
    getLogger().info('统计数据已清空')
  } catch (error) {
    getLogger().error('清空统计数据失败:', error)
    throw error
  }
}

/** Steam：仅清空 BYOK 本地明细，不影响主文件 totalRequests（成就计数） */
export async function clearByokStatistics() {
  try {
    await saveByokStatistics(emptyStats())
    getLogger().info('BYOK 统计数据已清空')
  } catch (error) {
    getLogger().error('清空 BYOK 统计数据失败:', error)
    throw error
  }
}

export async function exportStatistics(startDate = null, endDate = null) {
  try {
    const stats = await getStatistics(startDate, endDate)
    return JSON.stringify(stats, null, 2)
  } catch (error) {
    getLogger().error('导出统计数据失败:', error)
    throw error
  }
}
