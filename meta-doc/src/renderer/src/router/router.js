import { createRouter, createWebHistory,createWebHashHistory } from 'vue-router'
import Home from '../views/Home.vue'
import About from '../views/About.vue'
import Outline from '../views/Outline.vue'
import Article from '../views/Article.vue'
import Setting from '../views/Setting.vue'
import component from 'element-plus/es/components/tree-select/src/tree-select-option.mjs'
import Visualize from '../views/Visualize.vue'
import AIChat from '../views/AIChat.vue'
const routes = [
  {
    path: '/',
    name: 'Home',
    alias:'/home',
    component: Home,
    meta: { requiresLayout: true } 
  },
  {
    path: '/outline',
    name: 'Outline',
    component: Outline,
    meta: { requiresLayout: true } 
  },
  {
    path: '/about',
    name: 'About',
    component: About,
    meta: { requiresLayout: true } 
  },
  {
    path:'/article',
    name:'Article',
    component: Article,
    meta: { requiresLayout: true } 
  },
  {
    path:'/setting',
    name:'Setting',
    component: Setting,
    meta: { requiresLayout: false } 
  },
  {
    path:'/ai-chat',
    name:'AIChat',
    component: AIChat,
    meta: { requiresLayout: false } 
  },
  {
    path:'/visualize',
    name:'Visualize',
    component: Visualize,
    meta: { requiresLayout: true } 
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
