<template>
  <span class="reference-tag" contenteditable="false" :data-ref-id="refId" @click="handleClick">
    <span class="reference-tag-label">{{ label }}</span>
    <button
      type="button"
      class="reference-tag-remove"
      :title="t('agent.reference.tagRemove', '移除引用')"
      @click.stop="handleRemove"
    >
      <X class="reference-tag-remove-icon" />
    </button>
  </span>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import eventBus from '../../utils/event-bus.js'
import type { Reference } from '../../types/agent-framework'

const props = defineProps<{
  refId: string
  label: string
  reference: Reference | null
}>()

const emit = defineEmits<{
  (e: 'remove'): void
}>()

const { t } = useI18n()

function handleClick() {
  if (!props.reference) return
  const meta = props.reference.metadata as { tabId?: string } | undefined
  const tabId = meta?.tabId
  const path =
    typeof props.reference.origin === 'string' && props.reference.origin
      ? props.reference.origin
      : ''
  if (tabId) {
    eventBus.emit('workspace-open-document', { tabId })
  } else if (path) {
    eventBus.emit('workspace-open-document', { path })
  }
}

function handleRemove() {
  emit('remove')
}
</script>

<style scoped>
.reference-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 4px 1px 6px;
  margin: 0 2px;
  font-size: 12px;
  line-height: 1.3;
  border-radius: 4px;
  background: var(--el-fill-color-light, rgba(0, 0, 0, 0.06));
  color: var(--el-text-color-primary);
  cursor: pointer;
  user-select: none;
  vertical-align: baseline;
  border: 1px solid var(--el-border-color-lighter, rgba(0, 0, 0, 0.08));
}

.reference-tag:hover {
  background: var(--el-fill-color, rgba(0, 0, 0, 0.08));
}

.reference-tag-label {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reference-tag-remove {
  display: none;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  margin-left: 2px;
  border: none;
  border-radius: 2px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}

.reference-tag:hover .reference-tag-remove {
  display: inline-flex;
}

.reference-tag-remove:hover {
  background: var(--el-fill-color-dark, rgba(0, 0, 0, 0.12));
  color: var(--el-text-color-primary);
}

.reference-tag-remove-icon {
  width: 10px;
  height: 10px;
}
</style>
