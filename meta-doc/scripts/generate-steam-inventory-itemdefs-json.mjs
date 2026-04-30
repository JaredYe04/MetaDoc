/**
 * Generate Steam Inventory Schema JSON (ItemDef list) from MetaDoc MTX pricing.
 *
 * Source: meta-doc/docs/cloud/pricing/steam-mtx-items.yaml
 * Output: JSON that matches Steam Inventory Schema "ItemDef Schema Overview".
 *
 * Usage:
 *   node scripts/generate-steam-inventory-itemdefs-json.mjs --appid 4359310 --iconBaseUrl "https://your-cdn.example.com/metadoc/inventory-icons"
 *     --out docs/cloud/pricing/steam-inventory-itemdefs.generated.json
 *
 * Notes:
 * - Steam requires publicly reachable icon URLs (Steam will download & cache).
 * - itemdefid must be unique and <= 2,147,483,647 (and < 1,000,000 for non-workshop items).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse as parseYaml } from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function parseArgs(argv) {
  const args = new Map()
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (!k.startsWith('--')) continue
    const key = k.slice(2)
    const v = argv[i + 1]
    if (v && !String(v).startsWith('--')) {
      args.set(key, v)
      i++
    } else {
      args.set(key, true)
    }
  }
  return args
}

function mustGet(args, key) {
  const v = args.get(key)
  if (!v || v === true) throw new Error(`Missing required arg --${key}`)
  return String(v)
}

function getOptional(args, key, fallback) {
  const v = args.get(key)
  if (v === undefined) return fallback
  if (v === true) return fallback
  return String(v)
}

function buildPriceUsd(amountCentsUsd) {
  // Steam Inventory Schema price: "1;USD99" where 99 means $0.99
  if (!Number.isInteger(amountCentsUsd) || amountCentsUsd < 0) {
    throw new Error(`Invalid amount_cents_usd=${amountCentsUsd}`)
  }
  return `1;USD${amountCentsUsd}`
}

function buildPriceUsdWithCny(amountCentsUsd, cnyYuan) {
  const usd = buildPriceUsd(amountCentsUsd)
  const cny = Number(cnyYuan)
  if (!Number.isFinite(cny) || cny <= 0) return usd
  const cnyFen = Math.round(cny * 100)
  return `${usd},CNY${cnyFen}`
}

function normalizeHexColor6(s) {
  const t = String(s).replace('#', '').trim()
  if (!/^[0-9a-fA-F]{6}$/.test(t)) throw new Error(`Invalid hex color (6 digits): ${s}`)
  return t.toUpperCase()
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  const appidRaw = mustGet(args, 'appid')
  const iconBaseUrl = mustGet(args, 'iconBaseUrl')
  const out = getOptional(args, 'out', path.join(root, 'docs', 'cloud', 'pricing', 'steam-inventory-itemdefs.generated.json'))

  const backgroundColor = normalizeHexColor6(getOptional(args, 'backgroundColor', '0B1020'))
  const nameColor = normalizeHexColor6(getOptional(args, 'nameColor', 'E6EDF3'))
  const displayType = getOptional(args, 'displayType', 'MetaDoc Cloud Credits')
  const storeTags = getOptional(args, 'storeTags', 'metadoc;cloud;credits')
  const gameOnly = getOptional(args, 'gameOnly', 'true').toLowerCase() === 'true'
  const marketable = getOptional(args, 'marketable', 'false').toLowerCase() === 'true'
  const tradable = getOptional(args, 'tradable', 'false').toLowerCase() === 'true'
  const hidden = getOptional(args, 'hidden', 'false').toLowerCase() === 'true'
  const storeHidden = getOptional(args, 'storeHidden', 'false').toLowerCase() === 'true'

  const pricingPath = path.join(root, 'docs', 'cloud', 'pricing', 'steam-mtx-items.yaml')
  if (!fs.existsSync(pricingPath)) {
    throw new Error(`Missing pricing yaml: ${pricingPath}`)
  }

  const pricing = parseYaml(fs.readFileSync(pricingPath, 'utf8'))
  const items = Array.isArray(pricing?.items) ? pricing.items : []
  if (items.length === 0) throw new Error('steam-mtx-items.yaml: items[] empty')

  const appid = Number(appidRaw)
  if (!Number.isFinite(appid) || !Number.isInteger(appid) || appid <= 0) {
    throw new Error(`Invalid --appid=${appidRaw}`)
  }

  const itemdefs = items
    .filter((it) => it?.listed === true)
    .map((it) => {
      const itemdefid = Number(it.steam_item_id)
      if (!Number.isFinite(itemdefid) || !Number.isInteger(itemdefid)) {
        throw new Error(`Invalid steam_item_id=${it.steam_item_id}`)
      }
      // Non-workshop itemdefid < 1,000,000 is recommended/required by Valve.
      if (itemdefid >= 1_000_000) {
        throw new Error(
          `itemdefid must be < 1,000,000 for non-workshop items. Got ${itemdefid} (steam_item_id=${it.steam_item_id}).`
        )
      }

      const usdCents = it.amount_cents_usd
      if (!Number.isFinite(usdCents) || !Number.isInteger(usdCents)) {
        throw new Error(`Invalid amount_cents_usd for steam_item_id=${it.steam_item_id}`)
      }

      const label = String(it.label || `MetaDoc Cloud Tier ${it.steam_item_id}`)
      const price = buildPriceUsdWithCny(usdCents, typeof it.cny_price === 'number' ? it.cny_price : undefined)

      const iconUrl = `${iconBaseUrl.replace(/\/$/, '')}/${itemdefid}.png`
      const iconUrlLarge = `${iconBaseUrl.replace(/\/$/, '')}/${itemdefid}_large.png`

      return {
        itemdefid,
        type: 'item',
        name: label,
        description: label,
        display_type: displayType,
        background_color: backgroundColor,
        name_color: nameColor,
        icon_url: iconUrl,
        icon_url_large: iconUrlLarge,
        price,
        tradable,
        marketable,
        store_tags: storeTags,
        game_only: gameOnly,
        hidden,
        store_hidden: storeHidden
      }
    })

  const payload = {
    appid,
    items: itemdefs
  }

  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify(payload, null, 2), 'utf8')

  console.log(`OK: wrote ${path.relative(root, out)} (${itemdefs.length} itemdefs)`)
}

main()

