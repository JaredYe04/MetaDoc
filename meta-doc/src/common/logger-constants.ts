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
  /**
   * 日志过滤条件，支持按scope过滤
   * 如果设置，只有匹配该条件的日志才会被输出
   * 支持完整匹配或前缀匹配（如果scope以filter开头则匹配）
   * 例如：
   * - "ai-graph" 会匹配 "ai-graph" 和 "[ai-graph][WorkflowTool]"
   * - "[ai-graph][WorkflowTool]" 会精确匹配该scope
   */
  filter?: string;
}

export const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
  enabled: true,
  level: 'info',
  logFilePath: '',
  logDirectory: '',
  filter: undefined
};

