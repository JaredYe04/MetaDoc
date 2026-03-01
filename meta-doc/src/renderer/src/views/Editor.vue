<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, computed } from 'vue'
import { useWorkspace } from '../stores/workspace'
import eventBus from '../utils/event-bus'
import WorkspaceTabPane from '../components/workspace/WorkspaceTabPane.vue'
import { useI18n } from 'vue-i18n'
import { themeState } from '../utils/themes'
import { Empty } from '@renderer/components/ui/empty'

const props = defineProps<{
  tabId?: string
}>()

const workspace = useWorkspace()
const { activateTab, removeTab, openNewDocumentTab, moveTab, saveAllDocuments, activeTabId } =
  workspace

const { t } = useI18n()

const isSavingAll = ref(false)

// 根据传入的tabId获取对应的tab，如果没有传入则使用activeTabId
const currentTab = computed(() => {
  // 直接访问 workspace.tabs（reactive 数组）保持响应式
  if (!workspace.tabs || !Array.isArray(workspace.tabs) || workspace.tabs.length === 0) {
    return null
  }
  const targetTabId = props.tabId || activeTabId.value
  if (!targetTabId) {
    return null
  }
  return workspace.tabs.find((tab) => tab.id === targetTabId) || null
})

// 注意：new-doc 事件已在 Main.vue 中统一处理，这里不需要重复监听
// const handleNewDocumentRequest = () => {
//   openNewDocumentTab();
// };

const performSaveAll = async () => {
  if (isSavingAll.value) {
    return { saved: [] as string[], failed: [] as string[] }
  }
  isSavingAll.value = true
  try {
    const result = await saveAllDocuments()
    if (result.failed.length === 0) {
      eventBus.emit('show-success', t('main.notification.saveAllSuccess'))
    } else if (result.saved.length > 0) {
      eventBus.emit(
        'show-warning',
        t('main.notification.saveAllPartial', { count: result.failed.length })
      )
    } else {
      eventBus.emit('show-warning', t('main.notification.saveAllNone'))
    }
    return result
  } finally {
    isSavingAll.value = false
  }
}

const handleSaveAllRequest = async () => {
  await performSaveAll()
}

const handleSaveAllAndQuit = async () => {
  const result = await performSaveAll()
  // 如果没有失败的保存，就退出（包括没有文档tab的情况：saved和failed都为空数组）
  if (result.failed.length === 0) {
    eventBus.emit('quit')
  }
  // 如果有失败的保存，不退出，让用户知道保存失败
}

// close-active-tab 事件已在 Main.vue 中统一处理，这里不再需要
// const handleCloseActiveTabRequest = () => {
//   handleCloseTab(activeTabId.value);
// };

watch(
  () => activeTabId.value,
  (tabId) => {
    if (tabId) {
      eventBus.emit('active-tab-changed', { tabId })
    }
  },
  { immediate: true }
)

onMounted(() => {
  // new-doc 和 close-active-tab 事件已在 Main.vue 中统一处理，避免重复监听
  // eventBus.on('new-doc', handleNewDocumentRequest);
  // eventBus.on('close-active-tab', handleCloseActiveTabRequest);
  eventBus.on('save-all', handleSaveAllRequest)
  eventBus.on('save-all-and-quit', handleSaveAllAndQuit)
})

onBeforeUnmount(() => {
  // eventBus.off('new-doc', handleNewDocumentRequest);
  // eventBus.off('close-active-tab', handleCloseActiveTabRequest);
  eventBus.off('save-all', handleSaveAllRequest)
  eventBus.off('save-all-and-quit', handleSaveAllAndQuit)
})
</script>

<template>
  <div class="workspace-editor-layout">
    <div class="workspace-editor-content">
      <KeepAlive>
        <WorkspaceTabPane
          v-if="currentTab"
          :key="currentTab.id"
          :tab="currentTab"
          :active="currentTab.id === activeTabId"
        />
      </KeepAlive>
      <Empty v-if="!currentTab" class="workspace-editor-empty" :description="t('dummyView.emptyDescription')" />
    </div>
  </div>
</template>

<style scoped>
.workspace-editor-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  /* 设置主题背景色 */
  background-color: v-bind('themeState.currentTheme.background');
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
