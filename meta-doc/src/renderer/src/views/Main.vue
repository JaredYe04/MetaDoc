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
        <el-main style="padding:0; margin: 0;"><router-view></router-view></el-main>
      </el-container>
    </el-container>
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
import { current_ai_dialogs, current_file_path} from '../utils/common-data.js'

const autoSaveEnabled = ref(false)
const autoSaveInterval = ref(2147483647)

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

  await autoSave()
})

eventBus.on('save-success', () => {
  ElNotification({
    title: '保存成功',
    message: '保存成功',
    type: 'success',
  })
  eventBus.emit('is-need-save',false)
})

eventBus.on('open-doc-success', () => {
  ElNotification({
    title: '打开成功',
    message: '打开成功',
    type: 'success',
  })
  eventBus.emit('is-need-save',false)
})

eventBus.on('export-success', (outputPath) => {
  eventBus.emit('system-notification', {
    title: '导出成功',
    body: `${outputPath} 导出成功`,
  })
})

eventBus.on('show-error', (message) => {
  ElNotification({
    title: '错误',
    message: message,
    type: 'error',
   
  })
})

eventBus.on('show-info', (message) => {
  ElNotification({
    title: '消息',
    message: message,
    type: 'info',
   
  })
})
eventBus.on('show-success', (message) => {
  ElNotification({
    title: '消息',
    message: message,
    type: 'success',
   
  })
})
eventBus.on('sync-ai-dialogs', (dialogs) => {
  //console.log('主界面收到了AI对话更新请求')
  current_ai_dialogs.value=dialogs//当AI对话变动时，主界面的AI对话也要变动
})

</script>
