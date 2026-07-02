/**
 * Tab 内容配置
 * 定义系统 Tab 和工具 Tab 的路由到组件的映射关系（懒加载，避免 AI 视图打入主 chunk）
 */

import { defineAsyncComponent, type Component } from 'vue'

function lazyTab(loader: () => Promise<{ default: Component }>): Component {
  return defineAsyncComponent({
    loader,
    delay: 0,
    timeout: 120_000
  })
}

function systemRouteKey(route: string): string {
  const q = route.indexOf('?')
  const h = route.indexOf('#')
  let end = route.length
  if (q >= 0) end = Math.min(end, q)
  if (h >= 0) end = Math.min(end, h)
  return end < route.length ? route.slice(0, end) : route
}

export const SYSTEM_TAB_COMPONENTS: Record<string, Component> = {
  '/global-home': lazyTab(() => import('../views/GlobalHome.vue')),
  '/knowledge-base': lazyTab(() => import('../views/KnowledgeBase.vue')),
  '/debug': lazyTab(() => import('../views/DebugView.vue')),
  '/dummy': lazyTab(() => import('../views/DummyView.vue')),
  '/agent': lazyTab(() => import('../views/AgentView.vue')),
  '/user-manual': lazyTab(() => import('../views/UserManual.vue')),
  '/user-feedback': lazyTab(() => import('../views/UserFeedbackView.vue')),
  '/llm-statistics': lazyTab(() => import('../views/LlmStatisticsView.vue'))
}

export const TOOL_TAB_COMPONENTS: Record<string, Component> = {
  '/setting': lazyTab(() => import('../views/Setting.vue')),
  '/ai-chat': lazyTab(() => import('../views/AIChat.vue')),
  '/fomula-recognition': lazyTab(() => import('../views/FomulaRecognition.vue')),
  '/data-analysis': lazyTab(() => import('../views/DataAnalysisWindow.vue')),
  '/ocr': lazyTab(() => import('../views/OcrWindow.vue')),
  '/attachment': lazyTab(() => import('../views/AttachmentWindow.vue')),
  '/graph': lazyTab(() => import('../views/GraphWindow.vue')),
  '/ai-graph': lazyTab(() => import('../views/GraphWindow.vue')),
  '/smart-drawing-assistant': lazyTab(() => import('../views/GraphWindow.vue')),
  '/llm-statistics': lazyTab(() => import('../views/LlmStatisticsView.vue')),
  '/aigc-detection': lazyTab(() => import('../views/AigcDetectionWindow.vue')),
  '/user-feedback': lazyTab(() => import('../views/UserFeedbackView.vue')),
  '/agent-review': lazyTab(() => import('../views/AgentReviewView.vue'))
}

export function getSystemTabComponent(route: string): Component | null {
  return SYSTEM_TAB_COMPONENTS[systemRouteKey(route)] || null
}

export function getToolTabComponent(route: string): Component | null {
  return TOOL_TAB_COMPONENTS[route] || null
}

export function getTabComponent(kind: 'system' | 'tool', route: string): Component | null {
  if (kind === 'system') {
    return getSystemTabComponent(route)
  }
  if (kind === 'tool') {
    return getToolTabComponent(route)
  }
  return null
}
