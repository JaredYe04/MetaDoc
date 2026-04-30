<template>
  <Card class="mb-6">
    <CardHeader>
      <CardTitle>{{ t('setting.llmSteamCloud.title') }}</CardTitle>
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
          :disabled="modelsLoading || modelOptionsRaw.length === 0"
          @update:model-value="onModelChange"
        >
          <SelectTrigger class="w-full max-w-md">
            <SelectValue :placeholder="t('setting.chooseModel')" />
          </SelectTrigger>
          <SelectContent class="max-w-md">
            <div
              class="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5"
              @pointerdown.stop
            >
              <span class="shrink-0 text-[11px] text-muted-foreground">{{
                t('setting.llmSteamCloud.sortByPrice')
              }}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-[11px]"
                :class="{ 'bg-muted': modelPriceSortOrder === 'asc' }"
                @click="setModelPriceSortOrder('asc')"
              >
                {{ t('setting.llmSteamCloud.sortPriceAsc') }}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-[11px]"
                :class="{ 'bg-muted': modelPriceSortOrder === 'desc' }"
                @click="setModelPriceSortOrder('desc')"
              >
                {{ t('setting.llmSteamCloud.sortPriceDesc') }}
              </Button>
            </div>
            <SelectItem v-for="m in modelOptionsSorted" :key="m.id" :value="m.id">
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
        <div class="flex items-center justify-start gap-2">
          <Button
            size="sm"
            variant="outline"
            :disabled="inventoryLoading"
            @click="refreshStoreStatus"
          >
            {{ t('setting.llmSteamCloud.refreshStoreStatus') }}
          </Button>
        </div>
        <div
          v-if="purchasePromptVisible"
          class="rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm"
        >
          <div class="font-medium">{{ t('setting.llmSteamCloud.purchaseDetectedTitle') }}</div>
          <div class="mt-1 text-xs text-muted-foreground">
            {{ t('setting.llmSteamCloud.purchaseDetectedDesc') }}
          </div>
          <div class="mt-2 flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" @click="openPurchasedInventory">{{
              t('setting.llmSteamCloud.viewInventory')
            }}</Button>
            <Button size="sm" @click="usePurchasedNow">{{ t('setting.llmSteamCloud.useNow') }}</Button>
          </div>
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <div class="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div class="mb-2 text-sm font-medium">{{ t('setting.llmSteamCloud.packSectionTitle') }}</div>
            <SteamMtxPackGrid
              :packs="mtxPacks"
              :loading="mtxCatalogLoading"
              :disabled="mtxLoading"
              @select="startPack"
            />
          </div>
          <div class="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div class="mb-2 text-sm font-medium">{{ t('setting.llmSteamCloud.inventorySectionTitle') }}</div>
            <div v-if="inventoryLoading" class="text-xs text-muted-foreground">{{ t('common.loading') }}</div>
            <div v-else-if="inventoryCards.length === 0" class="text-xs text-muted-foreground">
              {{ t('setting.llmSteamCloud.inventoryEmpty') }}
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="card in inventoryCards"
                :key="card.item_instance_id"
                class="flex items-center justify-between rounded-md border border-border/40 px-2 py-1.5"
              >
                <div class="min-w-0">
                  <div class="truncate text-xs font-medium">{{ card.label }}</div>
                  <div class="text-[11px] text-muted-foreground">
                    +{{ card.credits_on_redeem }} credits · x{{ card.quantity }}
                  </div>
                </div>
                <Button
                  size="sm"
                  :disabled="redeemingItemId === card.item_instance_id"
                  @click="redeemCard(card.item_instance_id)"
                >
                  {{
                    redeemingItemId === card.item_instance_id
                      ? t('common.loading')
                      : t('setting.llmSteamCloud.redeemAction')
                  }}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
  <AlertDialog v-model:open="redeemConfirmOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('setting.llmSteamCloud.redeemConfirmTitle') }}</AlertDialogTitle>
        <AlertDialogDescription>{{
          t('setting.llmSteamCloud.redeemConfirmBody')
        }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction @click="confirmRedeemCard">{{
          t('setting.llmSteamCloud.confirmUse')
        }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  readStoredSteamCloudPriceSortOrder,
  sortSteamCloudModelsByPrice,
  writeStoredSteamCloudPriceSortOrder,
  type SteamCloudModelRow
} from '../../utils/steam-cloud-models-display'
import { useI18n } from 'vue-i18n'
import { settings, setSetting } from '../../utils/settings.js'
import { getMetadocCloudApiBase } from '@common/build-env'
import {
  canInitSteamMtx,
  ensureMetadocSteamCloudJwt,
  fetchSteamInventoryCards,
  redeemSteamInventoryCard,
  startSteamStorePurchaseAndSync,
  syncSteamStorePurchases,
  type SteamInventoryCard
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog-shadcn'
import { notifyError, notifySuccess } from '../../utils/notify'

const { t } = useI18n()

const credits = ref<number | null>(null)
const loading = ref(false)
const modelsLoading = ref(false)
const mtxLoading = ref(false)
const mtxCatalogLoading = ref(false)
const modelOptionsRaw = ref<SteamCloudModelRow[]>([])
const modelPriceSortOrder = ref<'asc' | 'desc'>(readStoredSteamCloudPriceSortOrder())
const modelOptionsSorted = computed(() =>
  sortSteamCloudModelsByPrice(modelOptionsRaw.value, modelPriceSortOrder.value)
)

function setModelPriceSortOrder(order: 'asc' | 'desc') {
  modelPriceSortOrder.value = order
  writeStoredSteamCloudPriceSortOrder(order)
}

/** 由 Worker `GET /steam/mtx/catalog` 填充，与 `steam-mtx-items.yaml` 一致 */
const mtxPacks = ref<SteamMtxPackRow[]>([])
const inventoryCards = ref<SteamInventoryCard[]>([])
const inventoryLoading = ref(false)
const redeemingItemId = ref<string | null>(null)
const redeemConfirmOpen = ref(false)
const pendingRedeemItemId = ref<string | null>(null)
const purchasePromptItemDefId = ref<string | null>(null)
const purchasePromptVisible = ref(false)

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
        subtitle?: string
        cny_price?: number
        credits_on_redeem?: number
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
      const credits = typeof it.credits_on_redeem === 'number' ? it.credits_on_redeem : Number(it.steam_item_id)
      return {
        item_id: String(it.steam_item_id),
        amount_cents: it.amount_cents_usd,
        usd_price: it.usd_price,
        cny_price: typeof it.cny_price === 'number' ? it.cny_price : undefined,
        credits_amount: Number.isFinite(credits) ? Math.trunc(credits) : 0,
        label: String(it.label || `${Math.max(0, Math.trunc(credits))} Credit Pack`),
        subtitle: typeof it.subtitle === 'string' ? it.subtitle : undefined
      }
    })
  } catch (e) {
    notifyError(e instanceof Error ? e.message : String(e))
    mtxPacks.value = []
  } finally {
    mtxCatalogLoading.value = false
  }
}

async function refreshInventoryCards() {
  inventoryLoading.value = true
  try {
    inventoryCards.value = await fetchSteamInventoryCards()
  } catch (e) {
    notifyError(e instanceof Error ? e.message : String(e))
    inventoryCards.value = []
  } finally {
    inventoryLoading.value = false
  }
}

async function refreshStoreStatus() {
  inventoryLoading.value = true
  try {
    await syncSteamStorePurchases()
    await Promise.all([refreshCredits(), refreshInventoryCards()])
    notifySuccess(t('setting.llmSteamCloud.storeStatusRefreshed'))
  } catch (e) {
    notifyError(e instanceof Error ? e.message : String(e))
  } finally {
    inventoryLoading.value = false
  }
}

async function redeemCard(itemInstanceId: string) {
  pendingRedeemItemId.value = itemInstanceId
  redeemConfirmOpen.value = true
}

async function confirmRedeemCard() {
  const itemInstanceId = pendingRedeemItemId.value
  if (!itemInstanceId) return
  redeemConfirmOpen.value = false
  redeemingItemId.value = itemInstanceId
  try {
    const r = await redeemSteamInventoryCard(itemInstanceId)
    notifySuccess(
      t('setting.llmSteamCloud.mtxWebCredited', { n: r.credits_added, order: `redeem:${itemInstanceId}` })
    )
    await Promise.all([refreshCredits(), refreshInventoryCards()])
  } catch (e) {
    notifyError(e instanceof Error ? e.message : String(e))
  } finally {
    redeemingItemId.value = null
    pendingRedeemItemId.value = null
  }
}

async function onPurchaseDetected(itemDefId: string) {
  purchasePromptItemDefId.value = itemDefId
  purchasePromptVisible.value = true
  await refreshInventoryCards()
}

async function openPurchasedInventory() {
  purchasePromptVisible.value = false
  await refreshInventoryCards()
  notifySuccess(t('setting.llmSteamCloud.inventoryRefreshedHint'))
}

async function usePurchasedNow() {
  const itemDefId = purchasePromptItemDefId.value
  if (!itemDefId) {
    notifyError(t('setting.llmSteamCloud.missingPurchasedTier'))
    return
  }
  await refreshInventoryCards()
  const card = inventoryCards.value.find((x) => String(x.itemdefid) === String(itemDefId))
  if (!card) {
    notifyError(t('setting.llmSteamCloud.purchasedCardNotFound'))
    return
  }
  purchasePromptVisible.value = false
  await redeemCard(card.item_instance_id)
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
      modelOptionsRaw.value = j.models
      if (!selectedModel.value && j.models.length > 0) {
        const first = sortSteamCloudModelsByPrice(j.models, 'asc')[0]
        if (first) {
          await onModelChange(first.id)
        }
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
    const r = await startSteamStorePurchaseAndSync({
      item_id: p.item_id,
      onPurchaseDetected: ({ item_id }) => {
        void onPurchaseDetected(String(item_id))
      }
    })
    notifySuccess(t('setting.llmSteamCloud.openedSteamPurchasePage', { order: r.order_id }))
    await refreshInventoryCards()
  } catch (e) {
    notifyError(e instanceof Error ? e.message : String(e))
  } finally {
    mtxLoading.value = false
  }
}

onMounted(async () => {
  await loadModels()
  await loadMtxCatalog()
  await refreshCredits()
  await refreshInventoryCards()
  await claimFirstPurchase()
})
</script>
