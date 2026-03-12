/**
 * 时间戳Tool
 * 返回当前时间戳，并持久化记录每次调用的时间戳
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress
} from '../../types/agent-tool'
import { createRendererLogger } from '../logger'
import TimestampDisplay from './components/TimestampDisplay.vue'
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

const TIMESTAMP_INSTRUCTION_EN = `
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

const TIMESTAMP_TOOL_NAME = 'Timestamp'
const TIMESTAMP_TOOL_DESCRIPTION =
  'Returns current timestamp and records each call time for calculating time differences'

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
    logger.error('Failed to read timestamp records:', error)
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
    // Keep only the latest 100 records
    if (records.length > 100) {
      records.shift()
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch (error) {
    logger.error('Failed to save timestamp records:', error)
  }
}

/**
 * 时间戳Tool回调函数
 */
const timestampToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const format = (params.format as string) || 'all'

  // 让出一帧，确保 running 的 tool 消息已渲染、Display 已挂载并订阅 tool-update/tool-complete，
  // 否则同步完成时事件会在订阅前发出，导致界面一直卡在「正在获取时间」
  await Promise.resolve()

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

    onUpdate(
      {
        content: {
          stage: 'completed',
          result,
          format
        },
        format: 'json'
      },
      {
        percentage: 100,
        message: i18n.global.t('agent.tool.timestamp.progress.completed', '时间戳获取完成')
      }
    )

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
    logger.error('Get timestamp failed:', error)
    return {
      status: 'failed',
      error: createDetailedError(
        `Get timestamp failed: ${errorMessage}`,
        [
          '{}  // No params needed, returns current timestamp',
          '{"format": "iso"}  // Return ISO format',
          '{"format": "unix"}  // Return Unix timestamp'
        ],
        [
          'timestamp tool needs no parameters; call it directly',
          'Optional format: iso (UTC and local ISO), timestamp (Unix), date (UTC and local date)',
          'If format is omitted, returns object with timestamp, utc, local, previous, timeDiff'
        ]
      )
    }
  }
}

export const timestampToolConfig: AgentToolConfig = {
  id: 'timestamp',
  name: TIMESTAMP_TOOL_NAME,
  description: TIMESTAMP_TOOL_DESCRIPTION,
  origin: 'internal',
  spec: {
    name: 'timestamp',
    brief:
      'Get current timestamp and track time differences between calls. Useful for monitoring execution time and time-based decisions.',
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
  instruction: TIMESTAMP_INSTRUCTION_EN,
  tags: ['timestamp', 'time', 'utility'],
  running: false,
  enabled: true,
  requiresLLM: false,
  callback: timestampToolCallback,
  displayComponent: TimestampDisplay,
  inputSchema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['timestamp', 'iso', 'date', 'all'],
        description: 'Return format: timestamp (Unix ms), iso, date, or all (default)',
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
          timestamp: { type: 'number', description: 'Unix timestamp (milliseconds)' },
          utc: {
            type: 'object',
            description: 'UTC time',
            properties: {
              iso: { type: 'string', description: 'ISO 8601 UTC time' },
              date: { type: 'string', description: 'UTC date (YYYY-MM-DD)' },
              time: { type: 'string', description: 'UTC time (HH:mm:ss)' }
            }
          },
          local: {
            type: 'object',
            description: 'Local time (system timezone)',
            properties: {
              iso: { type: 'string', description: 'ISO 8601 local time with offset' },
              date: { type: 'string', description: 'Local date (YYYY-MM-DD)' },
              time: { type: 'string', description: 'Local time (HH:mm:ss)' },
              timezone: { type: 'string', description: 'Timezone offset (e.g. +08:00)' }
            }
          }
        }
      },
      previous: {
        type: 'object',
        description: 'Timestamp of previous call (same format as current)',
        properties: {
          timestamp: { type: 'number' },
          utc: { type: 'object' },
          local: { type: 'object' }
        }
      },
      timeDiff: {
        type: 'object',
        description: 'Time difference from previous call',
        properties: {
          milliseconds: { type: 'number' },
          seconds: { type: 'number' },
          minutes: { type: 'number' },
          hours: { type: 'number' },
          days: { type: 'number' }
        }
      }
    }
  }
}
