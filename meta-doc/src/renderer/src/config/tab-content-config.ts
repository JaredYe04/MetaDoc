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

/**
 * 系统 Tab 路由到组件的映射
 */
export const SYSTEM_TAB_COMPONENTS: Record<string, Component> = {
  '/global-home': GlobalHome,
  '/knowledge-base': KnowledgeBase,
  '/debug': DebugView,
  '/dummy': DummyView,
}

/**
 * 工具 Tab 路由到组件的映射
 */
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
}

/**
 * 根据路由获取系统 Tab 组件
 * @param route 路由路径
 * @returns 对应的组件，如果不存在则返回 null
 */
export function getSystemTabComponent(route: string): Component | null {
  return SYSTEM_TAB_COMPONENTS[route] || null
}

/**
 * 根据路由获取工具 Tab 组件
 * @param route 路由路径
 * @returns 对应的组件，如果不存在则返回 null
 */
export function getToolTabComponent(route: string): Component | null {
  return TOOL_TAB_COMPONENTS[route] || null
}

/**
 * 根据 Tab 类型和路由获取组件
 * @param kind Tab 类型
 * @param route 路由路径
 * @returns 对应的组件，如果不存在则返回 null
 */
export function getTabComponent(kind: 'system' | 'tool', route: string): Component | null {
  if (kind === 'system') {
    return getSystemTabComponent(route)
  } else if (kind === 'tool') {
    return getToolTabComponent(route)
  }
  return null
}
