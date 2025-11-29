/**
 * 渲染进程 Logger 模块
 * 
 * ⚠️ **重要：避免初始化顺序问题**
 * 
 * 在使用 `createRendererLogger()` 时，需要注意避免在模块顶层或类构造函数中直接创建 logger 实例。
 * 这可能导致循环依赖或初始化顺序问题，出现 "Cannot access before initialization" 错误。
 * 
 * **最佳实践：**
 * - ✅ 使用懒加载方式创建 logger（推荐）
 * - ✅ 在函数/方法内部创建 logger
 * - ❌ 避免在模块顶层直接创建 logger
 * - ❌ 避免在类构造函数中直接创建 logger
 * 
 * 更多详情请参考 `createRendererLogger()` 函数的 JSDoc 注释。
 * 详细使用指南请查看：`logger-usage-guide.md`
 */

import { LOG_LEVEL_PRIORITY, LogLevel, LogPayload, LoggerConfig, DEFAULT_LOGGER_CONFIG } from '../../../common/logger-constants';
import localIpcRenderer from './web-adapter/local-ipc-renderer.ts';
import { webMainCalls } from './web-adapter/web-main-calls.js';

declare global {
  interface Window {
    electron?: {
      ipcRenderer?: typeof localIpcRenderer;
    };
    console: Console;
  }
}

type ConsoleMethod = 'debug' | 'info' | 'warn' | 'error';

interface RendererLoggerOptions {
  windowTypeProvider?: () => string | undefined;
}

export interface RendererLogger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface LoggerHistoryEntry {
  content: string;
  type: 'out' | 'err' | 'warn' | 'debug';
}

const consoleMethodMap: Record<LogLevel, ConsoleMethod> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error'
};

let ipcRenderer: typeof localIpcRenderer | null = null;

if (typeof window !== 'undefined') {
  if (window.electron?.ipcRenderer) {
    ipcRenderer = window.electron.ipcRenderer;
  } else {
    webMainCalls();
    ipcRenderer = localIpcRenderer;
  }
}

const state: {
  config: LoggerConfig;
  initialized: boolean;
} = {
  config: { ...DEFAULT_LOGGER_CONFIG },
  initialized: false
};

const historyCache: LoggerHistoryEntry[] = [];
const rendererLoggerCache = new Map<string, RendererLogger>();

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

const shouldLog = (level: LogLevel): boolean => {
  return state.config.enabled && LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[state.config.level];
};

const ensureConfigLoaded = async () => {
  if (state.initialized || !ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
    return;
  }

  try {
    const remoteConfig = await ipcRenderer.invoke('get-logger-config');
    if (remoteConfig) {
      state.config = {
        ...state.config,
        ...remoteConfig
      };
    }
  } catch (error) {
    window?.console?.warn?.('[Logger] 获取日志配置失败', error);
  } finally {
    state.initialized = true;
  }
};

if (ipcRenderer && typeof ipcRenderer.on === 'function') {
  ipcRenderer.on('logger-config-updated', (_event, config: LoggerConfig) => {
    state.config = {
      ...state.config,
      ...config
    };
    state.initialized = true;
  });
}

const logThroughConsole = (level: LogLevel, message: string) => {
  const method = consoleMethodMap[level];
  window?.console?.[method]?.(message);
};

const dispatch = async (payload: LogPayload, level: LogLevel, formattedMessage: string) => {
  if (!ipcRenderer || typeof ipcRenderer.send !== 'function') {
    logThroughConsole(level, formattedMessage);
    return;
  }

  if (!state.initialized) {
    await ensureConfigLoaded();
  }

  if (!shouldLog(level)) {
    return;
  }

  ipcRenderer.send('logger-log', payload);
  logThroughConsole(level, formattedMessage);
};

const buildMessage = (level: LogLevel, scope: string | undefined, processType: 'renderer', windowType: string | undefined, args: unknown[]): { payload: LogPayload; formatted: string } => {
  const normalized = args.map(normalizeArg);
  const payload: LogPayload = {
    level,
    scope,
    processType,
    windowType,
    messages: normalized
  };

  const timestamp = new Date().toISOString();
  const scopeSegment = scope ? `[${scope}]` : '';
  const windowSegment = windowType ? `[${windowType}]` : '';
  const formatted = `${timestamp} [RENDERER]${windowSegment}${scopeSegment} [${level.toUpperCase()}] ${normalized.join(' ')}`;

  return { payload, formatted };
};

/**
 * 创建渲染进程 Logger
 * 
 * ⚠️ **重要：避免初始化顺序问题**
 * 
 * 在模块顶层直接调用 `createRendererLogger()` 可能导致循环依赖或初始化顺序问题。
 * 特别是在类构造函数中、或模块立即执行代码中调用时，可能会遇到 "Cannot access before initialization" 错误。
 * 
 * **推荐做法：**
 * 
 * 1. **类中使用懒加载方式（推荐）**：
 * ```typescript
 * class MyClass {
 *   private logger: ReturnType<typeof createRendererLogger> | null = null
 * 
 *   private getLogger() {
 *     if (!this.logger) {
 *       this.logger = createRendererLogger('MyClass')
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
 * let loggerInstance: ReturnType<typeof createRendererLogger> | null = null
 * 
 * function getLogger() {
 *   if (!loggerInstance) {
 *     loggerInstance = createRendererLogger('MyModule')
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
 *   const logger = createRendererLogger('MyModule')
 *   logger.info('消息')
 * }
 * ```
 * 
 * **不推荐的做法（可能导致初始化顺序问题）**：
 * ```typescript
 * // ❌ 不推荐：在模块顶层直接创建
 * const logger = createRendererLogger('MyModule')  // 可能出错！
 * 
 * // ❌ 不推荐：在构造函数中立即使用
 * class MyClass {
 *   private logger = createRendererLogger('MyClass')  // 可能出错！
 *   
 *   constructor() {
 *     this.logger.info('消息')  // 可能出错！
 *   }
 * }
 * ```
 * 
 * @param scope - Logger 的作用域名称，用于日志标识（可选）
 * @param options - Logger 选项（可选）
 * @returns 返回 RendererLogger 实例，包含 debug、info、warn、error 方法
 * 
 * @example
 * ```typescript
 * // 推荐：懒加载方式
 * let loggerInstance: ReturnType<typeof createRendererLogger> | null = null
 * 
 * function getLogger() {
 *   if (!loggerInstance) {
 *     loggerInstance = createRendererLogger('MyModule')
 *   }
 *   return loggerInstance
 * }
 * 
 * export function myFunction() {
 *   getLogger().info('函数执行')
 * }
 * ```
 */
export const createRendererLogger = (scope?: string, options: RendererLoggerOptions = {}): RendererLogger => {
  const windowTypeProvider = options.windowTypeProvider;
  const cacheKey = `${scope ?? 'default'}|${windowTypeProvider ? windowTypeProvider.toString() : 'no-window-provider'}`;
  if (rendererLoggerCache.has(cacheKey)) {
    return rendererLoggerCache.get(cacheKey)!;
  }

  const log = (level: LogLevel, args: unknown[]) => {
    const windowType = windowTypeProvider ? windowTypeProvider() : undefined;
    const { payload, formatted } = buildMessage(level, scope, 'renderer', windowType, args);
    void dispatch(payload, level, formatted);
  };

  const logger: RendererLogger = {
    debug: (...args: unknown[]) => log('debug', args),
    info: (...args: unknown[]) => log('info', args),
    warn: (...args: unknown[]) => log('warn', args),
    error: (...args: unknown[]) => log('error', args)
  };
  rendererLoggerCache.set(cacheKey, logger);
  return logger;
};

export const getRendererLoggerConfig = async (): Promise<LoggerConfig> => {
  if (!state.initialized) {
    await ensureConfigLoaded();
  }
  return { ...state.config };
};

const normalizeHistoryEntry = (entry: any): LoggerHistoryEntry | null => {
  if (!entry) {
    return null;
  }

  const rawType = typeof entry.type === 'string' ? entry.type.toLowerCase() : 'out';
  let type: LoggerHistoryEntry['type'] = 'out';
  if (rawType === 'err' || rawType === 'error') type = 'err';
  else if (rawType === 'warn' || rawType === 'warning') type = 'warn';
  else if (rawType === 'debug') type = 'debug';

  const content = typeof entry.content === 'string' ? entry.content : String(entry.content ?? '');
  return { content, type };
};

export const fetchLoggerHistory = async (): Promise<LoggerHistoryEntry[]> => {
  if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
    return [...historyCache];
  }

  try {
    const data = await ipcRenderer.invoke('get-logger-history');
    if (Array.isArray(data)) {
      historyCache.splice(0, historyCache.length);
      data.forEach(item => {
        const normalized = normalizeHistoryEntry(item);
        if (normalized) {
          historyCache.push(normalized);
        }
      });
    }
  } catch (error) {
    window?.console?.warn?.('[Logger] 获取日志历史失败', error);
  }

  return [...historyCache];
};

export const getCachedLoggerHistory = (): LoggerHistoryEntry[] => {
  return [...historyCache];
};

