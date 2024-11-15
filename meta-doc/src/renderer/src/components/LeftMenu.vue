<template>

  <el-menu
    class="el-menu-vertical-demo"
    :collapse="isCollapse"
    @open="handleOpen"
    @close="handleClose"
  >
    <el-sub-menu index="1">
      <template #title>
        <el-icon><Document /></el-icon>
        <span>文件</span>
      </template>

      <el-menu-item index="1-1"  @click="newDoc">
        <el-icon><DocumentAdd /></el-icon>
        <span>新建</span>
      </el-menu-item>
      <el-menu-item index="1-2"  @click="eventBus.emit('open')">
        <el-icon><FolderOpened /></el-icon>
        <span>打开</span>
      </el-menu-item>
      <el-menu-item index="1-3"  @click="eventBus.emit('save')">
        <el-icon><FolderChecked /></el-icon>
        <span>保存</span>
      </el-menu-item>
      <el-menu-item index="1-4"  @click="eventBus.emit('save-as')">
        <el-icon><FolderAdd /></el-icon>
        <span>另存为</span>
      </el-menu-item>
      <el-menu-item index="1-5"  @click="eventBus.emit('export')">
        <el-icon><FirstAidKit /></el-icon>
        <span>导出</span>
      </el-menu-item>
    </el-sub-menu>

    <el-sub-menu index="2">
      <template #title>
        <el-icon><Setting /></el-icon>
        <span>设置</span>
      </template>

      <el-menu-item index="2-1">
        <el-icon><Setting /></el-icon>
        <span>设置面板</span>
      </el-menu-item>
    </el-sub-menu>

    <el-sub-menu index="3">
      <template #title>
        <el-icon><Clock /></el-icon>
        <span>最近文档</span>
      </template>

      <div v-for="item in 5" :key="item">
        <el-menu-item :index="`3-${item}`">
          <el-icon><Document /></el-icon>
          <span>文档{{ item }}</span>
        </el-menu-item>
      </div>



    </el-sub-menu>
    <el-sub-menu index="4">
      <template #title>
        <el-icon><SwitchButton /></el-icon>
        <span>退出</span>
      </template>

      <el-menu-item index="4-1" @click="saveAndQuit">
        <el-icon><CircleCheck /></el-icon>
        <span>保存并退出</span>
      </el-menu-item>

      <el-menu-item index="4-2" @click="quitWithoutSave">
        <el-icon><Warning /></el-icon>
        <span>退出但不保存</span>
      </el-menu-item>
    </el-sub-menu>

  </el-menu>
  <!-- <el-radio-group v-model="isCollapse">
    <el-radio-button :value="false">展开</el-radio-button>
    <el-radio-button :value="true">折叠</el-radio-button>
  </el-radio-group> -->
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import {
  Document,
  Menu as IconMenu,
  Location,
  Setting,
} from '@element-plus/icons-vue'
import eventBus from '../utils/event-bus';
import { ElMessage, ElMessageBox } from 'element-plus'

const isCollapse = ref(true)
const handleOpen = (key: string, keyPath: string[]) => {
  //console.log(key, keyPath)
}
const handleClose = (key: string, keyPath: string[]) => {
  //console.log(key, keyPath)
}
const newDoc = () => {
  ElMessageBox.confirm(
    '是否要保存当前文档？',
    '提示',
    {
      confirmButtonText: '保存',
      cancelButtonText: '放弃',
      type: 'info',
    }
  )
    .then(() => {
      eventBus.emit('save')
    })
    .catch(() => {
    }).finally(() => {
      eventBus.emit('new-doc')
    })

  
}

const saveAndQuit = () => {
  eventBus.emit('save')
  eventBus.emit('quit')
}
const quitWithoutSave = () => {
  eventBus.emit('quit')
}
</script>

<style>
.el-menu-vertical-demo:not(.el-menu--collapse) {
  width: 200px;
  min-height: 400px;
}
</style>