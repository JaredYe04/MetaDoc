<template>
  <el-menu
     class="el-menu"
     mode="horizontal"
     menu-trigger="hover"
     @select="handleSelect"
     style="   margin: 0;
               padding: 0;"
    :default-active="activeMenuIndex"
      
     >
   <el-menu-item  >
     <h1>MetaDoc</h1>
   </el-menu-item>
   <el-menu-item index="/" >主页</el-menu-item>
   <el-menu-item index="/outline" >大纲</el-menu-item>
   <el-menu-item index="/article" >编辑器</el-menu-item>
   <el-menu-item index="/visualize" >可视化</el-menu-item>
 </el-menu>
</template>

<script>
import { defineComponent, h } from 'vue'
import eventBus from '../utils/event-bus';

export default {
 methods: {
   goHome() {
     this.$router.push('/'); // 跳转到首页
   },
   handleSelect(key, keyPath) {
      this.$router.push(keyPath[0]);
      //console.log(key, keyPath);
    },
 },
 created() {
  //console.log('HeadMenu created');
  eventBus.on('nav-to',path => {
      //console.log('nav-to',path);
      //导航栏选择相应的菜单
      this.activeMenuIndex = path;
      this.$router.push(path);
   });
 },
 data(){
   return {
     menuOptions:[
   {
     label: '主界面',
     key: 'home',
   }

     ],
     activeMenuIndex: this.$route.path,
   }
 }
};
</script>

<style scoped>
/* 自定义样式 */
</style>
