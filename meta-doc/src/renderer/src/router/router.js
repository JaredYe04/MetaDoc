import { createRouter, createWebHistory,createWebHashHistory } from 'vue-router'
import Home from '../views/Home.vue'
import About from '../views/About.vue'
import Outline from '../views/Outline.vue'
import MarkdownEditor from '../views/MarkdownEditor.vue'
import Setting from '../views/Setting.vue'
import component from 'element-plus/es/components/tree-select/src/tree-select-option.mjs'
import Visualize from '../views/Visualize.vue'
import AIChat from '../views/AIChat.vue'
import FomulaRecognition from '../views/FomulaRecognition.vue'
import AIGraph from '../views/AIGraph.vue'
import KnowledgeBase from '../views/KnowledgeBase.vue'
import Editor from '../views/Editor.vue'

// 所有页面组件集中管理
const pages = {
  setting: Setting,
  'ai-chat': AIChat,
  'fomula-recognition': FomulaRecognition,
  'ai-graph': AIGraph
}

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
    path:'/markdown-editor',
    name:'MarkdownEditor',
    component: MarkdownEditor,
    meta: { requiresLayout: true } 
  },
  {
    path:'/editor',
    name:'Editor',
    component: Editor,
    meta: { requiresLayout: true } 
  },
  {
    path:'/visualize',
    name:'Visualize',
    component: Visualize,
    meta: { requiresLayout: true } 
  },
  {
    path:'/knowledge-base',
    name:'KnowledgeBase',
    component: KnowledgeBase,
    meta: { requiresLayout: true }
  },
    // 动态生成特殊页面的两种访问路径
  ...Object.entries(pages).flatMap(([name, component]) => [
    {
      path: `/${name}`,
      name: `${name}-raw`,
      component,
      meta: { requiresLayout: false }
    },
    {
      path: `/single-page/${name}`,
      name: `${name}-with-layout`,
      component,
      meta: { requiresLayout: true }
    }
  ])

]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
