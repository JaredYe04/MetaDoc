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
  },
  openai: {
    apiUrl: "https://api.openai.com/v1", // BaseURL
    apiKey: "",//API Key
    selectedModel: "",//模型名称
    completionSuffix: "", // 补全模式url后缀
    chatSuffix: "", // 聊天模式url后缀
  },
  "openai-official": {
    apiKey: "", // 只需要 API Key，base_url 固定为 https://api.openai.com/v1
    selectedModel: "", // 模型名称
  },
  deepseek: {
    apiKey: "", // 只需要 API Key，base_url 固定为 https://api.deepseek.com
    selectedModel: "", // 模型名称，默认为 deepseek-chat
  },
  gemini: {
    apiKey: "", // 只需要 API Key，base_url 固定为 https://generativelanguage.googleapis.com/v1beta
    selectedModel: "", // 模型名称
  },
  metadoc: {
    selectedModel: "",//模型名称
  },
  alwaysAskSave: true, // 是否总是询问保存,
  particleEffect: true, // 是否启用粒子效果
  outlineLayoutDirection: 'vertical', // 大纲树布局方向：'vertical' 或 'horizontal'
  llmTemperature: 1.3, // LLM 全局温度配置
});

export async function initSettings() {
  //如果本地的设置不存在，则初始化默认设置
  //从settings中获取所有的键
  const keys = Object.keys(settings);
  keys.forEach(key => {
    if (settings[key] && typeof settings[key] === 'object' && !Array.isArray(settings[key])) {
      return; // 如果是对象，则不处理
    }
    ipcRenderer.invoke('get-setting', { key: key }).then(value => {
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
          setSetting(key, serializable);
        } else {
          setSetting(key, settings[key]);
        }
      } else {
        //如果有设置，则更新settings
        settings[key] = value;
      }
    });
  });

}

/**
 * 获取全局LLM温度配置
 * @returns {Promise<number>} 温度值，默认为1.3
 */
export async function getLlmTemperature() {
  const temperature = await getSetting("llmTemperature");
  return temperature !== undefined ? temperature : 1.3;
}