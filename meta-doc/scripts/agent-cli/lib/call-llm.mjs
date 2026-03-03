/**
 * Call OpenAI-compatible chat completions API (same as MetaDoc LLM path).
 */
export async function callChat(config, messages, { stream = false, signal } = {}) {
  const url = `${config.apiUrl.replace(/\/+$/, '')}${config.chatSuffix || '/chat/completions'}`
  const body = {
    model: config.model,
    messages,
    temperature: config.temperature ?? 0.7,
    stream: false
  }
  const headers = {
    'Content-Type': 'application/json',
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`LLM API ${res.status}: ${t}`)
  }
  const data = await res.json()
  const choice = data.choices && data.choices[0]
  if (!choice) throw new Error('LLM API returned no choices')
  const content = choice.message?.content ?? ''
  return content
}
