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
  theme: "light", // 主题
  customThemeColor: "#ffffff", // 自定义主题颜色
  llmEnabled: false, // 是否启用 LLM
  selectedLlm: "", // 选择的大模型类型
  //exportImageMode: "none", // 导出图片选项
  autoRemoveThinkTag: true,//自动去除推理过程
  bypassCodeBlock: true, // 统计文字信息时排除代码块
  autoSaveExternalImage: true, // 自动保存外部图片
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
  metadoc: {
    selectedModel: "",//模型名称
  },
  alwaysAskSave: true, // 是否总是询问保存,
  particleEffect: true, // 是否启用粒子效果
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
        setSetting(key, settings[key]);
      } else {
        //如果有设置，则更新settings
        settings[key] = value;
      }
    });
  });

}