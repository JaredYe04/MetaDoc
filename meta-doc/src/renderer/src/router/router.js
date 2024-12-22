import { createRouter, createWebHistory,createWebHashHistory } from 'vue-router'
import Home from '../views/Home.vue'
import About from '../views/About.vue'
import Outline from '../views/Outline.vue'
import Article from '../views/Article.vue'
import Setting from '../views/Setting.vue'
import component from 'element-plus/es/components/tree-select/src/tree-select-option.mjs'
import Visualize from '../views/Visualize.vue'
const routes = [
  {
    path: '/',
    name: 'Home',
    alias:'/home',
    component: Home
  },
  {
    path: '/outline',
    name: 'Outline',
    component: Outline
  },
  {
    path: '/about',
    name: 'About',
    component: About
  },
  {
    path:'/article',
    name:'Article',
    component: Article
  },
  {
    path:'/setting',
    name:'Setting',
    component: Setting
  },
  {
    path:'/visualize',
    name:'Visualize',
    component: Visualize
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
