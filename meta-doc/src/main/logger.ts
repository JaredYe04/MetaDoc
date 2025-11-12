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

