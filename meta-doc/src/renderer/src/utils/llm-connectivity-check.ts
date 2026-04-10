/**
 * LLM 连通性检测（供设置页与首次向导复用）
 */
import { ref } from 'vue'
import { getSetting } from './settings.js'
import { ai_types, createAiTask } from './ai_tasks.ts'
import type { LlmConfigItem } from './llm-config-manager'

export function buildCustomLlmConfigFromItem(
  item: LlmConfigItem
): { baseUrl: string; apiKey?: string; model: string; type: string } | null {
  const t = item.type
  if (t === 'manual' || t === 'metadoc') return null
  if (t === 'ollama' && item.ollama) {
    return {
      baseUrl: item.ollama.apiUrl || '',
      model: item.ollama.selectedModel || '',
      type: 'ollama'
    }
  }
  if (t === 'openai' && item.openai) {
    return {
      baseUrl: item.openai.apiUrl || '',
      apiKey: item.openai.apiKey,
      model: item.openai.selectedModel || '',
      type: 'openai'
    }
  }
  if (t === 'openai-official' && item['openai-official']) {
    return {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: item['openai-official'].apiKey,
      model: item['openai-official'].selectedModel || '',
      type: 'openai-official'
    }
  }
  if (t === 'deepseek' && item.deepseek) {
    return {
      baseUrl: 'https://api.deepseek.com',
      apiKey: item.deepseek.apiKey,
      model: item.deepseek.selectedModel || '',
      type: 'deepseek'
    }
  }
  if (t === 'gemini' && item.gemini) {
    return {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: item.gemini.apiKey,
      model: item.gemini.selectedModel || '',
      type: 'gemini'
    }
  }
  if (t === 'qwen' && item.qwen) {
    return {
      baseUrl: item.qwen.apiUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: item.qwen.apiKey,
      model: item.qwen.selectedModel || '',
      type: 'qwen'
    }
  }
  return null
}

export type LlmQuickConnectivityResult = {
  ok: boolean
  /** 失败或空响应时的说明，供 UI tooltip */
  message?: string
}

async function runOneChatNonStream(
  prompt: string,
  temperature: number,
  customLlmConfig: { baseUrl: string; apiKey?: string; model: string; type: string },
  originKey: string,
  t: (key: string) => string
): Promise<LlmQuickConnectivityResult> {
  const testRef = ref('')
  const taskName = t('setting.testChatNonStream')
  /** 向导/静默连通性检测：勿弹出全局 LLM 错误对话框（避免遮罩在向导 z-index 下卡住整窗点击） */
  const meta = { stream: false, temperature, customLlmConfig, suppressGlobalLlmErrorUI: true }
  try {
    const payload = [{ role: 'user', content: prompt }] as Array<{ role: string; content: string }>
    const { done } = createAiTask(taskName, payload, testRef, ai_types.chat, originKey, meta)
    await done
    if ((testRef.value?.length ?? 0) > 0) return { ok: true }
    return { ok: false, message: t('onboarding.llm.testFail') }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('取消') || msg.includes('aborted') || msg.includes('cancelled'))
      return { ok: true }
    const anyErr = err as { getUserMessage?: () => string }
    const detail = typeof anyErr?.getUserMessage === 'function' ? anyErr.getUserMessage() : msg
    return { ok: false, message: detail || t('onboarding.llm.testFail') }
  }
}

/** 使用自定义配置做一次非流式 Chat 请求，验证连通性（含失败原因） */
export async function quickLlmChatConnectivityDetailed(
  item: LlmConfigItem,
  t: (key: string) => string
): Promise<LlmQuickConnectivityResult> {
  const customLlmConfig = buildCustomLlmConfigFromItem(item)
  if (!customLlmConfig) return { ok: false, message: t('onboarding.llm.testFail') }
  const temperature = ((await getSetting('llmTemperature')) as number) || 1.3
  const prompt = `${new Date().toLocaleString()}\n${t('setting.testPrompt')}`
  const originKey = `llm-onboarding-${item.id}-${Date.now()}`
  return runOneChatNonStream(prompt, temperature, customLlmConfig, originKey, t)
}

/** 使用自定义配置做一次非流式 Chat 请求，验证连通性 */
export async function quickLlmChatConnectivity(
  item: LlmConfigItem,
  t: (key: string) => string
): Promise<boolean> {
  const r = await quickLlmChatConnectivityDetailed(item, t)
  return r.ok
}
