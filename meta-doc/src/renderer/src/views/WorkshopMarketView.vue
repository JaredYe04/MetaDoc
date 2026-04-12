<template>
  <div class="workshop-market" :style="pageStyle">
    <div class="workshop-header">
      <h1 class="workshop-title">{{ $t('workshop.title') }}</h1>
      <Button variant="outline" size="sm" :disabled="loading" @click="refresh">
        {{ loading ? $t('workshop.loading') : $t('workshop.refresh') }}
      </Button>
    </div>
    <p class="workshop-desc text-muted-foreground">{{ $t('workshop.description') }}</p>

    <div v-if="errorMsg" class="workshop-error text-destructive text-sm">{{ errorMsg }}</div>

    <div v-if="!loading && items.length === 0" class="workshop-empty text-muted-foreground">
      {{ $t('workshop.empty') }}
    </div>

    <div v-else class="workshop-list space-y-3">
      <div
        v-for="it in items"
        :key="it.publishedFileId"
        class="workshop-item rounded-lg border p-4"
        :style="itemBorderStyle"
      >
        <div class="font-medium">{{ it.title || it.publishedFileId }}</div>
        <div v-if="it.description" class="text-sm text-muted-foreground mt-1 line-clamp-2">
          {{ it.description }}
        </div>
        <div class="text-xs text-muted-foreground mt-2">ID: {{ it.publishedFileId }}</div>
        <Button class="mt-3" size="sm" :disabled="downloadingId === it.publishedFileId" @click="download(it)">
          {{ downloadingId === it.publishedFileId ? $t('workshop.downloading') : $t('workshop.download') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'
import { themeState } from '../utils/themes'
import messageBridge from '../bridge/message-bridge'
import { downloadWorkshopItem, listSubscribedWorkshop } from '../services/steam-client'
import { notifyError, notifySuccess } from '../utils/notify'

const { t } = useI18n()

const loading = ref(false)
const items = ref<{ publishedFileId: string; title: string; description: string }[]>([])
const errorMsg = ref('')
const downloadingId = ref<string | null>(null)

const pageStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const itemBorderStyle = computed(() => ({
  borderColor: themeState.currentTheme.borderColor
}))

async function refresh() {
  loading.value = true
  errorMsg.value = ''
  try {
    const r = await listSubscribedWorkshop()
    if (!r.success) {
      items.value = []
      errorMsg.value = r.error
      return
    }
    items.value = r.data?.items ?? []
  } finally {
    loading.value = false
  }
}

async function download(it: { publishedFileId: string }) {
  try {
    const pick = (await messageBridge.invoke('show-open-dialog', {
      title: t('workshop.pickFolder'),
      properties: ['openDirectory', 'createDirectory']
    })) as { canceled: boolean; filePaths?: string[] }

    if (pick.canceled || !pick.filePaths?.length) {
      return
    }
    downloadingId.value = it.publishedFileId
    const r = await downloadWorkshopItem(it.publishedFileId, pick.filePaths[0])
    if (r.success) {
      notifySuccess(t('workshop.downloadDone'))
    } else {
      notifyError(r.error || t('workshop.downloadFailed'))
    }
  } catch (e) {
    notifyError(e instanceof Error ? e.message : String(e))
  } finally {
    downloadingId.value = null
  }
}

onMounted(() => {
  void refresh()
})
</script>

<style scoped>
.workshop-market {
  padding: 24px;
  min-height: 100%;
  box-sizing: border-box;
}
.workshop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}
.workshop-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}
.workshop-desc {
  margin-bottom: 16px;
  max-width: 720px;
}
.workshop-list {
  margin-top: 16px;
}
</style>
