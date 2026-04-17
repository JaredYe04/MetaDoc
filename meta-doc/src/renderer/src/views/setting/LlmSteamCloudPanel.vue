<template>
  <Card class="mb-6">
    <CardHeader>
      <CardTitle>{{ t('setting.llmSteamCloud.title') }}</CardTitle>
      <CardDescription>{{ t('setting.llmSteamCloud.description') }}</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm text-muted-foreground">{{ t('setting.llmSteamCloud.credits') }}</span>
        <span class="font-mono font-medium">{{ creditsDisplay }}</span>
        <Button size="sm" variant="outline" :disabled="loading" @click="refreshCredits">
          {{ t('setting.llmSteamCloud.refreshCredits') }}
        </Button>
      </div>

      <FormField name="steamCloudModel" :label="t('setting.llmSteamCloud.model')">
        <Select
          :model-value="selectedModel || undefined"
          :disabled="modelsLoading || modelOptions.length === 0"
          @update:model-value="onModelChange"
        >
          <SelectTrigger class="w-full max-w-md">
            <SelectValue :placeholder="t('setting.chooseModel')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="m in modelOptions" :key="m.id" :value="m.id">
              {{ m.id }} (~{{ m.credits_per_1k_tokens_est }} credits / 1k tok)
            </SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      <div class="space-y-3">
        <div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <Label class="text-sm">{{ t('setting.llmSteamCloud.recharge') }}</Label>
          <div class="text-sm">
            <span class="text-muted-foreground">{{
              t('setting.llmSteamCloud.rechargeCurrentBalance')
            }}</span>
            <span class="ml-2 font-mono font-semibold tabular-nums">{{ creditsDisplay }}</span>
          </div>
        </div>
        <SteamMtxPackGrid
          :packs="mtxPacks"
          :loading="mtxCatalogLoading"
          :disabled="mtxLoading"
          @select="startPack"
        />
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { settings, setSetting } from '../../utils/settings.js'
import { getMetadocCloudApiBase } from '@common/build-env'
import {
  canInitSteamMtx,
  ensureMetadocSteamCloudJwt,
  MTX_ERR_POLL_TIMEOUT,
  MTX_ERR_STEAM_DECLINED,
  startSteamMtxInit
} from '../../utils/metadoc-cloud-auth'
import SteamMtxPackGrid, {
  type SteamMtxPackRow
} from '@renderer/components/steam/SteamMtxPackGrid.vue'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { FormField } from '@renderer/components/ui/form'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@renderer/components/ui/select'
import { notifyError, notifySuccess } from '../../utils/notify'

const { t } = useI18n()

const credits = ref<number | null>(null)
const loading = ref(false)
const modelsLoading = ref(false)
const mtxLoading = ref(false)
const mtxCatalogLoading = ref(false)
const modelOptions = ref<Array<{ id: string; credits_per_1k_tokens_est: number }>>([])

/** 由 Worker `GET /steam/mtx/catalog` 填充，与 `steam-mtx-items.yaml` 一致 */
const mtxPacks = ref<SteamMtxPackRow[]>([])

const selectedModel = computed(() => settings.metadoc?.selectedModel ?? '')

const creditsDisplay = computed(() => (credits.value === null ? '—' : String(credits.value)))

async function refreshCredits() {
  const base = getMetadocCloudApiBase()
  if (!base) {
    notifyError(t('setting.llmSteamCloud.noCloudUrl'))
    return
  }
  loading.value = true
  try {
    const jwt = await ensureMetadocSteamCloudJwt()
    const res = await fetch(`${base}/user/credits`, {
      headers: { authorization: `Bearer ${jwt}` }
    })
    const j = (await res.json()) as { credits?: number }
    if (!res.ok) {
      throw new Error(String((j as { message?: string }).message || res.status))
    }
    credits.value = typeof j.credits === 'number' ? j.credits : 0
  } catch (e) {
    notifyError(e instanceof Error ? e.message : String(e))
  } finally {
    loading.value = false
  }
}

async function loadMtxCatalog() {
  const base = getMetadocCloudApiBase()
  if (!base) {
    return
  }
  mtxCatalogLoading.value = true
  try {
    const jwt = await ensureMetadocSteamCloudJwt()
    const res = await fetch(`${base}/steam/mtx/catalog`, {
      headers: { authorization: `Bearer ${jwt}` }
    })
    const j = (await res.json()) as {
      items?: Array<{
        steam_item_id: string
        amount_cents_usd: number
        usd_price: number
        label: string
      }>
    }
    if (!res.ok) {
      throw new Error(String((j as { message?: string }).message || res.status))
    }
    if (!Array.isArray(j.items) || j.items.length === 0) {
      mtxPacks.value = []
      return
    }
    mtxPacks.value = j.items.map((it) => {
      const credits = Number(it.steam_item_id)
      return {
        item_id: String(it.steam_item_id),
        amount_cents: it.amount_cents_usd,
        usd_price: it.usd_price,
        credits_amount: Number.isFinite(credits) ? credits : 0
      }
    })
  } catch (e) {
    notifyError(e instanceof Error ? e.message : String(e))
    mtxPacks.value = []
  } finally {
    mtxCatalogLoading.value = false
  }
}

async function loadModels() {
  const base = getMetadocCloudApiBase()
  if (!base) {
    return
  }
  modelsLoading.value = true
  try {
    const jwt = await ensureMetadocSteamCloudJwt()
    const res = await fetch(`${base}/cloud/models`, {
      headers: { authorization: `Bearer ${jwt}` }
    })
    const j = (await res.json()) as {
      models?: Array<{ id: string; credits_per_1k_tokens_est: number }>
    }
    if (res.ok && Array.isArray(j.models)) {
      modelOptions.value = j.models
      if (!selectedModel.value && j.models.length > 0) {
        await onModelChange(j.models[0].id)
      }
    }
  } catch {
    /* ignore */
  } finally {
    modelsLoading.value = false
  }
}

async function onModelChange(v: string | undefined) {
  if (!v) {
    return
  }
  if (typeof settings.metadoc !== 'object' || settings.metadoc === null) {
    settings.metadoc = { selectedModel: '', enableMaxTokens: false, maxTokens: 4096 }
  }
  settings.metadoc.selectedModel = v
  await setSetting('metadocSelectedModel', v)
}

async function claimFirstPurchase() {
  const base = getMetadocCloudApiBase()
  if (!base) {
    return
  }
  try {
    const jwt = await ensureMetadocSteamCloudJwt()
    const res = await fetch(`${base}/user/first-purchase-claim`, {
      method: 'POST',
      headers: { authorization: `Bearer ${jwt}` }
    })
    const j = (await res.json()) as { credits_added?: number; already_granted?: boolean }
    if (res.ok && j.credits_added && j.credits_added > 0) {
      notifySuccess(t('setting.llmSteamCloud.firstPurchaseGranted', { n: j.credits_added }))
      await refreshCredits()
    }
  } catch {
    /* optional */
  }
}

async function startPack(p: SteamMtxPackRow) {
  if (!(await canInitSteamMtx())) {
    notifyError(t('setting.llmSteamCloud.rechargeNeedsSteam'))
    return
  }
  mtxLoading.value = true
  try {
    const r = await startSteamMtxInit({
      item_id: p.item_id,
      amount_cents: p.amount_cents,
      currency: 'USD',
      language: typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'en'
    })
    if (r.used_browser) {
      notifySuccess(
        t('setting.llmSteamCloud.mtxWebCredited', {
          n: r.credits_added ?? 0,
          order: r.order_id
        })
      )
    } else {
      notifySuccess(t('setting.llmSteamCloud.mtxInitOk', { order: r.order_id }))
    }
  } catch (e) {
    if (e instanceof Error && e.message === MTX_ERR_STEAM_DECLINED) {
      notifyError(t('setting.llmSteamCloud.mtxSteamAuthFailed'))
    } else if (e instanceof Error && e.message === MTX_ERR_POLL_TIMEOUT) {
      notifyError(t('setting.llmSteamCloud.mtxPollTimeout'))
    } else {
      notifyError(e instanceof Error ? e.message : String(e))
    }
  } finally {
    mtxLoading.value = false
  }
}

onMounted(async () => {
  await loadModels()
  await loadMtxCatalog()
  await refreshCredits()
  await claimFirstPurchase()
})
</script>
