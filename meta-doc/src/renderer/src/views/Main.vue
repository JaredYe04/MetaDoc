<template>
  <div class="common-layout">
    <el-container class="main-shell">
      <el-aside class="side-menu">
        <LeftMenu />
      </el-aside>
      <el-container class="content-shell">
        <el-header class="content-header">
          <HeadMenu />
        </el-header>
        <el-main class="content-main">
          <UserProfileCard v-if="showUserProfileCard" @close="showUserProfileCard = false" class="user-profile-card"
            :position="menuPosition" />
          <router-view></router-view>
        </el-main>
        <el-footer class="content-footer">
          <BottomMenu />
        </el-footer>
      </el-container>
    </el-container>
    <!-- 固定底部菜单 -->
    <!-- 固定的底部状态栏 -->

    <NotificationQueue />
    <AITaskQueue />
    <LoggerConsolePanel />
  </div>
</template>

<script setup>
import LeftMenu from '../components/LeftMenu.vue'
import HeadMenu from '../components/HeadMenu.vue'
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { getRecentDocs, getSetting } from '../utils/settings.js'
import eventBus from '../utils/event-bus.js'
import { ElNotification } from 'element-plus'
import { lightTheme, darkTheme } from '../utils/themes.js'
import { current_ai_dialogs, current_article_meta_data, current_file_path } from '../utils/common-data.ts'
import { load_from_json, load_from_md, load_from_tex } from '../utils/common-data.ts'
import { useWorkspace } from '../stores/workspace'
import UserProfileCard from '../components/UserProfileCard.vue'
import { verifyToken } from '../utils/web-utils.ts'
import { useI18n } from 'vue-i18n'
import BottomMenu from '../components/BottomMenu.vue'
import AITaskQueue from '../components/AITaskQueue.vue'
import NotificationQueue from '../components/NotificationQueue.vue'
import LoggerConsolePanel from '../components/LoggerConsolePanel.vue'
const { t } = useI18n()

import { createRendererLogger } from '../utils/logger.ts'
const logger = createRendererLogger('Main', {
  windowTypeProvider: () => getWindowType()
})

const workspace = useWorkspace()
const {
  tabs: workspaceTabs,
  activeTabId,
  addDocumentTab,
  activateTab,
  persistActiveDocument,
  reloadActiveDocument,
  captureCurrentDocumentSnapshot,
} = workspace

const handleWorkspaceOpenDocument = (payload) => {
  if (!payload || typeof payload !== 'object') {
    eventBus.emit('show-error', t('main.notification.error.title'))
    return
  }

  const format = (payload.format || '').toLowerCase()
  const content = payload.content ?? ''
  const resolvedPath = typeof payload.path === 'string' ? payload.path : ''

  if (resolvedPath) {
    const existing = workspaceTabs.find((tab) => tab.path === resolvedPath)
    if (existing) {
      activateTab(existing.id)
      eventBus.emit('open-doc-success', { tabId: existing.id, path: resolvedPath })
      eventBus.emit('is-need-save', false)
      return
    }
  }

  persistActiveDocument()

  let snapshot = null
  let activated = false

  try {
    switch (format) {
      case 'json':
        load_from_json(content)
        break
      case 'md':
        load_from_md(content)
        break
      case 'tex':
        load_from_tex(content)
        break
      default:
        throw new Error(`Unsupported document format: ${format}`)
    }

    snapshot = captureCurrentDocumentSnapshot('__incoming__')
    snapshot.path = resolvedPath
    snapshot.dirty = false

    reloadActiveDocument()

    const tab = addDocumentTab(snapshot, { kind: 'file', dirty: false })
    activateTab(tab.id)
    activated = true

    eventBus.emit('open-doc-success', { tabId: tab.id, path: resolvedPath })
    eventBus.emit('is-need-save', false)
  } catch (error) {
    logger.error('Failed to open document:', error)
    const message = error instanceof Error ? error.message : String(error)
    eventBus.emit('show-error', `${t('main.notification.error.title')}: ${message}`)
  } finally {
    if (!activated) {
      reloadActiveDocument()
    }
  }
}

const showUserProfileCard = ref(false)
const autoSaveEnabled = ref(false)
const autoSaveInterval = ref(2147483647)
const menuPosition = ref({ top: 100, left: 100 });
async function autoSave() {
  do {
    const autoSave = await getSetting('autoSave')
    if (autoSave === 'never') {
      autoSaveEnabled.value = false
      autoSaveInterval.value = 2147483647
    } else {
      autoSaveEnabled.value = true
      autoSaveInterval.value = autoSave * 60 * 1000
    }
    await new Promise((resolve) => setTimeout(resolve, autoSaveInterval.value))
    if (autoSaveEnabled.value) eventBus.emit('save', 'auto-save')
  } while (true)
}

onMounted(async () => {
  eventBus.on('refresh', () => {
      let title=current_article_meta_data.value.title;
      //logger.log(title)
      eventBus.emit('update-window-title', title)
    })

  eventBus.emit('llm-api-updated')
  const token = localStorage.getItem('loginToken')
  if (token) {
    localStorage.setItem('loginToken', token)
    await verifyToken(token)//自动登录
  }
  await autoSave()


})

eventBus.on('workspace-open-document', handleWorkspaceOpenDocument)

eventBus.on('toggle-user-profile', () => {
  showUserProfileCard.value = !showUserProfileCard.value
})
eventBus.on('save-success', () => {
  workspace.updateDocumentDirty(activeTabId.value);
  eventBus.emit('is-need-save', false);
});

eventBus.on('open-doc-success', () => {
  eventBus.emit('refresh');
  eventBus.emit('is-need-save', false);
});

eventBus.on('show-error', (message) => {
  ElNotification({
    title: t('main.notification.error.title'),
    message: message,
    type: 'error',
  });
});
eventBus.on('show-warning', (message) => {
  ElNotification({
    title: t('main.notification.warning.title'),
    message: message,
    type: 'warning',
  });
});

onBeforeUnmount(() => {
  eventBus.off('workspace-open-document', handleWorkspaceOpenDocument)
})

</script>

<style scoped>
.common-layout {
  height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-shell {
  flex: 1;
  display: flex;
  height: 100%;
  overflow: hidden;
}

.side-menu {
  width: fit-content;
}

.content-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.content-header {
  flex: 0 0 auto;
}

.content-main {
  flex: 1 1 auto;
  padding: 0;
  margin: 0;
  position: relative;
  overflow: hidden;
}

.content-main > :deep(.el-scrollbar__wrap),
.content-main > :deep(.el-scrollbar__bar) {
  display: none;
}

.content-footer {
  height: 30px;
  padding: 0;
  flex: 0 0 auto;
  display: flex;
  align-items: stretch;
}

.user-profile-card {
  position: absolute;
  top: 20%;
  left: 20%;
  z-index: 1000;
  min-width: 300px;
  min-height: 300px;
  width: fit-content;
  height: fit-content;

  box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.1);
}
</style>