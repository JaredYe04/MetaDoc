/**
 * Tab 内容配置
 * 定义系统 Tab 和工具 Tab 的路由到组件的映射关系
 */

import type { Component } from 'vue'
import GlobalHome from '../views/GlobalHome.vue'
import KnowledgeBase from '../views/KnowledgeBase.vue'
import DebugView from '../views/DebugView.vue'
import DummyView from '../views/DummyView.vue'
import Setting from '../views/Setting.vue'
import AIChat from '../views/AIChat.vue'
import FomulaRecognition from '../views/FomulaRecognition.vue'
import DataAnalysisWindow from '../views/DataAnalysisWindow.vue'
import OcrWindow from '../views/OcrWindow.vue'
import AttachmentWindow from '../views/AttachmentWindow.vue'
import GraphWindow from '../views/GraphWindow.vue'
import LlmStatisticsView from '../views/LlmStatisticsView.vue'
import AigcDetectionWindow from '../views/AigcDetectionWindow.vue'
import UserFeedbackView from '../views/UserFeedbackView.vue'
import AgentView from '../views/AgentView.vue'
import AgentReviewView from '../views/AgentReviewView.vue'
import UserManual from '../views/UserManual.vue'
function systemRouteKey(route: string): string {
  const q = route.indexOf('?')
  const h = route.indexOf('#')
  let end = route.length
  if (q >= 0) end = Math.min(end, q)
  if (h >= 0) end = Math.min(end, h)
  return end < route.length ? route.slice(0, end) : route
}

export const SYSTEM_TAB_COMPONENTS: Record<string, Component> = {
  '/global-home': GlobalHome,
  '/knowledge-base': KnowledgeBase,
  '/debug': DebugView,
  '/dummy': DummyView,
  '/agent': AgentView,
  /** 以下路由由 openSystemTab 打开为 system Tab，需显式映射，避免依赖嵌套 router-view（Main 不在 App 的 router-view 树内） */
  '/user-manual': UserManual,
  '/user-feedback': UserFeedbackView,
  '/llm-statistics': LlmStatisticsView
}

export const TOOL_TAB_COMPONENTS: Record<string, Component> = {
  '/setting': Setting,
  '/ai-chat': AIChat,
  '/fomula-recognition': FomulaRecognition,
  '/data-analysis': DataAnalysisWindow,
  '/ocr': OcrWindow,
  '/attachment': AttachmentWindow,
  '/graph': GraphWindow,
  '/ai-graph': GraphWindow,
  '/smart-drawing-assistant': GraphWindow,
  '/llm-statistics': LlmStatisticsView,
  '/aigc-detection': AigcDetectionWindow,
  '/user-feedback': UserFeedbackView,
  '/agent-review': AgentReviewView
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
  } else if (kind === 'tool') {
    return getToolTabComponent(route)
  }
  return null
}
