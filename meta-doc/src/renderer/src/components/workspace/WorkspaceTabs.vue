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
          draggable="true"
          @dragstart="handleDragStart(tab.id, $event)"
          @dragover="handleDragOver"
          @drop="handleDrop(tab.id)"
          @dragend="handleDragEnd"
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
import { computed } from 'vue';
import { useWorkspace, type WorkspaceTab } from '../../stores/workspace';

const props = defineProps({
  closable: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits<{
  (event: 'update:activeId', id: string): void;
  (event: 'close', id: string): void;
  (event: 'reorder', payload: { fromId: string; toId: string }): void;
}>();

const workspace = useWorkspace();
const tabs = computed(() => [...workspace.tabs]);

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
  get: () => workspace.activeTabId.value,
  set: (value: string) => {
    if (value !== workspace.activeTabId.value) {
      workspace.activateTab(value);
      emit('update:activeId', value);
    }
  },
});

const handleRemove = (id: string | number) => {
  emit('close', String(id));
};

let draggingId: string | null = null;

const handleDragStart = (id: string, event: DragEvent) => {
  draggingId = id;
  event.dataTransfer?.setData('text/plain', id);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
};

const handleDragOver = (event: DragEvent) => {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
};

const handleDrop = (id: string) => {
  if (draggingId && draggingId !== id) {
    emit('reorder', { fromId: draggingId, toId: id });
  }
  draggingId = null;
};

const handleDragEnd = () => {
  draggingId = null;
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
  user-select: none;
  cursor: grab;
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


