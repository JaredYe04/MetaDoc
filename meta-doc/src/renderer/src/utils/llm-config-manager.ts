/**
 * LLM配置管理器
 * 支持多配置列表管理和切换
 */

import { ref, reactive } from 'vue';
import { getSetting, setSetting } from './settings.js';
import { createRendererLogger } from './logger.ts';

// 懒加载logger，避免初始化顺序问题
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null;

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('LLMConfigManager');
  }
  return loggerInstance;
}

export interface LlmConfigItem {
  id: string;
  name: string;
  type: 'metadoc' | 'ollama' | 'openai' | 'openai-official' | 'deepseek' | 'gemini' | 'manual';
  isTemporary?: boolean; // 是否为临时配置（未保存）
  originalConfigId?: string; // 如果是临时配置，记录原始配置ID
  // Ollama配置
  ollama?: {
    apiUrl: string;
    selectedModel: string;
  };
  // OpenAI配置
  openai?: {
    apiUrl: string;
    apiKey: string;
    selectedModel: string;
    completionSuffix: string;
    chatSuffix: string;
  };
  // OpenAI官方配置
  'openai-official'?: {
    apiKey: string;
    selectedModel: string;
  };
  // DeepSeek配置
  deepseek?: {
    apiKey: string;
    selectedModel: string;
  };
  // Gemini配置
  gemini?: {
    apiKey: string;
    selectedModel: string;
  };
  // MetaDoc配置
  metadoc?: {
    selectedModel: string;
  };
  // 手动配置（不需要额外字段）
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'llm-configs';
const CURRENT_CONFIG_KEY = 'current-llm-config-id';

const configs = ref<LlmConfigItem[]>([]);
const currentConfigId = ref<string>('');

/**
 * 加载配置列表
 */
export async function loadLlmConfigs(): Promise<void> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      configs.value = JSON.parse(stored);
    } else {
      // 如果没有保存的配置，创建一个默认配置（从当前设置加载）
      const defaultConfig = await createDefaultConfigFromSettings();
      configs.value = [defaultConfig];
      saveLlmConfigs();
    }
    
    // 加载当前选中的配置ID
    const currentId = localStorage.getItem(CURRENT_CONFIG_KEY);
    if (currentId && configs.value.find(c => c.id === currentId)) {
      currentConfigId.value = currentId;
    } else if (configs.value.length > 0) {
      currentConfigId.value = configs.value[0].id;
      localStorage.setItem(CURRENT_CONFIG_KEY, currentConfigId.value);
    }
  } catch (error) {
    // 使用 try-catch 保护，确保即使 logger 未初始化也不会崩溃
    try {
      getLogger().error('加载LLM配置失败:', error);
    } catch (loggerError) {
      console.error('加载LLM配置失败:', error);
      console.error('Logger初始化错误:', loggerError);
    }
    configs.value = [];
  }
}

/**
 * 保存配置列表
 */
function saveLlmConfigs(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs.value));
  } catch (error) {
    getLogger().error('保存LLM配置失败:', error);
  }
}

/**
 * 从当前设置创建默认配置
 */
async function createDefaultConfigFromSettings(): Promise<LlmConfigItem> {
  const selectedLlm = await getSetting('selectedLlm') || 'ollama';
  const id = `config-${Date.now()}`;
  const name = '默认配置';
  
  const config: LlmConfigItem = {
    id,
    name,
    type: selectedLlm as any,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  if (selectedLlm === 'ollama') {
    config.ollama = {
      apiUrl: await getSetting('ollamaApiUrl') || 'http://localhost:11434/api',
      selectedModel: await getSetting('ollamaSelectedModel') || ''
    };
  } else if (selectedLlm === 'openai') {
    config.openai = {
      apiUrl: await getSetting('openaiApiUrl') || 'https://api.openai.com/v1',
      apiKey: await getSetting('openaiApiKey') || '',
      selectedModel: await getSetting('openaiSelectedModel') || '',
      completionSuffix: await getSetting('openaiCompletionSuffix') || '',
      chatSuffix: await getSetting('openaiChatSuffix') || ''
    };
  } else if (selectedLlm === 'openai-official') {
    config['openai-official'] = {
      apiKey: await getSetting('openaiOfficialApiKey') || '',
      selectedModel: await getSetting('openaiOfficialSelectedModel') || ''
    };
  } else if (selectedLlm === 'deepseek') {
    config.deepseek = {
      apiKey: await getSetting('deepseekApiKey') || '',
      selectedModel: await getSetting('deepseekSelectedModel') || 'deepseek-chat'
    };
  } else if (selectedLlm === 'gemini') {
    config.gemini = {
      apiKey: await getSetting('geminiApiKey') || '',
      selectedModel: await getSetting('geminiSelectedModel') || 'gemini-2.5-flash'
    };
  } else if (selectedLlm === 'metadoc') {
    config.metadoc = {
      selectedModel: await getSetting('metadocSelectedModel') || ''
    };
  } else if (selectedLlm === 'manual') {
    // 手动类型不需要额外配置
  }
  
  return config;
}

/**
 * 获取所有配置
 */
export function getAllConfigs(): LlmConfigItem[] {
  return configs.value;
}

/**
 * 获取当前配置
 */
export function getCurrentConfig(): LlmConfigItem | null {
  return configs.value.find(c => c.id === currentConfigId.value) || null;
}

/**
 * 添加新配置
 */
export function addConfig(config: Omit<LlmConfigItem, 'id' | 'createdAt' | 'updatedAt'>): LlmConfigItem {
  const newConfig: LlmConfigItem = {
    ...config,
    id: `config-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  configs.value.push(newConfig);
  saveLlmConfigs();
  return newConfig;
}

/**
 * 更新配置
 */
export async function updateConfig(id: string, updates: Partial<Omit<LlmConfigItem, 'id' | 'createdAt'>>): Promise<boolean> {
  const index = configs.value.findIndex(c => c.id === id);
  if (index === -1) return false;
  
  configs.value[index] = {
    ...configs.value[index],
    ...updates,
    updatedAt: Date.now()
  };
  saveLlmConfigs();
  
  // 如果更新的是当前配置，需要重新应用设置并广播
  if (currentConfigId.value === id) {
    await applyConfigToSettings(configs.value[index]);
  }
  
  return true;
}

/**
 * 删除配置
 */
export async function deleteConfig(id: string): Promise<boolean> {
  const index = configs.value.findIndex(c => c.id === id);
  if (index === -1) return false;
  
  const wasCurrentConfig = currentConfigId.value === id;
  
  configs.value.splice(index, 1);
  saveLlmConfigs();
  
  // 如果删除的是当前配置，切换到第一个配置
  if (wasCurrentConfig) {
    if (configs.value.length > 0) {
      await switchConfig(configs.value[0].id);
    } else {
      currentConfigId.value = '';
      localStorage.removeItem(CURRENT_CONFIG_KEY);
    }
  }
  
  return true;
}

/**
 * 切换配置
 */
export async function switchConfig(id: string): Promise<boolean> {
  const config = configs.value.find(c => c.id === id);
  if (!config) return false;
  
  currentConfigId.value = id;
  localStorage.setItem(CURRENT_CONFIG_KEY, id);
  
  // 应用配置到设置
  await applyConfigToSettings(config);
  
  return true;
}

/**
 * 应用配置到设置（不广播，用于接收广播后的同步）
 */
async function applyConfigToSettingsWithoutBroadcast(config: LlmConfigItem): Promise<void> {
  await setSetting('selectedLlm', config.type);
  
  if (config.type === 'ollama' && config.ollama) {
    await setSetting('ollamaApiUrl', config.ollama.apiUrl);
    await setSetting('ollamaSelectedModel', config.ollama.selectedModel);
  } else if (config.type === 'openai' && config.openai) {
    await setSetting('openaiApiUrl', config.openai.apiUrl);
    await setSetting('openaiApiKey', config.openai.apiKey);
    await setSetting('openaiSelectedModel', config.openai.selectedModel);
    await setSetting('openaiCompletionSuffix', config.openai.completionSuffix);
    await setSetting('openaiChatSuffix', config.openai.chatSuffix);
  } else if (config.type === 'openai-official' && config['openai-official']) {
    await setSetting('openaiOfficialApiKey', config['openai-official'].apiKey);
    await setSetting('openaiOfficialSelectedModel', config['openai-official'].selectedModel);
  } else if (config.type === 'deepseek' && config.deepseek) {
    await setSetting('deepseekApiKey', config.deepseek.apiKey);
    await setSetting('deepseekSelectedModel', config.deepseek.selectedModel);
  } else if (config.type === 'gemini' && config.gemini) {
    await setSetting('geminiApiKey', config.gemini.apiKey);
    await setSetting('geminiSelectedModel', config.gemini.selectedModel);
  } else if (config.type === 'metadoc' && config.metadoc) {
    await setSetting('metadocSelectedModel', config.metadoc.selectedModel);
  }
  
  // 只触发本窗口的配置更新事件，不广播（避免循环广播）
  const { default: eventBus } = await import('./event-bus.js');
  eventBus.emit('llm-api-updated');
}

/**
 * 应用配置到设置
 */
async function applyConfigToSettings(config: LlmConfigItem): Promise<void> {
  await applyConfigToSettingsWithoutBroadcast(config);
  
  // 广播配置更新事件到所有窗口，让其他窗口知道配置已更新
  // 其他窗口在下次调用 createAdapterFromSettings 时会从主进程读取最新设置
  // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
  const eventBus = (await import('./event-bus.js')).default;
  eventBus.emit('llm-config-updated', {
    configId: config.id,
    configType: config.type
  });
}

/**
 * 从当前设置创建配置
 */
export async function createConfigFromCurrentSettings(name: string): Promise<LlmConfigItem> {
  const config = await createDefaultConfigFromSettings();
  config.name = name;
  return addConfig(config);
}

/**
 * 创建默认的临时配置
 */
export async function createDefaultTemporaryConfig(): Promise<LlmConfigItem> {
  const config = await createDefaultConfigFromSettings();
  config.name = '新配置';
  config.isTemporary = true;
  
  const tempConfig: LlmConfigItem = {
    ...config,
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  configs.value.push(tempConfig);
  saveLlmConfigs();
  return tempConfig;
}


/**
 * 从当前设置更新临时配置内容
 */
async function updateTemporaryConfigFromSettings(config: LlmConfigItem): Promise<void> {
  const selectedLlm = await getSetting('selectedLlm') || 'ollama';
  config.type = selectedLlm as any;
  
  if (selectedLlm === 'ollama') {
    config.ollama = {
      apiUrl: await getSetting('ollamaApiUrl') || 'http://localhost:11434/api',
      selectedModel: await getSetting('ollamaSelectedModel') || ''
    };
  } else if (selectedLlm === 'openai') {
    config.openai = {
      apiUrl: await getSetting('openaiApiUrl') || 'https://api.openai.com/v1',
      apiKey: await getSetting('openaiApiKey') || '',
      selectedModel: await getSetting('openaiSelectedModel') || '',
      completionSuffix: await getSetting('openaiCompletionSuffix') || '',
      chatSuffix: await getSetting('openaiChatSuffix') || ''
    };
  } else if (selectedLlm === 'openai-official') {
    config['openai-official'] = {
      apiKey: await getSetting('openaiOfficialApiKey') || '',
      selectedModel: await getSetting('openaiOfficialSelectedModel') || ''
    };
  } else if (selectedLlm === 'deepseek') {
    config.deepseek = {
      apiKey: await getSetting('deepseekApiKey') || '',
      selectedModel: await getSetting('deepseekSelectedModel') || 'deepseek-chat'
    };
  } else if (selectedLlm === 'metadoc') {
    config.metadoc = {
      selectedModel: await getSetting('metadocSelectedModel') || ''
    };
  }
}

/**
 * 创建临时配置（从已保存配置修改时）- 异步版本
 * @param originalConfig 原始配置
 * @param modifiedSuffix 修改后缀（支持i18n），默认为 "(已修改)"
 */
export async function createTemporaryConfigAsync(
  originalConfig: LlmConfigItem,
  modifiedSuffix: string = '(已修改)'
): Promise<LlmConfigItem> {
  // 检查是否已经存在该配置的临时版本
  const existingTemp = configs.value.find(
    c => c.isTemporary && c.originalConfigId === originalConfig.id
  );
  
  if (existingTemp) {
    // 如果已存在，更新它
    existingTemp.updatedAt = Date.now();
    // 从当前设置更新配置内容
    await updateTemporaryConfigFromSettings(existingTemp);
    saveLlmConfigs();
    return existingTemp;
  }
  
  // 创建新的临时配置
  const tempConfig: LlmConfigItem = {
    ...JSON.parse(JSON.stringify(originalConfig)), // 深拷贝
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: `${originalConfig.name} ${modifiedSuffix}`,
    isTemporary: true,
    originalConfigId: originalConfig.id,
    updatedAt: Date.now()
  };
  
  // 从当前设置更新配置内容
  await updateTemporaryConfigFromSettings(tempConfig);
  
  configs.value.push(tempConfig);
  saveLlmConfigs();
  return tempConfig;
}

/**
 * 检查当前配置是否被修改（与已保存配置不同）
 */
export async function isCurrentConfigModified(configId: string): Promise<boolean> {
  const config = configs.value.find(c => c.id === configId);
  if (!config || config.isTemporary) return false; // 临时配置不算修改
  
  const currentSettings = await createDefaultConfigFromSettings();
  
  // 比较配置内容
  if (config.type !== currentSettings.type) return true;
  
  if (config.type === 'ollama' && config.ollama) {
    if (config.ollama.apiUrl !== currentSettings.ollama?.apiUrl ||
        config.ollama.selectedModel !== currentSettings.ollama?.selectedModel) {
      return true;
    }
  } else if (config.type === 'openai' && config.openai) {
    if (config.openai.apiUrl !== currentSettings.openai?.apiUrl ||
        config.openai.apiKey !== currentSettings.openai?.apiKey ||
        config.openai.selectedModel !== currentSettings.openai?.selectedModel ||
        config.openai.completionSuffix !== currentSettings.openai?.completionSuffix ||
        config.openai.chatSuffix !== currentSettings.openai?.chatSuffix) {
      return true;
    }
  } else if (config.type === 'openai-official' && config['openai-official']) {
    if (config['openai-official'].apiKey !== currentSettings['openai-official']?.apiKey ||
        config['openai-official'].selectedModel !== currentSettings['openai-official']?.selectedModel) {
      return true;
    }
  } else if (config.type === 'deepseek' && config.deepseek) {
    if (config.deepseek.apiKey !== currentSettings.deepseek?.apiKey ||
        config.deepseek.selectedModel !== currentSettings.deepseek?.selectedModel) {
      return true;
    }
  } else if (config.type === 'gemini' && config.gemini) {
    if (config.gemini.apiKey !== currentSettings.gemini?.apiKey ||
        config.gemini.selectedModel !== currentSettings.gemini?.selectedModel) {
      return true;
    }
  } else if (config.type === 'metadoc' && config.metadoc) {
    if (config.metadoc.selectedModel !== currentSettings.metadoc?.selectedModel) {
      return true;
    }
  }
  
  return false;
}

// 初始化时加载配置
// 监听广播：当其他窗口切换配置时，重新加载配置列表
// 注意：配置列表存储在 localStorage 中，所有窗口共享
// 但当前配置ID也存储在 localStorage 中，所以切换配置时其他窗口会自动感知
async function initLlmConfigBroadcast() {
  try {
    const { default: eventBus } = await import('./event-bus.js');
    
    eventBus.on('llm-config-updated', async (data: any) => {
      // 使用 try-catch 保护 logger 调用
      try {
        getLogger().debug('收到LLM配置更新广播', data);
      } catch (loggerError) {
        console.debug('收到LLM配置更新广播', data);
        console.warn('Logger初始化错误:', loggerError);
      }
      
      // 重新加载配置列表（因为可能在其他窗口被修改）
      loadLlmConfigs();
      
      // 如果当前配置ID与广播的配置ID一致，或者当前没有配置，重新应用配置
      if (data?.configId && (currentConfigId.value === data.configId || !currentConfigId.value)) {
        const config = configs.value.find(c => c.id === data.configId);
        if (config) {
          // 重新应用配置到设置（确保设置是最新的）
          // 注意：这里不会再次广播，避免循环广播
          await applyConfigToSettingsWithoutBroadcast(config);
        }
      } else if (data?.configId) {
        // 如果广播的配置ID与当前配置ID不一致，说明其他窗口切换了配置
        // 检查当前配置ID是否还存在，如果不存在则切换到第一个配置
        const currentConfig = configs.value.find(c => c.id === currentConfigId.value);
        if (!currentConfig && configs.value.length > 0) {
          // 当前配置不存在，切换到第一个配置
          await switchConfig(configs.value[0].id);
        }
      }
    });
  } catch (error) {
    // 如果初始化失败，使用 console.error 而不是 logger（因为 logger 可能未初始化）
    console.error('初始化LLM配置广播监听失败:', error);
    throw error;
  }
}

// 初始化时注册广播监听（延迟执行，确保logger已初始化）
// 使用多层延迟确保 logger 模块完全初始化
// 首先使用 setTimeout，然后使用 requestAnimationFrame（如果可用）或再次 setTimeout
const initWithDelay = () => {
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => {
      setTimeout(() => {
        initLlmConfigBroadcast().catch(err => {
          // 使用 try-catch 包装，确保即使 logger 未初始化也不会崩溃
          try {
            getLogger().error('初始化LLM配置广播监听失败', err);
          } catch (loggerError) {
            console.error('初始化LLM配置广播监听失败:', err);
            console.error('Logger初始化错误:', loggerError);
          }
        });
      }, 10);
    });
  } else {
    setTimeout(() => {
      setTimeout(() => {
        initLlmConfigBroadcast().catch(err => {
          try {
            getLogger().error('初始化LLM配置广播监听失败', err);
          } catch (loggerError) {
            console.error('初始化LLM配置广播监听失败:', err);
            console.error('Logger初始化错误:', loggerError);
          }
        });
      }, 10);
    }, 0);
  }
};

initWithDelay();

// 延迟加载配置，确保logger已初始化
const loadWithDelay = () => {
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => {
      setTimeout(() => {
        loadLlmConfigs();
      }, 10);
    });
  } else {
    setTimeout(() => {
      setTimeout(() => {
        loadLlmConfigs();
      }, 10);
    }, 0);
  }
};

loadWithDelay();

