<template>
  <el-menu
     class="el-menu"
     mode="horizontal"
     menu-trigger="hover"
     @select="handleSelect"
     style="   margin: 0;
               padding: 0;"
     >
   <el-menu-item  >
     <h1>MetaDoc - 文档助手</h1>
   </el-menu-item>
   <el-menu-item index="/" >主界面</el-menu-item>
   <el-menu-item index="/outline" >文档大纲</el-menu-item>
   <el-menu-item index="/body" >文档主体</el-menu-item>
   <el-menu-item index="/examine" >校对视图</el-menu-item>
   <el-menu-item index="/analyze" >深度分析</el-menu-item>
 </el-menu>
</template>

<script>
import { defineComponent, h } from 'vue'

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
 data(){
   return {
     menuOptions:[
   {
     label: '主界面',
     key: 'home',
   }

     ]
   }
 }
};
</script>

<style scoped>
/* 自定义样式 */
</style>
