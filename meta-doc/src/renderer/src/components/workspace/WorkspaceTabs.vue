<template>
  <el-tabs
    v-model="currentActiveId"
    type="card"
    class="workspace-tabs"
    @tab-remove="handleRemove"
    closable
  >
    <el-tab-pane
      v-for="tab in tabs"
      :key="tab.id"
      :name="tab.id"
      :closable="closable && !tab.readonly"
    >
      <template #label>
        <div
          class="workspace-tab-label"
          :title="tooltipLabel(tab)"
          @mousedown.stop
        >
          <span class="workspace-tab-label__primary">
            {{ primaryLabel(tab) }}
          </span>
          <span
            v-if="tab.dirty"
            class="workspace-tab-label__dot"
          />
        </div>
      </template>
    </el-tab-pane>
  </el-tabs>
</template>

<script setup lang="ts">
import type { PropType } from 'vue';
import { computed } from 'vue';
import type { WorkspaceTab } from '../../stores/workspace';

const props = defineProps({
  tabs: {
    type: Array as PropType<WorkspaceTab[]>,
    required: true,
  },
  activeId: {
    type: String,
    default: '',
  },
  closable: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits<{
  (event: 'update:activeId', id: string): void;
  (event: 'close', id: string): void;
}>();

const primaryLabel = (tab: WorkspaceTab) => {
  return tab.subtitle?.trim() || tab.title?.trim() || '未命名文档';
};

const tooltipLabel = (tab: WorkspaceTab) => {
  const primary = primaryLabel(tab);
  const secondary = tab.title?.trim();
  if (!secondary || secondary === primary) {
    return primary;
  }
  return secondary ? `${primary} — ${secondary}` : primary;
};

const currentActiveId = computed({
  get: () => props.activeId,
  set: (value: string) => {
    if (value !== props.activeId) {
      emit('update:activeId', value);
    }
  },
});

const handleRemove = (id: string | number) => {
  emit('close', String(id));
};
</script>

<style scoped>
.workspace-tabs {
  padding: 0 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.workspace-tab-label {
  display: flex;
  align-items: center;
  gap: 4px;
  line-height: 1.2;
  max-width: 180px;
  white-space: nowrap;
}

.workspace-tab-label__primary {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-tab-label__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--el-color-danger);
}

.workspace-tabs :deep(.el-tabs__header.is-top) {
  margin: 0;
}

.workspace-tabs :deep(.el-tabs__item) {
  padding: 0 12px !important;
  height: 32px;
  line-height: 32px;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.workspace-tabs :deep(.el-tabs__nav-wrap) {
  margin-bottom: 0;
}

.workspace-tabs :deep(.el-tabs__item.is-active) {
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  border-radius: 6px 6px 0 0;
  font-weight: 600;
}

.workspace-tabs :deep(.el-tabs__item:not(.is-active):hover) {
  background-color: var(--el-fill-color-light);
}
</style>


