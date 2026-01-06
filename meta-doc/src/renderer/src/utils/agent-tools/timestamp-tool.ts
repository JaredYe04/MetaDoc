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
  utc: {
    iso: string
    date: string
    time: string
  }
  local: {
    iso: string
    date: string
    time: string
    timezone: string
  }
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
    "utc": {
      "iso": "2023-01-01T00:00:00.000Z",
      "date": "2023-01-01",
      "time": "00:00:00"
    },
    "local": {
      "iso": "2023-01-01T08:00:00.000+08:00",
      "date": "2023-01-01",
      "time": "08:00:00",
      "timezone": "+08:00"
    }
  },
  "previous": {
    "timestamp": 1234567890,
    "utc": {
      "iso": "2023-01-01T00:00:00.000Z"
    },
    "local": {
      "iso": "2023-01-01T08:00:00.000+08:00"
    }
  },
  "timeDiff": {
    "milliseconds": 1000,
    "seconds": 1,
    "minutes": 0.016,
    "hours": 0.0003,
    "days": 0.00001
  }
}
\`\`\`

**字段说明：**
- \`timestamp\`: Unix时间戳（毫秒）
- \`utc\`: UTC时间（协调世界时）
  - \`iso\`: ISO 8601格式的UTC时间
  - \`date\`: UTC日期（YYYY-MM-DD）
  - \`time\`: UTC时间（HH:mm:ss）
- \`local\`: 本地时间（根据系统时区）
  - \`iso\`: ISO 8601格式的本地时间（带时区偏移）
  - \`date\`: 本地日期（YYYY-MM-DD）
  - \`time\`: 本地时间（HH:mm:ss）
  - \`timezone\`: 时区偏移（如+08:00）
- \`previous\`: 上一次调用的时间戳（格式同current）
- \`timeDiff\`: 与上一次调用的时间差
`
  },
  en_us: {
    name: 'Timestamp',
    description: 'Returns current timestamp and records each call time for calculating time differences',
    instruction: `
# Timestamp Tool

## Description
Returns current timestamp and persistently records each call timestamp in the same session for:
- Getting current time (both UTC and local time)
- Calculating time difference from last call
- Judging if execution time is too long
- Time-related decisions

## Use Cases
- Monitoring task execution time
- Time-related conditional judgments
- Logging
- Performance analysis

## Input Format
\`\`\`json
{
  "format": "string" // Optional, return format: timestamp|iso|date|all, default all
}
\`\`\`

## Output Format
\`\`\`json
{
  "current": {
    "timestamp": 1234567890,
    "utc": {
      "iso": "2023-01-01T00:00:00.000Z",
      "date": "2023-01-01",
      "time": "00:00:00"
    },
    "local": {
      "iso": "2023-01-01T08:00:00.000+08:00",
      "date": "2023-01-01",
      "time": "08:00:00",
      "timezone": "+08:00"
    }
  },
  "previous": {
    "timestamp": 1234567890,
    "utc": {
      "iso": "2023-01-01T00:00:00.000Z"
    },
    "local": {
      "iso": "2023-01-01T08:00:00.000+08:00"
    }
  },
  "timeDiff": {
    "milliseconds": 1000,
    "seconds": 1,
    "minutes": 0.016,
    "hours": 0.0003,
    "days": 0.00001
  }
}
\`\`\`

**Field Descriptions:**
- \`timestamp\`: Unix timestamp (milliseconds)
- \`utc\`: UTC time (Coordinated Universal Time)
  - \`iso\`: UTC time in ISO 8601 format
  - \`date\`: UTC date (YYYY-MM-DD)
  - \`time\`: UTC time (HH:mm:ss)
- \`local\`: Local time (based on system timezone)
  - \`iso\`: Local time in ISO 8601 format (with timezone offset)
  - \`date\`: Local date (YYYY-MM-DD)
  - \`time\`: Local time (HH:mm:ss)
  - \`timezone\`: Timezone offset (e.g., +08:00)
- \`previous\`: Timestamp from last call (same format as current)
- \`timeDiff\`: Time difference from last call
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
    
    // UTC时间
    const utcIso = now.toISOString()
    const utcDate = utcIso.split('T')[0]
    const utcTime = utcIso.split('T')[1].split('.')[0]
    
    // 本地时间
    const localYear = now.getFullYear()
    const localMonth = String(now.getMonth() + 1).padStart(2, '0')
    const localDay = String(now.getDate()).padStart(2, '0')
    const localHours = String(now.getHours()).padStart(2, '0')
    const localMinutes = String(now.getMinutes()).padStart(2, '0')
    const localSeconds = String(now.getSeconds()).padStart(2, '0')
    const localMs = String(now.getMilliseconds()).padStart(3, '0')
    
    const localDate = `${localYear}-${localMonth}-${localDay}`
    const localTime = `${localHours}:${localMinutes}:${localSeconds}`
    
    // 获取时区偏移
    const timezoneOffset = -now.getTimezoneOffset() // 注意：getTimezoneOffset返回的是UTC与本地时间的差值（分钟），需要取反
    const timezoneHours = Math.floor(Math.abs(timezoneOffset) / 60)
    const timezoneMinutes = Math.abs(timezoneOffset) % 60
    const timezoneSign = timezoneOffset >= 0 ? '+' : '-'
    const timezone = `${timezoneSign}${String(timezoneHours).padStart(2, '0')}:${String(timezoneMinutes).padStart(2, '0')}`
    
    const localIso = `${localDate}T${localTime}.${localMs}${timezone}`
    
    const current: TimestampRecord = {
      timestamp,
      utc: {
        iso: utcIso,
        date: utcDate,
        time: utcTime
      },
      local: {
        iso: localIso,
        date: localDate,
        time: localTime,
        timezone
      }
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
        result = {
          utc: utcIso,
          local: localIso
        }
        break
      case 'date':
        result = {
          utc: utcDate,
          local: localDate
        }
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
          '可以设置format参数：iso（返回UTC和本地ISO格式）、timestamp（Unix时间戳）、date（返回UTC和本地日期）',
          '如果不设置format，返回包含timestamp、utc（UTC时间）、local（本地时间）、previous（上一次调用）、timeDiff（时间差）等信息的对象'
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
  spec: {
    name: 'timestamp',
    brief: 'Get current timestamp and track time differences between calls. Useful for monitoring execution time and time-based decisions.',
    fullSpec: `# Timestamp Tool

## Description
Returns current timestamp and persistently records each call's timestamp in the same session. Can be used for:
- Getting current time
- Calculating time difference since last call
- Determining if execution time is too long
- Time-related decision making

## Usage Scenarios
- Monitor task execution time
- Time-based conditional logic
- Logging
- Performance analysis

## Input Format
\`\`\`json
{
  "format": "string" // Optional, return format: timestamp|iso|date|all, default all
}
\`\`\`

## Output Format
\`\`\`json
{
  "current": {
    "timestamp": 1234567890,
    "utc": {
      "iso": "2023-01-01T00:00:00.000Z",
      "date": "2023-01-01",
      "time": "00:00:00"
    },
    "local": {
      "iso": "2023-01-01T08:00:00.000+08:00",
      "date": "2023-01-01",
      "time": "08:00:00",
      "timezone": "+08:00"
    }
  },
  "previous": {
    "timestamp": 1234567890,
    "utc": { "iso": "2023-01-01T00:00:00.000Z" },
    "local": { "iso": "2023-01-01T08:00:00.000+08:00" }
  },
  "timeDiff": {
    "milliseconds": 1000,
    "seconds": 1,
    "minutes": 0.016,
    "hours": 0.0003,
    "days": 0.00001
  }
}
\`\`\``
  },
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
          timestamp: { type: 'number', description: 'Unix时间戳（毫秒）' },
          utc: {
            type: 'object',
            description: 'UTC时间（协调世界时）',
            properties: {
              iso: { type: 'string', description: 'ISO 8601格式的UTC时间' },
              date: { type: 'string', description: 'UTC日期（YYYY-MM-DD）' },
              time: { type: 'string', description: 'UTC时间（HH:mm:ss）' }
            }
          },
          local: {
            type: 'object',
            description: '本地时间（根据系统时区）',
            properties: {
              iso: { type: 'string', description: 'ISO 8601格式的本地时间（带时区偏移）' },
              date: { type: 'string', description: '本地日期（YYYY-MM-DD）' },
              time: { type: 'string', description: '本地时间（HH:mm:ss）' },
              timezone: { type: 'string', description: '时区偏移（如+08:00）' }
            }
          }
        }
      },
      previous: {
        type: 'object',
        description: '上一次调用的时间戳（格式同current）',
        properties: {
          timestamp: { type: 'number' },
          utc: { type: 'object' },
          local: { type: 'object' }
        }
      },
      timeDiff: {
        type: 'object',
        description: '与上一次调用的时间差',
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

