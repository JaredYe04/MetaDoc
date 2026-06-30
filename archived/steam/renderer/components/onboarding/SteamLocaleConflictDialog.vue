<template>
  <Dialog :open="open" @update:open="onOpenUpdate">
    <DialogContent class="max-w-lg sm:max-w-lg steam-locale-dialog">
      <DialogHeader>
        <DialogTitle class="text-base leading-snug">
          {{ titleZh }}
        </DialogTitle>
        <DialogTitle class="text-base font-normal leading-snug text-muted-foreground">
          {{ titleEn }}
        </DialogTitle>
      </DialogHeader>
      <div class="space-y-3 text-sm">
        <p class="leading-relaxed">{{ bodyZh }}</p>
        <p class="leading-relaxed text-muted-foreground">{{ bodyEn }}</p>
      </div>
      <DialogFooter class="flex-col gap-2 sm:flex-col sm:space-x-0">
        <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button type="button" variant="default" class="w-full sm:w-auto" @click="choose(steamLocale)">
            {{ buttonLabel(steamLocale) }}
          </Button>
          <Button type="button" variant="secondary" class="w-full sm:w-auto" @click="choose(appLocale)">
            {{ buttonLabel(appLocale) }}
          </Button>
        </div>
        <p class="text-xs leading-relaxed text-muted-foreground">{{ footnoteZh }}</p>
        <p class="text-xs leading-relaxed text-muted-foreground">{{ footnoteEn }}</p>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { METADOC_LOCALE_NATIVE_LABEL } from '@common/steam-game-language'
import messageBridge from '@renderer/bridge/message-bridge'

defineProps<{
  open: boolean
  steamLocale: string
  appLocale: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  resolved: []
}>()

const titleZh = 'Steam 启动语言与 MetaDoc 已保存的界面语言不一致'
const titleEn =
  'Steam launch language differs from the interface language saved in MetaDoc'

const bodyZh =
  '请在下方选择一种语言作为本应用之后的界面语言。选择后，MetaDoc 会立即切换并保存该设置。'
const bodyEn =
  'Choose one language below as the interface language from now on. MetaDoc will switch immediately and save this setting.'

const footnoteZh =
  '说明：Steam 客户端中「库 → 右键游戏 → 属性 → 语言」由 Steam 管理，游戏无法通过接口直接改写。若希望今后从 Steam 启动时默认即为某一语言，请在 Steam 属性中将游戏语言设为与所选一致。'
const footnoteEn =
  'Note: The per-game language in Steam (Library → right-click → Properties → Language) is managed by the Steam client; games cannot change it via API. For future Steam launches to match your choice, set the same language there.'

function buttonLabel(code: string): string {
  return METADOC_LOCALE_NATIVE_LABEL[code] ?? code
}

function onOpenUpdate(v: boolean) {
  emit('update:open', v)
}

async function choose(locale: string) {
  const r = await messageBridge.invoke('steam:startup-locale:choose', { locale })
  if (r && typeof r === 'object' && 'ok' in r && r.ok === true) {
    emit('update:open', false)
    emit('resolved')
  }
}
</script>
