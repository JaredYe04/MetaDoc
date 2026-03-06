#!/usr/bin/env node
/**
 * 从各语言 locale JSON 中提取 skeleton.tips，合并为 skeleton-tips.json 供骨架屏使用。
 * 运行: node scripts/generate-skeleton-tips.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const localesDir = path.join(rootDir, 'src/renderer/src/locales')
const publicDir = path.join(rootDir, 'src/renderer/public')
const outPath = path.join(publicDir, 'skeleton-tips.json')
try { fs.mkdirSync(publicDir, { recursive: true }) } catch (e) {}

const localeFiles = [
  { file: 'zh_cn.json', key: 'zh_CN' },
  { file: 'en_us.json', key: 'en_US' },
  { file: 'ja_JP.json', key: 'ja_JP' },
  { file: 'ko_KR.json', key: 'ko_KR' },
  { file: 'de_DE.json', key: 'de_DE' },
  { file: 'fr_FR.json', key: 'fr_FR' }
]

const out = {}
for (const { file, key } of localeFiles) {
  const filePath = path.join(localesDir, file)
  if (!fs.existsSync(filePath)) continue
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (data.skeleton && Array.isArray(data.skeleton.tips)) {
    out[key] = data.skeleton.tips
  }
}
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8')
console.log('Generated', outPath, Object.keys(out))
