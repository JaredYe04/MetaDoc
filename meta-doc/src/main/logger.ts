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

import { app, BrowserWindow, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { LOG_LEVEL_PRIORITY, LogLevel, LogPayload, LoggerConfig, DEFAULT_LOGGER_CONFIG } from '../common/logger-constants';

interface ConsoleHistoryEntry {
  content: string;
  type: 'out' | 'err' | 'warn' | 'debug';
}

interface InternalLoggerConfig {
  enabled: boolean;
  level: LogLevel;
}

interface InternalContext {
  processType: 'main' | 'renderer';
  scope?: string;
  windowType?: string;
}

const Store = require('electron-store');
const store = new Store();

const CONFIG_ENABLED_KEY = 'loggingEnabled';
const CONFIG_LEVEL_KEY = 'loggingLevel';

let logDirectory = '';
let logFilePath = '';
let initialized = false;

let stream: fs.WriteStream | null = null;
let waitingForReady = false;
const logHistory: ConsoleHistoryEntry[] = [];
const MAX_HISTORY = 500;

const config: InternalLoggerConfig = {
  enabled: true,
  level: 'info'
};

const ensureInitialized = () => {
  if (initialized) {
    return;
  }

  if (!app.isReady()) {
    if (!waitingForReady) {
      waitingForReady = true;
      app.once('ready', () => {
        waitingForReady = false;
        ensureInitialized();
      });
    }
    return;
  }

  const enabledFromStore = store.get(CONFIG_ENABLED_KEY);
  if (typeof enabledFromStore === 'boolean') {
    config.enabled = enabledFromStore;
  } else if (enabledFromStore === undefined) {
    store.set(CONFIG_ENABLED_KEY, config.enabled);
  }

  const levelFromStore = store.get(CONFIG_LEVEL_KEY);
  if (typeof levelFromStore === 'string' && levelFromStore in LOG_LEVEL_PRIORITY) {
    config.level = levelFromStore as LogLevel;
  } else if (levelFromStore === undefined) {
    store.set(CONFIG_LEVEL_KEY, config.level);
  }

  const basePath = app.getPath('documents');
  logDirectory = path.join(basePath, 'meta-doc', 'logs');

  try {
    if (!fs.existsSync(logDirectory)) {
      fs.mkdirSync(logDirectory, { recursive: true });
    }
  } catch (error) {
    console.error('创建日志目录失败:', error);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  logFilePath = path.join(logDirectory, `${timestamp}.log`);

  try {
    stream = fs.createWriteStream(logFilePath, { flags: 'a' });
  } catch (error) {
    console.error('创建日志文件失败:', error);
    stream = null;
  }

  initialized = true;
  broadcastLoggerConfig();
};

const formatMessage = (payload: LogPayload): string => {
  const timestamp = new Date().toISOString();
  const scopeSegment = payload.scope ? `[${payload.scope}]` : '';
  const windowSegment = payload.windowType ? `[${payload.windowType}]` : '';
  const body = payload.messages.join(' ');
  return `${timestamp} [${payload.processType.toUpperCase()}]${windowSegment}${scopeSegment} [${payload.level.toUpperCase()}] ${body}`;
};

const appendToFile = (line: string) => {
  if (!stream) {
    return;
  }

  stream.write(line + '\n');
};

const broadcastConsoleMessage = (level: LogLevel, line: string): void => {
  const channel = level === 'error' ? 'console-err' : 'console-out';
  const type = level === 'error'
    ? 'err'
    : level === 'warn'
      ? 'warn'
      : level === 'debug'
        ? 'debug'
        : 'out';

  logHistory.push({ content: line, type });
  if (logHistory.length > MAX_HISTORY) {
    logHistory.splice(0, logHistory.length - MAX_HISTORY);
  }

  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send(channel, {
      key: 'logger',
      content: line,
      type
    });
  });
};

const shouldLog = (level: LogLevel): boolean => {
  return config.enabled && LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[config.level];
};

const normalizeArg = (arg: unknown): string => {
  if (typeof arg === 'string') {
    return arg;
  }

  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`;
  }

  try {
    return JSON.stringify(arg);
  } catch (error) {
    return String(arg);
  }
};

const logInternal = (context: InternalContext, level: LogLevel, args: unknown[]) => {
  ensureInitialized();

  if (!shouldLog(level)) {
    return;
  }

  const payload: LogPayload = {
    level,
    scope: context.scope,
    processType: context.processType,
    windowType: context.windowType,
    messages: args.map(normalizeArg)
  };

  const line = formatMessage(payload);
  appendToFile(line);
  broadcastConsoleMessage(level, line);

  switch (level) {
    case 'debug':
      console.debug(line);
      break;
    case 'info':
      console.info(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'error':
      console.error(line);
      break;
  }
};

export const initLogger = (): void => {
  ensureInitialized();
};

export const shutdownLogger = (): void => {
  if (stream) {
    stream.end();
    stream = null;
  }
};

export const updateLoggerConfig = (partial: Partial<InternalLoggerConfig>): void => {
  ensureInitialized();

  let changed = false;

  if (typeof partial.enabled === 'boolean' && partial.enabled !== config.enabled) {
    config.enabled = partial.enabled;
    changed = true;
  }

  if (partial.level && partial.level in LOG_LEVEL_PRIORITY && partial.level !== config.level) {
    config.level = partial.level;
    changed = true;
  }

  if (changed) {
    broadcastLoggerConfig();
    logInternal({ processType: 'main', scope: 'Logger' }, 'info', [`日志配置更新: enabled=${config.enabled}, level=${config.level}`]);
  }
};

export const getLoggerConfig = (): LoggerConfig => {
  ensureInitialized();

  return {
    enabled: config.enabled,
    level: config.level,
    logFilePath,
    logDirectory
  };
};

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
 * @param scope - Logger 的作用域名称，用于日志标识
 * @returns 返回包含 debug、info、warn、error 方法的 Logger 对象
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
 * }
 * ```
 */
export const createMainLogger = (scope: string): Record<LogLevel, (...args: unknown[]) => void> => {
  return {
    debug: (...args: unknown[]) => logInternal({ processType: 'main', scope }, 'debug', args),
    info: (...args: unknown[]) => logInternal({ processType: 'main', scope }, 'info', args),
    warn: (...args: unknown[]) => logInternal({ processType: 'main', scope }, 'warn', args),
    error: (...args: unknown[]) => logInternal({ processType: 'main', scope }, 'error', args)
  };
};

export const handleRendererLog = (payload: LogPayload): void => {
  logInternal({
    processType: payload.processType,
    scope: payload.scope,
    windowType: payload.windowType
  }, payload.level, payload.messages);
};

export const openCurrentLogFile = async (): Promise<void> => {
  ensureInitialized();

  if (!logFilePath || !fs.existsSync(logFilePath)) {
    return;
  }

  await shell.openPath(logFilePath);
};

export const openLogDirectory = async (): Promise<void> => {
  ensureInitialized();

  if (!logDirectory || !fs.existsSync(logDirectory)) {
    return;
  }

  await shell.openPath(logDirectory);
};

export const broadcastLoggerConfig = (): void => {
  const configSnapshot = getLoggerConfig();
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('logger-config-updated', configSnapshot);
  });
};

export const getLoggerHistory = (): ConsoleHistoryEntry[] => {
  ensureInitialized();
  return [...logHistory];
};

process.on('exit', () => {
  shutdownLogger();
});

process.on('SIGINT', () => {
  shutdownLogger();
});

