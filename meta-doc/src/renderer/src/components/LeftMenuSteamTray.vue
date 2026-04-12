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

          <div class="mt-3 space-y-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 text-sm">
            <div class="flex justify-between gap-2">
              <span class="text-muted-foreground">{{ t('leftMenu.steamStatPlaytime', '累计使用时长') }}</span>
              <span class="font-medium tabular-nums">{{ playtimeLabel }}</span>
            </div>
            <div class="flex justify-between gap-2">
              <span class="text-muted-foreground">{{ t('leftMenu.steamStatAiRequests', 'AI 调用次数') }}</span>
              <span class="font-medium tabular-nums">{{ summary?.aiRequests ?? 0 }}</span>
            </div>
            <div class="flex justify-between gap-2">
              <span class="text-muted-foreground">{{ t('leftMenu.steamStatChars', '累计输入字符') }}</span>
              <span class="font-medium tabular-nums">{{ summary?.charsTyped ?? 0 }}</span>
            </div>
          </div>

          <div class="mt-3 flex flex-col gap-2">
            <Button variant="outline" size="sm" class="w-full" @click="openProfileOverlay">
              {{ t('leftMenu.steamOpenProfileOverlay', '打开个人资料') }}
            </Button>
            <Button variant="outline" size="sm" class="w-full" @click="openAchievementsOverlay">
              {{ t('leftMenu.steamOpenAchievementsOverlay', '查看成就') }}
            </Button>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PopoverRoot, PopoverTrigger, PopoverPortal } from 'reka-ui'
import { PopoverContent } from '@renderer/components/ui/popover'
import { Button } from '@renderer/components/ui/button'
import {
  getSteamProfileSummary,
  getSteamStatus,
  openSteamOverlayToUser,
  type SteamProfileSummaryPayload,
  type SteamUserPayload
} from '../services/steam-client'

defineProps<{
  collapsed: boolean
}>()

const { t } = useI18n()

const steamReady = ref(false)
const user = ref<SteamUserPayload | null>(null)
const avatarUrl = ref<string | null>(null)
const summary = ref<Pick<
  SteamProfileSummaryPayload,
  'secondsPlayed' | 'aiRequests' | 'charsTyped'
> | null>(null)
const open = ref(false)

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
    charsTyped: r.data.charsTyped
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
      charsTyped: r.data.charsTyped
    }
  }
}

async function openProfileOverlay() {
  await openSteamOverlayToUser('steamid')
}

async function openAchievementsOverlay() {
  await openSteamOverlayToUser('achievements')
}

watch(open, (v) => {
  if (v) {
    void loadProfileSummaryOnly()
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
