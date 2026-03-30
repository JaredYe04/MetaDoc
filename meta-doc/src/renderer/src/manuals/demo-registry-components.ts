/**
 * 用户手册 Demo 组件注册（懒加载用）
 * 仅在被动态 import 时执行，避免在应用启动时拉取 LeftMenu 等组件导致循环依赖
 */

import LeftMenu from '../components/LeftMenu.vue'
import MainTabs from '../components/MainTabs.vue'
import ViewMenu from '../components/ViewMenu.vue'
import ResizableDivider from '../components/base/ResizableDivider.vue'
import MenuItemsDemo from '../components/manual/MenuItemsDemo.vue'
import ViewMenuItemsDemo from '../components/manual/ViewMenuItemsDemo.vue'
import TitleMenu from '../components/TitleMenu.vue'
import SectionOptimizer from '../components/SectionOptimizer.vue'
import SearchReplaceMenu from '../components/SearchReplaceMenu.vue'
import PdfPreviewPanel from '../components/PdfPreviewPanel.vue'
import XtermConsole from '../components/XtermConsole.vue'
import MetaInfoPanel from '../components/MetaInfoPanel.vue'
import LaTeXCompilerPanel from '../components/LaTeXCompilerPanel.vue'
import LaTeXEditorDemo from '../components/LaTeXEditorDemo.vue'
import LaTeXConsole from '../components/LaTeXConsole.vue'

import AIChat from '../views/AIChat.vue'
import OcrWindow from '../views/OcrWindow.vue'
import GraphWindow from '../views/GraphWindow.vue'
import Outline from '../views/Outline.vue'
import KnowledgeBase from '../views/KnowledgeBase.vue'
import ProofreadView from '../views/ProofreadView.vue'
import AigcDetectionWindow from '../views/AigcDetectionWindow.vue'
import DataAnalysisWindow from '../views/DataAnalysisWindow.vue'
import FormulaRecognition from '../views/FomulaRecognition.vue'
import SettingLlmSection from '../views/setting/SettingLlmSection.vue'
import SettingThemeSection from '../views/setting/SettingThemeSection.vue'
import SettingKnowledgeBaseSection from '../views/setting/SettingKnowledgeBaseSection.vue'
import SettingBasicSection from '../views/setting/SettingBasicSection.vue'
import SettingImageSection from '../views/setting/SettingImageSection.vue'
import SettingDebugSection from '../views/setting/SettingDebugSection.vue'
import SettingAboutSection from '../views/setting/SettingAboutSection.vue'
import SettingLoggerSection from '../views/setting/SettingLoggerSection.vue'
import UserProfileView from '../views/UserProfileView.vue'

// Agent-related components (Batch 1 - P0 Priority)
import AgentView from '../views/AgentView.vue'
import CompletionSettingsPanel from '../components/CompletionSettingsPanel.vue'
import AgentSessionManager from '../components/AgentSessionManager.vue'

import { registerDemoComponent } from './demo-registry'

registerDemoComponent('LeftMenu', LeftMenu)
registerDemoComponent('MainTabs', MainTabs)
registerDemoComponent('ViewMenu', ViewMenu)
registerDemoComponent('ResizableDivider', ResizableDivider)
registerDemoComponent('MenuItemsDemo', MenuItemsDemo)
registerDemoComponent('ViewMenuItemsDemo', ViewMenuItemsDemo)
registerDemoComponent('TitleMenu', TitleMenu)
registerDemoComponent('SectionOptimizer', SectionOptimizer)
registerDemoComponent('SearchReplaceMenu', SearchReplaceMenu)
registerDemoComponent('PdfPreviewPanel', PdfPreviewPanel)
// 手册中 ConsoleTerminal 使用 XtermConsole 渲染（兼容 mode/consoleKey/history）
registerDemoComponent('ConsoleTerminal', XtermConsole)
registerDemoComponent('MetaInfoPanel', MetaInfoPanel)
registerDemoComponent('LaTeXCompilerPanel', LaTeXCompilerPanel)
registerDemoComponent('LaTeXEditorDemo', LaTeXEditorDemo)
registerDemoComponent('LaTeXConsole', LaTeXConsole)
registerDemoComponent('AIChat', AIChat)
registerDemoComponent('OcrWindow', OcrWindow)
registerDemoComponent('GraphWindow', GraphWindow)
registerDemoComponent('Outline', Outline)
registerDemoComponent('KnowledgeBase', KnowledgeBase)
registerDemoComponent('ProofreadView', ProofreadView)
registerDemoComponent('AigcDetectionWindow', AigcDetectionWindow)
registerDemoComponent('DataAnalysisWindow', DataAnalysisWindow)
registerDemoComponent('FormulaRecognition', FormulaRecognition)
registerDemoComponent('SettingLlmSection', SettingLlmSection)
registerDemoComponent('SettingThemeSection', SettingThemeSection)
registerDemoComponent('SettingKnowledgeBaseSection', SettingKnowledgeBaseSection)
registerDemoComponent('SettingBasicSection', SettingBasicSection)
registerDemoComponent('SettingImageSection', SettingImageSection)
registerDemoComponent('SettingDebugSection', SettingDebugSection)
registerDemoComponent('SettingAboutSection', SettingAboutSection)
registerDemoComponent('SettingLoggerSection', SettingLoggerSection)
registerDemoComponent('UserProfileView', UserProfileView)

// Agent-related components
registerDemoComponent('AgentView', AgentView)
registerDemoComponent('CompletionSettingsPanel', CompletionSettingsPanel)
registerDemoComponent('AgentSessionManager', AgentSessionManager)

// Agent Tool Display Components (Batch 3)
import ChartGenerationDisplay from '../utils/agent-tools/components/ChartGenerationDisplay.vue'
import DiffDisplay from '../utils/agent-tools/components/DiffDisplay.vue'
import DataAnalysisDisplay from '../utils/agent-tools/components/DataAnalysisDisplay.vue'
import OutlineTreeDisplay from '../utils/agent-tools/components/OutlineTreeDisplay.vue'
import RAGToolDisplay from '../utils/agent-tools/components/RAGToolDisplay.vue'
import WebCrawlerDisplay from '../utils/agent-tools/components/WebCrawlerDisplay.vue'
import GrepDisplay from '../utils/agent-tools/components/GrepDisplay.vue'
import AutoTestResultDisplay from '../utils/agent-tools/components/AutoTestResultDisplay.vue'

registerDemoComponent('ChartGenerationDisplay', ChartGenerationDisplay)
registerDemoComponent('DiffDisplay', DiffDisplay)
registerDemoComponent('DataAnalysisDisplay', DataAnalysisDisplay)
registerDemoComponent('OutlineTreeDisplay', OutlineTreeDisplay)
registerDemoComponent('RAGToolDisplay', RAGToolDisplay)
registerDemoComponent('WebCrawlerDisplay', WebCrawlerDisplay)
registerDemoComponent('GrepDisplay', GrepDisplay)
registerDemoComponent('AutoTestResultDisplay', AutoTestResultDisplay)

// Dialog Demo Components
import DialogDemoWrapper from '../components/manual/DialogDemoWrapper.vue'
registerDemoComponent('DialogDemo', DialogDemoWrapper)

import UserFeedbackView from '../views/UserFeedbackView.vue'
import LlmStatisticsView from '../views/LlmStatisticsView.vue'
import ReferenceManager from '../components/agent/ReferenceManager.vue'
import LaTeXEditor from '../views/LaTeXEditor.vue'
import OutlineAiToolbar from '../components/outline/OutlineAiToolbar.vue'
import AgentConfigManager from '../components/agent/manage/AgentConfigManager.vue'
import AgentEngineManager from '../components/agent/manage/AgentEngineManager.vue'
import AgentCapabilitiesManager from '../components/agent/manage/AgentCapabilitiesManager.vue'
import ReferenceDisplay from '../components/agent/ReferenceDisplay.vue'

registerDemoComponent('UserFeedbackView', UserFeedbackView)
registerDemoComponent('LlmStatisticsView', LlmStatisticsView)
registerDemoComponent('ReferenceManager', ReferenceManager)
registerDemoComponent('LaTeXEditor', LaTeXEditor)
registerDemoComponent('OutlineAiToolbar', OutlineAiToolbar)
registerDemoComponent('AgentConfigManager', AgentConfigManager)
registerDemoComponent('AgentEngineManager', AgentEngineManager)
registerDemoComponent('AgentCapabilitiesManager', AgentCapabilitiesManager)
registerDemoComponent('ReferenceDisplay', ReferenceDisplay)
