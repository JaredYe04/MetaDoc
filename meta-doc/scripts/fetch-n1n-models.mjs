/**
 * 使用环境变量 N1N_API_KEY（或 OPENAI_API_KEY）请求 n1n OpenAI 兼容 GET /v1/models。
 * Usage: N1N_API_KEY=sk-... node scripts/fetch-n1n-models.mjs
 */
import process from 'node:process'

const key = process.env.N1N_API_KEY || process.env.OPENAI_API_KEY
const base = (process.env.N1N_BASE_URL || 'https://api.n1n.ai/v1').replace(/\/$/, '')
const url = `${base}/models`

if (!key) {
  console.error('Missing N1N_API_KEY or OPENAI_API_KEY in environment.')
  process.exit(1)
}

const res = await fetch(url, {
  headers: { authorization: `Bearer ${key}` }
})
const text = await res.text()
let data
try {
  data = JSON.parse(text)
} catch {
  data = { parse_error: true, raw: text.slice(0, 500) }
}

const ids =
  data && typeof data === 'object' && Array.isArray(data.data)
    ? data.data.map((x) => x.id).filter(Boolean)
    : []

console.log('URL:', url)
console.log('HTTP:', res.status, res.statusText)
console.log('Model count:', ids.length)
if (ids.length > 0) {
  console.log('First 40 ids:', ids.slice(0, 40).join(', '))
}

if (!res.ok) {
  console.log('Body (truncated):', text.slice(0, 800))
  process.exit(2)
}

process.exit(0)
