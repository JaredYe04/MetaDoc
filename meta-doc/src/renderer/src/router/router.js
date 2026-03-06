import { createRouter, createWebHashHistory } from 'vue-router'
import Home from '../views/Home.vue'
import GlobalHome from '../views/GlobalHome.vue'
import About from '../views/About.vue'
import Outline from '../views/Outline.vue'
import MarkdownEditor from '../views/MarkdownEditor.vue'
import Setting from '../views/Setting.vue'
import Visualize from '../views/Visualize.vue'
import AIChat from '../views/AIChat.vue'
import FomulaRecognition from '../views/FomulaRecognition.vue'
import AgentView from '../views/AgentView.vue'
import KnowledgeBase from '../views/KnowledgeBase.vue'
import Editor from '../views/Editor.vue'
import DebugView from '../views/DebugView.vue'
import DataAnalysisWindow from '../views/DataAnalysisWindow.vue'
import OcrWindow from '../views/OcrWindow.vue'
import AttachmentWindow from '../views/AttachmentWindow.vue'
import GraphWindow from '../views/GraphWindow.vue'
import ProofreadView from '../views/ProofreadView.vue'
import DummyView from '../views/DummyView.vue'
import LlmStatisticsView from '../views/LlmStatisticsView.vue'
import UserFeedbackView from '../views/UserFeedbackView.vue'
import UserManual from '../views/UserManual.vue'

const pages = {
  setting: Setting,
  'ai-chat': AIChat,
  'fomula-recognition': FomulaRecognition,
  'ai-graph': GraphWindow,
  'data-analysis': DataAnalysisWindow,
  ocr: OcrWindow,
  attachment: AttachmentWindow,
  graph: GraphWindow
}

const routes = [
  { path: '/global-home', name: 'GlobalHome', component: GlobalHome, meta: { requiresLayout: true } },
  { path: '/', name: 'Home', alias: '/home', component: Home, meta: { requiresLayout: true } },
  { path: '/outline', name: 'Outline', component: Outline, meta: { requiresLayout: true } },
  { path: '/about', name: 'About', component: About, meta: { requiresLayout: true } },
  { path: '/markdown-editor', name: 'MarkdownEditor', component: MarkdownEditor, meta: { requiresLayout: true } },
  { path: '/editor', name: 'Editor', component: Editor, meta: { requiresLayout: true } },
  { path: '/visualize', name: 'Visualize', component: Visualize, meta: { requiresLayout: true } },
  { path: '/knowledge-base', name: 'KnowledgeBase', component: KnowledgeBase, meta: { requiresLayout: true } },
  { path: '/agent', name: 'Agent', component: AgentView, meta: { requiresLayout: true } },
  { path: '/proofread', name: 'Proofread', component: ProofreadView, meta: { requiresLayout: true } },
  { path: '/debug', name: 'Debug', component: DebugView, meta: { requiresLayout: true } },
  { path: '/dummy', name: 'Dummy', component: DummyView, meta: { requiresLayout: true } },
  { path: '/llm-statistics', name: 'LlmStatistics', component: LlmStatisticsView, meta: { requiresLayout: true } },
  { path: '/user-feedback', name: 'UserFeedback', component: UserFeedbackView, meta: { requiresLayout: true } },
  { path: '/user-manual', name: 'UserManual', component: UserManual, meta: { requiresLayout: true } },
  ...Object.entries(pages).flatMap(([name, component]) => [
    { path: `/${name}`, name: `${name}-raw`, component, meta: { requiresLayout: true } },
    { path: `/single-page/${name}`, name: `${name}-with-layout`, component, meta: { requiresLayout: true } }
  ])
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
