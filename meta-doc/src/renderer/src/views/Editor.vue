<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import WorkspaceTabs from '../components/workspace/WorkspaceTabs.vue';
import { useWorkspace } from '../stores/workspace';
import eventBus from '../utils/event-bus';
import WorkspaceTabPane from '../components/workspace/WorkspaceTabPane.vue';
import { ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';

const {
  tabs,
  activeTabId,
  activateTab,
  persistActiveDocument,
  ensureDocument,
  removeTab,
  updateDocumentDirty,
} = useWorkspace();

const { t } = useI18n();

const handleTabChange = (id: string) => {
  activateTab(id);
};

const handleCloseTab = async (id: string) => {
  if (tabs.length <= 1) return;
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

const handleDirtyFlag = () => {
  updateDocumentDirty(activeTabId.value);
};

onMounted(() => {
  eventBus.on('is-need-save', handleDirtyFlag);
});

onBeforeUnmount(() => {
  persistActiveDocument();
  eventBus.off('is-need-save', handleDirtyFlag);
});
</script>

<template>
  <div class="workspace-editor-layout">
    <WorkspaceTabs
      :tabs="tabs"
      :active-id="activeTabId"
      closable
      @update:activeId="handleTabChange"
      @close="handleCloseTab"
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