<template>
  <div class="workspace-tabs-wrapper" :class="{ 'is-locked': isLocked }">
    <el-tabs
      v-model="currentActiveId"
      type="card"
      class="workspace-tabs"
      @tab-remove="handleRemove"
      :before-leave="handleBeforeLeave"
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
      
      <el-tab-pane
        :key="ADD_TAB_ID"
        :name="ADD_TAB_ID"
        :closable="false"
        class="workspace-tab-pane workspace-tab-pane--add"
      >
        <template #label>
          <el-tooltip :content="t('home.tabActions.title')" placement="bottom">
            <div class="workspace-tab-label workspace-tab-label--plus">
              <Plus />
            </div>
          </el-tooltip>
        </template>
      </el-tab-pane>

    </el-tabs>
    <el-tabs
      v-model="currentActiveId"
      type="card"
      class="workspace-tabs"
      @tab-remove="handleRemove"
      closable
      :before-leave="handleBeforeLeave"
    >
  </el-tabs>
  </div>

  <el-dialog
    v-model="addDialogVisible"
    :title="t('home.tabActions.title')"
    width="360px"
    append-to-body
    :close-on-click-modal="false"
  >
    <div class="workspace-tabs__dialog-actions">
      <el-tooltip :content="t('home.tabActions.new')" placement="bottom">
        <el-button
          circle
          size="large"
          @click="handleAddSelect('new')"
        >
          <el-icon>
            <DocumentAdd />
          </el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip :content="t('home.tabActions.open')" placement="bottom">
        <el-button
          circle
          size="large"
          @click="handleAddSelect('open')"
        >
          <el-icon>
            <FolderAdd />
          </el-icon>
        </el-button>
      </el-tooltip>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { useWorkspace, type WorkspaceTab } from '../../stores/workspace';
import eventBus from '../../utils/event-bus';
import { Plus, DocumentAdd, FolderAdd } from '@element-plus/icons-vue';

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
const ADD_TAB_ID = '__workspace_add_tab__';

const tabs = computed(() => [...workspace.tabs]);
const { t } = useI18n();
const addDialogVisible = ref(false);
const isLocked = computed(() => workspace.uiLocked?.value === true);

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
    if (isLocked.value) return;
    if (value !== workspace.activeTabId.value) {
      workspace.activateTab(value);
      emit('update:activeId', value);
    }
  },
});

const handleRemove = async (id: string | number) => {
  if (isLocked.value) return;
  const tabId = String(id);
  const doc = workspace.ensureDocument?.(tabId);

  if (doc?.dirty) {
    try {
      await ElMessageBox.confirm(
        t('main.dialogs.closeTabMessage'),
        t('main.dialogs.closeTabTitle'),
        {
          type: 'warning',
          confirmButtonText: t('main.dialogs.closeTabConfirm'),
          cancelButtonText: t('main.dialogs.closeTabCancel'),
        },
      );
    } catch {
      return;
    }
  }

  emit('close', tabId);
};

let draggingId: string | null = null;

const handleDragStart = (id: string, event: DragEvent) => {
  if (isLocked.value) {
    event.preventDefault();
    return;
  }
  draggingId = id;
  event.dataTransfer?.setData('text/plain', id);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
};

const handleDragOver = (event: DragEvent) => {
  if (isLocked.value) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
};

const handleDrop = (id: string) => {
  if (isLocked.value) return;
  if (draggingId && draggingId !== id) {
    emit('reorder', { fromId: draggingId, toId: id });
  }
  draggingId = null;
};

const handleDragEnd = () => {
  draggingId = null;
};

const handleAddClick = () => {
  if (isLocked.value) return;
  addDialogVisible.value = true;
};

const handleBeforeLeave = (nextName?: string, _currentName?: string) => {
  if (isLocked.value) return false;
  if (nextName === ADD_TAB_ID) {
    handleAddClick();
    return false;
  }
  return true;
};

const handleAddSelect = (action: 'new' | 'open') => {
  addDialogVisible.value = false;
  if (action === 'new') {
    eventBus.emit('new-doc');
  } else {
    eventBus.emit('open-doc');
  }
};
</script>

<style scoped>
.workspace-tabs-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
}

.workspace-tabs {
  flex: 1;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.workspace-tabs-wrapper.is-locked {
  cursor: not-allowed;
  opacity: 0.9;
}
.workspace-tabs-wrapper.is-locked :deep(.el-tabs__item) {
  pointer-events: none;
  cursor: not-allowed !important;
  opacity: 0.6;
}
.workspace-tabs-wrapper.is-locked :deep(.el-tabs__nav-wrap .el-icon-close) {
  pointer-events: none;
  opacity: 0.4;
}
.workspace-tabs-wrapper.is-locked :deep(.workspace-tab-label) {
  cursor: not-allowed;
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

.workspace-tabs__add {
  min-width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.workspace-tabs__dialog-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.workspace-tab-label--plus {
  width: 13px;
  height: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--el-text-color-primary);
  gap: 0;
}

.workspace-tab-label--plus:hover {
  color: var(--el-color-primary);
}

.workspace-tabs :deep(.workspace-tab-pane--add .el-tabs__item .el-icon-close),
.workspace-tabs :deep(.workspace-tab-pane--add .el-icon-close) {
  display: none !important;
}
</style>



