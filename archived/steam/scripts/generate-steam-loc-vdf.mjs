#!/usr/bin/env node
/**
 * 根据「按成就排列」的映射表 + 各语言 locale 中的 steamAch.{API}_NAME / _DESC 生成
 * third-party/steam-achievements/4359310_loc_all.vdf（Partner 上传用）。
 *
 * 映射：third-party/steam-achievements/steam-achievement-vdf-map.json（成就列表与 Partner Token 名）
 * 文案键：steamAch.ACH_XXX_NAME、steamAch.ACH_XXX_DESC（与 steam-achievement-registry 一致）
 * 语言：`src/renderer/src/locales` 下 JSON 与 Steam VDF 语言键按下方表自动对应；未提供文件的
 *   Steam 语言仍输出空 Token 块，与 Partner 模板一致。
 *
 * 用法：
 *   node scripts/generate-steam-loc-vdf.mjs
 *   node scripts/generate-steam-loc-vdf.mjs --map=third-party/steam-achievements/steam-achievement-vdf-map.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

/**
 * Partner VDF 中语言块顺序（与常见导出模板一致）。
 * 每个 Steam 语言键可选对应一个 locale 文件名；存在则填入 steamAch 文案，否则输出空字符串。
 */
const STEAM_LANG_ORDER = [
  'english',
  'schinese',
  'german',
  'french',
  'italian',
  'koreana',
  'spanish',
  'latam',
  'tchinese',
  'russian',
  'thai',
  'japanese',
  'portuguese',
  'polish',
  'danish',
  'dutch',
  'finnish',
  'norwegian',
  'swedish',
  'hungarian',
  'czech',
  'romanian',
  'bulgarian',
  'greek',
  'ukrainian',
  'turkish',
  'arabic',
  'brazilian'
]

/** Steam VDF 语言键 → locales 目录下的 JSON 文件名（仅列出仓库中实际维护的语种） */
const LOCALE_FILE_BY_STEAM_LANG = {
  english: 'en_us.json',
  schinese: 'zh_cn.json',
  tchinese: 'zh_tw.json',
  german: 'de_DE.json',
  french: 'fr_FR.json',
  spanish: 'es_ES.json',
  latam: 'es_419.json',
  russian: 'ru_RU.json',
  japanese: 'ja_JP.json',
  koreana: 'ko_KR.json',
  portuguese: 'pt_PT.json',
  brazilian: 'pt_BR.json'
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** VDF 字符串转义（值中的引号与反斜杠） */
function escapeVdfValue(s) {
  if (typeof s !== 'string') return ''
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * 从 locale 根对象读取成就名/描述。
 * 优先扁平键 ACH_XXX_NAME / ACH_XXX_DESC；兼容旧嵌套 steamAch.ACH_XXX.name / .desc
 */
function getAchievementStrings(localeRoot, apiName) {
  const sa = localeRoot.steamAch
  if (!sa || typeof sa !== 'object') {
    return { name: '', desc: '' }
  }
  const flatN = sa[`${apiName}_NAME`]
  const flatD = sa[`${apiName}_DESC`]
  if (typeof flatN === 'string' || typeof flatD === 'string') {
    return {
      name: typeof flatN === 'string' ? flatN : '',
      desc: typeof flatD === 'string' ? flatD : ''
    }
  }
  const nested = sa[apiName]
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return {
      name: typeof nested.name === 'string' ? nested.name : '',
      desc: typeof nested.desc === 'string' ? nested.desc : ''
    }
  }
  return { name: '', desc: '' }
}

function buildTokensBlock(achievements, localeRoot) {
  const lines = []
  for (const row of achievements) {
    const { apiName, nameToken, descToken } = row
    const { name, desc } = getAchievementStrings(localeRoot, apiName)
    lines.push(`\t\t\t"${nameToken}"\t"${escapeVdfValue(name)}"`)
    lines.push(`\t\t\t"${descToken}"\t"${escapeVdfValue(desc)}"`)
  }
  return lines.join('\n')
}

function buildEmptyTokensBlock(achievements) {
  const lines = []
  for (const row of achievements) {
    const { nameToken, descToken } = row
    lines.push(`\t\t\t"${nameToken}"\t""`)
    lines.push(`\t\t\t"${descToken}"\t""`)
  }
  return lines.join('\n')
}

function emitLanguageBlock(steamLang, tokensInner) {
  return `\t"${steamLang}"\n\t{\n\t\t"Tokens"\n\t\t{\n${tokensInner}\n\t\t}\n\t}`
}

function main() {
  const args = process.argv.slice(2)
  const mapArg = args.find((a) => a.startsWith('--map='))
  const mapPath = mapArg
    ? join(ROOT, mapArg.slice('--map='.length))
    : join(ROOT, 'third-party/steam-achievements/steam-achievement-vdf-map.json')

  if (!existsSync(mapPath)) {
    console.error('映射文件不存在:', mapPath)
    process.exit(1)
  }

  const mapRaw = loadJson(mapPath)
  const achievements = (mapRaw.achievements || []).filter(
    (row) => row && typeof row.apiName === 'string'
  )

  if (achievements.length === 0) {
    console.error('steam-achievement-vdf-map.json: achievements 为空或无效')
    process.exit(1)
  }

  const resolved = achievements.map((row, index) => {
    const apiName = row.apiName
    if (!apiName) {
      throw new Error(`achievements[${index}] 缺少 apiName`)
    }
    const nameToken = row.nameToken ?? `${apiName}_NAME`
    const descToken = row.descToken ?? `${apiName}_DESC`
    return { apiName, nameToken, descToken }
  })

  const localesDir = join(ROOT, 'src/renderer/src/locales')
  const langBlocks = []
  let withText = 0
  let emptyShells = 0

  for (const steamLang of STEAM_LANG_ORDER) {
    const file = LOCALE_FILE_BY_STEAM_LANG[steamLang]
    const fp = file ? join(localesDir, file) : null
    if (fp && existsSync(fp)) {
      const localeRoot = loadJson(fp)
      langBlocks.push(
        emitLanguageBlock(steamLang, buildTokensBlock(resolved, localeRoot))
      )
      withText += 1
    } else {
      langBlocks.push(
        emitLanguageBlock(steamLang, buildEmptyTokensBlock(resolved))
      )
      emptyShells += 1
    }
  }

  const out = `"lang"\n{\n${langBlocks.join('\n')}\n}\n`
  const outPath = join(ROOT, 'third-party/steam-achievements/4359310_loc_all.vdf')
  writeFileSync(outPath, out, 'utf8')
  console.log('Wrote', outPath)
  console.log(
    `Achievements: ${resolved.length}; languages with text: ${withText}; empty shells: ${emptyShells}`
  )
}

main()
