/**
 * 时间戳Tool
 * 返回当前时间戳，并持久化记录每次调用的时间戳
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
import { createDetailedError } from './tool-utils'

const logger = createRendererLogger('TimestampTool')

const STORAGE_KEY = 'agent-tool-timestamps'

interface TimestampRecord {
  timestamp: number
  iso: string
  date: string
  time: string
}

const timestampToolLocales: ToolLocales = {
  zh_cn: {
    name: '时间戳',
    description: '返回当前时间戳，记录每次调用的时间，可用于计算时间差',
    instruction: `
# 时间戳工具

## 功能描述
返回当前时间戳，并在同一会话中持久化记录每次调用的时间戳，可以用于：
- 获取当前时间
- 计算距离上一次调用的时间差
- 判断执行时间是否过长
- 时间相关的决策

## 使用场景
- 监控任务执行时间
- 时间相关的条件判断
- 日志记录
- 性能分析

## 输入格式
\`\`\`json
{
  "format": "string" // 可选，返回格式：timestamp|iso|date|all，默认all
}
\`\`\`

## 输出格式
\`\`\`json
{
  "current": {
    "timestamp": 1234567890,
    "iso": "2023-01-01T00:00:00.000Z",
    "date": "2023-01-01",
    "time": "00:00:00"
  },
  "previous": {
    "timestamp": 1234567890,
    "iso": "2023-01-01T00:00:00.000Z"
  },
  "timeDiff": {
    "milliseconds": 1000,
    "seconds": 1,
    "minutes": 0.016,
    "hours": 0.0003
  }
}
\`\`\`
`
  },
  en_us: {
    name: 'Timestamp',
    description: 'Returns current timestamp and records each call time for calculating time differences',
    instruction: `
# Timestamp Tool

## Description
Returns current timestamp and persistently records each call timestamp in the same session for:
- Getting current time
- Calculating time difference from last call
- Judging if execution time is too long
- Time-related decisions

## Input Format
\`\`\`json
{
  "format": "string" // Optional, return format: timestamp|iso|date|all, default all
}
\`\`\`
`
  }
}

/**
 * 获取存储的时间戳记录
 */
function getStoredTimestamps(): TimestampRecord[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    logger.error('读取时间戳记录失败:', error)
  }
  return []
}

/**
 * 保存时间戳记录
 */
function saveTimestamp(record: TimestampRecord): void {
  try {
    const records = getStoredTimestamps()
    records.push(record)
    // 只保留最近100条记录
    if (records.length > 100) {
      records.shift()
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch (error) {
    logger.error('保存时间戳记录失败:', error)
  }
}

/**
 * 时间戳Tool回调函数
 */
const timestampToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const format = (params.format as string) || 'all'

  try {
    const now = new Date()
    const timestamp = now.getTime()
    const iso = now.toISOString()
    const date = now.toISOString().split('T')[0]
    const time = now.toTimeString().split(' ')[0]

    const current: TimestampRecord = {
      timestamp,
      iso,
      date,
      time
    }

    // 保存当前时间戳
    saveTimestamp(current)

    // 获取上一次时间戳
    const records = getStoredTimestamps()
    const previous = records.length > 1 ? records[records.length - 2] : null

    // 计算时间差
    let timeDiff: any = null
    if (previous) {
      const diff = timestamp - previous.timestamp
      timeDiff = {
        milliseconds: diff,
        seconds: diff / 1000,
        minutes: diff / 60000,
        hours: diff / 3600000,
        days: diff / 86400000
      }
    }

    // 根据format返回不同格式
    let result: any
    switch (format) {
      case 'timestamp':
        result = timestamp
        break
      case 'iso':
        result = iso
        break
      case 'date':
        result = date
        break
      default:
        result = {
          current,
          previous: previous || null,
          timeDiff
        }
    }

    onUpdate({
      content: {
        stage: 'completed',
        result,
        format
      },
      format: 'json'
    }, {
      percentage: 100,
      message: i18n.global.t('agent.tool.timestamp.progress.completed', '时间戳获取完成')
    })

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          result,
          format
        },
        format: 'json'
      },
      result
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('获取时间戳失败:', error)
    return {
      status: 'failed',
      error: createDetailedError(
        `获取时间戳失败: ${errorMessage}`,
        [
          '{}  // 不需要参数，直接返回当前时间戳',
          '{"format": "iso"}  // 返回ISO格式',
          '{"format": "unix"}  // 返回Unix时间戳'
        ],
        [
          'timestamp工具不需要任何参数，直接调用即可',
          '可以设置format参数：iso（ISO 8601格式）、unix（Unix时间戳）',
          '如果不设置format，返回包含timestamp、iso、date、time等格式的对象'
        ]
      )
    }
  }
}

export const timestampToolConfig: AgentToolConfig = {
  id: 'timestamp',
  name: timestampToolLocales,
  description: timestampToolLocales,
  origin: 'internal',
  instruction: timestampToolLocales,
  tags: ['timestamp', 'time', 'utility'],
  running: false,
  enabled: true,
  requiresLLM: false,
  callback: timestampToolCallback,
  inputSchema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['timestamp', 'iso', 'date', 'all'],
        description: '返回格式',
        default: 'all'
      }
    }
  },
  outputSchema: {
    type: 'object',
    properties: {
      current: {
        type: 'object',
        properties: {
          timestamp: { type: 'number' },
          iso: { type: 'string' },
          date: { type: 'string' },
          time: { type: 'string' }
        }
      },
      previous: { type: 'object' },
      timeDiff: {
        type: 'object',
        properties: {
          milliseconds: { type: 'number' },
          seconds: { type: 'number' },
          minutes: { type: 'number' },
          hours: { type: 'number' },
          days: { type: 'number' }
        }
      }
    }
  },
  locales: timestampToolLocales
}

