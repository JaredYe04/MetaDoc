<template>
  <div class="workshop-market flex min-h-0 flex-1 flex-col" :style="pageStyle">
    <div class="workshop-header shrink-0">
      <h1 class="workshop-title">{{ t('workshop.centerTitle') }}</h1>
      <div class="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" :disabled="loading" @click="refresh">
          {{ loading ? t('workshop.loading') : t('workshop.refresh') }}
        </Button>
        <Button variant="outline" size="sm" disabled :title="t('workshop.syncSubscribedHint')">
          {{ t('workshop.syncSubscribed') }}
        </Button>
      </div>
    </div>

    <div
      class="workshop-hub-bar mt-3 flex max-w-full shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <ToggleGroup
        v-model="hubSegment"
        type="single"
        class="justify-start rounded-md border border-border bg-muted/30 p-1"
      >
        <ToggleGroupItem value="browse" class="px-3 py-1.5 text-sm data-[state=on]:bg-background">
          {{ t('workshop.segmentBrowse') }}
        </ToggleGroupItem>
        <ToggleGroupItem value="mine" class="px-3 py-1.5 text-sm data-[state=on]:bg-background">
          {{ t('workshop.segmentMine') }}
        </ToggleGroupItem>
      </ToggleGroup>
      <Button
        v-if="hubSegment === 'mine'"
        variant="secondary"
        size="sm"
        class="shrink-0 self-start sm:self-auto"
        @click="openPublishDialog"
      >
        {{ t('workshop.publishFromApp') }}
      </Button>
    </div>

    <div v-if="hubSegment === 'browse'" class="mt-4 shrink-0 text-sm text-muted-foreground">
      {{ t('workshop.browsePlaceholder') }}
    </div>

    <div v-else class="workshop-mine mt-3 flex min-h-0 flex-1 flex-col gap-3">
      <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          v-model="searchQuery"
          class="max-w-full sm:max-w-xs"
          :placeholder="t('workshop.filterSearch')"
        />
        <Collapsible v-model:open="filtersExpanded">
          <CollapsibleTrigger as-child hide-icon>
            <Button variant="outline" size="sm" type="button">
              {{ t('workshop.filtersToggle') }}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent
            class="mt-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground"
          >
            {{ t('workshop.filtersComingSoon') }}
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div v-if="searchQuery.trim()" class="flex flex-wrap gap-2">
        <Badge variant="secondary" class="gap-1 font-normal">
          <span>{{ t('workshop.filterSearch') }}: {{ searchQuery }}</span>
          <button
            type="button"
            class="ml-1 rounded-sm opacity-70 hover:opacity-100"
            :aria-label="t('common.close')"
            @click="searchQuery = ''"
          >
            ×
          </button>
        </Badge>
      </div>

      <p class="m-0 max-w-3xl shrink-0 text-sm text-muted-foreground">
        {{ t('workshop.description') }}
      </p>
      <div v-if="errorMsg" class="shrink-0 text-sm text-destructive">{{ errorMsg }}</div>

      <div
        class="workshop-split flex min-h-0 flex-1 gap-0 overflow-hidden rounded-lg border border-border"
      >
        <ScrollArea class="workshop-split-left min-h-0 min-w-0 flex-1 basis-[70%]">
          <div class="workshop-card-grid p-4">
            <div
              v-if="!loading && filteredItems.length === 0"
              class="text-sm text-muted-foreground"
            >
              {{ searchQuery.trim() ? t('workshop.emptyFiltered') : t('workshop.empty') }}
            </div>
            <div
              v-for="it in filteredItems"
              :key="it.publishedFileId"
              class="workshop-card"
              :class="{ 'is-selected': selected?.publishedFileId === it.publishedFileId }"
              :style="cardStyle"
              @click="selectItem(it)"
            >
              <div class="workshop-card-thumb" :class="{ 'is-placeholder': !cardThumbUrl(it) }">
                <img v-if="cardThumbUrl(it)" :src="cardThumbUrl(it)!" :alt="it.title" />
                <Package v-else class="workshop-card-thumb-icon" />
              </div>
              <div class="workshop-card-body">
                <h3 class="workshop-card-title">{{ it.title || it.publishedFileId }}</h3>
                <p v-if="it.description" class="workshop-card-desc line-clamp-2">
                  {{ it.description }}
                </p>
              </div>
              <div class="workshop-card-footer" @click.stop>
                <Button
                  size="sm"
                  class="w-full"
                  :disabled="syncingId === it.publishedFileId || !it.file"
                  @click="subscribeAndSync(it)"
                >
                  {{
                    syncingId === it.publishedFileId
                      ? t('workshop.subscribeSyncing')
                      : t('workshop.subscribeSync')
                  }}
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div
          class="workshop-split-right flex min-h-0 min-w-0 flex-[0_0_30%] flex-col border-l border-border bg-muted/20"
        >
          <div
            class="workshop-detail-thumb shrink-0 basis-[40%] min-h-[120px] border-b border-border"
          >
            <img
              v-if="detailThumbUrl"
              :src="detailThumbUrl"
              alt=""
              class="h-full w-full object-contain bg-background/80"
            />
            <div
              v-else
              class="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground"
            >
              <PictureIcon class="h-12 w-12 opacity-50" />
              <span class="px-2 text-center text-xs">{{ t('workshop.previewPlaceholder') }}</span>
            </div>
          </div>
          <ScrollArea class="min-h-0 flex-1 basis-[60%]">
            <div v-if="!selected" class="p-4 text-sm text-muted-foreground">
              {{ t('workshop.detailPickHint') }}
            </div>
            <div v-else class="space-y-3 p-4 text-sm">
              <div>
                <div class="text-xs font-medium text-muted-foreground">
                  {{ t('steamCloudDocs.colTitle') }}
                </div>
                <div class="font-medium">{{ selected.title || selected.publishedFileId }}</div>
              </div>
              <div v-if="selected.description">
                <div class="text-xs font-medium text-muted-foreground">
                  {{ t('workshopPublish.description') }}
                </div>
                <div class="whitespace-pre-wrap text-muted-foreground">
                  {{ selected.description }}
                </div>
              </div>
              <div>
                <div class="text-xs font-medium text-muted-foreground">
                  {{ t('workshop.fieldAuthor') }}
                </div>
                <div class="font-mono text-xs">{{ selected.steamIDOwner || '—' }}</div>
              </div>
              <div>
                <div class="text-xs font-medium text-muted-foreground">
                  {{ t('workshop.fieldUpdated') }}
                </div>
                <div>{{ formatUnix(selected.timeUpdated) }}</div>
              </div>
              <div>
                <div class="text-xs font-medium text-muted-foreground">
                  {{ t('workshop.fieldCreated') }}
                </div>
                <div>{{ formatUnix(selected.timeCreated) }}</div>
              </div>
              <div>
                <div class="text-xs font-medium text-muted-foreground">
                  {{ t('workshop.fieldSubscribed') }}
                </div>
                <div>{{ formatUnix(selected.timeAddedToUserList) }}</div>
              </div>
              <div v-if="selected.tags?.trim()">
                <div class="text-xs font-medium text-muted-foreground">
                  {{ t('workshop.fieldTags') }}
                </div>
                <div class="flex flex-wrap gap-1">
                  <Badge
                    v-for="(tag, i) in tagList(selected.tags)"
                    :key="i"
                    variant="outline"
                    class="text-xs font-normal"
                  >
                    {{ tag }}
                  </Badge>
                </div>
              </div>
              <div>
                <div class="text-xs font-medium text-muted-foreground">
                  {{ t('workshop.fieldType') }}
                </div>
                <div>{{ ugcKindLabel }}</div>
              </div>
              <div v-if="selected.fileName">
                <div class="text-xs font-medium text-muted-foreground">
                  {{ t('workshop.fieldFile') }}
                </div>
                <div class="break-all font-mono text-xs">{{ selected.fileName }}</div>
              </div>
              <div class="text-xs text-muted-foreground">ID: {{ selected.publishedFileId }}</div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Package, Image as PictureIcon } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { themeState } from '../utils/themes'
import {
  listSubscribedWorkshop,
  pullAndSyncWorkshopItem,
  workshopDefaultInstallRoot,
  workshopReadManifestFromDir,
  type WorkshopSubscribedItem
} from '../services/steam-client'
import { notifyError, notifySuccess } from '../utils/notify'
import { refreshUserTemplatesFromMain } from '../stores/user-templates'
import { openWorkshopPublishDocumentDialog } from '../utils/workshop-publish-document-dialog'

const { t } = useI18n()

const hubSegment = ref<'browse' | 'mine'>('mine')
const searchQuery = ref('')
const filtersExpanded = ref(false)

const loading = ref(false)
const items = ref<WorkshopSubscribedItem[]>([])
const errorMsg = ref('')
const selected = ref<WorkshopSubscribedItem | null>(null)
const syncingId = ref<string | null>(null)
const detailManifest = ref<Record<string, unknown> | null>(null)
/** 本地已解析的 manifest 根目录（用于缩略图 file://） */
const detailContentDir = ref<string | null>(null)
const localContentByPublishedId = ref<Record<string, string>>({})
const manifestByPublishedId = ref<Record<string, Record<string, unknown>>>({})

const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((it) => {
    const title = (it.title || '').toLowerCase()
    const desc = (it.description || '').toLowerCase()
    return (
      title.includes(q) || desc.includes(q) || String(it.publishedFileId).toLowerCase().includes(q)
    )
  })
})

const pageStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const cardStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  borderColor: `${themeState.currentTheme.textColor2}33`
}))

const ugcKindLabel = computed(() => {
  const k = detailManifest.value?.kind
  if (k === 'document_template') return t('workshop.kindDocumentTemplate')
  if (typeof k === 'string' && k) return k
  return t('workshop.kindUnknown')
})

const detailThumbUrl = computed(() => {
  const m = detailManifest.value
  const dir = detailContentDir.value
  if (!m || !dir) return ''
  const thumb = (m.thumbnail as { file?: string } | undefined)?.file || 'thumbnail.png'
  const base = dir.replace(/[/\\]+$/, '')
  const sep = dir.includes('\\') ? '\\' : '/'
  const abs = `${base}${sep}${String(thumb).replace(/^[/\\]+/, '')}`
  return filePathToFileUrl(abs)
})

function filePathToFileUrl(absPath: string): string {
  const normalized = absPath.replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(normalized)) {
    return 'file:///' + encodeURI(normalized)
  }
  return 'file://' + encodeURI(normalized)
}

function cardThumbUrl(it: WorkshopSubscribedItem): string | null {
  const dir = localContentByPublishedId.value[it.publishedFileId]
  if (!dir) return null
  const m = manifestByPublishedId.value[it.publishedFileId]
  if (!m) return null
  const thumb = (m.thumbnail as { file?: string } | undefined)?.file || 'thumbnail.png'
  const base = dir.replace(/[/\\]+$/, '')
  const sep = dir.includes('\\') ? '\\' : '/'
  return filePathToFileUrl(`${base}${sep}${String(thumb).replace(/^[/\\]+/, '')}`)
}

function formatUnix(ts: number): string {
  if (!ts) return '—'
  try {
    return new Date(ts * 1000).toLocaleString()
  } catch {
    return '—'
  }
}

function tagList(tags: string): string[] {
  return tags
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function joinInstallPath(root: string, id: string): string {
  const sep = root.includes('\\') ? '\\' : '/'
  return `${root.replace(/[/\\]+$/, '')}${sep}${id}`
}

function openPublishDialog() {
  openWorkshopPublishDocumentDialog()
}

function selectItem(it: WorkshopSubscribedItem) {
  selected.value = it
}

async function tryLoadLocalManifestForSelected() {
  detailManifest.value = null
  detailContentDir.value = null
  const it = selected.value
  if (!it) return
  const cached = localContentByPublishedId.value[it.publishedFileId]
  if (cached) {
    const mr = await workshopReadManifestFromDir(cached)
    if (mr.success && mr.data?.manifest) {
      const resDir = mr.data.resolvedDir || cached
      detailContentDir.value = resDir
      detailManifest.value = mr.data.manifest as Record<string, unknown>
      manifestByPublishedId.value = {
        ...manifestByPublishedId.value,
        [it.publishedFileId]: mr.data.manifest as Record<string, unknown>
      }
      localContentByPublishedId.value = {
        ...localContentByPublishedId.value,
        [it.publishedFileId]: resDir
      }
    }
    return
  }
  const rr = await workshopDefaultInstallRoot()
  if (!rr.success || !rr.data?.path) return
  const base = joinInstallPath(rr.data.path, it.publishedFileId)
  const mr = await workshopReadManifestFromDir(base)
  if (mr.success && mr.data?.manifest) {
    const resDir = mr.data.resolvedDir || base
    detailManifest.value = mr.data.manifest as Record<string, unknown>
    detailContentDir.value = resDir
    manifestByPublishedId.value = {
      ...manifestByPublishedId.value,
      [it.publishedFileId]: mr.data.manifest as Record<string, unknown>
    }
    localContentByPublishedId.value = {
      ...localContentByPublishedId.value,
      [it.publishedFileId]: resDir
    }
  }
}

watch(selected, () => {
  void tryLoadLocalManifestForSelected()
})

async function refresh() {
  loading.value = true
  errorMsg.value = ''
  try {
    const r = await listSubscribedWorkshop()
    if (!r.success) {
      items.value = []
      errorMsg.value = r.error || ''
      return
    }
    items.value = r.data?.items ?? []
    if (selected.value) {
      const still = items.value.find((x) => x.publishedFileId === selected.value!.publishedFileId)
      selected.value = still || null
    }
    void tryLoadLocalManifestForSelected()
  } finally {
    loading.value = false
  }
}

async function subscribeAndSync(it: WorkshopSubscribedItem) {
  if (!it.file) {
    notifyError(t('workshop.missingFileHandle'))
    return
  }
  syncingId.value = it.publishedFileId
  try {
    const r = await pullAndSyncWorkshopItem({
      publishedFileId: it.publishedFileId,
      ugcFileHandle: it.file
    })
    if (!r.success) {
      notifyError(r.error || t('workshop.subscribeSyncFailed'))
      return
    }
    const contentDir = r.data?.contentDir
    if (contentDir) {
      localContentByPublishedId.value = {
        ...localContentByPublishedId.value,
        [it.publishedFileId]: contentDir
      }
      detailContentDir.value = contentDir
    }
    await refreshUserTemplatesFromMain()
    notifySuccess(t('workshop.subscribeSyncOk'))
    selected.value = it
    const mr = contentDir
      ? await workshopReadManifestFromDir(contentDir)
      : { success: false as const, data: undefined }
    if (mr.success && mr.data?.manifest) {
      detailManifest.value = mr.data.manifest as Record<string, unknown>
      manifestByPublishedId.value = {
        ...manifestByPublishedId.value,
        [it.publishedFileId]: mr.data.manifest as Record<string, unknown>
      }
    }
  } catch (e) {
    notifyError(e instanceof Error ? e.message : String(e))
  } finally {
    syncingId.value = null
  }
}

onMounted(() => {
  void refresh()
})
</script>

<style scoped>
.workshop-market {
  padding: 16px 20px 20px;
  box-sizing: border-box;
}
.workshop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.workshop-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}
.workshop-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  align-content: start;
}
.workshop-card {
  display: flex;
  flex-direction: column;
  border: 1px solid;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition:
    border-color 0.2s,
    box-shadow 0.2s,
    transform 0.2s;
  min-height: 220px;
}
.workshop-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}
.workshop-card.is-selected {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 0;
}
.workshop-card-thumb {
  position: relative;
  height: 120px;
  overflow: hidden;
  background: hsl(var(--muted));
}
.workshop-card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.workshop-card-thumb.is-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
}
.workshop-card-thumb-icon {
  width: 40px;
  height: 40px;
  opacity: 0.45;
}
.workshop-card-body {
  flex: 1;
  padding: 12px 14px;
  min-height: 0;
}
.workshop-card-title {
  margin: 0 0 6px;
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.35;
}
.workshop-card-desc {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.4;
  opacity: 0.85;
}
.workshop-card-footer {
  padding: 8px 10px 12px;
  border-top: 1px solid hsl(var(--border) / 0.6);
}
.workshop-split {
  min-height: 360px;
}
.workshop-split-left :deep([data-radix-scroll-area-viewport]) {
  max-height: calc(100vh - 220px);
}
.workshop-split-right :deep([data-radix-scroll-area-viewport]) {
  max-height: calc((100vh - 220px) * 0.55);
}
</style>
