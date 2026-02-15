/**
 * LLM配置管理器
 * 支持多配置列表管理和切换
 */

import { ref, reactive } from 'vue'
import { getSetting, setSetting } from './settings.js'
import { createRendererLogger } from './logger.ts'

// 懒加载logger，避免初始化顺序问题
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('LLMConfigManager')
  }
  return loggerInstance
}

export interface LlmConfigItem {
  id: string
  name: string
  isDefault?: boolean // 是否为默认配置（用于 i18n 显示）
  type: 'metadoc' | 'ollama' | 'openai' | 'openai-official' | 'deepseek' | 'gemini' | 'manual'
  // Ollama配置
  ollama?: {
    apiUrl: string
    selectedModel: string
    enableMaxTokens?: boolean
    maxTokens?: number
  }
  // OpenAI配置
  openai?: {
    apiUrl: string
    apiKey: string
    selectedModel: string
    completionSuffix: string
    chatSuffix: string
    enableMaxTokens?: boolean
    maxTokens?: number
  }
  // OpenAI官方配置
  'openai-official'?: {
    apiKey: string
    selectedModel: string
    enableMaxTokens?: boolean
    maxTokens?: number
  }
  // DeepSeek配置
  deepseek?: {
    apiKey: string
    selectedModel: string
    enableMaxTokens?: boolean
    maxTokens?: number
  }
  // Gemini配置
  gemini?: {
    apiKey: string
    selectedModel: string
    enableMaxTokens?: boolean
    maxTokens?: number
  }
  // MetaDoc配置
  metadoc?: {
    selectedModel: string
    enableMaxTokens?: boolean
    maxTokens?: number
  }
  // 手动配置（不需要额外字段）
  createdAt: number
  updatedAt: number
}

/**
 * 工作区状态：当前正在编辑的配置（可能已修改）
 */
interface WorkspaceState {
  snapshot: LlmConfigItem | null // 快照：已保存的配置
  hasUnsavedChanges: boolean // 是否有未保存的修改
}

const STORAGE_KEY = 'llm-configs'
const CURRENT_CONFIG_KEY = 'current-llm-config-id'

const configs = ref<LlmConfigItem[]>([])
const currentConfigId = ref<string>('')
const workspaceState = reactive<WorkspaceState>({
  snapshot: null,
  hasUnsavedChanges: false
})

/**
 * 创建所有默认配置（不包含 manual，manual 仅开发模式可用）
 */
function createDefaultConfigs(): LlmConfigItem[] {
  const now = Date.now()
  const baseId = `config-${now}`

  return [
    {
      id: `${baseId}-ollama`,
      name: 'Ollama (默认)', // 默认名称，UI 会根据 isDefault 和 type 进行 i18n 翻译
      isDefault: true,
      type: 'ollama',
      ollama: {
        apiUrl: 'http://localhost:11434/api',
        selectedModel: '',
        enableMaxTokens: false,
        maxTokens: 4096
      },
      createdAt: now,
      updatedAt: now
    },
    {
      id: `${baseId}-openai`,
      name: 'OpenAI兼容 (默认)',
      isDefault: true,
      type: 'openai',
      openai: {
        apiUrl: 'https://api.openai.com/v1',
        apiKey: '',
        selectedModel: '',
        completionSuffix: '',
        chatSuffix: '',
        enableMaxTokens: false,
        maxTokens: 4096
      },
      createdAt: now,
      updatedAt: now
    },
    {
      id: `${baseId}-openai-official`,
      name: 'OpenAI官方 (默认)',
      isDefault: true,
      type: 'openai-official',
      'openai-official': {
        apiKey: '',
        selectedModel: '',
        enableMaxTokens: false,
        maxTokens: 4096
      },
      createdAt: now,
      updatedAt: now
    },
    {
      id: `${baseId}-deepseek`,
      name: 'DeepSeek (默认)',
      isDefault: true,
      type: 'deepseek',
      deepseek: {
        apiKey: '',
        selectedModel: 'deepseek-chat',
        enableMaxTokens: false,
        maxTokens: 4096
      },
      createdAt: now,
      updatedAt: now
    },
    {
      id: `${baseId}-gemini`,
      name: 'Google Gemini (默认)',
      isDefault: true,
      type: 'gemini',
      gemini: {
        apiKey: '',
        selectedModel: 'gemini-2.0-flash', // 默认使用稳定的模型
        enableMaxTokens: false,
        maxTokens: 4096
      },
      createdAt: now,
      updatedAt: now
    }
  ]
}

/**
 * 检查并补充缺失的默认配置
 */
function ensureDefaultConfigs(): void {
  const defaultTypes: Array<'ollama' | 'openai' | 'openai-official' | 'deepseek' | 'gemini'> = [
    'ollama',
    'openai',
    'openai-official',
    'deepseek',
    'gemini'
  ]
  const existingTypes = new Set(configs.value.filter((c) => c.isDefault).map((c) => c.type))

  // 检查是否有缺失的默认配置
  const missingTypes = defaultTypes.filter((type) => !existingTypes.has(type))

  if (missingTypes.length > 0) {
    const defaultConfigs = createDefaultConfigs()
    // 只添加缺失的默认配置
    const missingConfigs = defaultConfigs.filter((c) => missingTypes.includes(c.type as any))
    configs.value.push(...missingConfigs)
    saveLlmConfigs()
  }
}

/**
 * 加载配置列表
 */
export async function loadLlmConfigs(): Promise<void> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // 清理旧的临时配置（迁移到工作区模式）
      configs.value = parsed.filter((c: any) => !(c as any).isTemporary)
      // 如果有临时配置被清理，保存配置列表
      if (parsed.length !== configs.value.length) {
        saveLlmConfigs()
      }
      // 确保所有默认配置都存在
      ensureDefaultConfigs()
    } else {
      // 如果没有保存的配置，创建所有默认配置
      configs.value = createDefaultConfigs()
      saveLlmConfigs()
    }

    // 加载当前选中的配置ID（排除临时配置）
    const currentId = localStorage.getItem(CURRENT_CONFIG_KEY)
    if (currentId) {
      const config = configs.value.find((c) => c.id === currentId)
      if (config) {
        currentConfigId.value = currentId
        // 初始化工作区快照
        workspaceState.snapshot = JSON.parse(JSON.stringify(config))
        workspaceState.hasUnsavedChanges = false
      } else {
        // 如果当前配置不存在（可能是临时配置），切换到第一个配置
        if (configs.value.length > 0) {
          currentConfigId.value = configs.value[0].id
          localStorage.setItem(CURRENT_CONFIG_KEY, currentConfigId.value)
          workspaceState.snapshot = JSON.parse(JSON.stringify(configs.value[0]))
          workspaceState.hasUnsavedChanges = false
        }
      }
    } else if (configs.value.length > 0) {
      currentConfigId.value = configs.value[0].id
      localStorage.setItem(CURRENT_CONFIG_KEY, currentConfigId.value)
      workspaceState.snapshot = JSON.parse(JSON.stringify(configs.value[0]))
      workspaceState.hasUnsavedChanges = false
    }
  } catch (error) {
    // 使用 try-catch 保护，确保即使 logger 未初始化也不会崩溃
    try {
      getLogger().error('加载LLM配置失败:', error)
    } catch (loggerError) {
      console.error('加载LLM配置失败:', error)
      console.error('Logger初始化错误:', loggerError)
    }
    configs.value = []
  }
}

/**
 * 保存配置列表
 */
function saveLlmConfigs(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs.value))
  } catch (error) {
    getLogger().error('保存LLM配置失败:', error)
  }
}

/**
 * 更新配置顺序
 */
export function updateConfigOrder(configIds: string[]): void {
  // 验证所有配置ID都存在
  const validIds = configIds.filter((id) => configs.value.some((c) => c.id === id))
  if (validIds.length !== configs.value.length) {
    getLogger().warn('更新配置顺序失败：配置ID不匹配')
    return
  }

  // 按照新顺序重新排列配置
  const configMap = new Map(configs.value.map((c) => [c.id, c]))
  configs.value = validIds.map((id) => configMap.get(id)!).filter(Boolean)
  saveLlmConfigs()
}

/**
 * 从当前设置创建配置对象（不包含id、name、时间戳）
 */
async function createConfigFromSettings(): Promise<
  Omit<LlmConfigItem, 'id' | 'name' | 'createdAt' | 'updatedAt'>
> {
  const selectedLlm = (await getSetting('selectedLlm')) || 'ollama'

  const config: Omit<LlmConfigItem, 'id' | 'name' | 'createdAt' | 'updatedAt'> = {
    type: selectedLlm as any
  }

  if (selectedLlm === 'ollama') {
    config.ollama = {
      apiUrl: (await getSetting('ollamaApiUrl')) || 'http://localhost:11434/api',
      selectedModel: (await getSetting('ollamaSelectedModel')) || '',
      enableMaxTokens: (await getSetting('ollamaEnableMaxTokens')) ?? false,
      maxTokens: (await getSetting('ollamaMaxTokens')) || 4096
    }
  } else if (selectedLlm === 'openai') {
    config.openai = {
      apiUrl: (await getSetting('openaiApiUrl')) || 'https://api.openai.com/v1',
      apiKey: (await getSetting('openaiApiKey')) || '',
      selectedModel: (await getSetting('openaiSelectedModel')) || '',
      completionSuffix: (await getSetting('openaiCompletionSuffix')) || '',
      chatSuffix: (await getSetting('openaiChatSuffix')) || '',
      enableMaxTokens: (await getSetting('openaiEnableMaxTokens')) ?? false,
      maxTokens: (await getSetting('openaiMaxTokens')) || 4096
    }
  } else if (selectedLlm === 'openai-official') {
    config['openai-official'] = {
      apiKey: (await getSetting('openaiOfficialApiKey')) || '',
      selectedModel: (await getSetting('openaiOfficialSelectedModel')) || '',
      enableMaxTokens: (await getSetting('openaiOfficialEnableMaxTokens')) ?? false,
      maxTokens: (await getSetting('openaiOfficialMaxTokens')) || 4096
    }
  } else if (selectedLlm === 'deepseek') {
    config.deepseek = {
      apiKey: (await getSetting('deepseekApiKey')) || '',
      selectedModel: (await getSetting('deepseekSelectedModel')) || 'deepseek-chat',
      enableMaxTokens: (await getSetting('deepseekEnableMaxTokens')) ?? false,
      maxTokens: (await getSetting('deepseekMaxTokens')) || 4096
    }
  } else if (selectedLlm === 'gemini') {
    config.gemini = {
      apiKey: (await getSetting('geminiApiKey')) || '',
      selectedModel: (await getSetting('geminiSelectedModel')) || 'gemini-2.5-flash',
      enableMaxTokens: (await getSetting('geminiEnableMaxTokens')) ?? false,
      maxTokens: (await getSetting('geminiMaxTokens')) || 4096
    }
  } else if (selectedLlm === 'metadoc') {
    config.metadoc = {
      selectedModel: (await getSetting('metadocSelectedModel')) || '',
      enableMaxTokens: (await getSetting('metadocEnableMaxTokens')) ?? false,
      maxTokens: (await getSetting('metadocMaxTokens')) || 4096
    }
  } else if (selectedLlm === 'manual') {
    // 手动类型不需要额外配置
  }

  return config
}

/**
 * 从当前设置创建默认配置
 */
async function createDefaultConfigFromSettings(): Promise<LlmConfigItem> {
  const configData = await createConfigFromSettings()
  return {
    ...configData,
    id: `config-${Date.now()}`,
    name: '默认配置',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

/**
 * 获取所有配置
 */
export function getAllConfigs(): LlmConfigItem[] {
  return configs.value
}

/**
 * 获取当前配置
 */
export function getCurrentConfig(): LlmConfigItem | null {
  return configs.value.find((c) => c.id === currentConfigId.value) || null
}

/**
 * 添加新配置
 */
export function addConfig(
  config: Omit<LlmConfigItem, 'id' | 'createdAt' | 'updatedAt'>
): LlmConfigItem {
  const newConfig: LlmConfigItem = {
    ...config,
    id: `config-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  configs.value.push(newConfig)
  saveLlmConfigs()
  return newConfig
}

/**
 * 更新配置
 */
export async function updateConfig(
  id: string,
  updates: Partial<Omit<LlmConfigItem, 'id' | 'createdAt'>>
): Promise<boolean> {
  const index = configs.value.findIndex((c) => c.id === id)
  if (index === -1) return false

  configs.value[index] = {
    ...configs.value[index],
    ...updates,
    updatedAt: Date.now()
  }
  saveLlmConfigs()

  // 如果更新的是当前配置，需要重新应用设置并广播
  if (currentConfigId.value === id) {
    await applyConfigToSettings(configs.value[index])
  }

  return true
}

/**
 * 删除配置
 */
export async function deleteConfig(id: string): Promise<boolean> {
  const index = configs.value.findIndex((c) => c.id === id)
  if (index === -1) return false

  const config = configs.value[index]
  // 禁止删除默认配置
  if (config.isDefault) {
    throw new Error('不能删除默认配置')
  }

  const wasCurrentConfig = currentConfigId.value === id

  configs.value.splice(index, 1)
  saveLlmConfigs()

  // 如果删除的是当前配置，切换到第一个配置
  if (wasCurrentConfig) {
    if (configs.value.length > 0) {
      await switchConfig(configs.value[0].id)
    } else {
      currentConfigId.value = ''
      localStorage.removeItem(CURRENT_CONFIG_KEY)
    }
  }

  return true
}

/**
 * 重置默认配置到初始状态
 */
export async function resetDefaultConfig(id: string): Promise<boolean> {
  const config = configs.value.find((c) => c.id === id)
  if (!config || !config.isDefault) return false

  // 获取该类型的默认配置模板
  const defaultConfigs = createDefaultConfigs()
  const defaultTemplate = defaultConfigs.find((c) => c.type === config.type)
  if (!defaultTemplate) return false

  // 重置配置内容（保留 id、name、isDefault、时间戳）
  const index = configs.value.findIndex((c) => c.id === id)
  if (index === -1) return false

  configs.value[index] = {
    ...defaultTemplate,
    id: config.id,
    name: config.name,
    isDefault: true,
    createdAt: config.createdAt,
    updatedAt: Date.now()
  }

  saveLlmConfigs()

  // 如果重置的是当前配置，重新应用配置
  if (currentConfigId.value === id) {
    await applyConfigToSettings(configs.value[index])
  }

  return true
}

/**
 * 切换配置
 */
export async function switchConfig(id: string): Promise<boolean> {
  const config = configs.value.find((c) => c.id === id)
  if (!config) return false

  currentConfigId.value = id
  localStorage.setItem(CURRENT_CONFIG_KEY, id)

  // 保存当前配置的快照
  workspaceState.snapshot = JSON.parse(JSON.stringify(config))
  workspaceState.hasUnsavedChanges = false

  // 应用配置到设置
  await applyConfigToSettings(config)

  return true
}

/**
 * 应用配置到设置（不广播，用于接收广播后的同步）
 */
async function applyConfigToSettingsWithoutBroadcast(config: LlmConfigItem): Promise<void> {
  await setSetting('selectedLlm', config.type)

  // 根据配置类型设置对应的字段，并清空其他类型的字段
  if (config.type === 'ollama' && config.ollama) {
    await setSetting('ollamaApiUrl', config.ollama.apiUrl)
    await setSetting('ollamaSelectedModel', config.ollama.selectedModel)
    await setSetting('ollamaEnableMaxTokens', config.ollama.enableMaxTokens ?? false)
    await setSetting('ollamaMaxTokens', config.ollama.maxTokens || 4096)
    // 清空其他类型
    await setSetting('openaiApiUrl', '')
    await setSetting('openaiApiKey', '')
    await setSetting('openaiSelectedModel', '')
    await setSetting('openaiOfficialApiKey', '')
    await setSetting('openaiOfficialSelectedModel', '')
    await setSetting('deepseekApiKey', '')
    await setSetting('deepseekSelectedModel', '')
    await setSetting('geminiApiKey', '')
    await setSetting('geminiSelectedModel', '')
    await setSetting('metadocSelectedModel', '')
  } else if (config.type === 'openai' && config.openai) {
    await setSetting('openaiApiUrl', config.openai.apiUrl)
    await setSetting('openaiApiKey', config.openai.apiKey)
    await setSetting('openaiSelectedModel', config.openai.selectedModel)
    await setSetting('openaiCompletionSuffix', config.openai.completionSuffix)
    await setSetting('openaiChatSuffix', config.openai.chatSuffix)
    await setSetting('openaiEnableMaxTokens', config.openai.enableMaxTokens ?? false)
    await setSetting('openaiMaxTokens', config.openai.maxTokens || 4096)
    // 清空其他类型
    await setSetting('ollamaApiUrl', '')
    await setSetting('ollamaSelectedModel', '')
    await setSetting('openaiOfficialApiKey', '')
    await setSetting('openaiOfficialSelectedModel', '')
    await setSetting('deepseekApiKey', '')
    await setSetting('deepseekSelectedModel', '')
    await setSetting('geminiApiKey', '')
    await setSetting('geminiSelectedModel', '')
    await setSetting('metadocSelectedModel', '')
  } else if (config.type === 'openai-official' && config['openai-official']) {
    await setSetting('openaiOfficialApiKey', config['openai-official'].apiKey)
    await setSetting('openaiOfficialSelectedModel', config['openai-official'].selectedModel)
    await setSetting(
      'openaiOfficialEnableMaxTokens',
      config['openai-official'].enableMaxTokens ?? false
    )
    await setSetting('openaiOfficialMaxTokens', config['openai-official'].maxTokens || 4096)
    // 清空其他类型
    await setSetting('ollamaApiUrl', '')
    await setSetting('ollamaSelectedModel', '')
    await setSetting('openaiApiUrl', '')
    await setSetting('openaiApiKey', '')
    await setSetting('openaiSelectedModel', '')
    await setSetting('deepseekApiKey', '')
    await setSetting('deepseekSelectedModel', '')
    await setSetting('geminiApiKey', '')
    await setSetting('geminiSelectedModel', '')
    await setSetting('metadocSelectedModel', '')
  } else if (config.type === 'deepseek' && config.deepseek) {
    await setSetting('deepseekApiKey', config.deepseek.apiKey)
    await setSetting('deepseekSelectedModel', config.deepseek.selectedModel)
    await setSetting('deepseekEnableMaxTokens', config.deepseek.enableMaxTokens ?? false)
    await setSetting('deepseekMaxTokens', config.deepseek.maxTokens || 4096)
    // 清空其他类型
    await setSetting('ollamaApiUrl', '')
    await setSetting('ollamaSelectedModel', '')
    await setSetting('openaiApiUrl', '')
    await setSetting('openaiApiKey', '')
    await setSetting('openaiSelectedModel', '')
    await setSetting('openaiOfficialApiKey', '')
    await setSetting('openaiOfficialSelectedModel', '')
    await setSetting('geminiApiKey', '')
    await setSetting('geminiSelectedModel', '')
    await setSetting('metadocSelectedModel', '')
  } else if (config.type === 'gemini' && config.gemini) {
    await setSetting('geminiApiKey', config.gemini.apiKey)
    await setSetting('geminiSelectedModel', config.gemini.selectedModel)
    await setSetting('geminiEnableMaxTokens', config.gemini.enableMaxTokens ?? false)
    await setSetting('geminiMaxTokens', config.gemini.maxTokens || 4096)
    // 清空其他类型
    await setSetting('ollamaApiUrl', '')
    await setSetting('ollamaSelectedModel', '')
    await setSetting('openaiApiUrl', '')
    await setSetting('openaiApiKey', '')
    await setSetting('openaiSelectedModel', '')
    await setSetting('openaiOfficialApiKey', '')
    await setSetting('openaiOfficialSelectedModel', '')
    await setSetting('deepseekApiKey', '')
    await setSetting('deepseekSelectedModel', '')
    await setSetting('metadocSelectedModel', '')
  } else if (config.type === 'metadoc' && config.metadoc) {
    await setSetting('metadocSelectedModel', config.metadoc.selectedModel)
    await setSetting('metadocEnableMaxTokens', config.metadoc.enableMaxTokens ?? false)
    await setSetting('metadocMaxTokens', config.metadoc.maxTokens || 4096)
    // 清空其他类型
    await setSetting('ollamaApiUrl', '')
    await setSetting('ollamaSelectedModel', '')
    await setSetting('openaiApiUrl', '')
    await setSetting('openaiApiKey', '')
    await setSetting('openaiSelectedModel', '')
    await setSetting('openaiOfficialApiKey', '')
    await setSetting('openaiOfficialSelectedModel', '')
    await setSetting('deepseekApiKey', '')
    await setSetting('deepseekSelectedModel', '')
    await setSetting('geminiApiKey', '')
    await setSetting('geminiSelectedModel', '')
  } else if (config.type === 'manual') {
    // 手动类型不需要额外配置，但需要清空其他类型
    await setSetting('ollamaApiUrl', '')
    await setSetting('ollamaSelectedModel', '')
    await setSetting('openaiApiUrl', '')
    await setSetting('openaiApiKey', '')
    await setSetting('openaiSelectedModel', '')
    await setSetting('openaiOfficialApiKey', '')
    await setSetting('openaiOfficialSelectedModel', '')
    await setSetting('deepseekApiKey', '')
    await setSetting('deepseekSelectedModel', '')
    await setSetting('geminiApiKey', '')
    await setSetting('geminiSelectedModel', '')
    await setSetting('metadocSelectedModel', '')
  }

  // 只触发本窗口的配置更新事件，不广播（避免循环广播）
  const { default: eventBus } = await import('./event-bus.js')
  eventBus.emit('llm-api-updated')
}

/**
 * 应用配置到设置
 */
async function applyConfigToSettings(config: LlmConfigItem): Promise<void> {
  await applyConfigToSettingsWithoutBroadcast(config)

  // 广播配置更新事件到所有窗口，让其他窗口知道配置已更新
  // 其他窗口在下次调用 createAdapterFromSettings 时会从主进程读取最新设置
  // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
  const eventBus = (await import('./event-bus.js')).default
  eventBus.emit('llm-config-updated', {
    configId: config.id,
    configType: config.type
  })
}

/**
 * 从当前设置创建配置
 */
export async function createConfigFromCurrentSettings(name: string): Promise<LlmConfigItem> {
  const configData = await createConfigFromSettings()

  // 禁止创建 manual 类型的配置（仅开发模式可用）
  if (configData.type === 'manual') {
    throw new Error('不能创建手动类型的配置，手动类型仅用于开发模式')
  }

  return addConfig({
    ...configData,
    name
  })
}

/**
 * 检查工作区是否有未保存的修改
 */
export async function checkWorkspaceModified(): Promise<boolean> {
  if (!workspaceState.snapshot) return false

  const currentSettings = await createConfigFromSettings()
  const snapshot = workspaceState.snapshot

  // 比较类型
  if (snapshot.type !== currentSettings.type) return true

  // 根据类型比较具体字段
  if (snapshot.type === 'ollama' && snapshot.ollama) {
    const current = currentSettings.ollama
    if (!current) return true
    if (
      snapshot.ollama.apiUrl !== current.apiUrl ||
      snapshot.ollama.selectedModel !== current.selectedModel ||
      snapshot.ollama.enableMaxTokens !== current.enableMaxTokens ||
      snapshot.ollama.maxTokens !== current.maxTokens
    ) {
      return true
    }
  } else if (snapshot.type === 'openai' && snapshot.openai) {
    const current = currentSettings.openai
    if (!current) return true
    if (
      snapshot.openai.apiUrl !== current.apiUrl ||
      snapshot.openai.apiKey !== current.apiKey ||
      snapshot.openai.selectedModel !== current.selectedModel ||
      snapshot.openai.completionSuffix !== current.completionSuffix ||
      snapshot.openai.chatSuffix !== current.chatSuffix ||
      snapshot.openai.enableMaxTokens !== current.enableMaxTokens ||
      snapshot.openai.maxTokens !== current.maxTokens
    ) {
      return true
    }
  } else if (snapshot.type === 'openai-official' && snapshot['openai-official']) {
    const current = currentSettings['openai-official']
    if (!current) return true
    if (
      snapshot['openai-official'].apiKey !== current.apiKey ||
      snapshot['openai-official'].selectedModel !== current.selectedModel ||
      snapshot['openai-official'].enableMaxTokens !== current.enableMaxTokens ||
      snapshot['openai-official'].maxTokens !== current.maxTokens
    ) {
      return true
    }
  } else if (snapshot.type === 'deepseek' && snapshot.deepseek) {
    const current = currentSettings.deepseek
    if (!current) return true
    if (
      snapshot.deepseek.apiKey !== current.apiKey ||
      snapshot.deepseek.selectedModel !== current.selectedModel ||
      snapshot.deepseek.enableMaxTokens !== current.enableMaxTokens ||
      snapshot.deepseek.maxTokens !== current.maxTokens
    ) {
      return true
    }
  } else if (snapshot.type === 'gemini' && snapshot.gemini) {
    const current = currentSettings.gemini
    if (!current) return true
    if (
      snapshot.gemini.apiKey !== current.apiKey ||
      snapshot.gemini.selectedModel !== current.selectedModel ||
      snapshot.gemini.enableMaxTokens !== current.enableMaxTokens ||
      snapshot.gemini.maxTokens !== current.maxTokens
    ) {
      return true
    }
  } else if (snapshot.type === 'metadoc' && snapshot.metadoc) {
    const current = currentSettings.metadoc
    if (!current) return true
    if (
      snapshot.metadoc.selectedModel !== current.selectedModel ||
      snapshot.metadoc.enableMaxTokens !== current.enableMaxTokens ||
      snapshot.metadoc.maxTokens !== current.maxTokens
    ) {
      return true
    }
  }

  return false
}

/**
 * 更新工作区修改状态
 */
export async function updateWorkspaceModifiedState(): Promise<void> {
  workspaceState.hasUnsavedChanges = await checkWorkspaceModified()
}

/**
 * 保存工作区修改（将当前设置保存到配置）
 */
export async function saveWorkspace(): Promise<boolean> {
  if (!workspaceState.snapshot) return false

  const currentSettings = await createConfigFromSettings()
  const updates: Partial<Omit<LlmConfigItem, 'id' | 'createdAt'>> = {
    ...currentSettings,
    updatedAt: Date.now()
  }

  const success = await updateConfig(workspaceState.snapshot.id, updates)
  if (success) {
    // 更新快照
    const updatedConfig = configs.value.find((c) => c.id === workspaceState.snapshot!.id)
    if (updatedConfig) {
      workspaceState.snapshot = JSON.parse(JSON.stringify(updatedConfig))
      workspaceState.hasUnsavedChanges = false
    }
  }

  return success
}

/**
 * 放弃工作区修改（恢复到快照）
 */
export async function discardWorkspace(): Promise<boolean> {
  if (!workspaceState.snapshot) return false

  // 恢复到快照
  await applyConfigToSettings(workspaceState.snapshot)
  workspaceState.hasUnsavedChanges = false

  return true
}

/**
 * 获取工作区状态
 */
export function getWorkspaceState(): Readonly<WorkspaceState> {
  return workspaceState
}

// 初始化时加载配置
// 监听广播：当其他窗口切换配置时，重新加载配置列表
// 注意：配置列表存储在 localStorage 中，所有窗口共享
// 但当前配置ID也存储在 localStorage 中，所以切换配置时其他窗口会自动感知
async function initLlmConfigBroadcast() {
  try {
    const { default: eventBus } = await import('./event-bus.js')

    eventBus.on('llm-config-updated', async (data: any) => {
      // 使用 try-catch 保护 logger 调用
      try {
        getLogger().debug('收到LLM配置更新广播', data)
      } catch (loggerError) {
        console.debug('收到LLM配置更新广播', data)
        console.warn('Logger初始化错误:', loggerError)
      }

      // 重新加载配置列表（因为可能在其他窗口被修改）
      loadLlmConfigs()

      // 如果当前配置ID与广播的配置ID一致，或者当前没有配置，重新应用配置
      if (data?.configId && (currentConfigId.value === data.configId || !currentConfigId.value)) {
        const config = configs.value.find((c) => c.id === data.configId)
        if (config) {
          // 重新应用配置到设置（确保设置是最新的）
          // 注意：这里不会再次广播，避免循环广播
          await applyConfigToSettingsWithoutBroadcast(config)
        }
      } else if (data?.configId) {
        // 如果广播的配置ID与当前配置ID不一致，说明其他窗口切换了配置
        // 检查当前配置ID是否还存在，如果不存在则切换到第一个配置
        const currentConfig = configs.value.find((c) => c.id === currentConfigId.value)
        if (!currentConfig && configs.value.length > 0) {
          // 当前配置不存在，切换到第一个配置
          await switchConfig(configs.value[0].id)
        }
      }
    })
  } catch (error) {
    // 如果初始化失败，使用 console.error 而不是 logger（因为 logger 可能未初始化）
    console.error('初始化LLM配置广播监听失败:', error)
    throw error
  }
}

// 初始化时注册广播监听（延迟执行，确保logger已初始化）
// 使用多层延迟确保 logger 模块完全初始化
// 首先使用 setTimeout，然后使用 requestAnimationFrame（如果可用）或再次 setTimeout
const initWithDelay = () => {
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => {
      setTimeout(() => {
        initLlmConfigBroadcast().catch((err) => {
          // 使用 try-catch 包装，确保即使 logger 未初始化也不会崩溃
          try {
            getLogger().error('初始化LLM配置广播监听失败', err)
          } catch (loggerError) {
            console.error('初始化LLM配置广播监听失败:', err)
            console.error('Logger初始化错误:', loggerError)
          }
        })
      }, 10)
    })
  } else {
    setTimeout(() => {
      setTimeout(() => {
        initLlmConfigBroadcast().catch((err) => {
          try {
            getLogger().error('初始化LLM配置广播监听失败', err)
          } catch (loggerError) {
            console.error('初始化LLM配置广播监听失败:', err)
            console.error('Logger初始化错误:', loggerError)
          }
        })
      }, 10)
    }, 0)
  }
}

initWithDelay()

// 延迟加载配置，确保logger已初始化
const loadWithDelay = () => {
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => {
      setTimeout(() => {
        loadLlmConfigs()
      }, 10)
    })
  } else {
    setTimeout(() => {
      setTimeout(() => {
        loadLlmConfigs()
      }, 10)
    }, 0)
  }
}

loadWithDelay()

/**
 * 导出配置为JSON字符串
 */
export function exportConfig(configId: string): string | null {
  const config = configs.value.find((c) => c.id === configId)
  if (!config) return null

  return JSON.stringify(config, null, 2)
}

/**
 * 导出所有配置为JSON字符串
 */
export function exportAllConfigs(): string {
  return JSON.stringify(configs.value, null, 2)
}

/**
 * 导入配置
 */
export function importConfig(jsonString: string): {
  success: boolean
  config?: LlmConfigItem
  error?: string
} {
  try {
    const parsed = JSON.parse(jsonString)

    // 验证配置格式
    if (!parsed.id || !parsed.name || !parsed.type) {
      return { success: false, error: '配置格式无效：缺少必要字段' }
    }

    // 生成新的ID（避免ID冲突）
    const importedConfig: LlmConfigItem = {
      ...parsed,
      id: `config-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: parsed.createdAt || Date.now(),
      updatedAt: Date.now()
    }

    // 移除临时配置相关字段（如果存在）
    delete (importedConfig as any).isTemporary
    delete (importedConfig as any).originalConfigId
    // 导入的配置不应该被标记为默认配置
    delete (importedConfig as any).isDefault

    // 添加到配置列表
    configs.value.push(importedConfig)
    saveLlmConfigs()

    return { success: true, config: importedConfig }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '导入配置失败：JSON解析错误'
    }
  }
}

/**
 * 导入多个配置
 */
export function importConfigs(jsonString: string): {
  success: boolean
  imported: number
  errors: string[]
} {
  try {
    const parsed = JSON.parse(jsonString)

    // 支持单个配置或配置数组
    const configsToImport = Array.isArray(parsed) ? parsed : [parsed]

    let imported = 0
    const errors: string[] = []

    for (const config of configsToImport) {
      // 验证配置格式
      if (!config.name || !config.type) {
        errors.push(`配置 "${config.name || '未知'}" 格式无效：缺少必要字段`)
        continue
      }

      // 生成新的ID
      const importedConfig: LlmConfigItem = {
        ...config,
        id: `config-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        createdAt: config.createdAt || Date.now(),
        updatedAt: Date.now()
      }

      // 移除临时配置相关字段
      delete (importedConfig as any).isTemporary
      delete (importedConfig as any).originalConfigId
      // 导入的配置不应该被标记为默认配置
      delete (importedConfig as any).isDefault

      // 添加到配置列表
      configs.value.push(importedConfig)
      imported++
    }

    if (imported > 0) {
      saveLlmConfigs()
    }

    return { success: imported > 0, imported, errors }
  } catch (error) {
    return {
      success: false,
      imported: 0,
      errors: [error instanceof Error ? error.message : '导入配置失败：JSON解析错误']
    }
  }
}
