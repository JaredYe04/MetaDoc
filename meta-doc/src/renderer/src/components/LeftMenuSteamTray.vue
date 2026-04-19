<template>
  <div v-if="steamReady" class="left-menu-steam-tray" :class="{ 'is-collapsed': collapsed }">
    <PopoverRoot v-model:open="open">
      <PopoverTrigger as-child>
        <button
          type="button"
          class="left-menu-steam-trigger"
          :title="t('leftMenu.steamTrayTooltip', 'Steam')"
          :aria-label="t('leftMenu.steamTrayTooltip', 'Steam')"
        >
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            alt=""
            class="left-menu-steam-avatar"
            width="28"
            height="28"
          />
          <span v-else class="left-menu-steam-fallback">{{ steamAvatarLetter }}</span>
        </button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          class="left-menu-steam-popover z-50 w-[min(18rem,calc(100vw-2rem))] rounded-md border bg-popover p-3 text-popover-foreground shadow-md outline-none"
          side="right"
          align="end"
          :side-offset="8"
        >
          <div class="flex gap-3 items-start">
            <img
              v-if="avatarUrl"
              :src="avatarUrl"
              alt=""
              class="left-menu-steam-avatar-lg shrink-0"
              width="48"
              height="48"
            />
            <div v-else class="left-menu-steam-fallback-lg shrink-0">{{ steamAvatarLetter }}</div>
            <div class="min-w-0 flex-1 space-y-0.5">
              <div class="text-sm font-medium truncate">{{ user?.name }}</div>
              <div class="text-xs text-muted-foreground">
                {{ t('setting.about.steamUserId', 'Steam ID') }}: {{ user?.id }}
              </div>
              <div class="text-xs text-muted-foreground">
                {{ t('leftMenu.steamTrayLevel', '等级') }}: {{ user?.level ?? 0 }}
              </div>
            </div>
          </div>

          <div
            class="mt-3 space-y-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 text-sm"
          >
            <div class="flex justify-between gap-2">
              <span class="text-muted-foreground">{{
                t('leftMenu.steamStatPlaytime', '累计使用时长')
              }}</span>
              <span class="font-medium tabular-nums">{{ playtimeLabel }}</span>
            </div>
            <div class="flex justify-between gap-2">
              <span class="text-muted-foreground">{{
                t('leftMenu.steamStatAiRequests', 'AI 调用次数')
              }}</span>
              <span class="font-medium tabular-nums">{{ summary?.aiRequests ?? 0 }}</span>
            </div>
            <div class="flex justify-between gap-2">
              <span class="text-muted-foreground">{{
                t('leftMenu.steamStatChars', '累计输入字符')
              }}</span>
              <span class="font-medium tabular-nums">{{ summary?.charsTyped ?? 0 }}</span>
            </div>
          </div>

          <div
            class="mt-3 space-y-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 text-sm"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-muted-foreground shrink-0">{{
                t('leftMenu.steamTrayLlmCredits', '账户 Credits 余额')
              }}</span>
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="font-mono font-medium tabular-nums truncate">{{
                  cloudCreditsDisplay
                }}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 px-2 shrink-0 text-xs"
                  :disabled="cloudCreditsLoading || !hasMetadocCloud"
                  @click="refreshCloudCredits"
                >
                  {{ t('leftMenu.steamTrayRefreshCloudCredits', '刷新额度') }}
                </Button>
              </div>
            </div>
            <Button
              v-if="hasMetadocCloud"
              variant="secondary"
              size="sm"
              class="w-full"
              @click="openRechargeDialog"
            >
              {{ t('leftMenu.steamTrayRecharge', '充值') }}
            </Button>
          </div>

          <div class="mt-3 flex flex-col gap-2">
            <Button variant="outline" size="sm" class="w-full" @click="openCloudDocsTab">
              {{ t('leftMenu.steamManageCloudDocs', '管理云存档') }}
            </Button>
            <Button variant="outline" size="sm" class="w-full" @click="openWorkshopHubTab">
              {{ t('leftMenu.steamManageWorkshop', '管理创意工坊') }}
            </Button>
            <Button variant="outline" size="sm" class="w-full" @click="openAchievementsOverlay">
              {{ t('leftMenu.steamOpenAchievementsOverlay', '查看成就') }}
            </Button>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>

    <Dialog v-model:open="rechargeDialogOpen">
      <DialogContent class="sm:max-w-lg" @mousedown.stop>
        <DialogHeader>
          <DialogTitle>{{ t('setting.llmSteamCloud.recharge') }}</DialogTitle>
        </DialogHeader>
        <div
          class="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm flex flex-wrap items-center justify-between gap-2"
        >
          <span class="text-muted-foreground">{{
            t('setting.llmSteamCloud.rechargeCurrentBalance')
          }}</span>
          <span class="font-mono font-semibold tabular-nums">{{ cloudCreditsDisplay }}</span>
        </div>
        <div class="py-2">
          <SteamMtxPackGrid
            :packs="mtxPacks"
            :loading="mtxCatalogLoading"
            :disabled="mtxLoading || !hasMetadocCloud"
            @select="startPack"
          />
        </div>
        <p v-if="mtxCatalogLoading" class="text-xs text-muted-foreground">
          {{ t('common.loading') }}
        </p>
        <p
          v-else-if="hasMetadocCloud && mtxPacks.length === 0"
          class="text-xs text-muted-foreground"
        >
          {{ t('leftMenu.steamTrayMtxCatalogEmpty') }}
        </p>
        <DialogFooter>
          <Button variant="outline" @click="rechargeDialogOpen = false">
            {{ t('common.close') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PopoverRoot, PopoverTrigger, PopoverPortal } from 'reka-ui'
import { PopoverContent } from '@renderer/components/ui/popover'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import SteamMtxPackGrid, {
  type SteamMtxPackRow
} from '@renderer/components/steam/SteamMtxPackGrid.vue'
import { getMetadocCloudApiBase } from '@common/build-env'
import {
  canInitSteamMtx,
  ensureMetadocSteamCloudJwt,
  MTX_ERR_NO_PUBLIC_IP,
  MTX_ERR_POLL_TIMEOUT,
  MTX_ERR_STEAM_DECLINED,
  startSteamMtxInit
} from '../utils/metadoc-cloud-auth'
import { notifyError, notifySuccess } from '../utils/notify'
import {
  getSteamProfileSummary,
  getSteamStatus,
  openSteamOverlayToUser,
  type SteamProfileSummaryPayload,
  type SteamUserPayload
} from '../services/steam-client'
import { focusOrOpenSystemRoute } from '../utils/steam-system-tab-open'

defineProps<{
  collapsed: boolean
}>()

const { t } = useI18n()

const steamReady = ref(false)
const user = ref<SteamUserPayload | null>(null)
const avatarUrl = ref<string | null>(null)
const summary = ref<Pick<
  SteamProfileSummaryPayload,
  'secondsPlayed' | 'aiRequests' | 'charsTyped' | 'focusSeconds'
> | null>(null)
const open = ref(false)

const hasMetadocCloud = computed(() => Boolean(getMetadocCloudApiBase()))
const cloudCredits = ref<number | null>(null)
const cloudCreditsLoading = ref(false)
const rechargeDialogOpen = ref(false)
const mtxLoading = ref(false)
const mtxCatalogLoading = ref(false)

const mtxPacks = ref<SteamMtxPackRow[]>([])

const cloudCreditsDisplay = computed(() => {
  if (!hasMetadocCloud.value) {
    return t('leftMenu.steamTrayCreditsUnavailable')
  }
  if (cloudCredits.value === null) {
    return '—'
  }
  return String(cloudCredits.value)
})

async function refreshCloudCredits() {
  const base = getMetadocCloudApiBase()
  if (!base) {
    return
  }
  cloudCreditsLoading.value = true
  try {
    const jwt = await ensureMetadocSteamCloudJwt()
    const res = await fetch(`${base}/user/credits`, {
      headers: { authorization: `Bearer ${jwt}` }
    })
    const j = (await res.json()) as { credits?: number }
    if (!res.ok) {
      throw new Error(String((j as { message?: string }).message || res.status))
    }
    cloudCredits.value = typeof j.credits === 'number' ? j.credits : 0
  } catch (e) {
    cloudCredits.value = null
    notifyError(e instanceof Error ? e.message : String(e))
  } finally {
    cloudCreditsLoading.value = false
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
      await refreshCloudCredits()
    }
  } catch {
    /* optional */
  }
}

function openRechargeDialog() {
  rechargeDialogOpen.value = true
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
    } else if (r.checkout === 'client') {
      notifySuccess(t('setting.llmSteamCloud.mtxInitOkOverlay', { order: r.order_id }))
    } else {
      notifySuccess(t('setting.llmSteamCloud.mtxInitOk', { order: r.order_id }))
    }
    await refreshCloudCredits()
  } catch (e) {
    if (e instanceof Error && e.message === MTX_ERR_NO_PUBLIC_IP) {
      notifyError(t('setting.llmSteamCloud.mtxNoPublicIp'))
    } else if (e instanceof Error && e.message === MTX_ERR_STEAM_DECLINED) {
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

watch(rechargeDialogOpen, (v) => {
  if (v) {
    void loadMtxCatalog()
    if (hasMetadocCloud.value) {
      void refreshCloudCredits()
    }
  }
})

/** 无头像 URL 时用显示名首字符（与常见头像占位一致）；无名称时用中性占位。 */
function firstLetterFromDisplayName(name: string | undefined): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return '?'
  const first = Array.from(trimmed)[0]
  if (!first) return '?'
  if (/^[a-z]$/u.test(first)) return first.toUpperCase()
  return first
}

const steamAvatarLetter = computed(() => firstLetterFromDisplayName(user.value?.name))

const playtimeLabel = computed(() => formatPlaytime(t, summary.value?.secondsPlayed ?? 0))

function formatPlaytime(
  tr: (key: string, params?: Record<string, string | number>) => string,
  seconds: number
): string {
  const s = Math.max(0, Math.floor(seconds))
  const days = Math.floor(s / 86400)
  if (days >= 1) {
    return tr('leftMenu.steamPlaytimeDays', { n: days })
  }
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) {
    return tr('leftMenu.steamPlaytimeHoursMinutes', { h, m })
  }
  if (m > 0) {
    return tr('leftMenu.steamPlaytimeMinutes', { m })
  }
  return tr('leftMenu.steamPlaytimeSeconds', { s })
}

async function refreshSteamState() {
  const st = await getSteamStatus()
  if (!st.success || !st.data?.initialized) {
    steamReady.value = false
    user.value = null
    avatarUrl.value = null
    summary.value = null
    return
  }
  const r = await getSteamProfileSummary()
  if (!r.success || !r.data) {
    steamReady.value = false
    summary.value = null
    return
  }
  steamReady.value = true
  user.value = r.data.user
  avatarUrl.value = r.data.avatarUrl
  summary.value = {
    secondsPlayed: r.data.secondsPlayed,
    aiRequests: r.data.aiRequests,
    charsTyped: r.data.charsTyped,
    focusSeconds: r.data.focusSeconds
  }
}

async function loadProfileSummaryOnly() {
  const r = await getSteamProfileSummary()
  if (r.success && r.data) {
    user.value = r.data.user
    avatarUrl.value = r.data.avatarUrl
    summary.value = {
      secondsPlayed: r.data.secondsPlayed,
      aiRequests: r.data.aiRequests,
      charsTyped: r.data.charsTyped,
      focusSeconds: r.data.focusSeconds
    }
  }
}

async function openAchievementsOverlay() {
  await openSteamOverlayToUser('achievements')
}

function openCloudDocsTab() {
  open.value = false
  focusOrOpenSystemRoute('/cloud-docs', t('steamCloudDocs.title'))
}

function openWorkshopHubTab() {
  open.value = false
  focusOrOpenSystemRoute('/workshop-market', t('workshop.title'))
}

watch(open, (v) => {
  if (v) {
    void loadProfileSummaryOnly()
    if (getMetadocCloudApiBase()) {
      void refreshCloudCredits()
      void claimFirstPurchase()
    }
  }
})

onMounted(() => {
  void refreshSteamState()
})
</script>

<style scoped>
.left-menu-steam-tray {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 6px 0 8px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
}

.left-menu-steam-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 9999px;
  cursor: pointer;
  outline: none;
}

.left-menu-steam-trigger:focus-visible {
  box-shadow: 0 0 0 2px var(--sidebar-text, #333);
}

.left-menu-steam-avatar {
  border-radius: 9999px;
  object-fit: cover;
  display: block;
}

.left-menu-steam-fallback {
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  background: linear-gradient(135deg, #1b2838, #2a475e);
  color: #c7d5e0;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.left-menu-steam-avatar-lg {
  border-radius: 8px;
  object-fit: cover;
}

.left-menu-steam-fallback-lg {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background: linear-gradient(135deg, #1b2838, #2a475e);
  color: #c7d5e0;
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
