<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import WorkspaceTabs from '../components/workspace/WorkspaceTabs.vue';
import { activeTabId, tabs, useWorkspace } from '../stores/workspace';
import eventBus from '../utils/event-bus';
import WorkspaceTabPane from '../components/workspace/WorkspaceTabPane.vue';
import { ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';

const {
  activateTab,
  ensureDocument,
  removeTab,
  updateDocumentDirty,
  openNewDocumentTab,
  moveTab,
  saveAllDocuments,
} = useWorkspace();

const { t } = useI18n();

const isSavingAll = ref(false);
const handleTabChange = (id: string) => {
  activateTab(id);
};

const handleTabReorder = ({ fromId, toId }: { fromId: string; toId: string }) => {
  moveTab(fromId, toId);
};

const handleCloseTab = async (id: string) => {
  const doc = ensureDocument(id);
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
  removeTab(id);
};

const handleNewDocumentRequest = () => {
  openNewDocumentTab();
};

const performSaveAll = async () => {
  if (isSavingAll.value) {
    return { saved: [] as string[], failed: [] as string[] };
  }
  isSavingAll.value = true;
  try {
    const result = await saveAllDocuments();
    if (result.failed.length === 0) {
      eventBus.emit('show-success', t('main.notification.saveAllSuccess'));
    } else if (result.saved.length > 0) {
      eventBus.emit(
        'show-warning',
        t('main.notification.saveAllPartial', { count: result.failed.length }),
      );
    } else {
      eventBus.emit('show-warning', t('main.notification.saveAllNone'));
    }
    return result;
  } finally {
    isSavingAll.value = false;
  }
};

const handleSaveAllRequest = async () => {
  await performSaveAll();
};

const handleSaveAllAndQuit = async () => {
  const result = await performSaveAll();
  if (result.failed.length === 0) {
    eventBus.emit('quit');
  }
};

const handleCloseActiveTabRequest = () => {
  handleCloseTab(activeTabId.value);
};


onMounted(() => {
  eventBus.on('new-doc', handleNewDocumentRequest);
  eventBus.on('save-all', handleSaveAllRequest);
  eventBus.on('save-all-and-quit', handleSaveAllAndQuit);
  eventBus.on('close-active-tab', handleCloseActiveTabRequest);
});

onBeforeUnmount(() => {
  eventBus.off('new-doc', handleNewDocumentRequest);
  eventBus.off('save-all', handleSaveAllRequest);
  eventBus.off('save-all-and-quit', handleSaveAllAndQuit);
  eventBus.off('close-active-tab', handleCloseActiveTabRequest);
});
</script>

<template>
  <div class="workspace-editor-layout">
    <WorkspaceTabs
      closable
      @update:activeId="handleTabChange"
      @close="handleCloseTab"
      @reorder="handleTabReorder"
    />
    <div class="workspace-editor-content">
      <KeepAlive>
        <WorkspaceTabPane
          v-for="tab in tabs"
          :key="tab.id"
          v-show="tab.id === activeTabId"
          :tab="tab"
          :active="tab.id === activeTabId"
        />
      </KeepAlive>
      <el-empty
        v-if="!tabs.length"
        class="workspace-editor-empty"
        description="暂无打开的文档"
      />
    </div>
  </div>
</template>

<style scoped>
.workspace-editor-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.workspace-editor-content {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.workspace-editor-empty {
  margin-top: 48px;
}
</style>