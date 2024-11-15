<template>
  <div class="common-layout">
    <el-container>
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
  </div>
</template>

<script setup>
import LeftMenu from './components/LeftMenu.vue'
import HeadMenu from './components/HeadMenu.vue'
import MainContent from './components/MainContent.vue'
import { ElNotification } from 'element-plus'
import eventBus from './utils/event-bus.js';


eventBus.on('save-success', (data) => {
  ElNotification({
    title: '保存成功',
    message: '您的文件'+data+'已保存成功',
    type: 'success',
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
