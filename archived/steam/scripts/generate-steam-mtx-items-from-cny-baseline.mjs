import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const BASELINE_PATH = path.join(ROOT, 'docs', 'cloud', 'pricing', 'steam-card-pricing-baseline.yaml')
const ECONOMICS_PATH = path.join(ROOT, 'docs', 'cloud', 'pricing', 'economics.yaml')
const OUTPUT_PATH = path.join(ROOT, 'docs', 'cloud', 'pricing', 'steam-mtx-items.yaml')
const REPORT_PATH = path.join(ROOT, 'docs', 'cloud', 'pricing', 'steam-pricing-redesign-report.generated.md')

function ensureNumber(name, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`${name} must be a finite number`)
  }
  return v
}

function ceilToStep(n, step) {
  if (step <= 1) return Math.ceil(n)
  return Math.ceil(n / step) * step
}

function readYaml(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  return parseYaml(raw)
}

function formatUsd(usd) {
  return `$${Number(usd).toFixed(2)}`
}

function roundCreditsToHundred(rawCredits) {
  const n = Math.max(0, Math.floor(rawCredits))
  const base = Math.floor(n / 100) * 100
  const rem = n % 100
  // 5舍6入：0-59 舍，60-99 入；并确保个位十位为 0。
  return rem >= 60 ? base + 100 : base
}

function roundCreditsToTen(rawCredits) {
  const n = Math.max(0, Math.floor(rawCredits))
  const base = Math.floor(n / 10) * 10
  const rem = n % 10
  return rem >= 6 ? base + 10 : base
}

function bulkBonusPctByCnyTier(cny) {
  if (cny >= 1000) return 0.5
  if (cny >= 500) return 0.4
  if (cny >= 200) return 0.32
  if (cny >= 100) return 0.25
  if (cny >= 50) return 0.18
  if (cny >= 20) return 0.12
  if (cny >= 10) return 0.08
  if (cny >= 5) return 0.05
  if (cny >= 2) return 0.02
  return 0
}

function main() {
  const baseline = readYaml(BASELINE_PATH)
  const economicsCfg = readYaml(ECONOMICS_PATH)
  const oldPricing = readYaml(OUTPUT_PATH)
  const oldRows = new Map(
    (Array.isArray(oldPricing?.items) ? oldPricing.items : []).map((x) => [String(x.steam_item_id), x])
  )

  const p = baseline?.params ?? {}
  const steamFeePct = ensureNumber('params.steam_fee_pct', p.steam_fee_pct)
  const marginPct = ensureNumber('params.margin_pct', p.margin_pct)
  const fxCnyPerUsd = ensureNumber('params.fx_cny_per_usd', p.fx_cny_per_usd)
  const minUsdCents = Math.max(1, Math.trunc(ensureNumber('params.min_steam_usd_cents', p.min_steam_usd_cents)))
  const roundStep = Math.max(
    1,
    Math.trunc(ensureNumber('params.round_up_usd_cents_step', p.round_up_usd_cents_step))
  )
  const netKeep = (1 - steamFeePct) * (1 - marginPct)
  if (netKeep <= 0 || netKeep >= 1) {
    throw new Error('invalid fee/margin params: net_keep_ratio must be in (0, 1)')
  }

  const tiers = Array.isArray(baseline?.tiers) ? baseline.tiers : []
  if (tiers.length === 0) throw new Error('tiers[] is empty')
  const creditsPerUsdPool = ensureNumber(
    'economics.credits_per_usd_pool',
    economicsCfg?.economics?.credits_per_usd_pool
  )

  const generatedRows = []
  const reportRows = []
  const BASE_CREDITS_PER_CNY = 100
  let baseTierCny = 0
  let baseTierCredits = 0
  let prevTierCny = 0
  let prevTierCredits = 0

  for (const t of tiers) {
    const steamItemId = String(t.steam_item_id ?? '').trim()
    if (!steamItemId) throw new Error('tier.steam_item_id is required')
    const targetTopupCny = ensureNumber(`tiers[${steamItemId}].target_topup_n1n_cny`, t.target_topup_n1n_cny)
    if (targetTopupCny <= 0) {
      throw new Error(`tiers[${steamItemId}].target_topup_n1n_cny must be > 0`)
    }

    const requiredPayCny = targetTopupCny / netKeep
    const requiredUsd = requiredPayCny / fxCnyPerUsd
    const requiredUsdCents = requiredUsd * 100
    const finalUsdCents = ceilToStep(Math.max(requiredUsdCents, minUsdCents), roundStep)
    const finalUsd = finalUsdCents / 100
    const realizedTopupCny = finalUsd * fxCnyPerUsd * netKeep
    const floorHit = requiredUsdCents < minUsdCents

    const old = oldRows.get(steamItemId)
    void old
    const baseCredits = targetTopupCny * BASE_CREDITS_PER_CNY
    const bonusPct = bulkBonusPctByCnyTier(targetTopupCny)
    const rawCredits = Math.max(0, Math.floor(baseCredits * (1 + bonusPct)))
    let creditsOnRedeem = Math.max(100, roundCreditsToTen(rawCredits))
    // 严格多买多省：高档位单位性价比必须严格高于低档位。
    if (baseTierCny === 0) {
      baseTierCny = targetTopupCny
      baseTierCredits = creditsOnRedeem
    } else {
      // 相对首档必须严格更优：>= 线性 +10（十位梯度）
      const minByBase = Math.ceil((targetTopupCny * baseTierCredits) / baseTierCny) + 10
      // 相对上一档也必须严格更优：>= 按上一档单位换算 +10
      const minByPrev = Math.ceil((targetTopupCny * prevTierCredits) / prevTierCny) + 10
      const minRequired = Math.max(minByBase, minByPrev)
      if (creditsOnRedeem < minRequired) {
        creditsOnRedeem = Math.ceil(minRequired / 10) * 10
      }
    }
    prevTierCny = targetTopupCny
    prevTierCredits = creditsOnRedeem
    const label = `${creditsOnRedeem} Credit Pack`
    const subtitle = `MetaDoc ${creditsOnRedeem} Credit Pack`
    const description = `MetaDoc ${creditsOnRedeem} Credit Pack`

    generatedRows.push({
      steam_item_id: steamItemId,
      label,
      subtitle,
      description,
      credits_on_redeem: creditsOnRedeem,
      cny_price: Number(targetTopupCny),
      usd_price: Number(finalUsd.toFixed(2)),
      amount_cents_usd: finalUsdCents,
      listed: t.listed !== false,
      volume_bonus_credits: 0
    })

    reportRows.push({
      steamItemId,
      targetTopupCny,
      requiredUsd: Number(requiredUsd.toFixed(4)),
      finalUsd: Number(finalUsd.toFixed(2)),
      creditsOnRedeem,
      realizedTopupCny: Number(realizedTopupCny.toFixed(4)),
      floorHit
    })
  }

  const outputDoc = {
    version: String(oldPricing?.version ?? '2'),
    items: generatedRows
  }
  const header =
    '# Generated by scripts/generate-steam-mtx-items-from-cny-baseline.mjs\n' +
    '# Do not edit manually. Adjust docs/cloud/pricing/steam-card-pricing-baseline.yaml and regenerate.\n'
  fs.writeFileSync(OUTPUT_PATH, `${header}${stringifyYaml(outputDoc)}`, 'utf8')

  const reportMd = [
    '# Steam 定价重算报告（自动生成）',
    '',
    `- steam_fee_pct: ${steamFeePct}`,
    `- margin_pct: ${marginPct}`,
    `- fx_cny_per_usd: ${fxCnyPerUsd}`,
    `- min_steam_usd_cents: ${minUsdCents}`,
    `- round_up_usd_cents_step: ${roundStep}`,
    '',
    '| tier(itemdefid) | target_topup_cny | required_usd_raw | final_usd | credits_on_redeem | realized_topup_cny | min_price_floor_hit |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...reportRows.map(
      (r) =>
        `| ${r.steamItemId} | ${r.targetTopupCny} | ${r.requiredUsd} | ${r.finalUsd} | ${r.creditsOnRedeem} | ${r.realizedTopupCny} | ${r.floorHit ? 'yes' : 'no'} |`
    ),
    ''
  ].join('\n')
  fs.writeFileSync(REPORT_PATH, reportMd, 'utf8')

  console.log(`OK: wrote ${path.relative(ROOT, OUTPUT_PATH)}`)
  console.log(`OK: wrote ${path.relative(ROOT, REPORT_PATH)}`)
}

main()
