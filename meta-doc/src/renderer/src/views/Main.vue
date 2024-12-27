<!-- Main.vue -->
<template>
    <el-container style="overflow: hidden;">
      <el-header>
        <HeadMenu />
      </el-header>
      <el-container>
        <el-aside style="width: fit-content;">
          <LeftMenu />
        </el-aside>
        <el-main>
          <router-view></router-view>
        </el-main>
      </el-container>
    </el-container>
  </template>
  
  <script setup>
  import LeftMenu from '../components/LeftMenu.vue'
  import HeadMenu from '../components/HeadMenu.vue'
  import { onMounted, ref } from 'vue'
  import { getRecentDocs, getSetting } from '../utils/settings.js'
  import eventBus from '../utils/event-bus.js'
  import { ElNotification } from 'element-plus'
import { current_file_path } from '../utils/common-data.js'

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
  })
  
  eventBus.on('open-doc-success', () => {
    ElNotification({
      title: '打开成功',
      message: '打开成功',
      type: 'success',
    })
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
  </script>
  
  <style scoped>
  .left-menu {
    background-color: #1E1E1E;
  }
  
  .right-menu {
    background-color: #f5f5f5;
  }
  
  t-layout-main {
    padding: 20px;
    background-color: #fff;
  }
  </style>
  