/**
 * One-off: 从 agent-config-manager.ts 提取默认 systemPrompt，写入 zh_CN.json 的 prompts["agent.default.systemPrompt"]
 * 运行：node inject-agent-prompt.js（在 locale_prompts 目录下）
 */
const fs = require('fs')
const path = require('path')

const dir = __dirname
const tsPath = path.join(dir, '..', 'agent-framework', 'agent-config-manager.ts')
const jsonPath = path.join(dir, 'zh_CN.json')

const ts = fs.readFileSync(tsPath, 'utf8')
// 匹配第一个 systemPrompt: `...`（从 "你是MetaDoc" 到 "高质量的服务。" 后的 `）
const startMark = 'systemPrompt: `你是MetaDoc'
const endMark = '请始终根据用户的具体需求，灵活地制定合适的工作计划，为用户提供高质量的服务。`'
const start = ts.indexOf(startMark)
if (start === -1) {
  console.error('Could not find systemPrompt start')
  process.exit(1)
}
const contentStart = start + 'systemPrompt: `'.length
const end = ts.indexOf(endMark, contentStart)
if (end === -1) {
  console.error('Could not find systemPrompt end')
  process.exit(1)
}
const contentEnd = end + endMark.length - 1 // 不含末尾反引号
let content = ts.slice(contentStart, contentEnd)
// 模板字符串中的 \` 是转义，在提取出的字符串里已是 `，无需再处理
const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
if (!json.prompts) json.prompts = {}
json.prompts['agent.default.systemPrompt'] = content
fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8')
console.log('Injected agent.default.systemPrompt into zh_CN.json, length:', content.length)
