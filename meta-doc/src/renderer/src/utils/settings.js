import eventBus from "./event-bus";
import localIpcRenderer from "./web-adapter/local-ipc-renderer";
import { webMainCalls } from "./web-adapter/web-main-calls";
import { reactive } from "vue";

let ipcRenderer = null
if (window && window.electron) {
  ipcRenderer = window.electron.ipcRenderer
} else {
  webMainCalls();
  ipcRenderer = localIpcRenderer
  //todo 说明当前环境不是electron环境，需要另外适配
}


export async function getSetting(key) {
  try {
    const result = await ipcRenderer.invoke('get-setting', { key: key });
    return result;
  }
  catch (error) {
    console.error(`Error getting setting for key "${key}":`, error);
    return undefined; // 返回undefined表示没有找到设置
  }

}

export async function setSetting(key, value) {
  ipcRenderer.invoke('set-setting', { key: key, value: value });
}

export async function updateRecentDocs(filePath) {
  ipcRenderer.invoke('update-recent-docs', { path: filePath });
}

export async function getRecentDocs() {
  return await ipcRenderer.invoke('get-recent-docs');
}

export async function removeRecentDoc(filePath) {
  return await ipcRenderer.invoke('remove-recent-doc', { path: filePath });
}

export async function getImagePath() {
  return await ipcRenderer.invoke('get-image-path');
}

export const settings = reactive({
  startupOption: "newFile", // 启动选项
  autoSave: "never", // 自动保存
  globalTheme: "light", // 主题
  contentTheme: "auto", // 内容主题
  codeTheme: "auto", // 代码主题
  lineNumber: true, // 是否显示行号
  customThemeColor: "#ffffff", // 自定义主题颜色
  themeConfigs: [], // 主题配置列表 [{ id, name, type, themeColor, isDefault }]
  selectedThemeId: null, // 当前选中的主题ID
  llmEnabled: false, // 是否启用 LLM
  selectedLlm: "", // 选择的大模型类型
  enableKnowledgeBase: true, // 是否启用知识库
  knowledgeBaseScoreThreshold:0.5,//RAG置信度阈值
  embeddingMode: "api", // Embedding 模式：'local' 或 'api'，默认使用外部 API
  autoCompletion: true, // 是否启用AI自动补全
  autoCompletionMode: "full", // 完全生成后再补全
  autoCompletionMaxTokens: 50, // 自动补全最大token数（最小20，0表示无限制）
  //exportImageMode: "none", // 导出图片选项
  autoRemoveThinkTag: true,//自动去除推理过程
  bypassCodeBlock: true, // 统计文字信息时排除代码块
  autoSaveExternalImage: true, // 自动保存外部图片
  parseEmbeddedImages: true, // 是否解析文档内嵌图片进行OCR
  loggingEnabled: true, // 是否写入日志
  loggingLevel: 'info', // 日志等级
  loggingFilter: '', // 日志过滤条件（按scope过滤）
  logRetentionPeriod: '3days', // 日志保留期限：none, 1day, 3days, 7days, 1month, 3months, 6months, 1year, never
  ollama: {
    apiUrl: "http://localhost:11434/api", // Ollama 默认 API URL
    selectedModel: "",
    enableMaxTokens: false, // 是否启用 max_tokens 限制
    maxTokens: 4096, // max_tokens 最大值
  },
  openai: {
    apiUrl: "https://api.openai.com/v1", // BaseURL
    apiKey: "",//API Key
    selectedModel: "",//模型名称
    completionSuffix: "", // 补全模式url后缀
    chatSuffix: "", // 聊天模式url后缀
    enableMaxTokens: false, // 是否启用 max_tokens 限制
    maxTokens: 4096, // max_tokens 最大值
  },
  "openai-official": {
    apiKey: "", // 只需要 API Key，base_url 固定为 https://api.openai.com/v1
    selectedModel: "", // 模型名称
    enableMaxTokens: false, // 是否启用 max_tokens 限制
    maxTokens: 4096, // max_tokens 最大值
  },
  deepseek: {
    apiKey: "", // 只需要 API Key，base_url 固定为 https://api.deepseek.com
    selectedModel: "", // 模型名称，默认为 deepseek-chat
    enableMaxTokens: false, // 是否启用 max_tokens 限制
    maxTokens: 4096, // max_tokens 最大值
  },
  gemini: {
    apiKey: "", // 只需要 API Key，base_url 固定为 https://generativelanguage.googleapis.com/v1beta
    selectedModel: "", // 模型名称
    enableMaxTokens: false, // 是否启用 max_tokens 限制
    maxTokens: 4096, // max_tokens 最大值
  },
  metadoc: {
    selectedModel: "",//模型名称
    enableMaxTokens: false, // 是否启用 max_tokens 限制
    maxTokens: 4096, // max_tokens 最大值
  },
  alwaysAskSave: true, // 是否总是询问保存,
  particleEffect: true, // 是否启用粒子效果
  outlineLayoutDirection: 'vertical', // 大纲树布局方向：'vertical' 或 'horizontal'
  llmTemperature: 1.3, // LLM 全局温度配置
  vditorMode: 'ir', // Vditor编辑模式：'wysiwyg'、'ir'、'sv'，默认'ir'
});

// 关键设置列表：需要在窗口显示前加载的设置（影响UI渲染）
const CRITICAL_SETTINGS = [
  'globalTheme',
  'customThemeColor',
  'themeConfigs',
  'selectedThemeId',
  'contentTheme',
  'codeTheme',
  'lineNumber'
];

// 加载单个设置的辅助函数
async function loadSetting(key) {
    if (settings[key] && typeof settings[key] === 'object' && !Array.isArray(settings[key])) {
      return; // 如果是对象，则不处理
    }
  try {
    const value = await ipcRenderer.invoke('get-setting', { key: key });
      if (value === undefined) {
        //如果没有设置，则使用默认值
        // 对于 themeConfigs，确保是可序列化的
        if (key === 'themeConfigs' && Array.isArray(settings[key])) {
          const serializable = settings[key].map((item) => ({
            id: item.id,
            name: item.name,
            type: item.type,
            themeColor: item.themeColor,
            isDefault: item.isDefault
          }));
        await setSetting(key, serializable);
        } else {
        await setSetting(key, settings[key]);
        }
      } else {
        //如果有设置，则更新settings
        settings[key] = value;
      }
  } catch (error) {
    console.error(`Error initializing setting "${key}":`, error);
  }
}

// 初始化关键设置（需要在窗口显示前完成）
export async function initCriticalSettings() {
  const promises = CRITICAL_SETTINGS.map(key => loadSetting(key));
  await Promise.all(promises);
}

// 初始化非关键设置（可以异步加载，不影响窗口显示）
export async function initNonCriticalSettings() {
  const allKeys = Object.keys(settings);
  const nonCriticalKeys = allKeys.filter(key => !CRITICAL_SETTINGS.includes(key));
  
  // 异步加载，不阻塞
  nonCriticalKeys.forEach(key => {
    loadSetting(key).catch(error => {
      console.error(`Error loading non-critical setting "${key}":`, error);
    });
  });
}

// 初始化所有设置（兼容旧代码，但建议使用分批加载）
export async function initSettings() {
  // 先加载关键设置
  await initCriticalSettings();
  // 然后异步加载非关键设置
  initNonCriticalSettings();
}

/**
 * 获取全局LLM温度配置
 * @returns {Promise<number>} 温度值，默认为1.3
 */
export async function getLlmTemperature() {
  const temperature = await getSetting("llmTemperature");
  return temperature !== undefined ? temperature : 1.3;
}