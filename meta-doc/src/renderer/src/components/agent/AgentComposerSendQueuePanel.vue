<template>
  <div v-if="queue.length > 0" class="agent-composer-send-queue">
    <div class="agent-composer-send-queue__head">
      <span class="agent-composer-send-queue__title">{{ t('agent.composer.sendQueueTitle') }}</span>
      <span class="agent-composer-send-queue__count">{{ queue.length }}</span>
    </div>
    <p class="agent-composer-send-queue__hint">{{ t('agent.composer.sendQueueHint') }}</p>
    <ul class="agent-composer-send-queue__list">
      <li v-for="(item, index) in queue" :key="item.id" class="agent-composer-send-queue__item">
        <div class="agent-composer-send-queue__body">
          <span class="agent-composer-send-queue__text" :title="item.markdown">{{
            preview(item.markdown)
          }}</span>
          <span v-if="item.referenceSnapshot?.length" class="agent-composer-send-queue__refs">
            {{ t('agent.composer.sendQueueAttachments', { count: item.referenceSnapshot.length }) }}
          </span>
        </div>
        <div class="agent-composer-send-queue__actions">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="h-7 w-7 shrink-0"
            :title="t('agent.composer.sendQueueEdit')"
            @click="openEdit(item)"
          >
            <Pencil class="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="h-7 w-7 shrink-0 text-destructive"
            :title="t('agent.composer.sendQueueRemove')"
            @click="removeAt(index)"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </Button>
        </div>
      </li>
    </ul>

    <Dialog v-model:open="editOpen">
      <DialogContent class="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{{ t('agent.composer.sendQueueEditTitle') }}</DialogTitle>
        </DialogHeader>
        <Textarea v-model="editDraft" :rows="8" class="w-full font-mono text-sm" />
        <DialogFooter>
          <Button variant="ghost" @click="editOpen = false">{{ t('common.cancel') }}</Button>
          <Button @click="confirmEdit">{{ t('common.confirm') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Pencil, Trash2 } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import type { ComposerSendQueueItem } from '../../types/agent'

const props = defineProps<{
  queue: ComposerSendQueueItem[]
}>()

const emit = defineEmits<{
  (e: 'update:queue', next: ComposerSendQueueItem[]): void
}>()

const { t } = useI18n()

const editOpen = ref(false)
const editDraft = ref('')
const editingId = ref<string | null>(null)

function preview(md: string): string {
  const s = (md || '').replace(/\s+/g, ' ').trim()
  return s.length > 120 ? `${s.slice(0, 120)}…` : s
}

function openEdit(item: ComposerSendQueueItem) {
  editingId.value = item.id
  editDraft.value = item.markdown
  editOpen.value = true
}

function confirmEdit() {
  const id = editingId.value
  if (!id) {
    editOpen.value = false
    return
  }
  const text = editDraft.value.trim()
  if (!text) {
    editOpen.value = false
    return
  }
  const next = props.queue.map((it) => (it.id === id ? { ...it, markdown: text } : it))
  emit('update:queue', next)
  editOpen.value = false
  editingId.value = null
}

function removeAt(index: number) {
  const next = props.queue.filter((_, i) => i !== index)
  emit('update:queue', next)
}

watch(editOpen, (open) => {
  if (!open) {
    editingId.value = null
  }
})
</script>

<style scoped>
.agent-composer-send-queue {
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--el-border-color-lighter, rgba(0, 0, 0, 0.08));
  background: var(--el-fill-color-blank, rgba(0, 0, 0, 0.02));
  font-size: 13px;
}

.agent-composer-send-queue__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.agent-composer-send-queue__title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.agent-composer-send-queue__count {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--el-fill-color-dark, rgba(0, 0, 0, 0.06));
  color: var(--el-text-color-secondary);
}

.agent-composer-send-queue__hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.agent-composer-send-queue__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agent-composer-send-queue__item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color-extra-light, rgba(0, 0, 0, 0.06));
}

.agent-composer-send-queue__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.agent-composer-send-queue__text {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--el-text-color-primary);
}

.agent-composer-send-queue__refs {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.agent-composer-send-queue__actions {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
}
</style>
