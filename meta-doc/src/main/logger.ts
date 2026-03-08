/**
 * 主进程 Logger 模块
 *
 * ⚠️ **重要：避免初始化顺序问题**
 *
 * 在使用 `createMainLogger()` 时，需要注意避免在模块顶层或类构造函数中直接创建 logger 实例。
 * 这可能导致循环依赖或初始化顺序问题，出现 "Cannot access before initialization" 错误。
 *
 * **最佳实践：**
 * - ✅ 使用懒加载方式创建 logger（推荐）
 * - ✅ 在函数/方法内部创建 logger
 * - ❌ 避免在模块顶层直接创建 logger
 * - ❌ 避免在类构造函数中直接创建 logger
 *
 * 更多详情请参考 `createMainLogger()` 函数的 JSDoc 注释。
 * 详细使用指南请查看：`src/renderer/src/utils/logger-usage-guide.md`
 */

import { app, BrowserWindow, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import {
  LOG_LEVEL_PRIORITY,
  LogLevel,
  LogPayload,
  LoggerConfig,
  DEFAULT_LOGGER_CONFIG
} from '../common/logger-constants'

interface ConsoleHistoryEntry {
  content: string
  type: 'out' | 'err' | 'warn' | 'debug'
}

interface InternalLoggerConfig {
  enabled: boolean
  level: LogLevel
  filter?: string
}

interface InternalContext {
  processType: 'main' | 'renderer'
  scope?: string
  windowType?: string
}

const Store = require('electron-store')
const store = new Store()

const CONFIG_ENABLED_KEY = 'loggingEnabled'
const CONFIG_LEVEL_KEY = 'loggingLevel'
const CONFIG_FILTER_KEY = 'loggingFilter'
const CONFIG_RETENTION_PERIOD_KEY = 'logRetentionPeriod'

let logDirectory = ''
let logFilePath = ''
let initialized = false

let stream: fs.WriteStream | null = null
let waitingForReady = false
/** 关闭后不再向窗口广播，避免退出时对已销毁窗口 send 报错 */
let loggerShutdown = false
const logHistory: ConsoleHistoryEntry[] = []
const MAX_HISTORY = 500

const config: InternalLoggerConfig = {
  enabled: true,
  level: 'info'
}

const ensureInitialized = () => {
  if (initialized) {
    return
  }

  if (!app.isReady()) {
    if (!waitingForReady) {
      waitingForReady = true
      app.once('ready', () => {
        waitingForReady = false
        ensureInitialized()
      })
    }
    return
  }

  const enabledFromStore = store.get(CONFIG_ENABLED_KEY)
  if (typeof enabledFromStore === 'boolean') {
    config.enabled = enabledFromStore
  } else if (enabledFromStore === undefined) {
    store.set(CONFIG_ENABLED_KEY, config.enabled)
  }

  const levelFromStore = store.get(CONFIG_LEVEL_KEY)
  if (typeof levelFromStore === 'string' && levelFromStore in LOG_LEVEL_PRIORITY) {
    config.level = levelFromStore as LogLevel
  } else if (levelFromStore === undefined) {
    store.set(CONFIG_LEVEL_KEY, config.level)
  }

  const filterFromStore = store.get(CONFIG_FILTER_KEY)
  if (typeof filterFromStore === 'string') {
    config.filter = filterFromStore || undefined
  } else if (filterFromStore === undefined) {
    store.set(CONFIG_FILTER_KEY, config.filter || '')
  }

  const basePath = app.getPath('documents')
  logDirectory = path.join(basePath, 'meta-doc', 'logs')

  try {
    if (!fs.existsSync(logDirectory)) {
      fs.mkdirSync(logDirectory, { recursive: true })
    }
  } catch (error) {
    console.error('创建日志目录失败:', error)
  }
  // 使用用户本地时区，格式化为 YYYY-MM-DD HH-mm-ss
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const timestamp = `${year}-${month}-${day} ${hours}-${minutes}-${seconds}`
  logFilePath = path.join(logDirectory, `${timestamp}.log`)

  try {
    stream = fs.createWriteStream(logFilePath, { flags: 'a' })
  } catch (error) {
    console.error('创建日志文件失败:', error)
    stream = null
  }

  initialized = true
  broadcastLoggerConfig()

  // 在初始化完成后执行日志清理
  cleanupOldLogs()
}

/**
 * 格式化scope字符串，支持链式子模块格式
 * 如果scope已经是方括号格式（如 [parent][child]），则直接使用
 * 如果是简单字符串，则添加方括号
 */
const formatScopeSegment = (scope: string | undefined): string => {
  if (!scope) return ''
  // 如果已经是方括号格式（包含多个方括号），直接返回
  if (scope.includes('][')) {
    return scope.startsWith('[') ? scope : `[${scope}]`
  }
  // 简单字符串，添加方括号
  return `[${scope}]`
}

/** 统一格式：时间戳 + 日志等级 + 所属进程/模块 + 内容（无日期前缀） */
const formatMessage = (payload: LogPayload): string => {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const timestamp = `${hours}:${minutes}:${seconds}`
  const scopeSegment = formatScopeSegment(payload.scope)
  const windowSegment = payload.windowType ? `[${payload.windowType}]` : ''
  const processModule = `[${payload.processType.toUpperCase()}]${windowSegment}${scopeSegment}`
  const body = payload.messages.join(' ')
  return `${timestamp} [${payload.level.toUpperCase()}] ${processModule} ${body}`
}

const appendToFile = (line: string) => {
  if (!stream) {
    return
  }

  stream.write(line + '\n')
}

const broadcastConsoleMessage = (level: LogLevel, line: string): void => {
  if (loggerShutdown) return
  const channel = level === 'error' ? 'console-err' : 'console-out'
  const type =
    level === 'error' ? 'err' : level === 'warn' ? 'warn' : level === 'debug' ? 'debug' : 'out'

  logHistory.push({ content: line, type })
  if (logHistory.length > MAX_HISTORY) {
    logHistory.splice(0, logHistory.length - MAX_HISTORY)
  }

  BrowserWindow.getAllWindows().forEach((win) => {
    try {
      if (win.isDestroyed() || win.webContents?.isDestroyed?.()) return
      win.webContents.send(channel, {
        key: 'logger',
        content: line,
        type
      })
    } catch {
      // 关闭过程中窗口可能已被销毁，忽略
    }
  })
}

/**
 * 检查scope是否匹配过滤条件
 * 支持完整匹配或前缀匹配，大小写不敏感
 */
const matchesFilter = (scope: string | undefined, filter: string | undefined): boolean => {
  if (!filter || !filter.trim()) {
    return true // 无过滤条件，全部通过
  }
  if (!scope) {
    return false // 有过滤条件但无scope，不匹配
  }
  const filterTrimmed = filter.trim().toLowerCase()
  const scopeLower = scope.toLowerCase()
  // 完整匹配（大小写不敏感）
  if (scopeLower === filterTrimmed) {
    return true
  }
  // 前缀匹配：如果scope以filter开头（考虑链式格式）
  // 例如 filter="ai-graph" 匹配 "[ai-graph][WorkflowTool]"
  if (scopeLower.startsWith(filterTrimmed) || scopeLower.includes(`[${filterTrimmed}]`)) {
    return true
  }
  return false
}

const shouldLog = (level: LogLevel, scope?: string): boolean => {
  if (!config.enabled) {
    return false
  }
  if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[config.level]) {
    return false
  }
  // 检查过滤条件
  if (!matchesFilter(scope, config.filter)) {
    return false
  }
  return true
}

const normalizeArg = (arg: unknown): string => {
  if (typeof arg === 'string') {
    return arg
  }

  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`
  }

  try {
    return JSON.stringify(arg)
  } catch (error) {
    return String(arg)
  }
}

/** ANSI 颜色：控制台输出 warning 黄、error 红；可通过 FORCE_COLOR=0 关闭 */
const ANSI_RESET = '\x1b[0m'
const ANSI_RED = '\x1b[31m'
const ANSI_YELLOW = '\x1b[33m'

const colorizeForStdio = (line: string, level: LogLevel): string => {
  if (process.env.FORCE_COLOR === '0') {
    return line
  }
  switch (level) {
    case 'error':
      return `${ANSI_RED}${line}${ANSI_RESET}`
    case 'warn':
      return `${ANSI_YELLOW}${line}${ANSI_RESET}`
    default:
      return line
  }
}

const logInternal = (context: InternalContext, level: LogLevel, args: unknown[]) => {
  ensureInitialized()

  if (!shouldLog(level, context.scope)) {
    return
  }

  const payload: LogPayload = {
    level,
    scope: context.scope,
    processType: context.processType,
    windowType: context.windowType,
    messages: args.map(normalizeArg)
  }

  const line = formatMessage(payload)
  appendToFile(line)
  broadcastConsoleMessage(level, line)

  const stdioLine = colorizeForStdio(line, level)
  const out = stdioLine + '\n'
  if (level === 'error') {
    process.stderr.write(out)
  } else {
    process.stdout.write(out)
  }
}

export const initLogger = (): void => {
  ensureInitialized()
}

export const shutdownLogger = (): void => {
  loggerShutdown = true
  if (stream) {
    stream.end()
    stream = null
  }
}

export const updateLoggerConfig = (partial: Partial<InternalLoggerConfig>): void => {
  ensureInitialized()

  let changed = false

  if (typeof partial.enabled === 'boolean' && partial.enabled !== config.enabled) {
    config.enabled = partial.enabled
    store.set(CONFIG_ENABLED_KEY, config.enabled)
    changed = true
  }

  if (partial.level && partial.level in LOG_LEVEL_PRIORITY && partial.level !== config.level) {
    config.level = partial.level
    store.set(CONFIG_LEVEL_KEY, config.level)
    changed = true
  }

  if (partial.filter !== undefined) {
    const newFilter = partial.filter?.trim() || undefined
    if (newFilter !== config.filter) {
      config.filter = newFilter
      store.set(CONFIG_FILTER_KEY, config.filter || '')
      changed = true
    }
  }

  if (changed) {
    broadcastLoggerConfig()
    const filterInfo = config.filter ? `, filter=${config.filter}` : ''
    logInternal({ processType: 'main', scope: 'Logger' }, 'info', [
      `日志配置更新: enabled=${config.enabled}, level=${config.level}${filterInfo}`
    ])
  }
}

export const getLoggerConfig = (): LoggerConfig => {
  ensureInitialized()

  return {
    enabled: config.enabled,
    level: config.level,
    logFilePath,
    logDirectory,
    filter: config.filter
  }
}

/**
 * 创建主进程 Logger
 *
 * ⚠️ **重要：避免初始化顺序问题**
 *
 * 在模块顶层直接调用 `createMainLogger()` 可能导致循环依赖或初始化顺序问题。
 * 特别是在类构造函数中、或模块立即执行代码中调用时，可能会遇到 "Cannot access before initialization" 错误。
 *
 * **推荐做法：**
 *
 * 1. **类中使用懒加载方式（推荐）**：
 * ```typescript
 * class MyClass {
 *   private logger: ReturnType<typeof createMainLogger> | null = null
 *
 *   private getLogger() {
 *     if (!this.logger) {
 *       this.logger = createMainLogger('MyClass')
 *     }
 *     return this.logger
 *   }
 *
 *   someMethod() {
 *     this.getLogger().info('消息')
 *   }
 * }
 * ```
 *
 * 2. **函数文件中使用懒加载方式（推荐）**：
 * ```typescript
 * let loggerInstance: ReturnType<typeof createMainLogger> | null = null
 *
 * function getLogger() {
 *   if (!loggerInstance) {
 *     loggerInstance = createMainLogger('MyModule')
 *   }
 *   return loggerInstance
 * }
 *
 * export function myFunction() {
 *   getLogger().info('消息')
 * }
 * ```
 *
 * 3. **在函数/方法内部调用（可以，但性能略差）**：
 * ```typescript
 * export function myFunction() {
 *   const logger = createMainLogger('MyModule')
 *   logger.info('消息')
 * }
 * ```
 *
 * **不推荐的做法（可能导致初始化顺序问题）**：
 * ```typescript
 * // ❌ 不推荐：在模块顶层直接创建
 * const logger = createMainLogger('MyModule')  // 可能出错！
 *
 * // ❌ 不推荐：在构造函数中立即使用
 * class MyClass {
 *   private logger = createMainLogger('MyClass')  // 可能出错！
 *
 *   constructor() {
 *     this.logger.info('消息')  // 可能出错！
 *   }
 * }
 * ```
 *
 * **链式子模块支持：**
 *
 * Logger 支持链式调用创建子模块logger，方便进行模块化日志管理：
 * ```typescript
 * const logger = createMainLogger('ai-graph');
 *
 * // 单层子模块
 * logger.sub('WorkflowTool').info('执行工作流');
 * // 输出: [ai-graph][WorkflowTool] [INFO] 执行工作流
 *
 * // 多层链式调用
 * logger.sub('WorkflowTool').sub('Executor').sub('NodeRunner').info('运行节点');
 * // 输出: [ai-graph][WorkflowTool][Executor][NodeRunner] [INFO] 运行节点
 *
 * // 子模块logger可以独立使用
 * const workflowLogger = logger.sub('WorkflowTool');
 * workflowLogger.info('初始化');
 * workflowLogger.sub('Parser').debug('解析配置');
 * ```
 *
 * @param scope - Logger 的作用域名称，用于日志标识
 * @returns 返回包含 debug、info、warn、error 和 sub 方法的 Logger 对象
 *
 * @example
 * ```typescript
 * // 推荐：懒加载方式
 * let loggerInstance: ReturnType<typeof createMainLogger> | null = null
 *
 * function getLogger() {
 *   if (!loggerInstance) {
 *     loggerInstance = createMainLogger('MyModule')
 *   }
 *   return loggerInstance
 * }
 *
 * export function myFunction() {
 *   getLogger().info('函数执行')
 *   getLogger().sub('SubModule').debug('调试信息')
 * }
 * ```
 */
/**
 * 主进程Logger类型，支持链式子模块
 */
export interface MainLogger extends Record<LogLevel, (...args: unknown[]) => void> {
  /**
   * 创建子模块logger，支持链式调用
   * @param subScope 子模块名称
   * @returns 返回一个新的logger实例，其scope为当前scope的子模块
   * @example
   * ```typescript
   * const logger = createMainLogger('ai-graph');
   * logger.sub('WorkflowTool').sub('Executor').info('执行工作流');
   * // 输出: [ai-graph][WorkflowTool][Executor] [INFO] 执行工作流
   * ```
   */
  sub: (subScope: string) => MainLogger
}

/**
 * 创建子模块scope字符串
 * 如果父scope为空，直接返回子scope
 * 如果父scope已有内容，将子scope追加到父scope后面，格式为 [parent][child]
 */
const createSubScope = (parentScope: string, subScope: string): string => {
  // 如果父scope已经是链式格式，直接追加
  if (parentScope.includes('][')) {
    return `${parentScope}[${subScope}]`
  }
  // 如果父scope是简单字符串，组合成链式格式
  return `[${parentScope}][${subScope}]`
}

export const createMainLogger = (scope: string): MainLogger => {
  const logger: MainLogger = {
    debug: (...args: unknown[]) => logInternal({ processType: 'main', scope }, 'debug', args),
    info: (...args: unknown[]) => logInternal({ processType: 'main', scope }, 'info', args),
    warn: (...args: unknown[]) => logInternal({ processType: 'main', scope }, 'warn', args),
    error: (...args: unknown[]) => logInternal({ processType: 'main', scope }, 'error', args),
    sub: (subScope: string) => {
      const subLoggerScope = createSubScope(scope, subScope)
      return createMainLogger(subLoggerScope)
    }
  }
  return logger
}

export const handleRendererLog = (payload: LogPayload): void => {
  logInternal(
    {
      processType: payload.processType,
      scope: payload.scope,
      windowType: payload.windowType
    },
    payload.level,
    payload.messages
  )
}

export const openCurrentLogFile = async (): Promise<void> => {
  ensureInitialized()

  if (!logFilePath || !fs.existsSync(logFilePath)) {
    return
  }

  await shell.openPath(logFilePath)
}

export const openLogDirectory = async (): Promise<void> => {
  ensureInitialized()

  if (!logDirectory || !fs.existsSync(logDirectory)) {
    return
  }

  await shell.openPath(logDirectory)
}

export const broadcastLoggerConfig = (): void => {
  if (loggerShutdown) return
  const configSnapshot = getLoggerConfig()
  BrowserWindow.getAllWindows().forEach((win) => {
    try {
      if (win.isDestroyed() || win.webContents?.isDestroyed?.()) return
      win.webContents.send('logger-config-updated', configSnapshot)
    } catch {
      // 关闭过程中窗口可能已被销毁，忽略
    }
  })
}

export const getLoggerHistory = (): ConsoleHistoryEntry[] => {
  ensureInitialized()
  return [...logHistory]
}

/**
 * 将保留期限字符串转换为毫秒数
 */
const getRetentionPeriodMs = (period: string): number | null => {
  switch (period) {
    case 'none':
      return 0 // 不保存，立即删除
    case '1day':
      return 24 * 60 * 60 * 1000
    case '3days':
      return 3 * 24 * 60 * 60 * 1000
    case '7days':
      return 7 * 24 * 60 * 60 * 1000
    case '1month':
      return 30 * 24 * 60 * 60 * 1000
    case '3months':
      return 90 * 24 * 60 * 60 * 1000
    case '6months':
      return 180 * 24 * 60 * 60 * 1000
    case '1year':
      return 365 * 24 * 60 * 60 * 1000
    case 'never':
      return null // 不清理
    default:
      return 3 * 24 * 60 * 60 * 1000 // 默认3天
  }
}

/**
 * 从日志文件名解析日期
 * 支持两种格式：
 * 1. 新格式（本地时区）: YYYY-MM-DD HH-mm-ss.log
 * 2. 旧格式（ISO）: YYYY-MM-DDTHH-mm-ss-sssZ.log 或 YYYY-MM-DDTHH-mm-ssZ.log
 */
const parseLogFileDate = (filename: string): Date | null => {
  try {
    // 移除.log后缀
    const nameWithoutExt = filename.replace(/\.log$/, '')

    // 尝试解析新格式: YYYY-MM-DD HH-mm-ss
    // 例如: "2025-12-09 13-34-21"
    const newFormatMatch = nameWithoutExt.match(/^(\d{4}-\d{2}-\d{2}) (\d{2})-(\d{2})-(\d{2})$/)
    if (newFormatMatch) {
      const datePart = newFormatMatch[1] // YYYY-MM-DD
      const hours = newFormatMatch[2]
      const minutes = newFormatMatch[3]
      const seconds = newFormatMatch[4]
      const dateTimeString = `${datePart} ${hours}:${minutes}:${seconds}`
      const date = new Date(dateTimeString)
      if (!isNaN(date.getTime())) {
        return date
      }
    }

    // 尝试解析旧格式（ISO）: YYYY-MM-DDTHH-mm-ss-sssZ 或 YYYY-MM-DDTHH-mm-ssZ
    // 例如: "2025-12-09T13-34-21-798Z" 或 "2025-12-09T13-34-21Z"
    const isoFormatMatch = nameWithoutExt.match(
      /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})(?:-(\d+))?Z$/
    )
    if (isoFormatMatch) {
      const datePart = isoFormatMatch[1] // YYYY-MM-DD
      const hours = isoFormatMatch[2]
      const minutes = isoFormatMatch[3]
      const seconds = isoFormatMatch[4]
      const milliseconds = isoFormatMatch[5] || '0'

      // 构建 ISO 格式字符串: YYYY-MM-DDTHH:mm:ss.sssZ
      const isoString = `${datePart}T${hours}:${minutes}:${seconds}.${milliseconds.padStart(3, '0')}Z`
      const date = new Date(isoString)
      if (!isNaN(date.getTime())) {
        return date
      }
    }

    // 如果都不匹配，返回 null
    return null
  } catch (error) {
    return null
  }
}

/**
 * 清理旧日志文件
 */
export const cleanupOldLogs = (): void => {
  try {
    if (!logDirectory || !fs.existsSync(logDirectory)) {
      return
    }

    const retentionPeriod = store.get(CONFIG_RETENTION_PERIOD_KEY) || '3days'
    const retentionMs = getRetentionPeriodMs(retentionPeriod)

    // 如果设置为never，不清理
    if (retentionMs === null) {
      return
    }

    const now = Date.now()
    const files = fs.readdirSync(logDirectory)
    let deletedCount = 0

    for (const file of files) {
      if (!file.endsWith('.log')) {
        continue
      }

      const filePath = path.join(logDirectory, file)
      try {
        const fileDate = parseLogFileDate(file)
        if (!fileDate) {
          // 无法解析日期，跳过
          continue
        }

        const fileAge = now - fileDate.getTime()

        // 如果文件年龄超过保留期限，删除
        if (fileAge > retentionMs) {
          // 如果当前正在使用的日志文件，不删除
          if (filePath === logFilePath) {
            continue
          }
          fs.unlinkSync(filePath)
          deletedCount++
        }
      } catch (error) {
        // 删除失败，记录但不中断
        console.error(`删除日志文件失败: ${file}`, error)
      }
    }

    if (deletedCount > 0) {
      logInternal({ processType: 'main', scope: 'Logger' }, 'info', [
        `已清理 ${deletedCount} 个旧日志文件`
      ])
    }
  } catch (error) {
    console.error('清理日志文件失败:', error)
  }
}

process.on('exit', () => {
  shutdownLogger()
})

process.on('SIGINT', () => {
  shutdownLogger()
})
