import type { LlmConfigItem } from './llm-config-manager'

/** 配置卡片 / 下拉里展示的「当前模型 id」文案（无则占位） */
export function getLlmConfigSelectedModel(config: LlmConfigItem): string {
  const t = config.type
  if (t === 'ollama') return (config.ollama?.selectedModel ?? '').trim() || '—'
  if (t === 'openai') return (config.openai?.selectedModel ?? '').trim() || '—'
  if (t === 'openai-official')
    return (config['openai-official']?.selectedModel ?? '').trim() || '—'
  if (t === 'deepseek') return (config.deepseek?.selectedModel ?? '').trim() || '—'
  if (t === 'gemini') return (config.gemini?.selectedModel ?? '').trim() || '—'
  if (t === 'qwen') return (config.qwen?.selectedModel ?? '').trim() || '—'
  if (t === 'metadoc') return (config.metadoc?.selectedModel ?? '').trim() || '—'
  if (t === 'manual') return 'manual-model'
  return '—'
}

/**
 * 与设置页 LLM 配置卡片一致的配置名称（预设走 i18n，自定义用 name）
 */
export function getLlmConfigDisplayName(
  config: LlmConfigItem,
  t: (key: string) => string
): string {
  if (config.isDefault) {
    if (config.presetKind === 'builtin-free') {
      return t('setting.defaultConfigBuiltinFree')
    }
    const typeKeyMap: Record<string, string> = {
      ollama: 'setting.defaultConfigOllama',
      openai: 'setting.defaultConfigOpenai',
      'openai-official': 'setting.defaultConfigOpenaiOfficial',
      deepseek: 'setting.defaultConfigDeepseek',
      gemini: 'setting.defaultConfigGemini',
      qwen: 'setting.defaultConfigQwen',
      metadoc: 'setting.defaultConfigMetadoc',
      manual: 'setting.defaultConfigManual'
    }
    const i18nKey = typeKeyMap[config.type]
    if (i18nKey) {
      return t(i18nKey)
    }
  }
  return config.name
}

/** 下拉项：「模型名 - 配置名」 */
export function getLlmConfigOptionLabel(config: LlmConfigItem, t: (key: string) => string): string {
  const model = getLlmConfigSelectedModel(config)
  const name = getLlmConfigDisplayName(config, t)
  return `${model} - ${name}`
}
