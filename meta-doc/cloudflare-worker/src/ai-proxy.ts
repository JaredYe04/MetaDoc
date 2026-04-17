import type { Env } from './types'

function upstreamChatUrl(env: Env): string {
  const base = (env.N1N_BASE_URL || 'https://api.n1n.ai/v1').replace(/\/$/, '')
  return `${base}/chat/completions`
}

function upstreamKey(env: Env): string {
  return env.N1N_API_KEY || env.OPENAI_API_KEY
}

export async function forwardChatCompletion(
  env: Env,
  body: unknown
): Promise<{ response: Response; usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } }> {
  const res = await fetch(upstreamChatUrl(env), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${upstreamKey(env)}`
    },
    body: JSON.stringify(body)
  })
  const clone = res.clone()
  let usage: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined
  try {
    const json = (await clone.json()) as { usage?: typeof usage }
    usage = json.usage
  } catch {
    /* non-json e.g. stream */
  }
  return { response: res, usage }
}
