<template>
  <div class="common-layout" style="left: 0; right: 0; margin: 0; padding: 0; overflow: hidden;position: relative;">
    <el-container style="position: relative;">
      <el-aside style="width: fit-content;">
        <LeftMenu />
      </el-aside>
      <el-container>
        <el-header>
          <HeadMenu />
        </el-header>
        <el-main style="padding:0; margin: 0;position: relative;">
          <UserProfileCard v-if="showUserProfileCard" @close="showUserProfileCard = false" class="user-profile-card"
            :position="menuPosition" />
          <router-view></router-view>
          <el-footer style="height: 30px; padding: 0; position: fixed;bottom: 0;
        width: 100%;display: flex;z-index: 1000;">
            <BottomMenu />

          </el-footer>
        </el-main>

        <!-- <div style="
        height: 30px;border-top: 1px solid #dcdfe644;align-items: center;
        justify-content: space-between;padding: 0 0;font-size: 12px;
        color: #555;position: fixed;bottom: 0;left: 0;right: 0;
        width: 100%;z-index: 1000;
      ">
      <BottomMenu />
    </div> -->
      </el-container>
    </el-container>
    <!-- 固定底部菜单 -->
    <!-- 固定的底部状态栏 -->

    <AITaskQueue />
  </div>
</template>

<script setup>
import LeftMenu from '../components/LeftMenu.vue'
import HeadMenu from '../components/HeadMenu.vue'
import { onMounted, ref } from 'vue'
import { getRecentDocs, getSetting } from '../utils/settings.js'
import eventBus from '../utils/event-bus.js'
import { ElNotification } from 'element-plus'
import { lightTheme, darkTheme } from '../utils/themes.js'
import { current_ai_dialogs, current_file_path } from '../utils/common-data.js'
import UserProfileCard from '../components/UserProfileCard.vue'
import { verifyToken } from '../utils/web-utils.ts'
import { useI18n } from 'vue-i18n'
import BottomMenu from '../components/BottomMenu.vue'
import AITaskQueue from '../components/AITaskQueue.vue'
const { t } = useI18n()

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


  eventBus.emit('llm-api-updated')
  const token = localStorage.getItem('loginToken')
  if (token) {
    localStorage.setItem('loginToken', token)
    await verifyToken(token)//自动登录
  }
  await autoSave()
})

eventBus.on('toggle-user-profile', () => {
  showUserProfileCard.value = !showUserProfileCard.value
})
eventBus.on('save-success', () => {
  ElNotification({
    title: t('main.notification.save.title'),
    message: t('main.notification.save.message'),
    type: 'success',
  });
  eventBus.emit('is-need-save', false);
});

eventBus.on('open-doc-success', () => {
  ElNotification({
    title: t('main.notification.open.title'),
    message: t('main.notification.open.message'),
    type: 'success',
  });
  eventBus.emit('is-need-save', false);
});

eventBus.on('export-success', (outputPath) => {
  eventBus.emit('system-notification', {
    title: t('main.notification.export.title'),
    body: t('main.notification.export.message', { path: outputPath }),
  });

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

eventBus.on('show-info', (message) => {
  ElNotification({
    title: t('main.notification.info.title'),
    message: message,
    type: 'info',
  });
});

eventBus.on('show-success', (message) => {
  ElNotification({
    title: t('main.notification.success.title'),
    message: message,
    type: 'success',
  });
});


</script>

<style scoped>
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