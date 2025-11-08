export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

export interface LogPayload {
  level: LogLevel;
  scope?: string;
  processType: 'main' | 'renderer';
  windowType?: string;
  messages: string[];
  timestamp?: string;
}

export interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
  logFilePath: string;
  logDirectory: string;
}

export const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
  enabled: true,
  level: 'info',
  logFilePath: '',
  logDirectory: ''
};

