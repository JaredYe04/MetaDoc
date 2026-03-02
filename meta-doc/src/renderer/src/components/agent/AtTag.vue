<template>
  <span
    class="at-tag"
    contenteditable="false"
    :data-at-value="rawValue"
    @click="handleClick"
  >
    <span class="at-tag-label">{{ label }}</span>
    <button
      type="button"
      class="at-tag-remove"
      :title="t('agent.composer.atTagRemove', '移除')"
      @click.stop="handleRemove"
    >
      <X class="at-tag-remove-icon" />
    </button>
  </span>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import eventBus from '../../utils/event-bus.js'

const props = defineProps<{
  rawValue: string
  label: string
}>()

const emit = defineEmits<{
  (e: 'remove'): void
}>()

const { t } = useI18n()

function handleClick() {
  if (!props.rawValue) return
  if (props.rawValue.startsWith('tab:')) {
    const tabId = props.rawValue.slice(4)
    eventBus.emit('workspace-open-document', { tabId })
  } else {
    eventBus.emit('workspace-open-document', { path: props.rawValue })
  }
}

function handleRemove() {
  emit('remove')
}
</script>

<style scoped>
.at-tag {
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

.at-tag:hover {
  background: var(--el-fill-color, rgba(0, 0, 0, 0.08));
}

.at-tag-label {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.at-tag-remove {
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

.at-tag:hover .at-tag-remove {
  display: inline-flex;
}

.at-tag-remove:hover {
  background: var(--el-fill-color-dark, rgba(0, 0, 0, 0.12));
  color: var(--el-text-color-primary);
}

.at-tag-remove-icon {
  width: 10px;
  height: 10px;
}
</style>
