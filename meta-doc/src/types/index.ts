/**
 * MetaDoc 核心类型定义
 * 统一项目中使用的数据结构类型
 */

// ========== 文档相关类型 ==========

/** 文档大纲树节点 */
export interface DocumentOutlineNode {
  /** 节点路径，根节点为 'dummy' */
  path: string;
  /** 节点标题 */
  title: string;
  /** 节点正文内容 */
  text: string;
  /** 标题层级，0表示根节点，1表示一级标题等 */
  title_level: number;
  /** 子节点列表 */
  children: DocumentOutlineNode[];
}

/** 文档元信息 */
export interface ArticleMetaData {
  /** 文档标题 */
  title: string;
  /** 文档作者 */
  author: string;
  /** 文档描述 */
  description: string;
}

/** 文档格式类型 */
export type DocumentFormat = 'md' | 'tex' | 'json';

/** 导出格式类型 */
export type ExportFormat = 'md' | 'html' | 'docx' | 'pdf' | 'tex';

// ========== AI相关类型 ==========

/** AI对话消息 */
export interface AIDialogMessage {
  /** 消息角色 */
  role: 'user' | 'assistant' | 'system';
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp?: number;
}

/** LLM配置类型 */
export type LLMType = 'openai' | 'ollama' | 'metadoc';

/** LLM配置接口 */
export interface LLMConfig {
  /** LLM类型 */
  type: LLMType;
  /** API地址 */
  apiUrl: string;
  /** API密钥 */
  apiKey?: string;
  /** 选中的模型 */
  selectedModel: string;
  /** 补全模式后缀 */
  completionSuffix?: string;
  /** 聊天模式后缀 */
  chatSuffix?: string;
}

/** AI任务状态值 */
export type AITaskStatusValue = '就绪' | '运行中' | '已完成' | '失败' | '取消';

/** AI任务类型 */
export type AITaskType = 'answer' | 'chat';

/** AI任务信息 */
export interface AITaskInfo {
  /** 任务句柄 */
  handle: string;
  /** 任务名称 */
  name: string;
  /** 提示词或对话内容 */
  prompt: string | AIDialogMessage[];
  /** 结果目标 */
  target?: Ref<string>;
  /** 任务类型 */
  type: AITaskType;
  /** 原始键值，用于去重 */
  origin_key: string;
  /** 任务状态 */
  status: Ref<AITaskStatusValue>;
  /** 是否使用RAG */
  try_rag: boolean;
  /** 任务元数据 */
  meta?: Record<string, any>;
  /** 中止控制器 */
  controller?: AbortController | null;
  /** 完成回调 */
  resolveDone?: ((result?: any) => void) | null;
  /** 错误回调 */
  rejectDone?: ((error?: any) => void) | null;
}

// ========== 设置相关类型 ==========

/** 主题类型 */
export type ThemeType = 'light' | 'dark' | 'auto';

/** 启动选项 */
export type StartupOption = 'newFile' | 'lastFile' | 'welcome';

/** 自动保存选项 */
export type AutoSaveOption = 'never' | number; // 数字表示分钟间隔

/** 自动补全模式 */
export type AutoCompletionMode = 'full' | 'incremental';

/** OpenAI设置 */
export interface OpenAISettings {
  /** API地址 */
  apiUrl: string;
  /** API密钥 */
  apiKey: string;
  /** 选中的模型 */
  selectedModel: string;
  /** 补全后缀 */
  completionSuffix: string;
  /** 聊天后缀 */
  chatSuffix: string;
}

/** Ollama设置 */
export interface OllamaSettings {
  /** API地址 */
  apiUrl: string;
  /** 选中的模型 */
  selectedModel: string;
}

/** MetaDoc设置 */
export interface MetaDocSettings {
  /** 选中的模型 */
  selectedModel: string;
}

/** 应用设置接口 */
export interface AppSettings {
  /** 启动选项 */
  startupOption: StartupOption;
  /** 自动保存 */
  autoSave: AutoSaveOption;
  /** 全局主题 */
  globalTheme: ThemeType;
  /** 内容主题 */
  contentTheme: string;
  /** 代码主题 */
  codeTheme: string;
  /** 是否显示行号 */
  lineNumber: boolean;
  /** 自定义主题色 */
  customThemeColor: string;
  /** 是否启用LLM */
  llmEnabled: boolean;
  /** 选中的LLM类型 */
  selectedLlm: LLMType;
  /** 是否启用知识库 */
  enableKnowledgeBase: boolean;
  /** 知识库置信度阈值 */
  knowledgeBaseScoreThreshold: number;
  /** 是否启用自动补全 */
  autoCompletion: boolean;
  /** 自动补全模式 */
  autoCompletionMode: AutoCompletionMode;
  /** 是否自动移除推理标签 */
  autoRemoveThinkTag: boolean;
  /** 统计时是否忽略代码块 */
  bypassCodeBlock: boolean;
  /** 是否自动保存外部图片 */
  autoSaveExternalImage: boolean;
  /** OpenAI设置 */
  openai: OpenAISettings;
  /** Ollama设置 */
  ollama: OllamaSettings;
  /** MetaDoc设置 */
  metadoc: MetaDocSettings;
  /** 是否总是询问保存 */
  alwaysAskSave: boolean;
  /** 是否启用粒子效果 */
  particleEffect: boolean;
}

// ========== 文件操作相关类型 ==========

/** 文件操作结果 */
export interface FileOperationResult {
  /** 操作是否成功 */
  success: boolean;
  /** 文件路径 */
  path?: string;
  /** 错误消息 */
  error?: string;
}

/** 保存选项 */
export interface SaveOptions {
  /** 是否另存为 */
  saveAs?: boolean;
  /** 指定格式 */
  format?: DocumentFormat;
}

/** 导出选项 */
export interface ExportOptions {
  /** 导出格式 */
  format: ExportFormat;
  /** 输出文件名 */
  filename?: string;
}

// ========== 知识库相关类型 ==========

/** 知识库查询结果 */
export interface KnowledgeBaseResult {
  /** 匹配文本 */
  text: string;
  /** 余弦相似度 */
  cosSim: number;
  /** 关键词相似度 */
  keywordSim?: number;
  /** 混合评分 */
  hybridScore?: number;
  /** 重排评分 */
  rerankScore?: number;
}

/** 向量信息 */
export interface VectorInfo {
  /** 文本块数量 */
  chunks: number;
  /** 向量维度 */
  vector_dim: number;
  /** 向量总数 */
  vector_count: number;
  /** 是否启用 */
  enabled?: boolean;
}

// ========== 事件相关类型 ==========

/** 广播消息 */
export interface BroadcastMessage {
  /** 目标窗口类型 */
  to: 'all' | 'home' | 'ai-chat' | string;
  /** 事件名称 */
  eventName: string;
  /** 传递数据 */
  data: any;
}

/** 窗口类型 */
export type WindowType = 'home' | 'setting' | 'ai-chat' | 'ai-graph' | 'formula-recognition';

// ========== 图表相关类型 ==========

/** 词频数据 */
export interface WordFrequencyData {
  /** 词语 */
  word: string;
  /** 频次 */
  size: number;
}

/** 饼图数据 */
export interface PieChartData {
  /** 标签 */
  label: string;
  /** 数值 */
  value: number;
}

// ========== 工具类型 ==========

/** 响应式引用类型 */
export type Ref<T> = import('vue').Ref<T>;

/** 可选字段 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** 部分可选 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
