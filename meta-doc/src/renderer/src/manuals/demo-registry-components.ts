/**
 * 用户手册 Demo 组件注册（懒加载用）
 * 仅在被动态 import 时执行，避免在应用启动时拉取 LeftMenu 等组件导致循环依赖
 */

import LeftMenu from '../components/LeftMenu.vue'
import MainTabs from '../components/MainTabs.vue'
import ViewMenu from '../components/ViewMenu.vue'
import QuickStartPanel from '../components/home/QuickStartPanel.vue'
import QuickStartMarkdown from '../components/home/QuickStartMarkdown.vue'
import QuickStartLatex from '../components/home/QuickStartLatex.vue'
import ResizableDivider from '../components/base/ResizableDivider.vue'
import MenuItemsDemo from '../components/manual/MenuItemsDemo.vue'
import ViewMenuItemsDemo from '../components/manual/ViewMenuItemsDemo.vue'
import TitleMenu from '../components/TitleMenu.vue'
import SectionOptimizer from '../components/SectionOptimizer.vue'
import SearchReplaceMenu from '../components/SearchReplaceMenu.vue'
import PdfPreviewPanel from '../components/PdfPreviewPanel.vue'
import ConsoleTerminal from '../components/ConsoleTerminal.vue'
import MetaInfoPanel from '../components/MetaInfoPanel.vue'
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
import { registerDemoComponent } from './demo-registry'

registerDemoComponent('LeftMenu', LeftMenu)
registerDemoComponent('MainTabs', MainTabs)
registerDemoComponent('ViewMenu', ViewMenu)
registerDemoComponent('QuickStartPanel', QuickStartPanel)
registerDemoComponent('QuickStartMarkdown', QuickStartMarkdown)
registerDemoComponent('QuickStartLatex', QuickStartLatex)
registerDemoComponent('ResizableDivider', ResizableDivider)
registerDemoComponent('MenuItemsDemo', MenuItemsDemo)
registerDemoComponent('ViewMenuItemsDemo', ViewMenuItemsDemo)
registerDemoComponent('TitleMenu', TitleMenu)
registerDemoComponent('SectionOptimizer', SectionOptimizer)
registerDemoComponent('SearchReplaceMenu', SearchReplaceMenu)
registerDemoComponent('PdfPreviewPanel', PdfPreviewPanel)
registerDemoComponent('ConsoleTerminal', ConsoleTerminal)
registerDemoComponent('MetaInfoPanel', MetaInfoPanel)
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
