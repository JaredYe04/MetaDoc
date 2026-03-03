/**
 * Load LLM config for agent CLI.
 * Prefer: --config file, then METADOC_AGENT_CONFIG env, then try Electron store path.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function getElectronStorePath() {
  const appName = 'meta-doc'
  const home = process.env.HOME || process.env.USERPROFILE || process.env.APPDATA || ''
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
    return path.join(appData, appName, 'config.json')
  }
  return path.join(home, '.config', appName, 'config.json')
}

function mapStoreToLlmConfig(store) {
  const selected = store.selectedLlm || 'openai'
  if (selected === 'openai' || selected === 'openai-compatible') {
    return {
      apiUrl: (store.openaiApiUrl || '').replace(/\/+$/, ''),
      apiKey: store.openaiApiKey || '',
      model: store.openaiSelectedModel || 'gpt-4o',
      chatSuffix: store.openaiChatSuffix || '/chat/completions',
      temperature: store.llmTemperature ?? 0.7
    }
  }
  if (selected === 'ollama') {
    return {
      apiUrl: (store.ollamaApiUrl || 'http://localhost:11434').replace(/\/+$/, ''),
      apiKey: '',
      model: store.ollamaSelectedModel || 'llama2',
      chatSuffix: '/api/chat',
      temperature: store.llmTemperature ?? 0.7
    }
  }
  if (selected === 'deepseek') {
    return {
      apiUrl: (store.deepseekApiUrl || 'https://api.deepseek.com').replace(/\/+$/, ''),
      apiKey: store.deepseekApiKey || '',
      model: store.deepseekSelectedModel || 'deepseek-chat',
      chatSuffix: store.deepseekChatSuffix || '/v1/chat/completions',
      temperature: store.llmTemperature ?? 0.7
    }
  }
  throw new Error(`Unsupported selectedLlm in store: ${selected}. Use --config with a JSON file.`)
}

export function loadConfig(configPathOrEnv) {
  const fromEnv = process.env.METADOC_AGENT_CONFIG
  const pathToTry = configPathOrEnv || fromEnv || getElectronStorePath()

  if (!pathToTry) {
    throw new Error('No config path. Set METADOC_AGENT_CONFIG or use --config <file>')
  }

  const resolved = path.isAbsolute(pathToTry) ? pathToTry : path.resolve(process.cwd(), pathToTry)
  if (!fs.existsSync(resolved)) {
    throw new Error(`Config file not found: ${resolved}. Create a JSON file with apiUrl, apiKey, model (or point to MetaDoc Electron config).`)
  }

  const raw = fs.readFileSync(resolved, 'utf-8')
  let data
  try {
    data = JSON.parse(raw)
  } catch (e) {
    throw new Error(`Invalid JSON in config: ${resolved}`)
  }

  if (data.apiUrl && data.model) {
    return {
      apiUrl: (data.apiUrl || '').replace(/\/+$/, ''),
      apiKey: data.apiKey || '',
      model: data.model || 'gpt-4o',
      chatSuffix: data.chatSuffix || '/chat/completions',
      temperature: data.temperature ?? 0.7
    }
  }
  return mapStoreToLlmConfig(data)
}
