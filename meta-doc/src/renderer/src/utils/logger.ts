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

interface RendererLogger {
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

