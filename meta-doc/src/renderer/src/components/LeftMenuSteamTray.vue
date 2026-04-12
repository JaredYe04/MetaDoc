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
          <span v-else class="left-menu-steam-fallback">S</span>
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
            <div v-else class="left-menu-steam-fallback-lg shrink-0">S</div>
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

          <div class="mt-3 text-xs font-medium text-muted-foreground">
            {{ t('leftMenu.steamTrayAchievements', '本游戏成就') }}
          </div>
          <ul class="mt-1.5 space-y-1 max-h-40 overflow-y-auto text-sm">
            <li
              v-for="row in achievementRows"
              :key="row.id"
              class="flex items-center justify-between gap-2 py-0.5"
            >
              <span class="truncate">{{ achievementLabel(row.id) }}</span>
              <span :class="row.achieved ? 'text-emerald-600' : 'text-muted-foreground'">
                {{ row.achieved ? '✓' : '—' }}
              </span>
            </li>
          </ul>

          <div class="mt-3 flex flex-col gap-2">
            <Button variant="outline" size="sm" class="w-full" @click="openProfileOverlay">
              {{ t('leftMenu.steamOpenProfileOverlay', '在 Steam 中查看资料…') }}
            </Button>
            <Button variant="outline" size="sm" class="w-full" @click="openAchievementsOverlay">
              {{ t('leftMenu.steamOpenAchievementsOverlay', '在 Steam 中查看成就…') }}
            </Button>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PopoverRoot, PopoverTrigger, PopoverPortal } from 'reka-ui'
import { PopoverContent } from '@renderer/components/ui/popover'
import { Button } from '@renderer/components/ui/button'
import {
  getSteamAvatar,
  getSteamStatus,
  getSteamUser,
  listLocalSteamAchievements,
  openSteamOverlayToUser,
  type SteamLocalAchievementRow,
  type SteamUserPayload
} from '../services/steam-client'

const props = defineProps<{
  collapsed: boolean
}>()

const { t } = useI18n()

const steamReady = ref(false)
const user = ref<SteamUserPayload | null>(null)
const avatarUrl = ref<string | null>(null)
const achievementRows = ref<SteamLocalAchievementRow[]>([])
const open = ref(false)

const ACH_LABEL_KEYS: Record<string, string> = {
  FIRST_DOC: 'leftMenu.steamAchFirstDoc',
  AI_100: 'leftMenu.steamAchAi100',
  EXPORT_PDF: 'leftMenu.steamAchExportPdf'
}

function achievementLabel(id: string) {
  const key = ACH_LABEL_KEYS[id]
  if (key) {
    return t(key, id)
  }
  return id
}

async function refreshSteamState() {
  const st = await getSteamStatus()
  if (!st.success || !st.data?.initialized) {
    steamReady.value = false
    user.value = null
    avatarUrl.value = null
    achievementRows.value = []
    return
  }
  const u = await getSteamUser()
  if (!u.success || !u.data) {
    steamReady.value = false
    return
  }
  steamReady.value = true
  user.value = u.data
}

async function loadAvatar() {
  const r = await getSteamAvatar()
  if (r.success && r.data?.avatarUrl) {
    avatarUrl.value = r.data.avatarUrl
  } else {
    avatarUrl.value = null
  }
}

async function loadAchievements() {
  const r = await listLocalSteamAchievements()
  achievementRows.value = r.success && r.data?.items ? r.data.items : []
}

async function openProfileOverlay() {
  await openSteamOverlayToUser('steamid')
}

async function openAchievementsOverlay() {
  await openSteamOverlayToUser('achievements')
}

watch(open, (v) => {
  if (v) {
    void loadAchievements()
  }
})

onMounted(() => {
  void refreshSteamState().then(() => {
    if (steamReady.value) {
      void loadAvatar()
    }
  })
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
