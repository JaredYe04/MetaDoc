/**
 * 从 steam-mtx-items.yaml 生成 Steam 商店页「特性 / 关于」草稿（需人工粘贴到 Steamworks，非 API 发布）
 * Usage: node scripts/generate-steam-store-mtx-snippet.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse as parseYaml } from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const yamlPath = path.join(root, 'docs', 'cloud', 'pricing', 'steam-mtx-items.yaml')

function main() {
  const text = fs.readFileSync(yamlPath, 'utf8')
  const doc = parseYaml(text)
  if (!Array.isArray(doc.items) || doc.items.length === 0) {
    throw new Error('steam-mtx-items.yaml: items required')
  }
  const listed = doc.items.filter((it) => it.listed === true)
  const linesZh = [
    '## 应用内购买 / 云额度（草稿 — 粘贴到 Steamworks 前请法务与运营审阅）',
    '',
    '本游戏提供应用内购买，用于充值 MetaDoc Cloud 额度（credits），用于云端 AI 等功能。以下为当前标价档位（以游戏内与订单为准）：',
    ''
  ]
  const linesEn = [
    '## In-Game Purchases / Cloud credits (draft — review before pasting to Steamworks)',
    '',
    'This app offers in-app purchases to top up MetaDoc Cloud credits for cloud AI features. Listed tiers (subject to in-game checkout):',
    ''
  ]
  for (const it of listed) {
    const id = String(it.steam_item_id)
    const usd = typeof it.usd_price === 'number' ? it.usd_price.toFixed(2) : '?'
    linesZh.push(`- **Tier ${id}**：约 $${usd} USD`)
    linesEn.push(`- **Tier ${id}**: approx. $${usd} USD`)
  }
  linesZh.push('', '（以上由仓库 `scripts/generate-steam-store-mtx-snippet.mjs` 根据 YAML 生成，非自动同步商店。）')
  linesEn.push('', '(Generated from repo YAML; not auto-published to the store.)')

  const out = ['### 简体中文', '', ...linesZh, '', '### English', '', ...linesEn, ''].join('\n')
  console.log(out)
}

main()
