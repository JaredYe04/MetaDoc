<template>
  <div
    class="grid grid-cols-1 gap-3 sm:grid-cols-2"
    :class="{ 'opacity-60 pointer-events-none': loading || disabled }"
  >
    <button
      v-for="row in rows"
      :key="row.pack.item_id"
      type="button"
      class="steam-mtx-card group relative flex min-h-[5.5rem] flex-col justify-between rounded-xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/35 p-4 text-left shadow-sm transition-all hover:border-primary/45 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
      :disabled="loading || disabled"
      @click="$emit('select', row.pack)"
    >
      <div class="pr-16">
        <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {{ t('setting.llmSteamCloud.mtxPackCreditsLabel') }}
        </div>
        <div
          class="mt-0.5 font-mono text-2xl font-semibold tabular-nums leading-none text-foreground"
        >
          {{ row.pack.credits_amount }}
        </div>
      </div>
      <div class="mt-3 flex items-end justify-between gap-2">
        <span class="text-base font-medium text-foreground">{{
          formatUsd(row.pack.usd_price)
        }}</span>
      </div>
      <span
        v-if="row.discountPct != null && row.discountPct > 0"
        class="pointer-events-none absolute bottom-2 right-2 rounded-md bg-gradient-to-r from-amber-600 to-orange-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-tight text-white shadow-md ring-1 ring-black/10"
      >
        −{{ row.discountPct }}%
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

export type SteamMtxPackRow = {
  item_id: string
  amount_cents: number
  usd_price: number
  credits_amount: number
}

const props = defineProps<{
  packs: SteamMtxPackRow[]
  loading?: boolean
  disabled?: boolean
}>()

defineEmits<{
  select: [pack: SteamMtxPackRow]
}>()

const { t } = useI18n()

function formatUsd(usd: number): string {
  const s = usd.toFixed(2)
  return s.endsWith('.00') ? `$${usd.toFixed(0)}` : `$${s}`
}

const rows = computed(() => {
  const sorted = [...props.packs].sort((a, b) => a.credits_amount - b.credits_amount)
  const first = sorted[0]
  if (!first || first.credits_amount <= 0) {
    return sorted.map((pack) => ({ pack, discountPct: null as number | null }))
  }
  const baselineUsdPerCredit = first.usd_price / first.credits_amount
  return sorted.map((pack) => {
    if (pack.item_id === first.item_id) {
      return { pack, discountPct: null as number | null }
    }
    const naiveUsd = pack.credits_amount * baselineUsdPerCredit
    if (naiveUsd <= 0) {
      return { pack, discountPct: null as number | null }
    }
    const pct = Math.round((1 - pack.usd_price / naiveUsd) * 100)
    return { pack, discountPct: pct > 0 ? pct : null }
  })
})
</script>
