import { createRouter, createWebHashHistory } from 'vue-router'

const pages = {
  setting: () => import('../views/Setting.vue'),
  'ai-chat': () => import('../views/AIChat.vue'),
  'fomula-recognition': () => import('../views/FomulaRecognition.vue'),
  'ai-graph': () => import('../views/GraphWindow.vue'),
  'data-analysis': () => import('../views/DataAnalysisWindow.vue'),
  ocr: () => import('../views/OcrWindow.vue'),
  attachment: () => import('../views/AttachmentWindow.vue'),
  graph: () => import('../views/GraphWindow.vue')
}

const routes = [
  {
    path: '/global-home',
    name: 'GlobalHome',
    component: () => import('../views/GlobalHome.vue'),
    meta: { requiresLayout: true }
  },
  {
    path: '/',
    name: 'Home',
    alias: '/home',
    component: () => import('../views/Home.vue'),
    meta: { requiresLayout: true }
  },
  {
    path: '/outline',
    name: 'Outline',
    component: () => import('../views/Outline.vue'),
    meta: { requiresLayout: true }
  },
  {
    path: '/about',
    name: 'About',
    component: () => import('../views/About.vue'),
    meta: { requiresLayout: true }
  },
  {
    path: '/markdown-editor',
    name: 'MarkdownEditor',
    component: () => import('../views/MarkdownEditor.vue'),
    meta: { requiresLayout: true }
  },
  {
    path: '/editor',
    name: 'Editor',
    component: () => import('../views/Editor.vue'),
    meta: { requiresLayout: true }
  },
  {
    path: '/visualize',
    name: 'Visualize',
    component: () => import('../views/Visualize.vue'),
    meta: { requiresLayout: true }
  },
  {
    path: '/knowledge-base',
    name: 'KnowledgeBase',
    component: () => import('../views/KnowledgeBase.vue'),
    meta: { requiresLayout: true }
  },
  {
    path: '/agent',
    name: 'Agent',
    component: () => import('../views/AgentView.vue'),
    meta: { requiresLayout: true }
  },
  {
    path: '/proofread',
    name: 'Proofread',
    component: () => import('../views/ProofreadView.vue'),
    meta: { requiresLayout: true }
  },
  {
    path: '/debug',
    name: 'Debug',
    component: () => import('../views/DebugView.vue'),
    meta: { requiresLayout: true }
  },
  {
    path: '/dummy',
    name: 'Dummy',
    component: () => import('../views/DummyView.vue'),
    meta: { requiresLayout: true }
  },
  {
    path: '/llm-statistics',
    name: 'LlmStatistics',
    component: () => import('../views/LlmStatisticsView.vue'),
    meta: { requiresLayout: true }
  },
  {
    path: '/user-feedback',
    name: 'UserFeedback',
    component: () => import('../views/UserFeedbackView.vue'),
    meta: { requiresLayout: true }
  },
  {
    path: '/user-manual',
    name: 'UserManual',
    component: () => import('../views/UserManual.vue'),
    meta: { requiresLayout: true }
  },
  ...Object.entries(pages).flatMap(([name, loader]) => [
    { path: `/${name}`, name: `${name}-raw`, component: loader, meta: { requiresLayout: true } },
    {
      path: `/single-page/${name}`,
      name: `${name}-with-layout`,
      component: loader,
      meta: { requiresLayout: true }
    }
  ])
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
