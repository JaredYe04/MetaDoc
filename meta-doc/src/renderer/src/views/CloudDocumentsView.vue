<template>
  <div class="cloud-docs-page p-6" :style="pageStyle">
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div>
        <h1 class="text-xl font-semibold">{{ t('steamCloudDocs.title') }}</h1>
        <p class="text-sm text-muted-foreground mt-1">{{ t('steamCloudDocs.subtitle') }}</p>
      </div>
      <Button variant="outline" size="sm" :disabled="loading" @click="refresh">
        {{ loading ? t('steamCloudDocs.loading') : t('steamCloudDocs.refresh') }}
      </Button>
    </div>

    <div v-if="errorMsg" class="text-sm text-destructive mb-3">{{ errorMsg }}</div>

    <div class="mb-4 space-y-2 rounded-lg border p-4" :style="cardBorderStyle">
      <div class="text-sm font-medium">{{ t('steamCloudDocs.usage') }}</div>
      <Progress :model-value="usagePercent" class="h-2" />
      <div class="text-xs text-muted-foreground">
        {{ formatBytes(stats.docsBytes) }} / {{ formatBytes(quotaHintBytes) }}（{{
          t('steamCloudDocs.usageHint')
        }}）
      </div>
    </div>

    <div class="flex gap-2 mb-4">
      <Button size="sm" @click="openNewDialog">{{ t('steamCloudDocs.newDoc') }}</Button>
    </div>

    <div class="rounded-md border" :style="cardBorderStyle">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{{ t('steamCloudDocs.colTitle') }}</TableHead>
            <TableHead class="w-[120px]">{{ t('steamCloudDocs.colSize') }}</TableHead>
            <TableHead class="w-[160px]">{{ t('steamCloudDocs.colUpdated') }}</TableHead>
            <TableHead class="w-[200px] text-right">{{ t('steamCloudDocs.colActions') }}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="it in items" :key="it.id">
            <TableCell class="font-medium">{{ it.title }}</TableCell>
            <TableCell class="text-muted-foreground text-sm">{{
              formatBytes(it.sizeBytes)
            }}</TableCell>
            <TableCell class="text-muted-foreground text-sm">{{
              formatDate(it.updatedAt)
            }}</TableCell>
            <TableCell class="text-right space-x-1">
              <Button size="sm" variant="ghost" @click="openEdit(it)">{{
                t('common.edit')
              }}</Button>
              <Button size="sm" variant="ghost" @click="openRename(it)">{{
                t('steamCloudDocs.rename')
              }}</Button>
              <Button size="sm" variant="ghost" class="text-destructive" @click="remove(it)">
                {{ t('common.delete') }}
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <div
        v-if="!loading && items.length === 0"
        class="p-8 text-center text-sm text-muted-foreground"
      >
        {{ t('steamCloudDocs.empty') }}
      </div>
    </div>

    <Dialog :open="editorOpen" @update:open="(v) => (editorOpen = v)">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{
            editingId ? t('steamCloudDocs.edit') : t('steamCloudDocs.newDoc')
          }}</DialogTitle>
        </DialogHeader>
        <div class="space-y-3 py-2">
          <div>
            <Label>{{ t('steamCloudDocs.colTitle') }}</Label>
            <Input v-model="formTitle" class="mt-1" />
          </div>
          <div>
            <Label>{{ t('steamCloudDocs.body') }}</Label>
            <Textarea v-model="formBody" class="mt-1 min-h-[200px] font-mono text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="editorOpen = false">{{
            t('messageBox.cancel')
          }}</Button>
          <Button :disabled="saving" @click="saveEditor">{{ t('common.save') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="renameOpen" @update:open="(v) => (renameOpen = v)">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('steamCloudDocs.rename') }}</DialogTitle>
        </DialogHeader>
        <Input v-model="renameTitle" class="my-2" />
        <DialogFooter>
          <Button variant="outline" @click="renameOpen = false">{{
            t('messageBox.cancel')
          }}</Button>
          <Button :disabled="saving" @click="confirmRename">{{ t('messageBox.confirm') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Textarea } from '@renderer/components/ui/textarea'
import { Progress } from '@renderer/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { themeState } from '../utils/themes'
import {
  steamCloudDocsDelete,
  steamCloudDocsGet,
  steamCloudDocsList,
  steamCloudDocsPut,
  steamCloudDocsRename,
  steamCloudDocsStats,
  type SteamCloudDocItem
} from '../services/steam-client'
import { notifyError, notifySuccess } from '../utils/notify'
import { messageBox } from '../utils/messageBox'

const { t } = useI18n()

/** 展示用参考配额（Steam 实际配额以合作伙伴后台为准） */
const QUOTA_HINT_BYTES = 100 * 1024 * 1024

const loading = ref(false)
const saving = ref(false)
const errorMsg = ref('')
const items = ref<SteamCloudDocItem[]>([])
const stats = ref({ docsBytes: 0, itemCount: 0 })

const editorOpen = ref(false)
const editingId = ref<string | null>(null)
const formTitle = ref('')
const formBody = ref('')

const renameOpen = ref(false)
const renameId = ref<string | null>(null)
const renameTitle = ref('')

const pageStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const cardBorderStyle = computed(() => ({
  borderColor: themeState.currentTheme.borderColor
}))

const usagePercent = computed(() =>
  Math.min(100, Math.round((stats.value.docsBytes / QUOTA_HINT_BYTES) * 100))
)

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ''
  }
}

async function refresh() {
  loading.value = true
  errorMsg.value = ''
  try {
    const [lr, sr] = await Promise.all([steamCloudDocsList(), steamCloudDocsStats()])
    if (!lr.success) {
      items.value = []
      errorMsg.value = lr.error || 'list failed'
      return
    }
    items.value = lr.data?.items ?? []
    if (sr.success && sr.data) {
      stats.value = { docsBytes: sr.data.docsBytes, itemCount: sr.data.itemCount }
    }
  } finally {
    loading.value = false
  }
}

function openNewDialog() {
  editingId.value = null
  formTitle.value = ''
  formBody.value = ''
  editorOpen.value = true
}

async function openEdit(it: SteamCloudDocItem) {
  const gr = await steamCloudDocsGet(it.id)
  if (!gr.success) {
    notifyError(gr.error || t('steamCloudDocs.loadFailed'))
    return
  }
  editingId.value = it.id
  formTitle.value = gr.data?.title ?? it.title
  formBody.value = gr.data?.body ?? ''
  editorOpen.value = true
}

async function saveEditor() {
  saving.value = true
  try {
    const pr = await steamCloudDocsPut({
      id: editingId.value ?? undefined,
      title: formTitle.value,
      body: formBody.value
    })
    if (!pr.success) {
      notifyError(pr.error || t('steamCloudDocs.saveFailed'))
      return
    }
    notifySuccess(t('steamCloudDocs.saveOk'))
    editorOpen.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

function openRename(it: SteamCloudDocItem) {
  renameId.value = it.id
  renameTitle.value = it.title
  renameOpen.value = true
}

async function confirmRename() {
  if (!renameId.value) return
  saving.value = true
  try {
    const rr = await steamCloudDocsRename(renameId.value, renameTitle.value)
    if (!rr.success) {
      notifyError(rr.error || t('steamCloudDocs.saveFailed'))
      return
    }
    renameOpen.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

async function remove(it: SteamCloudDocItem) {
  try {
    await messageBox.confirm(
      t('steamCloudDocs.deleteConfirm', { name: it.title }),
      t('common.delete'),
      {
        confirmButtonText: t('messageBox.confirm'),
        cancelButtonText: t('messageBox.cancel'),
        type: 'warning'
      }
    )
  } catch {
    return
  }
  const dr = await steamCloudDocsDelete(it.id)
  if (!dr.success) {
    notifyError(dr.error || t('steamCloudDocs.saveFailed'))
    return
  }
  notifySuccess(t('steamCloudDocs.deleted'))
  await refresh()
}

onMounted(() => {
  void refresh()
})
</script>
