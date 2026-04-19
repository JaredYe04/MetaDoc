import type { Env } from './types'

export function getUpstreamChatCompletionsUrl(env: Env): string {
  const base = (env.N1N_BASE_URL || 'https://api.n1n.ai/v1').replace(/\/$/, '')
  return `${base}/chat/completions`
}

function upstreamKey(env: Env): string {
  return env.N1N_API_KEY || env.OPENAI_API_KEY
}

export type ChatUsage = {
  total_tokens?: number
  prompt_tokens?: number
  completion_tokens?: number
}

/**
 * 从 OpenAI 兼容 SSE 累积文本中解析最后一条带 `usage` 的 data 行。
 * 常见：stream_options.include_usage 时倒数第二条 data 含 usage。
 */
export function parseLastUsageFromOpenAiSse(sseText: string): ChatUsage | undefined {
  let last: ChatUsage | undefined
  for (const line of sseText.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('data:')) continue
    const raw = t.slice(5).trim()
    if (raw === '[DONE]' || raw === '') continue
    try {
      const j = JSON.parse(raw) as { usage?: ChatUsage }
      if (j.usage && typeof j.usage === 'object') {
        last = j.usage
      }
    } catch {
      /* ignore line */
    }
  }
  return last
}

export async function readableStreamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let acc = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) acc += decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
  acc += decoder.decode()
  return acc
}

/**
 * 上游流式 chat/completions。先带 stream_options.include_usage；若 400 再试不带（兼容不支持该字段的上游）。
 */
export async function fetchChatCompletionsStreaming(
  env: Env,
  body: Record<string, unknown>
): Promise<Response> {
  const url = getUpstreamChatCompletionsUrl(env)
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${upstreamKey(env)}`
  }

  const withUsage = { ...body, stream: true, stream_options: { include_usage: true } }
  let res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(withUsage)
  })
  if (!res.ok && res.status === 400) {
    try {
      await res.text()
    } catch {
      /* ignore */
    }
    const noStreamOpts = { ...body, stream: true }
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(noStreamOpts)
    })
  }
  return res
}

export async function forwardChatCompletion(
  env: Env,
  body: unknown
): Promise<{
  response: Response
  usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number }
}> {
  const res = await fetch(getUpstreamChatCompletionsUrl(env), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${upstreamKey(env)}`
    },
    body: JSON.stringify(body)
  })
  const clone = res.clone()
  let usage:
    | { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number }
    | undefined
  try {
    const json = (await clone.json()) as { usage?: typeof usage }
    usage = json.usage
  } catch {
    /* non-json e.g. stream */
  }
  return { response: res, usage }
}
