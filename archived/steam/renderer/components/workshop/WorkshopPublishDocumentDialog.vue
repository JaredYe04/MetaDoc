<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent class="max-w-xl max-h-[min(90vh,720px)] flex flex-col p-0">
      <DialogHeader class="px-6 pt-6 pb-2 shrink-0">
        <DialogTitle>{{ t('workshopPublish.title') }}</DialogTitle>
      </DialogHeader>
      <div class="min-h-0 flex-1 overflow-hidden px-6 pb-2">
        <el-scrollbar class="workshop-publish-dlg-scroll max-h-[min(60vh,520px)]">
          <div class="space-y-4 pr-2 pb-4">
            <p class="text-sm text-muted-foreground m-0">{{ t('workshopPublish.subtitle') }}</p>

            <div class="space-y-2">
              <Label
                >{{ t('workshopPublish.defaultLocale') }}: {{ defaultLocaleDisplayName }}</Label
              >
            </div>

            <div class="space-y-2">
              <Label>{{ t('steamCloudDocs.colTitle') }}（{{ defaultLocaleDisplayName }}）</Label>
              <Input v-model="title" />
            </div>
            <div class="space-y-2">
              <Label
                >{{ t('newDocument.templateTitle') }} —
                {{ t('workshopPublish.description') }}</Label
              >
              <Input v-model="description" />
            </div>
            <div class="space-y-2">
              <Label>{{ t('steamCloudDocs.body') }}</Label>
              <Textarea v-model="content" class="min-h-[160px] font-mono text-sm" />
            </div>

            <div class="rounded-md border border-border p-3 space-y-2">
              <div class="font-medium text-sm">{{ t('workshopPublish.optionalEn') }}</div>
              <Input v-model="enTitle" :placeholder="t('steamCloudDocs.colTitle') + ' (en)'" />
              <Input
                v-model="enDescription"
                :placeholder="t('workshopPublish.description') + ' (en)'"
              />
              <Textarea
                v-model="enContent"
                class="min-h-[100px] font-mono text-sm"
                placeholder="en content"
              />
            </div>

            <div class="space-y-2">
              <Label>{{ t('workshopPublish.thumbnail') }}</Label>
              <Input type="file" accept="image/*" @change="onThumb" />
            </div>
          </div>
        </el-scrollbar>
      </div>
      <div class="flex justify-end gap-2 border-t px-6 py-4 shrink-0">
        <Button variant="outline" :disabled="publishing" @click="onOpenChange(false)">
          {{ t('common.cancel') }}
        </Button>
        <Button :disabled="publishing" @click="publish">
          {{ publishing ? t('workshopPublish.publishing') : t('workshopPublish.submit') }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Textarea } from '@renderer/components/ui/textarea'
import { workshopPublishDocumentTemplate } from '@renderer/services/steam-client'
import { notifyError, notifySuccess } from '@renderer/utils/notify'
import { getUserTemplateById } from '@renderer/stores/user-templates'
import {
  workshopPublishDocumentDialogOpen,
  workshopPublishDocumentDialogOpenNonce,
  workshopPublishDocumentDialogPresetUserTemplateId
} from '@renderer/utils/workshop-publish-document-dialog'

const { t, locale } = useI18n()

const open = workshopPublishDocumentDialogOpen

const title = ref('')
const description = ref('')
const content = ref('')
const enTitle = ref('')
const enDescription = ref('')
const enContent = ref('')
const thumbBase64 = ref<string | undefined>(undefined)
const publishing = ref(false)

const defaultLocaleId = computed(() =>
  String(locale.value || 'zh_CN')
    .replace(/-/g, '_')
    .toLowerCase()
)

const defaultLocaleDisplayName = computed(() => {
  const id = defaultLocaleId.value
  const key = `workshopPublish.localeNames.${id}`
  const translated = t(key)
  return translated !== key ? translated : id
})

function clearForm() {
  title.value = ''
  description.value = ''
  content.value = ''
  enTitle.value = ''
  enDescription.value = ''
  enContent.value = ''
  thumbBase64.value = undefined
}

function applyPresetFromStore() {
  const id = workshopPublishDocumentDialogPresetUserTemplateId.value?.trim()
  if (!id) {
    clearForm()
    return
  }
  const rec = getUserTemplateById(id)
  if (!rec) {
    notifyError(t('workshopPublish.templateNotFound'))
    clearForm()
    return
  }
  title.value = rec.title
  description.value = rec.description ?? ''
  content.value = rec.content ?? ''
}

watch(
  [open, workshopPublishDocumentDialogOpenNonce],
  () => {
    if (!open.value) return
    applyPresetFromStore()
  },
  { flush: 'post' }
)

function onOpenChange(v: boolean) {
  workshopPublishDocumentDialogOpen.value = v
  if (!v) {
    publishing.value = false
  }
}

function onThumb(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    thumbBase64.value = undefined
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    thumbBase64.value = typeof reader.result === 'string' ? reader.result : undefined
  }
  reader.readAsDataURL(file)
}

async function publish() {
  publishing.value = true
  try {
    const loc = defaultLocaleId.value
    const locales: Record<string, { title: string; description: string; content: string }> = {
      [loc]: {
        title: title.value.trim() || 'Untitled',
        description: description.value.trim(),
        content: content.value
      }
    }
    if (enTitle.value.trim() || enContent.value.trim()) {
      locales.en_us = {
        title: enTitle.value.trim() || enTitle.value,
        description: enDescription.value.trim(),
        content: enContent.value
      }
    }
    const manifest = {
      schemaVersion: 1,
      kind: 'document_template' as const,
      defaultLocale: loc,
      locales,
      thumbnail: {
        source: thumbBase64.value ? 'custom' : 'generated',
        file: 'thumbnail.png'
      }
    }
    const pr = await workshopPublishDocumentTemplate({
      manifest,
      thumbnailBase64: thumbBase64.value
    })
    if (!pr.success) {
      notifyError(pr.error || t('workshopPublish.failed'))
      return
    }
    notifySuccess(t('workshopPublish.ok', { id: pr.data?.publishedFileId ?? '' }))
    onOpenChange(false)
  } catch (e) {
    notifyError(e instanceof Error ? e.message : String(e))
  } finally {
    publishing.value = false
  }
}
</script>

<style scoped>
.workshop-publish-dlg-scroll {
  width: 100%;
}
.workshop-publish-dlg-scroll :deep(.el-scrollbar__wrap) {
  max-height: min(60vh, 520px);
}
</style>
